// Admin runtime configuration, read from the environment. Returns null (admin disabled, every
// admin route 404s) unless the session secret is set, so a deploy without secrets is harmless.
export interface AdminConfig {
  sessionSecret: string;
  setupToken?: string;
  origin: string;
  rpID: string;
  rpName: string;
  production: boolean;
}

const MIN_SECRET_LENGTH = 32;

export function adminConfig(env: Record<string, string | undefined> = process.env): AdminConfig | null {
  const sessionSecret = env.ADMIN_SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < MIN_SECRET_LENGTH) return null;

  const production = env.NODE_ENV === 'production';
  // Passkeys are bound to this origin, so production has no default: it must be configured.
  const origin = env.ADMIN_ORIGIN ?? (production ? undefined : 'http://localhost:3000');
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (production && url.protocol !== 'https:') return null;

  return {
    sessionSecret,
    setupToken: env.ADMIN_SETUP_TOKEN || undefined,
    origin: url.origin,
    rpID: url.hostname,
    rpName: 'mike-g admin',
    production,
  };
}
