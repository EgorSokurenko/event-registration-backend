'use strict';

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set in .env (generate with: openssl rand -hex 32)');
    return s;
}

function signToken(payload) {
    return jwt.sign(payload, secret(), {
        algorithm: 'HS256',
        expiresIn: TOKEN_TTL_SECONDS
    });
}

const validate = async (decoded) => {
    if (!decoded || !decoded.email) {
        return { isValid: false };
    }
    return { isValid: true, credentials: { email: decoded.email } };
};

const registerAuth = async (server) => {
    await server.register(require('hapi-auth-jwt2'));

    server.auth.strategy('jwt', 'jwt', {
        key: secret(),
        validate,
        verifyOptions: { algorithms: ['HS256'] }
    });
};

module.exports = { registerAuth, signToken, TOKEN_TTL_SECONDS };
