import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILURES, newAccount } from './account';
import { adminApi } from './api';
import { type ApiContext } from './api-types';
import { adminConfig } from './config';
import * as h from './handlers';
import { hashPassword } from './password';
import { resetRateLimits } from './request';
import { GitHubClient, LocalRepo } from './repo';
import { type AdminRuntime, setAdminRuntimeForTests } from './runtime';
import { challengeCookieName, sessionCookieName, sessionToken } from './session';
import { MemoryStore } from './store';

const ORIGIN = 'https://mike.euhub.co';
const config = adminConfig({
  ADMIN_SESSION_SECRET: 's'.repeat(40),
  ADMIN_ORIGIN: ORIGIN,
  ADMIN_SETUP_TOKEN: 'setup-secret',
  NODE_ENV: 'production',
})!;

function makeRuntime(extra: Partial<AdminRuntime> = {}): AdminRuntime {
  return { config, store: new MemoryStore(), backend: null, siteIndexable: false, ...extra };
}

function ctx(runtime: AdminRuntime, body: Record<string, unknown> = {}, cookies: Record<string, string> = {}): ApiContext {
  return {
    request: new Request(`${ORIGIN}/api/admin/x`, { method: 'POST' }),
    runtime,
    account: newAccount('mike', 'unused'),
    body,
    cookie: (n) => cookies[n],
  };
}

async function runtimeWithAccount(password = 'correct horse battery') {
  const runtime = makeRuntime();
  await runtime.store.create(newAccount('mike', await hashPassword(password)));
  return runtime;
}

beforeEach(() => resetRateLimits());
afterEach(() => setAdminRuntimeForTests(undefined));

describe('setup', () => {
  it('creates the account with the right token and signs in', async () => {
    const runtime = makeRuntime();
    const res = await h.setup(ctx(runtime, { token: 'setup-secret', username: 'mike', password: 'a long password' }));
    expect(res.status).toBe(200);
    expect(res.setCookies?.[0].name).toBe('__Host-admin');
    expect((await runtime.store.get())?.username).toBe('mike');
  });

  it('refuses a wrong token, weak input and a second account', async () => {
    const runtime = makeRuntime();
    expect((await h.setup(ctx(runtime, { token: 'nope', username: 'mike', password: 'a long password' }))).status).toBe(403);
    const weak = await h.setup(ctx(runtime, { token: 'setup-secret', username: 'm', password: 'short' }));
    expect(weak.status).toBe(422);
    expect(weak.body).toMatchObject({ errors: { username: expect.any(String), password: expect.any(String) } });
    expect(await runtime.store.get()).toBeNull();

    await h.setup(ctx(runtime, { token: 'setup-secret', username: 'mike', password: 'a long password' }));
    const second = await h.setup(ctx(runtime, { token: 'setup-secret', username: 'evil', password: 'another long password' }));
    expect(second.status).toBe(409);
    expect((await runtime.store.get())?.username).toBe('mike');
  });

  it('does not exist when no setup token is configured', async () => {
    const runtime = makeRuntime({ config: { ...config, setupToken: undefined } });
    expect((await h.setup(ctx(runtime, { token: '', username: 'mike', password: 'a long password' }))).status).toBe(404);
  });
});

describe('login', () => {
  it('signs in with the right credentials', async () => {
    const runtime = await runtimeWithAccount();
    const res = await h.login(ctx(runtime, { username: 'Mike', password: 'correct horse battery' }));
    expect(res.status).toBe(200);
    expect(res.setCookies?.[0].value).toContain('.');
  });

  it('gives the same answer for a wrong username and a wrong password', async () => {
    const runtime = await runtimeWithAccount();
    const wrongUser = await h.login(ctx(runtime, { username: 'someone', password: 'correct horse battery' }));
    const wrongPass = await h.login(ctx(runtime, { username: 'mike', password: 'wrong password here' }));
    expect(wrongUser.status).toBe(401);
    expect(wrongPass).toEqual(wrongUser);
    expect(wrongPass.setCookies).toBeUndefined();
  });

  it('locks password login after repeated failures, even for the right password', async () => {
    const runtime = await runtimeWithAccount();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await h.login(ctx(runtime, { username: 'mike', password: 'wrong password here' }));
    }
    const locked = await h.login(ctx(runtime, { username: 'mike', password: 'correct horse battery' }));
    expect(locked.status).toBe(401);
    expect(locked.setCookies).toBeUndefined();
  });

  it('locks even when the guesses arrive in parallel', async () => {
    const runtime = await runtimeWithAccount();
    await Promise.all(
      Array.from({ length: 12 }, () => h.login(ctx(runtime, { username: 'mike', password: 'wrong password here' }))),
    );
    expect((await runtime.store.get())?.lockedUntil).toBeGreaterThan(Date.now());
    const right = await h.login(ctx(runtime, { username: 'mike', password: 'correct horse battery' }));
    expect(right.status).toBe(401);
  });

  it('lets the right password in on the last allowed attempt', async () => {
    const runtime = await runtimeWithAccount();
    for (let i = 0; i < MAX_FAILURES - 1; i++) await h.login(ctx(runtime, { username: 'mike', password: 'wrong password here' }));
    const right = await h.login(ctx(runtime, { username: 'mike', password: 'correct horse battery' }));
    expect(right.status).toBe(200);
    expect((await runtime.store.get())?.failedLogins).toBe(0);
  });

  it('does not lock anything for an unknown username', async () => {
    const runtime = await runtimeWithAccount();
    for (let i = 0; i < MAX_FAILURES + 2; i++) await h.login(ctx(runtime, { username: 'other', password: 'x' }));
    expect((await h.login(ctx(runtime, { username: 'mike', password: 'correct horse battery' }))).status).toBe(200);
  });
});

describe('security changes', () => {
  it('changing the password ends other sessions but keeps this one', async () => {
    const runtime = await runtimeWithAccount();
    const account = (await runtime.store.get())!;
    const oldToken = sessionToken(config, account);

    const res = await h.changePassword({ ...ctx(runtime, { current: 'correct horse battery', next: 'a brand new password' }), account });
    expect(res.status).toBeUndefined();
    expect((await runtime.store.get())?.sessionVersion).toBe(account.sessionVersion + 1);
    expect(res.setCookies?.[0].value).not.toBe(oldToken);

    const next = await h.login(ctx(runtime, { username: 'mike', password: 'a brand new password' }));
    expect(next.status).toBe(200);
  });

  it('refuses a wrong current password or a weak new one', async () => {
    const runtime = await runtimeWithAccount();
    const account = (await runtime.store.get())!;
    expect((await h.changePassword({ ...ctx(runtime, { current: 'nope nope nope', next: 'a brand new password' }), account })).status).toBe(403);
    expect((await h.changePassword({ ...ctx(runtime, { current: 'correct horse battery', next: 'short' }), account })).status).toBe(422);
  });

  it('revoking sessions bumps the version and clears the cookie', async () => {
    const runtime = await runtimeWithAccount();
    const res = await h.revokeSessions(ctx(runtime));
    expect(res.clearCookies).toEqual(['__Host-admin']);
    expect((await runtime.store.get())?.sessionVersion).toBe(2);
  });

  it('removes a passkey by id', async () => {
    const runtime = await runtimeWithAccount();
    const account = (await runtime.store.get())!;
    const pk = { id: 'a', publicKey: 'k', counter: 0, name: 'Phone', createdAt: 'now' };
    await runtime.store.save({ ...account, passkeys: [pk, { ...pk, id: 'b' }] });
    const res = await h.passkeyDelete(ctx(runtime, { id: 'a' }));
    expect(res.body).toMatchObject({ passkeys: 1 });
    expect((await runtime.store.get())?.passkeys.map((p) => p.id)).toEqual(['b']);
  });
});

describe('passkey challenges', () => {
  it('login options set a signed challenge cookie, and verify fails without one', async () => {
    const runtime = await runtimeWithAccount();
    const options = await h.passkeyLoginOptions(ctx(runtime));
    expect((options.body as { challenge: string }).challenge).toBeTruthy();
    expect(options.setCookies?.[0].name).toBe(challengeCookieName(config));

    const verify = await h.passkeyLoginVerify(ctx(runtime, { response: {} }));
    expect(verify.status).toBe(401);
  });

  it('registration verify rejects a missing or wrong-purpose challenge', async () => {
    const runtime = await runtimeWithAccount();
    const account = (await runtime.store.get())!;
    expect((await h.passkeyRegisterVerify({ ...ctx(runtime, { response: {} }), account })).status).toBe(400);

    const loginChallenge = (await h.passkeyLoginOptions(ctx(runtime))).setCookies![0].value;
    const res = await h.passkeyRegisterVerify({
      ...ctx(runtime, { response: {} }, { [challengeCookieName(config)]: loginChallenge }),
      account,
    });
    expect(res.status).toBe(400);
  });

  it('registration options exclude passkeys that already exist', async () => {
    const runtime = await runtimeWithAccount();
    const account = (await runtime.store.get())!;
    const withKey = { ...account, passkeys: [{ id: 'abc', publicKey: 'k', counter: 0, name: 'n', createdAt: 't' }] };
    const res = await h.passkeyRegisterOptions({ ...ctx(runtime), account: withKey });
    const body = res.body as { excludeCredentials: { id: string }[]; authenticatorSelection: { residentKey: string } };
    expect(body.excludeCredentials.map((c) => c.id)).toEqual(['abc']);
    expect(body.authenticatorSelection.residentKey).toBe('required');
  });
});

describe('content handlers', () => {
  function withRepo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-content-'));
    const runtime = makeRuntime({ backend: { repo: new LocalRepo(root) } });
    return { runtime, root };
  }
  const book = { title: 'Cudzinec', author: 'Pavol Božík', status: 'queued', languages: 'SK' };

  it('creates, reads back, edits with the sha, and deletes', async () => {
    const { runtime, root } = withRepo();

    const created = await h.contentSave(ctx(runtime, { values: book, body: 'Notes' }), 'books', 'cudzinec');
    expect(created.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'books/cudzinec.md'), 'utf8')).toContain('author: Pavol Božík');

    const got = await h.contentGet(ctx(runtime), 'books', 'cudzinec');
    const { form, sha } = got.body as { form: { values: Record<string, string>; body: string }; sha: string };
    expect(form.values.languages).toBe('SK');
    expect(form.body).toBe('Notes');

    const edited = await h.contentSave(
      ctx(runtime, { values: { ...form.values, status: 'finished', finished: '2026-09' }, body: form.body, sha }),
      'books',
      'cudzinec',
    );
    expect(edited.status).toBe(200);

    const stale = await h.contentSave(ctx(runtime, { values: book, body: '', sha }), 'books', 'cudzinec');
    expect(stale.status).toBe(409);

    const fresh = (await h.contentGet(ctx(runtime), 'books', 'cudzinec')).body as { sha: string };
    expect((await h.contentDelete(ctx(runtime, { sha: fresh.sha }), 'books', 'cudzinec')).status).toBe(200);
    expect((await h.contentGet(ctx(runtime), 'books', 'cudzinec')).status).toBe(404);
  });

  it('rejects creating an entry that already exists', async () => {
    const { runtime } = withRepo();
    await h.contentSave(ctx(runtime, { values: book }), 'books', 'cudzinec');
    expect((await h.contentSave(ctx(runtime, { values: book }), 'books', 'cudzinec')).status).toBe(409);
  });

  it('returns field errors for invalid data without writing a file', async () => {
    const { runtime, root } = withRepo();
    const res = await h.contentSave(ctx(runtime, { values: { ...book, languages: '' } }), 'books', 'x');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: { languages: expect.any(String) } });
    expect(fs.existsSync(path.join(root, 'books/x.md'))).toBe(false);
  });

  it('rejects unknown collections, path tricks and a missing backend', async () => {
    const { runtime } = withRepo();
    expect((await h.contentGet(ctx(runtime), 'profile', 'x')).status).toBe(404);
    expect((await h.contentGet(ctx(runtime), 'books', '../profile')).status).toBe(400);
    expect((await h.contentSave(ctx(makeRuntime(), { values: book }), 'books', 'x')).status).toBe(503);
  });
});

describe('publish', () => {
  it('needs a GitHub backend', async () => {
    expect((await h.publish(ctx(makeRuntime()))).status).toBe(400);
    expect((await h.publishStatus(ctx(makeRuntime()))).body).toEqual({ run: null });
  });

  it('dispatches the workflow with the build-time crawler setting', async () => {
    const calls: { url: string; body: string }[] = [];
    const github = new GitHubClient({
      token: 't',
      repo: 'o/r',
      branch: 'main',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body) });
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    const runtime = makeRuntime({ backend: { repo: new LocalRepo(), github }, siteIndexable: true });
    expect((await h.publish(ctx(runtime))).status).toBe(202);
    expect(JSON.parse(calls[0].body)).toEqual({ ref: 'main', inputs: { site_indexable: 'true' } });
  });
});

describe('adminApi wrapper', () => {
  const call = (runtime: AdminRuntime | null, init: RequestInit & { cookie?: string } = {}) => {
    setAdminRuntimeForTests(runtime);
    const { cookie, ...rest } = init;
    return adminApi(
      new Request(`${ORIGIN}/api/admin/thing`, {
        method: 'POST',
        ...rest,
        headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(rest.headers as object) },
      }),
      { auth: true },
      async () => ({ body: { ran: true } }),
    );
  };

  it('answers 404 when admin is switched off', async () => {
    expect((await call(null, { body: '{}' })).status).toBe(404);
  });

  it('refuses cross-site requests before anything else', async () => {
    const runtime = await runtimeWithAccount();
    expect((await call(runtime, { body: '{}', headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });

  it('requires a valid session cookie', async () => {
    const runtime = await runtimeWithAccount();
    expect((await call(runtime, { body: '{}' })).status).toBe(401);
    expect((await call(runtime, { body: '{}', cookie: `${sessionCookieName(config)}=garbage` })).status).toBe(401);
  });

  it('rejects a non-object body, and runs the handler for a signed-in request', async () => {
    const runtime = await runtimeWithAccount();
    const cookie = `${sessionCookieName(config)}=${sessionToken(config, (await runtime.store.get())!)}`;
    expect((await call(runtime, { body: '[1]', cookie })).status).toBe(400);
    expect((await call(runtime, { body: 'nope', cookie })).status).toBe(400);
    const ok = await call(runtime, { body: '{}', cookie });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ran: true });
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('rate limits routes that need no session', async () => {
    setAdminRuntimeForTests(await runtimeWithAccount());
    const hit = () =>
      adminApi(
        new Request(`${ORIGIN}/api/admin/login`, {
          method: 'POST',
          headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
          body: '{}',
        }),
        { auth: false, limit: 3 },
        async () => ({ body: {} }),
      );
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await hit()).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});
