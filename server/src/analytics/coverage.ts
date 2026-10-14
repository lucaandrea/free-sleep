import moment from 'moment-timezone';

export const MINIMUM_COMPARISON_NIGHTS = 3;
export const MAX_EPISODE_SECONDS = 72 * 60 * 60;
export function validRecordWindow(start: number, end: number): boolean {
  return Number.isFinite(new Date(start * 1000).getTime()) && Number.isFinite(new Date(end * 1000).getTime())
    && end > start && end - start <= MAX_EPISODE_SECONDS;
}
interface CoverageNight {
  date: string;
  occupiedMinutes: number | null;
  heartRate: number | null;
  hrv: number | null;
  respiratoryRate: number | null;
}
export const COVERAGE_SCOPE = 'Based on records returned for your selected range. '
  + 'A date without a record does not prove sensor failure or no sleep. Choose a longer range to include earlier dates.';
export const COMPARISON_READY = 'Both periods have at least 3 nights with known presence. '
  + 'This is a descriptive comparison, not proof of a change in sleep quality.';
export const COMPARISON_LIMITED = 'A weekly change needs at least 3 nights with known presence in each period. '
  + 'This is an app display rule, not a medical confidence threshold.';

// Enumerate calendar dates in the Pod timezone, preserving no-record and unknown-presence states.
export function dataCoverage(nights: CoverageNight[], timeZone: string, excludedEpisodes = 0) {
  const dates = new Map(nights.map(night => [night.date, night]));
  const sortedDates = [...dates.keys()].sort();
  const latest = sortedDates[sortedDates.length - 1];
  const window = (offset: number) => {
    if (!latest) return null;
    const end = moment.tz(latest, timeZone).subtract(offset, 'days');
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = end.clone().subtract(6 - index, 'days').format('YYYY-MM-DD');
      const night = dates.get(date);
      const status = !night ? 'not_returned' as const : night.occupiedMinutes === null ? 'unknown' as const : 'known' as const;
      return { date, status };
    });
    const records = days.flatMap(day => dates.get(day.date) ?? []);
    const count = (key: 'occupiedMinutes' | 'heartRate' | 'hrv' | 'respiratoryRate') =>
      records.filter(night => night[key] !== null).length;
    return { from: days[0].date, through: days[6].date, days, recordedNights: records.length,
      presenceNights: count('occupiedMinutes'), heartRateNights: count('heartRate'),
      hrvNights: count('hrv'), respiratoryRateNights: count('respiratoryRate') };
  };
  const recent = window(0); const previous = window(7);
  const comparisonAvailable = (recent?.presenceNights ?? 0) >= MINIMUM_COMPARISON_NIGHTS
    && (previous?.presenceNights ?? 0) >= MINIMUM_COMPARISON_NIGHTS;
  return { version: 1 as const, minimumNights: MINIMUM_COMPARISON_NIGHTS, recent, previous, comparisonAvailable,
    comparisonReason: comparisonAvailable ? COMPARISON_READY : COMPARISON_LIMITED, excludedEpisodes, scopeNote: COVERAGE_SCOPE };
}
export type DataCoverage = ReturnType<typeof dataCoverage>;

// Only aggregate coverage accompanies an opted-in model request; the per-date inventory stays local.
export function coverageForCoaching(report: DataCoverage) {
  const counts = (window: DataCoverage['recent']) => window && ({ recordedNights: window.recordedNights,
    presenceNights: window.presenceNights, heartRateNights: window.heartRateNights,
    hrvNights: window.hrvNights, respiratoryRateNights: window.respiratoryRateNights });
  return { recent: counts(report.recent), previous: counts(report.previous), comparisonAvailable: report.comparisonAvailable,
    minimumNights: report.minimumNights, excludedEpisodes: report.excludedEpisodes, scopeNote: report.scopeNote };
}
