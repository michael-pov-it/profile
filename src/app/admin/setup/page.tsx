import { notFound, redirect } from 'next/navigation';
import { SetupForm } from '@/components/admin/SetupForm';
import { Prompt } from '@/components/shell/Prompt';
import { adminOr404 } from '@/lib/admin/page';

export default async function SetupPage() {
  const runtime = adminOr404();
  if (!runtime.config.setupToken) notFound();
  if (await runtime.store.get()) redirect('/admin/login');

  return (
    <>
      <Prompt cmd="adduser admin" label="Create the admin account" />
      <p className="text-dim mb-8 max-w-[68ch]">
        One-time setup. You need the setup token from the deployment secrets. After this page creates the account it
        stops working.
      </p>
      <SetupForm />
    </>
  );
}
