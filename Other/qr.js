'use strict';

const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

function secret() {
    const s = process.env.QR_HMAC_SECRET;
    if (!s) throw new Error('QR_HMAC_SECRET is not set in .env (generate with: openssl rand -hex 32)');
    return s;
}

function sign(id) {
    return crypto.createHmac('sha256', secret()).update(String(id)).digest('base64url');
}

/**
 * Build the signed payload that goes into the QR code.
 * Format: "<id>.<hmac>". The hmac prevents random UUIDs from being checked in.
 */
function buildTicketToken(id) {
    return `${id}.${sign(id)}`;
}

/**
 * Verify a signed payload. Returns the registration id if valid, null otherwise.
 * Constant-time signature comparison via timingSafeEqual.
 */
function verifyTicketToken(token) {
    if (typeof token !== 'string') return null;
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 0 || dotIdx === token.length - 1) return null;

    const id = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!id || !sig) return null;

    let expected;
    try {
        expected = sign(id);
    } catch (e) {
        return null;
    }
    if (sig.length !== expected.length) return null;
    try {
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch (e) {
        return null;
    }
    return id;
}

module.exports = { buildTicketToken, verifyTicketToken };
