import { z } from 'zod';

export type ConnectionInput = { address: string; token: string };
export type ConnectionIdentity = { id: string; timeZone: string };
type StoragePair = { local: Pick<Storage, 'getItem' | 'setItem'>; session: Pick<Storage, 'getItem' | 'setItem'> };
const sideSchema = z.object({ name: z.string(), awayMode: z.boolean() });
const identitySchema = z.object({ id: z.string().trim().min(1), timeZone: z.string().min(1),
  temperatureFormat: z.enum(['celsius', 'fahrenheit']), left: sideSchema, right: sideSchema });

// A connection is an origin, never a route or a URL carrying credentials.
export function connectionAddress(address: string, currentOrigin: string) {
  const clean = address.trim();
  let url: URL;
  try { url = new URL(clean || currentOrigin); } catch { throw new Error('Enter a complete http:// or https:// address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || /[?#]/.test(clean)) {
    throw new Error('Use a server address without a path, query, fragment or embedded credentials.');
  }
  const host = url.hostname.toLowerCase();
  const parts = host.split('.').map(Number);
  const privateIP = parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
  if (url.protocol === 'http:' && !(host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || privateIP)) {
    throw new Error('Use HTTPS for a remote connection, or an address on your home network.');
  }
  if (new URL(currentOrigin).protocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('This hosted app needs an HTTPS connection to your Pod.');
  }
  return { savedAddress: clean ? url.origin : '', origin: url.origin };
}

export function readConnection(storage: StoragePair, demo: boolean): ConnectionInput {
  if (demo) return { address: 'https://demo-pod.example', token: '' };
  return { address: storage.local.getItem('freeSleepURL') ?? '', token: storage.session.getItem('freeSleepToken') ?? '' };
}

export function saveConnection(storage: StoragePair, input: ConnectionInput, currentOrigin: string, demo: boolean) {
  const normalized = connectionAddress(input.address, currentOrigin);
  if (demo) return;
  const previous = readConnection(storage, false);
  try {
    storage.session.setItem('freeSleepToken', input.token.trim());
    storage.local.setItem('freeSleepURL', normalized.savedAddress);
  } catch {
    // Restore the original pair if browser storage rejects either half of the update.
    try {
      storage.session.setItem('freeSleepToken', previous.token); storage.local.setItem('freeSleepURL', previous.address);
    } catch { /* Storage may be unavailable. */ }
    throw new Error('The browser could not save this connection. Check its storage settings and retry.');
  }
}

export async function testConnection(input: ConnectionInput, currentOrigin: string, demo: boolean, signal: AbortSignal,
  request: typeof fetch = fetch): Promise<ConnectionIdentity> {
  const { origin } = connectionAddress(input.address, currentOrigin);
  if (demo) return { id: 'Demo Pod', timeZone: 'America/Los_Angeles' };
  let response: Response;
  try {
    response = await request(`${origin}/api/settings`, { signal, method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', headers: input.token.trim() ? { Authorization: `Bearer ${input.token.trim()}` } : {} });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Cannot reach this address. Check the network, HTTPS and browser access allowed by your server.');
  }
  if (response.status === 401 || response.status === 403) throw new Error('The connection token was not accepted.');
  if (response.status === 503) throw new Error('The server is reachable, but the Pod is unavailable.');
  if (!response.ok) throw new Error(`Connection test failed (HTTP ${response.status}).`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('This address did not return the Free Sleep API.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The server returned an empty response.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 100_000) { await reader.cancel(); throw new Error('The server returned an unexpected response.'); }
    chunks.push(chunk.value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = identitySchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
    return { id: value.id, timeZone: value.timeZone };
  } catch { throw new Error('This address did not return valid Free Sleep settings.'); }
}
