import { notFound } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { EntryEditor } from '@/components/admin/EntryEditor';
import { Prompt } from '@/components/shell/Prompt';
import { collectionSpec, publicSpec } from '@/lib/admin/collections';
import { emptyForm } from '@/lib/admin/entry';
import { requireAdmin } from '@/lib/admin/page';

export default async function NewEntryPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  const spec = collectionSpec(collection);
  if (!spec) notFound();
  await requireAdmin();

  return (
    <>
      <Prompt cmd={`touch ${spec.key}/new.md`} label={`Add a ${spec.singular}`} />
      <AdminNav current="content" />
      <EntryEditor spec={publicSpec(spec)} initial={emptyForm(spec)} />
    </>
  );
}
