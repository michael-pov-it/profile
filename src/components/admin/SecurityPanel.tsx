'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from './api';

interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
}

export function SecurityPanel({ username, passkeys }: { username: string; passkeys: PasskeyInfo[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const say = (text: string, error = false) => setMessage({ text, error });

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '');
    setBusy(true);
    setMessage(null);
    try {
      const options = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>(
        '/api/admin/passkeys/register/options',
        'POST',
      );
      if (!options.ok) throw new Error(options.data.error ?? 'could not start');
      const response = await startRegistration({ optionsJSON: options.data });
      const res = await api('/api/admin/passkeys/register/verify', 'POST', { response, name });
      if (!res.ok) throw new Error(res.data.error ?? 'could not save the passkey');
      say('Passkey added.');
      router.refresh();
    } catch (err) {
      const cancelled = err instanceof Error && err.name === 'NotAllowedError';
      say(cancelled ? 'Passkey setup was cancelled.' : err instanceof Error ? err.message : 'passkey setup failed', true);
    }
    setBusy(false);
  }

  async function removePasskey(p: PasskeyInfo) {
    if (!window.confirm(`Remove the passkey "${p.name}"?`)) return;
    setBusy(true);
    const res = await api('/api/admin/passkeys', 'DELETE', { id: p.id });
    if (res.ok) router.refresh();
    else say(res.data.error ?? 'could not remove it', true);
    setBusy(false);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('next') !== data.get('confirm')) {
      setErrors({ confirm: 'the passwords do not match' });
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage(null);
    const res = await api('/api/admin/password', 'PUT', { current: data.get('current'), next: data.get('next') });
    if (res.ok) {
      form.reset();
      say('Password changed. Other devices are signed out.');
    } else {
      setErrors(res.data.errors ?? {});
      if (!res.data.errors) say(res.data.error ?? 'could not change the password', true);
    }
    setBusy(false);
  }

  async function revoke() {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    setBusy(true);
    await api('/api/admin/sessions/revoke', 'POST');
    router.replace('/admin/login');
    router.refresh();
  }

  const password = (name: string, label: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="password"
        className="input"
        autoComplete={autoComplete}
        required
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${name}-error`} className="field-error">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="max-w-[60ch] space-y-14">
      <section aria-labelledby="sec-passkeys" className="space-y-4">
        <h2 id="sec-passkeys" className="t-title">
          passkeys
        </h2>
        {passkeys.length === 0 ? (
          <p className="text-dim">No passkeys yet. Add one to sign in with a fingerprint, face or security key.</p>
        ) : (
          <ul className="rows">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-[2ch] px-[1ch] py-1.5">
                <span>
                  {p.name} <span className="text-dim">added {p.createdAt.slice(0, 10)}</span>
                </span>
                <button type="button" className="link text-alert" onClick={() => removePasskey(p)} disabled={busy}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addPasskey} className="space-y-3">
          <div className="field">
            <label htmlFor="passkey-name" className="field-label">
              Name for the new passkey
            </label>
            <input id="passkey-name" name="name" className="input" placeholder="Laptop, phone, security key" maxLength={40} />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            Add a passkey
          </button>
        </form>
      </section>

      <section aria-labelledby="sec-password" className="space-y-4">
        <h2 id="sec-password" className="t-title">
          password
        </h2>
        <p className="text-dim">Signed in as {username}.</p>
        <form onSubmit={changePassword} className="space-y-4">
          {password('current', 'Current password', 'current-password')}
          {password('next', 'New password (12 or more characters)', 'new-password')}
          {password('confirm', 'Repeat the new password', 'new-password')}
          <button type="submit" className="btn" disabled={busy}>
            Change password
          </button>
        </form>
      </section>

      <section aria-labelledby="sec-sessions" className="space-y-4">
        <h2 id="sec-sessions" className="t-title">
          sessions
        </h2>
        <p className="text-dim">Sign-ins last 12 hours. Use this if a device is lost.</p>
        <button type="button" className="btn btn-danger" onClick={revoke} disabled={busy}>
          Sign out everywhere
        </button>
      </section>

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'notice notice-error' : 'notice'}>
          {message.text}
        </p>
      )}
    </div>
  );
}
