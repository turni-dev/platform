# Durable guest-session runtime slice

## Goal

Make a signed guest-session token usable only while its tenant-scoped,
hash-only record is active in `guest_sessions`.

## Design

- The application service issues the existing signed token, stores only its
  SHA-256 hash with UUIDv7 session metadata, and returns the token.
- Resume first verifies the token signature, then reads the record through a
  tenant-bound port and returns context derived from that record.
- The Postgres adapter uses `withTenant` and parameterized SQL for every
  operation. Expired and revoked records are not readable as active sessions.
- HTTP requires the durable service when guest sessions are enabled. WebSocket
  processing awaits it and serializes frames per socket.

## Acceptance criteria

- A missing, expired, revoked or routing-mismatched record cannot resume.
- No raw token is stored or logged.
- Guest context comes from the persisted record, not a raw widget-key lookup.
- The focused backend tests, typecheck and lint pass before commit.
