# Owner Auth Vertical Slice Design

**Status:** approved by founder on 2026-08-09

## Goal

Give a new owner a browser-visible, production-shaped path from email registration to an authenticated Turni dashboard. The same flow signs an existing owner in.

## User flow

1. The owner opens `/register`, enters an email, and requests a code.
2. The backend normalizes the email, applies IP/email rate limits, creates a hashed OTP challenge, and sends the code through the configured SMTP adapter.
3. The owner enters the code on `/verify`.
4. A valid code for a new email atomically creates a UUIDv7 tenant, an owner user, a trusted-device record, and a session. A valid code for an existing owner creates a fresh session.
5. The browser receives a short-lived access JWT and a rotated refresh credential in secure HttpOnly cookies, then reaches `/dashboard`.
6. The dashboard resolves the authenticated tenant and renders its name, owner identity, and logout action.

## Auth model

- **Access JWT:** short-lived, signed, and carries only `sub`, `tenantId`, `role`, and `sid`. It is validated on every protected API request.
- **Refresh session:** an opaque random credential in an HttpOnly, Secure, SameSite cookie. Postgres stores only its hash, tenant-scoped with RLS. Rotation revokes the predecessor before issuing a successor.
- **Redis:** OTP TTL, resend cooldown, rate limits, and non-authoritative device-risk cache. It is never the sole source of truth for a session or tenant membership.
- **Device:** a random trusted-device cookie is stored server-side as a hash. A normalized client fingerprint is a risk signal only; it cannot authenticate or bypass email verification by itself.
- **OTP:** code is hashed before storage, expires after five minutes, permits five verification attempts, and is single-use. Responses never reveal whether an email already exists.

## Boundaries and persistence

Auth DTOs live in `packages/contracts` as Zod schemas. Turni owns the application services, Postgres repositories, Redis adapters, SMTP adapter, and HTTP handlers; no vendor DTO crosses a port. Existing tenancy tables provide users, sessions, and auth-code records. The implementation adds only founder-reviewed expand/contract migrations needed for device/session metadata and registration-safe uniqueness.

Bootstrap registration is the sole operation that starts without a tenant context. It runs in a narrowly scoped transaction that creates the tenant before creating RLS-protected user and session rows; every later read or mutation uses `withTenant`.

## Reference-code adoption

The implementation starts by copying the reference project's `domain/auth` and `domain/user` directories into a temporary adaptation branch, preserving their tests as behavioral evidence. The adaptation then removes unsupported files rather than retaining dead compatibility layers. It replaces Prisma repositories with Turni Postgres/RLS repositories, class-validator DTOs with `packages/contracts` Zod schemas, global Nest wiring with bounded-context composition, and Redis-only persistence with the ownership model above.

We retain and adapt the tested OTP, resend, refresh, token, notification, and device-service flow. We do not retain the reference's unsafe refresh-as-access guard, plaintext refresh persistence, or fingerprint-only auto-login. The final repository contains only Turni modules and tests; the copied source path itself is not committed.

## HTTP and browser shape

Public endpoints are `POST /auth/register/request`, `POST /auth/register/verify`, `POST /auth/login/request`, `POST /auth/login/verify`, `POST /auth/refresh`, and `POST /auth/logout`. Protected identity lookup is `GET /auth/me`. Auth cookies use a narrow path, HTTPS-only production settings, and Origin/CSRF checks for cookie-authenticated mutations.

`apps/web` provides `/register`, `/verify`, `/login`, and `/dashboard`. It uses only contract DTOs, displays generic OTP errors, never stores credentials in localStorage, and redirects unauthenticated requests to `/login`.

## Failure behavior

- SMTP failure leaves no usable session and returns a generic retryable error.
- Invalid, expired, consumed, or rate-limited OTP requests return a generic denial without account enumeration.
- Redis loss fails closed for rate-limit/device-risk operations; durable Postgres session validation remains available only where its risk controls are still enforced.
- A rotated, revoked, expired, cross-tenant, or malformed credential is rejected and clears browser auth cookies.

## Verification

Focused tests cover OTP hashing/expiry/attempts, registration atomicity, session rotation, fingerprint non-bypass, cross-tenant denial, SMTP failure, and logout. HTTP tests validate cookies and Zod failures. Browser e2e covers registration through dashboard using a fake SMTP inbox; a manual local smoke sends a real code through the configured SMTP environment. New tests live in sibling `__tests__/` directories.

## Explicit exclusions

No manager-created-user-only model, password login, password reset, arbitrary JWT bearer acceptance, fingerprint-only auto-login, or direct copying of Prisma/Redis-only persistence from the reference project. Device management UI and multi-factor authentication follow after this first vertical slice.
