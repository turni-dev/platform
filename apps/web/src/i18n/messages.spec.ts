import { describe, expect, it } from 'vitest';
import messages from '../../messages/ru.json' with { type: 'json' };

describe('Russian message catalog', () => {
  it('contains the initial dashboard empty state', () => {
    expect(messages.Dashboard).toEqual({
      title: 'Turni',
      emptyTitle: 'Нет активных диалогов',
      emptyBody: 'Новые обращения гостей появятся здесь.',
      signedInAs: 'Вы вошли как {email}',
      signOut: 'Выйти',
      signOutFailed: 'Не удалось выйти. Попробуйте ещё раз.'
    });
  });

  it('names every cabinet section', () => {
    expect(Object.keys(messages.Cabinet)).toEqual([
      'navLabel',
      'inbox',
      'agent',
      'knowledge',
      'automations'
    ]);
  });

  it('tells the owner what a save did, in Russian', () => {
    expect(messages.Agent.instructionsBody).toContain('{revision}');
    expect(messages.Agent.automationsEmpty).toContain('Telegram');
    expect(
      Object.values(messages.Agent).every((text) => text.trim().length > 0)
    ).toBe(true);
  });

  it('spells the owner auth screens out in Russian', () => {
    expect(messages.Auth.verifySubtitle).toContain('{email}');
    expect(Object.values(messages.Auth).every((text) => text.trim().length > 0)).toBe(
      true
    );
  });
});
