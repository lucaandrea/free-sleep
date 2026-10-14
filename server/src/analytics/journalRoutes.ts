import path from 'node:path';
import config from '../config.js';
import { loadAnalytics } from './index.js';
import { createJournalStore } from './journal.js';
import { journalRouter } from './journalRouter.js';

export const journalStore = createJournalStore(path.join(config.dbFolder, 'analytics', 'journal.json'));
export default journalRouter(journalStore, loadAnalytics);
