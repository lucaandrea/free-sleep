
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="aa3a236a-8c54-54a2-b455-57d2b2e02b90")}catch(e){}}();
import { z } from 'zod';
import { tokenUsageSchema } from './usageContract.js';
const count = z.number().int().min(0).max(1e9);
// Normalize reported totals without counting cached or reasoning tokens twice. Missing usage stays unknown.
export function providerUsage(provider, payload) {
    try {
        let inputTokens;
        let outputTokens;
        let totalTokens;
        if (provider === 'openai') {
            const { usage } = z.object({ usage: z.object({ input_tokens: count, output_tokens: count, total_tokens: count }) }).parse(payload);
            inputTokens = usage.input_tokens;
            outputTokens = usage.output_tokens;
            totalTokens = usage.total_tokens;
        }
        else if (provider === 'anthropic') {
            const { usage } = z.object({ usage: z.object({ input_tokens: count, output_tokens: count,
                    cache_creation_input_tokens: count.optional(), cache_read_input_tokens: count.optional() }) }).parse(payload);
            inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
            outputTokens = usage.output_tokens;
            totalTokens = inputTokens + outputTokens;
        }
        else if (provider === 'gemini') {
            const { usageMetadata: usage } = z.object({ usageMetadata: z.object({ promptTokenCount: count, totalTokenCount: count,
                    toolUsePromptTokenCount: count.optional(), candidatesTokenCount: count.optional(),
                    thoughtsTokenCount: count.optional() }) }).parse(payload);
            inputTokens = usage.promptTokenCount + (usage.toolUsePromptTokenCount ?? 0);
            totalTokens = usage.totalTokenCount;
            outputTokens = totalTokens - inputTokens;
            if ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) > outputTokens)
                return null;
        }
        else if (provider === 'ollama') {
            const usage = z.object({ prompt_eval_count: count, eval_count: count }).parse(payload);
            inputTokens = usage.prompt_eval_count;
            outputTokens = usage.eval_count;
            totalTokens = inputTokens + outputTokens;
        }
        else
            return null;
        return tokenUsageSchema.parse({ inputTokens, outputTokens, totalTokens });
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=providerUsage.js.map
//# debugId=aa3a236a-8c54-54a2-b455-57d2b2e02b90
