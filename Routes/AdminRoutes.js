'use strict';

const Joi = require('joi');
const AdminController = require('../Controllers/AdminController');
const { UnFx } = require('../Other/constants');

const routes = [
    {
        method: 'POST',
        path: '/api/admin/login',
        options: {
            description: 'Admin login. Returns a JWT.',
            tags: ['api', 'admin'],
            validate: {
                payload: Joi.object({
                    email: Joi.string().email().trim().lowercase().required(),
                    password: Joi.string().min(1).required()
                }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            AdminController.login(req)
                .then(res => UnFx.sendSuccess(res, h, 'Logged in'))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Login failed', 500))
    },
    {
        method: 'GET',
        path: '/api/admin/me',
        options: {
            description: 'Verify the current JWT and return the admin profile.',
            tags: ['api', 'admin'],
            auth: 'jwt'
        },
        handler: (req, h) =>
            AdminController.me(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Auth failed', 500))
    },
    {
        method: 'GET',
        path: '/api/admin/registrations',
        options: {
            description: 'List all registrations (full fields).',
            tags: ['api', 'admin'],
            auth: 'jwt'
        },
        handler: (req, h) =>
            AdminController.listRegistrations(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Failed to load list', 500))
    },
    {
        method: 'POST',
        path: '/api/admin/scan',
        options: {
            description: 'Verify a signed QR payload and mark the ticket as arrived. Idempotent.',
            tags: ['api', 'admin'],
            auth: 'jwt',
            validate: {
                payload: Joi.object({
                    payload: Joi.string().min(1).max(500).required()
                }),
                failAction: UnFx.failAction
            }
        },
        handler: (req, h) =>
            AdminController.scan(req)
                .then(res => UnFx.sendSuccess(res, h))
                .catch(err => UnFx.sendError({ statusCode: err.statusCode }, h, err.message || 'Сканування не вдалося', 500))
    }
];

module.exports = routes;
