'use strict';

const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Vision = require('@hapi/vision');
const HapiSwagger = require('hapi-swagger');
const dotenv = require('dotenv');

dotenv.config();

const Pack = require('./package.json');
const routes = require('./Routes');
const { registerAuth } = require('./Other/auth');

const { API_HOST = '9090', NODE_ENV = 'LOCAL', RAILWAY_PUBLIC_DOMAIN = 'localhost' } = process.env;

const init = async () => {
    const server = Hapi.server({
        port: API_HOST,
        host: NODE_ENV === 'LOCAL' ? RAILWAY_PUBLIC_DOMAIN : '0.0.0.0',
        routes: {
            cors: {
                origin: ['*'],
                headers: ['Accept', 'Content-Type', 'Authorization'],
                credentials: true
            }
        }
    });

    await registerAuth(server);
    await server.register([
        Inert,
        Vision,
        {
            plugin: HapiSwagger,
            options: {
                info: { title: 'Event Registration API', version: Pack.version }
            }
        }
    ]);

    server.ext('onRequest', (request, h) => {
        console.log(`Incoming Request: ${request.method.toUpperCase()} ${request.path}`);
        return h.continue;
    });

    server.ext('onPreResponse', (request, h) => {
        const response = request.response;
        if (response.isBoom) {
            console.error(`${response.output.statusCode} ${response.output.payload.message}`);
        } else {
            console.log(`Response: ${request.method.toUpperCase()} ${request.path} ${response.statusCode}`);
        }
        return h.continue;
    });

    server.route({
        method: 'GET',
        path: '/',
        handler: (_request, h) => h.response({
            success: true,
            message: 'Event Registration API is running',
            data: {
                event: 'Deep Calls to Deep',
                date: '2026-05-29 — 2026-05-30',
                venue: 'Manuilivskiy Avenue 1, Dnipro',
                docs: '/documentation'
            }
        }).code(200)
    });

    server.route(routes);

    await server.start();
    console.log(`Server running on ${server.info.uri}`);

    // Pre-warm Sheets caches in the background so the first registration
    // and dashboard load don't hit Apps Script's cold start.
    const { SheetsService } = require('./Services');
    setImmediate(() => {
        try {
            SheetsService.warm('Settings');
            SheetsService.warm('Registrations');
        } catch (e) {
            // Non-fatal — warm() catches its own errors.
        }
    });

};

process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
});

init();
