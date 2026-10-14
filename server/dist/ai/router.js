
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="8bce5512-bf8c-5c26-9dea-5af605b9dc60")}catch(e){}}();
import express from 'express';
import { z } from 'zod';
import { analyticsQuery } from '../analytics/query.js';
import { journalPatterns } from '../analytics/journal.js';
import { coachAvailability, generateCoaching, providerSchema } from './coach.js';
import { usageLimitChange } from './usageContract.js';
const requestSchema = analyticsQuery.extend({
    provider: providerSchema.default('rules'), shareSummary: z.boolean().default(false),
    question: z.string().trim().max(1000).default('Summarize my recent routine and suggest one small experiment.'),
});
export function createCoachRouter(dependencies) {
    const router = express.Router();
    const clock = dependencies.now ?? Date.now;
    const generate = dependencies.generate ?? generateCoaching;
    const availability = dependencies.availability ?? coachAvailability;
    let active = false;
    let lastModelRequest = null;
    router.get('/providers', (_request, response) => response.json(availability()));
    router.get('/usage', async (_request, response) => response.json(await dependencies.usage.snapshot()));
    router.post('/usage/limit', async (request, response) => {
        const parsed = usageLimitChange.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ error: {
                    message: 'Choose a whole-number monthly limit from 0 to 1000 and refresh usage before saving.',
                } });
        response.json(await dependencies.usage.setLimit(parsed.data));
    });
    router.post('/coach', async (request, response) => {
        const parsed = requestSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ error: { message: 'Invalid coaching request' } });
        const input = parsed.data;
        if (input.provider !== 'rules' && !input.shareSummary)
            return response.status(400).json({ error: { message: 'Allow sharing a numerical summary with the selected model first' } });
        if (active || (input.provider !== 'rules' && lastModelRequest !== null && clock() - lastModelRequest < 30000))
            return response.status(429).json({ error: { message: 'Please wait before requesting another insight' } });
        const selected = availability().find(item => item.provider === input.provider);
        if (input.provider !== 'rules' && !selected?.configured)
            return response.status(503).json({ error: { message: `${input.provider} is not configured on the server` } });
        active = true;
        try {
            const analytics = await dependencies.analytics(input);
            const dates = new Set(analytics.nights.map(night => night.date));
            const entries = (await dependencies.journal.list()).filter(entry => entry.side === input.side && dates.has(entry.date));
            const patterns = journalPatterns(entries, analytics);
            if (input.provider === 'rules')
                return response.json(await generate(input.provider, analytics, input.question, patterns));
            if (request.aborted || response.destroyed)
                return;
            const reservation = await dependencies.usage.reserve(input.provider, selected.model);
            lastModelRequest = clock();
            const started = performance.now();
            let tokens = null;
            let result;
            try {
                result = await generate(input.provider, analytics, input.question, patterns, reported => { tokens = reported; });
            }
            catch (error) {
                await dependencies.usage.finish(reservation, 'failed', tokens, performance.now() - started);
                throw error;
            }
            // Persist completion before publishing. A storage failure leaves the reservation counted and is never retried.
            await dependencies.usage.finish(reservation, 'completed', tokens, performance.now() - started);
            response.json(result);
        }
        finally {
            active = false;
        }
    });
    return router;
}
//# sourceMappingURL=router.js.map
//# debugId=8bce5512-bf8c-5c26-9dea-5af605b9dc60
