import express from 'express';
import type { Settings } from '../db/settingsSchema.js';
import { applyPreferences, PreferenceChangeSchema, PreferenceConflict, preferenceSnapshot } from './contract.js';

export function preferencesRouter(store: {
  read(): Promise<Settings>;
  update(change: (current: Settings) => Settings): Promise<Settings>;
}) {
  const router = express.Router();
  router.get('/', async (_request, response) => response.json(preferenceSnapshot(await store.read())));
  router.post('/', async (request, response) => {
    const parsed = PreferenceChangeSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { message: 'Check the timezone, side names and daily time.' } });
    try {
      const settings = await store.update(current => applyPreferences(current, parsed.data));
      return response.json(preferenceSnapshot(settings));
    } catch (error) {
      if (error instanceof PreferenceConflict) return response.status(409).json({ error: { message: error.message } });
      throw error;
    }
  });
  return router;
}
