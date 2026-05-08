'use strict';

const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SCHEMA = {
    Registrations: {
        title: 'Registrations',
        headers: [
            'id', 'createdAt',
            'firstName', 'lastName', 'phone', 'email', 'age', 'city', 'church',
            'paymentStatus', 'monoInvoiceId', 'paidAt',
            'arrived', 'arrivedAt', 'arrivedBy'
        ]
    },
    Admins: {
        title: 'Admins',
        headers: ['email', 'passwordHash', 'name', 'createdAt']
    },
    Settings: {
        title: 'Settings',
        headers: ['key', 'value', 'description'],
        defaults: [
            ['eventName', 'Deep Calls to Deep', 'Shown on ticket / emails'],
            ['eventDate', '29–30 травня 2026', 'Display string'],
            ['venue', 'Manuilivskiy Avenue 1, Dnipro', 'Venue + address'],
            ['ticketPrice', '400', 'Number, in major currency units'],
            ['currency', 'UAH', 'ISO 4217 code']
        ]
    }
};

const CACHE_TTL_MS = 60_000;
const cache = {
    Registrations: { value: null, fetchedAt: 0, refreshing: null },
    Admins: { value: null, fetchedAt: 0, refreshing: null },
    Settings: { value: null, fetchedAt: 0, refreshing: null }
};

let _sheets = null;

function loadCredentials() {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline && inline.trim().length > 0) {
        try {
            return JSON.parse(inline);
        } catch (e) {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON');
        }
    }
    return null;
}

async function getClient() {
    if (_sheets) return _sheets;

    if (!process.env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set in .env');

    const credentials = loadCredentials();
    const authConfig = { scopes: SCOPES };
    if (credentials) authConfig.credentials = credentials;
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) authConfig.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else throw new Error('Set either GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env');

    const auth = new google.auth.GoogleAuth(authConfig);
    const client = await auth.getClient();
    _sheets = google.sheets({ version: 'v4', auth: client });
    return _sheets;
}

function spreadsheetId() {
    return process.env.GOOGLE_SHEET_ID;
}

// Sheets interprets cell values starting with =, +, -, @ as formulas.
// Force such strings to be stored as literal text by prefixing a single quote.
function safeCellValue(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
    return v;
}

function rowsToObjects(headers, rows) {
    return (rows || []).map((row, idx) => {
        const obj = { _rowIndex: idx + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
        return obj;
    });
}

function objectToRow(headers, obj) {
    return headers.map(h => safeCellValue(obj[h]));
}

function columnLetter(n) {
    let s = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function invalidate(tabKey) {
    if (cache[tabKey]) cache[tabKey] = { value: null, fetchedAt: 0, refreshing: null };
}

async function listTabs() {
    const sheets = await getClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId() });
    return (meta.data.sheets || []).map(s => s.properties.title);
}

async function ensureSchema() {
    const sheets = await getClient();
    const existing = await listTabs();
    const requests = [];
    for (const key of Object.keys(SCHEMA)) {
        const def = SCHEMA[key];
        if (!existing.includes(def.title)) {
            requests.push({ addSheet: { properties: { title: def.title } } });
        }
    }
    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId(),
            requestBody: { requests }
        });
    }
    const created = requests.map(r => r.addSheet.properties.title);
    const seeded = [];

    for (const key of Object.keys(SCHEMA)) {
        const def = SCHEMA[key];
        const lastCol = columnLetter(def.headers.length);
        const headerRange = `${def.title}!A1:${lastCol}1`;
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId(),
            range: headerRange
        });
        const hasHeaders = res.data.values && res.data.values[0] && res.data.values[0].length > 0;
        if (!hasHeaders) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId(),
                range: headerRange,
                valueInputOption: 'RAW',
                requestBody: { values: [def.headers] }
            });
            seeded.push(def.title);
            if (def.defaults && def.defaults.length > 0) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: spreadsheetId(),
                    range: `${def.title}!A:${lastCol}`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: def.defaults }
                });
            }
        }
    }

    Object.keys(cache).forEach(invalidate);
    return { createdTabs: created, seededHeaders: seeded };
}

async function fetchTab(tabKey) {
    const def = SCHEMA[tabKey];
    const sheets = await getClient();
    const lastCol = columnLetter(def.headers.length);
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId(),
        range: `${def.title}!A2:${lastCol}`
    });
    const rows = rowsToObjects(def.headers, res.data.values);
    cache[tabKey].value = rows;
    cache[tabKey].fetchedAt = Date.now();
    return rows;
}

async function readTab(tabKey) {
    if (!SCHEMA[tabKey]) throw new Error(`Unknown tab: ${tabKey}`);
    const entry = cache[tabKey];
    const now = Date.now();
    const isFresh = entry.value && (now - entry.fetchedAt) < CACHE_TTL_MS;
    if (isFresh) return entry.value;

    if (entry.value) {
        if (!entry.refreshing) {
            entry.refreshing = fetchTab(tabKey)
                .catch(err => console.warn(`[sheets] background refresh of ${tabKey} failed:`, err.message))
                .finally(() => { entry.refreshing = null; });
        }
        return entry.value;
    }
    return await fetchTab(tabKey);
}

function warm(tabKey) {
    const entry = cache[tabKey];
    if (!entry || entry.refreshing) return;
    const now = Date.now();
    if (entry.value && (now - entry.fetchedAt) < CACHE_TTL_MS) return;
    entry.refreshing = fetchTab(tabKey)
        .catch(err => console.warn(`[sheets] warm(${tabKey}) failed:`, err.message))
        .finally(() => { entry.refreshing = null; });
}

async function appendRow(tabKey, obj) {
    const def = SCHEMA[tabKey];
    if (!def) throw new Error(`Unknown tab: ${tabKey}`);
    const sheets = await getClient();
    const row = objectToRow(def.headers, obj);
    const lastCol = columnLetter(def.headers.length);
    await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId(),
        range: `${def.title}!A:${lastCol}`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
    });
    invalidate(tabKey);
}

async function updateRowAt(tabKey, rowIndex, obj) {
    const def = SCHEMA[tabKey];
    const sheets = await getClient();
    const row = objectToRow(def.headers, obj);
    const lastCol = columnLetter(def.headers.length);
    await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId(),
        range: `${def.title}!A${rowIndex}:${lastCol}${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
    });
    invalidate(tabKey);
}

// --- Domain ---

async function getStatus() {
    const tabs = await listTabs();
    const counts = {};
    for (const key of Object.keys(SCHEMA)) {
        if (tabs.includes(SCHEMA[key].title)) {
            const rows = await readTab(key);
            counts[SCHEMA[key].title] = rows.length;
        } else {
            counts[SCHEMA[key].title] = null;
        }
    }
    return {
        sheetId: spreadsheetId(),
        tabs,
        rowCounts: counts,
        schemaOK: Object.values(counts).every(c => c !== null)
    };
}

async function listRegistrations() { return readTab('Registrations'); }

async function findRegistrationById(id) {
    const all = await listRegistrations();
    return all.find(r => r.id === id) || null;
}

async function createRegistration(reg) {
    await appendRow('Registrations', reg);
    return reg;
}

async function updateRegistration(id, patch) {
    let existing = await findRegistrationById(id);
    if (!existing) {
        // Cache might be stale — force fresh and retry.
        invalidate('Registrations');
        existing = await findRegistrationById(id);
    }
    if (!existing) throw new Error(`Registration ${id} not found`);
    const merged = { ...existing, ...patch };
    delete merged._rowIndex;
    await updateRowAt('Registrations', existing._rowIndex, merged);
    return merged;
}

async function findAdminByEmail(email) {
    const all = await readTab('Admins');
    const lc = String(email).toLowerCase().trim();
    return all.find(a => String(a.email).toLowerCase().trim() === lc) || null;
}

async function createAdmin(admin) {
    await appendRow('Admins', admin);
    return admin;
}

async function getSettings() {
    const rows = await readTab('Settings');
    const map = {};
    for (const row of rows) if (row.key) map[row.key] = row.value;
    return map;
}

module.exports = {
    SCHEMA,
    ensureSchema,
    getStatus,
    listRegistrations,
    findRegistrationById,
    createRegistration,
    updateRegistration,
    findAdminByEmail,
    createAdmin,
    getSettings,
    warm
};
