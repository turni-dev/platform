# Owner auth vertical — slice plan

**Spec:** `docs/superpowers/specs/2026-08-09-owner-auth-vertical-design.md`
(approved by founder on 2026-08-09).

**Goal:** deliver the browser path `email → OTP → session → dashboard` as
independently reviewable slices, each with its own tests and commit.

## Global constraints

- Strict TS, no `any`, no floating promises; every boundary validated with Zod.
- Auth DTOs live only in `packages/contracts`; no vendor type crosses a port.
- Postgres is the source of truth; Redis holds TTL/rate/risk data only.
- OTP codes, refresh credentials and device secrets are stored hashed; email,
  codes and secrets are never logged.
- Responses never reveal whether an email is already registered.
- Migrations and destructive contract changes need founder review; slices that
  need one stop and ask instead of writing SQL.
- New tests live in sibling `__tests__/` directories.

## Slices

### Slice 1 — OTP challenge domain (this branch)

- `packages/contracts/src/ports/owner-auth.ts`: `OwnerAuthRequestSchema`,
  `OwnerAuthVerifySchema`, `OwnerAuthChallengeSchema`, `OwnerIdentitySchema`,
  `OwnerAuthDenialReason`.
- `apps/backend/src/modules/tenancy/domain/owner-auth-challenge.ts`: email
  normalization, code generation, HMAC hashing, and a pure decision function
  over a stored challenge record (expired / consumed / attempts exhausted /
  mismatch → generic denial; single success consumes the challenge).
- Acceptance: hashing never returns the raw code; a wrong code increases
  attempts; the sixth attempt is denied without comparison; an expired or
  consumed challenge is denied; a success is single-use; every denial exposes
  the same generic outcome shape.

### Slice 2 — Challenge persistence and throttling

- Postgres adapter over the existing `auth_codes` table (insert, load latest
  active by normalized email, atomic attempt increment, atomic consume).
- Redis adapter for resend cooldown and per-email/per-IP rate limits, failing
  closed when Redis is unavailable.
- Acceptance: concurrent verification cannot consume one challenge twice; no
  raw code reaches storage or logs.

### Slice 3 — Registration and session issuance

- Application service: valid code for an unknown email creates tenant, owner
  user and session in one narrowly scoped transaction, then switches to
  `withTenant`; a known email gets a fresh session only.
- Access JWT (`sub`, `tenantId`, `role`, `sid`) plus opaque refresh credential
  stored as a hash in `sessions`, with rotation revoking the predecessor.
- Acceptance: registration is atomic, rotation invalidates the predecessor,
  cross-tenant and revoked credentials are rejected.
- Founder decision 2026-08-14: `users` is under FORCE RLS with a NOBYPASSRLS
  role, so login cannot resolve a tenant from an email. Migration
  `0016_owner_directory` adds the only pre-tenant mapping
  (`email citext PK → tenant_id, user_id`, no RLS, granted to `app_rw`),
  written inside the bootstrap transaction. A SECURITY DEFINER lookup was
  rejected as an RLS bypass. Device metadata columns stay deferred.

### Slice 4 — HTTP surface (done 2026-08-14)

- `POST /auth/register/request|verify`, `/auth/login/request|verify`,
  `/auth/refresh`, `/auth/logout`, `GET /auth/me`.
- HttpOnly/Secure/SameSite cookies on a narrow path, Origin check on
  cookie-authenticated mutations, RFC7807 generic errors.
- Delivered as `c06b25c` (cookie and origin primitives), `fdce724` (tenant
  scoped owner profile read for `/auth/me`), `9496fc4` (routes and in-memory
  e2e fixture), `227463b` (SMTP notifier over a `MailTransportPort`),
  `b0e7f98` (env schema plus boot composition).
- Routes are mounted under `/api/v1/auth/...` to match the existing API
  surface; the refresh cookie is scoped to `/api/v1/auth` so it never travels
  with ordinary requests. Register and login are aliases of one handler pair.
- The decisions are recorded in `docs/adr/0006-owner-auth-session-transport.md`.

### Slice 5 — `apps/web` pages and e2e (screens done 2026-08-14)

- `/register`, `/verify`, `/login`, `/dashboard` using contract DTOs only,
  generic OTP errors, no credentials in `localStorage`.
- Delivered as `7e6d81a` (contract-validated browser client) and `c539d49`
  (screens, `/api/v1` rewrite, webpack build).
- `apps/web` builds with webpack rather than Turbopack: Turbopack cannot
  resolve the NodeNext `.js` specifiers inside `@turni/contracts`.
- Browser run done 2026-08-15 against Postgres, the `mailpit` dev inbox
  (`docker compose --profile mail up -d mailpit`) and both servers: register →
  code from the inbox → cabinet, login as the same owner without a second
  tenant, refresh, and sign-out that closes the cabinet. It found four defects
  the fakes had hidden — a `Date` parameter the driver refuses, timestamp
  columns read back as text, an access cookie the server-rendered cabinet
  could not see, and a sign-out that reported success after a refusal. All are
  fixed under test (`2957a20`, `b076faf`).
- Remaining: a manual real-SMTP smoke against the founder's mailbox.

## Verification per slice

`npm run nx -- run-many -t test,typecheck,lint --projects=<affected>` before
each commit; the full affected workflow and eval when the card closes.
