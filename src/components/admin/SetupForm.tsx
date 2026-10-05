'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from './api';

export function SetupForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setErrors({ confirm: 'the passwords do not match' });
      return;
    }
    setBusy(true);
    setErrors({});
    const res = await api('/api/admin/setup', 'POST', {
      token: form.get('token'),
      username: form.get('username'),
      password: form.get('password'),
    });
    if (res.ok) {
      router.replace('/admin/security');
      router.refresh();
      return;
    }
    setErrors(res.data.errors ?? { token: res.data.error ?? 'setup failed' });
    setBusy(false);
  }

  const field = (name: string, label: string, type = 'text', autoComplete?: string) => (
    <div className="field">
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
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
    <form onSubmit={onSubmit} className="max-w-[44ch] space-y-4">
      {field('token', 'Setup token', 'password', 'off')}
      {field('username', 'Username', 'text', 'username')}
      {field('password', 'Password (12 or more characters)', 'password', 'new-password')}
      {field('confirm', 'Repeat the password', 'password', 'new-password')}
      <button type="submit" className="btn" disabled={busy}>
        Create account
      </button>
    </form>
  );
}
