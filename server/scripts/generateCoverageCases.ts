import { readFile, writeFile } from 'node:fs/promises';
import { coverageCases } from '../tests/fixtures/coverage.js';
import { summarizeSleep } from '../src/analytics/summary.js';
import { localInsights } from '../src/ai/coach.js';

// Swift tests consume server-computed expectations to catch calendar and coverage drift.
const cases = coverageCases.map(({ name, records, vitals, timeZone }) => {
  const analytics = summarizeSleep(records, vitals, timeZone);
  return { name, analytics, coaching: { ...localInsights(analytics), provider: 'rules', model: 'Demo insights' } };
});
const target = new URL('../../shared/fixtures/coverage-cases.json', import.meta.url);
const content = JSON.stringify(cases, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== content) throw new Error('Regenerate the shared coverage cases.');
  console.log('Shared coverage cases match the analytics contract.');
} else { await writeFile(target, content); console.log('Generated the shared coverage cases.'); }
