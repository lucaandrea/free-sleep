import path from 'node:path';
import config from '../config.js';
import { journalStore } from '../analytics/journalRoutes.js';
import { loadAnalytics } from '../analytics/index.js';
import { createCoachRouter } from './router.js';
import { createUsageStore } from './usageStore.js';

const usage = createUsageStore(path.join(config.dbFolder, 'analytics', 'model-usage.json'));
export default createCoachRouter({ journal: journalStore, analytics: loadAnalytics, usage });
