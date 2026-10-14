export function providerEnvelope(provider: string, output: string) {
  if (provider === 'openai') return { status: 'completed', output: [
    { type: 'message', status: 'completed', content: [{ type: 'output_text', text: output }] },
  ] };
  if (provider === 'anthropic') return { stop_reason: 'end_turn', content: [{ type: 'text', text: output }] };
  if (provider === 'gemini') return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: output }] } }] };
  return { done: true, done_reason: 'stop', message: { content: output } };
}
