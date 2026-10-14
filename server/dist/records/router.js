
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1e2ae414-a230-583a-93cd-1ef92d85bc6f")}catch(e){}}();
import express from 'express';
import { exitsInWindow, recordSeconds, sleepRecordChange, sleepRecordIdentity } from './sleepMutation.js';
export function sleepMutations(database) {
    const router = express.Router();
    const conflict = 'This record changed or was removed. Close the editor, refresh, and try again.';
    router.route('/:id').all((request, response, next) => {
        if (!['PUT', 'DELETE'].includes(request.method))
            return next('route');
        if (!/^[1-9]\d*$/.test(request.params.id) || Number(request.params.id) > 2147483647) {
            return response.status(400).json({ error: { message: 'Choose a valid record.' } });
        }
        next();
    }).put(async (request, response) => {
        const parsed = sleepRecordChange.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({
                error: { message: 'Choose valid dates, a side and the original record window (up to 72 hours).' },
            });
        const input = parsed.data;
        const record = await database.sleep_records.findFirst({ where: { id: Number(request.params.id), side: input.side } });
        if (!record)
            return response.status(404).json({ error: { message: 'This record is no longer available for this side.' } });
        const start = recordSeconds(input.entered_bed_at);
        const end = recordSeconds(input.left_bed_at);
        let exits;
        try {
            exits = exitsInWindow(record.not_present_intervals, start, end);
        }
        catch {
            return response.status(422).json({ error: { message: 'Recorded exit intervals are unavailable. This record cannot be edited.' } });
        }
        try {
            // Compare-and-set also checks the interval data used to calculate exits. Never overwrite a newer edit.
            const updated = await database.sleep_records.updateMany({
                where: { id: record.id, side: input.side, entered_bed_at: recordSeconds(input.expected.entered_bed_at),
                    left_bed_at: recordSeconds(input.expected.left_bed_at), not_present_intervals: record.not_present_intervals },
                data: { entered_bed_at: start, left_bed_at: end, sleep_period_seconds: end - start, times_exited_bed: exits },
            });
            if (updated.count !== 1)
                return response.status(409).json({ error: { message: conflict } });
            return response.status(204).end();
        }
        catch (error) {
            if (error.code === 'P2002') {
                return response.status(409).json({ error: {
                        message: 'Another record on this side already starts at that time. Choose a different start.',
                    } });
            }
            throw error;
        }
    }).delete(async (request, response) => {
        const parsed = sleepRecordIdentity.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ error: { message: 'Choose a side and the original record window.' } });
        const input = parsed.data;
        const removed = await database.sleep_records.deleteMany({ where: {
                id: Number(request.params.id), side: input.side,
                entered_bed_at: recordSeconds(input.expected.entered_bed_at), left_bed_at: recordSeconds(input.expected.left_bed_at),
            } });
        if (removed.count !== 1)
            return response.status(409).json({ error: { message: conflict } });
        return response.status(204).end();
    });
    return router;
}
//# sourceMappingURL=router.js.map
//# debugId=1e2ae414-a230-583a-93cd-1ef92d85bc6f
