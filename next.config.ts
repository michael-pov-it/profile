import type { NextConfig } from 'next';

const indexable = process.env.SITE_INDEXABLE === 'true';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['dotted-map'],
  async headers() {
    const noindex = 'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai';
    // The admin area is never indexed or cached, even when the public site is made indexable.
    const admin = [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: noindex },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/api/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: noindex }],
      },
    ];
    if (indexable) return admin;
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: noindex }] }, ...admin];
  },
};

export default nextConfig;
