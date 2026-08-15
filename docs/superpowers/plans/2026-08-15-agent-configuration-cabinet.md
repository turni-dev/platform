# Agent configuration from the cabinet — slice plan

**Card:** `Доска MVP-1` → С2a [M1 Core] Управление агентом из кабинета (CURRENT).
**Notes:** `Платформа — ядро продукта` (каноническая модель агента),
`Производство/Архитектура/Архитектура и задачи разработки` (память: md в
Postgres, версии таблицей).

**Goal:** the owner opens the cabinet and configures one agent — who the
business is, what it knows, and which automations it may use — without ever
touching a secret or the policy engine.

## Scope decision (founder, 2026-08-15)

The card is taken together with two reusable primitives, designed against the
requirements of the Telegram, Google and automation cards so they are not
rewritten three times:

- **A — owner-authenticated cabinet API.** Session resolution currently hides
  in a private function inside `owner-auth-routes.ts` and the Origin check is
  duplicated. Every following card adds protected endpoints.
- **C — cabinet shell in `apps/web`.** `/dashboard` is a stub; the agent,
  channel and integration screens all need one layout, one server-side session
  check and one form pattern.

**B — encryption of tenant-scoped secrets** (AES-256-GCM over
`channel_connections.credentials_enc`; there is no `createCipheriv` anywhere in
the code today) is a separate small card immediately before Telegram, where it
is first needed. Taking cards 1+2 in one branch was rejected: ~2 demo and a PR
far past 400 lines, against the delivery rules in `AGENTS.md`.

## Founder decisions

- **Versioning:** every save writes an immutable `memory_revisions` row with
  `author = 'owner'` and moves `memory_files.current_rev`. No draft state — the
  schema has none, and adding one would need a migration. History and rollback
  come for free; the trade-off is that a save is immediately live.
- **Editable content:** `identity.md` and `knowledge/*` only. `policies/*` is
  not shown in the cabinet at all, so the policy engine can never be rewritten
  as free text (mini-spec requirement, OWASP LLM06).
- **Automation presets:** `agents.autonomy` holds a default-deny allowlist
  validated by Zod. The preset catalogue is empty in M1 and the screen says so
  honestly; Telegram and Google register their presets into it later.

## Global constraints

- No migrations: `agents`, `memory_files` and `memory_revisions` already exist
  with RLS, `author in ('owner','agent','system')` and a unique `(file, rev)`.
- New DTOs in `packages/contracts` need founder review before the slice lands.
- Strict TS, Zod at every boundary, no vendor type across a port.
- Never log file contents: knowledge holds business data and can hold PII.
- New tests live in sibling `__tests__/` directories.

## Slices

### Slice 1 — Owner-authenticated request context (primitive A)

- Extract the access-cookie → verified claims path out of the route file into a
  reusable `authenticatedOwner(request)` returning `{ userId, tenantId, role }`
  or a generic 401 problem, plus one shared `requireTrustedOrigin` for
  cookie-authenticated mutations.
- `/auth/me` is rewritten on top of it, so the primitive is proven by an
  existing endpoint before anything new depends on it.
- Acceptance: no cookie → 401; tampered or expired token → 401; valid token →
  the handler receives the tenant context; a mutation without a trusted Origin
  → 403 and never reaches the handler.

### Slice 2 — Agent configuration domain and application

- Contracts: `AgentConfigurationSchema`, `AgentInstructionsUpdateSchema`,
  `KnowledgeFileSchema`, `AutomationAllowlistSchema` (founder review).
- Domain: the starting agent bootstrap (one `agents` row plus `identity.md`
  and an empty `knowledge/` set), the revision rule (new immutable revision per
  save, `current_rev` bumped in the same statement), path validation that keeps
  the owner inside `knowledge/` and out of `policies/`.
- Application service over ports for agents and memory files; Postgres adapters
  under `withTenant`.
- Acceptance: a second bootstrap for the same tenant is a no-op; a save creates
  exactly one revision and never rewrites a previous one; a path outside
  `knowledge/` is refused; concurrent saves cannot produce two revisions with
  the same number.

### Slice 3 — HTTP surface

- `GET /api/v1/agent`, `PATCH /api/v1/agent/instructions`,
  `GET|PUT|DELETE /api/v1/agent/knowledge/*`, `PUT /api/v1/agent/automations`,
  all behind the slice 1 primitive.
- Analytics: `agent.created`, `agent.instructions_updated`,
  `agent.knowledge_updated`, `agent.automations_updated` through
  `OwnerAuthAnalytics`'s sibling — props carry ids and paths, never content.
- Acceptance: another tenant's agent is invisible, not merely forbidden; every
  refusal is RFC7807; no response or event carries file content.

### Slice 4 — Cabinet shell and screens (primitive C)

- Layout with navigation, one server-side session check, one form pattern
  (Zod + generic errors + next-intl), Russian copy in `messages/ru.json`.
- Screens: агент (инструкции), знания (список файлов и редактор), автоматизации
  (пустой каталог с честным пустым состоянием).
- Acceptance: an unauthenticated visit to any cabinet page lands on `/login`; a
  failed save says so and keeps the text; the Russian catalog test stays green.

### Slice 5 — Browser run against Postgres

- Register a fresh owner, bootstrap the agent, edit instructions and a
  knowledge file, reload, confirm revisions in `memory_revisions` and events in
  `events`. Fakes hid four defects on the previous card; a store is only proven
  against Postgres.

## Verification per slice

`npm run nx -- run-many -t test,typecheck,lint --projects=<affected>` before
each commit; the full affected workflow and `npm run eval` when the card closes.
