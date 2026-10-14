import express from 'express';
import { presenceMonitor, presenceSchema } from '../../thermal/presence.js';

const router = express.Router();
router.post('/presence', (request, response) => {
  const parsed = presenceSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: { message: 'Provide a boolean presence reading for at least one side' } });
  return response.json(presenceMonitor.update(parsed.data));
});
router.get('/presence', (_request, response) => response.json(presenceMonitor.read()));
export default router;
