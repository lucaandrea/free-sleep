import express from 'express';
import { homeKitStatus } from './homekit.js';
const router = express.Router();
router.get('/homekit', (_request, response) => response.json(homeKitStatus()));
export default router;
