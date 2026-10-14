import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJournalStore, journalSchema, journalPatterns, JournalEntry } from '../src/analytics/journal.js';
import { summarizeSleep } from '../src/analytics/summary.js';
const entry: JournalEntry = { date: '2026-10-13', side: 'left', restfulness: 3, comfort: 'comfortable', caffeine: false, alcohol: false, exercise: true, notes: '' };
test('journal validates calendar dates, enums and bounded notes', () => {
  assert.equal(journalSchema.safeParse({ ...entry, date: '2026-02-30' }).success, false);
  assert.equal(journalSchema.safeParse({ ...entry, restfulness: 6 }).success, false);
  assert.equal(journalSchema.safeParse({ ...entry, notes: 'x'.repeat(501) }).success, false);
});
test('journal concurrent writes preserve both sides, upsert dates and keep corrupt data intact', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-journal-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'journal.json');
  const store = createJournalStore(filename);
  await Promise.all([store.save(entry), store.save({ ...entry, side: 'right' })]);
  await store.save({ ...entry, restfulness: 5 });
  assert.equal((await store.list()).length, 2);
  assert.equal((await store.list()).find(item => item.side === 'left')?.restfulness, 5);
  await store.remove('left', entry.date); assert.equal((await store.list())[0].side, 'right');
  await writeFile(filename, 'corrupted');
  await assert.rejects(store.save(entry));
  assert.equal(await readFile(filename, 'utf8'), 'corrupted');
});
test('habit associations require five observed nights in each group and ignore unmatched dates', () => {
  const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
  const records = Array.from({ length: 10 }, (_, index) => {
    const entered = start + index * 86400, left = entered + (index < 5 ? 360 : 480) * 60;
    return { id: index, side: 'left', entered_bed_at: entered, left_bed_at: left, present_intervals: JSON.stringify([[entered, left]]), times_exited_bed: 0 };
  });
  const analytics = summarizeSleep(records, [], 'UTC');
  const entries = analytics.nights.map((night, index) => ({ ...entry, date: night.date, caffeine: index < 5 }));
  assert.equal(journalPatterns(entries.slice(1), analytics).associations.length, 0);
  const result = journalPatterns(entries, analytics).associations[0];
  assert.equal(result.habit, 'caffeine'); assert.equal(result.presenceDifferenceMinutes, -120);
});
