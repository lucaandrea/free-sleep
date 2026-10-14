// Serialize settings edits and mutate a private snapshot, so concurrent sides cannot overwrite each other.

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="2e711d9f-ad91-5e7d-ae8e-72826e16da0c")}catch(e){}}();
export function createSettingsUpdater(store) {
    let pending = Promise.resolve();
    return function updateSettings(edit) {
        const operation = pending.then(async () => {
            await store.read();
            const previous = structuredClone(store.data);
            const draft = structuredClone(previous);
            const result = await edit(draft);
            store.data = draft;
            try {
                await store.write();
            }
            catch (error) {
                store.data = previous;
                throw error;
            }
            store.data = draft;
            return result;
        });
        pending = operation.then(() => undefined, () => undefined);
        return operation;
    };
}
//# sourceMappingURL=settingsUpdater.js.map
//# debugId=2e711d9f-ad91-5e7d-ae8e-72826e16da0c
