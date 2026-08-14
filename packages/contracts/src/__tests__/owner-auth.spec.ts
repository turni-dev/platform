import { describe, expect, it } from 'vitest';
import {
  OwnerAuthChallengeSchema,
  OwnerAuthRequestSchema,
  OwnerAuthVerifyRequestSchema,
  OwnerIdentitySchema
} from '../ports/owner-auth.js';

describe('owner auth contracts', () => {
  it('normalizes the requested email and rejects malformed input', () => {
    expect(OwnerAuthRequestSchema.parse({ email: '  Owner@Turni.RU ' })).toEqual({
      email: 'owner@turni.ru'
    });
    expect(() => OwnerAuthRequestSchema.parse({ email: 'owner' })).toThrow();
    expect(() =>
      OwnerAuthRequestSchema.parse({ email: `${'o'.repeat(250)}@turni.ru` })
    ).toThrow();
    expect(() =>
      OwnerAuthRequestSchema.parse({ email: 'owner@turni.ru', code: '123456' })
    ).toThrow();
  });

  it('accepts only a six-digit verification code', () => {
    expect(
      OwnerAuthVerifyRequestSchema.parse({ email: 'Owner@turni.ru', code: '012345' })
    ).toEqual({ email: 'owner@turni.ru', code: '012345' });
    expect(() =>
      OwnerAuthVerifyRequestSchema.parse({ email: 'owner@turni.ru', code: '12345' })
    ).toThrow();
    expect(() =>
      OwnerAuthVerifyRequestSchema.parse({ email: 'owner@turni.ru', code: '12345a' })
    ).toThrow();
  });

  it('describes a challenge without leaking the code or account existence', () => {
    const challenge = {
      challengeId: '01900000-0000-7000-8000-000000000001',
      expiresAt: '2026-08-14T10:05:00.000Z',
      resendAfterSeconds: 60
    };

    expect(OwnerAuthChallengeSchema.parse(challenge)).toEqual(challenge);
    expect(() =>
      OwnerAuthChallengeSchema.parse({ ...challenge, code: '123456' })
    ).toThrow();
    expect(() =>
      OwnerAuthChallengeSchema.parse({ ...challenge, registered: true })
    ).toThrow();
  });

  it('exposes an owner identity without credentials', () => {
    const identity = {
      userId: '01900000-0000-7000-8000-000000000002',
      tenantId: '01900000-0000-7000-8000-000000000003',
      tenantName: 'Кафе Пример',
      email: 'owner@turni.ru',
      role: 'owner'
    };

    expect(OwnerIdentitySchema.parse(identity)).toEqual(identity);
    expect(() => OwnerIdentitySchema.parse({ ...identity, role: 'staff' })).toThrow();
    expect(() =>
      OwnerIdentitySchema.parse({ ...identity, refreshToken: 'secret' })
    ).toThrow();
  });
});
