
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ce865943-5d0e-5072-b153-4a316cbc7ee4")}catch(e){}}();
import express from 'express';
import { applyPreferences, PreferenceChangeSchema, PreferenceConflict, preferenceSnapshot } from './contract.js';
export function preferencesRouter(store) {
    const router = express.Router();
    router.get('/', async (_request, response) => response.json(preferenceSnapshot(await store.read())));
    router.post('/', async (request, response) => {
        const parsed = PreferenceChangeSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ error: { message: 'Check the timezone, side names and daily time.' } });
        try {
            const settings = await store.update(current => applyPreferences(current, parsed.data));
            return response.json(preferenceSnapshot(settings));
        }
        catch (error) {
            if (error instanceof PreferenceConflict)
                return response.status(409).json({ error: { message: error.message } });
            throw error;
        }
    });
    return router;
}
//# sourceMappingURL=router.js.map
//# debugId=ce865943-5d0e-5072-b153-4a316cbc7ee4
