
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="6d3e7ba7-61bb-56e5-8331-adea32e06762")}catch(e){}}();
export function median(values) {
    const sorted = values.filter(Number.isFinite).sort((first, second) => first - second);
    if (!sorted.length)
        return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
// Compare complete five-minute windows with an equal-weight daily baseline, never a medical threshold.
export function summarizeAutopilotSignals(history, recent, now) {
    const daily = new Map();
    for (const sample of history) {
        if (sample.timestamp * 1000 > now - 86400_000 || sample.timestamp * 1000 < now - 29 * 86400_000
            || sample.heart_rate === null || !Number.isFinite(sample.heart_rate) || sample.heart_rate < 30 || sample.heart_rate > 90)
            continue;
        const day = Math.floor(sample.timestamp / 86400);
        daily.set(day, [...(daily.get(day) ?? []), sample.heart_rate]);
    }
    const dayMedians = [...daily.values()].filter(values => values.length >= 12).map(values => median(values));
    const baseline = median(dayMedians);
    const samples = [...new Map(recent.filter(sample => Number.isFinite(sample.timestamp) && sample.timestamp * 1000 <= now)
            .map(sample => [sample.timestamp, sample])).values()].sort((first, second) => first.timestamp - second.timestamp).slice(-2);
    const latest = samples[samples.length - 1];
    const status = { state: 'learning',
        reason: 'Learning a Pod baseline: needs seven days with at least an hour of readings each.',
        latestHeartRate: latest?.heart_rate ?? null, baselineHeartRate: baseline, baselineDays: dayMedians.length,
        sampleAt: latest ? (latest.timestamp + 300) * 1000 : null, snoring: 'unavailable' };
    const valid = samples.length === 2 && samples.every(sample => sample.heart_rate !== null && Number.isFinite(sample.heart_rate)
        && sample.heart_rate >= 30 && sample.heart_rate <= 90 && (sample.timestamp + 300) * 1000 <= now)
        && samples[1].timestamp - samples[0].timestamp === 300
        && now - (samples[1].timestamp + 300) * 1000 <= 360_000;
    if (!valid)
        return { ...status, state: 'stale', reason: 'Waiting for two fresh, complete five-minute Pod vital windows.' };
    if (dayMedians.length < 7 || baseline === null)
        return status;
    const deltas = samples.map(sample => sample.heart_rate - baseline);
    if (deltas.every(value => Math.abs(value) >= Math.max(10, baseline * 0.2)) && Math.sign(deltas[0]) === Math.sign(deltas[1])) {
        return { ...status, state: 'review', reason: 'Estimated heart rate differs from your Pod baseline in two windows. '
                + 'Holding extra adjustments; review the reading. This is not a diagnosis.' };
    }
    return { ...status, state: 'ready', reason: 'Fresh Pod estimates are within the learned comparison range.' };
}
//# sourceMappingURL=signals.js.map
//# debugId=6d3e7ba7-61bb-56e5-8331-adea32e06762
