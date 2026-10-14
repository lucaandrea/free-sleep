
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="edc128c8-623d-5b63-b0ab-3c6591fb48e1")}catch(e){}}();
import express from 'express';
import { journalStore } from '../analytics/journalRoutes.js';
import { journalPatterns } from '../analytics/journal.js';
import { z } from 'zod';
import { analyticsQuery, loadAnalytics } from '../analytics/index.js';
import { coachAvailability, generateCoaching, providerSchema } from './coach.js';
const router = express.Router();
const requestSchema = analyticsQuery.extend({
    provider: providerSchema.default('rules'),
    shareSummary: z.boolean().default(false),
    question: z.string().trim().max(1000).default('Summarize my recent routine and suggest one small experiment.'),
});
let active = false;
let lastCloudRequest = 0;
router.get('/providers', (_request, response) => response.json(coachAvailability()));
router.post('/coach', async (request, response) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success)
        return response.status(400).json({ error: { message: 'Invalid coaching request' } });
    const input = parsed.data;
    if (input.provider !== 'rules' && !input.shareSummary) {
        return response.status(400).json({ error: { message: 'Allow sharing a numerical summary with the selected model first' } });
    }
    if (active || (input.provider !== 'rules' && Date.now() - lastCloudRequest < 30000)) {
        return response.status(429).json({ error: { message: 'Please wait before requesting another insight' } });
    }
    active = true;
    try {
        const analytics = await loadAnalytics(input);
        if (input.provider !== 'rules')
            lastCloudRequest = Date.now();
        const dates = new Set(analytics.nights.map(night => night.date));
        const entries = (await journalStore.list()).filter(entry => entry.side === input.side && dates.has(entry.date));
        response.json(await generateCoaching(input.provider, analytics, input.question, journalPatterns(entries, analytics)));
    }
    finally {
        active = false;
    }
});
export default router;
//# sourceMappingURL=index.js.map
//# debugId=edc128c8-623d-5b63-b0ab-3c6591fb48e1
