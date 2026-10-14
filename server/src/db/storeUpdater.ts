export interface JsonStore<State> {
  data: State;
  read(): Promise<void>;
  write(): Promise<void>;
}

// Serialize edits to a private snapshot so concurrent requests cannot overwrite one another.
export function createStoreUpdater<State>(store: JsonStore<State>) {
  let pending: Promise<void> = Promise.resolve();
  return function update<Result>(edit: (state: State) => Result | Promise<Result>): Promise<Result> {
    const operation = pending.then(async () => {
      await store.read();
      const previous = structuredClone(store.data);
      const draft = structuredClone(previous);
      const result = await edit(draft);
      store.data = draft;
      try {
        await store.write();
      } catch (error) {
        store.data = previous;
        throw error;
      }
      store.data = draft;
      return result;
    });
    pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}
