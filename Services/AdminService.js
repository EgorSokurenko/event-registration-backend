'use strict';

const bcrypt = require('bcrypt');
const SheetsService = require('./SheetsService');
const { localTimestamp } = require('../Other/datetime');

const BCRYPT_ROUNDS = 10;

async function findByEmail(email) {
    return SheetsService.findAdminByEmail(email);
}

async function verifyPassword(plaintext, hash) {
    if (!plaintext || !hash) return false;
    try {
        return await bcrypt.compare(plaintext, hash);
    } catch (e) {
        return false;
    }
}

async function createAdmin({ email, password, name }) {
    const lc = String(email).toLowerCase().trim();
    const existing = await SheetsService.findAdminByEmail(lc);
    if (existing) {
        const err = new Error('Admin with this email already exists');
        err.statusCode = 409;
        throw err;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const row = {
        email: lc,
        passwordHash,
        name: name || '',
        createdAt: localTimestamp()
    };
    await SheetsService.createAdmin(row);
    return { email: row.email, name: row.name, createdAt: row.createdAt };
}

module.exports = {
    findByEmail,
    verifyPassword,
    createAdmin
};
