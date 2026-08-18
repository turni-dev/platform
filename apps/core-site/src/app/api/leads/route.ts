import { InMemoryRateLimiter } from '../../../anti-abuse/rate-limit';
import { handleLeadRequest } from '../../../leads/lead-intake';

export const dynamic = 'force-dynamic';

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

export function POST(request: Request): Promise<Response> {
  return handleLeadRequest(request, {
    baseUrl: process.env['CMS_BASE_URL'],
    // Ключ записи живёт только на сервере: в браузер он не попадает.
    apiToken: process.env['CMS_WRITE_TOKEN'],
    fetch: (url, init) => fetch(url, init),
    rateLimit,
    onWarning: (message) => {
      console.warn(message);
    }
  });
}
