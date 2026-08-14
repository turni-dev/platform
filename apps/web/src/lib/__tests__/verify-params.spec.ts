import { describe, expect, it } from 'vitest';
import { parseVerifyParams } from '../verify-params';

describe('parseVerifyParams', () => {
  it('accepts a known flow and a valid email', () => {
    expect(parseVerifyParams({ flow: 'register', email: ' Owner@Turni.RU ' })).toEqual({
      flow: 'register',
      email: 'owner@turni.ru'
    });
  });

  it('falls back to the login flow when none was given', () => {
    expect(parseVerifyParams({ email: 'owner@turni.ru' })?.flow).toBe('login');
  });

  it('refuses anything the verify screen cannot act on', () => {
    expect(parseVerifyParams({ flow: 'register' })).toBeUndefined();
    expect(parseVerifyParams({ email: 'not-an-email' })).toBeUndefined();
    expect(parseVerifyParams({ flow: 'admin', email: 'owner@turni.ru' })).toBeUndefined();
    expect(parseVerifyParams({ email: ['a@b.ru', 'c@d.ru'] })).toBeUndefined();
  });
});
