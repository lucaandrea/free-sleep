import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { authenticateAPI } from '../src/setup/authentication.js';
import { generateCoaching } from '../src/ai/coach.js';
import { summarizeSleep } from '../src/analytics/summary.js';
import { coverageRecord } from './fixtures/coverage.js';
const analytics = summarizeSleep([coverageRecord('2026-10-14', 987654)], [], 'UTC');
const coaching = { headline: 'A routine to observe', observations: ['No records yet.'], suggestions: [], limitations: ['Presence is not sleep.'] };

test('all provider adapters send aggregates, no device tools, and validate their response contracts', async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const provider of ['openai', 'gemini', 'anthropic', 'ollama'] as const) {
    const key = provider === 'ollama' ? 'OLLAMA_BASE_URL' : `${provider.toUpperCase()}_API_KEY`;
    const prior = process.env[key]; process.env[key] = provider === 'ollama' ? 'http://localhost:11434' : 'test-only-key';
    context.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    let sent: Record<string, unknown> = {};
    globalThis.fetch = async (_url, request) => {
      sent = JSON.parse(String(request?.body));
      const output = JSON.stringify(coaching);
      const payload = provider === 'openai' ? { output: [{ content: [{ type: 'output_text', text: output }] }] }
        : provider === 'anthropic' ? { content: [{ type: 'text', text: output }] }
        : provider === 'gemini' ? { candidates: [{ content: { parts: [{ text: output }] } }] }
        : { message: { content: output } };
      return Response.json(payload);
    };
    const result = await generateCoaching(provider, analytics, 'How consistent is my routine?');
    assert.equal(result.headline, coaching.headline);
    assert.equal('tools' in sent, false);
    assert.equal(JSON.stringify(sent).includes('"episodes"'), false);
    const messages = sent.messages as { role: string; content: string }[] | undefined;
    const contents = sent.contents as { parts: { text: string }[] }[] | undefined;
    const aggregate = JSON.parse(String(sent.input ?? contents?.[0].parts[0].text ?? messages?.find(message => message.role === 'user')?.content));
    assert.equal(aggregate.summary.periodEnding, '2026-10-14');
    assert.equal(aggregate.summary.weeklyChangeMinutes, null);
    assert.equal(aggregate.quality.coverage.recent.presenceNights, 1);
    assert.equal(aggregate.quality.coverage.previous.presenceNights, 0);
    assert.equal('days' in aggregate.quality.coverage.recent, false);
    assert.equal('from' in aggregate.quality.coverage.recent, false);
    assert.equal(JSON.stringify(aggregate).includes('987654'), false);
    if (provider === 'openai') assert.equal(sent.store, false);
    globalThis.fetch = async () => Response.json({ message: { content: '{"headline":"incomplete"}' } });
    await assert.rejects(generateCoaching(provider, analytics, 'test'));
  }
});

test('API token protects browser and remote writes while preserving known loopback readers', async context => {
  const previous = process.env.FREE_SLEEP_API_TOKEN; process.env.FREE_SLEEP_API_TOKEN = 'test-only-secret';
  context.after(() => { if (previous === undefined) delete process.env.FREE_SLEEP_API_TOKEN; else process.env.FREE_SLEEP_API_TOKEN = previous; });
  const app = express(); app.use('/api', authenticateAPI); app.use('/api', (_request, response) => response.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(`${origin}/api/base`)).status, 401);
  assert.equal((await fetch(`${origin}/api/base`, { headers: { Authorization: 'test-only-secret' } })).status, 401);
  assert.equal((await fetch(`${origin}/api/base`, { headers: { Authorization: 'Bearer test-only-secret' } })).status, 200);
  assert.equal((await fetch(`${origin}/api/deviceStatus`)).status, 200);
  assert.equal((await fetch(`${origin}/api/deviceStatus`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${origin}/api/deviceStatus`, { headers: { Origin: 'https://example.com' } })).status, 401);
});
