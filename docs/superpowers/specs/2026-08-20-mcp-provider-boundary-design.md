# MCP Provider Boundary Design

## Goal

Move the existing Google Calendar and Sheets integration behind one
capability-oriented `McpPort`, so agents and automations never call a
vendor-specific port. Store every tenant integration connection through one
generic, encrypted model while exposing only reviewed first-party providers in
M1.

## Scope

This iteration creates a first-party Google MCP provider and migrates all
existing Google tool adapters and tenant connections to it.

It does not accept remote MCP URLs or manifests, execute third-party code,
provide an end-user custom-provider UI, or publish providers to a community
marketplace. Those features require sandboxing, provider vetting and egress
controls and are explicitly deferred.

## Architecture

```text
agent / automation
  -> McpPort discovery or invocation
  -> Execution Environment (tenant, secrets, budget, capabilities)
  -> PolicyEngine tool_discovery and invocation policy
  -> approval, idempotency and metadata-only audit for writes
  -> first-party provider registry
  -> Google provider
  -> Google Calendar or Google Sheets API adapter
```

`McpPort` is the only capability boundary consumed by agent runtime and
automation. Discovery returns only capabilities enabled for the agent and
tenant after policy filtering. Invocation identifies one capability and passes
its validated input to the owning provider. Inputs and outputs are validated
with the capability's Zod schemas; Google wire types never cross the provider
boundary.

The initial provider registry contains one hard-coded, reviewed descriptor:
`google`. Its capabilities are:

- `google.calendar.events.list` — read;
- `google.calendar.events.create` — write;
- `google.sheets.range.read` — read;
- `google.sheets.rows.append` — write.

Writes remain subject to the existing default-deny policy, approval flow,
idempotency key and audit path. Audit records capability id, provider slug,
connection id and correlation metadata only; they never include credentials,
message bodies or prompt content.

## Connection Storage

Replace the provider-specific `google_connections` table with
`integration_connections`. The migration preserves existing Google rows and
uses the following stable model:

- `id`, `tenant_id`, timestamps and lifecycle `status`;
- `provider_slug` and `provider_version`;
- `credentials_enc`, encrypted with the existing tenant-secret mechanism;
- `resources jsonb` for selected Calendar, Sheets and future provider
  resources;
- `granted_scopes`.

RLS, `FORCE ROW LEVEL SECURITY`, `withTenant` access and `app_rw` with
`NOBYPASSRLS` remain mandatory. The public DTO must never contain an encrypted
credential, raw token or secret-derived value.

The schema deliberately allows another reviewed provider to be added later
without another connection-table migration. Adding a provider still requires a
code-reviewed descriptor, narrow capability definitions, a Fake adapter, Zod
validation, policy registration and tests.

## Deferred Custom Providers

The abstractions leave room for a provider descriptor without a preset
connection UI, but M1 has no route, schema, API or runtime path for users to
submit arbitrary URLs, manifests or provider code. The allowlist accepts only
`google`.

Before custom or remote MCP is enabled, the platform must add sandboxing for
risky execution, controlled egress, moderation/vetting, a threat model for
provider manifests and a separately approved permission model.

## Migration and Compatibility

The database migration is an expand/contract change: add the generic table,
copy and validate every existing Google connection inside the migration path,
switch repositories and HTTP composition to the generic model, then remove the
old Google-only table only in a later approved contract migration. This keeps
rollback and live-data verification possible.

Existing owner OAuth consent and resource-selection routes retain their public
behaviour. Their implementation resolves `provider_slug = 'google'` through
the registry and operates on an integration connection rather than a
Google-specific record.

## Verification

- unit and contract tests cover discovery, policy filtering, read and write
  capability invocation, Zod failures and Fakes;
- migration tests prove data preservation, RLS, FORCE RLS and rejection of an
  unallowlisted provider;
- route tests prove credentials never reach the UI and existing Google consent
  behaviour remains intact;
- a Fake e2e proves a write cannot bypass approval or idempotency;
- before production, run the migration against a live tenant-scoped Postgres
  environment and probe tenant isolation.
