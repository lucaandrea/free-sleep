import { z } from 'zod';
import type { DeepPartial } from 'ts-essentials';
import type { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';

export const comfortConfigSchema = z.object({
  mode: z.enum(['off', 'preview', 'active']),
  minimumF: z.number().int().min(55).max(110),
  maximumF: z.number().int().min(55).max(110),
}).strict().refine(value => value.minimumF <= value.maximumF, 'Minimum must not exceed maximum');
export type ComfortConfig = z.infer<typeof comfortConfigSchema>;
export type ControlSource = 'manual' | 'schedule' | 'adaptive';
export type DeviceUpdate = DeepPartial<DeviceStatus>;
export type ComfortEvent = { at: number; message: string; targetF: number | null };
export type ComfortState = {
  config: ComfortConfig;
  offsetF: number;
  feedbackThrough: string;
  learnedSession: string;
  pausedUntil: number;
  lastAppliedAt: number;
  lastTargetF: number | null;
  lastSegment: string;
  history: ComfortEvent[];
};
export type ComfortDecision = {
  reason: string;
  baselineF: number | null;
  proposedF: number | null;
  eligible: boolean;
};
export type ComfortStatus = {
  config: ComfortConfig;
  offsetF: number;
  pausedUntil: number | null;
  feedbackThrough: string | null;
  decision: ComfortDecision;
  history: ComfortEvent[];
};
export const defaultComfortState = (): ComfortState => ({
  config: { mode: 'off', minimumF: 70, maximumF: 95 }, offsetF: 0, feedbackThrough: '', learnedSession: '',
  pausedUntil: 0, lastAppliedAt: 0, lastTargetF: null, lastSegment: '', history: [],
});
