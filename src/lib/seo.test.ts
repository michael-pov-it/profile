import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { siteIsIndexable } from './site';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hidden by default', () => {
  it('is not indexable unless SITE_INDEXABLE=true', () => {
    expect(siteIsIndexable()).toBe(false);
    vi.stubEnv('SITE_INDEXABLE', '1');
    expect(siteIsIndexable()).toBe(false);
  });

  it('robots.txt disallows everything, AI agents included, and advertises no sitemap', () => {
    const result = robots();
    expect(result.sitemap).toBeUndefined();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toHaveLength(2);
    const blocked = rules[1];
    expect(blocked.disallow).toBe('/');
    expect(blocked.allow).toBeUndefined();
    expect(blocked.userAgent).toEqual(expect.arrayContaining(['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']));
  });

  it('robots.txt lets the LinkedIn link-preview fetcher read the pages, but not the admin area', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]).toEqual({ userAgent: ['LinkedInBot'], allow: '/', disallow: ['/admin', '/api/admin'] });
    expect(rules[1].userAgent).not.toContain('LinkedInBot');
  });

  it('sitemap.xml is empty', () => {
    expect(sitemap()).toEqual([]);
  });
});

describe('public when SITE_INDEXABLE=true', () => {
  it('robots.txt allows crawling except the admin area, and points at the sitemap', () => {
    vi.stubEnv('SITE_INDEXABLE', 'true');
    const result = robots();
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/admin', '/api/admin'] });
    expect(result.sitemap).toBe('https://mike.euhub.co/sitemap.xml');
  });

  it('sitemap.xml lists the site', () => {
    vi.stubEnv('SITE_INDEXABLE', 'true');
    expect(sitemap().map((e) => e.url)).toContain('https://mike.euhub.co/books');
  });
});
