'use strict';

const Joi = require('joi');
const RegistrationController = require('../Controllers/RegistrationController');
const { UnFx } = require('../Other/constants');

const registrationPayload = Joi.object({
    firstName: Joi.string().trim().min(1).max(50).required(),
    lastName: Joi.string().trim().min(1).max(50).required(),
    phone: Joi.string().trim().min(7).max(20).required(),
    email: Joi.string().email().trim().lowercase().required(),
    age: Joi.number().integer().min(15).max(35).required(),
    city: Joi.string().trim().min(1).max(80).required(),
    church: Joi.string().trim().min(1).max(120).required()
});

const routes = [
    {
        method: 'POST',
        path: '/api/registrations',
        options: {
            description: 'Create a registration. Writes a pending row to the Registrations sheet.',
            tags: ['api', 'registrations'],
            validate: {
                payload: registrationPayload,
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            RegistrationController.create(req)
                .then(res => UnFx.sendSuccess(res, h, 'Registration created', 201))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to create registration', 500))
    },
    {
        method: 'GET',
        path: '/api/registrations/{id}',
        options: {
            description: 'Get a registration by id. Public endpoint used by the ticket page.',
            tags: ['api', 'registrations'],
            validate: {
                params: Joi.object({ id: Joi.string().required() }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            RegistrationController.getById(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to load registration', 500))
    },
    {
        method: 'POST',
        path: '/api/registrations/{id}/resend-ticket',
        options: {
            description: 'Re-send the ticket email for a paid registration.',
            tags: ['api', 'registrations'],
            validate: {
                params: Joi.object({ id: Joi.string().required() }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            RegistrationController.resendTicket(req)
                .then(res => UnFx.sendSuccess(res, h, 'Ticket re-sent'))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to resend', 500))
    }
];

module.exports = routes;
