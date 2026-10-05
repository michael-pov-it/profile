import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed, expiring, stateless tokens for the session cookie and the one-time passkey challenge.
// The `kind` is part of the signed body, so a challenge token can never pass as a session.
export type TokenKind = 'session' | 'challenge';

type Body = Record<string, string | number>;

function mac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signToken(kind: TokenKind, payload: Body, secret: string, ttlSeconds: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, k: kind, exp: Math.floor(now / 1000) + ttlSeconds })).toString(
    'base64url',
  );
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

export function verifyToken(kind: TokenKind, token: string | undefined, secret: string, now = Date.now()): Body | null {
  if (!token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;

  const expected = mac(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsed: Body;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (parsed.k !== kind || typeof parsed.exp !== 'number' || parsed.exp * 1000 <= now) return null;
  return parsed;
}
