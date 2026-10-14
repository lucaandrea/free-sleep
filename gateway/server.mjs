import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { authorized, allowedRequest, MAX_BODY } from './policy.mjs';

export function createGateway({ accessToken, tunnelToken, publicPath, timeout = 50000 }) {
  if (!accessToken || !tunnelToken || accessToken.length < 32 || tunnelToken.length < 32 || accessToken === tunnelToken) {
    throw new Error('Configure distinct GATEWAY_ACCESS_TOKEN and POD_TUNNEL_TOKEN secrets, each at least 32 characters');
  }
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY + 8192, perMessageDeflate: false });
  let agent = null;
  let alive = false;
  const pending = new Map();
  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api', (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!authorized(request.get('Authorization'), accessToken)) {
      return response.status(401).json({ error: { message: 'Enter your gateway connection token in Settings' } });
    }
    if (!allowedRequest(request.method, request.originalUrl)) {
      return response.status(403).json({ error: { message: 'This operation is available only on your local Pod' } });
    }
    next();
  }, express.text({ type: '*/*', limit: MAX_BODY }), (request, response) => {
    if (!agent || agent.readyState !== WebSocket.OPEN) return response.status(503).json({ error: { message: 'Your Pod is offline' } });
    if (pending.size >= 32) return response.status(429).json({ error: { message: 'Too many requests; please wait' } });
    const id = randomUUID();
    const socket = agent;
    const timer = setTimeout(() => {
      pending.delete(id);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel', id }));
      response.status(504).json({ error: { message: 'Pod response timed out. Commands are never replayed automatically.' } });
    }, timeout);
    pending.set(id, { response, timer, socket });
    response.on('close', () => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel', id }));
    });
    socket.send(JSON.stringify({ type: 'request', id, method: request.method, path: request.originalUrl, body: request.body || '' }));
  });
  app.use((error, _request, response, _next) => {
    response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: { message: 'Invalid request body' } });
  });
  if (publicPath) {
    app.use(express.static(publicPath, { dotfiles: 'deny', setHeaders: response => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
    } }));
    app.get('/{*path}', (_request, response) => response.sendFile('index.html', { root: publicPath }));
  }
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/tunnel' || !authorized(request.headers.authorization, tunnelToken) || agent) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return;
    }
    sockets.handleUpgrade(request, socket, head, connected => sockets.emit('connection', connected));
  });
  sockets.on('connection', socket => {
    agent = socket; alive = true;
    socket.on('pong', () => { alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('message', bytes => {
      let message;
      try { message = JSON.parse(bytes.toString());
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid message');
    } catch { socket.close(1008, 'Invalid message'); return; }
      const waiting = pending.get(message.id);
      if (!waiting || waiting.socket !== socket || message.type !== 'response') return;
      if (!Number.isInteger(message.status) || message.status < 200 || message.status > 599
          || typeof message.body !== 'string' || Buffer.byteLength(message.body) > MAX_BODY) {
        socket.close(1008, 'Invalid response'); return;
      }
      pending.delete(message.id); clearTimeout(waiting.timer);
      waiting.response.status(message.status).type('application/json').send(message.body);
    });
    socket.on('close', () => {
      if (agent === socket) agent = null;
      for (const [id, waiting] of pending) {
        if (waiting.socket !== socket) continue;
        clearTimeout(waiting.timer); pending.delete(id);
        waiting.response.status(503).json({ error: { message: 'Pod disconnected. Check its state before retrying a command.' } });
      }
    });
  });
  const heartbeat = setInterval(() => {
    if (!agent) return;
    if (!alive) { agent.terminate(); return; }
    alive = false; agent.ping();
  }, 20000);
  heartbeat.unref();
  return { server, close: async () => {
    clearInterval(heartbeat); agent?.terminate(); sockets.close();
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.response.destroy(); }
    pending.clear();
    await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gateway = createGateway({ accessToken: process.env.GATEWAY_ACCESS_TOKEN, tunnelToken: process.env.POD_TUNNEL_TOKEN,
    publicPath: fileURLToPath(new URL('../server/public', import.meta.url)) });
  gateway.server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void gateway.close(); });
}
