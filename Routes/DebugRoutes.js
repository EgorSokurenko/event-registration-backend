'use strict';

const Joi = require('joi');
const DebugController = require('../Controllers/DebugController');
const PaymentController = require('../Controllers/PaymentController');
const { UnFx } = require('../Other/constants');

// These routes only mount when NODE_ENV === 'LOCAL'. They are for verifying
// the Sheets data layer end-to-end. Remove or guard differently before deploy.

const routes = [
    {
        method: 'GET',
        path: '/debug/sheets/identity',
        options: {
            description: 'Show which sheet ID + service-account email the backend is currently using. Useful for diagnosing 404s from Sheets API.',
            tags: ['api', 'debug']
        },
        handler: (_req, h) => {
            const sheetId = process.env.GOOGLE_SHEET_ID || null;
            let email = null;
            let jsonOk = false;
            try {
                const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
                if (inline && inline.trim().length > 0) {
                    const parsed = JSON.parse(inline);
                    email = parsed.client_email || null;
                    jsonOk = true;
                }
            } catch (_e) {
                jsonOk = false;
            }
            return UnFx.sendSuccess({
                sheetId,
                sheetIdLength: sheetId ? sheetId.length : 0,
                serviceAccountEmail: email,
                serviceAccountJsonValid: jsonOk,
                hint: 'Sheet ID should be 44 chars. Service account email must be Editor on the sheet.'
            }, h);
        }
    },
    {
        method: 'GET',
        path: '/debug/sheets/status',
        options: {
            description: 'Sheets reachability + tab/row counts',
            tags: ['api', 'debug']
        },
        handler: async (_req, h) =>
            DebugController.sheetStatus()
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    },
    {
        method: 'POST',
        path: '/debug/sheets/init',
        options: {
            description: 'Create missing tabs (Registrations / Admins / Settings) and seed headers + Settings defaults. Idempotent.',
            tags: ['api', 'debug']
        },
        handler: async (_req, h) =>
            DebugController.initSheet()
                .then(res => UnFx.sendSuccess(res, h, 'Sheet initialized'))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    },
    {
        method: 'GET',
        path: '/debug/registrations',
        options: {
            description: 'List all registrations (raw rows from sheet)',
            tags: ['api', 'debug']
        },
        handler: async (_req, h) =>
            DebugController.listRegistrations()
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    },
    {
        method: 'POST',
        path: '/debug/registrations',
        options: {
            description: 'Append a test registration row (any fields optional; defaults are filled in)',
            tags: ['api', 'debug'],
            validate: {
                payload: Joi.object({
                    firstName: Joi.string().optional(),
                    lastName: Joi.string().optional(),
                    phone: Joi.string().optional(),
                    email: Joi.string().email().optional(),
                    age: Joi.number().optional(),
                    city: Joi.string().optional(),
                    church: Joi.string().optional()
                }).optional(),
                failAction: UnFx.failAction
            }
        },
        handler: async (req, h) =>
            DebugController.createTestRegistration(req)
                .then(res => UnFx.sendSuccess(res, h, 'Test row created'))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    },
    {
        method: 'POST',
        path: '/debug/registrations/{id}/mark-paid',
        options: {
            description: 'Manually flip a row to paymentStatus=paid (verifies update path)',
            tags: ['api', 'debug'],
            validate: {
                params: Joi.object({ id: Joi.string().required() }),
                failAction: UnFx.failAction
            }
        },
        handler: async (req, h) =>
            DebugController.markPaid(req)
                .then(res => UnFx.sendSuccess(res, h, 'Marked paid'))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    },
    {
        method: 'POST',
        path: '/debug/payment/simulate-paid/{id}',
        options: {
            description: 'Mark a registration as paid without going through Mono. Bypasses signature verification. LOCAL only.',
            tags: ['api', 'debug'],
            validate: {
                params: Joi.object({ id: Joi.string().required() }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            PaymentController.simulateSuccess(req)
                .then(res => UnFx.sendSuccess(res, h, 'Simulated paid'))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Simulate failed', 500))
    },
    {
        method: 'POST',
        path: '/debug/admin/create',
        options: {
            description: 'Create an admin (LOCAL only). Bcrypts password and appends a row to the Admins tab.',
            tags: ['api', 'debug'],
            validate: {
                payload: Joi.object({
                    email: Joi.string().email().trim().lowercase().required(),
                    password: Joi.string().min(8).required(),
                    name: Joi.string().optional()
                }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            DebugController.createAdmin(req)
                .then(res => UnFx.sendSuccess(res, h, 'Admin created', 201))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to create admin', 500))
    },
    {
        method: 'GET',
        path: '/debug/settings',
        options: {
            description: 'Read the Settings tab as a key/value map',
            tags: ['api', 'debug']
        },
        handler: async (_req, h) =>
            DebugController.settings()
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({}, h, err.message || 'Sheets error', 500))
    }
];

module.exports = routes;
