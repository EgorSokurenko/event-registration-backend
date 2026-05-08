'use strict';

const TZ = process.env.TIMEZONE || 'Europe/Kiev';

/**
 * Returns a local-time ISO-like string in the configured timezone (Europe/Kiev by default).
 * Format: "'2026-05-08T11:33:56" — leading single-quote forces Google Sheets to store
 * it as text. Sheets strips the quote on read, so consumers get a clean
 * "2026-05-08T11:33:56" that `new Date(...)` parses as local time on the JS side.
 */
function localTimestamp(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    return `'${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Force any pre-existing timestamp string (e.g. Mono's modifiedDate) to be stored as
 * literal text in Sheets, never re-parsed.
 */
function asTextTimestamp(s) {
    if (!s) return '';
    const str = String(s);
    return str.startsWith("'") ? str : "'" + str;
}

module.exports = { localTimestamp, asTextTimestamp, TZ };
