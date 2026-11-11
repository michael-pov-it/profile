import type { MetadataRoute } from 'next';
import { getProfile } from '@/lib/content/collections';
import { BLOCKED_AGENTS, PREVIEW_AGENTS, siteIsIndexable } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  if (!siteIsIndexable()) {
    return {
      rules: [
        { userAgent: PREVIEW_AGENTS, allow: '/', disallow: ['/admin', '/api/admin'] },
        { userAgent: BLOCKED_AGENTS, disallow: '/' },
      ],
    };
  }
  const { siteUrl } = getProfile();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/admin'] },
    ...(siteUrl ? { sitemap: `${siteUrl.replace(/\/$/, '')}/sitemap.xml` } : {}),
  };
}
