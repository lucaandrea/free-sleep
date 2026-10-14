import { timingSafeEqual } from 'node:crypto';

export const MAX_BODY = 1024 * 1024;
export function authorized(header, secret) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Remote clients can use normal app features, never arbitrary commands or root maintenance jobs.
export function allowedRequest(method, route) {
  if (typeof route !== 'string' || route.length > 4096 || !route.startsWith('/api/') || route.includes('\\')) return false;
  const url = new URL(route, 'http://pod.invalid');
  if (url.origin !== 'http://pod.invalid' || url.pathname.includes('%')) return false;
  const path = url.pathname;
  if (method === 'GET') return /^\/api\/(deviceStatus|settings|schedules|comfort|services|serverStatus|analytics|journal|base|ai\/providers|integrations\/homekit|health\/export|metrics\/(sleep|vitals|movement|presence))$/.test(path);
  if (method === 'POST') return /^\/api\/(deviceStatus|settings|schedules|comfort|journal|ai\/coach|base\/(connect|position|preset|stop))$/.test(path);
  if (method === 'DELETE' && path === '/api/journal') return true;
  if (method === 'PUT' || method === 'DELETE') return /^\/api\/metrics\/sleep\/\d+$/.test(path);
  return false;
}

export async function boundedResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('Response is too large; choose a shorter date range'); }
    chunks.push(Buffer.from(result.value));
  }
  return Buffer.concat(chunks).toString('utf8');
}
