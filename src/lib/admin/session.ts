import type { Account } from './account';
import type { AdminConfig } from './config';
import type { AdminStore } from './store';
import { signToken, verifyToken } from './tokens';

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const CHALLENGE_TTL_SECONDS = 5 * 60;

// The __Host- prefix pins the cookie to this exact host over HTTPS. Browsers refuse it on plain
// http, so it is only used in production.
export function sessionCookieName(config: AdminConfig) {
  return config.production ? '__Host-admin' : 'admin';
}

export function challengeCookieName(config: AdminConfig) {
  return config.production ? '__Host-admin-challenge' : 'admin-challenge';
}

export function cookieOptions(config: AdminConfig, maxAge: number) {
  return { httpOnly: true, secure: config.production, sameSite: 'strict' as const, path: '/', maxAge };
}

export function sessionToken(config: AdminConfig, account: Account, now = Date.now()): string {
  return signToken('session', { u: account.username, v: account.sessionVersion }, config.sessionSecret, SESSION_TTL_SECONDS, now);
}

// Signature and expiry only. The proxy uses this for the fast redirect; pages and API routes
// use `sessionAccount`, which also checks the account still honours the session.
export function sessionIsValid(config: AdminConfig, token: string | undefined, now = Date.now()): boolean {
  return verifyToken('session', token, config.sessionSecret, now) !== null;
}

export async function sessionAccount(
  config: AdminConfig,
  store: AdminStore,
  token: string | undefined,
  now = Date.now(),
): Promise<Account | null> {
  const payload = verifyToken('session', token, config.sessionSecret, now);
  if (!payload) return null;
  const account = await store.get();
  if (!account || account.username !== payload.u || account.sessionVersion !== payload.v) return null;
  return account;
}

export type ChallengePurpose = 'register' | 'login';

export function challengeToken(config: AdminConfig, purpose: ChallengePurpose, challenge: string, now = Date.now()) {
  return signToken('challenge', { p: purpose, c: challenge }, config.sessionSecret, CHALLENGE_TTL_SECONDS, now);
}

export function readChallenge(
  config: AdminConfig,
  token: string | undefined,
  purpose: ChallengePurpose,
  now = Date.now(),
): string | null {
  const payload = verifyToken('challenge', token, config.sessionSecret, now);
  return payload && payload.p === purpose && typeof payload.c === 'string' ? payload.c : null;
}
