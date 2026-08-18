import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { TurniAntdProvider } from '@turni/ui';
import './globals.scss';

const manrope = localFont({
  src: './fonts/manrope-variable.ttf',
  weight: '400 800',
  display: 'swap',
  variable: '--font-body'
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Dashboard');
  return { title: t('title') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <TurniAntdProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </TurniAntdProvider>
      </body>
    </html>
  );
}
