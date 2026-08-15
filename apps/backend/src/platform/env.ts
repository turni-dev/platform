import { z } from 'zod';

const HttpEnvSchema = z.object({
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  WIDGET_SESSION_SECRET: z.string().min(32),
  WIDGET_ROUTING_SECRET: z.string().min(32),
  OWNER_AUTH_SECRET: z.string().min(32),
  /** Signs the routing key inside a provider's callback URL. */
  WEBHOOK_ROUTING_SECRET: z.string().min(32),
  /** The public HTTPS origin a provider calls back on; it is not APP_ORIGIN
   * once the cabinet and the webhook live behind different names. */
  PUBLIC_WEBHOOK_ORIGIN: z.url(),
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASSWORD: z.string().min(1),
  EMAIL_FROM: z.string().trim().min(1).max(320),
  /** The only origin allowed to send cookie-authenticated mutations. */
  APP_ORIGIN: z.url(),
  /** Off only for local HTTP development; every deployed environment serves TLS. */
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true')
}).superRefine((env, context) => {
  const secrets = [
    ['WIDGET_SESSION_SECRET', env.WIDGET_SESSION_SECRET],
    ['WIDGET_ROUTING_SECRET', env.WIDGET_ROUTING_SECRET],
    ['OWNER_AUTH_SECRET', env.OWNER_AUTH_SECRET],
    ['WEBHOOK_ROUTING_SECRET', env.WEBHOOK_ROUTING_SECRET]
  ] as const;

  for (const [name, secret] of secrets) {
    if (secrets.filter(([, candidate]) => candidate === secret).length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Every signing secret must differ',
        path: [name]
      });
    }
  }
});

export type HttpEnv = z.infer<typeof HttpEnvSchema>;

export function readHttpEnv(env: NodeJS.ProcessEnv = process.env): HttpEnv {
  return HttpEnvSchema.parse(env);
}
