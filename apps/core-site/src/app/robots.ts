import type { MetadataRoute } from 'next';

function siteUrl(): string {
  const raw = process.env['SITE_URL'];
  const base = raw === undefined || raw.length === 0 ? 'http://localhost:3002' : raw;

  return base.replace(/\/+$/, '');
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl()}/sitemap.xml`
  };
}
