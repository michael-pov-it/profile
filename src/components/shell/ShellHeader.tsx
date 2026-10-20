'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS, activeTabHref, promptPath } from '@/lib/tui/tabs';

export function ShellHeader({ user, host }: { user: string; host: string }) {
  const pathname = usePathname();
  const active = activeTabHref(pathname);
  return (
    <>
      <div className="shell-title t-dense">
        <span className="min-w-0 truncate">
          {user}@{host}: {promptPath(pathname)}
        </span>
        <a
          href="https://www.linkedin.com/in/gordievsky"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mike Gordievsky on LinkedIn (opens in a new tab)"
          title="LinkedIn"
          className="inline-flex size-6 shrink-0 items-center justify-center hover:text-warn"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="size-4">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.049c.476-.91 1.637-1.87 3.37-1.87 3.601 0 4.267 2.37 4.267 5.455v6.306zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.224 24 24 23.227 24 22.271V1.729C24 .774 23.224 0 22.222 0h.003z" />
          </svg>
        </a>
      </div>
      <nav aria-label="Sections" className="shell-tabs">
        <ul>
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link href={tab.href} className="tab" aria-current={active === tab.href ? 'page' : undefined}>
                <span className="tab-key text-dim">{tab.key}</span> {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
