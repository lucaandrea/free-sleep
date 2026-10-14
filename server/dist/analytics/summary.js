
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="71975fbe-b3ea-5877-8141-df9d5b0aeef4")}catch(e){}}();
import moment from 'moment-timezone';
const round = (value) => Math.round(value * 10) / 10;
const mean = (values) => values.length ? round(values.reduce((total, value) => total + value, 0) / values.length) : null;
const valid = (value, minimum, maximum) => value !== null && Number.isFinite(value) && value >= minimum && value <= maximum;
// Clip, sort and merge presence intervals so overlaps never inflate occupied time.
export function presenceIntervals(record) {
    let decoded;
    try {
        decoded = JSON.parse(record.present_intervals);
    }
    catch {
        return [];
    }
    if (!Array.isArray(decoded))
        return [];
    const ranges = decoded
        .filter((interval) => Array.isArray(interval) && interval.length === 2 && interval.every(Number.isFinite))
        .map(([start, end]) => [Math.max(start, record.entered_bed_at), Math.min(end, record.left_bed_at)])
        .filter(([start, end]) => end > start)
        .sort((first, second) => first[0] - second[0]);
    const merged = [];
    for (const interval of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && interval[0] <= previous[1])
            previous[1] = Math.max(previous[1], interval[1]);
        else
            merged.push([...interval]);
    }
    return merged;
}
export function summarizeSleep(records, vitals, timeZone, goalMinutes = 480) {
    const orderedVitals = [...vitals].filter(sample => Number.isFinite(sample.timestamp))
        .sort((first, second) => first.timestamp - second.timestamp);
    // Binary search avoids rescanning months of high-frequency vitals for every episode.
    const sampleIndex = (timestamp) => {
        let lower = 0;
        let upper = orderedVitals.length;
        while (lower < upper) {
            const middle = Math.floor((lower + upper) / 2);
            if (orderedVitals[middle].timestamp < timestamp)
                lower = middle + 1;
            else
                upper = middle;
        }
        return lower;
    };
    const nights = records
        .filter((record) => record.left_bed_at > record.entered_bed_at)
        .map((record) => {
        const intervals = presenceIntervals(record);
        const occupiedMinutes = intervals.length
            ? round(intervals.reduce((total, [start, end]) => total + end - start, 0) / 60)
            : null;
        const windowMinutes = round((record.left_bed_at - record.entered_bed_at) / 60);
        const samples = orderedVitals.slice(sampleIndex(record.entered_bed_at), sampleIndex(record.left_bed_at + 1)).filter((sample) => sample.timestamp >= record.entered_bed_at &&
            sample.timestamp <= record.left_bed_at &&
            intervals.some(([start, end]) => sample.timestamp >= start && sample.timestamp <= end));
        const bedTime = moment.unix(record.entered_bed_at).tz(timeZone);
        const clockMinutes = bedTime.hour() * 60 + bedTime.minute();
        return {
            id: record.id,
            date: moment.unix(record.left_bed_at).tz(timeZone).format('YYYY-MM-DD'),
            startedAt: new Date(record.entered_bed_at * 1000).toISOString(),
            endedAt: new Date(record.left_bed_at * 1000).toISOString(),
            windowMinutes,
            occupiedMinutes,
            occupancyPercent: occupiedMinutes === null ? null : round((occupiedMinutes / windowMinutes) * 100),
            exits: record.times_exited_bed,
            sampleCount: samples.filter(sample => valid(sample.heart_rate, 25, 220)
                || valid(sample.hrv, 1, 300) || valid(sample.breathing_rate, 4, 50)).length,
            heartRate: mean(samples.map((sample) => sample.heart_rate).filter((value) => valid(value, 25, 220))),
            hrv: mean(samples.map((sample) => sample.hrv).filter((value) => valid(value, 1, 300))),
            respiratoryRate: mean(samples.map((sample) => sample.breathing_rate).filter((value) => valid(value, 4, 50))),
            bedtimeMinutes: clockMinutes < 720 ? clockMinutes + 1440 : clockMinutes,
        };
    })
        .sort((first, second) => first.startedAt.localeCompare(second.startedAt));
    // Only the longest episode on each wake date contributes to nightly trends; naps stay in the episode list.
    const daily = new Map();
    for (const night of nights) {
        if (!daily.has(night.date) || daily.get(night.date).windowMinutes < night.windowMinutes)
            daily.set(night.date, night);
    }
    const mainNights = [...daily.values()];
    // Compare calendar weeks anchored to the latest recorded wake date, without filling gaps with zeroes.
    const latestDate = mainNights[mainNights.length - 1]?.date;
    const recentStart = moment.tz(latestDate, timeZone).subtract(6, 'days').format('YYYY-MM-DD');
    const previousStart = moment.tz(latestDate, timeZone).subtract(13, 'days').format('YYYY-MM-DD');
    const recent = mainNights.filter(night => night.date >= recentStart);
    const previous = mainNights.filter(night => night.date >= previousStart && night.date < recentStart);
    const occupied = (values) => values.map((night) => night.occupiedMinutes).filter((value) => value !== null);
    const average = mean(occupied(recent));
    const previousAverage = mean(occupied(previous));
    const bedtimeMean = mean(recent.map((night) => night.bedtimeMinutes));
    const variation = recent.length >= 3 && bedtimeMean !== null
        ? round(Math.sqrt(recent.reduce((total, night) => total + (night.bedtimeMinutes - bedtimeMean) ** 2, 0) / recent.length))
        : null;
    return {
        timeZone,
        goalMinutes,
        nights: mainNights,
        episodes: nights,
        summary: {
            recordedNights: mainNights.length,
            recentRecordedNights: recent.length,
            previousRecordedNights: previous.length,
            periodEnding: latestDate ?? null,
            averageOccupiedMinutes: average,
            averageHeartRate: mean(recent.map((night) => night.heartRate).filter((value) => value !== null)),
            averageHrv: mean(recent.map((night) => night.hrv).filter((value) => value !== null)),
            averageRespiratoryRate: mean(recent.map((night) => night.respiratoryRate).filter((value) => value !== null)),
            bedtimeVariationMinutes: variation,
            weeklyChangeMinutes: average === null || previousAverage === null ? null : round(average - previousAverage),
            opportunityGapMinutes: average === null ? null : Math.max(0, round(goalMinutes - average)),
            averageExits: mean(recent.map((night) => night.exits)),
        },
        quality: {
            source: 'pod-presence-and-vitals',
            stageClassification: false,
            hrvValidated: false,
            respiratoryRateValidated: false,
            nightsWithVitals: mainNights.filter((night) => night.sampleCount > 0).length,
            notes: [
                'Bed presence is not measured sleep.',
                'HRV and respiratory rate are experimental estimates.',
                'Trends use the longest episode per wake date. Missing nights are not zero.',
                'Averages compare seven calendar days ending on the latest recorded wake date with the preceding seven days.',
            ],
        },
    };
}
//# sourceMappingURL=summary.js.map
//# debugId=71975fbe-b3ea-5877-8141-df9d5b0aeef4
