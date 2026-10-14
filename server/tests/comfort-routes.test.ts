import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { comfortRoutes } from '../src/thermal/routes.js';
import { ComfortController } from '../src/thermal/controller.js';
import { defaultComfortState } from '../src/thermal/types.js';

test('comfort HTTP mode edits validate strictly, preserve limits and propagate storage failures', async context => {
  const persisted = { left: defaultComfortState(), right: defaultComfortState() };
  let writes = 0;
  let failing = false;
  const controller = new ComfortController({ read: async () => structuredClone(persisted), write: async () => {
    writes += 1;
    if (failing) throw new Error('test storage failed');
  } }, async () => { throw new Error('must not request hardware'); });
  const app = express(); app.use(express.json()); app.use('/api/comfort', comfortRoutes(controller));
  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: { message: error.message } });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}/api/comfort`;
  const post = (route: string, body: unknown) => fetch(origin + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const body of [{}, { side: 'both', mode: 'active' }, { side: 'left', mode: 'unknown' },
    { side: 'left', mode: 'preview', minimumF: 50 }, { side: 'left', mode: 'active', reset: true }]) {
    assert.equal((await post('/mode', body)).status, 400);
  }
  assert.equal(writes, 0);
  const configured = await post('', { side: 'right', config: { mode: 'off', minimumF: 77, maximumF: 89 } });
  assert.equal(configured.status, 200);
  for (const mode of ['preview', 'active', 'off']) {
    const saved = await post('/mode', { side: 'right', mode });
    assert.equal(saved.status, 204); assert.equal(await saved.text(), '');
    const status = await (await fetch(origin + '?side=right')).json();
    assert.deepEqual(status.config, { mode, minimumF: 77, maximumF: 89 });
  }
  assert.deepEqual((await (await fetch(origin + '?side=left')).json()).config, persisted.left.config);
  assert.equal((await fetch(origin + '/mode')).status, 404);
  failing = true;
  assert.equal((await post('/mode', { side: 'left', mode: 'preview' })).status, 500);
  assert.equal((await post('/mode', { side: 'left', mode: 'active' })).status, 500);
});
