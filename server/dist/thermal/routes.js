
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="794267db-da61-5064-8b6c-36ef6fb5ca7d")}catch(e){}}();
import express from 'express';
import { z } from 'zod';
import { comfortConfigSchema, comfortModeSchema } from './types.js';
export function comfortRoutes(controller) {
    const router = express.Router();
    const sideSchema = z.enum(['left', 'right']);
    router.get('/', async (request, response) => {
        const side = sideSchema.safeParse(request.query.side);
        if (!side.success)
            return response.status(400).json({ error: { message: 'Choose left or right' } });
        response.json(await controller.status(side.data));
    });
    router.post('/', async (request, response) => {
        const parsed = z.object({ side: sideSchema, config: comfortConfigSchema, reset: z.boolean().optional() }).strict().safeParse(request.body);
        if (!parsed.success) {
            return response.status(400).json({ error: { message: 'Choose a mode and limits between 55 and 110°F, with minimum below maximum' } });
        }
        await controller.configure(parsed.data.side, parsed.data.config, parsed.data.reset);
        response.json(await controller.status(parsed.data.side));
    });
    router.post('/mode', async (request, response) => {
        const parsed = z.object({ side: sideSchema, mode: comfortModeSchema }).strict().safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ error: { message: 'Choose a side and Off, Preview or Active.' } });
        await controller.setMode(parsed.data.side, parsed.data.mode);
        response.status(204).end();
    });
    return router;
}
//# sourceMappingURL=routes.js.map
//# debugId=794267db-da61-5064-8b6c-36ef6fb5ca7d
