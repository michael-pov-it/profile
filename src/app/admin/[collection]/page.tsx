import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { PublishPanel } from '@/components/admin/PublishPanel';
import { Prompt } from '@/components/shell/Prompt';
import { collectionSpec } from '@/lib/admin/collections';
import { listEntries } from '@/lib/admin/listing';
import { requireAdmin } from '@/lib/admin/page';

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
};

export default async function CollectionPage({ params, searchParams }: Props) {
  const { collection } = await params;
  const { saved, deleted } = await searchParams;
  const spec = collectionSpec(collection);
  if (!spec) notFound();

  const { runtime } = await requireAdmin();
  const backend = runtime.backend;

  let entries: Awaited<ReturnType<typeof listEntries>> = [];
  let failure = '';
  if (backend) {
    try {
      entries = await listEntries(backend.repo, spec);
    } catch (err) {
      failure = err instanceof Error ? err.message : 'could not read the content';
    }
  }

  return (
    <>
      <Prompt cmd={`ls content/${spec.key}`} label={`Edit ${spec.label}`} />
      <AdminNav current="content" />

      {!backend && <p className="notice notice-error mb-8">Content editing is not configured: no GitHub token is set.</p>}
      {failure && <p className="notice notice-error mb-8">{failure}</p>}
      {saved && (
        <p role="status" className="notice mb-8">
          Saved {saved}. Publish to put it on the live site.
        </p>
      )}
      {deleted && (
        <p role="status" className="notice mb-8">
          Deleted {deleted}. Publish to remove it from the live site.
        </p>
      )}

      {backend && (
        <>
          <p className="mb-6">
            <Link href={`/admin/${spec.key}/new`} className="link" data-nav-item>
              + add a {spec.singular}
            </Link>
          </p>
          {entries.length === 0 ? (
            <p className="text-dim">Nothing here yet.</p>
          ) : (
            <ul className="rows mb-14">
              {entries.map((e) => (
                <li key={e.slug}>
                  <Link
                    href={`/admin/${spec.key}/${e.slug}`}
                    data-nav-item
                    className="row grid-cols-[minmax(0,1fr)] gap-x-[2ch] sm:grid-cols-[minmax(0,1fr)_32ch]"
                  >
                    <span>{e.title}</span>
                    <span className="text-dim">{e.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <section aria-labelledby="adm-publish">
            <h2 id="adm-publish" className="t-title mb-3">
              publish
            </h2>
            <PublishPanel local={backend.repo.mode === 'local'} />
          </section>
        </>
      )}
    </>
  );
}
