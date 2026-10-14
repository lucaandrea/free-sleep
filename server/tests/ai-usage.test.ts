import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { createUsageStore } from '../src/ai/usageStore.js';
import { providerUsage } from '../src/ai/providerUsage.js';
import { summarizeUsage, usageAttemptSchema, usageLimitChange } from '../src/ai/usageContract.js';
import { createCoachRouter } from '../src/ai/router.js';
import { generateCoaching } from '../src/ai/coach.js';
import { summarizeSleep } from '../src/analytics/summary.js';
import { providerEnvelope } from './fixtures/coaching.js';
const tokens = { inputTokens: 120, outputTokens: 30, totalTokens: 150 };
const instant = new Date('2026-10-14T12:00:00Z');
test('usage normalization includes cache and reasoning without double counting and preserves unknown values', () => {
  assert.deepEqual(providerUsage('openai', { usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150,
    input_tokens_details: { cached_tokens: 100 }, output_tokens_details: { reasoning_tokens: 20 } } }), tokens);
  assert.deepEqual(providerUsage('anthropic', { usage: { input_tokens: 20, cache_read_input_tokens: 80,
    cache_creation_input_tokens: 20, output_tokens: 30 } }), tokens);
  assert.deepEqual(providerUsage('gemini', { usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 10,
    thoughtsTokenCount: 20, totalTokenCount: 150, cachedContentTokenCount: 100 } }), tokens);
  assert.deepEqual(providerUsage('ollama', { prompt_eval_count: 120, eval_count: 30, prompt_eval_cached_count: 100 }), tokens);
  assert.deepEqual(providerUsage('ollama', { prompt_eval_count: 0, eval_count: 0 }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  for (const value of [undefined, null, {}, { input_tokens: 1, output_tokens: 2, total_tokens: 1 },
    { input_tokens: '120', output_tokens: 30, total_tokens: 150 }, { input_tokens: -1, output_tokens: 30, total_tokens: 29 },
    { input_tokens: 0.5, output_tokens: 30, total_tokens: 30.5 }]) assert.equal(providerUsage('openai', { usage: value }), null);
  assert.equal(providerUsage('gemini', { usageMetadata: { promptTokenCount: 120, totalTokenCount: 100 } }), null);
  assert.equal(providerUsage('gemini', { usageMetadata: { promptTokenCount: 120, thoughtsTokenCount: 40, totalTokenCount: 150 } }), null);
  assert.equal(providerUsage('rules', {}), null);
});
test('durable concurrent reservations stop at the shared limit and failed requests retain reported usage', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-usage-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'usage.json'); const store = createUsageStore(filename, () => instant);
  assert.equal((await store.snapshot()).monthlyLimit, 100);
  await store.setLimit({ monthlyLimit: 3, originalRevision: 0 });
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => store.reserve(index % 2 ? 'ollama' : 'openai', 'test-model')));
  const granted = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  assert.equal(granted.length, 3);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.status === 429));
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  await store.finish(granted[0], 'failed', tokens, 800); await store.finish(granted[1], 'completed', null, 1200);
  await assert.rejects(store.finish(granted[0], 'completed', tokens, 800), { status: 409 });
  const snapshot = await store.snapshot();
  assert.equal(snapshot.attempts, 3); assert.equal(snapshot.remaining, 0); assert.equal(snapshot.failed, 1);
  assert.equal(snapshot.completed, 1); assert.equal(snapshot.pending, 1); assert.equal(snapshot.tokensReportedFor, 1);
  assert.equal(snapshot.totalTokens, 150); assert.equal(snapshot.averageResponseMilliseconds, 1000);
  const restarted = createUsageStore(filename, () => new Date(instant.getTime() + 180000));
  assert.equal((await restarted.snapshot()).unresolved, 1);
  await assert.rejects(restarted.reserve('gemini', 'test'), { status: 429 });
  await assert.rejects(store.setLimit({ monthlyLimit: 10, originalRevision: 0 }), { status: 409 });
  assert.equal((await store.snapshot()).monthlyLimit, 3);
  for (const value of [-1, 1.1, 1001, '5', null]) assert.equal(usageLimitChange.safeParse({ monthlyLimit: value, originalRevision: 1 }).success, false);
});
test('UTC rollover retains old settlements, twelve months of history and protection against clock rollback', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-usage-calendar-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'usage.json'); let now = new Date('2026-12-31T23:59:59Z');
  const store = createUsageStore(filename, () => now);
  await store.setLimit({ monthlyLimit: 1, originalRevision: 0 }); const previous = await store.reserve('openai', 'old');
  now = new Date('2027-01-01T00:00:00Z');
  assert.equal((await store.snapshot()).attempts, 0); assert.equal((await store.snapshot()).resetsAt, '2027-02-01T00:00:00.000Z');
  const current = await store.reserve('anthropic', 'new'); await store.finish(previous, 'completed', tokens, 50);
  assert.equal((await store.snapshot()).totalTokens, 0); await store.finish(current, 'failed', null, 20);
  now = new Date('2026-12-01T00:00:00Z'); await assert.rejects(store.reserve('openai', 'rollback'), { status: 409 });
  for (let month = 1; month <= 13; month++) { now = new Date(Date.UTC(2027, month, 1)); await store.reserve('ollama', 'local'); }
  const state = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(state.attempts.length, 12); assert.ok(state.attempts.every((entry: { startedAt: string }) => entry.startedAt >= '2027-03'));
});
test('corrupt or unwritable ledgers fail closed and keep existing data intact', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-usage-corrupt-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'usage.json'); await writeFile(filename, '{broken-private-ledger');
  const store = createUsageStore(filename);
  await assert.rejects(store.reserve('openai', 'test'), { status: 503 });
  await assert.rejects(store.setLimit({ monthlyLimit: 1, originalRevision: 0 }), { status: 503 });
  assert.equal(await readFile(filename, 'utf8'), '{broken-private-ledger');
  await assert.rejects(createUsageStore(path.join(filename, 'child.json')).reserve('openai', 'test'), { status: 503 });
});
test('the shared demo fixture reproduces server counts and never invents tokens for unknown usage', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../shared/fixtures/usage-demo.json', import.meta.url), 'utf8'));
  const attempts = fixture.attempts.map((entry: unknown) => usageAttemptSchema.parse(entry));
  assert.deepEqual(summarizeUsage(attempts, 100, 0, new Date(fixture.now)), fixture.snapshot);
  assert.equal(fixture.snapshot.totalTokens, 3950); assert.equal(fixture.snapshot.tokensReportedFor, 3);
});
test('HTTP coaching enforces reservations, consent and cooldown while recording rejected model usage', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-usage-http-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const usage = createUsageStore(path.join(directory, 'usage.json'), () => instant);
  let time = instant.getTime(); let modelCalls = 0; let invalid = false;
  const originalFetch = globalThis.fetch; const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  context.after(() => { globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('http://127.0.0.1')) return originalFetch(input, init);
    modelCalls++;
    return Response.json({ ...providerEnvelope('openai', JSON.stringify({ factIds: ['coverage'], suggestions: ['Keep collecting observations.'] })),
      status: invalid ? 'incomplete' : 'completed', usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 } });
  };
  const app = express(); app.use(express.json());
  app.use('/api/ai', createCoachRouter({ usage, now: () => time,
    analytics: async () => summarizeSleep([], [], 'UTC'), journal: { list: async () => [] }, generate: generateCoaching }));
  const errors: ErrorRequestHandler = (error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { message: error.message } });
  app.use(errors);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}/api/ai`;
  const post = (route: string, body: object) => fetch(`${origin}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const input = { provider: 'openai', shareSummary: true, side: 'left', days: 30, question: 'Synthetic question' };
  assert.equal((await post('coach', { ...input, shareSummary: false })).status, 400);
  assert.equal(modelCalls, 0); assert.equal((await usage.snapshot()).attempts, 0);
  assert.equal((await post('usage/limit', { monthlyLimit: 2, originalRevision: 0 })).status, 200);
  assert.equal((await post('coach', input)).status, 200);
  assert.equal((await post('coach', input)).status, 429); assert.equal(modelCalls, 1);
  time += 30000; invalid = true; assert.equal((await post('coach', input)).status, 502);
  const snapshot = await (await fetch(`${origin}/usage`)).json();
  assert.equal(snapshot.attempts, 2); assert.equal(snapshot.completed, 1); assert.equal(snapshot.failed, 1);
  assert.equal(snapshot.totalTokens, 300); assert.equal(snapshot.tokensReportedFor, 2);
  time += 30000; assert.equal((await post('coach', { ...input, side: 'right' })).status, 429); assert.equal(modelCalls, 2);
  assert.equal((await post('coach', { ...input, provider: 'rules', shareSummary: false })).status, 200);
  assert.equal((await post('usage/limit', { monthlyLimit: 5, originalRevision: 0 })).status, 409);
  assert.equal((await post('usage/limit', { monthlyLimit: 5.5, originalRevision: 1 })).status, 400);
  const stored = await readFile(path.join(directory, 'usage.json'), 'utf8');
  assert.equal(stored.includes('Synthetic question'), false); assert.equal(stored.includes('Keep collecting'), false);
});

test('reservation and settlement storage failures never trigger retries and local calculations stay available', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-usage-storage-')); context.after(() => rm(directory, { recursive: true, force: true }));
  for (const phase of ['reserve', 'finish'] as const) {
    const store = createUsageStore(path.join(directory, phase + '.json'), () => instant);
    const broken = { ...store, [phase]: async () => { throw Object.assign(new Error('Storage unavailable'), { status: 503 }); } };
    let sent = 0;
    const app = express(); app.use(express.json()); app.use('/api/ai', createCoachRouter({ usage: broken,
      analytics: async () => summarizeSleep([], [], 'UTC'), journal: { list: async () => [] },
      availability: () => [{ provider: 'openai', configured: true, model: 'test', sendsDataOffPod: true }],
      generate: async (provider, analytics, question) => { if (provider !== 'rules') sent++; return generateCoaching('rules', analytics, question); },
    }));
    const errors: ErrorRequestHandler = (error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { message: error.message } });
    app.use(errors); const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const send = (provider: string) => fetch(`http://127.0.0.1:${address.port}/api/ai/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, shareSummary: true, side: 'left', days: 30 }) });
    assert.equal((await send('openai')).status, 503); assert.equal(sent, phase === 'finish' ? 1 : 0);
    assert.equal((await store.snapshot()).attempts, sent); assert.equal((await store.snapshot()).pending, sent);
    assert.equal((await send('rules')).status, 200);
  }
});
