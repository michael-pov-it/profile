import type { AdminConfig } from './config';

// Browsers always send Origin on cross-site and on same-site POST/PUT/DELETE fetches. Anything
// state-changing must come from our own origin, as JSON (a plain HTML form cannot send JSON).
export function isSameOriginJson(request: Request, config: AdminConfig): boolean {
  if (request.headers.get('origin') !== config.origin) return false;
  return (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

// In-memory and per replica, so it only slows down guessing; the account lock-out and the
// strength of the secrets do the real work.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return recent.length > max;
}

export function resetRateLimits() {
  hits.clear();
}
