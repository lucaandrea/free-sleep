import type { Settings } from './settingsSchema.js';
import { createStoreUpdater, type JsonStore } from './storeUpdater.js';

export const createSettingsUpdater = (store: JsonStore<Settings>) => createStoreUpdater(store);
