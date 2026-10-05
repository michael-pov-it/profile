import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Where content files are read and written. GitHub in production (git stays the source of truth),
// the local content/ folder in `npm run dev`.
export interface RepoFile {
  sha: string;
  text: string;
}

export interface RepoEntry {
  slug: string;
  sha: string;
}

export class RepoError extends Error {
  constructor(
    message: string,
    readonly kind: 'conflict' | 'not-found' | 'forbidden' | 'failed',
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

export interface ContentRepo {
  readonly mode: 'github' | 'local';
  list(dir: string): Promise<RepoEntry[]>;
  read(file: string): Promise<RepoFile | null>;
  /** Without `sha` the file must not exist yet; with it, it must still be at that version. */
  write(file: string, text: string, message: string, sha?: string): Promise<void>;
  remove(file: string, sha: string, message: string): Promise<void>;
}

export interface GitHubOptions {
  token: string;
  repo: string; // owner/name
  branch: string;
  fetch?: typeof fetch;
}

export class GitHubClient {
  readonly repo: string;
  readonly branch: string;
  private token: string;
  private doFetch: typeof fetch;

  constructor(opts: GitHubOptions) {
    this.repo = opts.repo;
    this.branch = opts.branch;
    this.token = opts.token;
    this.doFetch = opts.fetch ?? fetch;
  }

  request(pathname: string, init: RequestInit = {}): Promise<Response> {
    return this.doFetch(`https://api.github.com/repos/${this.repo}${pathname}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mike-profile-admin',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }
}

async function failure(res: Response, what: string): Promise<RepoError> {
  const detail = await res
    .json()
    .then((j: { message?: string }) => j.message)
    .catch(() => undefined);
  if (res.status === 404) return new RepoError(`${what}: not found`, 'not-found');
  if (res.status === 409 || res.status === 422) {
    return new RepoError(`${what}: the file changed or already exists (${detail ?? res.status})`, 'conflict');
  }
  if (res.status === 401 || res.status === 403) {
    return new RepoError(`${what}: GitHub refused the token or the branch is protected (${detail ?? res.status})`, 'forbidden');
  }
  return new RepoError(`${what}: GitHub answered ${res.status} ${detail ?? ''}`.trim(), 'failed');
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export class GitHubRepo implements ContentRepo {
  readonly mode = 'github' as const;
  constructor(private gh: GitHubClient) {}

  private contents(file: string) {
    return `/contents/content/${encodePath(file)}`;
  }

  async list(dir: string) {
    const res = await this.gh.request(`${this.contents(dir)}?ref=${encodeURIComponent(this.gh.branch)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw await failure(res, `list ${dir}`);
    const items = (await res.json()) as { name: string; sha: string; type: string }[];
    return items
      .filter((i) => i.type === 'file' && i.name.endsWith('.md'))
      .map((i) => ({ slug: i.name.replace(/\.md$/, ''), sha: i.sha }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async read(file: string) {
    const res = await this.gh.request(`${this.contents(file)}?ref=${encodeURIComponent(this.gh.branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res, `read ${file}`);
    const json = (await res.json()) as { sha: string; content: string };
    return { sha: json.sha, text: Buffer.from(json.content, 'base64').toString('utf8') };
  }

  async write(file: string, text: string, message: string, sha?: string) {
    const res = await this.gh.request(this.contents(file), {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(text, 'utf8').toString('base64'),
        branch: this.gh.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) throw await failure(res, `save ${file}`);
  }

  async remove(file: string, sha: string, message: string) {
    const res = await this.gh.request(this.contents(file), {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.gh.branch }),
    });
    if (!res.ok) throw await failure(res, `delete ${file}`);
  }
}

const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

// Development only: edits content/ on disk, so the dev server shows a new entry straight away.
export class LocalRepo implements ContentRepo {
  readonly mode = 'local' as const;
  constructor(private root = path.join(process.cwd(), 'content')) {}

  private abs(file: string) {
    const target = path.resolve(this.root, file);
    if (!target.startsWith(this.root + path.sep)) throw new RepoError(`${file}: outside content/`, 'forbidden');
    return target;
  }

  async list(dir: string) {
    const abs = this.abs(dir);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs)
      .filter((n) => n.endsWith('.md'))
      .sort()
      .map((n) => ({ slug: n.replace(/\.md$/, ''), sha: hash(fs.readFileSync(path.join(abs, n), 'utf8')) }));
  }

  async read(file: string) {
    const abs = this.abs(file);
    if (!fs.existsSync(abs)) return null;
    const text = fs.readFileSync(abs, 'utf8');
    return { sha: hash(text), text };
  }

  async write(file: string, text: string, _message: string, sha?: string) {
    const abs = this.abs(file);
    const current = fs.existsSync(abs) ? hash(fs.readFileSync(abs, 'utf8')) : undefined;
    if (sha === undefined && current !== undefined) throw new RepoError(`${file}: already exists`, 'conflict');
    if (sha !== undefined && current !== sha) throw new RepoError(`${file}: changed since it was opened`, 'conflict');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }

  async remove(file: string, sha: string) {
    const abs = this.abs(file);
    if (!fs.existsSync(abs)) throw new RepoError(`${file}: not found`, 'not-found');
    if (hash(fs.readFileSync(abs, 'utf8')) !== sha) throw new RepoError(`${file}: changed since it was opened`, 'conflict');
    fs.unlinkSync(abs);
  }
}

export interface ContentBackend {
  repo: ContentRepo;
  github?: GitHubClient;
}

// null means editing is unavailable (production without a GitHub token): login still works.
export function backendFromEnv(env: Record<string, string | undefined> = process.env): ContentBackend | null {
  if (env.ADMIN_GITHUB_TOKEN && env.ADMIN_GITHUB_REPO) {
    const github = new GitHubClient({
      token: env.ADMIN_GITHUB_TOKEN,
      repo: env.ADMIN_GITHUB_REPO,
      branch: env.ADMIN_GITHUB_BRANCH || 'main',
    });
    return { repo: new GitHubRepo(github), github };
  }
  return env.NODE_ENV === 'production' ? null : { repo: new LocalRepo() };
}
