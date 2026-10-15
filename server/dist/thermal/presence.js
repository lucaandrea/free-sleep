
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="3fa45fdf-be29-5032-8a1b-596ae0388fc5")}catch(e){}}();
import { z } from 'zod';
const sideSchema = z.object({ present: z.boolean(), lastUpdatedAt: z.string().optional() }).strict();
export const presenceSchema = z.object({ left: sideSchema.optional(), right: sideSchema.optional() }).strict()
    .refine(value => value.left !== undefined || value.right !== undefined, 'Provide a presence reading for at least one side');
export class PresenceMonitor {
    clock;
    readings = { left: { present: false }, right: { present: false } };
    constructor(clock = Date.now) {
        this.clock = clock;
    }
    read() { return structuredClone(this.readings); }
    update(input) {
        const readings = presenceSchema.parse(input);
        for (const side of ['left', 'right']) {
            if (readings[side]) {
                const now = this.clock();
                const previous = this.readings[side];
                const fresh = now >= Date.parse(previous.lastUpdatedAt ?? '') && now - Date.parse(previous.lastUpdatedAt ?? '') <= 90_000;
                const present = readings[side].present;
                this.readings[side] = { present, lastUpdatedAt: new Date(now).toISOString(),
                    ...(present ? { presentSince: fresh && previous.present && previous.presentSince
                            ? previous.presentSince : new Date(now).toISOString() } : {}) };
            }
        }
        return this.read();
    }
}
export const presenceMonitor = new PresenceMonitor();
//# sourceMappingURL=presence.js.map
//# debugId=3fa45fdf-be29-5032-8a1b-596ae0388fc5
