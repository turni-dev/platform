import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LogoWall } from '../logo-wall';
import type { Integration } from '../../../integrations/integration-schema';

function integration(patch: Partial<Integration>): Integration {
  return {
    slug: 'google-calendar',
    name: 'Google Календарь',
    category: 'calendar',
    summary: 'Ставит встречи.',
    whatItCan: 'Создаёт события',
    permissionsAsked: 'Чтение и запись событий.',
    status: 'available',
    logo: '/uploads/google-calendar.svg',
    ...patch
  };
}

const block = { __component: 'blocks.logo-wall', heading: 'С чем уже работает' } as const;

describe('LogoWall', () => {
  it('draws the logos of the catalog, not a hardcoded list', () => {
    const markup = renderToStaticMarkup(
      <LogoWall
        {...block}
        integrations={[integration({}), integration({ slug: 'vk', name: 'VK' })]}
      />
    );

    expect(markup).toContain('Google Календарь');
    expect(markup).toContain('VK');
    expect(markup).toContain('/uploads/google-calendar.svg');
  });

  it('shows only what is already working: the status in the CMS rules the wall', () => {
    const markup = renderToStaticMarkup(
      <LogoWall
        {...block}
        integrations={[
          integration({}),
          integration({ slug: 'telegram', name: 'Telegram', status: 'in_progress' })
        ]}
      />
    );

    expect(markup).not.toContain('Telegram');
  });

  it('disappears instead of showing an empty strip when the catalog is unavailable', () => {
    expect(renderToStaticMarkup(<LogoWall {...block} integrations={[]} />)).toBe('');
  });
});
