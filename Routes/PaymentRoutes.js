'use strict';

const PaymentController = require('../Controllers/PaymentController');
const { UnFx } = require('../Other/constants');

const routes = [
    {
        method: 'POST',
        path: '/api/payment/webhook',
        options: {
            description: 'Monobank webhook. Body is signature-verified (X-Sign, ECDSA SHA256). Idempotent.',
            tags: ['api', 'payment'],
            // Raw bytes are required for signature verification — do not let Hapi parse the JSON.
            payload: {
                parse: false,
                output: 'data',
                maxBytes: 65536
            }
        },
        handler: (req, h) =>
            PaymentController.webhook(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => {
                    console.error('[mono webhook] error:', err.message);
                    return UnFx.sendError({ statusCode: err.statusCode || 500 }, h, err.message || 'webhook error');
                })
    }
];

module.exports = routes;
