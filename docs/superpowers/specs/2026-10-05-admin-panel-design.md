# Admin panel design

Date: 2026-10-05. Status: built straight from brainstorming under the `/goal just make it work` directive. Sections 2-4 were not reviewed by Mike before implementation; the decisions he did make are marked **(Mike)**.

## Goal

A private admin area on the site where Mike signs in with a passkey **or** a username and password **(Mike)** and adds, edits and deletes entries in `content/` (books, travel, languages, sport, hobbies, career) **(Mike)**. Changes are saved to git, and a **Publish** button starts the existing manual deploy **(Mike: publishing after a short delay)**.

## Non-goals

Multiple users, roles, instant publishing, editing `profile.md`, image uploads.

## Architecture

- Public pages stay static. Admin pages and `/api/admin/*` are dynamic routes in the same app.
- **Fails closed:** with no `ADMIN_SESSION_SECRET` (>= 32 chars) every admin route returns 404. In production the account store must be Azure Table Storage; the file store and local content writer exist for `npm run dev` only and refuse to run when `NODE_ENV=production`.
- `src/proxy.ts` redirects unauthenticated requests for `/admin/*` to the login page. Every page and API route re-checks the session itself, so the proxy is not the only gate.

## Authentication

- One account record in Azure Table Storage **(Mike)**: username, scrypt password hash, passkeys, session version, failed-attempt counter and lock time.
- **First setup:** `/admin/setup` creates the account only while none exists and only with the `ADMIN_SETUP_TOKEN` secret.
- **Password login:** constant-time compare (a dummy hash for a wrong username), 5 failures lock password login for 15 minutes. Passkey login is never locked, so a lock-out attack cannot lock Mike out.
- **Passkeys:** discoverable credentials with user verification required, via `@simplewebauthn`. The relying party is the hostname of `ADMIN_ORIGIN`; a passkey registered on `mike.euhub.co` does not work on the Azure URL. Registering a passkey needs a signed-in session. Challenges live in a 5-minute signed cookie that is cleared on use.
- **Session:** HMAC-signed cookie (HttpOnly, Secure, SameSite=Strict, 12 hours) carrying the account's session version. Changing the password or signing out everywhere bumps the version.
- **CSRF:** every state-changing API checks the `Origin` header against `ADMIN_ORIGIN` and requires a JSON body.

## Content editing

- Each collection has a field spec (scalars as inputs, nested lists such as `cities`, `records` and `events` as YAML text, Markdown notes as the body). The server rebuilds the file with `gray-matter` and validates it with the same zod schema the build uses, so the panel cannot save a file that would break the build.
- Slugs follow the existing rule. Creating an entry that already exists is rejected.
- Storage is the GitHub repo through the Contents API, with direct commits to `main` **(Mike: saved to git)**. Each save is one commit. Deleting asks for confirmation.
- **Publish** dispatches `deploy.yml` with the `site_indexable` value the running image was built with, so publishing from the panel never changes crawler visibility. The panel shows the latest run's status.

## Infrastructure

- `infra/main.bicep` adds a Storage account with a table, and passes the table connection string, the session secret, the setup token and the GitHub token to the app as Container App secrets. Bicep replaces the whole app config on every deploy, so these must come from `@secure()` parameters that the workflow fills from GitHub environment secrets. Missing secrets leave admin disabled, not broken.
- The pipeline's Contributor role cannot create role assignments, so the table is reached with a connection string from `listKeys`, not a managed identity.

## Testing

Unit tests cover password hashing, session and challenge signing, lock-out rules, the field specs (form to file to form), the repo clients with a mocked `fetch`, and the Origin check. The sign-in routes are exercised against a running dev server with the file store.
