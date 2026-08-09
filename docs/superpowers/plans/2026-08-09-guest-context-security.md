# Guest context security slice

## Approved decision

The founder approved a signed widget routing key. The key carries `tenantId`,
`agentId`, `connectionId`, expiry and key id, and is HMAC authenticated before
any tenant-scoped work starts. This avoids an unscoped database lookup under
FORCE RLS.

## Goal

Replace the previous arbitrary public widget key with a verifiable routing
boundary and make the resulting tenant/agent/connection context available only
after guest-session verification.

## Scope

1. Validate and sign routing claims with an expiring HMAC envelope.
2. Require that envelope when issuing a guest session and cap the session TTL.
3. Persist only a token hash and tenant-bound session lifecycle metadata in an
   RLS-protected `guest_sessions` table.
4. Pass verified context to the WebSocket message handler; reject missing or
   invalid sessions before a handler is invoked.
5. Update HTTP and end-to-end fixtures to use real signed routing keys and map
   malformed routing input to a controlled client error.

## Security constraints

- No raw token or message body is logged or stored in this slice.
- All tenant data remains behind FORCE RLS and tenant-scoped repository APIs.
- HMAC checks are constant-time; routing and session signing secrets must be
  separately injected by production composition before release.
- Tests belong in sibling `__tests__` directories; generated source artifacts
  are prohibited.

## Acceptance criteria

- A raw `widget_public_demo` key cannot create a session or invoke a handler.
- A valid signed key can create, resume and use a session with trusted context.
- Cross-tenant persistence is impossible through the repository interface.
- Backend tests, lint, typecheck, eval and migration bootstrap checks pass.
