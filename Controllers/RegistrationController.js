'use strict';

const { randomUUID } = require('crypto');
const { SheetsService, MonoService } = require('../Services');
const PaymentController = require('./PaymentController');
const { buildTicketToken } = require('../Other/qr');
const { localTimestamp } = require('../Other/datetime');

const PUBLIC_FIELDS = [
    'id', 'firstName', 'lastName', 'email', 'phone', 'age', 'city', 'church',
    'paymentStatus', 'paidAt', 'arrived', 'arrivedAt', 'createdAt'
];

function pickPublic(reg) {
    if (!reg) return null;
    const out = {};
    for (const f of PUBLIC_FIELDS) {
        if (reg[f] !== undefined) out[f] = reg[f];
    }
    return out;
}

const RegistrationController = {
    create: async (req) => {
        const { firstName, lastName, phone, email, age, city, church, promoCode } = req.payload;

        const reg = {
            id: randomUUID(),
            createdAt: localTimestamp(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim().toLowerCase(),
            age,
            city: city.trim(),
            church: church.trim(),
            paymentStatus: 'pending',
            monoInvoiceId: '',
            paidAt: '',
            arrived: 'FALSE',
            arrivedAt: '',
            arrivedBy: '',
            promoCode: ''
        };

        // Dev mode (no Mono token) — write the row, return without paymentUrl.
        if (!MonoService.isConfigured()) {
            console.warn('[registration] MONOBANK_TOKEN not set — skipping invoice creation');
            if (promoCode) reg.promoCode = promoCode.trim().toUpperCase();
            await SheetsService.createRegistration(reg);
            return { id: reg.id, paymentUrl: null, devMode: true };
        }

        // Mono FIRST so we can write the row with monoInvoiceId already populated —
        // one sheet write instead of two. If Mono fails, no orphan row is left.
        const settings = await SheetsService.getSettings();

        const limit = Number(settings.registrationLimit || 0);
        if (limit > 0) {
            const all = await SheetsService.listRegistrations();
            const active = all.filter(r => r.paymentStatus === 'paid').length;
            if (active >= limit) {
                const err = new Error('Реєстрацію закрито — усі місця зайняті');
                err.statusCode = 409;
                throw err;
            }
        }
        const ticketPrice = Number(settings.ticketPrice || 400);
        const eventName = settings.eventName || 'Deep Calls to Deep';

        // Validate promo code and compute final price.
        let finalPrice = ticketPrice;
        if (promoCode) {
            const promo = await SheetsService.findPromoByCode(promoCode.trim());
            const discount = Number(promo?.discount || 0);
            if (promo && discount > 0) {
                const limit = Number(promo.limit || 0);
                const used = limit > 0 ? await SheetsService.countPromoUsage(promo.code) : 0;
                if (limit === 0 || used < limit) {
                    finalPrice = Math.max(0, ticketPrice - discount);
                    reg.promoCode = String(promo.code).toUpperCase();
                    console.log(`[promo] ${reg.promoCode} applied: ${ticketPrice} → ${finalPrice} (${used}/${limit || '∞'})`);
                }
            }
        }

        // Free ticket (promo covers full price) — skip Mono, mark paid immediately.
        if (finalPrice === 0) {
            reg.paymentStatus = 'paid';
            reg.paidAt = localTimestamp();
            await SheetsService.createRegistration(reg);
            await PaymentController._sendTicketFor(reg);
            return { id: reg.id, paymentUrl: null };
        }

        const backendUrl = process.env.BACKEND_URL || 'http://localhost:9090';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';

        let invoice;
        try {
            invoice = await MonoService.createInvoice({
                amount: finalPrice,
                reference: reg.id,
                destination: `Реєстрація: ${eventName}`,
                redirectUrl: `${frontendUrl}/ticket/${reg.id}`,
                webHookUrl: `${backendUrl}/api/payment/webhook`,
                customerEmail: reg.email
            });
        } catch (e) {
            console.error('[mono] invoice creation failed:', e.response?.data || e.message);
            const err = new Error('Не вдалося створити рахунок для оплати. Спробуйте пізніше.');
            err.statusCode = 502;
            throw err;
        }

        reg.monoInvoiceId = invoice.invoiceId;
        await SheetsService.createRegistration(reg);

        return { id: reg.id, paymentUrl: invoice.pageUrl };
    },

    getById: async (req) => {
        const { id } = req.params;
        const reg = await SheetsService.findRegistrationById(id);
        if (!reg) {
            const err = new Error('Registration not found');
            err.statusCode = 404;
            throw err;
        }
        const publicReg = pickPublic(reg);
        // Only emit the QR token for paid tickets — pending/failed don't need it
        // and there's no reason to leak the signed payload before it's usable.
        if (reg.paymentStatus === 'paid') {
            publicReg.qrPayload = buildTicketToken(reg.id);
        }
        return publicReg;
    },

    resendTicket: async (req) => {
        const { id } = req.params;
        const reg = await SheetsService.findRegistrationById(id);
        if (!reg) {
            const err = new Error('Registration not found');
            err.statusCode = 404;
            throw err;
        }
        if (reg.paymentStatus !== 'paid') {
            const err = new Error('Cannot resend ticket — payment is not complete');
            err.statusCode = 409;
            throw err;
        }
        const result = await PaymentController._sendTicketFor(reg);
        return { ok: true, ...result };
    }
};

module.exports = RegistrationController;
