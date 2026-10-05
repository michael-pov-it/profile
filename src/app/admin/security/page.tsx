import { AdminNav } from '@/components/admin/AdminNav';
import { SecurityPanel } from '@/components/admin/SecurityPanel';
import { Prompt } from '@/components/shell/Prompt';
import { requireAdmin } from '@/lib/admin/page';

export default async function SecurityPage() {
  const { account } = await requireAdmin();
  return (
    <>
      <Prompt cmd="passwd" label="Sign-in security" />
      <AdminNav current="security" />
      <SecurityPanel
        username={account.username}
        passkeys={account.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt }))}
      />
    </>
  );
}
