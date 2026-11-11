import { shortHash } from './gitGraph';

export interface CardCommit {
  hash: string;
  role: string;
  span: string;
}

// The newest jobs for the share card, drawn as `git log` lines. Newest start first; among jobs that
// started together, ongoing ones come before finished ones.
export function cardCommits(
  jobs: { slug: string; role: string; start: string; end?: string }[],
  count = 3,
): CardCommit[] {
  return [...jobs]
    .sort((a, b) => b.start.localeCompare(a.start) || Number(Boolean(a.end)) - Number(Boolean(b.end)) || a.slug.localeCompare(b.slug))
    .slice(0, count)
    .map((job) => ({ hash: shortHash(job.slug), role: job.role, span: `${job.start}..${job.end ?? 'now'}` }));
}
