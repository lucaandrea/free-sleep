import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { allowedRequest, boundedResponse, MAX_BODY } from './policy.mjs';

export function connectPod({ gatewayURL, tunnelToken, podToken, podURL = 'http://127.0.0.1:3000', reconnect = true }) {
  const endpoint = new URL(gatewayURL);
  if (endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
    throw new Error('Use a secure wss gateway URL');
  }
  if (!tunnelToken || tunnelToken.length < 32 || !podToken) throw new Error('Configure tunnel and local API tokens');
  const local = new URL(podURL);
  if (!['http:', 'https:'].includes(local.protocol) || local.username || local.password || !['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) throw new Error('The tunnel agent must run alongside the local Pod API');
  let retry = null;
  let stopped = false;
  let currentSocket;
  const open = () => {
  const requests = new Map();
  const socket = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${tunnelToken}` }, maxPayload: MAX_BODY + 8192,
    handshakeTimeout: 15000, perMessageDeflate: false });
  currentSocket = socket;
  socket.on('error', () => { /* close handles reconnection without logging credentials */ });
  socket.on('message', async bytes => {
    let message;
    try { message = JSON.parse(bytes.toString());
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid message');
    } catch { socket.close(1008, 'Invalid message'); return; }
    if (message.type === 'cancel') { requests.get(message.id)?.abort(); return; }
    if (message.type !== 'request' || typeof message.id !== 'string' || message.id.length > 100 || requests.has(message.id) || requests.size >= 32
        || !allowedRequest(message.method, message.path) || typeof message.body !== 'string' || Buffer.byteLength(message.body) > MAX_BODY) {
      socket.close(1008, 'Invalid request'); return;
    }
    const controller = new AbortController();
    requests.set(message.id, controller);
    const timer = setTimeout(() => controller.abort(), 48000);
    const reply = (status, body) => {
      if (socket.readyState === WebSocket.OPEN && !controller.signal.aborted) {
        socket.send(JSON.stringify({ type: 'response', id: message.id, status, body }));
      }
    };
    try {
      const response = await fetch(new URL(message.path, local), {
        method: message.method, headers: { Authorization: `Bearer ${podToken}`, 'Content-Type': 'application/json' },
        body: ['GET', 'HEAD'].includes(message.method) ? undefined : message.body,
        signal: controller.signal, redirect: 'error',
      });
      reply(response.status, await boundedResponse(response));
    } catch {
      reply(502, JSON.stringify({ error: { message: 'Local Pod request failed. Check its state before retrying a command.' } }));
    } finally { clearTimeout(timer); requests.delete(message.id); }
  });
  socket.on('close', () => {
    for (const controller of requests.values()) controller.abort();
    requests.clear();
    if (!stopped && reconnect) retry = setTimeout(open, 5000);
  });
  };
  open();
  return { get socket() { return currentSocket; }, close: () => { stopped = true; if (retry) clearTimeout(retry); currentSocket.terminate(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const connection = connectPod({ gatewayURL: process.env.GATEWAY_URL, tunnelToken: process.env.POD_TUNNEL_TOKEN,
    podToken: process.env.FREE_SLEEP_API_TOKEN });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => connection.close());
}
