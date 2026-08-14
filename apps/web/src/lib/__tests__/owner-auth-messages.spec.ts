import { describe, expect, it } from 'vitest';
import messages from '../../../messages/ru.json' with { type: 'json' };
import { authErrorMessageKey } from '../owner-auth-messages';

const codes = ['invalid', 'rate_limited', 'unauthorized', 'unavailable'] as const;

describe('authErrorMessageKey', () => {
  it('names a catalog entry for every refusal the client can report', () => {
    for (const code of codes) {
      expect(Object.keys(messages.Auth)).toContain(authErrorMessageKey(code));
    }
  });

  it('never lets a refusal reveal whether the email is registered', () => {
    const catalog: Readonly<Record<string, string>> = messages.Auth;

    for (const code of codes) {
      const text = catalog[authErrorMessageKey(code)] ?? '';
      expect(text).not.toMatch(/зарегистрир|не найд|существ/i);
    }
  });
});
