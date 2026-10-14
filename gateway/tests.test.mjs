import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGateway } from './server.mjs';
import { connectPod } from './agent.mjs';
import { allowedRequest, authorized, boundedResponse, MAX_BODY } from './policy.mjs';
const accessToken = 'a'.repeat(40), tunnelToken = 'b'.repeat(40);
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

test('allowlist excludes maintenance, encoded paths and origin escapes', () => {
  for (const route of ['/api/jobs', '/api/logs/x', '/api/base/%73top', '//example.com/api/base', '/api/../jobs']) {
    assert.equal(allowedRequest('POST', route), false, route);
  }
  assert.equal(allowedRequest('GET', '/api/analytics?side=left&days=30'), true);
  assert.equal(allowedRequest('POST', '/api/base/stop'), true);
  assert.equal(authorized(accessToken, accessToken), false);
  assert.equal(authorized(`Bearer ${accessToken}x`, accessToken), false);
  assert.throws(() => createGateway({ accessToken, tunnelToken: accessToken }));
});

test('gateway authenticates, refuses offline operations, and bounds uploads', async context => {
  const gateway = createGateway({ accessToken, tunnelToken });
  const origin = await listen(gateway.server); context.after(() => gateway.close());
  assert.equal((await fetch(`${origin}/api/base`)).status, 401);
  assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal((await fetch(`${origin}/api/base`, { headers })).status, 503);
  assert.equal((await fetch(`${origin}/api/base/stop`, { method: 'POST', headers, body: 'x'.repeat(MAX_BODY + 1) })).status, 413);
});

test('outbound agent preserves queries, method, JSON and uses only the local token', async context => {
  const received = [];
  const pod = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => { received.push({ route: request.url, method: request.method, authorization: request.headers.authorization, body });
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ accepted: true })); });
  });
  const podURL = await listen(pod); context.after(() => new Promise(resolve => pod.close(resolve)));
  const gateway = createGateway({ accessToken, tunnelToken });
  const origin = await listen(gateway.server); context.after(() => gateway.close());
  const agent = connectPod({ gatewayURL: origin.replace('http:', 'ws:') + '/tunnel', tunnelToken, podToken: 'local-secret', podURL, reconnect: false });
  context.after(() => agent.close()); await once(agent.socket, 'open');
  const response = await fetch(`${origin}/api/base/position?side=left`, { method: 'POST', headers, body: '{"head":10,"feet":5}' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { accepted: true });
  assert.deepEqual(received, [{ route: '/api/base/position?side=left', method: 'POST', authorization: 'Bearer local-secret', body: '{"head":10,"feet":5}' }]);
});

test('disconnected commands fail promptly and are never replayed to a new agent', async context => {
  const gateway = createGateway({ accessToken, tunnelToken, timeout: 1000 });
  const origin = await listen(gateway.server); context.after(() => gateway.close());
  const endpoint = origin.replace('http:', 'ws:') + '/tunnel';
  const first = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${tunnelToken}` } });
  await once(first, 'open');
  const message = once(first, 'message');
  const request = fetch(`${origin}/api/base/position`, { method: 'POST', headers, body: '{"head":10,"feet":5}' });
  await message; first.close();
  assert.equal((await request).status, 503);
  const second = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${tunnelToken}` } });
  context.after(() => second.terminate()); await once(second, 'open');
  let replayed = false; second.on('message', () => { replayed = true; });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(replayed, false);
});

test('timed-out requests issue cancellation and bounded responses reject oversized data', async context => {
  const gateway = createGateway({ accessToken, tunnelToken, timeout: 40 });
  const origin = await listen(gateway.server); context.after(() => gateway.close());
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/tunnel', { headers: { Authorization: `Bearer ${tunnelToken}` } });
  context.after(() => socket.terminate()); await once(socket, 'open');
  const messages = []; socket.on('message', bytes => messages.push(JSON.parse(bytes)));
  const result = await fetch(`${origin}/api/base`, { headers });
  assert.equal(result.status, 504);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(messages[1].type, 'cancel'); assert.equal(messages[0].id, messages[1].id);
  await assert.rejects(boundedResponse(new Response('x'.repeat(MAX_BODY + 1))), /too large/);
});
