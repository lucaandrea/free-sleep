import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useJournalDrafts } from '../src/pages/Platform/journalDrafts.ts';

test('journal drafts and active saves remain isolated across navigation and late saves preserve newer notes', () => {
  const workspace = useJournalDrafts.getState();
  const entry = { date: '2000-01-02', side: 'left', notes: 'Before', restfulness: 3,
    comfort: 'comfortable', caffeine: false, alcohol: false, exercise: true };
  const key = 'pod|left|2000-01-02';
  workspace.put(key, entry);
  assert.equal(useJournalDrafts.getState().drafts['pod|right|2000-01-02'], undefined);
  assert.equal(useJournalDrafts.getState().drafts['other|left|2000-01-02'], undefined);
  assert.equal(workspace.beginSave(key), true);
  assert.equal(useJournalDrafts.getState().beginSave(key), false);
  workspace.put(key, { ...entry, notes: 'Newer draft' });
  workspace.clear(key, entry);
  assert.equal(useJournalDrafts.getState().drafts[key].notes, 'Newer draft');
  workspace.finishSave(key);
  assert.equal(useJournalDrafts.getState().saving[key], undefined);
  workspace.clear(key);
  assert.equal(useJournalDrafts.getState().drafts[key], undefined);
});
