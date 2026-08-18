import { describe, expect, it } from 'vitest';
import { isHoneypotTripped } from '../honeypot';

function formWith(fields: Readonly<Record<string, string>>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return form;
}

describe('isHoneypotTripped', () => {
  it('is not tripped when the trap field is absent', () => {
    expect(isHoneypotTripped(formWith({ contact: 'me@example.com' }), 'companySite')).toBe(false);
  });

  it('is not tripped when the trap field is present but empty', () => {
    expect(isHoneypotTripped(formWith({ companySite: '' }), 'companySite')).toBe(false);
  });

  it('is not tripped when the trap field is only whitespace', () => {
    expect(isHoneypotTripped(formWith({ companySite: '   ' }), 'companySite')).toBe(false);
  });

  it('is tripped when a bot fills the trap field', () => {
    expect(isHoneypotTripped(formWith({ companySite: 'http://spam.example' }), 'companySite')).toBe(
      true
    );
  });

  it('checks the field named for this form, not any other field', () => {
    const form = formWith({ otherTrap: 'filled' });
    expect(isHoneypotTripped(form, 'companySite')).toBe(false);
  });
});
