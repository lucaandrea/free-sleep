import { z } from 'zod';
import type { PresenceReading } from './policy.js';
import type { Side } from '../db/schedulesSchema.js';

const sideSchema = z.object({ present: z.boolean(), lastUpdatedAt: z.string().optional() }).strict();
export const presenceSchema = z.object({ left: sideSchema.optional(), right: sideSchema.optional() }).strict()
  .refine(value => value.left !== undefined || value.right !== undefined, 'Provide a presence reading for at least one side');

export class PresenceMonitor {
  private readings: Record<Side, PresenceReading> = { left: { present: false }, right: { present: false } };
  constructor(private clock = Date.now) {}
  read() { return structuredClone(this.readings); }
  update(input: unknown) {
    const readings = presenceSchema.parse(input);
    for (const side of ['left', 'right'] as const) {
      if (readings[side]) {
        const now = this.clock();
        const previous = this.readings[side];
        const fresh = now >= Date.parse(previous.lastUpdatedAt ?? '') && now - Date.parse(previous.lastUpdatedAt ?? '') <= 90_000;
        const present = readings[side]!.present;
        this.readings[side] = { present, lastUpdatedAt: new Date(now).toISOString(),
          ...(present ? { presentSince: fresh && previous.present && previous.presentSince
            ? previous.presentSince : new Date(now).toISOString() } : {}) };
      }
    }
    return this.read();
  }
}
export const presenceMonitor = new PresenceMonitor();
