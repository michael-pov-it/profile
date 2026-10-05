import { type AdminConfig, adminConfig } from './config';
import { type ContentBackend, backendFromEnv } from './repo';
import { type AdminStore, storeFromEnv } from './store';

export interface AdminRuntime {
  config: AdminConfig;
  store: AdminStore;
  /** null when content editing is not configured; sign-in and security pages still work. */
  backend: ContentBackend | null;
  siteIndexable: boolean;
}

let cached: AdminRuntime | null | undefined;

// null means admin is switched off (missing secret, or no table store in production).
export function adminRuntime(): AdminRuntime | null {
  if (cached !== undefined) return cached;
  const config = adminConfig();
  const store = config ? storeFromEnv() : null;
  cached =
    config && store
      ? { config, store, backend: backendFromEnv(), siteIndexable: process.env.SITE_INDEXABLE === 'true' }
      : null;
  return cached;
}

export function setAdminRuntimeForTests(runtime: AdminRuntime | null | undefined) {
  cached = runtime;
}
