
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="31d0c92e-4955-5d98-bc18-a040514eec04")}catch(e){}}();
import { z } from 'zod';
export const comfortModeSchema = z.enum(['off', 'preview', 'active']);
export const comfortConfigSchema = z.object({
    mode: comfortModeSchema,
    minimumF: z.number().int().min(55).max(110),
    maximumF: z.number().int().min(55).max(110),
    sensorAware: z.boolean().optional(),
    followBedtime: z.boolean().optional(),
}).strict().refine(value => value.minimumF <= value.maximumF, 'Minimum must not exceed maximum');
export const defaultComfortState = () => ({
    config: { mode: 'off', minimumF: 70, maximumF: 95 }, offsetF: 0, feedbackThrough: '', learnedSession: '',
    pausedUntil: 0, lastAppliedAt: 0, lastTargetF: null, lastSegment: '', history: [],
});
//# sourceMappingURL=types.js.map
//# debugId=31d0c92e-4955-5d98-bc18-a040514eec04
