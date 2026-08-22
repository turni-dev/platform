import { z } from 'zod';

export const HealthStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('turni-backend')
});

/**
 * The `/readyz` success body: liveness plus a per-dependency verdict, so a
 * caller can tell "the process is up" (`/healthz`) apart from "the process
 * can actually serve traffic" (`/readyz`).
 */
export const ReadinessStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('turni-backend'),
  checks: z.object({
    database: z.literal('ok')
  })
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type ReadinessStatus = z.infer<typeof ReadinessStatusSchema>;
