import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { resolve } from 'node:path';

/**
 * Mirrors `src/lib/backend-origin.ts`. The config is compiled on its own, so it
 * cannot import from the app sources.
 */
function backendOrigin(): string {
  const configured = process.env['BACKEND_ORIGIN'];

  return configured === undefined || configured.trim() === ''
    ? 'http://localhost:3000'
    : new URL(configured).origin;
}

/**
 * The app builds with webpack (`next build --webpack`): Turbopack cannot resolve
 * the NodeNext `.js` specifiers inside `@turni/contracts`, which is consumed as
 * TypeScript source. `resolve.extensionAlias` below is what makes them resolve.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: resolve(import.meta.dirname, '../..')
  },
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs']
    };

    return config;
  },
  /**
   * Keeps the API on the same origin as the pages, so the auth cookies —
   * HttpOnly, SameSite=Strict, scoped to /api/v1 — travel with every call.
   */
  rewrites: () =>
    Promise.resolve([
      {
        source: '/api/v1/:path*',
        destination: `${backendOrigin()}/api/v1/:path*`
      }
    ])
};
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
