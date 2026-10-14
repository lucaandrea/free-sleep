import { z } from 'zod';

const textPart = z.object({ type: z.string(), text: z.string().optional() });
const openAI = z.object({ status: z.literal('completed'), output: z.array(z.object({
  type: z.string(), status: z.string().optional(), content: z.array(textPart).optional(),
})) });
const anthropic = z.object({ stop_reason: z.literal('end_turn'), content: z.array(textPart) });
const gemini = z.object({ candidates: z.array(z.object({ finishReason: z.literal('STOP'),
  content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
})).length(1) });
const ollama = z.object({ done: z.literal(true), done_reason: z.literal('stop').optional(),
  message: z.object({ content: z.string() }) });

// Require a complete response even if an interrupted provider happened to emit syntactically valid JSON.
export function providerOutput(provider: 'openai' | 'anthropic' | 'gemini' | 'ollama', payload: unknown): string {
  try {
    let output: string;
    if (provider === 'openai') {
      const response = openAI.parse(payload);
      const messages = response.output.filter(item => item.type === 'message');
      if (messages.some(item => item.status !== undefined && item.status !== 'completed')) throw new Error('Incomplete message');
      const parts = messages.flatMap(item => item.content ?? []);
      if (parts.some(part => part.type === 'refusal')) throw new Error('Refusal');
      output = parts.filter(part => part.type === 'output_text').map(part => part.text ?? '').join('');
    } else if (provider === 'anthropic') {
      output = anthropic.parse(payload).content.filter(part => part.type === 'text').map(part => part.text ?? '').join('');
    } else if (provider === 'gemini') {
      output = gemini.parse(payload).candidates[0].content.parts.filter(part => !part.thought).map(part => part.text ?? '').join('');
    } else output = ollama.parse(payload).message.content;
    if (!output.trim()) throw new Error('Empty output');
    return output;
  } catch {
    throw Object.assign(new Error(`${provider} returned incomplete or unusable coaching. Try local calculations or ask again.`), {
      status: 502,
    });
  }
}
