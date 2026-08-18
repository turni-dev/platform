export interface RateLimitRule {
  readonly windowMs: number;
  readonly max: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

/**
 * Process-local, fixed-window counter used to rate-limit form submissions.
 *
 * Honest limitation: this counts requests only within the Node process that
 * holds it. There is no Redis in this runtime, so a deployment that runs more
 * than one instance gets one independent counter per instance — the
 * effective limit multiplies by the instance count instead of being a hard
 * global cap. That is an acceptable trade for MVP-1 (blunts scripted floods
 * against a single-instance deployment) but must be revisited before relying
 * on it as a hard limit behind a multi-instance deployment.
 */
export class InMemoryRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweptAt = 0;

  constructor(private readonly rule: RateLimitRule) {}

  consume(key: string, now: number = Date.now()): RateLimitDecision {
    this.sweep(now);

    const entry = this.hits.get(key);
    if (entry === undefined || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.rule.windowMs });

      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count < this.rule.max) {
      entry.count += 1;

      return { allowed: true, retryAfterMs: 0 };
    }

    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  /** Drops expired entries so the map does not grow without bound. */
  private sweep(now: number): void {
    if (now - this.lastSweptAt < this.rule.windowMs) {
      return;
    }
    this.lastSweptAt = now;

    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}

export interface RateLimiter {
  consume(key: string, now?: number): RateLimitDecision;
}

export interface RateLimiters {
  readonly ip: RateLimiter;
  readonly session: RateLimiter;
}

export interface RateLimitIdentity {
  /** Distinguishes forms sharing the same limiter instances, e.g. lead vs feedback vs vote. */
  readonly formName: string;
  readonly ip: string;
  readonly sessionId: string;
}

/**
 * Combines the ip and session limiters: a submission is allowed only when
 * both allow it, so a shared IP (office, NAT) does not let one abusive
 * session hide behind everyone else's headroom, and a rotated session does
 * not let one IP retry past its own limit.
 */
export function decideRateLimit(
  limiters: RateLimiters,
  identity: RateLimitIdentity,
  now: number = Date.now()
): RateLimitDecision {
  const byIp = limiters.ip.consume(`${identity.formName}:ip:${identity.ip}`, now);
  const bySession = limiters.session.consume(`${identity.formName}:session:${identity.sessionId}`, now);

  if (byIp.allowed && bySession.allowed) {
    return { allowed: true, retryAfterMs: 0 };
  }

  return {
    allowed: false,
    retryAfterMs: Math.max(byIp.retryAfterMs, bySession.retryAfterMs)
  };
}
