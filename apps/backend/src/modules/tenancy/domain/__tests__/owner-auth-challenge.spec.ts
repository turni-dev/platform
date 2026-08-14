import { describe, expect, it } from 'vitest';
import {
  decideOwnerAuthChallenge,
  generateOwnerAuthCode,
  hashOwnerAuthCode,
  maxOwnerAuthAttempts,
  ownerAuthChallengeLifetimeMs,
  type StoredOwnerAuthChallenge
} from '../owner-auth-challenge.js';

const secret = 'owner-auth-secret-with-at-least-thirty-two-characters';
const now = new Date('2026-08-14T10:00:00.000Z');
const email = 'owner@turni.ru';
const code = '012345';

function storedChallenge(
  overrides: Partial<StoredOwnerAuthChallenge> = {}
): StoredOwnerAuthChallenge {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    email,
    codeHash: hashOwnerAuthCode({ email, code, secret }),
    attempts: 0,
    expiresAt: new Date(now.getTime() + ownerAuthChallengeLifetimeMs),
    ...overrides
  };
}

describe('generateOwnerAuthCode', () => {
  it('produces a zero-padded six-digit code from the injected random source', () => {
    expect(generateOwnerAuthCode(() => 42)).toBe('000042');
    expect(generateOwnerAuthCode(() => 999_999)).toBe('999999');
    expect(generateOwnerAuthCode()).toMatch(/^\d{6}$/);
  });
});

describe('hashOwnerAuthCode', () => {
  it('never returns the code and binds the hash to the normalized email', () => {
    const hash = hashOwnerAuthCode({ email, code, secret });

    expect(hash).not.toContain(code);
    expect(hash).toBe(hashOwnerAuthCode({ email: '  Owner@Turni.RU ', code, secret }));
    expect(hash).not.toBe(hashOwnerAuthCode({ email: 'other@turni.ru', code, secret }));
    expect(hash).not.toBe(
      hashOwnerAuthCode({ email, code, secret: `${secret}-rotated` })
    );
  });
});

describe('decideOwnerAuthChallenge', () => {
  it('accepts a matching code once and consumes the challenge', () => {
    const challenge = storedChallenge();

    expect(decideOwnerAuthChallenge({ challenge, email, code, secret, now })).toEqual({
      outcome: 'accepted',
      challengeId: challenge.id,
      email
    });
    expect(
      decideOwnerAuthChallenge({
        challenge: { ...challenge, consumedAt: now },
        email,
        code,
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: 0 });
  });

  it('counts a wrong code as a spent attempt', () => {
    expect(
      decideOwnerAuthChallenge({
        challenge: storedChallenge({ attempts: 1 }),
        email,
        code: '999999',
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: 2 });
  });

  it('denies a matching code once the attempt budget is exhausted', () => {
    expect(
      decideOwnerAuthChallenge({
        challenge: storedChallenge({ attempts: maxOwnerAuthAttempts }),
        email,
        code,
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: maxOwnerAuthAttempts });
  });

  it('denies an expired challenge without spending an attempt', () => {
    expect(
      decideOwnerAuthChallenge({
        challenge: storedChallenge({ expiresAt: now }),
        email,
        code,
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: 0 });
  });

  it('denies a missing challenge and a challenge issued for another email', () => {
    expect(decideOwnerAuthChallenge({ email, code, secret, now })).toEqual({
      outcome: 'denied',
      attempts: 0
    });
    expect(
      decideOwnerAuthChallenge({
        challenge: storedChallenge(),
        email: 'other@turni.ru',
        code,
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: 0 });
  });

  it('rejects a malformed code before touching the stored challenge', () => {
    expect(
      decideOwnerAuthChallenge({
        challenge: storedChallenge({ attempts: 3 }),
        email,
        code: '12345',
        secret,
        now
      })
    ).toEqual({ outcome: 'denied', attempts: 3 });
  });
});
