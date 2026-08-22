import { InMemoryIdempotencyKeyStore } from '../../../anti-abuse/idempotency';
import { InMemoryRateLimiter } from '../../../anti-abuse/rate-limit';
import { readCmsEnv } from '../../../config/cms-env';
import { handleLeadRequest } from '../../../leads/lead-intake';

export const dynamic = 'force-dynamic';

const env = readCmsEnv();

// Created once, at module scope, so counts accumulate across requests handled
// by this process. There is no Redis in this runtime: a deployment with more
// than one instance gets one independent counter per instance, so the
// effective limit multiplies by the instance count instead of being a hard
// global cap — see apps/core-site/src/anti-abuse/rate-limit.ts.
const rateLimit = {
  ip: new InMemoryRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 }),
  // Tighter than the ip limit: several visitors can share one office/NAT ip,
  // but a single session repeatedly resubmitting is almost always abuse.
  session: new InMemoryRateLimiter({ windowMs: 10 * 60 * 1000, max: 5 })
};

// Also module-scope, for the same reason as `rateLimit` above — see
// apps/core-site/src/anti-abuse/idempotency.ts for why this replaces a CMS
// read: CMS_WRITE_TOKEN is write-only (create on `lead`, no find/findOne),
// so the duplicate-submission pre-check cannot ask the CMS.
const idempotencyStore = new InMemoryIdempotencyKeyStore(10 * 60 * 1000);

export function POST(request: Request): Promise<Response> {
  return handleLeadRequest(request, {
    baseUrl: env.CMS_BASE_URL,
    // Ключ записи живёт только на сервере: в браузер он не попадает.
    // CMS_WRITE_TOKEN даёт в Strapi только create на lead/feedback и
    // резервирование слота — никакого find/findOne на заявки.
    apiToken: env.CMS_WRITE_TOKEN,
    fetch: (url, init) => fetch(url, init),
    rateLimit,
    idempotencyStore,
    onWarning: (message) => {
      console.warn(message);
    }
  });
}
