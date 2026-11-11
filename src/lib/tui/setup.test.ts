import { describe, expect, it } from 'vitest';
import type { Machine } from '../content/collections';
import { connectionPhrase, groupMachines } from './setup';

type Row = { label: string; value: string };

function m(slug: string, group: 'work' | 'home', order?: number, rows: Row[] = [{ label: 'cpu', value: 'x' }]): Machine {
  return { slug, body: '', name: slug, group, order, rows, sample: false };
}
const slugs = (g: { machines: Machine[] }) => g.machines.map((x) => x.slug);

describe('groupMachines', () => {
  it('returns nothing for no machines', () => {
    expect(groupMachines([])).toEqual([]);
  });

  it('omits empty groups', () => {
    expect(groupMachines([m('pc', 'home')]).map((g) => g.group)).toEqual(['home']);
  });

  it('puts work before home whatever the input order', () => {
    expect(groupMachines([m('pc', 'home'), m('workpc', 'work')]).map((g) => g.group)).toEqual(['work', 'home']);
  });

  it('sorts ordered entries first, ascending, then the rest by slug', () => {
    const groups = groupMachines([m('zeta', 'home'), m('b', 'home', 2), m('alpha', 'home'), m('a', 'home', 1)]);
    expect(slugs(groups[0])).toEqual(['a', 'b', 'alpha', 'zeta']);
  });

  it('breaks ties on equal order by slug', () => {
    const groups = groupMachines([m('b', 'home', 1), m('a', 'home', 1)]);
    expect(slugs(groups[0])).toEqual(['a', 'b']);
  });
});

describe('connectionPhrase', () => {
  const net = (value: string, label = 'net') => [{ label, value }];

  it('cuts the net value at the first comma', () => {
    expect(connectionPhrase([m('workpc', 'work', 1, net('wired 1 Gbps, 923 down / 300 up, 2 ms ping'))])).toBe('wired 1 Gbps');
  });

  it('keeps a value with no comma whole', () => {
    expect(connectionPhrase([m('x', 'home', 1, net('wired 1 Gbps'))])).toBe('wired 1 Gbps');
  });

  it('finds the row whatever the label case', () => {
    expect(connectionPhrase([m('x', 'home', 1, net('wifi 6', 'NET'))])).toBe('wifi 6');
  });

  it('is undefined when no machine has a net row', () => {
    expect(connectionPhrase([m('laptop', 'home', 1, [{ label: 'cpu', value: 'c' }])])).toBeUndefined();
  });

  it('follows page order, not input order', () => {
    expect(connectionPhrase([m('h', 'home', 1, net('home line')), m('w', 'work', 1, net('work line'))])).toBe('work line');
  });
});
