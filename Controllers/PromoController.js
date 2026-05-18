'use strict';

const { SheetsService } = require('../Services');

const PromoController = {
    validate: async (req) => {
        const { code } = req.payload;
        const promo = await SheetsService.findPromoByCode(code.trim());

        if (!promo) return { valid: false };

        const discount = Number(promo.discount || 0);
        if (discount <= 0) return { valid: false };

        const limit = Number(promo.limit || 0);
        if (limit > 0) {
            const used = await SheetsService.countPromoUsage(promo.code);
            if (used >= limit) return { valid: false, limitReached: true };
        }

        const settings = await SheetsService.getSettings();
        return {
            valid: true,
            discount,
            currency: settings.currency || 'UAH'
        };
    }
};

module.exports = PromoController;
