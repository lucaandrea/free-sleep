import moment from 'moment-timezone';
import { http, HttpResponse } from 'msw/http';
import { getSchedules, getSettings } from './mockData';
import { AlarmChangeSchema } from '../../../server/src/alarms/schema';
import { buildAlarmPreview, changeAlarmFromPreview } from '../../../server/src/alarms/overrides';
import { getDayIndexForSchedule } from '../../../server/src/jobs/scheduleTiming';
import { SideSchema, type Side, type DayOfWeek } from '../../../server/src/db/schedulesSchema';
import type { AlarmOccurrence } from '../../../server/src/alarms/types';

// Calendar-only demo recurrence avoids importing the Node scheduler into a browser bundle.
function demoPreview(side: Side) {
  const settings = getSettings();
  const now = moment.tz(settings.timeZone);
  const candidates: AlarmOccurrence[] = [];
  for (const [day, daily] of Object.entries(getSchedules()[side])) {
    if (!daily.power.enabled || !daily.alarm.enabled) continue;
    const weekday = getDayIndexForSchedule(day as DayOfWeek, daily.alarm.time, daily.power.on);
    for (let offset = 0; offset <= 7; offset++) {
      const date = now.clone().add(offset, 'days');
      if (date.day() !== weekday) continue;
      const candidate = moment.tz(`${date.format('YYYY-MM-DD')} ${daily.alarm.time}`, 'YYYY-MM-DD HH:mm', settings.timeZone);
      if (candidate.valueOf() > now.valueOf()) candidates.push({
        at: candidate.toISOString(), time: daily.alarm.time, scheduleDay: day as DayOfWeek, source: 'routine',
      });
    }
  }
  const next = candidates.sort((first, second) => first.at.localeCompare(second.at))[0] ?? null;
  return buildAlarmPreview(settings, side, next, now.valueOf());
}

export const alarmHandlers = [
  http.get('/api/alarm/next', ({ request }) => {
    const side = SideSchema.safeParse(new URL(request.url).searchParams.get('side'));
    return side.success ? HttpResponse.json(demoPreview(side.data))
      : HttpResponse.json({ error: { message: 'Choose a valid bed side.' } }, { status: 400 });
  }),
  http.post('/api/alarm/override', async ({ request }) => {
    const input = AlarmChangeSchema.safeParse(await request.json());
    if (!input.success) return HttpResponse.json({ error: { message: 'Choose a valid alarm action and time.' } }, { status: 400 });
    try {
      const settings = getSettings();
      settings[input.data.side].scheduleOverrides.alarm = changeAlarmFromPreview(settings, input.data, demoPreview(input.data.side));
      return HttpResponse.json(demoPreview(input.data.side));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change the demo alarm.';
      return HttpResponse.json({ error: { message } }, { status: 409 });
    }
  }),
];
