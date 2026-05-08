'use strict';

const { SheetsService, MonoService, EmailService } = require('../Services');
const { localTimestamp, asTextTimestamp } = require('../Other/datetime');

// Map Mono invoice status → our paymentStatus.
// Mono states: created, processing, hold, success, failure, reversed, expired
function mapStatus(monoStatus) {
    switch (monoStatus) {
        case 'success':
        case 'hold':
            return 'paid';
        case 'failure':
        case 'expired':
        case 'reversed':
            return 'failed';
        case 'created':
        case 'processing':
        default:
            return 'pending';
    }
}

// Hardcoded English ticket copy. Ticket-specific (the rest of the site is Ukrainian).
const TICKET_EVENT_DATE_EN = 'May 29–30, 2026';
const VENUE_MAP_URL = 'https://maps.app.goo.gl/TgVseJU1S9AUqCWk8';

async function sendTicketFor(reg) {
    if (!EmailService.isConfigured()) {
        console.warn('[email] SMTP not configured — skipping ticket email for', reg.id);
        return { skipped: true };
    }
    const settings = await SheetsService.getSettings();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    try {
        const info = await EmailService.sendTicketEmail({
            to: reg.email,
            firstName: reg.firstName,
            eventName: settings.eventName || 'Deep Calls to Deep',
            eventDate: TICKET_EVENT_DATE_EN,
            venue: settings.venue || 'Manuilivskiy Avenue 1, Dnipro',
            venueMapUrl: VENUE_MAP_URL,
            ticketUrl: `${frontendUrl}/ticket/${reg.id}`
        });
        console.log(`[email] ticket sent to ${reg.email} (${info.messageId})`);
        return info;
    } catch (e) {
        // Don't fail the webhook over email problems — the row is still paid.
        // Manual resend is available at POST /api/registrations/:id/resend-ticket.
        console.error(`[email] failed to send to ${reg.email}:`, e.message);
        return { error: e.message };
    }
}

/**
 * Idempotently mark a registration as paid and send the ticket email.
 * Safe to call multiple times — only the first call writes + emails.
 */
async function markPaidAndNotify(reg, modifiedDate, monoInvoiceId) {
    if (reg.paymentStatus === 'paid') {
        // Already paid — keep invoiceId in sync if it changed, no email re-send.
        if (monoInvoiceId && reg.monoInvoiceId !== monoInvoiceId) {
            await SheetsService.updateRegistration(reg.id, { monoInvoiceId });
        }
        return { unchanged: true };
    }
    const patch = {
        paymentStatus: 'paid',
        paidAt: modifiedDate ? asTextTimestamp(modifiedDate) : localTimestamp()
    };
    if (monoInvoiceId) patch.monoInvoiceId = monoInvoiceId;

    const updated = await SheetsService.updateRegistration(reg.id, patch);
    await sendTicketFor({ ...reg, ...updated });
    return { changed: true };
}

const PaymentController = {
    /**
     * Mono webhook. Route MUST be configured with payload.parse=false so we
     * can verify the signature against the exact raw bytes Mono signed.
     */
    webhook: async (req) => {
        const rawBody = req.payload; // Buffer
        const xSign = req.headers['x-sign'];

        if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
            const err = new Error('Empty webhook body');
            err.statusCode = 400;
            throw err;
        }

        const valid = await MonoService.verifyWebhook(rawBody, xSign);
        if (!valid) {
            console.warn('[mono webhook] invalid signature; ignoring');
            const err = new Error('Invalid webhook signature');
            err.statusCode = 401;
            throw err;
        }

        let body;
        try {
            body = JSON.parse(rawBody.toString('utf8'));
        } catch (e) {
            const err = new Error('Invalid JSON in webhook body');
            err.statusCode = 400;
            throw err;
        }

        const { invoiceId, status, reference, modifiedDate } = body;

        if (!reference) {
            console.warn('[mono webhook] no reference in body; ignoring', { invoiceId, status });
            return { ok: true, ignored: 'no reference' };
        }

        const reg = await SheetsService.findRegistrationById(reference);
        if (!reg) {
            console.warn('[mono webhook] registration not found for reference', reference);
            return { ok: true, ignored: 'registration not found' };
        }

        const newStatus = mapStatus(status);

        if (newStatus === 'paid') {
            const result = await markPaidAndNotify(reg, modifiedDate, invoiceId);
            console.log(`[mono webhook] ${reference} → paid (${status})`, result);
            return { ok: true, status: 'paid', ...result };
        }

        // For non-paid transitions, just sync the row.
        if (newStatus !== reg.paymentStatus || reg.monoInvoiceId !== invoiceId) {
            await SheetsService.updateRegistration(reference, {
                paymentStatus: newStatus,
                monoInvoiceId: invoiceId
            });
            console.log(`[mono webhook] ${reference} → ${newStatus} (${status})`);
        }
        return { ok: true, status: newStatus };
    },

    // LOCAL-only debug helper: simulates a successful webhook for a row.
    simulateSuccess: async (req) => {
        const { id } = req.params;
        const reg = await SheetsService.findRegistrationById(id);
        if (!reg) {
            const err = new Error('Registration not found');
            err.statusCode = 404;
            throw err;
        }
        const result = await markPaidAndNotify(reg, localTimestamp(), reg.monoInvoiceId);
        return { ok: true, id, status: 'paid', ...result };
    }
};

// Exported helpers for reuse from RegistrationController (resend-ticket).
PaymentController._sendTicketFor = sendTicketFor;

module.exports = PaymentController;
