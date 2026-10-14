
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="5238bb09-9ef9-533f-a45b-7c338fd497cc")}catch(e){}}();
import express from 'express';
import cors from 'cors';
import logger from '../logger.js';
import { authenticateAPI } from './authentication.js';
import os from 'os';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        const networkInterface = interfaces[interfaceName];
        if (!networkInterface)
            continue;
        for (const network of networkInterface) {
            if (network.family === 'IPv4' && !network.internal) {
                return network.address;
            }
        }
    }
    return 'localhost'; // Default to localhost if LAN IP isn't found
}
/**
 * Check if the request origin is allowed, i.e., from localhost or LAN IP, or
 * exactly matches `ALLOWED_ORIGIN`. The function also allows
 * requests with no origin (e.g., `curl`).
 *
 * @param origin - The origin to check.
 * @returns True if the origin is allowed, false otherwise.
 */
function isAllowedOrigin(origin) {
    if (!origin)
        return true;
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN)
        return true;
    try {
        const url = new URL(origin);
        if (!['http:', 'https:'].includes(url.protocol))
            return false;
        const host = url.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === getLocalIp())
            return true;
        const octets = host.split('.').map(Number);
        if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255))
            return false;
        return octets[0] === 10 || (octets[0] === 192 && octets[1] === 168)
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
    }
    catch {
        return false;
    }
}
export default function (app) {
    app.use((req, res, next) => {
        const startTime = Date.now();
        // Hook into the response `finish` event to log after the response is sent
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        });
        next();
    });
    app.use(express.json({ limit: '1mb' }));
    // Allow local development
    app.use(cors({
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        }
    }));
    app.use('/api', authenticateAPI);
    // Logging
    app.use((req, res, next) => {
        const clientIp = req.headers['x-forwarded-for'] || req.ip;
        const method = req.method;
        const endpoint = req.originalUrl;
        logger.debug(`${method} ${endpoint} - IP: ${clientIp}`);
        next();
    });
}
//# sourceMappingURL=middleware.js.map
//# debugId=5238bb09-9ef9-533f-a45b-7c338fd497cc
