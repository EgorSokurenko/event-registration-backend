'use strict';

const { randomUUID } = require('crypto');
const { SheetsService, AdminService } = require('../Services');
const { localTimestamp } = require('../Other/datetime');

const DebugController = {
    sheetStatus: async () => SheetsService.getStatus(),

    initSheet: async () => {
        const result = await SheetsService.ensureSchema();
        const status = await SheetsService.getStatus();
        return { ...result, status };
    },

    listRegistrations: async () => SheetsService.listRegistrations(),

    createTestRegistration: async (req) => {
        const body = req.payload || {};
        const reg = {
            id: randomUUID(),
            createdAt: localTimestamp(),
            firstName: body.firstName || 'Test',
            lastName: body.lastName || 'User',
            phone: body.phone || '+380000000000',
            email: body.email || 'test@example.com',
            age: body.age || 25,
            city: body.city || 'Dnipro',
            church: body.church || 'Test Church',
            paymentStatus: 'pending',
            monoInvoiceId: '',
            paidAt: '',
            arrived: 'FALSE',
            arrivedAt: '',
            arrivedBy: ''
        };
        return SheetsService.createRegistration(reg);
    },

    markPaid: async (req) => {
        const { id } = req.params;
        return SheetsService.updateRegistration(id, {
            paymentStatus: 'paid',
            paidAt: localTimestamp()
        });
    },

    settings: async () => SheetsService.getSettings(),

    createAdmin: async (req) => {
        const { email, password, name } = req.payload;
        return AdminService.createAdmin({ email, password, name });
    }
};

module.exports = DebugController;
