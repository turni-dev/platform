# ADR 0006: Owner Authentication and Session Transport

## Status

Accepted

## Context

The owner enters Turni from a browser: email, a one-time code from a real
mailbox, then the tenant cabinet. The approved design
(`docs/superpowers/specs/2026-08-09-owner-auth-vertical-design.md`) requires
that a response never reveals whether an email is registered, that no
credential is readable by scripts, and that a stolen refresh credential stops
working the moment it is replayed.

Two constraints shaped the implementation. First, `users` sits behind FORCE RLS
with a NOBYPASSRLS role, so login cannot resolve a tenant from an email before a
tenant context exists. Second, the web app and the backend are separate
processes, and cookies only work as designed when the browser sees one origin.

## Decision

Registration and login share one handler pair (`/api/v1/auth/{register,login}/
{request,verify}`); the register and login routes are aliases, so a stranger
cannot tell the two apart from a response.

Email to tenant resolution goes through `owner_directory` (migration
`0016_owner_directory`): `email citext` primary key mapping to `tenant_id` and
`user_id`, no RLS, granted to `app_rw`, written inside the same transaction that
creates the tenant and its owner. A `SECURITY DEFINER` lookup was rejected: it
would be an RLS bypass in everything but name. `auth_codes` and
`owner_directory` are the only pre-tenant tables; every other read and write
enters a tenant context first.

The session leaves the backend as two HttpOnly cookies: a short-lived HS256
access token scoped to `/api/v1`, and an opaque refresh credential scoped to
`/api/v1/auth`, both `SameSite=Strict` and `Secure` outside local development.
Postgres stores only the hash of the refresh credential; rotation replaces the
stored hash in the same statement that reads it, so a replayed predecessor
matches nothing. Cookie-authenticated mutations (`/refresh`, `/logout`) require
a trusted `Origin`, failing closed when none is present.

The browser never talks to the backend origin: Next.js rewrites `/api/v1/*` onto
`BACKEND_ORIGIN`, which keeps the cookies same-origin with the pages. The web
app builds with webpack, because Turbopack cannot resolve the NodeNext `.js`
specifiers inside `@turni/contracts`, which is consumed as TypeScript source.

The backend refuses to start without `OWNER_AUTH_SECRET`, the SMTP settings and
`APP_ORIGIN`, so the auth path can never be half-configured.

## Consequences

Deployment must serve the web app and the API under one origin, and
`BACKEND_ORIGIN` must point at the backend from inside the network. A second
front-end origin would need its own `APP_ORIGIN` entry and a review of the
`SameSite=Strict` choice.

`owner_directory` is a second place an owner email lives. Renaming or deleting
an owner has to update it in the same transaction as `users`, or the login path
will point at a row that no longer exists.

The resend cooldown and rate limits currently run on a process-local cache, so
they hold per instance. Scaling the backend out requires a shared cache before
the limits mean anything globally.

Device metadata and trusted-device risk signals are deferred; adding them is a
migration and needs founder review.
