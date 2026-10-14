import { z } from 'zod';

export const basePositionSchema = z
  .object({
    head: z.number().int().min(0).max(60),
    feet: z.number().int().min(0).max(45),
    speed: z.number().int().min(30).max(100).default(50),
  })
  .strict();
export type BasePosition = z.infer<typeof basePositionSchema>;
export const baseConfigurationSchema = z.object({
  Address: z
    .string()
    .regex(/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i)
    .transform((address) => address.toUpperCase()),
  SplitBase: z.boolean(),
});
export type BaseConfiguration = z.infer<typeof baseConfigurationSchema>;
export const BASE_PRESETS = {
  flat: { head: 0, feet: 0, speed: 50 },
  sleep: { head: 1, feet: 5, speed: 50 },
  relax: { head: 30, feet: 15, speed: 50 },
  read: { head: 40, feet: 0, speed: 50 },
} satisfies Record<string, BasePosition>;
export interface BaseTelemetry {
  left: { head: number; feet: number };
  right: { head: number; feet: number };
  ticks: number[];
}
export interface BaseTransport {
  connect(configuration: BaseConfiguration, onData: (bytes: Uint8Array) => void, onError: (error: Error) => void): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  close(): void;
}
export class BaseError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
