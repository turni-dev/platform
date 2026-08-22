import { z } from 'zod';

/**
 * The site's two narrow CMS tokens. Both are optional at the schema level —
 * the site must keep working on seed content when neither is configured
 * (local dev without a running Strapi) — but the two must never collapse
 * into one: see `apps/cms/README.md` for how each is scoped in the Strapi
 * admin.
 *
 * `CMS_READ_TOKEN` — read-only in Strapi: `find`/`findOne` on pages,
 * site-settings, navigation, booking-slot availability and the integration
 * catalog. No `create`/`update`/`delete` on anything.
 *
 * `CMS_WRITE_TOKEN` — write-only in Strapi: `create` on `lead` (and
 * `feedback`, once that content type exists) plus the custom booking-slot
 * `reserve` action. Deliberately excludes `find`/`findOne` on `lead` — the
 * site never reads back other visitors' submissions with this token; its own
 * duplicate-submission check runs in-process instead (see
 * `../anti-abuse/idempotency.ts`).
 */
/**
 * An unset or blank variable both mean "not configured" throughout this repo
 * (compose falls back to `${VAR:-}`, which is an empty string, not an unset
 * variable) — treat them the same before the shape-specific check runs, so a
 * blank value degrades to seed content instead of failing env parsing.
 */
function blankToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalTrimmed(shape: z.ZodType<string>) {
  return z.preprocess(blankToUndefined, shape.optional());
}

const CmsEnvSchema = z.object({
  CMS_BASE_URL: optionalTrimmed(z.url()),
  CMS_READ_TOKEN: optionalTrimmed(z.string().min(1)),
  CMS_WRITE_TOKEN: optionalTrimmed(z.string().min(1)),
  /** Address of the customer cabinet; unset until it ships. */
  CABINET_BASE_URL: optionalTrimmed(z.url())
});

export type CmsEnv = z.infer<typeof CmsEnvSchema>;

export function readCmsEnv(env: Readonly<Record<string, string | undefined>> = process.env): CmsEnv {
  return CmsEnvSchema.parse(env);
}
