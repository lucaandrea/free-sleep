import { z } from 'zod';
import { SideSchema, TimeSchema } from '../db/schedulesSchema.js';

export const AlarmChangeSchema = z.discriminatedUnion('action', [
  z.object({ side: SideSchema, action: z.literal('time'), time: TimeSchema, expectedAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ side: SideSchema, action: z.literal('disable'), expectedAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ side: SideSchema, action: z.literal('restore'), expectedExpiresAt: z.string().datetime({ offset: true }),
    expectedRevision: z.string().uuid().optional() }).strict(),
]);
