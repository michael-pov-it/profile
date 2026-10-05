import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  type Account,
  afterFailedLogin,
  afterSuccessfulLogin,
  isLocked,
  newAccount,
  sameUsername,
  usernameProblem,
} from './account';
import { type ApiContext, type ApiOutput, out } from './api-types';
import { type CollectionSpec, SLUG_PATTERN, collectionSpec } from './collections';
import { latestDeploy, startDeploy } from './deploy';
import { buildEntry, parseEntry } from './entry';
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from './password';
import { type ContentRepo, RepoError } from './repo';
import {
  CHALLENGE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  challengeCookieName,
  challengeToken,
  readChallenge,
  sessionCookieName,
  sessionToken,
} from './session';
import { updateAccount } from './store';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from './webauthn';

const text = (v: unknown) => (typeof v === 'string' ? v : '');

function startSession(ctx: ApiContext, account: Account): NonNullable<ApiOutput['setCookies']> {
  const { config } = ctx.runtime;
  return [{ name: sessionCookieName(config), value: sessionToken(config, account), maxAge: SESSION_TTL_SECONDS }];
}

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// First-run setup: creates the one account, only while none exists and only with the setup token.
export async function setup(ctx: ApiContext): Promise<ApiOutput> {
  const { config, store } = ctx.runtime;
  if (!config.setupToken) return out(404, { error: 'not found' });
  if (!sameSecret(text(ctx.body.token), config.setupToken)) return out(403, { error: 'wrong setup token' });

  const username = text(ctx.body.username).trim();
  const password = text(ctx.body.password);
  const problem = usernameProblem(username) && { username: usernameProblem(username) };
  const pwProblem = passwordProblem(password) && { password: passwordProblem(password) };
  if (problem || pwProblem) return out(422, { errors: { ...problem, ...pwProblem } });

  const account = newAccount(username, await hashPassword(password));
  if (!(await store.create(account))) return out(409, { error: 'an account already exists' });
  return { status: 200, body: { ok: true }, setCookies: startSession(ctx, account) };
}

// One generic answer for a wrong username, a wrong password and a locked account, so the
// response never confirms which usernames exist.
const DENIED = 'wrong username or password, or sign-in is temporarily locked';

export async function login(ctx: ApiContext): Promise<ApiOutput> {
  const { store } = ctx.runtime;
  const username = text(ctx.body.username).trim();
  const password = text(ctx.body.password);
  const account = await store.get();

  const passwordOk = await verifyPassword(password, account?.passwordHash ?? (await dummyHash()));
  const nameOk = account !== null && sameUsername(account.username, username);

  if (!account || !nameOk) return out(401, { error: DENIED });
  if (isLocked(account) || !passwordOk) {
    if (!isLocked(account)) await store.save(afterFailedLogin(account));
    return out(401, { error: DENIED });
  }

  const next = afterSuccessfulLogin(account);
  await store.save(next);
  return { status: 200, body: { ok: true }, setCookies: startSession(ctx, next) };
}

export async function logout(ctx: ApiContext): Promise<ApiOutput> {
  return { body: { ok: true }, clearCookies: [sessionCookieName(ctx.runtime.config)] };
}

export async function revokeSessions(ctx: ApiContext): Promise<ApiOutput> {
  await updateAccount(ctx.runtime.store, (a) => ({ ...a, sessionVersion: a.sessionVersion + 1 }));
  return { body: { ok: true }, clearCookies: [sessionCookieName(ctx.runtime.config)] };
}

export async function changePassword(ctx: ApiContext): Promise<ApiOutput> {
  const next = text(ctx.body.next);
  if (!(await verifyPassword(text(ctx.body.current), ctx.account.passwordHash))) {
    return out(403, { errors: { current: 'wrong password' } });
  }
  const problem = passwordProblem(next);
  if (problem) return out(422, { errors: { next: problem } });

  const passwordHash = await hashPassword(next);
  const updated = await updateAccount(ctx.runtime.store, (a) => ({
    ...a,
    passwordHash,
    sessionVersion: a.sessionVersion + 1,
  }));
  // Every other session ends; this one continues under the new version.
  return { body: { ok: true }, setCookies: startSession(ctx, updated ?? ctx.account) };
}

export async function passkeyRegisterOptions(ctx: ApiContext): Promise<ApiOutput> {
  const { config } = ctx.runtime;
  const options = await registrationOptions(config, ctx.account);
  return {
    body: options,
    setCookies: [
      {
        name: challengeCookieName(config),
        value: challengeToken(config, 'register', options.challenge),
        maxAge: CHALLENGE_TTL_SECONDS,
      },
    ],
  };
}

export async function passkeyRegisterVerify(ctx: ApiContext): Promise<ApiOutput> {
  const { config, store } = ctx.runtime;
  const name = text(ctx.body.name).trim().slice(0, 40) || `Passkey ${ctx.account.passkeys.length + 1}`;
  const challenge = readChallenge(config, ctx.cookie(challengeCookieName(config)), 'register');
  if (!challenge) return out(400, { error: 'the passkey request expired, try again' });

  let passkey;
  try {
    passkey = await verifyRegistration(config, ctx.body.response as RegistrationResponseJSON, challenge, name);
  } catch (err) {
    console.error('passkey registration failed', err);
    passkey = null;
  }
  if (!passkey) return out(400, { error: 'the passkey could not be verified' });

  const saved = await updateAccount(store, (a) =>
    a.passkeys.some((p) => p.id === passkey.id) ? a : { ...a, passkeys: [...a.passkeys, passkey] },
  );
  return { body: { ok: true, passkeys: saved?.passkeys.length }, clearCookies: [challengeCookieName(config)] };
}

export async function passkeyLoginOptions(ctx: ApiContext): Promise<ApiOutput> {
  const { config } = ctx.runtime;
  const options = await authenticationOptions(config);
  return {
    body: options,
    setCookies: [
      {
        name: challengeCookieName(config),
        value: challengeToken(config, 'login', options.challenge),
        maxAge: CHALLENGE_TTL_SECONDS,
      },
    ],
  };
}

export async function passkeyLoginVerify(ctx: ApiContext): Promise<ApiOutput> {
  const { config, store } = ctx.runtime;
  const denied: ApiOutput = { status: 401, body: { error: 'passkey sign-in failed' }, clearCookies: [challengeCookieName(config)] };

  const account = await store.get();
  const challenge = readChallenge(config, ctx.cookie(challengeCookieName(config)), 'login');
  if (!account || !challenge) return denied;

  let result;
  try {
    result = await verifyAuthentication(config, account, ctx.body.response as AuthenticationResponseJSON, challenge);
  } catch (err) {
    console.error('passkey sign-in failed', err);
    return denied;
  }
  if (!result) return denied;

  const next = await updateAccount(store, (a) => ({
    ...a,
    passkeys: a.passkeys.map((p) => (p.id === result.passkey.id ? { ...p, counter: result.counter } : p)),
  }));
  return {
    body: { ok: true },
    setCookies: startSession(ctx, next ?? account),
    clearCookies: [challengeCookieName(config)],
  };
}

export async function passkeyDelete(ctx: ApiContext): Promise<ApiOutput> {
  const id = text(ctx.body.id);
  const saved = await updateAccount(ctx.runtime.store, (a) => ({ ...a, passkeys: a.passkeys.filter((p) => p.id !== id) }));
  return out(200, { ok: true, passkeys: saved?.passkeys.length ?? 0 });
}

// ---- content ----

type Target =
  | { error: ApiOutput }
  | { error?: undefined; spec: CollectionSpec; repo: ContentRepo; file: string };

function target(ctx: ApiContext, collection: string, slug: string): Target {
  const spec = collectionSpec(collection);
  if (!spec) return { error: out(404, { error: 'unknown collection' }) };
  if (!SLUG_PATTERN.test(slug)) return { error: out(400, { error: 'invalid name' }) };
  const repo = ctx.runtime.backend?.repo;
  if (!repo) return { error: out(503, { error: 'content editing is not configured (no GitHub token)' }) };
  return { spec, repo, file: `${spec.key}/${slug}.md` };
}

function repoFailure(err: unknown): ApiOutput {
  if (err instanceof RepoError) {
    const status = err.kind === 'conflict' ? 409 : err.kind === 'not-found' ? 404 : 502;
    return out(status, { error: err.message });
  }
  throw err;
}

export async function contentGet(ctx: ApiContext, collection: string, slug: string): Promise<ApiOutput> {
  const t = target(ctx, collection, slug);
  if (t.error) return t.error;
  try {
    const file = await t.repo.read(t.file);
    if (!file) return out(404, { error: 'not found' });
    return out(200, { form: parseEntry(t.spec, file.text), sha: file.sha });
  } catch (err) {
    return repoFailure(err);
  }
}

export async function contentSave(ctx: ApiContext, collection: string, slug: string): Promise<ApiOutput> {
  const t = target(ctx, collection, slug);
  if (t.error) return t.error;

  const rawValues = ctx.body.values;
  if (!rawValues || typeof rawValues !== 'object') return out(400, { error: 'values are required' });
  const values = Object.fromEntries(Object.entries(rawValues).map(([k, v]) => [k, text(v)]));
  const sha = text(ctx.body.sha) || undefined;

  const built = buildEntry(t.spec, slug, { values, body: text(ctx.body.body) });
  if (!built.ok) return out(422, { errors: built.errors });

  try {
    await t.repo.write(t.file, built.text, `content: ${sha ? 'update' : 'add'} ${t.spec.singular} ${slug} (admin)`, sha);
  } catch (err) {
    return repoFailure(err);
  }
  return out(200, { ok: true, slug, created: !sha });
}

export async function contentDelete(ctx: ApiContext, collection: string, slug: string): Promise<ApiOutput> {
  const t = target(ctx, collection, slug);
  if (t.error) return t.error;
  const sha = text(ctx.body.sha);
  if (!sha) return out(400, { error: 'sha is required' });
  try {
    await t.repo.remove(t.file, sha, `content: delete ${t.spec.singular} ${slug} (admin)`);
  } catch (err) {
    return repoFailure(err);
  }
  return out(200, { ok: true });
}

// ---- publish ----

export async function publish(ctx: ApiContext): Promise<ApiOutput> {
  const github = ctx.runtime.backend?.github;
  if (!github) return out(400, { error: 'publishing needs a GitHub token; locally, edits are already live' });
  try {
    await startDeploy(github, ctx.runtime.siteIndexable);
  } catch (err) {
    return out(502, { error: (err as Error).message });
  }
  return out(202, { ok: true });
}

export async function publishStatus(ctx: ApiContext): Promise<ApiOutput> {
  const github = ctx.runtime.backend?.github;
  if (!github) return out(200, { run: null });
  return out(200, { run: await latestDeploy(github) });
}
