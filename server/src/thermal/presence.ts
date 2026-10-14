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
      if (readings[side]) this.readings[side] = { present: readings[side]!.present, lastUpdatedAt: new Date(this.clock()).toISOString() };
    }
    return this.read();
  }
}
export const presenceMonitor = new PresenceMonitor();
