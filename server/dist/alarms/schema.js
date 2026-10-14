
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="7140468f-f69e-5bae-9c46-1050849094de")}catch(e){}}();
import { z } from 'zod';
import { SideSchema, TimeSchema } from '../db/schedulesSchema.js';
export const AlarmChangeSchema = z.discriminatedUnion('action', [
    z.object({ side: SideSchema, action: z.literal('time'), time: TimeSchema, expectedAt: z.string().datetime({ offset: true }) }).strict(),
    z.object({ side: SideSchema, action: z.literal('disable'), expectedAt: z.string().datetime({ offset: true }) }).strict(),
    z.object({ side: SideSchema, action: z.literal('restore'), expectedExpiresAt: z.string().datetime({ offset: true }),
        expectedRevision: z.string().uuid().optional() }).strict(),
]);
//# sourceMappingURL=schema.js.map
//# debugId=7140468f-f69e-5bae-9c46-1050849094de
