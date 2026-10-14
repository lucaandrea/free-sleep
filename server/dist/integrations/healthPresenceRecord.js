
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="b8cf6522-012d-5d56-a36b-84dc931ee9a1")}catch(e){}}();
import { presenceIntervals } from '../analytics/summary.js';
// Health reconciliation must distinguish an empty interval list from damaged source data.
export function healthPresenceRecord(record) {
    let valid = false;
    try {
        const intervals = JSON.parse(record.present_intervals || '');
        const validTimestamp = (value) => typeof value === 'number'
            && Number.isFinite(value) && Math.abs(value) <= 8.64e12;
        valid = validTimestamp(record.entered_bed_at) && validTimestamp(record.left_bed_at)
            && record.left_bed_at >= record.entered_bed_at && Array.isArray(intervals)
            && intervals.every(interval => Array.isArray(interval) && interval.length === 2
                && interval.every(validTimestamp) && interval[1] > interval[0]);
    }
    catch { /* Keep corrupt data distinguishable from an intentionally empty export. */ }
    return { id: record.id, valid,
        present_intervals: valid ? presenceIntervals(record).map(([begin, finish]) => [new Date(begin * 1000).toISOString(), new Date(finish * 1000).toISOString()]) : [] };
}
//# sourceMappingURL=healthPresenceRecord.js.map
//# debugId=b8cf6522-012d-5d56-a36b-84dc931ee9a1
