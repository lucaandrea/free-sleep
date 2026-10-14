import { z } from 'zod';
import { basePositionSchema } from '../../base/types.js';
import { DeviceStatusSchema } from '../../routes/deviceStatus/deviceStatusSchema.js';

export const REQUEST_TIMEOUT_MS = 8000;
export const HOMEKIT_FAILURE = -70402;
export const HOMEKIT_BUSY = -70403;
export const bridgeConfigurationSchema = z.object({
  storage: z.string().min(1).max(4096),
  port: z.number().int().min(1).max(65535),
  bind: z.string().ip().optional(),
}).strict();
export type BridgeConfiguration = z.infer<typeof bridgeConfigurationSchema>;

export const bridgeStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(['disabled', 'stopped', 'starting', 'running', 'stopping', 'error']),
  running: z.boolean(),
  pairingCode: z.string().regex(/^\d{3}-\d{2}-\d{3}$/).nullable(),
  setupURI: z.string().max(100).nullable(),
  error: z.string().max(1024).nullable(),
}).strict().refine(status => status.running === (status.state === 'running')
  && (status.running || (status.pairingCode === null && status.setupURI === null)));
export type HomeKitBridgeStatus = z.infer<typeof bridgeStatusSchema>;

const sideUpdate = z.union([
  z.object({ targetTemperatureF: z.number().finite().min(55).max(110) }).strict(),
  z.object({ isOn: z.boolean() }).strict(),
]);
const updateSchema = z.union([
  z.object({ left: sideUpdate }).strict(), z.object({ right: sideUpdate }).strict(),
  z.object({ isPriming: z.literal(true) }).strict(),
]);
export const homeKitCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }).strict(),
  z.object({ action: z.literal('update'), update: updateSchema }).strict(),
  z.object({ action: z.literal('move'), position: basePositionSchema }).strict(),
  z.object({ action: z.literal('stop') }).strict(),
]);
export type HomeKitCommand = z.infer<typeof homeKitCommandSchema>;
const requestId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const childMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('status'), status: bridgeStatusSchema }).strict(),
  z.object({ type: z.literal('request'), requestId, deadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    command: homeKitCommandSchema }).strict(),
  z.object({ type: z.literal('cancel'), requestId }).strict(),
  z.object({ type: z.literal('fatal'), code: z.enum(['EADDRINUSE', 'EACCES', 'EAFNOSUPPORT', 'UNKNOWN']) }).strict(),
]);
export type ChildMessage = z.infer<typeof childMessageSchema>;
export const parentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), configuration: bridgeConfigurationSchema }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
  z.object({ type: z.literal('response'), requestId, result: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: DeviceStatusSchema.nullable() }).strict(),
    z.object({ ok: z.literal(false), code: z.union([z.literal(HOMEKIT_FAILURE), z.literal(HOMEKIT_BUSY)]) }).strict(),
  ]) }).strict(),
]);
export type ParentMessage = z.infer<typeof parentMessageSchema>;
