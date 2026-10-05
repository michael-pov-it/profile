import { describe, expect, it } from 'vitest';
import {
  LOCK_MS,
  MAX_FAILURES,
  afterFailedLogin,
  afterSuccessfulLogin,
  isLocked,
  newAccount,
  usernameProblem,
} from './account';
import { adminConfig } from './config';
import { hashPassword, passwordProblem, verifyPassword } from './password';
import { isSameOriginJson, rateLimited, resetRateLimits } from './request';
import { challengeToken, readChallenge, sessionAccount, sessionIsValid, sessionToken } from './session';
import { MemoryStore, updateAccount } from './store';
import { signToken, verifyToken } from './tokens';

const SECRET = 'x'.repeat(40);
const env = { ADMIN_SESSION_SECRET: SECRET, ADMIN_ORIGIN: 'https://mike.euhub.co', NODE_ENV: 'production' };

describe('adminConfig', () => {
  it('is off without a long enough session secret', () => {
    expect(adminConfig({})).toBeNull();
    expect(adminConfig({ ADMIN_SESSION_SECRET: 'short', ADMIN_ORIGIN: 'https://a.co' })).toBeNull();
  });

  it('derives the passkey relying party from the origin', () => {
    expect(adminConfig(env)).toMatchObject({ origin: 'https://mike.euhub.co', rpID: 'mike.euhub.co', production: true });
  });

  it('needs an https origin in production and defaults to localhost in development', () => {
    expect(adminConfig({ ...env, ADMIN_ORIGIN: undefined })).toBeNull();
    expect(adminConfig({ ...env, ADMIN_ORIGIN: 'http://mike.euhub.co' })).toBeNull();
    expect(adminConfig({ ADMIN_SESSION_SECRET: SECRET, NODE_ENV: 'development' })).toMatchObject({
      origin: 'http://localhost:3000',
      rpID: 'localhost',
    });
  });
});

describe('tokens', () => {
  it('round-trips and expires', () => {
    const token = signToken('session', { u: 'mike' }, SECRET, 60, 1_000_000);
    expect(verifyToken('session', token, SECRET, 1_000_000 + 59_000)).toMatchObject({ u: 'mike' });
    expect(verifyToken('session', token, SECRET, 1_000_000 + 61_000)).toBeNull();
  });

  it('rejects tampering, the wrong secret and the wrong kind', () => {
    const token = signToken('session', { u: 'mike' }, SECRET, 60);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'root', k: 'session', exp: 9999999999 })).toString('base64url');
    expect(verifyToken('session', `${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken('session', token, 'y'.repeat(40))).toBeNull();
    expect(verifyToken('challenge', token, SECRET)).toBeNull();
    expect(verifyToken('session', `${body}.${sig}.extra`, SECRET)).toBeNull();
    expect(verifyToken('session', undefined, SECRET)).toBeNull();
    expect(verifyToken('session', 'garbage', SECRET)).toBeNull();
  });
});

describe('password', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong horse battery', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'));
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$a$b')).toBe(false);
  });

  it('asks for at least 12 characters', () => {
    expect(passwordProblem('short')).toMatch(/12/);
    expect(passwordProblem('long enough password')).toBeNull();
  });
});

describe('account lock-out', () => {
  it('locks password login after repeated failures and clears on success', () => {
    let account = newAccount('mike', 'hash');
    const now = 5_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i++) account = afterFailedLogin(account, now);
    expect(isLocked(account, now)).toBe(false);
    account = afterFailedLogin(account, now);
    expect(isLocked(account, now)).toBe(true);
    expect(isLocked(account, now + LOCK_MS - 1)).toBe(true);
    expect(isLocked(account, now + LOCK_MS)).toBe(false);
    expect(afterSuccessfulLogin(account)).toMatchObject({ failedLogins: 0, lockedUntil: undefined });
  });

  it('validates usernames', () => {
    expect(usernameProblem('mike')).toBeNull();
    expect(usernameProblem('a')).not.toBeNull();
    expect(usernameProblem('has space')).not.toBeNull();
  });
});

describe('store', () => {
  it('create fails when an account exists, so setup cannot overwrite it', async () => {
    const store = new MemoryStore();
    expect(await store.create(newAccount('mike', 'h1'))).toBe(true);
    expect(await store.create(newAccount('intruder', 'h2'))).toBe(false);
    expect((await store.get())?.username).toBe('mike');
  });

  it('updateAccount changes a stored copy, and does nothing without an account', async () => {
    const store = new MemoryStore();
    expect(await updateAccount(store, (a) => a)).toBeNull();
    await store.create(newAccount('mike', 'h'));
    await updateAccount(store, (a) => ({ ...a, sessionVersion: a.sessionVersion + 1 }));
    expect((await store.get())?.sessionVersion).toBe(2);
  });
});

describe('sessions', () => {
  const config = adminConfig(env)!;

  it('accepts a fresh session and rejects it after the session version changes', async () => {
    const store = new MemoryStore();
    await store.create(newAccount('mike', 'h'));
    const token = sessionToken(config, (await store.get())!);
    expect(sessionIsValid(config, token)).toBe(true);
    expect((await sessionAccount(config, store, token))?.username).toBe('mike');

    await updateAccount(store, (a) => ({ ...a, sessionVersion: a.sessionVersion + 1 }));
    expect(await sessionAccount(config, store, token)).toBeNull();
  });

  it('rejects a session for an account that no longer exists', async () => {
    const token = sessionToken(config, newAccount('mike', 'h'));
    expect(await sessionAccount(config, new MemoryStore(), token)).toBeNull();
  });

  it('keeps register and login challenges apart', () => {
    const token = challengeToken(config, 'register', 'abc123');
    expect(readChallenge(config, token, 'register')).toBe('abc123');
    expect(readChallenge(config, token, 'login')).toBeNull();
    expect(sessionIsValid(config, token)).toBe(false);
  });
});

describe('request checks', () => {
  const config = adminConfig(env)!;
  const req = (headers: Record<string, string>) => new Request('https://mike.euhub.co/api/admin/x', { method: 'POST', headers });

  it('accepts only same-origin JSON', () => {
    const json = { 'content-type': 'application/json' };
    expect(isSameOriginJson(req({ origin: 'https://mike.euhub.co', ...json }), config)).toBe(true);
    expect(isSameOriginJson(req({ origin: 'https://evil.example', ...json }), config)).toBe(false);
    expect(isSameOriginJson(req({ ...json }), config)).toBe(false);
    expect(isSameOriginJson(req({ origin: 'https://mike.euhub.co', 'content-type': 'text/plain' }), config)).toBe(false);
  });

  it('rate limits per key inside the window', () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimited('ip', 3, 1000, 100 + i)).toBe(false);
    expect(rateLimited('ip', 3, 1000, 104)).toBe(true);
    expect(rateLimited('other', 3, 1000, 104)).toBe(false);
    expect(rateLimited('ip', 3, 1000, 5000)).toBe(false);
  });
});
