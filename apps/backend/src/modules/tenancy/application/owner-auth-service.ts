import {
  OwnerAuthChallengeSchema,
  OwnerIdentitySchema,
  OwnerRole,
  type OwnerAuthChallenge,
  type OwnerIdentity
} from '@turni/contracts';
import { z } from 'zod';
import {
  decideOwnerAuthChallenge,
  generateOwnerAuthCode,
  hashOwnerAuthCode,
  normalizeOwnerEmail,
  ownerAuthChallengeLifetimeMs
} from '../domain/owner-auth-challenge.js';
import type { OwnerAuthChallengeStorePort } from './owner-auth-challenge-store.port.js';
import type { OwnerAuthNotifierPort } from './owner-auth-notifier.port.js';
import type { OwnerAuthThrottle } from './owner-auth-throttle.js';
import type { OwnerRegistrationRepositoryPort } from './owner-registration-repository.port.js';
import type { IssuedOwnerSession, OwnerSessionService } from './owner-session.js';
import type { OwnerSessionIdGeneratorPort } from './owner-session-store.port.js';

export const OwnerAuthErrorCode = {
  RateLimited: 'rate_limited',
  InvalidCode: 'invalid_code',
  DeliveryFailed: 'delivery_failed'
} as const;

export type OwnerAuthErrorCode =
  (typeof OwnerAuthErrorCode)[keyof typeof OwnerAuthErrorCode];

/** Carries no account-existence signal: the HTTP layer maps it to a generic problem. */
export class OwnerAuthError extends Error {
  public constructor(
    public readonly code: OwnerAuthErrorCode,
    public readonly retryAfterSeconds?: number
  ) {
    super(
      code === OwnerAuthErrorCode.InvalidCode
        ? 'Invalid owner auth code'
        : `Owner auth request refused: ${code}`
    );
    this.name = 'OwnerAuthError';
  }
}

const RequestCodeSchema = z.strictObject({
  email: z.string(),
  ip: z.string().trim().min(1).max(45),
  now: z.date()
});

const VerifyCodeSchema = z.strictObject({
  email: z.string(),
  code: z.string(),
  ip: z.string().trim().min(1).max(45),
  userAgent: z.string().trim().min(1).max(512).optional(),
  now: z.date()
});

export interface OwnerAuthServiceDependencies {
  readonly challenges: OwnerAuthChallengeStorePort;
  readonly registrations: OwnerRegistrationRepositoryPort;
  readonly notifier: OwnerAuthNotifierPort;
  readonly throttle: OwnerAuthThrottle;
  readonly sessions: OwnerSessionService;
  readonly ids: OwnerSessionIdGeneratorPort;
  readonly secret: string;
  readonly generateCode?: () => string;
}

export interface VerifiedOwnerAuth {
  readonly identity: OwnerIdentity;
  readonly session: IssuedOwnerSession;
}

/**
 * The owner half of authentication: it issues one-time codes and turns a
 * verified code into either a new tenant with its owner or a fresh session for
 * an existing one. Every refusal is the same generic error.
 */
export class OwnerAuthService {
  public constructor(private readonly dependencies: OwnerAuthServiceDependencies) {}

  public async requestCode(
    input: Readonly<{ email: string; ip: string; now: Date }>
  ): Promise<OwnerAuthChallenge> {
    const request = RequestCodeSchema.parse(input);
    const email = normalizeOwnerEmail(request.email);
    const decision = await this.dependencies.throttle.requestCode({
      email,
      ip: request.ip,
      now: request.now
    });

    if (!decision.allowed) {
      throw new OwnerAuthError(
        OwnerAuthErrorCode.RateLimited,
        decision.retryAfterSeconds
      );
    }

    const code = (this.dependencies.generateCode ?? generateOwnerAuthCode)();
    const expiresAt = new Date(request.now.getTime() + ownerAuthChallengeLifetimeMs);
    const challengeId = this.dependencies.ids.next();

    await this.dependencies.challenges.insert({
      id: challengeId,
      email,
      codeHash: hashOwnerAuthCode({ email, code, secret: this.dependencies.secret }),
      attempts: 0,
      expiresAt
    });

    try {
      await this.dependencies.notifier.sendCode({ email, code, expiresAt });
    } catch {
      await this.dependencies.challenges.consume({
        id: challengeId,
        consumedAt: request.now
      });
      throw new OwnerAuthError(OwnerAuthErrorCode.DeliveryFailed);
    }

    return OwnerAuthChallengeSchema.parse({
      challengeId,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: decision.resendAfterSeconds
    });
  }

  public async verifyCode(
    input: Readonly<{
      email: string;
      code: string;
      ip: string;
      userAgent?: string;
      now: Date;
    }>
  ): Promise<VerifiedOwnerAuth> {
    const request = VerifyCodeSchema.parse(input);
    const email = normalizeOwnerEmail(request.email);
    const challenge = await this.dependencies.challenges.findActiveByEmail({
      email,
      now: request.now
    });
    const decision = decideOwnerAuthChallenge({
      challenge,
      email,
      code: request.code,
      secret: this.dependencies.secret,
      now: request.now
    });

    if (decision.outcome === 'denied') {
      if (challenge !== undefined) {
        await this.dependencies.challenges.incrementAttempts({
          id: challenge.id,
          now: request.now
        });
      }
      throw new OwnerAuthError(OwnerAuthErrorCode.InvalidCode);
    }

    if (
      !(await this.dependencies.challenges.consume({
        id: decision.challengeId,
        consumedAt: request.now
      }))
    ) {
      throw new OwnerAuthError(OwnerAuthErrorCode.InvalidCode);
    }

    const owner = await this.resolveOwner(email);
    const session = await this.dependencies.sessions.issue(
      {
        tenantId: owner.tenantId,
        userId: owner.userId,
        ipAddress: request.ip,
        ...(request.userAgent === undefined ? {} : { userAgent: request.userAgent })
      },
      request.now
    );

    return { identity: owner.identity, session };
  }

  private async resolveOwner(email: string): Promise<{
    readonly tenantId: string;
    readonly userId: string;
    readonly identity: OwnerIdentity;
  }> {
    const known = await this.dependencies.registrations.findOwnerByEmail(email);
    if (known !== undefined) {
      return {
        tenantId: known.tenantId,
        userId: known.userId,
        identity: this.identity(known.tenantId, known.userId, email, tenantNameFor(email))
      };
    }

    const tenantId = this.dependencies.ids.next();
    const userId = this.dependencies.ids.next();
    const tenantName = tenantNameFor(email);

    await this.dependencies.registrations.createTenantWithOwner({
      tenantId,
      userId,
      tenantName,
      email
    });

    return { tenantId, userId, identity: this.identity(tenantId, userId, email, tenantName) };
  }

  private identity(
    tenantId: string,
    userId: string,
    email: string,
    tenantName: string
  ): OwnerIdentity {
    return OwnerIdentitySchema.parse({
      userId,
      tenantId,
      tenantName,
      email,
      role: OwnerRole
    });
  }
}

/** Placeholder workspace name; the owner renames the tenant in the cabinet. */
function tenantNameFor(email: string): string {
  return (email.split('@')[0] ?? email).slice(0, 200);
}
