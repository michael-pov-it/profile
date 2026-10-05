'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from './api';

export function LoginForm({ canSetUp }: { canSetUp: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function done() {
    router.replace('/admin');
    router.refresh();
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const res = await api('/api/admin/login', 'POST', {
      username: form.get('username'),
      password: form.get('password'),
    });
    if (res.ok) return done();
    setError(res.data.error ?? 'sign-in failed');
    setBusy(false);
  }

  async function onPasskey() {
    setBusy(true);
    setError('');
    try {
      const options = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
        '/api/admin/passkeys/login/options',
        'POST',
      );
      if (!options.ok) throw new Error(options.data.error ?? 'could not start passkey sign-in');
      const response = await startAuthentication({ optionsJSON: options.data });
      const res = await api('/api/admin/passkeys/login/verify', 'POST', { response });
      if (res.ok) return done();
      throw new Error(res.data.error ?? 'passkey sign-in failed');
    } catch (err) {
      const cancelled = err instanceof Error && err.name === 'NotAllowedError';
      setError(cancelled ? 'passkey sign-in was cancelled' : err instanceof Error ? err.message : 'passkey sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[44ch] space-y-8">
      <button type="button" className="btn w-full" onClick={onPasskey} disabled={busy}>
        Sign in with a passkey
      </button>

      <form onSubmit={onPassword} className="space-y-4">
        <p className="text-dim">or with a password</p>
        <div className="field">
          <label htmlFor="username" className="field-label">
            Username
          </label>
          <input id="username" name="username" className="input" autoComplete="username webauthn" required />
        </div>
        <div className="field">
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          Sign in
        </button>
      </form>

      <p role="alert" className={error ? 'notice notice-error' : 'sr-only'}>
        {error}
      </p>
      {canSetUp && (
        <p className="text-dim">
          No account yet?{' '}
          <Link href="/admin/setup" className="link">
            Set one up
          </Link>
          .
        </p>
      )}
    </div>
  );
}
