'use strict';

const { SheetsService } = require('../Services');
const { UnFx } = require('../Other/constants');

// Public-facing settings (event name, date, venue, price, currency).
// Read-only — admins edit via the Google Sheet's Settings tab directly.
const routes = [
    {
        method: 'GET',
        path: '/api/settings',
        options: {
            description: 'Public site settings (eventName, eventDate, venue, ticketPrice, currency).',
            tags: ['api', 'settings']
        },
        handler: (_req, h) =>
            SheetsService.getSettings()
                .then(settings => {
                    // Strip promo internals — validated only via /api/promo/validate.
                    const { promoCode, promoDiscount, ...publicSettings } = settings;
                    // registrationLimit залишається у publicSettings — фронтенд може показати "місць залишилось".
                    return UnFx.sendSuccess(publicSettings, h);
                })
                .catch(err => UnFx.sendError({}, h, err.message || 'Failed to load settings', 500))
    }
];

module.exports = routes;
