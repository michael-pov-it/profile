import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestDeploy, startDeploy } from './deploy';
import { GitHubClient, GitHubRepo, LocalRepo, RepoError, backendFromEnv } from './repo';

interface Call {
  url: string;
  method: string;
  body?: Record<string, unknown>;
  auth?: string;
}

function mockGitHub(respond: (call: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchMock = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init.headers as Record<string, string>).Authorization,
    };
    calls.push(call);
    const { status = 200, json = {} } = respond(call);
    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  }) as typeof fetch;
  const gh = new GitHubClient({ token: 'tok', repo: 'o/r', branch: 'main', fetch: fetchMock });
  return { gh, calls };
}

describe('GitHubRepo', () => {
  it('lists markdown files only, sorted', async () => {
    const { gh, calls } = mockGitHub(() => ({
      json: [
        { name: 'b.md', sha: '2', type: 'file' },
        { name: 'a.md', sha: '1', type: 'file' },
        { name: 'notes.txt', sha: '3', type: 'file' },
        { name: 'sub', sha: '4', type: 'dir' },
      ],
    }));
    expect(await new GitHubRepo(gh).list('books')).toEqual([
      { slug: 'a', sha: '1' },
      { slug: 'b', sha: '2' },
    ]);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/contents/content/books?ref=main');
    expect(calls[0].auth).toBe('Bearer tok');
  });

  it('reads base64 content, and returns null for a missing file', async () => {
    const { gh } = mockGitHub((c) =>
      c.url.includes('missing')
        ? { status: 404 }
        : { json: { sha: 'abc', content: Buffer.from('Cudzinec Božík', 'utf8').toString('base64') } },
    );
    const repo = new GitHubRepo(gh);
    expect(await repo.read('books/x.md')).toEqual({ sha: 'abc', text: 'Cudzinec Božík' });
    expect(await repo.read('books/missing.md')).toBeNull();
  });

  it('creates without a sha and updates with one, as UTF-8 base64 on the configured branch', async () => {
    const { gh, calls } = mockGitHub(() => ({}));
    const repo = new GitHubRepo(gh);
    await repo.write('books/new.md', 'Світанок', 'add book');
    await repo.write('books/old.md', 'x', 'edit book', 'sha1');
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { message: 'add book', branch: 'main' } });
    expect(calls[0].body).not.toHaveProperty('sha');
    expect(Buffer.from(String(calls[0].body?.content), 'base64').toString('utf8')).toBe('Світанок');
    expect(calls[1].body).toMatchObject({ sha: 'sha1' });
  });

  it('maps conflicts, permission errors and deletes', async () => {
    const status = { code: 422 };
    const { gh, calls } = mockGitHub(() => ({ status: status.code, json: { message: 'nope' } }));
    const repo = new GitHubRepo(gh);
    await expect(repo.write('books/x.md', 't', 'm')).rejects.toMatchObject({ kind: 'conflict' });
    status.code = 403;
    await expect(repo.write('books/x.md', 't', 'm')).rejects.toMatchObject({ kind: 'forbidden' });
    status.code = 200;
    await repo.remove('books/x.md', 'sha9', 'delete book');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', body: { sha: 'sha9', branch: 'main' } });
  });
});

describe('deploy', () => {
  it('dispatches the workflow with the crawler setting as a string input', async () => {
    const { gh, calls } = mockGitHub(() => ({ status: 204 }));
    await startDeploy(gh, false);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/actions/workflows/deploy.yml/dispatches');
    expect(calls[0].body).toEqual({ ref: 'main', inputs: { site_indexable: 'false' } });
  });

  it('turns a refusal into an error and reads the latest run', async () => {
    const refused = mockGitHub(() => ({ status: 403 }));
    await expect(startDeploy(refused.gh, false)).rejects.toThrow(/refused/);

    const { gh } = mockGitHub(() => ({
      json: { workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'u', created_at: 't' }] },
    }));
    expect(await latestDeploy(gh)).toEqual({ status: 'completed', conclusion: 'success', url: 'u', startedAt: 't' });
  });
});

describe('LocalRepo', () => {
  function tmpRepo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-repo-'));
    return { root, repo: new LocalRepo(root) };
  }

  it('creates, updates with the right sha, and refuses stale or duplicate writes', async () => {
    const { repo } = tmpRepo();
    await repo.write('books/a.md', 'one', 'm');
    await expect(repo.write('books/a.md', 'again', 'm')).rejects.toMatchObject({ kind: 'conflict' });
    const file = (await repo.read('books/a.md'))!;
    await repo.write('books/a.md', 'two', 'm', file.sha);
    await expect(repo.write('books/a.md', 'three', 'm', file.sha)).rejects.toBeInstanceOf(RepoError);
    expect((await repo.read('books/a.md'))?.text).toBe('two');
    expect(await repo.list('books')).toHaveLength(1);
  });

  it('deletes with the right sha only, and cannot leave content/', async () => {
    const { repo } = tmpRepo();
    await repo.write('books/a.md', 'one', 'm');
    await expect(repo.remove('books/a.md', 'wrong')).rejects.toMatchObject({ kind: 'conflict' });
    await repo.remove('books/a.md', (await repo.read('books/a.md'))!.sha);
    expect(await repo.read('books/a.md')).toBeNull();
    await expect(repo.read('../secret')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('backendFromEnv', () => {
  it('uses GitHub when a token is set, local files in development, and nothing in production', () => {
    expect(backendFromEnv({ ADMIN_GITHUB_TOKEN: 't', ADMIN_GITHUB_REPO: 'o/r' })?.repo.mode).toBe('github');
    expect(backendFromEnv({ NODE_ENV: 'development' })?.repo.mode).toBe('local');
    expect(backendFromEnv({ NODE_ENV: 'production' })).toBeNull();
  });
});
