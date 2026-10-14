import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionAddress, readConnection, saveConnection, testConnection } from '../src/api/connectionSetup.ts';

const origin = 'http://localhost:5174';
const sample = { id: 'test-pod', timeZone: 'America/Los_Angeles', temperatureFormat: 'fahrenheit',
  left: { name: 'Left', awayMode: false }, right: { name: 'Right', awayMode: false } };
const input = { address: 'https://pod.example', token: '  fake-token  ' };
const signal = () => new AbortController().signal;

test('connection origins reject routes, credentials, mixed content and public HTTP', () => {
  assert.equal(connectionAddress(' HTTPS://POD.EXAMPLE:443/ ', origin).origin, 'https://pod.example');
  assert.deepEqual(connectionAddress('', origin), { origin, savedAddress: '' });
  for (const address of ['http://192.168.1.4:3000', 'http://172.31.0.4', 'http://10.1.2.3', 'http://pod.local']) {
    assert.doesNotThrow(() => connectionAddress(address, origin));
  }
  for (const address of ['http://remote.example', 'http://10.evil.0.0.1', 'http://172.32.0.4', 'https://user:secret@pod.example',
    'https://pod.example/api', 'https://pod.example/%2F', 'https://pod.example?token=secret', 'https://pod.example#secret', 'file:///tmp/x']) {
    assert.throws(() => connectionAddress(address, origin));
  }
  assert.throws(() => connectionAddress('http://pod.local', 'https://web.example'), /HTTPS/);
});

test('demo connection setup never reads credentials, writes storage or calls a server', async () => {
  const forbidden = () => { throw new Error('Real connection accessed'); };
  const storage = { local: { getItem: forbidden, setItem: forbidden }, session: { getItem: forbidden, setItem: forbidden } };
  assert.equal(readConnection(storage, true).token, '');
  saveConnection(storage, input, 'https://web.example', true);
  assert.deepEqual(await testConnection(input, origin, true, signal(), forbidden), { id: 'Demo Pod', timeZone: 'America/Los_Angeles' });
});

test('saving normalizes only the selected origin and restores the old pair after a storage failure', () => {
  const values = new Map([['freeSleepURL', 'https://old.example'], ['freeSleepToken', 'old-token']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let fail = true;
  const local = { ...storage, setItem: (key, value) => { if (fail) { fail = false; throw new Error('Quota'); } storage.setItem(key, value); } };
  assert.throws(() => saveConnection({ local, session: storage }, input, origin, false), /could not save/);
  assert.deepEqual(readConnection({ local, session: storage }, false), { address: 'https://old.example', token: 'old-token' });
  saveConnection({ local, session: storage }, { ...input, address: 'https://POD.example/' }, origin, false);
  assert.deepEqual(readConnection({ local, session: storage }, false), { address: 'https://pod.example', token: 'fake-token' });
});

test('connection probe uses only a bounded settings read and reports authentication, offline and invalid APIs', async () => {
  let observed;
  const result = await testConnection(input, origin, false, signal(), async (url, options) => {
    observed = { url, options }; return Response.json(sample);
  });
  assert.deepEqual(result, { id: sample.id, timeZone: sample.timeZone });
  assert.equal(observed.url, 'https://pod.example/api/settings');
  assert.equal(observed.options.method, 'GET'); assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.credentials, 'omit'); assert.equal(observed.options.headers.Authorization, 'Bearer fake-token');
  for (const [status, message] of [[401, /token/], [403, /token/], [503, /unavailable/], [500, /HTTP 500/]]) {
    await assert.rejects(testConnection(input, origin, false, signal(), async () => new Response('', { status })), message);
  }
  for (const response of [new Response('<html>Login</html>'), Response.json({}), Response.json({ ...sample, timeZone: 'invalid-zone' }),
    Response.json({ ...sample, id: '' }), Response.json({ ...sample, padding: 'x'.repeat(100_001) })]) {
    await assert.rejects(testConnection(input, origin, false, signal(), async () => response));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(testConnection(input, origin, false, controller.signal, async (_url, options) => {
    options.signal.throwIfAborted(); return Response.json(sample);
  }), { name: 'AbortError' });
});
