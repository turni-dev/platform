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

  it('spells the owner auth screens out in Russian', () => {
    expect(messages.Auth.verifySubtitle).toContain('{email}');
    expect(Object.values(messages.Auth).every((text) => text.trim().length > 0)).toBe(
      true
    );
  });
});
