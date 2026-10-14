import type { ControlSource, DeviceUpdate } from './types.js';
import type { DispatchGuard } from '../control/dispatchGuard.js';

type Apply = (command: DeviceUpdate, notAfter?: number) => Promise<void>;
type Handler = (command: DeviceUpdate, source: ControlSource, apply: Apply, assertCurrent?: DispatchGuard) => Promise<void>;
let handler: Handler | null = null;
export function registerComfortController(controller: Handler) { handler = controller; }
export function coordinateTemperature(command: DeviceUpdate, source: ControlSource, apply: Apply, assertCurrent?: DispatchGuard) {
  assertCurrent?.();
  if (handler) return handler(command, source, apply, assertCurrent);
  return source === 'adaptive' ? Promise.resolve() : apply(command);
}
