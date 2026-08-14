import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { KeyValueCachePort } from '../../../platform/cache/key-value-cache.port.js';
import { normalizeOwnerEmail } from '../domain/owner-auth-challenge.js';

export const ownerAuthResendCooldownMs = 60 * 1000;
export const ownerAuthWindowMs = 15 * 60 * 1000;
export const maxOwnerAuthRequestsPerEmail = 5;
export const maxOwnerAuthRequestsPerIp = 20;

const keyPrefix = 'owner-auth';

const RequestSchema = z.strictObject({
  email: z.string(),
  ip: z.string().trim().min(1).max(45),
  now: z.date()
});

export type OwnerAuthThrottleDecision =
  | { readonly allowed: true; readonly resendAfterSeconds: number }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Cooldown and window limits for owner code requests. Every branch that cannot
 * prove the request is within its limits denies it, including cache failure.
 */
export class OwnerAuthThrottle {
  public constructor(
    private readonly cache: KeyValueCachePort,
    private readonly secret: string
  ) {}

  public async requestCode(
    input: Readonly<{ email: string; ip: string; now: Date }>
  ): Promise<OwnerAuthThrottleDecision> {
    const request = RequestSchema.parse(input);
    const email = normalizeOwnerEmail(request.email);
    const cooldownKey = this.key('cooldown', email);

    try {
      if (!(await this.cache.setIfAbsent(cooldownKey, ownerAuthResendCooldownMs))) {
        return this.denied(await this.cache.pttl(cooldownKey));
      }

      const perEmail = await this.cache.incrementWithin(
        this.key('email', email),
        ownerAuthWindowMs
      );
      const perIp = await this.cache.incrementWithin(
        this.key('ip', request.ip),
        ownerAuthWindowMs
      );

      if (perEmail > maxOwnerAuthRequestsPerEmail || perIp > maxOwnerAuthRequestsPerIp) {
        return this.denied(ownerAuthWindowMs);
      }
    } catch {
      return this.denied(ownerAuthResendCooldownMs);
    }

    return {
      allowed: true,
      resendAfterSeconds: ownerAuthResendCooldownMs / 1_000
    };
  }

  private denied(remainingMs: number): OwnerAuthThrottleDecision {
    const boundedMs =
      remainingMs > 0 && remainingMs <= ownerAuthWindowMs
        ? remainingMs
        : ownerAuthResendCooldownMs;

    return { allowed: false, retryAfterSeconds: Math.ceil(boundedMs / 1_000) };
  }

  private key(scope: string, value: string): string {
    const digest = createHmac('sha256', this.secret)
      .update(`${scope}:${value}`)
      .digest('base64url');

    return `${keyPrefix}:${scope}:${digest}`;
  }
}
