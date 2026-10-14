import { z } from 'zod';
import { TIME_ZONES } from '../db/timeZones.js';
import type { Settings } from '../db/settingsSchema.js';
import { TimeSchema } from '../db/schedulesSchema.js';

const side = z.object({ name: z.string().min(1).max(20), awayMode: z.boolean() }).strict();
export const PreferencesSchema = z.object({
  timeZone: z.enum(TIME_ZONES), temperatureFormat: z.enum(['fahrenheit', 'celsius']),
  left: side, right: side, primePodDaily: z.object({ enabled: z.boolean(), time: TimeSchema }).strict(), rebootDaily: z.boolean(),
}).strict();
export type PodPreferences = z.infer<typeof PreferencesSchema>;
export const PreferenceChangeSchema = z.object({
  podID: z.string().min(1), expected: PreferencesSchema, preferences: PreferencesSchema,
}).strict().refine(value => value.preferences.left.name.trim().length > 0 && value.preferences.right.name.trim().length > 0,
  'Give each side a name.');
export type PreferenceChange = z.infer<typeof PreferenceChangeSchema>;
export class PreferenceConflict extends Error {}
export const preferenceSnapshot = (settings: Settings) => ({ podID: settings.id, timeZones: TIME_ZONES,
  preferences: PreferencesSchema.parse({ timeZone: settings.timeZone, temperatureFormat: settings.temperatureFormat,
    left: { name: settings.left.name, awayMode: settings.left.awayMode },
    right: { name: settings.right.name, awayMode: settings.right.awayMode },
    primePodDaily: settings.primePodDaily, rebootDaily: settings.rebootDaily }) });

// Compare only edited fields, retaining other clients' changes and all schedules, tap settings and identity.
export function applyPreferences(settings: Settings, input: PreferenceChange): Settings {
  const next = structuredClone(settings);
  if (settings.id !== input.podID) throw new PreferenceConflict('This is a different Pod. Reload its settings before saving.');
  const desired = structuredClone(input.preferences);
  desired.left.name = desired.left.name.trim(); desired.right.name = desired.right.name.trim();
  const expected = input.expected;
  const scheduleChanged = desired.primePodDaily.time !== expected.primePodDaily.time
    || desired.primePodDaily.enabled !== expected.primePodDaily.enabled || desired.rebootDaily !== expected.rebootDaily;
  if (scheduleChanged && settings.timeZone !== expected.timeZone) {
    throw new PreferenceConflict('The Pod timezone changed. Reload settings before changing its daily schedule.');
  }
  const choose = <Value>(current: Value, previous: Value, proposed: Value): Value => {
    if (previous === proposed) return current;
    if (current !== previous) throw new PreferenceConflict('An edited setting changed elsewhere. Reload settings and review your changes.');
    return proposed;
  };
  next.timeZone = choose(settings.timeZone, expected.timeZone, desired.timeZone);
  next.temperatureFormat = choose(settings.temperatureFormat, expected.temperatureFormat, desired.temperatureFormat);
  next.rebootDaily = choose(settings.rebootDaily, expected.rebootDaily, desired.rebootDaily);
  for (const side of ['left', 'right'] as const) {
    next[side].name = choose(settings[side].name, expected[side].name, desired[side].name);
    next[side].awayMode = choose(settings[side].awayMode, expected[side].awayMode, desired[side].awayMode);
  }
  next.primePodDaily.enabled = choose(settings.primePodDaily.enabled, expected.primePodDaily.enabled, desired.primePodDaily.enabled);
  next.primePodDaily.time = choose(settings.primePodDaily.time, expected.primePodDaily.time, desired.primePodDaily.time);
  Object.assign(settings, next);
  return settings;
}
