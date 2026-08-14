import { describe, expect, it } from 'vitest';
import { InMemoryKeyValueCache } from '../../../../platform/cache/in-memory-key-value-cache.js';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import { OwnerAuthAnalytics } from '../owner-auth-analytics.js';
import {
  hashOwnerAuthCode,
  maxOwnerAuthAttempts,
  ownerAuthChallengeLifetimeMs
} from '../../domain/owner-auth-challenge.js';
import { OwnerAccessTokenService } from '../owner-access-token.js';
import { OwnerAuthError, OwnerAuthService } from '../owner-auth-service.js';
import { OwnerAuthThrottle, ownerAuthResendCooldownMs } from '../owner-auth-throttle.js';
import type {
  OwnerAuthChallengeRecord,
  OwnerAuthChallengeStorePort
} from '../owner-auth-challenge-store.port.js';
import type {
  OwnerDirectoryEntry,
  OwnerProfile,
  OwnerRegistration,
  OwnerRegistrationRepositoryPort
} from '../owner-registration-repository.port.js';
import { OwnerSessionCredentialService } from '../owner-session-credential.js';
import { OwnerSessionService } from '../owner-session.js';
import type {
  OwnerSessionRecord,
  OwnerSessionStorePort
} from '../owner-session-store.port.js';

const secret = 'owner-auth-secret-with-at-least-thirty-two-characters';
const email = 'owner@turni.ru';
const ip = '203.0.113.10';
const now = new Date('2026-08-14T10:00:00.000Z');
const code = '424242';

class FakeChallengeStore implements OwnerAuthChallengeStorePort {
  public readonly rows: OwnerAuthChallengeRecord[] = [];

  public insert(record: OwnerAuthChallengeRecord): Promise<void> {
    this.rows.push(record);
    return Promise.resolve();
  }

  public findActiveByEmail(
    input: Readonly<{ email: string; now: Date }>
  ): Promise<OwnerAuthChallengeRecord | undefined> {
    return Promise.resolve(
      [...this.rows]
        .reverse()
        .find(
          (row) =>
            row.email === input.email &&
            row.consumedAt === undefined &&
            row.expiresAt > input.now
        )
    );
  }

  public incrementAttempts(
    input: Readonly<{ id: string; now: Date }>
  ): Promise<number | undefined> {
    const row = this.rows.find((candidate) => candidate.id === input.id);
    if (row === undefined || row.attempts >= maxOwnerAuthAttempts) {
      return Promise.resolve(undefined);
    }

    const updated = { ...row, attempts: row.attempts + 1 };
    this.rows.splice(this.rows.indexOf(row), 1, updated);
    return Promise.resolve(updated.attempts);
  }

  public consume(
    input: Readonly<{ id: string; consumedAt: Date }>
  ): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === input.id);
    if (row === undefined || row.consumedAt !== undefined) {
      return Promise.resolve(false);
    }

    this.rows.splice(this.rows.indexOf(row), 1, {
      ...row,
      consumedAt: input.consumedAt
    });
    return Promise.resolve(true);
  }
}

class FakeRegistrationRepository implements OwnerRegistrationRepositoryPort {
  public readonly registrations: OwnerRegistration[] = [];
  public readonly directory: OwnerDirectoryEntry[] = [];

  public createTenantWithOwner(registration: OwnerRegistration): Promise<void> {
    this.registrations.push(registration);
    this.directory.push({
      email: registration.email,
      tenantId: registration.tenantId,
      userId: registration.userId
    });
    return Promise.resolve();
  }

  public findOwnerByEmail(lookup: string): Promise<OwnerDirectoryEntry | undefined> {
    return Promise.resolve(this.directory.find((entry) => entry.email === lookup));
  }

  public findOwnerProfile(
    owner: Readonly<{ tenantId: string; userId: string }>
  ): Promise<OwnerProfile | undefined> {
    const registration = this.registrations.find(
      (candidate) =>
        candidate.tenantId === owner.tenantId && candidate.userId === owner.userId
    );

    return Promise.resolve(
      registration === undefined
        ? undefined
        : {
            userId: registration.userId,
            tenantId: registration.tenantId,
            tenantName: registration.tenantName,
            email: registration.email
          }
    );
  }
}

class FakeSessionStore implements OwnerSessionStorePort {
  public readonly rows: OwnerSessionRecord[] = [];

  public insert(record: OwnerSessionRecord): Promise<void> {
    this.rows.push(record);
    return Promise.resolve();
  }

  public findActive(): Promise<OwnerSessionRecord | undefined> {
    return Promise.resolve(this.rows[0]);
  }

  public rotate(): Promise<OwnerSessionRecord | undefined> {
    return Promise.resolve(this.rows[0]);
  }

  public revoke(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class RecordingNotifier {
  public readonly sent: { email: string; code: string; expiresAt: Date }[] = [];
  public failing = false;

  public sendCode(input: {
    email: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('smtp unavailable'));
    }

    this.sent.push(input);
    return Promise.resolve();
  }
}

function build(): {
  readonly service: OwnerAuthService;
  advanceCacheTo(instant: Date): void;
  readonly challenges: FakeChallengeStore;
  readonly registrations: FakeRegistrationRepository;
  readonly notifier: RecordingNotifier;
  readonly sessions: FakeSessionStore;
  readonly events: FakeDomainEventBus;
} {
  const challenges = new FakeChallengeStore();
  const registrations = new FakeRegistrationRepository();
  const notifier = new RecordingNotifier();
  const sessionStore = new FakeSessionStore();
  const events = new FakeDomainEventBus();
  let cacheClock = now.getTime();
  let sequence = 0;
  const ids = {
    next: () => {
      sequence += 1;
      return `01900000-0000-7000-8000-0000000000${String(sequence).padStart(2, '0')}`;
    }
  };

  return {
    challenges,
    registrations,
    notifier,
    events,
    sessions: sessionStore,
    advanceCacheTo: (instant: Date) => {
      cacheClock = instant.getTime();
    },
    service: new OwnerAuthService({
      challenges,
      registrations,
      notifier,
      throttle: new OwnerAuthThrottle(
        new InMemoryKeyValueCache(() => cacheClock),
        secret
      ),
      sessions: new OwnerSessionService(
        sessionStore,
        new OwnerSessionCredentialService(secret),
        new OwnerAccessTokenService(secret),
        ids
      ),
      ids,
      secret,
      generateCode: () => code,
      analytics: new OwnerAuthAnalytics(events, ids)
    })
  };
}

describe('OwnerAuthService.requestCode', () => {
  it('stores a hashed challenge and sends the code once per cooldown', async () => {
    const context = build();

    const challenge = await context.service.requestCode({ email, ip, now });

    expect(challenge).toEqual({
      challengeId: context.challenges.rows[0]?.id,
      expiresAt: new Date(now.getTime() + ownerAuthChallengeLifetimeMs).toISOString(),
      resendAfterSeconds: ownerAuthResendCooldownMs / 1_000
    });
    expect(context.challenges.rows[0]?.codeHash).toBe(
      hashOwnerAuthCode({ email, code, secret })
    );
    expect(JSON.stringify(context.challenges.rows)).not.toContain(code);
    expect(context.notifier.sent).toEqual([
      { email, code, expiresAt: new Date(now.getTime() + ownerAuthChallengeLifetimeMs) }
    ]);

    await expect(context.service.requestCode({ email, ip, now })).rejects.toThrow(
      OwnerAuthError
    );
  });

  it('leaves no usable challenge when delivery fails', async () => {
    const context = build();
    context.notifier.failing = true;

    await expect(context.service.requestCode({ email, ip, now })).rejects.toThrow(
      OwnerAuthError
    );
    await expect(
      context.service.verifyCode({ email, code, ip, now })
    ).rejects.toThrow('Invalid owner auth code');
  });
});

describe('OwnerAuthService.verifyCode', () => {
  it('registers a tenant and its owner for an unknown email', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });

    const verified = await context.service.verifyCode({ email, code, ip, now });

    expect(context.registrations.registrations).toHaveLength(1);
    expect(verified.identity).toEqual({
      userId: context.registrations.registrations[0]?.userId,
      tenantId: context.registrations.registrations[0]?.tenantId,
      tenantName: context.registrations.registrations[0]?.tenantName,
      email,
      role: 'owner'
    });
    expect(verified.session.accessToken.split('.')).toHaveLength(3);
    expect(context.sessions.rows).toHaveLength(1);
  });

  it('signs a known owner in without creating another tenant', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });
    const first = await context.service.verifyCode({ email, code, ip, now });

    const later = new Date(now.getTime() + ownerAuthResendCooldownMs);
    context.advanceCacheTo(later);
    await context.service.requestCode({ email, ip, now: later });
    const second = await context.service.verifyCode({ email, code, ip, now: later });

    expect(context.registrations.registrations).toHaveLength(1);
    expect(second.identity).toEqual(first.identity);
    expect(context.sessions.rows).toHaveLength(2);
  });

  it('refuses a wrong code, spends the attempt and never reveals why', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });

    await expect(
      context.service.verifyCode({ email, code: '000000', ip, now })
    ).rejects.toThrow('Invalid owner auth code');
    expect(context.challenges.rows[0]?.attempts).toBe(1);
    expect(context.registrations.registrations).toHaveLength(0);
  });

  it('refuses to reuse a consumed code', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });
    await context.service.verifyCode({ email, code, ip, now });

    await expect(
      context.service.verifyCode({ email, code, ip, now })
    ).rejects.toThrow('Invalid owner auth code');
    expect(context.registrations.registrations).toHaveLength(1);
  });

  it('records a registration and the sign-in that came with it', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });

    const verified = await context.service.verifyCode({ email, code, ip, now });

    expect(context.events.publishedEvents.map((event) => event.name)).toEqual([
      'owner.registered',
      'owner.signed_in'
    ]);
    expect(context.events.publishedEvents[1]?.props).toEqual({
      sessionId: verified.session.sessionId,
      registration: true
    });
    expect(
      context.events.publishedEvents.every(
        (event) => event.tenantId === verified.identity.tenantId
      )
    ).toBe(true);
  });

  it('records a returning owner as a sign-in without a registration', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });
    await context.service.verifyCode({ email, code, ip, now });

    const later = new Date(now.getTime() + ownerAuthResendCooldownMs);
    context.advanceCacheTo(later);
    await context.service.requestCode({ email, ip, now: later });
    await context.service.verifyCode({ email, code, ip, now: later });

    expect(context.events.publishedEvents.map((event) => event.name)).toEqual([
      'owner.registered',
      'owner.signed_in',
      'owner.signed_in'
    ]);
    expect(context.events.publishedEvents[2]?.props).toMatchObject({
      registration: false
    });
  });

  it('records nothing when the code is refused', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });

    await expect(
      context.service.verifyCode({ email, code: '000000', ip, now })
    ).rejects.toThrow('Invalid owner auth code');
    expect(context.events.publishedEvents).toEqual([]);
  });

  it('never puts the owner email into an analytics event', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });
    await context.service.verifyCode({ email, code, ip, now });

    expect(JSON.stringify(context.events.publishedEvents)).not.toContain(email);
  });

  it('refuses a code once its challenge has expired', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });

    await expect(
      context.service.verifyCode({
        email,
        code,
        ip,
        now: new Date(now.getTime() + ownerAuthChallengeLifetimeMs)
      })
    ).rejects.toThrow('Invalid owner auth code');
  });
});

describe('OwnerAuthService.signOut', () => {
  it('revokes the session and records the sign-out', async () => {
    const context = build();
    await context.service.requestCode({ email, ip, now });
    const verified = await context.service.verifyCode({ email, code, ip, now });

    const signedOut = await context.service.signOut(
      verified.session.refreshCredential,
      now
    );

    expect(signedOut).toBe(true);
    expect(context.events.publishedEvents.at(-1)?.name).toBe('owner.signed_out');
    expect(context.events.publishedEvents.at(-1)?.props).toEqual({
      sessionId: verified.session.sessionId
    });
  });

  it('records nothing for a credential it cannot verify', async () => {
    const context = build();

    expect(await context.service.signOut('not-a-credential', now)).toBe(false);
    expect(context.events.publishedEvents).toEqual([]);
  });
});
