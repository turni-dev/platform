import { describe, expect, it } from 'vitest';
import {
  GuestSessionRepository,
  type GuestSessionDatabaseExecutor,
  type GuestSessionRecord
} from '../guest-session-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';
const connectionId = '01900000-0000-7000-8000-000000000003';
const guestId = '01900000-0000-7000-8000-000000000004';
const sessionId = '01900000-0000-7000-8000-000000000005';
const tokenHash = new Uint8Array([1, 2, 3]);
const tokenKid = 'guest-hmac-2026-08';
const issuedAt = new Date('2026-08-09T12:00:00.000Z');
const expiresAt = new Date('2026-08-10T12:00:00.000Z');

class FakeGuestSessionDatabase implements GuestSessionDatabaseExecutor {
  public inserted: unknown[] = [];
  public lookups: unknown[] = [];
  public revocations: unknown[] = [];
  public found: GuestSessionRecord | undefined;

  public insertGuestSession(input: unknown): Promise<void> {
    this.inserted.push(input);
    return Promise.resolve();
  }

  public findGuestSessionByTokenHash(input: unknown): Promise<GuestSessionRecord | undefined> {
    this.lookups.push(input);
    return Promise.resolve(this.found);
  }

  public revokeGuestSessionByTokenHash(input: unknown): Promise<boolean> {
    this.revocations.push(input);
    return Promise.resolve(true);
  }
}

describe('GuestSessionRepository', () => {
  it('inserts a tenant-scoped session using only a supplied token hash', async () => {
    const database = new FakeGuestSessionDatabase();
    const repository = new GuestSessionRepository(database);

    await repository.insert({
      id: sessionId,
      tenantId,
      agentId,
      connectionId,
      guestId,
      tokenHash,
      tokenKid,
      issuedAt,
      expiresAt
    });

    expect(database.inserted).toEqual([
      {
        id: sessionId,
        tenantId,
        agentId,
        connectionId,
        guestId,
        tokenHash,
        tokenKid,
        issuedAt,
        expiresAt
      }
    ]);
  });

  it('finds and revokes only within the supplied tenant scope', async () => {
    const database = new FakeGuestSessionDatabase();
    database.found = {
      id: sessionId,
      tenantId,
      agentId,
      connectionId,
      guestId: undefined,
      tokenHash,
      tokenKid,
      issuedAt,
      expiresAt,
      revokedAt: undefined,
      lastUsedAt: undefined,
      createdAt: issuedAt
    };
    const repository = new GuestSessionRepository(database);

    await expect(repository.findByTokenHash({ tenantId, tokenHash })).resolves.toEqual(
      database.found
    );
    await expect(
      repository.revokeByTokenHash({ tenantId, tokenHash, revokedAt: expiresAt })
    ).resolves.toBe(true);

    expect(database.lookups).toEqual([{ tenantId, tokenHash }]);
    expect(database.revocations).toEqual([{ tenantId, tokenHash, revokedAt: expiresAt }]);
  });

  it('rejects an unknown raw token field before calling the database executor', async () => {
    const database = new FakeGuestSessionDatabase();
    const repository = new GuestSessionRepository(database);

    await expect(
      repository.insert({
        id: sessionId,
        tenantId,
        agentId,
        connectionId,
        tokenHash,
        tokenKid,
        issuedAt,
        expiresAt,
        token: 'never-store-this'
      } as never)
    ).rejects.toThrow();
    expect(database.inserted).toEqual([]);
  });
});
