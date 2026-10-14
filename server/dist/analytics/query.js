
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="cbfb4957-b9d1-5c4a-8e85-1bee1a2a8b3a")}catch(e){}}();
import { z } from 'zod';
export const analyticsQuery = z.object({
    side: z.enum(['left', 'right']).default('left'),
    days: z.coerce.number().int().min(7).max(365).default(30),
    goalMinutes: z.coerce.number().int().min(240).max(720).default(480),
});
//# sourceMappingURL=query.js.map
//# debugId=cbfb4957-b9d1-5c4a-8e85-1bee1a2a8b3a
