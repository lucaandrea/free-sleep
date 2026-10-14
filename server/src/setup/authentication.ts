import { timingSafeEqual } from 'node:crypto';
import { RequestHandler } from 'express';

// Preserve existing LAN installations; remote deployments must configure this token.
export const authenticateAPI: RequestHandler = (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  const expected = process.env.FREE_SLEEP_API_TOKEN;
  if (!expected) return next();
  // Existing Python biometrics and root helper scripts use these loopback-only endpoints.
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
  const internalPath = request.path === '/services' || request.path === '/metrics/presence'
    || (request.path === '/deviceStatus' && request.method === 'GET');
  if (loopback && internalPath && !request.get('Origin')) return next();
  const header = request.get('Authorization');
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    response.status(401).json({ error: { message: 'Enter your Free Sleep connection token' } });
    return;
  }
  next();
};
