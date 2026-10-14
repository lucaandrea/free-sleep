
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="c07851ee-8c70-5fc1-aa25-ba1d06c02bb9")}catch(e){}}();
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
const identitySchema = z.object({
    id: z.string().uuid(),
    username: z.string().regex(/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i),
    pin: z.string().regex(/^\d{3}-\d{2}-\d{3}$/),
});
async function readIdentity(filename) {
    try {
        return identitySchema.parse(JSON.parse(await readFile(filename, 'utf8')));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw error;
        throw new Error('HomeKit identity cannot be read; restore its backup', { cause: error });
    }
}
// Link a complete private file into place without replacing an existing pairing identity.
export async function loadHomeKitIdentity(storage) {
    await mkdir(storage, { recursive: true, mode: 0o700 });
    const filename = path.join(storage, 'identity.json');
    try {
        return await readIdentity(filename);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    let digits;
    do {
        digits = String(randomInt(10000000, 100000000));
    } while (/^(.)\1{7}$/.test(digits) || ['12345678', '87654321'].includes(digits));
    const identity = {
        id: randomUUID(),
        username: 'C2:' + randomBytes(5).toString('hex').match(/.{2}/g).join(':').toUpperCase(),
        pin: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`,
    };
    const temporary = path.join(storage, `.identity-${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
        try {
            await link(temporary, filename);
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        return await readIdentity(filename);
    }
    finally {
        await unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT')
                throw error;
        });
    }
}
// HAP storage is a process singleton and rejects reconfiguration after the first publication.
export function createHomeKitPreparation(storage, configureStorage) {
    let configured = false;
    return async () => {
        const identity = await loadHomeKitIdentity(storage);
        if (!configured) {
            configureStorage(storage);
            configured = true;
        }
        return identity;
    };
}
//# sourceMappingURL=identity.js.map
//# debugId=c07851ee-8c70-5fc1-aa25-ba1d06c02bb9
