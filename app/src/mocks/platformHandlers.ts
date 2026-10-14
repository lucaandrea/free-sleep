import { http, HttpResponse } from 'msw/http';
import { defaultComfortState } from '../../../server/src/thermal/types';
import type { ComfortStatus, ComfortConfig } from '../../../server/src/thermal/types';
import { DemoSleepHistory } from '../../../server/src/records/demo';
import sleepDemo from '../../../shared/fixtures/sleep-demo.json';
import { localInsights } from '../../../server/src/ai/coach';
const journalEntries: import('../../../server/src/analytics/journal').JournalEntry[] = [];
const sleepHistory = new DemoSleepHistory(sleepDemo);
const isoIntervals = (raw: string) => (JSON.parse(raw) as number[][]).map(interval =>
  interval.map(seconds => new Date(seconds * 1000).toISOString()));
let position = { head: 0, feet: 0 };
const status = () => ({ state: 'connected', position: { left: position, right: position }, updatedAt: Date.now(),
  stale: false, busy: false, independentControl: false, experimental: true, error: null });

const comfortDemo = (): ComfortStatus => ({ config: defaultComfortState().config, offsetF: 0, pausedUntil: null, feedbackThrough: null,
  decision: { reason: 'Adaptive comfort is off.', baselineF: 80, proposedF: 80, eligible: false }, history: [] });
const comfort = { left: comfortDemo(), right: comfortDemo() };
export const platformHandlers = [
  http.get('/api/comfort', ({ request }) => {
    const side = new URL(request.url).searchParams.get('side') === 'right' ? 'right' : 'left';
    return HttpResponse.json(comfort[side]);
  }),
  http.post('/api/comfort', async ({ request }) => {
    const input = await request.json() as { side: 'left' | 'right'; config: ComfortConfig; reset?: boolean };
    const status = comfort[input.side]; status.config = input.config;
    if (input.reset) status.offsetF = 0;
    status.decision.reason = input.config.mode === 'off' ? 'Adaptive comfort is off.' : 'Demo preview. No temperatures will change.';
    status.history.unshift({ at: Date.now(), message: `Adaptive comfort set to ${input.config.mode}.`, targetF: null });
    return HttpResponse.json(status);
  }),
  http.get('/api/journal', ({ request }) => {
    const parameters = new URL(request.url).searchParams;
    const side = parameters.get('side'); const date = parameters.get('date');
    const entries = journalEntries.filter(entry => entry.side === side);
    return HttpResponse.json({ entries, selectedDate: date, selected: entries.find(entry => entry.date === date) ?? null,
      timeZone: 'America/Los_Angeles', patterns: { associations: [],
        note: 'Self-reported habits are associations, not causes. Each comparison needs at least five recorded nights in both groups.' } });
  }),
  http.post('/api/journal', async ({ request }) => {
    const entry = await request.json() as (typeof journalEntries)[number];
    entry.notes = entry.notes.trim();
    const index = journalEntries.findIndex(item => item.date === entry.date && item.side === entry.side);
    if (index >= 0) journalEntries.splice(index, 1);
    journalEntries.push(entry);
    return HttpResponse.json(entry);
  }),
  http.get('/api/analytics', ({ request }) => {
    const parameters = new URL(request.url).searchParams;
    return HttpResponse.json(sleepHistory.analytics(parameters.get('side') ?? 'left', Number(parameters.get('days') ?? 30)));
  }),
  http.get('/api/analytics/episodes/:id', ({ params, request }) => {
    const detail = sleepHistory.detail(new URL(request.url).searchParams.get('side') ?? '', Number(params.id));
    return detail ? HttpResponse.json(detail)
      : HttpResponse.json({ error: { message: 'This sample episode is unavailable.' } }, { status: 404 });
  }),
  http.get('/api/metrics/sleep', ({ request }) => {
    const parameters = new URL(request.url).searchParams;
    const start = Date.parse(parameters.get('startTime') ?? '') / 1000;
    const end = Date.parse(parameters.get('endTime') ?? '') / 1000;
    return HttpResponse.json(sleepHistory.list(parameters.get('side') ?? 'left')
      .filter(record => (!Number.isFinite(start) || record.left_bed_at >= start) && (!Number.isFinite(end) || record.entered_bed_at <= end))
      .map(record => ({ ...record, entered_bed_at: new Date(record.entered_bed_at * 1000).toISOString(),
        left_bed_at: new Date(record.left_bed_at * 1000).toISOString(),
        present_intervals: isoIntervals(record.present_intervals),
        not_present_intervals: isoIntervals(record.not_present_intervals),
      })));
  }),
  http.put('/api/analytics/episodes/:id', async ({ params, request }) => {
    const result = sleepHistory.mutate(Number(params.id), await request.json());
    return result.status === 204 ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ error: { message: result.message } }, { status: result.status });
  }),
  http.delete('/api/analytics/episodes/:id', async ({ params, request }) => {
    const result = sleepHistory.mutate(Number(params.id), await request.json(), true);
    return result.status === 204 ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ error: { message: result.message } }, { status: result.status });
  }),
  http.get('/api/base', () => HttpResponse.json(status())),
  http.post('/api/base/connect', () => HttpResponse.json(status())),
  http.post('/api/base/position', async ({ request }) => {
    const input = await request.json() as { head: number; feet: number };
    position = { head: input.head, feet: input.feet };
    return HttpResponse.json(status());
  }),
  http.post('/api/base/stop', () => HttpResponse.json(status())),
  http.get('/api/ai/providers', () => HttpResponse.json([{ provider: 'rules', model: 'Deterministic insights', configured: true },
    { provider: 'openai', model: 'Demo model · no external calls', configured: true }])),
  http.post('/api/ai/coach', async ({ request }) => {
    const input = await request.json() as { side: string; days: number; provider: string; shareSummary: boolean };
    if (input.provider !== 'rules' && !input.shareSummary) {
      return HttpResponse.json({ error: { message: 'Allow sharing for this simulated request first.' } }, { status: 400 });
    }
    const result = { ...localInsights(sleepHistory.analytics(input.side, input.days)), model: 'Demo insights' };
    return HttpResponse.json({ ...result, provider: input.provider });
  }),
  http.get('/api/integrations/homekit', () => HttpResponse.json({ enabled: false, running: false, pairingCode: null, error: null })),
];
