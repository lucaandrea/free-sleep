
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="a13c31ee-da7d-5c2c-8c03-1ce7c029c819")}catch(e){}}();
import { prisma } from '../db/prisma.js';
import { summarizeAutopilotSignals } from './signals.js';
const baselineCache = new Map();
export async function readAutopilotSignals(side, now = Date.now()) {
    let baseline = baselineCache.get(side);
    if (!baseline || now < baseline.at || now - baseline.at > 6 * 3600_000) {
        const samples = await prisma.vitals.findMany({ where: { side, timestamp: {
                    gte: Math.floor(now / 1000) - 29 * 86400, lte: Math.floor(now / 1000) - 86400,
                } }, select: { timestamp: true, heart_rate: true }, orderBy: { timestamp: 'asc' }, take: 29 * 288 + 1 });
        baseline = { at: now, samples };
        baselineCache.set(side, baseline);
    }
    const recent = await prisma.vitals.findMany({ where: { side, timestamp: { gte: Math.floor(now / 1000) - 1200 } },
        select: { timestamp: true, heart_rate: true }, orderBy: { timestamp: 'desc' }, take: 4 });
    return summarizeAutopilotSignals(baseline.samples, recent, now);
}
//# sourceMappingURL=readSignals.js.map
//# debugId=a13c31ee-da7d-5c2c-8c03-1ce7c029c819
