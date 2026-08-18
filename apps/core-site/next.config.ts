import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Standalone output so the Docker image ships a self-contained server
// (see apps/core-site/Dockerfile). outputFileTracingRoot pins tracing to the
// monorepo root because this app has no local package.json of its own.
const monorepoRoot = resolve(import.meta.dirname, '../..');

type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot
  },
  images: {
    remotePatterns: cmsRemotePatterns(process.env['CMS_BASE_URL'])
  }
};

export default nextConfig;

/**
 * Медиатека Strapi отдаёт картинки с другого origin, поэтому `next/image` по
 * умолчанию отказывается их оптимизировать. Сайт обязан собираться и без CMS
 * (на этом держится гейт Lighthouse), так что отсутствующий или битый
 * `CMS_BASE_URL` не должен ронять сборку — он просто оставляет
 * `remotePatterns` пустым, и герой рендерится без картинки.
 */
function cmsRemotePatterns(baseUrl: string | undefined): readonly RemotePattern[] {
  if (baseUrl === undefined || baseUrl.length === 0) {
    return [];
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return [];
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return [];
  }

  return [
    {
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      hostname: url.hostname,
      port: url.port,
      pathname: '/**'
    }
  ];
}
