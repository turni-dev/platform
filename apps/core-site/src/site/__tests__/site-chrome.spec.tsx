import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SiteFetch } from '../../content/cms-page-source';
import { Footer } from '../footer';
import { Nav } from '../nav';
import { createSiteSettingsSource, seedSettings } from '../site-settings-source';

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(JSON.stringify(body))
    })
  );
}

describe('Nav', () => {
  it('keeps a nested menu readable without javascript', () => {
    const markup = renderToStaticMarkup(
      <Nav
        brand="Turni"
        nav={[
          { label: 'Услуга', href: '/#steps' },
          {
            label: 'Продукт',
            href: '/product',
            children: [{ label: 'Кабинет', href: '/product/cabinet' }]
          }
        ]}
        navCta={{ label: 'Оставить заявку', href: '/#lead' }}
      />
    );

    expect(markup).toContain('aria-label="Основная навигация"');
    expect(markup).toContain('href="/product/cabinet"');
    expect(markup).toContain('href="/#lead"');
  });
});

describe('Footer', () => {
  it('keeps contacts and legal links apart', () => {
    const markup = renderToStaticMarkup(
      <Footer
        footerContacts={[{ label: 'hi@turni.ru', href: 'mailto:hi@turni.ru' }]}
        footerLegalLinks={[{ label: 'Политика', href: '/legal/privacy' }]}
        footerNote="Скоро — самостоятельный сервис"
      />
    );

    expect(markup).toContain('aria-label="Контакты"');
    expect(markup).toContain('aria-label="Правовая информация"');
    expect(markup).toContain('Скоро — самостоятельный сервис');
  });
});

describe('createSiteSettingsSource', () => {
  it('returns what the editor configured', async () => {
    const source = createSiteSettingsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({
        data: {
          brand: 'Turni из CMS',
          navCta: null,
          footerContacts: [{ label: 'hi@turni.ru', href: null }],
          footerLegalLinks: [],
          footerNote: null,
          defaultSeo: {
            metaTitle: 'Заголовок',
            metaDescription: null,
            metaImage: null,
            canonicalURL: null
          }
        }
      })
    });

    const settings = await source.get();

    expect(settings.brand).toBe('Turni из CMS');
    expect(settings.defaultSeo?.metaTitle).toBe('Заголовок');
    expect(settings.footerContacts[0]).not.toHaveProperty('href');
  });

  it('falls back to the seed when the CMS cannot answer', async () => {
    const source = createSiteSettingsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.get()).resolves.toEqual(seedSettings);
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith({});

    await expect(createSiteSettingsSource({ fetch }).get()).resolves.toEqual(seedSettings);
    expect(fetch).not.toHaveBeenCalled();
  });
});
