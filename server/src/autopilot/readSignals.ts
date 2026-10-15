import { prisma } from '../db/prisma.js';
import type { Side } from '../db/schedulesSchema.js';
import { summarizeAutopilotSignals, type VitalSample } from './signals.js';

const baselineCache = new Map<Side, { at: number; samples: VitalSample[] }>();

export async function readAutopilotSignals(side: Side, now = Date.now()) {
  let baseline = baselineCache.get(side);
  if (!baseline || now < baseline.at || now - baseline.at > 6 * 3600_000) {
    const samples = await prisma.vitals.findMany({ where: { side, timestamp: {
      gte: Math.floor(now / 1000) - 29 * 86400, lte: Math.floor(now / 1000) - 86400,
    } }, select: { timestamp: true, heart_rate: true }, orderBy: { timestamp: 'asc' }, take: 29 * 288 + 1 });
    baseline = { at: now, samples }; baselineCache.set(side, baseline);
  }
  const recent = await prisma.vitals.findMany({ where: { side, timestamp: { gte: Math.floor(now / 1000) - 1200 } },
    select: { timestamp: true, heart_rate: true }, orderBy: { timestamp: 'desc' }, take: 4 });
  return summarizeAutopilotSignals(baseline.samples, recent, now);
}
