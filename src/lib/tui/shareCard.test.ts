import { describe, expect, it } from 'vitest';
import { shortHash } from './gitGraph';
import { cardCommits } from './shareCard';

const jobs = [
  { slug: 'old', role: 'DevOps', start: '2019', end: '2020-03' },
  { slug: 'ended', role: 'Architect B', start: '2023-12', end: '2024-12' },
  { slug: 'newest', role: 'Architect C', start: '2026-02' },
  { slug: 'ongoing', role: 'Architect A', start: '2023-12' },
];

describe('cardCommits', () => {
  it('lists the newest jobs first, ongoing before finished when they started together', () => {
    expect(cardCommits(jobs)).toEqual([
      { hash: shortHash('newest'), role: 'Architect C', span: '2026-02..now' },
      { hash: shortHash('ongoing'), role: 'Architect A', span: '2023-12..now' },
      { hash: shortHash('ended'), role: 'Architect B', span: '2023-12..2024-12' },
    ]);
  });

  it('returns fewer lines when there are fewer jobs, and none for no jobs', () => {
    expect(cardCommits(jobs.slice(0, 1))).toHaveLength(1);
    expect(cardCommits([])).toEqual([]);
  });
});
