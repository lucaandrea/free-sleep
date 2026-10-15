
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ed5b80c3-c48b-5316-8037-01b3d2aa83cd")}catch(e){}}();
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { comfortConfigSchema, defaultComfortState } from './types.js';
const stateSchema = z.object({
    config: comfortConfigSchema, offsetF: z.number().int().min(-3).max(3), feedbackThrough: z.string(), learnedSession: z.string(),
    pausedUntil: z.number().nonnegative(), lastAppliedAt: z.number().nonnegative(), lastTargetF: z.number().min(55).max(110).nullable(),
    lastSegment: z.string(), history: z.array(z.object({ at: z.number(), message: z.string(), targetF: z.number().nullable() })).max(60),
    timingSession: z.string().optional(), phaseShiftMinutes: z.number().int().min(-30).max(30).optional(),
}).strict();
const documentSchema = z.object({ left: stateSchema, right: stateSchema }).strict();
// The controller serializes access. Atomic replacement preserves the previous file if a write fails.
export function comfortStore(filename) {
    return {
        async read() {
            try {
                return documentSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return { left: defaultComfortState(), right: defaultComfortState() };
                throw error;
            }
        },
        async write(document) {
            const content = JSON.stringify(documentSchema.parse(document));
            await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
            const temporary = `${filename}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, content, { mode: 0o600 });
                await rename(temporary, filename);
            }
            finally {
                await rm(temporary, { force: true });
            }
        },
    };
}
//# sourceMappingURL=store.js.map
//# debugId=ed5b80c3-c48b-5316-8037-01b3d2aa83cd
