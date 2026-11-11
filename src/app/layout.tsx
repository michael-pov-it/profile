import type { Metadata } from 'next';
import { Martian_Mono } from 'next/font/google';
import { TuiFrame } from '@/components/shell/TuiFrame';
import { getProfile } from '@/lib/content/collections';
import { siteIsIndexable } from '@/lib/site';
import { bootScript } from '@/lib/theme';
import './globals.css';

const martian = Martian_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  axes: ['wdth'],
  variable: '--font-martian',
  display: 'swap',
});

export function generateMetadata(): Metadata {
  const profile = getProfile();
  const title = `${profile.name} | ${profile.role}`;
  const description = `${profile.name}, ${profile.role}. Career, plus the books, travel, languages, sport and hobbies in between.`;
  return {
    ...(profile.siteUrl ? { metadataBase: new URL(profile.siteUrl) } : {}),
    title: { default: title, template: `%s | ${profile.name}` },
    description,
    // Link previews. The image comes from app/opengraph-image.tsx; every page shares this card.
    openGraph: { type: 'website', siteName: profile.name, title, description },
    twitter: { card: 'summary_large_image', title, description },
    ...(siteIsIndexable()
      ? {}
      : { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } } }),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = getProfile();
  return (
    <html lang="en" className={martian.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <TuiFrame profile={profile}>{children}</TuiFrame>
      </body>
    </html>
  );
}
