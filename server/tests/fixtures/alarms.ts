import { SettingsSchema } from '../../src/db/settingsSchema.js';
import { SideScheduleSchema, type Schedules } from '../../src/db/schedulesSchema.js';

export function alarmFixture() {
  const tap = { type: 'temperature', change: 'increment', amount: 1 };
  const side = { name: 'Side', awayMode: false, taps: { doubleTap: tap, tripleTap: tap, quadTap: tap },
    scheduleOverrides: { temperatureSchedules: { disabled: false, expiresAt: '' }, alarm: { disabled: false, timeOverride: '', expiresAt: '' } } };
  const settings = SettingsSchema.parse({ id: 'test', timeZone: 'UTC', temperatureFormat: 'fahrenheit', rebootDaily: false,
    primePodDaily: { enabled: false, time: '14:00' }, left: side, right: side });
  const daily = { temperatures: {}, power: { on: '22:00', off: '09:00', onTemperature: 80, enabled: false },
    alarm: { enabled: true, time: '07:00', vibrationIntensity: 20, duration: 30, vibrationPattern: 'rise', alarmTemperature: 82 } };
  const week = SideScheduleSchema.parse(Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(day => [day, structuredClone(daily)])));
  const schedules: Schedules = { left: structuredClone(week), right: structuredClone(week) };
  schedules.left.tuesday.power.enabled = true;
  return { settings, schedules };
}
