import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import '@turni/ui/tailwind.css';
import './globals.scss';
import { Footer } from '../site/footer';
import { Nav } from '../site/nav';
import { siteNavigation, siteSettings } from '../content/site-pages';

/**
 * Две насыщенности одного начертания хватает всему сайту: обычный текст и
 * заголовки/кнопки. next/font сам самохостит файлы и не тянет внешний CSS
 * при заходе посетителя — это часть скоростного гейта Lighthouse.
 */
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600'],
  variable: '--font-sans',
  display: 'swap'
});

/**
 * Шапка и подвал одинаковы на всех страницах и приходят из настроек сайта,
 * а не из блоков страницы: редактор задаёт их один раз.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, nav] = await Promise.all([siteSettings.get(), siteNavigation.get()]);

  return (
    <html lang="ru" className={inter.variable}>
      <body>
        <Nav
          brand={settings.brand}
          nav={nav}
          navCta={settings.navCta}
        />
        <main>{children}</main>
        <Footer
          footerContacts={settings.footerContacts}
          footerLegalLinks={settings.footerLegalLinks}
          footerNote={settings.footerNote}
        />
      </body>
    </html>
  );
}
