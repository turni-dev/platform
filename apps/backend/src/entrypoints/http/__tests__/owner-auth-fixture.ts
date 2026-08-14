import { InMemoryKeyValueCache } from '../../../platform/cache/in-memory-key-value-cache.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { OwnerAuthAnalytics } from '../../../modules/tenancy/application/owner-auth-analytics.js';
import { maxOwnerAuthAttempts } from '../../../modules/tenancy/domain/owner-auth-challenge.js';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import { OwnerAuthService } from '../../../modules/tenancy/application/owner-auth-service.js';
import { OwnerAuthThrottle } from '../../../modules/tenancy/application/owner-auth-throttle.js';
import { OwnerSessionCredentialService } from '../../../modules/tenancy/application/owner-session-credential.js';
import { OwnerSessionService } from '../../../modules/tenancy/application/owner-session.js';
import type {
  OwnerAuthChallengeRecord,
  OwnerAuthChallengeStorePort
} from '../../../modules/tenancy/application/owner-auth-challenge-store.port.js';
import type {
  OwnerDirectoryEntry,
  OwnerProfile,
  OwnerRegistration,
  OwnerRegistrationRepositoryPort
} from '../../../modules/tenancy/application/owner-registration-repository.port.js';
import type {
  OwnerSessionRecord,
  OwnerSessionStorePort,
  OwnerSessionTokenHash
} from '../../../modules/tenancy/application/owner-session-store.port.js';

export const ownerAuthSecret = 'owner-auth-secret-with-at-least-thirty-two-characters';
export const ownerAuthCode = '424242';

class InMemoryChallengeStore implements OwnerAuthChallengeStorePort {
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

  public consume(input: Readonly<{ id: string; consumedAt: Date }>): Promise<boolean> {
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

class InMemoryRegistrationRepository implements OwnerRegistrationRepositoryPort {
  public readonly registrations: OwnerRegistration[] = [];

  public createTenantWithOwner(registration: OwnerRegistration): Promise<void> {
    this.registrations.push(registration);
    return Promise.resolve();
  }

  public findOwnerByEmail(email: string): Promise<OwnerDirectoryEntry | undefined> {
    const known = this.registrations.find(
      (registration) => registration.email === email
    );

    return Promise.resolve(
      known === undefined
        ? undefined
        : { email: known.email, tenantId: known.tenantId, userId: known.userId }
    );
  }

  public findOwnerProfile(
    owner: Readonly<{ tenantId: string; userId: string }>
  ): Promise<OwnerProfile | undefined> {
    const known = this.registrations.find(
      (registration) =>
        registration.tenantId === owner.tenantId &&
        registration.userId === owner.userId
    );

    return Promise.resolve(
      known === undefined
        ? undefined
        : {
            userId: known.userId,
            tenantId: known.tenantId,
            tenantName: known.tenantName,
            email: known.email
          }
    );
  }
}

class InMemorySessionStore implements OwnerSessionStorePort {
  public readonly rows: OwnerSessionRecord[] = [];

  public insert(record: OwnerSessionRecord): Promise<void> {
    this.rows.push(record);
    return Promise.resolve();
  }

  public findActive(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash; now: Date }>
  ): Promise<OwnerSessionRecord | undefined> {
    return Promise.resolve(this.match(input.tenantId, input.tokenHash, input.now));
  }

  public rotate(
    input: Readonly<{
      tenantId: string;
      currentTokenHash: OwnerSessionTokenHash;
      nextTokenHash: OwnerSessionTokenHash;
      idleExpiresAt: Date;
      now: Date;
    }>
  ): Promise<OwnerSessionRecord | undefined> {
    const row = this.match(input.tenantId, input.currentTokenHash, input.now);
    if (row === undefined) {
      return Promise.resolve(undefined);
    }

    const rotated: OwnerSessionRecord = {
      ...row,
      tokenHash: input.nextTokenHash,
      idleExpiresAt: input.idleExpiresAt
    };
    this.rows.splice(this.rows.indexOf(row), 1, rotated);

    return Promise.resolve(rotated);
  }

  public revoke(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash }>
  ): Promise<boolean> {
    const row = this.rows.find(
      (candidate) =>
        candidate.tenantId === input.tenantId &&
        Buffer.from(candidate.tokenHash).equals(Buffer.from(input.tokenHash))
    );
    if (row === undefined) {
      return Promise.resolve(false);
    }

    this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve(true);
  }

  private match(
    tenantId: string,
    tokenHash: OwnerSessionTokenHash,
    now: Date
  ): OwnerSessionRecord | undefined {
    return this.rows.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        Buffer.from(candidate.tokenHash).equals(Buffer.from(tokenHash)) &&
        candidate.idleExpiresAt > now &&
        candidate.absoluteExpiresAt > now
    );
  }
}

export class RecordingOwnerAuthNotifier {
  public readonly sent: { email: string; code: string; expiresAt: Date }[] = [];

  public sendCode(input: {
    email: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    this.sent.push(input);
    return Promise.resolve();
  }
}

export interface OwnerAuthFixture {
  readonly service: OwnerAuthService;
  /** Moves the throttle clock so a test can resend without waiting a minute. */
  advanceBy(milliseconds: number): void;
  readonly sessions: OwnerSessionService;
  readonly accessTokens: OwnerAccessTokenService;
  readonly owners: InMemoryRegistrationRepository;
  readonly sessionStore: InMemorySessionStore;
  readonly notifier: RecordingOwnerAuthNotifier;
  readonly events: FakeDomainEventBus;
}

/** Composes the owner auth stack over in-memory stores so HTTP tests stay real. */
export function ownerAuthFixture(): OwnerAuthFixture {
  const owners = new InMemoryRegistrationRepository();
  const sessionStore = new InMemorySessionStore();
  const notifier = new RecordingOwnerAuthNotifier();
  const events = new FakeDomainEventBus();
  const accessTokens = new OwnerAccessTokenService(ownerAuthSecret);
  let clock = Date.now();
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;
      return `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`;
    }
  };
  const sessions = new OwnerSessionService(
    sessionStore,
    new OwnerSessionCredentialService(ownerAuthSecret),
    accessTokens,
    ids
  );

  return {
    advanceBy: (milliseconds: number): void => {
      clock += milliseconds;
    },
    owners,
    sessionStore,
    notifier,
    events,
    accessTokens,
    sessions,
    service: new OwnerAuthService({
      challenges: new InMemoryChallengeStore(),
      registrations: owners,
      notifier,
      throttle: new OwnerAuthThrottle(new InMemoryKeyValueCache(() => clock), ownerAuthSecret),
      sessions,
      ids,
      secret: ownerAuthSecret,
      generateCode: () => ownerAuthCode,
      analytics: new OwnerAuthAnalytics(events, ids)
    })
  };
}
