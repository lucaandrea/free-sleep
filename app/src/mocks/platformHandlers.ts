import { http, HttpResponse } from 'msw/http';
import { defaultComfortState } from '../../../server/src/thermal/types';
import type { ComfortStatus, ComfortConfig } from '../../../server/src/thermal/types';
import sleepDemo from '../../../shared/fixtures/sleep-demo.json';
import type { EpisodeDetail } from '../../../server/src/analytics/episode';
import type { SleepAnalytics } from '../../../server/src/analytics/summary';
const journalEntries: import('../../../server/src/analytics/journal').JournalEntry[] = [];
const analytics: SleepAnalytics = sleepDemo.analytics;
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
  http.get('/api/journal', () => HttpResponse.json({ entries: journalEntries, patterns: { associations: [],
    note: 'Self-reported habits are associations, not causes. Each comparison needs at least five recorded nights in both groups.' } })),
  http.post('/api/journal', async ({ request }) => {
    const entry = await request.json() as (typeof journalEntries)[number];
    const index = journalEntries.findIndex(item => item.date === entry.date && item.side === entry.side);
    if (index >= 0) journalEntries.splice(index, 1);
    journalEntries.push(entry);
    return HttpResponse.json(entry);
  }),
  http.get('/api/analytics', ({ request }) => {
    const days = new URL(request.url).searchParams.get('days') ?? '30';
    return HttpResponse.json((sleepDemo.ranges as Record<string, typeof analytics>)[days] ?? analytics);
  }),
  http.get('/api/analytics/episodes/:id', ({ params, request }) => {
    const detail = (sleepDemo.details as Record<string, EpisodeDetail>)[String(params.id)];
    const side = new URL(request.url).searchParams.get('side');
    if (!detail || !['left', 'right'].includes(side ?? '')) {
      return HttpResponse.json({ error: { message: 'This sample episode is unavailable.' } }, { status: 404 });
    }
    return HttpResponse.json({ ...detail, side });
  }),
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
