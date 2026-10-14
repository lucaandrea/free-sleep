
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="9167a1aa-05ba-558b-91e4-4e0860b2317e")}catch(e){}}();
import moment from 'moment-timezone';
export class AlarmChangeError extends Error {
}
export function overrideAlarmProfile(override, schedules, occurrence, timeZone) {
    // New overrides retain the originating routine; legacy records preserve their historical wake-day fallback.
    const day = override.scheduleDay ?? moment.tz(occurrence, timeZone).format('dddd').toLowerCase();
    return schedules[day]?.alarm ?? { vibrationIntensity: 100, duration: 60, vibrationPattern: 'rise' };
}
export function isCurrentOverride(expected, current, now) {
    return !current.disabled && Date.parse(current.expiresAt) > now && current.expiresAt === expected.expiresAt
        && current.timeOverride === expected.timeOverride && current.scheduledAt === expected.scheduledAt
        && current.scheduleDay === expected.scheduleDay && current.replacedAt === expected.replacedAt && current.revision === expected.revision;
}
export function overrideOccurrence(override, timeZone, now) {
    const expiry = Date.parse(override.expiresAt);
    if (override.disabled || !Number.isFinite(expiry) || expiry <= now)
        return null;
    if (override.scheduledAt) {
        const timestamp = Date.parse(override.scheduledAt);
        return timestamp > now && timestamp < expiry ? new Date(timestamp) : null;
    }
    // Older clients only store a clock time; never queue tomorrow beyond its expiry.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(override.timeOverride))
        return null;
    const [hour, minute] = override.timeOverride.split(':').map(Number);
    const candidate = moment.tz(now, timeZone).hour(hour).minute(minute).second(0).millisecond(0);
    if (candidate.valueOf() <= now)
        candidate.add(1, 'day');
    return candidate.valueOf() < expiry ? candidate.toDate() : null;
}
export function buildAlarmPreview(settings, side, routine, now = Date.now()) {
    const preview = { side, timeZone: settings.timeZone, state: 'none', alarm: null, expiresAt: null, overrideRevision: null };
    if (settings[side].awayMode)
        return { ...preview, state: 'away' };
    const override = settings[side].scheduleOverrides.alarm;
    if (Date.parse(override.expiresAt) > now) {
        const next = overrideOccurrence(override, settings.timeZone, now);
        return { ...preview, state: next ? 'scheduled' : 'paused', expiresAt: override.expiresAt, overrideRevision: override.revision ?? null,
            alarm: next ? { at: next.toISOString(), time: moment.tz(next, settings.timeZone).format('HH:mm'),
                scheduleDay: override.scheduleDay ?? null, source: 'override' } : null };
    }
    return { ...preview, state: routine ? 'scheduled' : 'none', alarm: routine };
}
// Resolve a wall-clock time without silently normalizing a DST gap or choosing a repeated hour.
export function resolveAlarmTime(date, time, timeZone) {
    const localTimestamp = moment.utc(`${date}T${time}:00`, moment.ISO_8601, true).valueOf();
    const zone = moment.tz.zone(timeZone);
    if (!Number.isFinite(localTimestamp) || !zone)
        throw new AlarmChangeError('Choose a valid alarm time and timezone.');
    const day = 86_400_000;
    const offsets = new Set([-day, 0, day].map(offset => zone.utcOffset(localTimestamp + offset)));
    const matches = [...offsets].map(offset => localTimestamp + offset * 60_000)
        .filter(timestamp => moment.tz(timestamp, timeZone).format('YYYY-MM-DD HH:mm') === `${date} ${time}`);
    if (matches.length === 0) {
        throw new AlarmChangeError('That time does not exist on this date because of daylight saving time. Choose another time.');
    }
    if (matches.length !== 1) {
        throw new AlarmChangeError('That time occurs twice on this date because of daylight saving time. Choose a time outside the repeated hour.');
    }
    return matches[0];
}
// Store an absolute occurrence and suppress the replaced routine through the later time.
export function changeAlarmFromPreview(settings, change, preview, now = Date.now()) {
    const previous = settings[change.side].scheduleOverrides.alarm;
    if (change.action === 'restore') {
        if (previous.expiresAt !== change.expectedExpiresAt || Date.parse(previous.expiresAt) <= now
            || (previous.revision !== undefined && previous.revision !== change.expectedRevision)) {
            throw new AlarmChangeError('The alarm changed. Refresh and review it before trying again.');
        }
        return { disabled: false, timeOverride: '', expiresAt: '' };
    }
    if (!preview.alarm || preview.state !== 'scheduled') {
        throw new AlarmChangeError('No upcoming alarm is available to change. Check your routine and Away mode.');
    }
    if (preview.alarm.at !== change.expectedAt)
        throw new AlarmChangeError('The alarm changed. Refresh and review it before trying again.');
    const current = Date.parse(preview.alarm.at);
    const replaced = preview.alarm.source === 'override' ? Date.parse(previous.replacedAt || preview.alarm.at) : current;
    const previousExpiry = Date.parse(preview.expiresAt || '') || 0;
    if (change.action === 'disable') {
        return { disabled: true, timeOverride: '', revision: crypto.randomUUID(),
            expiresAt: new Date(Math.max(current + 120_000, previousExpiry)).toISOString() };
    }
    const candidate = resolveAlarmTime(moment.tz(current, settings.timeZone).format('YYYY-MM-DD'), change.time, settings.timeZone);
    if (candidate <= now)
        throw new AlarmChangeError('Choose a future time on the displayed alarm date.');
    return { disabled: false, timeOverride: change.time, revision: crypto.randomUUID(), scheduledAt: new Date(candidate).toISOString(),
        replacedAt: new Date(replaced).toISOString(), ...(preview.alarm.scheduleDay ? { scheduleDay: preview.alarm.scheduleDay } : {}),
        expiresAt: new Date(Math.max(candidate, replaced) + 120_000).toISOString() };
}
//# sourceMappingURL=overrides.js.map
//# debugId=9167a1aa-05ba-558b-91e4-4e0860b2317e
