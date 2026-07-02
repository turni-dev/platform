import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname, '../..')
  }
};
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
