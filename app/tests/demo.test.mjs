import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { http, HttpResponse } from 'msw/http';
import { createDemoAdapter } from '../src/mocks/demoAdapter.ts';

test('demo requests resolve locally even with a saved real Pod address or missing mock route', async () => {
  let observed;
  const client = axios.create({ baseURL: 'http://192.0.2.1:1/api/', headers: { Authorization: 'Bearer private-test-token' },
    adapter: createDemoAdapter([http.post('/api/comfort', async ({ request }) => {
      observed = { url: request.url, authorization: request.headers.get('authorization'), body: await request.json() };
      return HttpResponse.json({ saved: true });
    })], 'http://demo.invalid') });
  assert.deepEqual((await client.post('comfort', { side: 'left' })).data, { saved: true });
  assert.deepEqual(observed, { url: 'http://demo.invalid/api/comfort', authorization: null, body: { side: 'left' } });
  await assert.rejects(client.post('unhandled'), error => error.response.status === 404);
});
