import type { Settings } from './settingsSchema.js';

interface SettingsStore {
  data: Settings;
  read(): Promise<void>;
  write(): Promise<void>;
}

// Serialize settings edits and mutate a private snapshot, so concurrent sides cannot overwrite each other.
export function createSettingsUpdater(store: SettingsStore) {
  let pending: Promise<void> = Promise.resolve();
  return function updateSettings<Result>(edit: (settings: Settings) => Result | Promise<Result>): Promise<Result> {
    const operation = pending.then(async () => {
      await store.read();
      const previous = structuredClone(store.data);
      const draft = structuredClone(previous);
      const result = await edit(draft);
      store.data = draft;
      try { await store.write(); }
      catch (error) { store.data = previous; throw error; }
      store.data = draft;
      return result;
    });
    pending = operation.then(() => undefined, () => undefined);
    return operation;
  };
}
