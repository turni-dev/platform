import { describe, expect, it } from 'vitest';
import messages from '../../messages/ru.json' with { type: 'json' };

describe('Russian message catalog', () => {
  it('contains the initial dashboard empty state', () => {
    expect(messages.Dashboard).toEqual({
      title: 'Turni',
      emptyTitle: 'Нет активных диалогов',
      emptyBody: 'Новые обращения гостей появятся здесь.'
    });
  });
});
