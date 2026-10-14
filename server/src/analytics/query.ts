import { z } from 'zod';

export const analyticsQuery = z.object({
  side: z.enum(['left', 'right']).default('left'),
  days: z.coerce.number().int().min(7).max(365).default(30),
  goalMinutes: z.coerce.number().int().min(240).max(720).default(480),
});
