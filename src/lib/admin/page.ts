import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Account } from './account';
import { type AdminRuntime, adminRuntime } from './runtime';
import { sessionAccount, sessionCookieName } from './session';

// Server components call these. Admin that is switched off looks like a page that does not exist.
export function adminOr404(): AdminRuntime {
  const runtime = adminRuntime();
  if (!runtime) notFound();
  return runtime;
}

export async function currentAccount(runtime: AdminRuntime): Promise<Account | null> {
  const jar = await cookies();
  return sessionAccount(runtime.config, runtime.store, jar.get(sessionCookieName(runtime.config))?.value);
}

// Every protected page re-checks the session itself; the proxy is only the first, cheap gate.
export async function requireAdmin(): Promise<{ runtime: AdminRuntime; account: Account }> {
  const runtime = adminOr404();
  const account = await currentAccount(runtime);
  if (!account) redirect('/admin/login');
  return { runtime, account };
}
