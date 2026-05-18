'use strict';

const Joi = require('joi');
const PromoController = require('../Controllers/PromoController');
const { UnFx } = require('../Other/constants');

const routes = [
    {
        method: 'POST',
        path: '/api/promo/validate',
        options: {
            description: 'Validate a promo code. Returns discount amount if valid.',
            tags: ['api', 'promo'],
            validate: {
                payload: Joi.object({
                    code: Joi.string().trim().max(50).required()
                }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            PromoController.validate(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to validate promo code', 500))
    }
];

module.exports = routes;
