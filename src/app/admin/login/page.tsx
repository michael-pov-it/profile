import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/LoginForm';
import { Prompt } from '@/components/shell/Prompt';
import { adminOr404, currentAccount } from '@/lib/admin/page';

export default async function LoginPage() {
  const runtime = adminOr404();
  if (await currentAccount(runtime)) redirect('/admin');
  const hasAccount = (await runtime.store.get()) !== null;

  return (
    <>
      <Prompt cmd="sudo -i" label="Admin sign-in" />
      {hasAccount || runtime.config.setupToken ? (
        <LoginForm canSetUp={!hasAccount && Boolean(runtime.config.setupToken)} />
      ) : (
        <p className="text-dim">Admin has no account yet and setup is not enabled.</p>
      )}
    </>
  );
}
