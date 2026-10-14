
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="eb1e18dc-f92d-5d4c-a76f-c17e039e60c1")}catch(e){}}();
import { HEAD_TICKS, FEET_TICKS } from './calibration.js';
export function checksumPacket(payload) {
    const packet = Buffer.alloc(payload.length + 2);
    packet.set(payload);
    packet.writeUInt16LE(payload.reduce((total, value) => total + value, 0) & 65535, payload.length);
    return packet;
}
export function movePacket(axis, degrees, speed) {
    const calibration = axis === 'head' ? HEAD_TICKS : FEET_TICKS;
    if (!Number.isInteger(degrees) ||
        degrees < 0 ||
        degrees >= calibration.length ||
        !Number.isInteger(speed) ||
        speed < 30 ||
        speed > 100)
        throw new RangeError('Invalid base position or speed');
    const payload = Buffer.alloc(18);
    payload.set([255, 255, 255, 255, 1, 0, 33, 20, speed, axis === 'head' ? 6 : 5]);
    payload.writeUInt16LE(calibration[degrees], 10);
    return checksumPacket(payload);
}
export const stopPacket = () => checksumPacket(Uint8Array.from([255, 255, 255, 255, 5, 0, 0, 0, 0, 215, 0]));
function closestAngle(ticks, calibration) {
    let nearest = 0;
    for (let angle = 1; angle < calibration.length; angle++) {
        if (Math.abs(calibration[angle] - ticks) < Math.abs(calibration[nearest] - ticks))
            nearest = angle;
    }
    return nearest;
}
// Consume fragmented notifications with a bounded buffer and recover after corrupt packets.
export class BaseDecoder {
    pending = [];
    push(bytes) {
        const positions = [];
        for (const value of bytes) {
            this.pending.push(value);
            if (this.pending.length < 20)
                continue;
            const packet = Buffer.from(this.pending);
            const checksum = packet.subarray(0, 18).reduce((total, byte) => total + byte, 0) & 65535;
            if (packet.readUInt32BE(0) !== 0xffffffff || packet.readUInt16LE(18) !== checksum) {
                this.pending.shift();
                continue;
            }
            this.pending = [];
            if (packet[6] !== 34)
                continue;
            const ticks = [9, 11, 13, 15].map((offset) => packet.readUInt16LE(offset));
            if (ticks[0] > 1806 || ticks[2] > 1806 || ticks[1] > 2253 || ticks[3] > 2253)
                continue;
            positions.push({
                left: { head: closestAngle(ticks[1], HEAD_TICKS), feet: closestAngle(ticks[0], FEET_TICKS) },
                right: { head: closestAngle(ticks[3], HEAD_TICKS), feet: closestAngle(ticks[2], FEET_TICKS) },
                ticks,
            });
        }
        return positions;
    }
}
//# sourceMappingURL=protocol.js.map
//# debugId=eb1e18dc-f92d-5d4c-a76f-c17e039e60c1
