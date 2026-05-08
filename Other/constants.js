'use strict';

const UnFx = {
    sendSuccess: (data = {}, hapi, message = 'Success', statusCode = 200) =>
        hapi.response({ success: true, message, data }).code(statusCode),
    sendError: (data = {}, hapi, message = 'Error', statusCode = 400) =>
        hapi.response({ success: false, message, data }).code(data.statusCode || statusCode),
    failAction: (_req, hapi, error) =>
        UnFx.sendError(
            { message: 'Validation failed: ' + error.details.map(d => d.message).join(', ') },
            hapi,
            400
        ).takeover()
};

module.exports = { UnFx };
