import { z } from 'zod';

export const modelProvider = z.enum(['openai', 'gemini', 'anthropic', 'ollama']);
export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().min(0).max(1e9),
  outputTokens: z.number().int().min(0).max(1e9),
  totalTokens: z.number().int().min(0).max(2e9),
}).strict().refine(value => value.totalTokens === value.inputTokens + value.outputTokens);
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export const usageLimitChange = z.object({
  monthlyLimit: z.number().int().min(0).max(1000),
  originalRevision: z.number().int().nonnegative().safe(),
}).strict();
export const usageAttemptSchema = z.object({
  id: z.string().uuid(), provider: modelProvider, model: z.string().min(1).max(160),
  startedAt: z.string().datetime(), outcome: z.enum(['pending', 'completed', 'failed']),
  elapsedMilliseconds: z.number().int().nonnegative().max(86400000).nullable(),
  tokens: tokenUsageSchema.nullable(),
}).strict();
export type UsageAttempt = z.infer<typeof usageAttemptSchema>;
export type UsageCounts = {
  attempts: number; completed: number; failed: number; unresolved: number; pending: number;
  tokensReportedFor: number; inputTokens: number; outputTokens: number; totalTokens: number;
  averageResponseMilliseconds: number | null;
};
export type CoachUsage = UsageCounts & {
  version: 1; period: string; resetsAt: string; monthlyLimit: number; revision: number; remaining: number;
  providers: (UsageCounts & { provider: string; models: string[] })[];
};

// An unfinished reservation remains charged after a crash; elapsed time changes its label, never its count.
function counts(attempts: UsageAttempt[], now: Date): UsageCounts {
  const timed = attempts.filter(attempt => attempt.elapsedMilliseconds !== null);
  const unresolved = attempts.filter(attempt => attempt.outcome === 'pending'
    && now.getTime() - Date.parse(attempt.startedAt) > 120000).length;
  return {
    attempts: attempts.length,
    completed: attempts.filter(attempt => attempt.outcome === 'completed').length,
    failed: attempts.filter(attempt => attempt.outcome === 'failed').length,
    unresolved, pending: attempts.filter(attempt => attempt.outcome === 'pending').length - unresolved,
    tokensReportedFor: attempts.filter(attempt => attempt.tokens !== null).length,
    inputTokens: attempts.reduce((sum, attempt) => sum + (attempt.tokens?.inputTokens ?? 0), 0),
    outputTokens: attempts.reduce((sum, attempt) => sum + (attempt.tokens?.outputTokens ?? 0), 0),
    totalTokens: attempts.reduce((sum, attempt) => sum + (attempt.tokens?.totalTokens ?? 0), 0),
    averageResponseMilliseconds: timed.length
      ? Math.round(timed.reduce((sum, attempt) => sum + attempt.elapsedMilliseconds!, 0) / timed.length) : null,
  };
}
export function summarizeUsage(attempts: UsageAttempt[], monthlyLimit: number, revision: number, now: Date): CoachUsage {
  const period = now.toISOString().slice(0, 7);
  const current = attempts.filter(attempt => attempt.startedAt.startsWith(period));
  return { version: 1, period,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    monthlyLimit, revision, remaining: Math.max(0, monthlyLimit - current.length), ...counts(current, now),
    providers: modelProvider.options.flatMap(provider => {
      const selected = current.filter(attempt => attempt.provider === provider);
      return selected.length ? [{ provider, models: [...new Set(selected.map(attempt => attempt.model))], ...counts(selected, now) }] : [];
    }),
  };
}
