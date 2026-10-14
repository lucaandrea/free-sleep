
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="3ad84bd9-5752-5b65-bd3d-30b290b87d1f")}catch(e){}}();
export const PRESENCE_METHOD = 'Mean of known bed-presence durations from the longest episode per wake date, rounded to the nearest minute. '
    + 'Missing or unknown presence is excluded. Presence is not measured sleep.';
export const VARIATION_METHOD = 'Population standard deviation of bed-entry clock times across recorded main episodes, '
    + 'rounded to the nearest minute. Lower values mean more consistent timing; they do not measure sleep quality.';
export const CHANGE_METHOD = 'Recent mean bed presence minus the previous mean, using only known-presence nights. '
    + 'Each period needs at least three. This describes the available records and does not establish a cause.';
// Facts and receipts are calculated before generation; model output can select IDs but cannot rewrite these observations.
export function coachingFacts(analytics, journal) {
    const { summary, timeZone } = analytics;
    const coverage = analytics.quality.coverage;
    const recent = coverage.recent;
    const previous = coverage.previous;
    const context = recent ? `${recent.from} → ${recent.through} · ${timeZone}` : `Selected history · ${timeZone}`;
    const facts = [];
    const add = (id, title, observation, sample, calculation, scope = context) => facts.push({ id, title, observation, context: scope, sample, calculation });
    if (summary.averageOccupiedMinutes !== null)
        add('bed-presence', 'Bed presence', `For the recorded period ending ${summary.periodEnding}, `
            + `average bed presence is ${Math.round(summary.averageOccupiedMinutes)} minutes per recorded night.`, `${recent?.presenceNights ?? 0} nights with known presence`, PRESENCE_METHOD);
    if (summary.bedtimeVariationMinutes !== null)
        add('bedtime-variation', 'Bed-entry consistency', `Bed-entry timing varies by about ${Math.round(summary.bedtimeVariationMinutes)} minutes across recent recorded nights.`, `${recent?.recordedNights ?? 0} recorded nights`, VARIATION_METHOD);
    if (summary.weeklyChangeMinutes !== null && coverage.comparisonAvailable && recent && previous)
        add('weekly-presence-change', 'Weekly presence change', `Average bed presence changed by ${summary.weeklyChangeMinutes > 0 ? '+' : ''}${summary.weeklyChangeMinutes} minutes.`, `${recent.presenceNights} recent and ${previous.presenceNights} previous nights with known presence`, CHANGE_METHOD, `${context} · Previous: ${previous.from} → ${previous.through}`);
    if (!facts.length)
        add('no-presence-summary', 'Limited observations', 'No usable bed-presence records are available for this period.', `${recent?.presenceNights ?? 0} nights with known presence`, 'No presence-duration or timing observation can be produced from the returned records. No missing value is filled with zero.');
    const metrics = [
        ['heart-rate', 'Heart rate', summary.averageHeartRate, 'bpm', recent?.heartRateNights],
        ['hrv', 'HRV estimate', summary.averageHrv, 'ms', recent?.hrvNights],
        ['breathing', 'Breathing estimate', summary.averageRespiratoryRate, 'per minute', recent?.respiratoryRateNights],
    ];
    for (const [id, title, value, unit, count] of metrics) {
        if (value !== null)
            add(id, title, `${title} averaged ${value} ${unit} across eligible recorded nights.`, `${count ?? 0} nights with eligible readings`, 'Mean of the eligible nightly averages during detected presence. Availability does not establish continuous coverage or accuracy. '
                + (id === 'heart-rate' ? 'This is not a diagnostic measurement.' : 'This estimate has not been validated.'));
    }
    add('coverage', 'Comparison coverage', coverage.comparisonReason, `${recent?.presenceNights ?? 0} recent and ${previous?.presenceNights ?? 0} previous nights with known presence`, coverage.scopeNote);
    if (journal && journal.recordedCheckIns > 0) {
        const matchedCount = Math.min(journal.recordedCheckIns, 7);
        const journalContext = 'Latest matching check-ins within the selected history';
        for (const [id, label, count] of [['warm-checkins', 'warm', journal.warmNights], ['cold-checkins', 'cold', journal.coldNights]]) {
            add(id, 'Reported temperature comfort', `You reported feeling ${label} in ${count} of your latest ${matchedCount} matching check-ins.`, `${matchedCount} matching check-ins`, 'Count of your reported comfort in the latest seven matching check-ins, '
                + 'or all available if fewer than seven. These may span more than a calendar week.', journalContext);
        }
        for (const association of journal.associations) {
            add(`habit-${association.habit}`, `${association.habit[0].toUpperCase()}${association.habit.slice(1)} association`, `Bed presence averaged ${association.presenceDifferenceMinutes > 0 ? '+' : ''}${association.presenceDifferenceMinutes} minutes `
                + `on nights reporting ${association.habit}, compared with nights without it. This is an association, not a cause.`, `${association.withCount} with and ${association.withoutCount} without the reported habit`, 'Difference between mean known presence for matched check-ins with and without the habit. Each group needs at least five nights.', 'All matching check-ins within the selected history');
        }
    }
    return facts;
}
export function localFactSelection(facts) {
    return facts.filter(fact => ['bed-presence', 'bedtime-variation', 'weekly-presence-change', 'no-presence-summary'].includes(fact.id));
}
// The receipt's period inventory stays with the clients; the prompt receives only fixed IDs and aggregate statements.
export function factsForModel(facts) {
    return facts.map(({ id, title, observation, sample }) => ({ id, title, observation, sample }));
}
//# sourceMappingURL=facts.js.map
//# debugId=3ad84bd9-5752-5b65-bd3d-30b290b87d1f
