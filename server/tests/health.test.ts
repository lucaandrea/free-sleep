import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthPresenceRecord } from '../src/integrations/healthPresenceRecord.js';

const observation = { id: 10, side: 'left', entered_bed_at: 100, left_bed_at: 500,
  present_intervals: '[[50,250],[200,600]]', times_exited_bed: 0 };

test('Health exports retain merged source intervals and signal a valid empty correction', () => {
  assert.deepEqual(healthPresenceRecord(observation), { id: 10, valid: true,
    present_intervals: [['1970-01-01T00:01:40.000Z', '1970-01-01T00:08:20.000Z']] });
  assert.deepEqual(healthPresenceRecord({ ...observation, present_intervals: '[]' }),
    { id: 10, valid: true, present_intervals: [] });
});

test('Damaged Health source records are marked invalid rather than silently emptied', () => {
  for (const present_intervals of ['', 'null', 'broken', '[[200,100]]', '[["100",200]]', '[[100,200],[300]]', '[[100,1e20]]']) {
    assert.deepEqual(healthPresenceRecord({ ...observation, present_intervals }),
      { id: 10, valid: false, present_intervals: [] });
  }
  for (const entered_bed_at of [NaN, Infinity, 1e20, 600]) {
    assert.equal(healthPresenceRecord({ ...observation, entered_bed_at }).valid, false);
  }
});
