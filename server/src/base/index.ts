import { readFile } from 'node:fs/promises';
import express from 'express';
import { z } from 'zod';
import { BluezBaseTransport } from './bluez.js';
import { BaseController } from './controller.js';
import { BASE_PRESETS, basePositionSchema } from './types.js';

export const baseController = new BaseController(new BluezBaseTransport(), async () => {
  const path = process.env.BASE_CONFIG_PATH || '/persistent/AdjustableBaseConfiguration.json';
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
});
const router = express.Router();
router.get('/', (_request, response) => response.json({ ...baseController.status(), presets: BASE_PRESETS }));
router.post('/connect', async (_request, response) => response.json(await baseController.connect()));
router.post('/position', async (request, response) => {
  const result = basePositionSchema.safeParse(request.body);
  if (!result.success) return response.status(400).json({ error: { message: 'Invalid head, feet or speed' } });
  response.json(await baseController.move(result.data));
});
router.post('/preset', async (request, response) => {
  const result = z
    .object({ preset: z.enum(['flat', 'sleep', 'relax', 'read']) })
    .strict()
    .safeParse(request.body);
  if (!result.success) return response.status(400).json({ error: { message: 'Unknown base preset' } });
  response.json(await baseController.move(BASE_PRESETS[result.data.preset]));
});
router.post('/stop', async (_request, response) => response.json(await baseController.stop()));
export default router;
