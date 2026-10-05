'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

interface Run {
  status: string;
  conclusion: string | null;
  url: string;
  startedAt: string;
}

const running = (run: Run | null) => run !== null && run.status !== 'completed';

export function PublishPanel({ local }: { local: boolean }) {
  const [run, setRun] = useState<Run | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (local) return;
    const res = await api<{ run: Run | null }>('/api/admin/publish', 'GET');
    if (res.ok) setRun(res.data.run);
  }, [local]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  async function publish() {
    setBusy(true);
    setMessage('');
    const res = await api('/api/admin/publish', 'POST');
    setMessage(res.ok ? 'Deploy started. It takes about 5 minutes.' : (res.data.error ?? 'could not start the deploy'));
    setBusy(false);
    // GitHub needs a moment before the new run shows up.
    setTimeout(() => void refresh(), 4000);
  }

  if (local) {
    return <p className="text-dim">Local mode: edits are written straight to content/, so there is nothing to publish.</p>;
  }

  const state = !run
    ? 'no deploy found yet'
    : running(run)
      ? `deploy ${run.status.replace('_', ' ')}`
      : `last deploy ${run.conclusion ?? run.status}`;

  return (
    <div className="space-y-3">
      <p>
        <span className="text-dim">{state}</span>
        {run && (
          <>
            {' '}
            <a href={run.url} className="link" target="_blank" rel="noreferrer">
              details
            </a>
          </>
        )}
      </p>
      <button type="button" className="btn" onClick={publish} disabled={busy || running(run)}>
        Publish changes
      </button>
      <p className="text-dim t-micro">Saved changes are in git. Publishing builds and deploys the site so they go live.</p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
