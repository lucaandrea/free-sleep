
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="07184dd2-837d-5f07-bcb0-438a061faad7")}catch(e){}}();
import express from 'express';
import { presenceMonitor, presenceSchema } from '../../thermal/presence.js';
const router = express.Router();
router.post('/presence', (request, response) => {
    const parsed = presenceSchema.safeParse(request.body);
    if (!parsed.success)
        return response.status(400).json({ error: { message: 'Provide a boolean presence reading for at least one side' } });
    return response.json(presenceMonitor.update(parsed.data));
});
router.get('/presence', (_request, response) => response.json(presenceMonitor.read()));
export default router;
//# sourceMappingURL=presence.js.map
//# debugId=07184dd2-837d-5f07-bcb0-438a061faad7
