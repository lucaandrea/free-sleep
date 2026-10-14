
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="5b9730d8-e4af-5165-9d84-004cfd8a6959")}catch(e){}}();
import path from 'node:path';
import config from '../config.js';
import { journalStore } from '../analytics/journalRoutes.js';
import { loadAnalytics } from '../analytics/index.js';
import { createCoachRouter } from './router.js';
import { createUsageStore } from './usageStore.js';
const usage = createUsageStore(path.join(config.dbFolder, 'analytics', 'model-usage.json'));
export default createCoachRouter({ journal: journalStore, analytics: loadAnalytics, usage });
//# sourceMappingURL=index.js.map
//# debugId=5b9730d8-e4af-5165-9d84-004cfd8a6959
