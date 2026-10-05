export interface Passkey {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  name: string;
  createdAt: string;
}

export interface Account {
  username: string;
  passwordHash: string;
  passkeys: Passkey[];
  // Bumped on password change and "sign out everywhere"; sessions carry the version they were issued at.
  sessionVersion: number;
  failedLogins: number;
  lockedUntil?: number;
}

export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

// Only password login is ever locked. Passkey login stays open, so someone guessing passwords
// cannot lock the owner out.
export function isLocked(account: Account, now = Date.now()): boolean {
  return account.lockedUntil !== undefined && account.lockedUntil > now;
}

export function afterFailedLogin(account: Account, now = Date.now()): Account {
  const failedLogins = account.failedLogins + 1;
  return failedLogins >= MAX_FAILURES
    ? { ...account, failedLogins: 0, lockedUntil: now + LOCK_MS }
    : { ...account, failedLogins };
}

export function afterSuccessfulLogin(account: Account): Account {
  return { ...account, failedLogins: 0, lockedUntil: undefined };
}

export function newAccount(username: string, passwordHash: string): Account {
  return { username, passwordHash, passkeys: [], sessionVersion: 1, failedLogins: 0 };
}

export function usernameProblem(username: string): string | null {
  return /^[a-z0-9._-]{3,40}$/i.test(username) ? null : 'use 3 to 40 letters, digits, dots, dashes or underscores';
}

export function sameUsername(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
