import { z } from 'zod';

const HttpEnvSchema = z.object({
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000)
});

export type HttpEnv = z.infer<typeof HttpEnvSchema>;

export function readHttpEnv(env: NodeJS.ProcessEnv = process.env): HttpEnv {
  return HttpEnvSchema.parse(env);
}
