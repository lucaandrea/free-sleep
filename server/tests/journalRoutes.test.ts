import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createJournalStore, type JournalEntry } from '../src/analytics/journal.js';
import { journalResponse, journalRouter, journalQuery } from '../src/analytics/journalRouter.js';
import { summarizeSleep } from '../src/analytics/summary.js';

const entry: JournalEntry = { date: '2000-01-02', side: 'left', restfulness: 4, comfort: 'warm',
  caffeine: true, alcohol: false, exercise: true, notes: 'An older saved note' };
const analytics = summarizeSleep([], [], 'America/Los_Angeles');
test('selected check-ins stay independent of the trend range and isolate the bed side', () => {
  const records = [entry, { ...entry, side: 'right' as const, notes: 'Partner note' }];
  const query = journalQuery.parse({ side: 'left', days: 7, date: entry.date });
  const response = journalResponse(records, query, analytics, Date.parse('2026-10-14T06:00:00Z'));
  assert.equal(response.selectedDate, entry.date); assert.deepEqual(response.selected, entry);
  assert.deepEqual(response.entries, []); assert.equal(response.patterns.recordedCheckIns, 0);
  const absent = journalResponse(records, { ...query, date: '2000-01-03' }, analytics);
  assert.equal(absent.selected, null);
  assert.equal(journalResponse(records, { ...query, side: 'right' }, analytics).selected?.notes, 'Partner note');
});
test('journal HTTP reads old dates, validates date/range before loading, and round-trips edits', async context => {
  const folder = await mkdtemp(path.join(tmpdir(), 'free-sleep-journal-http-'));
  context.after(() => rm(folder, { recursive: true, force: true }));
  const store = createJournalStore(path.join(folder, 'journal.json'));
  await store.save(entry); await store.save({ ...entry, side: 'right', notes: 'Partner note' });
  let loads = 0;
  const app = express(); app.use(express.json());
  app.use('/api/journal', journalRouter(store, async () => { loads++; return analytics; }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/journal`;
  for (const query of ['side=both', 'days=6', 'date=2026-02-30', 'date=bad', 'date=2000-01-02&date=2000-01-03']) {
    assert.equal((await fetch(`${url}?${query}`)).status, 400);
  }
  assert.equal(loads, 0);
  const response = await (await fetch(`${url}?side=left&days=7&date=${entry.date}`)).json();
  assert.equal(response.selected.notes, entry.notes); assert.equal(response.selectedDate, entry.date);
  const saved = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...entry, notes: '  Edited  ' }) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).notes, 'Edited');
  assert.equal((await store.list()).find(record => record.side === 'right')?.notes, 'Partner note');
  assert.equal((await (await fetch(`${url}?side=left&days=7&date=${entry.date}`)).json()).selected.notes, 'Edited');
  assert.equal((await (await fetch(`${url}?side=left&date=2000-01-03`)).json()).selected, null);
});
