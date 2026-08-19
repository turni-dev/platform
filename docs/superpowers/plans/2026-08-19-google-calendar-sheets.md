# Google Calendar + Sheets connections — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 3 is a hard stop — do not write a migration or a contracts change past it without recorded founder sign-off.**

**Card:** `Доска MVP-1` → С2a [M1 Core] Google Calendar + Sheets connections.

**Mini-spec (board):** цель — владелец подключает Calendar и Sheets к своему
агенту. Вход — OAuth callback и выбранные resources. Выход — encrypted
tenant-scoped connection, bounded typed tools and Fake adapters. Критерии —
least OAuth scopes, refresh rotation, RLS, Zod vendor boundary, secrets never
returned to UI. Ловушки — contracts/migrations только после founder review;
не использовать Google как источник авторизации.

**Goal:** an owner clicks "Connect Google", grants Calendar and Sheets access
through Google's consent screen, picks which calendar and which spreadsheet
the agent may use, and from then on the agent's tool layer can read/write a
bounded set of Calendar and Sheets operations against a refresh token that is
encrypted at rest and never leaves the backend.

**Architecture:** Google payloads and the token dance live only in
`platform/integrations/google`, mirroring how VK payloads live only in
`platform/integrations/vk` — no Google types cross that boundary. A new
module, `modules/integrations/google`, owns the connection lifecycle (OAuth
state, resource selection, encrypted storage, activation) the same way
`modules/channels` owns a VK connection, but this is not a messenger: there is
no `MessengerPort`, no inbound webhook, no conversation. What crosses the
boundary into `modules/agent-core`'s tool layer is two small, bounded ports —
`GoogleCalendarToolPort` and `GoogleSheetsToolPort` — never a raw Google
client and never the refresh token. Google is a data connection only; the
owner's session and `OwnerRequestGuard` remain the sole source of platform
identity, so the OAuth callback never issues a cookie, a session or a user
record — it only completes a connection that already belongs to an
authenticated owner's tenant.

**Tech Stack:** TypeScript (strict), Fastify via NestJS, Drizzle over
`postgres`, Zod at every boundary, Vitest.

**Spec:** no design doc exists yet for this card; this plan is written
directly from the kanban card and mini-spec above, plus
`docs/adr/0007-tenant-secret-encryption.md`, which already names this card as
a consumer of the shared `SecretCipher`/`KEY_CREDENTIALS_V1` primitive built
for VK. Read that ADR and `docs/superpowers/plans/2026-08-16-vk-channel.md`
before starting Task 1 — this plan reuses their encryption, routing-key and
cabinet-route patterns rather than inventing new ones.

## Global Constraints

- No `any`, no floating promises; `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on.
- Tests go in a sibling `__tests__/` directory. Never colocate `*.spec.*` with
  production code.
- Every HTTP, queue, env and vendor boundary is validated with Zod;
  `packages/contracts` is the only shared type source.
- Tenant data is reached only through `withTenant`; no query runs outside it.
- The OAuth refresh token — and any other Google secret (client secret,
  access token, id token) — never reaches a log, an event, an error message
  or the UI. Same discipline as the VK community key: encrypt with
  `SecretCipher('credentials', readSecretKeyRing('credentials'))` from
  `apps/backend/src/platform/crypto`, reusing the existing primitive rather
  than inventing a new one. Domain events carry ids and scopes only.
- **Least-privilege OAuth scopes only.** Request exactly
  `https://www.googleapis.com/auth/calendar.events` (Calendar read/write of
  events, not calendar administration) and
  `https://www.googleapis.com/auth/spreadsheets` (Sheets read/write). No
  broader Calendar, Drive or Sheets scope, and no `openid`/`email`/`profile`
  scope — this flow must never resemble a login.
- **Google is not a source of authentication.** The OAuth callback route runs
  behind the existing owner session (`OwnerRequestGuard`); it starts and ends
  inside a request already authenticated by the platform's own cookie. It
  never creates a user, a session or a cookie, and Google's `id_token` (if
  Google sends one) is discarded unread.
- Fake adapters are required alongside every real Google API adapter, per the
  existing testing pattern (`platform/integrations/vk` has no Fakes because
  its tests stub `fetch` directly; this card instead needs `Fake` classes
  because `modules/agent-core`'s tool tests must run against Calendar/Sheets
  ports without a network dependency — follow the shape of
  `apps/backend/src/platform/fakes/core-fakes.spec.ts`'s fakes).
- Commands: `npm run nx -- run backend:test`, `backend:typecheck`,
  `backend:lint`, and the same for `contracts`.
- Migration files are named `NNNN_name.sql`, or `NNNN_name.concurrent.sql`
  when they must run outside a transaction.
- **Contracts and database migrations for this feature must not be written
  or applied without explicit founder review and sign-off.** Task 3 below is
  the single point where a migration and a contracts change would be needed;
  it stops before writing either and waits for approval, matching how the
  card is flagged on the product board (see Task 3 for the exact procedure).

---

### Task 1: Google OAuth client and API clients

**Files:**
- Create: `apps/backend/src/platform/integrations/google/google-oauth-client.ts`
- Create: `apps/backend/src/platform/integrations/google/google-calendar-client.ts`
- Create: `apps/backend/src/platform/integrations/google/google-sheets-client.ts`
- Create: `apps/backend/src/platform/integrations/google/index.ts`
- Test: `apps/backend/src/platform/integrations/google/__tests__/google-oauth-client.spec.ts`
- Test: `apps/backend/src/platform/integrations/google/__tests__/google-calendar-client.spec.ts`
- Test: `apps/backend/src/platform/integrations/google/__tests__/google-sheets-client.spec.ts`

**Interfaces:**
- Produces:
  - `const GOOGLE_OAUTH_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/spreadsheets'] as const`
  - `class GoogleOauthClient { authorizationUrl(input: { state: string; redirectUri: string }): string; exchangeCode(input: { code: string; redirectUri: string }): Promise<{ refreshToken: string; accessToken: string; expiresAt: Date; scopes: readonly string[] }>; refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> }`
  - `class GoogleApiError extends Error { readonly status: number }`
  - `class GoogleCalendarClient { listEvents(input): Promise<...>; createEvent(input): Promise<...> }` (constructed with an access token, never a refresh token)
  - `class GoogleSheetsClient { readRange(input): Promise<...>; appendRow(input): Promise<...> }`

This mirrors `vk-api-client.ts`: the secret (here, the OAuth client secret and
every token) travels only in a request body or an `Authorization` header,
never a URL, and every client has a `toJSON(): '[GoogleOauthClient]'` so a
serialized error cannot leak it.

- [ ] **Step 1: Write the failing OAuth client test**

`__tests__/google-oauth-client.spec.ts` — pin three behaviours:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleOauthClient, GOOGLE_OAUTH_SCOPES } from '../google-oauth-client.js';

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;
}

describe('GoogleOauthClient', () => {
  it('builds a consent URL carrying exactly the two scopes and offline access', () => {
    const client = new GoogleOauthClient({ clientId: 'id', clientSecret: 'shh' });

    const url = new URL(
      client.authorizationUrl({ state: 'state-token', redirectUri: 'https://app.example/cb' })
    );

    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.toString()).not.toContain('shh');
  });

  it('exchanges a code for a refresh token without putting the client secret in a URL', async () => {
    const fetchMock = respond({
      refresh_token: 'r-token', access_token: 'a-token', expires_in: 3600,
      scope: GOOGLE_OAUTH_SCOPES.join(' '), token_type: 'Bearer'
    });
    const client = new GoogleOauthClient({ clientId: 'id', clientSecret: 'shh', fetch: fetchMock });

    const result = await client.exchangeCode({ code: 'auth-code', redirectUri: 'https://app.example/cb' });

    expect(result.refreshToken).toBe('r-token');
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(String(url)).not.toContain('shh');
    expect(String(init.body)).toContain('client_secret=shh');
  });

  it('turns a token error into GoogleApiError without leaking the client secret', async () => {
    const client = new GoogleOauthClient({
      clientId: 'id', clientSecret: 'shh',
      fetch: respond({ error: 'invalid_grant', error_description: 'Bad code' }, 400)
    });

    const failure = await client
      .exchangeCode({ code: 'bad', redirectUri: 'https://app.example/cb' })
      .catch((error: unknown) => error);

    expect(JSON.stringify(failure)).not.toContain('shh');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run nx -- run backend:test -- google-oauth-client`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `google-oauth-client.ts`**

Model the shape on `vk-api-client.ts`: a small `FetchLike`-typed constructor,
a Zod envelope schema for `https://oauth2.googleapis.com/token` responses, a
`GoogleApiError` carrying only `status` and Google's `error` code (never the
description verbatim if it might echo user input — it is a fixed enum from
Google, so it is safe here). `authorizationUrl` builds against
`https://accounts.google.com/o/oauth2/v2/auth` with
`access_type=offline&prompt=consent&include_granted_scopes=false`, exactly
`GOOGLE_OAUTH_SCOPES.join(' ')`, and the given `state`/`redirectUri`.

- [ ] **Step 4: Run the OAuth client test**

Run: `npm run nx -- run backend:test -- google-oauth-client`
Expected: PASS.

- [ ] **Step 5: Write the failing Calendar and Sheets client tests**

Same shape as `vk-api-client.spec.ts`'s pattern applied twice — one file per
client. Pin: the access token travels in an `Authorization: Bearer` header,
never a query string; `listEvents`/`createEvent` hit
`https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`;
`readRange`/`appendRow` hit
`https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}`;
a 401 from Google becomes a typed `GoogleApiError` with `status: 401` so the
caller (Task 2's port) can decide to refresh and retry exactly once.

- [ ] **Step 6: Run both, watch them fail**

Run: `npm run nx -- run backend:test -- google-calendar-client google-sheets-client`
Expected: FAIL, modules not found.

- [ ] **Step 7: Write `google-calendar-client.ts` and `google-sheets-client.ts`**

Both classes are constructed with `{ accessToken: string; fetch?: FetchLike }`
only — they never see a refresh token or a client secret, which keeps the
blast radius of a leaked access token to one hour and this file to a single
job: talk to one Google API, typed in and typed out with Zod.

- [ ] **Step 8: Run both clients, then export**

Run: `npm run nx -- run backend:test -- google-calendar-client google-sheets-client`
Expected: PASS.

`index.ts`:

```ts
export { GoogleOauthClient, GoogleApiError, GOOGLE_OAUTH_SCOPES, type FetchLike } from './google-oauth-client.js';
export { GoogleCalendarClient } from './google-calendar-client.js';
export { GoogleSheetsClient } from './google-sheets-client.js';
```

- [ ] **Step 9: Typecheck, lint, commit**

```bash
npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/platform/integrations/google
git commit -m "feat(google): add the OAuth, Calendar and Sheets API clients"
```

---

### Task 2: Bounded typed tool ports and Fake adapters

**Files:**
- Create: `apps/backend/src/modules/integrations/google/application/google-tool-ports.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-calendar-tool.adapter.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-sheets-tool.adapter.ts`
- Create: `apps/backend/src/modules/integrations/google/application/fakes/fake-google-calendar-tool.ts`
- Create: `apps/backend/src/modules/integrations/google/application/fakes/fake-google-sheets-tool.ts`
- Test: `apps/backend/src/modules/integrations/google/application/__tests__/google-calendar-tool.adapter.spec.ts`
- Test: `apps/backend/src/modules/integrations/google/application/__tests__/google-sheets-tool.adapter.spec.ts`
- Test: `apps/backend/src/modules/integrations/google/application/__tests__/fake-google-tools.spec.ts`

**Interfaces:**
- Produces (local to this module until Task 3 decides, with founder
  sign-off, whether either belongs in `packages/contracts`):
  - `interface GoogleCalendarToolPort { listUpcomingEvents(input: { calendarId: string; maxResults: number }): Promise<readonly CalendarEvent[]>; createEvent(input: { calendarId: string; summary: string; startsAt: string; endsAt: string }): Promise<{ eventId: string }> }`
  - `interface GoogleSheetsToolPort { readRange(input: { spreadsheetId: string; range: string }): Promise<readonly (readonly string[])[]>; appendRow(input: { spreadsheetId: string; range: string; values: readonly string[] }): Promise<void> }`
  - `class GoogleCalendarToolAdapter implements GoogleCalendarToolPort` wraps a `GoogleCalendarClient` plus a token supplier (Task 4 gives it one backed by refresh rotation).
  - `class GoogleSheetsToolAdapter implements GoogleSheetsToolPort` — same shape over `GoogleSheetsClient`.
  - `class FakeGoogleCalendarTool implements GoogleCalendarToolPort` and `class FakeGoogleSheetsTool implements GoogleSheetsToolPort`, both recording calls in-memory the way `platform/fakes/core-fakes.spec.ts`'s fakes do, for `modules/agent-core`'s future tool-registration tests to depend on without touching a network.

These two ports are deliberately narrow: no `deleteEvent`, no `updateEvent`,
no arbitrary-range Sheets write beyond an append. The card asks for "bounded"
tools, and a bounded surface is smaller to review and smaller to misuse from
a prompt-injected agent turn. Widening either port later is its own card.

- [ ] **Step 1: Write the failing Calendar tool adapter test**

```ts
import { describe, expect, it } from 'vitest';
import { GoogleCalendarToolAdapter } from '../google-calendar-tool.adapter.js';
import { GoogleCalendarClient } from '../../../../../platform/integrations/google/google-calendar-client.js';

describe('GoogleCalendarToolAdapter', () => {
  it('lists upcoming events through the typed client using the current access token', async () => {
    const fetchMock = /* stub returning one Calendar API event */;
    const client = new GoogleCalendarClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleCalendarToolAdapter(client);

    const events = await adapter.listUpcomingEvents({ calendarId: 'primary', maxResults: 5 });

    expect(events).toEqual([{ id: 'evt-1', summary: 'Показ квартиры', startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T10:30:00Z' }]);
  });

  it('creates an event and returns only its id, never echoing full Google payload shape', async () => {
    /* ... */
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run nx -- run backend:test -- google-calendar-tool`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `google-tool-ports.ts` and `google-calendar-tool.adapter.ts`**

The port file holds only the two interfaces and their DTOs (Zod-validated at
construction, since this is a vendor boundary even though it stays inside
the backend process). The adapter translates Google's event shape into the
port's `CalendarEvent` and nothing else crosses — no Google-specific fields
like `etag` or `iCalUID` leak past this file.

- [ ] **Step 4: Run it**

Run: `npm run nx -- run backend:test -- google-calendar-tool`
Expected: PASS.

- [ ] **Step 5: Repeat Steps 1–4 for `google-sheets-tool.adapter.ts`**

Same shape: `readRange` returns rows of strings only (no formatting, no
formulas — reading a formula result, not its definition, keeps the Zod
boundary simple); `appendRow` validates that `values` is non-empty and every
cell is a plain string before it reaches Google.

- [ ] **Step 6: Write the failing Fake test**

`__tests__/fake-google-tools.spec.ts` pins that both fakes satisfy their
ports without a network and that `FakeGoogleCalendarTool` assigns
deterministic incrementing event ids so a test asserting on
`{ eventId: 'evt-1' }` is stable across runs.

- [ ] **Step 7: Run it, watch it fail, write both fakes**

Run: `npm run nx -- run backend:test -- fake-google-tools`
Expected: FAIL, then PASS after `fakes/fake-google-calendar-tool.ts` and
`fakes/fake-google-sheets-tool.ts` are written.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run nx -- run backend:test -- google && npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/modules/integrations/google
git commit -m "feat(google): add bounded Calendar and Sheets tool ports with Fakes"
```

---

### Task 3 — FOUNDER REVIEW CHECKPOINT: data model and contracts

**Do not write a migration file or edit `packages/contracts` in this task
before founder sign-off is recorded.** This task's job is to produce a
*proposal* — the exact SQL and the exact Zod schema diff — and stop.

This is the point flagged by the card's own trap ("contracts/migrations
только после founder review"), so the executing agent must treat it as a
hard boundary, not a soft note like Task 2 of the VK plan. Concretely:

- [ ] **Step 1: Draft the schema and migration proposal, do not apply it**

Write the proposed table as a draft, not a committed migration file — put it
in the task branch's working notes or the PR description, not under
`migrations/`. Proposed shape, new table (this is not a `channel_connections`
row: there is no messenger, no webhook, no conversation, so reusing that
table and widening its `type` check would be the wrong shape):

```sql
-- PROPOSAL, not applied — pending founder review
CREATE TABLE google_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  scopes text[] NOT NULL,
  refresh_token_enc text,
  google_account_email text,
  calendar_id text,
  spreadsheet_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS policy mirroring channel_connections_tenant_isolation
-- index on (tenant_id) where deleted_at is null
```

State the open questions the founder needs to decide, explicitly, rather than
picking silently: (a) one row per tenant holding both `calendar_id` and
`spreadsheet_id`, versus two rows (one per resource) — this draft assumes one
row because the mini-spec says "connects Calendar and Sheets" as one action,
but a tenant may want Calendar without Sheets later; (b) whether
`google_account_email` (not a secret, but personal data) needs the same
scrutiny as `identity.md` knowledge content; (c) whether the port interfaces
from Task 2 should be promoted into `packages/contracts` now (only needed if
something outside `apps/backend` — e.g. `apps/web`'s cabinet types — needs
them directly) or stay backend-local.

- [ ] **Step 2: Present the proposal and stop**

Summarize the draft SQL, the open questions from Step 1, and the exact
`packages/contracts` diff (if any) that Task 4/5 will need, then pause the
plan here. Do not proceed to Step 3 in the same session unless the founder
has replied with an explicit go-ahead (in the repository's normal review
channel — a PR comment, a commit note, or direct confirmation in the
conversation driving this plan). Record the approval (commit hash, PR
comment link, or a quoted confirmation) in the commit message of Step 3.

- [ ] **Step 3 (after sign-off only): write the approved migration**

Once approved, create the migration file(s) under
`apps/backend/src/modules/integrations/google/infrastructure/database/migrations/`
starting at whatever `NNNN` follows the highest existing migration number
across the repo at that time (check `apps/backend/src/modules/*/infrastructure/database/migrations/` — do not assume `0019` without checking, since other cards may have landed migrations in the meantime), add the matching Drizzle table to a new `schema.ts` in that module, and widen `packages/contracts` only for whatever the founder approved. Follow `0017_vk_channel.sql`'s pattern for any `NOT VALID` + `VALIDATE CONSTRAINT` split if an existing table is touched instead.

- [ ] **Step 4: Write the failing migration test, implement, run, typecheck, lint**

Mirror `apps/backend/src/modules/channels/infrastructure/database/__tests__/migration.spec.ts`'s pattern: read the migration file's text and assert its literal SQL, exactly like the VK plan's Task 2 Step 1.

Run: `npm run nx -- run backend:test -- migration schema` (google)
Expected: FAIL, then PASS.

- [ ] **Step 5: Apply to the live database and hand-verify, then commit**

```bash
npm run db:migrate
```

Confirm by hand: insert and delete one probe `google_connections` row per
tenant to check the RLS policy and the status check constraint, exactly as
the VK plan's Task 2 Step 9 did. Delete the probe rows afterwards.

```bash
git add packages/contracts apps/backend/src/modules/integrations/google/infrastructure/database
git commit -m "feat(google): add the google_connections table (founder-approved <ref>)"
```

---

### Task 4: OAuth consent wizard and encrypted connection

**Depends on Task 3 being merged** — this task writes real rows.

**Files:**
- Create: `apps/backend/src/modules/integrations/google/application/google-oauth-state.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-connection-repository.port.ts`
- Create: `apps/backend/src/modules/integrations/google/infrastructure/database/postgres-google-connection-repository.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-connection-service.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-integration-analytics.ts`
- Test: `apps/backend/src/modules/integrations/google/application/__tests__/google-oauth-state.spec.ts`
- Test: `apps/backend/src/modules/integrations/google/application/__tests__/google-connection-service.spec.ts`

**Interfaces:**
- Consumes: `SecretCipher`, `readSecretKeyRing('credentials')`, `GoogleOauthClient` from Task 1, `OwnerRequestGuard`, `withTenant`, `AgentRepositoryPort`.
- Produces:
  - `class GoogleOauthStateService { issue(claims: { tenantId: string; userId: string }): string; verify(state: string): { tenantId: string; userId: string } }` — same HMAC shape as `WebhookRoutingKeyService`, but single-use and short-lived (5 minutes), because unlike a webhook URL this is not registered anywhere and only needs to survive one redirect round trip.
  - `interface GoogleConnectionRepositoryPort { create(...): Promise<void>; findByTenant(tenantId: string): Promise<GoogleConnectionSummary | undefined>; activate(input: { tenantId: string; connectionId: string; resources: { calendarId: string; spreadsheetId: string } }): Promise<boolean>; updateRefreshToken(input: { tenantId: string; connectionId: string; refreshTokenEncrypted: string }): Promise<void> }`
  - `class GoogleConnectionService { startConsent(input: { tenantId: string; userId: string }): Promise<{ url: string }>; completeConsent(input: { code: string; state: string }): Promise<{ tenantId: string; connectionId: string; googleAccountEmail: string }>; selectResources(input: { tenantId: string; connectionId: string; calendarId: string; spreadsheetId: string }): Promise<GoogleConnectionSummary> }`
  - `GoogleConnectionSummary = { id: string; status: 'pending' | 'active' | 'error' | 'disabled'; googleAccountEmail: string; calendarId?: string; spreadsheetId?: string }`

- [ ] **Step 1: Write the failing state-service test**

Same four cases as `webhook-routing-key.spec.ts`'s pattern (round-trips its
own claims, refuses a forged state, refuses a tampered payload, refuses a
short secret), plus a fifth pinning single-use expiry:

```ts
it('refuses a state older than five minutes', () => {
  const service = new GoogleOauthStateService(secret, () => new Date('2026-08-19T10:06:00Z'));
  const issuedAt = new Date('2026-08-19T10:00:00Z');
  const issuer = new GoogleOauthStateService(secret, () => issuedAt);

  expect(() => service.verify(issuer.issue(claims))).toThrow();
});
```

- [ ] **Step 2: Run it, watch it fail, write the service**

Run: `npm run nx -- run backend:test -- google-oauth-state`
Expected: FAIL, then PASS.

- [ ] **Step 3: Write the connection repository**

Follow `postgres-channel-connection-repository.ts` line for line: Zod row
schemas, `withTenant` around every statement, no query builder, no
`credentials`-style column ever selected by a summary query. `refresh_token_enc`
is nullable at the schema level (Task 3's draft) because a `pending` row
exists before Google's callback returns.

- [ ] **Step 4: Write the failing connection-service test**

`__tests__/google-connection-service.spec.ts`, in-memory repository, fake
`GoogleOauthClient`, `FakeDomainEventBus`:

```ts
it('starts consent with a signed state and the two least-privilege scopes', async () => {
  const { url } = await service.startConsent({ tenantId, userId });

  const parsed = new URL(url);
  expect(parsed.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
  expect(() => stateService.verify(parsed.searchParams.get('state')!)).not.toThrow();
});

it('completes consent, stores the refresh token encrypted, and never logs or emits it', async () => {
  const state = stateService.issue({ tenantId, userId });

  const result = await service.completeConsent({ code: 'auth-code', state });

  const stored = repository.rows[0]!;
  expect(stored.refreshTokenEncrypted).not.toContain('r-token');
  expect(cipher.decrypt(stored.refreshTokenEncrypted!, tenantId)).toBe('r-token');
  expect(JSON.stringify(events.publishedEvents)).not.toContain('r-token');
});

it('refuses a replayed state', async () => {
  const state = stateService.issue({ tenantId, userId });
  await service.completeConsent({ code: 'auth-code', state });

  await expect(service.completeConsent({ code: 'auth-code-2', state })).rejects.toThrow();
});

it('activates the connection once resources are picked, never before', async () => {
  const state = stateService.issue({ tenantId, userId });
  const { connectionId } = await service.completeConsent({ code: 'auth-code', state });
  expect(repository.rows[0]!.status).toBe('pending');

  const summary = await service.selectResources({
    tenantId, connectionId, calendarId: 'primary', spreadsheetId: 'sheet-1'
  });

  expect(summary.status).toBe('active');
});
```

- [ ] **Step 5: Run it, watch it fail, write `google-connection-service.ts`**

Order matters, same discipline as `vk-connection-service.ts`: `startConsent`
issues state and the authorization URL and writes nothing yet.
`completeConsent` exchanges the code, creates the row `pending` with the
encrypted refresh token and the Google account email (read from Google's
token-info response, not trusted as an identity claim — used for display
only), and republishes nothing containing the token. `selectResources`
requires an already-`pending` row and flips it to `active`. A replay of the
same `state` fails because `GoogleOauthStateService.verify` is single-use
(track consumed states in-memory with a short TTL, or make the state itself
carry a nonce checked against the row it eventually creates — pick whichever
reads simpler and record the choice in the commit body).

Run: `npm run nx -- run backend:test -- google-connection-service`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run nx -- run backend:test -- google && npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/modules/integrations/google
git commit -m "feat(google): consent wizard with encrypted refresh-token storage"
```

---

### Task 5: Cabinet HTTP surface and automation preset registration

**Files:**
- Create: `apps/backend/src/entrypoints/http/google-integration-routes.ts`
- Modify: `apps/backend/src/entrypoints/http/app.ts`
- Modify: `apps/backend/src/platform/env.ts` (adds `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`, reuses existing `PUBLIC_WEBHOOK_ORIGIN` for the redirect URI)
- Test: `apps/backend/src/entrypoints/http/__tests__/google-integration-routes.spec.ts`

**Interfaces:**
- Consumes: `GoogleConnectionService` from Task 4, `OwnerRequestGuard`, `problems.ts`.
- Produces routes (all behind `OwnerRequestGuard`, same as `channel-routes.ts`):
  - `GET /api/v1/integrations/google` (`guard.read`) → `GoogleConnectionSummary | { status: 'disconnected' }`, never a token field.
  - `POST /api/v1/integrations/google/consent` (`guard.mutate`) → `{ url }` to redirect the owner's browser to.
  - `GET /api/v1/integrations/google/callback` — this one cannot run behind `guard.mutate`'s Origin check, because Google's redirect is a top-level navigation with no custom header; it instead trusts the signed `state` alone (the same reasoning `vk-webhook-routes.ts` uses for the VK routing key) and redirects the browser back into the cabinet's session-protected UI, which itself immediately calls `POST /api/v1/integrations/google/resources` under the normal guard to pick `calendarId`/`spreadsheetId`.
  - `POST /api/v1/integrations/google/resources` (`guard.mutate`) with a Zod body `{ calendarId: string; spreadsheetId: string }`.

- [ ] **Step 1: Write the failing route test**

Mirror `channel-routes.ts`'s test pattern with `app.inject`: an
unauthenticated `GET /api/v1/integrations/google` is 401; `POST .../consent`
returns a URL containing exactly the two scopes; `GET .../callback` with a
forged state is refused and writes nothing; `POST .../resources` on a
`pending` connection activates it and the response body has no
`refreshTokenEncrypted` key at all (assert the key's absence, not merely that
its value looks safe — `exactOptionalPropertyTypes` should make this the
DTO's shape, not a runtime filter).

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run nx -- run backend:test -- google-integration-routes`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `google-integration-routes.ts`**

Follow `channel-routes.ts` line for line for the guard wiring and the
`attempt`/`problems.ts` refusal pattern. The summary DTO is its own
`strictObject` in this file (or promoted to `packages/contracts` only if
Task 3's founder review approved that) so a future field on
`GoogleConnectionSummary` cannot silently leak into an HTTP response by
falling through an unguarded spread.

- [ ] **Step 4: Register automation presets**

Extend whatever registers automation presets into `AutomationAllowlistSchema`
today (see `agent-configuration-analytics.ts` / the empty-catalogue note in
`docs/superpowers/plans/2026-08-15-agent-configuration-cabinet.md`) with four
preset strings: `google.calendar.read`, `google.calendar.write`,
`google.sheets.read`, `google.sheets.write`. This is additive to an existing
`z.array(z.string())` — it needs no contracts change, only a catalogue entry,
so it is not gated by Task 3.

- [ ] **Step 5: Run, typecheck, lint, commit**

```bash
npm run nx -- run backend:test -- google && npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/entrypoints/http apps/backend/src/platform/env.ts apps/backend/src/modules/agent-core
git commit -m "feat(google): expose the consent wizard and resource picker from the cabinet"
```

---

### Task 6: Wire tools into agent-core, end-to-end, verify

**Files:**
- Modify: `apps/backend/src/entrypoints/http/main.ts` (composition root)
- Create: `apps/backend/src/entrypoints/http/__tests__/google-integration.e2e.spec.ts`
- Modify wherever `modules/agent-core` resolves an allowlisted preset into a
  callable tool for a policy-checked turn (read that resolution point before
  touching it — do not invent a second tool-registration mechanism next to
  an existing one).

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a `composeGoogleIntegration(env, database)` factory next to
  `composeChannels`/`composeAgent` in `main.ts`, returning the two tool ports
  (real `GoogleCalendarToolAdapter`/`GoogleSheetsToolAdapter`, token-refreshed
  through `GoogleConnectionService`) gated by whether the tenant's allowlist
  contains the matching preset.

- [ ] **Step 1: Write the failing end-to-end test**

`google-integration.e2e.spec.ts` drives `createHttpApp` with `app.inject`,
`FakeGoogleOauthClient` (a Task 1-shaped fake returning canned tokens) and
the real Postgres-backed repository against the schema from Task 3:

1. `POST /consent` returns a URL; extract `state`.
2. `GET /callback?code=...&state=...` redirects and creates a `pending` row.
3. `POST /resources` activates it.
4. With `google.calendar.read` in the tenant's automation allowlist, an
   agent turn that calls the Calendar tool succeeds and returns events from
   the fake; without the preset in the allowlist, the same turn is refused
   before any Google client is constructed.
5. A response from any of the four routes, serialized to JSON, contains no
   substring of the fake's refresh or access token.

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run nx -- run backend:test -- google-integration.e2e`
Expected: FAIL.

- [ ] **Step 3: Wire the composition root and make it pass**

Run: `npm run nx -- run backend:test -- google-integration.e2e`
Expected: PASS, five behaviours.

- [ ] **Step 4: Verify against live Postgres**

Start the stack, run the consent flow against a real Google OAuth test
client (or, if none is provisioned yet, stop here and report that live
verification is blocked on OAuth client credentials — do not fabricate a
result, matching the VK plan's honesty about the ingress-blocked live
community test). If credentials exist: connect, pick a real test calendar
and spreadsheet, confirm in `psql` that `google_connections.refresh_token_enc`
is not the plaintext token and that `events` rows carry no token substring.
Delete the probe row afterwards.

- [ ] **Step 5: Full green and commit**

```bash
npm run nx -- run-many -t test lint typecheck build
npm run eval
git commit -am "feat(google): wire Calendar and Sheets tools behind the automation allowlist"
```

---

## Notes for the reviewer

- Task 3 is a checkpoint, not a formality: if the executing agent reaches it
  and no founder response is available, the correct move is to stop the plan
  there and report status, the same way the VK plan reports a blocked live
  test rather than assuming success.
- The refresh-token rotation story: Google may issue a new `refresh_token`
  on a later `refreshAccessToken` call (rare, but documented Google
  behaviour); `GoogleConnectionService`/the repository must overwrite the
  stored encrypted value whenever Google sends a new one, or a later refresh
  will fail with `invalid_grant` against a token Google already revoked.
- No live Google OAuth client is provisioned in `ops/sops/secrets.enc.json`
  today (checked in Task-1 research; only `KEY_CREDENTIALS_V1` exists,
  reused, not a Google credential) — provisioning `GOOGLE_OAUTH_CLIENT_ID`/
  `GOOGLE_OAUTH_CLIENT_SECRET` in SOPS is a prerequisite for Task 6 Step 4 and
  is itself something to raise at the Task 3 checkpoint rather than assume.
