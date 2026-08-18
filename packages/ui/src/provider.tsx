'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { turniTheme } from './theme';

/**
 * Wraps AntD's SSR style registry and theme provider in one place so both
 * apps configure the same theme the same way. Renders `children` untouched,
 * so server components passed in from `app/layout.tsx` stay server components
 * — only this wrapper crosses the client boundary.
 */
export function TurniAntdProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AntdRegistry>
      <ConfigProvider theme={turniTheme}>{children}</ConfigProvider>
    </AntdRegistry>
  );
}
