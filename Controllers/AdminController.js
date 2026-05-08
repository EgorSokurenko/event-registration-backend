'use strict';

const { AdminService, SheetsService } = require('../Services');
const { signToken, TOKEN_TTL_SECONDS } = require('../Other/auth');
const { verifyTicketToken } = require('../Other/qr');
const { localTimestamp } = require('../Other/datetime');

function asBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return false;
}

function publicReg(reg) {
    return {
        id: reg.id,
        firstName: reg.firstName,
        lastName: reg.lastName,
        email: reg.email,
        phone: reg.phone,
        city: reg.city,
        church: reg.church,
        arrived: asBool(reg.arrived),
        arrivedAt: reg.arrivedAt || '',
        arrivedBy: reg.arrivedBy || ''
    };
}

const AdminController = {
    login: async (req) => {
        const { email, password } = req.payload;
        const admin = await AdminService.findByEmail(email);
        if (!admin) {
            const err = new Error('Невірна пошта або пароль');
            err.statusCode = 401;
            throw err;
        }
        const ok = await AdminService.verifyPassword(password, admin.passwordHash);
        if (!ok) {
            const err = new Error('Невірна пошта або пароль');
            err.statusCode = 401;
            throw err;
        }
        const accessToken = signToken({ email: admin.email });

        // Pre-warm the registrations cache so the dashboard renders instantly
        // after redirect. Fire-and-forget — the response below doesn't wait.
        SheetsService.warm('Registrations');

        return {
            accessToken,
            expiresIn: TOKEN_TTL_SECONDS,
            admin: { email: admin.email, name: admin.name || '' }
        };
    },

    me: async (req) => {
        // req.auth.credentials.email comes from the validated JWT.
        const { email } = req.auth.credentials;
        const admin = await AdminService.findByEmail(email);
        if (!admin) {
            const err = new Error('Admin no longer exists');
            err.statusCode = 401;
            throw err;
        }
        return { email: admin.email, name: admin.name || '' };
    },

    listRegistrations: async () => {
        const all = await SheetsService.listRegistrations();
        // Strip internal sheet row index from the response.
        return all.map(r => {
            const { _rowIndex, ...rest } = r;
            return rest;
        });
    },

    scan: async (req) => {
        const { payload } = req.payload;

        const id = verifyTicketToken(payload);
        if (!id) {
            const err = new Error('Невірний QR-код (підпис не пройшов перевірку)');
            err.statusCode = 400;
            throw err;
        }

        const reg = await SheetsService.findRegistrationById(id);
        if (!reg) {
            const err = new Error('Реєстрацію не знайдено');
            err.statusCode = 404;
            throw err;
        }

        if (reg.paymentStatus !== 'paid') {
            const err = new Error('Квиток не оплачений');
            err.statusCode = 409;
            throw err;
        }

        // Already checked in — return current state without re-writing.
        if (asBool(reg.arrived)) {
            return {
                alreadyCheckedIn: true,
                registration: publicReg(reg)
            };
        }

        const adminEmail = req.auth.credentials.email;
        const arrivedAt = localTimestamp();
        const updated = await SheetsService.updateRegistration(id, {
            arrived: 'TRUE',
            arrivedAt,
            arrivedBy: adminEmail
        });

        return {
            alreadyCheckedIn: false,
            registration: publicReg({ ...reg, ...updated })
        };
    }
};

module.exports = AdminController;
