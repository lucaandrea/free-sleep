import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { summarizeUsage, usageAttemptSchema, usageLimitChange, type UsageAttempt, type TokenUsage } from './usageContract.js';

const stateSchema = z.object({ version: z.literal(1), monthlyLimit: z.number().int().min(0).max(1000),
  revision: z.number().int().nonnegative().safe(), latestPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
  attempts: z.array(usageAttemptSchema).max(12000),
}).strict().refine(state => new Set(state.attempts.map(attempt => attempt.id)).size === state.attempts.length);
type State = z.infer<typeof stateSchema>;
const failure = (message: string, status = 503) => Object.assign(new Error(message), { status });

// One server owns this ledger. Serialize and persist reservations before dispatch; failed writes never grant a request.
export function createUsageStore(filename: string, now: () => Date = () => new Date()) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<State> => {
    try {
      const raw = await readFile(filename, 'utf8');
      if (raw.length > 8 * 1024 * 1024) throw new Error('Oversized ledger');
      return stateSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, monthlyLimit: 100, revision: 0, latestPeriod: null, attempts: [] };
      throw failure('Model usage could not be read. Check the server usage ledger before trying another model request.');
    }
  };
  const update = <Result>(edit: (state: State) => Result) => {
    const operation = tail.then(async () => {
      const state = await read(); const result = edit(state); stateSchema.parse(state);
      const directory = path.dirname(filename); const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, filename);
        const folder = await open(directory, 'r');
        try { await folder.sync(); } finally { await folder.close(); }
      } catch {
        await unlink(temporary).catch(() => undefined);
        throw failure('Model usage could not be saved. Check server storage before trying another model request.');
      }
      return result;
    });
    tail = operation.catch(() => undefined); return operation;
  };
  return {
    snapshot: async () => {
      await tail; const state = await read(); return summarizeUsage(state.attempts, state.monthlyLimit, state.revision, now());
    },
    setLimit: (input: unknown) => {
      const change = usageLimitChange.parse(input);
      return update(state => {
        if (state.revision !== change.originalRevision)
          throw failure('The model limit changed elsewhere. Refresh usage and reset your draft before saving again.', 409);
        state.monthlyLimit = change.monthlyLimit; state.revision++;
        return summarizeUsage(state.attempts, state.monthlyLimit, state.revision, now());
      });
    },
    reserve: (provider: UsageAttempt['provider'], model: string) => update(state => {
      const instant = now(); const period = instant.toISOString().slice(0, 7);
      if (state.latestPeriod && period < state.latestPeriod)
        throw failure('The server clock moved to an earlier month. Correct it before requesting model insights.', 409);
      if (state.attempts.filter(attempt => attempt.startedAt.startsWith(period)).length >= state.monthlyLimit)
        throw failure('The monthly model request limit has been reached. Use local calculations or update the limit in Model usage.', 429);
      const oldest = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() - 11, 1)).toISOString();
      state.attempts = state.attempts.filter(attempt => attempt.startedAt >= oldest);
      state.latestPeriod = period;
      const attempt = usageAttemptSchema.parse({ id: randomUUID(), provider, model, startedAt: instant.toISOString(),
        outcome: 'pending', elapsedMilliseconds: null, tokens: null });
      state.attempts.push(attempt); return attempt.id;
    }),
    finish: (id: string, outcome: 'completed' | 'failed', tokens: TokenUsage | null, elapsedMilliseconds: number) => update(state => {
      const attempt = state.attempts.find(item => item.id === id);
      if (attempt?.outcome !== 'pending') throw failure('This model request has already settled or is unavailable.', 409);
      Object.assign(attempt, { outcome, tokens, elapsedMilliseconds: Math.min(86400000, Math.max(0, Math.round(elapsedMilliseconds))) });
    }),
  };
}
export type UsageStore = ReturnType<typeof createUsageStore>;
