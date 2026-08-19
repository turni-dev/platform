import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Standalone output so the Docker image ships a self-contained server
// (see apps/core-site/Dockerfile). outputFileTracingRoot pins tracing to the
// monorepo root because this app has no local package.json of its own.
const monorepoRoot = resolve(import.meta.dirname, '../..');

type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number];

/**
 * Медиатека Strapi отдаёт картинки с другого origin, поэтому `next/image` по
 * умолчанию отказывается их оптимизировать. `images.remotePatterns`
 * запекается в standalone-сборку один раз при `next build` — рантаймовый
 * `CMS_BASE_URL` в docker-compose на уже собранный образ не влияет. Прод-сборка
 * идёт намеренно без `CMS_BASE_URL` (сайт обязан собираться и без CMS — на
 * этом держится гейт Lighthouse), а в рантайме сайт всё равно ходит на
 * известный CMS-хост дев-контура. Поэтому известные хосты медиатеки заданы
 * явно, а не только через `CMS_BASE_URL` — иначе после такой сборки картинки
 * из CMS никогда не проходят allow-list, независимо от рантайм-окружения.
 */
const KNOWN_CMS_MEDIA_HOSTS: readonly RemotePattern[] = [
  { protocol: 'https', hostname: 'cms.turni.ru', pathname: '/**' },
  { protocol: 'http', hostname: 'cms', port: '1337', pathname: '/**' }
];

function parseCmsBaseUrl(baseUrl: string | undefined): RemotePattern | undefined {
  if (baseUrl === undefined || baseUrl.length === 0) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }

  return {
    protocol: url.protocol === 'https:' ? 'https' : 'http',
    hostname: url.hostname,
    port: url.port,
    pathname: '/**'
  };
}

function cmsRemotePatterns(baseUrl: string | undefined): readonly RemotePattern[] {
  const fromEnv = parseCmsBaseUrl(baseUrl);
  const alreadyListed = (pattern: RemotePattern): boolean =>
    KNOWN_CMS_MEDIA_HOSTS.some(
      (known) =>
        known.protocol === pattern.protocol &&
        known.hostname === pattern.hostname &&
        known.port === pattern.port
    );

  return fromEnv === undefined || alreadyListed(fromEnv)
    ? KNOWN_CMS_MEDIA_HOSTS
    : [...KNOWN_CMS_MEDIA_HOSTS, fromEnv];
}

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
