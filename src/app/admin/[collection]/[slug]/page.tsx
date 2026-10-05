import { notFound } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { EntryEditor } from '@/components/admin/EntryEditor';
import { Prompt } from '@/components/shell/Prompt';
import { SLUG_PATTERN, collectionSpec, publicSpec } from '@/lib/admin/collections';
import { parseEntry } from '@/lib/admin/entry';
import { requireAdmin } from '@/lib/admin/page';

export default async function EditEntryPage({ params }: { params: Promise<{ collection: string; slug: string }> }) {
  const { collection, slug } = await params;
  const spec = collectionSpec(collection);
  if (!spec || !SLUG_PATTERN.test(slug)) notFound();

  const { runtime } = await requireAdmin();
  const file = await runtime.backend?.repo.read(`${spec.key}/${slug}.md`);
  if (!file) notFound();

  return (
    <>
      <Prompt cmd={`vim ${spec.key}/${slug}.md`} label={`Edit ${slug}`} />
      <AdminNav current="content" />
      <EntryEditor spec={publicSpec(spec)} slug={slug} sha={file.sha} initial={parseEntry(spec, file.text)} />
    </>
  );
}
