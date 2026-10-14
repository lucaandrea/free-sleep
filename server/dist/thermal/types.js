
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="7bf975df-f7dd-5d57-85f8-dec7338f36ab")}catch(e){}}();
import { z } from 'zod';
export const comfortConfigSchema = z.object({
    mode: z.enum(['off', 'preview', 'active']),
    minimumF: z.number().int().min(55).max(110),
    maximumF: z.number().int().min(55).max(110),
}).strict().refine(value => value.minimumF <= value.maximumF, 'Minimum must not exceed maximum');
export const defaultComfortState = () => ({
    config: { mode: 'off', minimumF: 70, maximumF: 95 }, offsetF: 0, feedbackThrough: '', learnedSession: '',
    pausedUntil: 0, lastAppliedAt: 0, lastTargetF: null, lastSegment: '', history: [],
});
//# sourceMappingURL=types.js.map
//# debugId=7bf975df-f7dd-5d57-85f8-dec7338f36ab
