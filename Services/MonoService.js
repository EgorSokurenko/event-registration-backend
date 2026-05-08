'use strict';

const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'https://api.monobank.ua';
const PUB_KEY_TTL_MS = 60 * 60 * 1000; // 1h
let cachedPubKey = { pem: null, fetchedAt: 0 };

function token() {
    const t = process.env.MONOBANK_TOKEN;
    if (!t) throw new Error('MONOBANK_TOKEN is not set in .env');
    return t;
}

function isConfigured() {
    return !!process.env.MONOBANK_TOKEN;
}

/**
 * Fetch (or return cached) ECDSA public key in PEM form.
 * Mono recommends caching and only re-fetching when verification fails.
 */
async function getPublicKey(force = false) {
    const now = Date.now();
    if (!force && cachedPubKey.pem && (now - cachedPubKey.fetchedAt) < PUB_KEY_TTL_MS) {
        return cachedPubKey.pem;
    }
    const res = await axios.get(`${BASE_URL}/api/merchant/pubkey`, {
        headers: { 'X-Token': token() },
        timeout: 10000
    });
    const pem = Buffer.from(res.data.key, 'base64').toString('utf8');
    cachedPubKey = { pem, fetchedAt: now };
    return pem;
}

/**
 * Create an invoice. Returns { invoiceId, pageUrl }.
 * `amount` is in MAJOR units (UAH). Mono expects minor units (kopecks).
 */
async function createInvoice({ amount, currencyCode = 980, reference, destination, redirectUrl, webHookUrl, customerEmail, validitySeconds = 24 * 60 * 60 }) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('createInvoice: amount must be a positive number');
    }
    const minorAmount = Math.round(amount * 100);

    const body = {
        amount: minorAmount,
        ccy: currencyCode,
        merchantPaymInfo: {
            reference,
            destination,
            basketOrder: [{
                name: destination,
                qty: 1,
                sum: minorAmount,
                total: minorAmount,
                unit: 'шт.',
                code: reference
            }],
            customerEmails: customerEmail ? [customerEmail] : []
        },
        redirectUrl,
        webHookUrl,
        validity: validitySeconds,
        paymentType: 'debit'
    };

    const res = await axios.post(`${BASE_URL}/api/merchant/invoice/create`, body, {
        headers: { 'X-Token': token(), 'Content-Type': 'application/json' },
        timeout: 15000
    });
    return res.data; // { invoiceId, pageUrl }
}

/**
 * Verify a webhook signature.
 * @param rawBody  Buffer of the original request body (do NOT re-stringify a parsed object)
 * @param xSignBase64  value of the X-Sign header
 * @returns true if valid
 */
async function verifyWebhook(rawBody, xSignBase64) {
    if (!xSignBase64) return false;
    let signature;
    try {
        signature = Buffer.from(xSignBase64, 'base64');
    } catch (e) {
        return false;
    }

    let pem = await getPublicKey(false);
    if (tryVerify(pem, rawBody, signature)) return true;

    // Mono recommends: if verification fails, fetch a fresh pubkey and retry once.
    pem = await getPublicKey(true);
    return tryVerify(pem, rawBody, signature);
}

function tryVerify(pem, rawBody, signature) {
    try {
        const verifier = crypto.createVerify('SHA256');
        verifier.update(rawBody);
        verifier.end();
        return verifier.verify(pem, signature);
    } catch (e) {
        return false;
    }
}

module.exports = {
    isConfigured,
    createInvoice,
    getPublicKey,
    verifyWebhook
};
