import type { GitHubClient } from './repo';

const WORKFLOW = 'deploy.yml';

export interface DeployRun {
  status: string;
  conclusion: string | null;
  url: string;
  startedAt: string;
}

// Passes the crawler setting the running image was built with, so publishing from the panel can
// never flip the site between hidden and indexable.
export async function startDeploy(gh: GitHubClient, siteIndexable: boolean): Promise<void> {
  const res = await gh.request(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: gh.branch, inputs: { site_indexable: String(siteIndexable) } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub refused to start the deploy (${res.status}). ${detail.slice(0, 200)}`);
  }
}

export async function latestDeploy(gh: GitHubClient): Promise<DeployRun | null> {
  const res = await gh.request(`/actions/workflows/${WORKFLOW}/runs?per_page=1&branch=${encodeURIComponent(gh.branch)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[];
  };
  const run = json.workflow_runs[0];
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, startedAt: run.created_at } : null;
}
