import { z } from 'zod';

const HttpEnvSchema = z.object({
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  WIDGET_SESSION_SECRET: z.string().min(32),
  WIDGET_ROUTING_SECRET: z.string().min(32)
}).superRefine((env, context) => {
  if (env.WIDGET_SESSION_SECRET === env.WIDGET_ROUTING_SECRET) {
    context.addIssue({
      code: 'custom',
      message: 'WIDGET_SESSION_SECRET and WIDGET_ROUTING_SECRET must differ',
      path: ['WIDGET_ROUTING_SECRET']
    });
  }
});

export type HttpEnv = z.infer<typeof HttpEnvSchema>;

export function readHttpEnv(env: NodeJS.ProcessEnv = process.env): HttpEnv {
  return HttpEnvSchema.parse(env);
}
