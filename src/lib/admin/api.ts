import { NextResponse } from 'next/server';
import type { Account } from './account';
import { type ApiContext, type ApiOutput, out } from './api-types';
import { clientKey, isSameOriginJson, rateLimited } from './request';
import { type AdminRuntime, adminRuntime } from './runtime';
import { cookieOptions, sessionAccount, sessionCookieName } from './session';

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function respond(runtime: AdminRuntime, result: ApiOutput) {
  const res = NextResponse.json(result.body ?? { ok: true }, { status: result.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  for (const c of result.setCookies ?? []) res.cookies.set(c.name, c.value, cookieOptions(runtime.config, c.maxAge));
  for (const name of result.clearCookies ?? []) res.cookies.set(name, '', cookieOptions(runtime.config, 0));
  return res;
}

// Every admin API route goes through here: 404 when admin is off, same-origin JSON for anything
// that changes state, a rate limit on routes that need no session, and the session check.
export async function adminApi(
  request: Request,
  opts: { auth: boolean; limit?: number },
  handler: (ctx: ApiContext) => Promise<ApiOutput>,
): Promise<Response> {
  const runtime = adminRuntime();
  if (!runtime) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const fail = (status: number, error: string) => respond(runtime, out(status, { error }));
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';

  if (mutating && !isSameOriginJson(request, runtime.config)) return fail(403, 'cross-site request refused');

  if (!opts.auth && rateLimited(`${new URL(request.url).pathname}:${clientKey(request)}`, opts.limit ?? 20, 60_000)) {
    return fail(429, 'too many attempts, wait a minute');
  }

  let account: Account | null = null;
  if (opts.auth) {
    account = await sessionAccount(runtime.config, runtime.store, readCookie(request, sessionCookieName(runtime.config)));
    if (!account) return fail(401, 'sign in required');
  }

  let body: Record<string, unknown> = {};
  if (mutating) {
    try {
      const parsed = await request.json();
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return fail(400, 'request body must be a JSON object');
    }
  }

  try {
    return respond(
      runtime,
      await handler({ request, runtime, account: account as Account, body, cookie: (n) => readCookie(request, n) }),
    );
  } catch (err) {
    console.error('admin api error', request.method, new URL(request.url).pathname, err);
    return fail(500, 'something went wrong on the server');
  }
}

