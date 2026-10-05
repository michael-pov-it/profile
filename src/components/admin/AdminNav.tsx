'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './api';

export function AdminNav({ current }: { current: 'dashboard' | 'security' | 'content' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await api('/api/admin/logout', 'POST');
    router.replace('/admin/login');
    router.refresh();
  }

  const item = (href: string, label: string, key: string) => (
    <Link href={href} className={key === current ? 'link text-warn' : 'link'} aria-current={key === current ? 'page' : undefined}>
      {label}
    </Link>
  );

  return (
    <nav aria-label="Admin" className="mb-10 flex flex-wrap items-baseline gap-x-[3ch] gap-y-2">
      {item('/admin', 'dashboard', 'dashboard')}
      {item('/admin/security', 'security', 'security')}
      <button type="button" className="link" onClick={signOut} disabled={busy}>
        sign out
      </button>
    </nav>
  );
}
