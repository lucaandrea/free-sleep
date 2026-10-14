
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="7ef6a369-a745-515e-b24b-54f32df78208")}catch(e){}}();
import { z } from 'zod';
// Keep the provider schema static and free of personal data; apply length, uniqueness and availability checks locally.
export const MODEL_COACH_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        factIds: { type: 'array', items: { type: 'string' }, description: 'Select 1 to 5 distinct IDs from the supplied facts.' },
        suggestions: { type: 'array', items: { type: 'string' },
            description: 'Give 1 to 3 optional routine suggestions, each under 600 characters.' },
    },
    required: ['factIds', 'suggestions'],
};
const modelOutput = z.object({
    factIds: z.array(z.string().min(1).max(80)).min(1).max(5),
    suggestions: z.array(z.string().trim().min(1).max(600)).min(1).max(3),
}).strict();
export function resolveModelCoaching(output, facts) {
    const result = modelOutput.parse(JSON.parse(output));
    const catalog = new Map(facts.map(fact => [fact.id, fact]));
    if (new Set(result.factIds).size !== result.factIds.length || result.factIds.some(id => !catalog.has(id))) {
        throw new Error('The model selected duplicate or unavailable observations.');
    }
    return { facts: result.factIds.map(id => catalog.get(id)), suggestions: result.suggestions };
}
//# sourceMappingURL=modelContract.js.map
//# debugId=7ef6a369-a745-515e-b24b-54f32df78208
