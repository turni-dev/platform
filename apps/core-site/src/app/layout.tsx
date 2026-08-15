import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@turni/ui/tailwind.css';
import './globals.scss';

export const metadata: Metadata = {
  title: 'Turni',
  description: 'Turni — ИИ-сотрудник для вашего бизнеса'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
