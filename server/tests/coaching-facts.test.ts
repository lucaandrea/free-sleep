import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachingFacts, factsForModel } from '../src/ai/facts.js';
import { resolveModelCoaching } from '../src/ai/modelContract.js';
import { providerOutput } from '../src/ai/providerOutput.js';
import { generateCoaching, localInsights } from '../src/ai/coach.js';
import { summarizeSleep } from '../src/analytics/summary.js';
import { journalPatterns, type JournalEntry } from '../src/analytics/journal.js';
import { coverageCases, coverageRecord } from './fixtures/coverage.js';
import { providerEnvelope } from './fixtures/coaching.js';

test('computed receipts match their observations and preserve sparse calendar boundaries', () => {
  for (const { records, vitals, timeZone } of coverageCases) {
    const analytics = summarizeSleep(records, vitals, timeZone);
    const local = localInsights(analytics);
    assert.deepEqual(local.grounding.facts.map(fact => fact.observation), local.observations);
    assert.equal(local.grounding.facts.some(fact => fact.id === 'weekly-presence-change'), analytics.quality.coverage.comparisonAvailable);
    assert.ok(local.grounding.facts.every(fact => fact.context.includes(timeZone)));
  }
  const records = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-08', '2026-10-09', '2026-10-14']
    .map((date, index) => coverageRecord(date, index, index < 3 ? 360 : 480));
  const facts = coachingFacts(summarizeSleep(records, [], 'UTC'));
  const change = facts.find(fact => fact.id === 'weekly-presence-change')!;
  assert.match(change.observation, /\+120 minutes/);
  assert.equal(change.sample, '3 recent and 3 previous nights with known presence');
  assert.equal(change.context, '2026-10-08 → 2026-10-14 · UTC · Previous: 2026-10-01 → 2026-10-07');
  assert.equal(facts.some(fact => fact.id === 'hrv'), false);
});
test('eligible vitals and self-reported habits produce distinct noncausal receipts', () => {
  const records = Array.from({ length: 10 }, (_, index) => coverageRecord(`2026-10-${String(index + 1).padStart(2, '0')}`, index, index < 5 ? 420 : 480));
  const entries: JournalEntry[] = records.map((record, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, '0')}`, side: 'left', restfulness: 3, comfort: index < 7 ? 'warm' : 'cold',
    caffeine: index >= 5, alcohol: false, exercise: false, notes: 'Private note never sent.',
  }));
  const vitals = records.map(record => ({ timestamp: record.entered_bed_at + 60, heart_rate: 60, hrv: 999, breathing_rate: 15 }));
  const analytics = summarizeSleep(records, vitals, 'UTC');
  const facts = coachingFacts(analytics, journalPatterns(entries, analytics));
  assert.equal(facts.find(fact => fact.id === 'heart-rate')?.sample, '7 nights with eligible readings');
  assert.equal(facts.some(fact => fact.id === 'hrv'), false);
  assert.match(facts.find(fact => fact.id === 'warm-checkins')!.observation, /4 of your latest 7 matching check-ins/);
  assert.match(facts.find(fact => fact.id === 'habit-caffeine')!.observation, /\+60 minutes/);
  assert.match(facts.find(fact => fact.id === 'habit-caffeine')!.observation, /not a cause/);
  assert.equal(facts.find(fact => fact.id === 'habit-caffeine')?.sample, '5 with and 5 without the reported habit');
  assert.equal(JSON.stringify(factsForModel(facts)).includes('Private note'), false);
});
test('model selection cannot create, duplicate, rename or rewrite an observation', () => {
  const facts = coachingFacts(summarizeSleep([coverageRecord('2026-10-14', 1)], [], 'UTC'));
  const selected = resolveModelCoaching(JSON.stringify({ factIds: ['coverage', 'bed-presence'], suggestions: ['  Try one change.  '] }), facts);
  assert.deepEqual(selected.facts.map(fact => fact.id), ['coverage', 'bed-presence']);
  assert.equal(selected.suggestions[0], 'Try one change.');
  for (const output of [
    { factIds: ['weekly-presence-change'], suggestions: ['Try one change.'] },
    { factIds: ['bed-presence', 'bed-presence'], suggestions: ['Try one change.'] },
    { factIds: [], suggestions: ['Try one change.'] },
    { factIds: ['bed-presence'], suggestions: [' '] },
    { factIds: ['bed-presence'], suggestions: ['x'.repeat(601)] },
    { factIds: ['bed-presence'], suggestions: ['x'], observations: ['You slept eight hours.'] },
    { factIds: ['bed-presence'], suggestions: ['x'], headline: 'A diagnosis' },
    { factIds: ['bed-presence'], suggestions: ['x'], limitations: [] },
  ]) assert.throws(() => resolveModelCoaching(JSON.stringify(output), facts));
  assert.throws(() => resolveModelCoaching('not JSON', facts));
});
test('truncation, refusal and blocked responses cannot publish even a syntactically valid selection', () => {
  const valid = '{"factIds":["coverage"],"suggestions":["Keep collecting observations."]}';
  const failures: ['openai' | 'anthropic' | 'gemini' | 'ollama', object][] = [
    ['openai', { ...providerEnvelope('openai', valid), status: 'incomplete' }],
    ['openai', { status: 'completed', output: [{ type: 'message', status: 'incomplete', content: [{ type: 'output_text', text: valid }] }] }],
    ['openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', text: valid }] }] }],
    ['anthropic', { ...providerEnvelope('anthropic', valid), stop_reason: 'max_tokens' }],
    ['anthropic', { ...providerEnvelope('anthropic', valid), stop_reason: 'refusal' }],
    ['gemini', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: valid }] } }] }],
    ['gemini', { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }],
    ['ollama', { ...providerEnvelope('ollama', valid), done: false }],
    ['ollama', { ...providerEnvelope('ollama', valid), done_reason: 'length' }],
  ];
  for (const [provider, payload] of failures) assert.throws(() => providerOutput(provider, payload), { status: 502 });
  assert.equal(providerOutput('gemini', { candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: 'Private reasoning', thought: true }, { text: valid },
  ] } }] }), valid);
});
test('malformed and oversized provider bodies fail without leaking response text or retrying', async context => {
  const previousFetch = globalThis.fetch; const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  context.after(() => { globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  const analytics = summarizeSleep([], [], 'UTC');
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('private invalid response text'); };
  await assert.rejects(generateCoaching('openai', analytics, ''), error =>
    error instanceof Error && error.message.includes('invalid response') && !error.message.includes('private'));
  assert.equal(requests, 1);
  let cancelled = false;
  globalThis.fetch = async () => { requests++; return new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(100001)); }, cancel() { cancelled = true; },
  })); };
  await assert.rejects(generateCoaching('openai', analytics, ''), /size limit/);
  assert.equal(cancelled, true);
  assert.equal(requests, 2);
});
