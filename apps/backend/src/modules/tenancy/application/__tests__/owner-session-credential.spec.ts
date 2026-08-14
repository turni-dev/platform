import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OwnerSessionCredentialService } from '../owner-session-credential.js';

const secret = 'owner-session-secret-with-at-least-thirty-two-characters';
const sessionId = '01900000-0000-7000-8000-000000000001';
const tenantId = '01900000-0000-7000-8000-000000000002';

describe('OwnerSessionCredentialService', () => {
  it('issues an opaque credential and returns only its hash for storage', () => {
    const service = new OwnerSessionCredentialService(secret);

    const issued = service.issue({ sessionId, tenantId });

    expect(issued.credential.length).toBeGreaterThanOrEqual(32);
    expect(issued.tokenHash).toHaveLength(32);
    expect(Buffer.from(issued.tokenHash).toString('base64url')).not.toContain(
      issued.credential
    );
    expect(issued.credential).not.toContain(secret);
  });

  it('recovers the routing hint and the stored hash from its own credential', () => {
    const service = new OwnerSessionCredentialService(secret);
    const issued = service.issue({ sessionId, tenantId });

    expect(service.verify(issued.credential)).toEqual({
      sessionId,
      tenantId,
      tokenHash: issued.tokenHash
    });
  });

  it('issues a distinct secret per rotation', () => {
    const service = new OwnerSessionCredentialService(secret);

    const first = service.issue({ sessionId, tenantId });
    const second = service.issue({ sessionId, tenantId });

    expect(second.credential).not.toBe(first.credential);
    expect(Buffer.from(second.tokenHash)).not.toEqual(Buffer.from(first.tokenHash));
  });

  it('rejects a tampered payload, a swapped secret and a foreign signing key', () => {
    const service = new OwnerSessionCredentialService(secret);
    const issued = service.issue({ sessionId, tenantId });
    const [payload, opaque, signature] = issued.credential.split('.');
    const otherTenant = Buffer.from(
      JSON.stringify({ sessionId, tenantId: '01900000-0000-7000-8000-000000000003' })
    ).toString('base64url');

    expect(() => service.verify(`${otherTenant}.${opaque}.${signature}`)).toThrow(
      'Invalid owner session'
    );
    expect(() =>
      service.verify(`${payload}.${'a'.repeat(43)}.${signature}`)
    ).toThrow('Invalid owner session');
    expect(() =>
      new OwnerSessionCredentialService(`${secret}-rotated`).verify(issued.credential)
    ).toThrow('Invalid owner session');
    expect(() => service.verify('not-a-credential')).toThrow('Invalid owner session');
  });

  it('stores the hash of the opaque secret alone', () => {
    const service = new OwnerSessionCredentialService(secret);
    const issued = service.issue({ sessionId, tenantId });
    const opaque = issued.credential.split('.')[1] ?? '';

    expect(Buffer.from(issued.tokenHash)).toEqual(
      createHash('sha256').update(opaque).digest()
    );
  });

  it('refuses a short signing secret', () => {
    expect(() => new OwnerSessionCredentialService('too-short')).toThrow(
      'Owner session secret must be at least 32 characters'
    );
  });
});
