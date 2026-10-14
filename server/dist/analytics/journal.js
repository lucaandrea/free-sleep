
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="bc1d9933-1a24-5b5a-a0e3-a2cfab6ec61e")}catch(e){}}();
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import moment from 'moment-timezone';
import { z } from 'zod';
export const journalSchema = z.object({
    date: z.string().refine(value => moment(value, 'YYYY-MM-DD', true).isValid(), 'Use a valid wake date'),
    side: z.enum(['left', 'right']),
    restfulness: z.number().int().min(1).max(5),
    comfort: z.enum(['cold', 'comfortable', 'warm']),
    caffeine: z.boolean(),
    alcohol: z.boolean(),
    exercise: z.boolean(),
    notes: z.string().trim().max(500).default(''),
}).strict();
// Serialize writes and atomically replace the file; malformed existing data is never silently reset.
export function createJournalStore(filename) {
    let tail = Promise.resolve();
    const read = async () => {
        try {
            return z.array(journalSchema).parse(JSON.parse(await readFile(filename, 'utf8')));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    };
    const update = (transform) => {
        const operation = tail.then(async () => {
            const entries = transform(await read());
            if (entries.length > 7300)
                throw Object.assign(new Error('Journal limit reached; export older entries first'), { status: 409 });
            await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
            const temporary = `${filename}.${randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify(entries), { mode: 0o600 });
            await rename(temporary, filename);
            return entries;
        });
        tail = operation.catch(() => undefined);
        return operation;
    };
    return {
        list: async () => { await tail; return read(); },
        save: (input) => {
            const entry = journalSchema.parse(input);
            return update(entries => [...entries.filter(item => item.side !== entry.side || item.date !== entry.date), entry]
                .sort((first, second) => first.date.localeCompare(second.date)));
        },
        remove: (side, date) => update(entries => entries.filter(entry => entry.side !== side || entry.date !== date)),
    };
}
// Compare observed groups only after both have enough entries; associations never establish cause.
export function journalPatterns(entries, analytics) {
    const byDate = new Map(analytics.nights.map(night => [night.date, night]));
    const matched = entries.filter(entry => byDate.get(entry.date)?.occupiedMinutes != null);
    const associations = ['caffeine', 'alcohol', 'exercise'].flatMap(habit => {
        const withHabit = matched.filter(entry => entry[habit]);
        const withoutHabit = matched.filter(entry => !entry[habit]);
        if (withHabit.length < 5 || withoutHabit.length < 5)
            return [];
        const average = (group) => group.reduce((total, entry) => total + byDate.get(entry.date).occupiedMinutes, 0) / group.length;
        return [{ habit, withCount: withHabit.length, withoutCount: withoutHabit.length,
                presenceDifferenceMinutes: Math.round(average(withHabit) - average(withoutHabit)) }];
    });
    const recent = [...entries].sort((first, second) => first.date.localeCompare(second.date)).slice(-7);
    return {
        recordedCheckIns: entries.length,
        averageRestfulness: recent.length
            ? Math.round(recent.reduce((total, entry) => total + entry.restfulness, 0) / recent.length * 10) / 10
            : null,
        warmNights: recent.filter(entry => entry.comfort === 'warm').length,
        coldNights: recent.filter(entry => entry.comfort === 'cold').length,
        associations,
        note: 'Self-reported habits are associations, not causes. Each comparison needs at least five recorded nights in both groups.',
    };
}
//# sourceMappingURL=journal.js.map
//# debugId=bc1d9933-1a24-5b5a-a0e3-a2cfab6ec61e
