import type { ControlSource, DeviceUpdate } from './types.js';

type Apply = (command: DeviceUpdate, notAfter?: number) => Promise<void>;
type Handler = (command: DeviceUpdate, source: ControlSource, apply: Apply) => Promise<void>;
let handler: Handler | null = null;
export function registerComfortController(controller: Handler) { handler = controller; }
export function coordinateTemperature(command: DeviceUpdate, source: ControlSource, apply: Apply) {
  if (handler) return handler(command, source, apply);
  return source === 'adaptive' ? Promise.resolve() : apply(command);
}
