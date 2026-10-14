
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="e2819119-a311-53df-b712-311273175727")}catch(e){}}();
import path from 'node:path';
import config from '../config.js';
import { loadAnalytics } from './index.js';
import { createJournalStore } from './journal.js';
import { journalRouter } from './journalRouter.js';
export const journalStore = createJournalStore(path.join(config.dbFolder, 'analytics', 'journal.json'));
export default journalRouter(journalStore, loadAnalytics);
//# sourceMappingURL=journalRoutes.js.map
//# debugId=e2819119-a311-53df-b712-311273175727
