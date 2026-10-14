// Serialize edits to a private snapshot so concurrent requests cannot overwrite one another.

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="6d0475de-c085-512b-aeb1-eea174ed38ac")}catch(e){}}();
export function createStoreUpdater(store) {
    let pending = Promise.resolve();
    return function update(edit) {
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
//# sourceMappingURL=storeUpdater.js.map
//# debugId=6d0475de-c085-512b-aeb1-eea174ed38ac
