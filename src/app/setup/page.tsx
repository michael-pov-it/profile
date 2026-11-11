import type { Metadata } from 'next';
import { Fastfetch } from '@/components/setup/Fastfetch';
import { Prompt } from '@/components/shell/Prompt';
import { getMachines, getProfile } from '@/lib/content/collections';
import { groupMachines } from '@/lib/tui/setup';

export const metadata: Metadata = {
  title: 'Setup',
  description: 'Machines and connection, printed the way fastfetch would.',
};

export default function SetupPage() {
  const machines = getMachines();
  return (
    <>
      <Prompt cmd="fastfetch" label="Setup" />
      {machines.length === 0 ? (
        <p className="text-dim">No machines listed yet.</p>
      ) : (
        <Fastfetch groups={groupMachines(machines)} handle={getProfile().handle} />
      )}
    </>
  );
}
