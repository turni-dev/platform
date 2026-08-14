import { z } from 'zod';
import type { OwnerAccessTokenService } from './owner-access-token.js';
import type { OwnerSessionCredentialService } from './owner-session-credential.js';
import {
  parseOwnerSessionRecord,
  type OwnerSessionIdGeneratorPort,
  type OwnerSessionRecord,
  type OwnerSessionStorePort
} from './owner-session-store.port.js';

export const ownerSessionIdleLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const ownerSessionAbsoluteLifetimeMs = 30 * 24 * 60 * 60 * 1000;

const IssueRequestSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  ipAddress: z.string().trim().min(1).max(45).optional(),
  userAgent: z.string().trim().min(1).max(512).optional()
});

export type OwnerSessionIssueRequest = z.infer<typeof IssueRequestSchema>;

export interface IssuedOwnerSession {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshCredential: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

/**
 * Owns the durable half of owner authentication: a session row is the only
 * authority for a live session, and every rotation replaces its stored hash
 * before a successor credential leaves this service.
 */
export class OwnerSessionService {
  public constructor(
    private readonly store: OwnerSessionStorePort,
    private readonly credentials: OwnerSessionCredentialService,
    private readonly accessTokens: OwnerAccessTokenService,
    private readonly ids: OwnerSessionIdGeneratorPort
  ) {}

  public async issue(
    request: OwnerSessionIssueRequest,
    now = new Date()
  ): Promise<IssuedOwnerSession> {
    const parsed = IssueRequestSchema.parse(request);
    const sessionId = this.ids.next();
    const credential = this.credentials.issue({
      sessionId,
      tenantId: parsed.tenantId
    });
    const record = parseOwnerSessionRecord({
      id: sessionId,
      tenantId: parsed.tenantId,
      userId: parsed.userId,
      tokenHash: credential.tokenHash,
      idleExpiresAt: new Date(now.getTime() + ownerSessionIdleLifetimeMs),
      absoluteExpiresAt: new Date(now.getTime() + ownerSessionAbsoluteLifetimeMs),
      ...(parsed.ipAddress === undefined ? {} : { ipAddress: parsed.ipAddress }),
      ...(parsed.userAgent === undefined ? {} : { userAgent: parsed.userAgent })
    });

    await this.store.insert(record);

    return this.issued(record, credential.credential, now);
  }

  public async refresh(
    refreshCredential: string,
    now = new Date()
  ): Promise<IssuedOwnerSession> {
    const presented = this.credentials.verify(refreshCredential);
    const successor = this.credentials.issue({
      sessionId: presented.sessionId,
      tenantId: presented.tenantId
    });
    const rotated = await this.store.rotate({
      tenantId: presented.tenantId,
      currentTokenHash: presented.tokenHash,
      nextTokenHash: successor.tokenHash,
      idleExpiresAt: new Date(now.getTime() + ownerSessionIdleLifetimeMs),
      now
    });

    if (rotated === undefined || rotated.id !== presented.sessionId) {
      throw new Error('Invalid owner session');
    }

    return this.issued(rotated, successor.credential, now);
  }

  public async revoke(refreshCredential: string): Promise<boolean> {
    const presented = this.credentials.verify(refreshCredential);

    return this.store.revoke({
      tenantId: presented.tenantId,
      tokenHash: presented.tokenHash
    });
  }

  private issued(
    record: OwnerSessionRecord,
    refreshCredential: string,
    now: Date
  ): IssuedOwnerSession {
    return {
      sessionId: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      accessToken: this.accessTokens.issue(
        {
          userId: record.userId,
          tenantId: record.tenantId,
          sessionId: record.id
        },
        now
      ),
      refreshCredential,
      idleExpiresAt: record.idleExpiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt
    };
  }
}
