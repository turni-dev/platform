import { describe, expect, it } from 'vitest';
import { OwnerAccessTokenService } from '../owner-access-token.js';
import { OwnerSessionCredentialService } from '../owner-session-credential.js';
import {
  OwnerSessionService,
  ownerSessionAbsoluteLifetimeMs,
  ownerSessionIdleLifetimeMs
} from '../owner-session.js';
import type {
  OwnerSessionRecord,
  OwnerSessionStorePort,
  OwnerSessionTokenHash
} from '../owner-session-store.port.js';

const secret = 'owner-session-secret-with-at-least-thirty-two-characters';
const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const sessionId = '01900000-0000-7000-8000-000000000003';
const now = new Date('2026-08-14T10:00:00.000Z');

class FakeSessionStore implements OwnerSessionStorePort {
  public readonly rows: OwnerSessionRecord[] = [];

  public insert(record: OwnerSessionRecord): Promise<void> {
    this.rows.push(record);
    return Promise.resolve();
  }

  public findActive(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash; now: Date }>
  ): Promise<OwnerSessionRecord | undefined> {
    return Promise.resolve(this.match(input.tenantId, input.tokenHash));
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
    const current = this.match(input.tenantId, input.currentTokenHash);
    if (current === undefined) {
      return Promise.resolve(undefined);
    }

    const rotated: OwnerSessionRecord = {
      ...current,
      tokenHash: input.nextTokenHash,
      idleExpiresAt: input.idleExpiresAt
    };
    this.rows.splice(this.rows.indexOf(current), 1, rotated);
    return Promise.resolve(rotated);
  }

  public revoke(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash }>
  ): Promise<boolean> {
    const found = this.match(input.tenantId, input.tokenHash);
    if (found === undefined) {
      return Promise.resolve(false);
    }

    this.rows.splice(this.rows.indexOf(found), 1);
    return Promise.resolve(true);
  }

  private match(tenant: string, hash: OwnerSessionTokenHash): OwnerSessionRecord | undefined {
    return this.rows.find(
      (row) =>
        row.tenantId === tenant &&
        Buffer.from(row.tokenHash).equals(Buffer.from(hash))
    );
  }
}

function serviceWith(store: OwnerSessionStorePort): OwnerSessionService {
  return new OwnerSessionService(
    store,
    new OwnerSessionCredentialService(secret),
    new OwnerAccessTokenService(secret),
    { next: () => sessionId }
  );
}

describe('OwnerSessionService', () => {
  it('issues an access token and a stored-hash-only refresh credential', async () => {
    const store = new FakeSessionStore();
    const service = serviceWith(store);

    const issued = await service.issue({ tenantId, userId }, now);

    expect(
      new OwnerAccessTokenService(secret).verify(issued.accessToken, now)
    ).toEqual({ tenantId, userId, sessionId, role: 'owner' });
    expect(issued.refreshCredential).toContain('.');
    expect(store.rows).toHaveLength(1);
    expect(JSON.stringify(store.rows)).not.toContain(issued.refreshCredential);
    expect(store.rows[0]?.idleExpiresAt).toEqual(
      new Date(now.getTime() + ownerSessionIdleLifetimeMs)
    );
    expect(store.rows[0]?.absoluteExpiresAt).toEqual(
      new Date(now.getTime() + ownerSessionAbsoluteLifetimeMs)
    );
  });

  it('rotates a credential and refuses the predecessor afterwards', async () => {
    const store = new FakeSessionStore();
    const service = serviceWith(store);
    const issued = await service.issue({ tenantId, userId }, now);

    const refreshed = await service.refresh(issued.refreshCredential, now);

    expect(refreshed.refreshCredential).not.toBe(issued.refreshCredential);
    expect(store.rows).toHaveLength(1);
    await expect(service.refresh(issued.refreshCredential, now)).rejects.toThrow(
      'Invalid owner session'
    );
  });

  it('refuses a credential whose session is gone and one signed elsewhere', async () => {
    const store = new FakeSessionStore();
    const service = serviceWith(store);
    const issued = await service.issue({ tenantId, userId }, now);
    const foreign = new OwnerSessionCredentialService(`${secret}-other`).issue({
      sessionId,
      tenantId
    });

    await expect(service.revoke(issued.refreshCredential)).resolves.toBe(true);
    await expect(service.refresh(issued.refreshCredential, now)).rejects.toThrow(
      'Invalid owner session'
    );
    await expect(service.refresh(foreign.credential, now)).rejects.toThrow(
      'Invalid owner session'
    );
    expect(store.rows).toHaveLength(0);
  });

  it('keeps a rotation inside the absolute lifetime of the session', async () => {
    const store = new FakeSessionStore();
    const service = serviceWith(store);
    const issued = await service.issue({ tenantId, userId }, now);
    const later = new Date(now.getTime() + ownerSessionIdleLifetimeMs / 2);

    await service.refresh(issued.refreshCredential, later);

    expect(store.rows[0]?.idleExpiresAt).toEqual(
      new Date(later.getTime() + ownerSessionIdleLifetimeMs)
    );
    expect(store.rows[0]?.absoluteExpiresAt).toEqual(
      new Date(now.getTime() + ownerSessionAbsoluteLifetimeMs)
    );
  });
});
