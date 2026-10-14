
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="b01ee2b5-8a23-5ad7-9e98-736728f8d6bb")}catch(e){}}();
import { z } from 'zod';
export const basePositionSchema = z
    .object({
    head: z.number().int().min(0).max(60),
    feet: z.number().int().min(0).max(45),
    speed: z.number().int().min(30).max(100).default(50),
})
    .strict();
export const baseConfigurationSchema = z.object({
    Address: z
        .string()
        .regex(/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i)
        .transform((address) => address.toUpperCase()),
    SplitBase: z.boolean(),
});
export const BASE_PRESETS = {
    flat: { head: 0, feet: 0, speed: 50 },
    sleep: { head: 1, feet: 5, speed: 50 },
    relax: { head: 30, feet: 15, speed: 50 },
    read: { head: 40, feet: 0, speed: 50 },
};
export class BaseError extends Error {
    status;
    constructor(message, status = 503) {
        super(message);
        this.status = status;
    }
}
//# sourceMappingURL=types.js.map
//# debugId=b01ee2b5-8a23-5ad7-9e98-736728f8d6bb
