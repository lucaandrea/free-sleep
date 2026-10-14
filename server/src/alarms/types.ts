import type { DayOfWeek, Side } from '../db/schedulesSchema.js';

export interface AlarmOccurrence {
  at: string;
  time: string;
  scheduleDay: DayOfWeek | null;
  source: 'routine' | 'override';
}
export interface AlarmPreview {
  side: Side;
  timeZone: string;
  state: 'scheduled' | 'paused' | 'none' | 'away';
  alarm: AlarmOccurrence | null;
  expiresAt: string | null;
  overrideRevision: string | null;
}
export type AlarmChange =
  | { side: Side; action: 'time'; time: string; expectedAt: string }
  | { side: Side; action: 'disable'; expectedAt: string }
  | { side: Side; action: 'restore'; expectedExpiresAt: string; expectedRevision?: string };
