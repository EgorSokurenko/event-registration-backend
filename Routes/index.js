'use strict';

const RegistrationRoutes = require('./RegistrationRoutes');
const AdminRoutes = require('./AdminRoutes');
const PaymentRoutes = require('./PaymentRoutes');
const SettingsRoutes = require('./SettingsRoutes');

const routes = [
    ...RegistrationRoutes,
    ...AdminRoutes,
    ...PaymentRoutes,
    ...SettingsRoutes
];

if (process.env.NODE_ENV === 'LOCAL') {
    const DebugRoutes = require('./DebugRoutes');
    routes.push(...DebugRoutes);
}

module.exports = routes;
