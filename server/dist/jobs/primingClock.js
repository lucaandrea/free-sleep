// Daily wall-clock times wrap across midnight in the Pod timezone.

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="e890317d-fea6-5f0b-9cf5-eee37cdb0bf7")}catch(e){}}();
export function primingClock(time) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new Error('Choose a valid daily time');
    const [hour, minute] = time.split(':').map(Number);
    return { hour, minute, rebootHour: (hour + 23) % 24 };
}
//# sourceMappingURL=primingClock.js.map
//# debugId=e890317d-fea6-5f0b-9cf5-eee37cdb0bf7
