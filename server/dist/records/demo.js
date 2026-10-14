
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1f2c59b5-97b9-5580-a643-452e5055d871")}catch(e){}}();
import { episodeDetail } from '../analytics/episode.js';
import { summarizeSleep } from '../analytics/summary.js';
import { exitsInWindow, recordSeconds, sleepRecordChange, sleepRecordIdentity } from './sleepMutation.js';
export class DemoSleepHistory {
    fixture;
    records;
    constructor(fixture) {
        this.fixture = fixture;
        this.records = ['left', 'right'].flatMap(side => fixture.records.map(record => ({ ...record, side })));
    }
    list(side) { return this.records.filter(record => record.side === side).map(record => ({ ...record })); }
    analytics(side, days, timeZone = this.fixture.analytics.timeZone) {
        return summarizeSleep(this.list(side).filter(record => record.entered_bed_at >= this.fixture.anchor - (days - 1) * 86400), this.fixture.vitals, timeZone);
    }
    detail(side, id, timeZone = this.fixture.analytics.timeZone) {
        const record = this.records.find(item => item.side === side && item.id === id);
        return record ? episodeDetail(record, this.fixture.vitals.filter(sample => sample.timestamp >= record.entered_bed_at
            && sample.timestamp <= record.left_bed_at), timeZone) : null;
    }
    mutate(id, body, remove = false) {
        const input = (remove ? sleepRecordIdentity : sleepRecordChange).safeParse(body);
        if (!input.success)
            return { status: 400, message: 'Choose valid dates, a side and the original record window (up to 72 hours).' };
        const value = input.data;
        const index = this.records.findIndex(record => record.id === id && record.side === value.side);
        const record = this.records[index];
        if (record?.entered_bed_at !== recordSeconds(value.expected.entered_bed_at)
            || record.left_bed_at !== recordSeconds(value.expected.left_bed_at)) {
            return { status: 409, message: 'This record changed or was removed. Close the editor, refresh, and try again.' };
        }
        if (remove)
            this.records.splice(index, 1);
        else {
            const change = sleepRecordChange.parse(body);
            const start = recordSeconds(change.entered_bed_at);
            const end = recordSeconds(change.left_bed_at);
            if (this.records.some(item => item.side === record.side && item.id !== id && item.entered_bed_at === start)) {
                return { status: 409, message: 'Another record on this side already starts at that time. Choose a different start.' };
            }
            this.records[index] = { ...record, entered_bed_at: start, left_bed_at: end, sleep_period_seconds: end - start,
                times_exited_bed: exitsInWindow(record.not_present_intervals, start, end) };
        }
        return { status: 204, message: '' };
    }
}
//# sourceMappingURL=demo.js.map
//# debugId=1f2c59b5-97b9-5580-a643-452e5055d871
