import { z } from 'zod';

export const HealthStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('turni-backend')
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
