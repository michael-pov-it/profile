import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';
import { PublishPanel } from '@/components/admin/PublishPanel';
import { Prompt } from '@/components/shell/Prompt';
import { COLLECTIONS } from '@/lib/admin/collections';
import { requireAdmin } from '@/lib/admin/page';

export default async function AdminDashboard() {
  const { runtime } = await requireAdmin();
  const backend = runtime.backend;

  let counts: { key: string; label: string; count: number }[] | null = null;
  let failure = '';
  if (backend) {
    try {
      counts = await Promise.all(
        COLLECTIONS.map(async (c) => ({ key: c.key, label: c.label, count: (await backend.repo.list(c.key)).length })),
      );
    } catch (err) {
      failure = err instanceof Error ? err.message : 'could not read the content';
    }
  }

  return (
    <>
      <Prompt cmd="cd /admin" label="Admin" />
      <AdminNav current="dashboard" />

      {!backend && (
        <p className="notice notice-error mb-10 max-w-[68ch]">
          Content editing is not configured: no GitHub token is set. You can still manage your sign-in on the security page.
        </p>
      )}
      {failure && <p className="notice notice-error mb-10 max-w-[68ch]">{failure}</p>}

      {counts && (
        <section aria-labelledby="adm-content" className="mb-14">
          <h2 id="adm-content" className="t-title mb-3">
            content
          </h2>
          <ul className="rows">
            {counts.map((c) => (
              <li key={c.key}>
                <Link href={`/admin/${c.key}`} data-nav-item className="row grid-cols-[minmax(0,1fr)_12ch] gap-x-[2ch]">
                  <span>{c.label}</span>
                  <span className="text-dim">{c.count} entries</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {backend && (
        <section aria-labelledby="adm-publish">
          <h2 id="adm-publish" className="t-title mb-3">
            publish
          </h2>
          <PublishPanel local={backend.repo.mode === 'local'} />
        </section>
      )}
    </>
  );
}
