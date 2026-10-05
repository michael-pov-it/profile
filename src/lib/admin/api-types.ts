import type { Account } from './account';
import type { AdminRuntime } from './runtime';

export interface ApiContext {
  request: Request;
  runtime: AdminRuntime;
  /** Set on routes that require a session. */
  account: Account;
  body: Record<string, unknown>;
  cookie: (name: string) => string | undefined;
}

export interface ApiOutput {
  status?: number;
  body?: unknown;
  setCookies?: { name: string; value: string; maxAge: number }[];
  clearCookies?: string[];
}

export const out = (status: number, body: unknown): ApiOutput => ({ status, body });
