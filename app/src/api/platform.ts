import { useQuery } from '@tanstack/react-query';
import axios from './api';
import type { SleepAnalytics } from '../../../server/src/analytics/summary';
import type { CoachGrounding } from '../../../server/src/ai/facts';
export type { SleepAnalytics };
export type BaseStatus = {
  state: string;
  position: { left: { head: number; feet: number }; right: { head: number; feet: number } } | null;
  updatedAt: number | null;
  stale: boolean;
  busy: boolean;
  independentControl: boolean;
  experimental: boolean;
  error: string | null;
};
export type Coach = {
  headline: string;
  observations: string[];
  suggestions: string[];
  limitations: string[];
  provider: string;
  model: string;
  grounding?: CoachGrounding;
};
export const useBase = () =>
  useQuery({
    queryKey: ['base'],
    queryFn: async () => (await axios.get<BaseStatus>('base')).data,
    refetchInterval: 2000,
    retry: 1,
  });
export const useAnalytics = (side: string, days = 30) =>
  useQuery({
    queryKey: ['analytics', side, days],
    queryFn: async () => (await axios.get<SleepAnalytics>('analytics', { params: { side, days } })).data,
    retry: 1,
  });
export function errorMessage(error: unknown): string {
  const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return message || (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
}
export const durationLabel = (minutes: number | null | undefined) =>
  minutes == null ? '—' : `${Math.floor(Math.round(minutes) / 60)}h ${Math.round(minutes) % 60}m`;
