// Daily wall-clock times wrap across midnight in the Pod timezone.
export function primingClock(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid daily time');
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute, rebootHour: (hour + 23) % 24 };
}
