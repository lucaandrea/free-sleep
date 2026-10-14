
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="118b6d65-01b8-52a5-8a04-5834fbd6a1a6")}catch(e){}}();
import express from 'express';
import { homeKitStatus } from './homekit.js';
const router = express.Router();
router.get('/homekit', (_request, response) => response.json(homeKitStatus()));
export default router;
//# sourceMappingURL=index.js.map
//# debugId=118b6d65-01b8-52a5-8a04-5834fbd6a1a6
