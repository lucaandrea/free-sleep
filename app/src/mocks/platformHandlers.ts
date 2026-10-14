import { http, HttpResponse } from 'msw/http';
import { summarizeSleep } from '../../../server/src/analytics/summary';

const anchor = Date.parse('2026-10-13T06:00:00Z') / 1000;
const records = Array.from({ length: 14 }, (_, index) => {
  const start = anchor - (13 - index) * 86400;
  const end = start + [450, 480, 420, 510, 465, 500, 470][index % 7] * 60;
  return { id: index + 1, side: 'left', entered_bed_at: start, left_bed_at: end, times_exited_bed: index % 3,
    present_intervals: JSON.stringify([[start, end]]) };
});
const vitals = records.flatMap(record => Array.from({ length: 80 }, (_, index) => ({
  timestamp: record.entered_bed_at + index * 300, heart_rate: 54 + index % 8, hrv: 40 + index % 12, breathing_rate: 14 + index % 3,
})));
const journalEntries: import('../../../server/src/analytics/journal').JournalEntry[] = [];
const analytics = summarizeSleep(records, vitals, 'America/Los_Angeles');
let position = { head: 0, feet: 0 };
const status = () => ({ state: 'connected', position: { left: position, right: position }, updatedAt: Date.now(),
  stale: false, busy: false, independentControl: false, experimental: true, error: null });

export const platformHandlers = [
  http.get('/api/journal', () => HttpResponse.json({ entries: journalEntries, patterns: { associations: [],
    note: 'Self-reported habits are associations, not causes. Each comparison needs at least five recorded nights in both groups.' } })),
  http.post('/api/journal', async ({ request }) => {
    const entry = await request.json() as (typeof journalEntries)[number];
    const index = journalEntries.findIndex(item => item.date === entry.date && item.side === entry.side);
    if (index >= 0) journalEntries.splice(index, 1);
    journalEntries.push(entry);
    return HttpResponse.json(entry);
  }),
  http.get('/api/analytics', () => HttpResponse.json(analytics)),
  http.get('/api/base', () => HttpResponse.json(status())),
  http.post('/api/base/connect', () => HttpResponse.json(status())),
  http.post('/api/base/position', async ({ request }) => {
    const input = await request.json() as { head: number; feet: number };
    position = { head: input.head, feet: input.feet };
    return HttpResponse.json(status());
  }),
  http.post('/api/base/stop', () => HttpResponse.json(status())),
  http.get('/api/ai/providers', () => HttpResponse.json([{ provider: 'rules', model: 'Deterministic insights', configured: true }])),
  http.post('/api/ai/coach', () => HttpResponse.json({ headline: 'A steadier rhythm is taking shape', model: 'Demo insights', provider: 'rules',
    observations: ['Your sample nights show an average of about eight hours of bed presence.'],
    suggestions: ['Try keeping your wind-down time consistent for another week.'],
    limitations: ['This is sample data. Bed presence is not measured sleep.'] })),
  http.get('/api/integrations/homekit', () => HttpResponse.json({ enabled: false, running: false, pairingCode: null, error: null })),
];
