import type { Machine } from '../content/collections';
import { MACHINE_GROUPS } from '../content/schemas';

export interface MachineGroup {
  group: (typeof MACHINE_GROUPS)[number];
  machines: Machine[];
}

function byPageOrder(a: Machine, b: Machine): number {
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order) return a.order - b.order;
  if ((a.order === undefined) !== (b.order === undefined)) return a.order === undefined ? 1 : -1;
  return a.slug.localeCompare(b.slug);
}

export function groupMachines(machines: Machine[]): MachineGroup[] {
  return MACHINE_GROUPS.map((group) => ({
    group,
    machines: machines.filter((x) => x.group === group).sort(byPageOrder),
  })).filter((g) => g.machines.length > 0);
}

export function connectionPhrase(machines: Machine[]): string | undefined {
  for (const { machines: list } of groupMachines(machines)) {
    for (const machine of list) {
      const net = machine.rows.find((r) => r.label.toLowerCase() === 'net');
      if (net) return net.value.split(',')[0].trim();
    }
  }
  return undefined;
}
