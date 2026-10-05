import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Always rendered per request, never indexed, whatever the site-wide setting says.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
