import { readFile, writeFile } from 'node:fs/promises';
import { summarizeUsage, type UsageAttempt } from '../src/ai/usageContract.js';
const now = '2026-10-14T12:00:00.000Z';
const attempts: UsageAttempt[] = [
  { id: '10000000-0000-4000-8000-000000000001', provider: 'openai', model: 'Demo model · no external calls', startedAt: now,
    outcome: 'completed', elapsedMilliseconds: 800, tokens: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 } },
  { id: '10000000-0000-4000-8000-000000000002', provider: 'gemini', model: 'Demo Flash', startedAt: now,
    outcome: 'completed', elapsedMilliseconds: 950, tokens: { inputTokens: 1000, outputTokens: 250, totalTokens: 1250 } },
  { id: '10000000-0000-4000-8000-000000000003', provider: 'openai', model: 'Demo model · no external calls', startedAt: now,
    outcome: 'failed', elapsedMilliseconds: 500, tokens: null },
  { id: '10000000-0000-4000-8000-000000000004', provider: 'ollama', model: 'Demo local model', startedAt: now,
    outcome: 'completed', elapsedMilliseconds: 2000, tokens: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 } },
];
const fixture = { now, attempts, snapshot: summarizeUsage(attempts, 100, 0, new Date(now)) };
const filename = new URL('../../shared/fixtures/usage-demo.json', import.meta.url);
const output = JSON.stringify(fixture, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile(filename, 'utf8') !== output) throw new Error('Shared usage fixture is stale.');
  console.log('Shared usage fixture matches the server contract.');
} else await writeFile(filename, output);
