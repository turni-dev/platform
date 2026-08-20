# MCP, marketplace and composable agent profiles — design

## Decision

Turni exposes every agent capability through one capability registry. MCP is
the preferred integration transport; a first-party provider may use a vendor
SDK internally, but agents and automations never import or invoke a vendor API
directly. When a service has no suitable MCP server, it is added as a
versioned, policy-bound skill adapter to the same registry.

The Google Calendar and Sheets M1 path remains in scope, but is the first
first-party MCP provider. It is not a general-purpose remote-MCP catalogue.

## Model

- `McpPort` owns discovery, invocation and normalized capability metadata.
- A provider owns vendor OAuth, credential refresh, resource selection and
  vendor types. The port boundary uses our Zod DTOs only.
- A skill is a versioned executable capability with an explicit input/output
  schema and minimum permissions. It can call an MCP capability or implement a
  narrowly scoped API fallback.
- An agent profile is an immutable, versioned composition of role,
  instructions, knowledge skeleton, skills, MCP integrations, workflows,
  permissions and approval rules. Applying it produces a tenant-scoped agent
  configuration; it never bypasses the monotonic policy resolver.

Every discovery and invocation runs inside the per-tenant Execution
Environment. Policy filters discovery as well as calls; secrets stay in the
provider secret store; writes require the existing approval and idempotency
paths; events record metadata, never credentials or prompt/message bodies.

## Marketplace and public site

One marketplace has three item kinds: `integration` (including MCP provider),
`skill`, and `profile`. Each has a stable slug, structured metadata, version,
author/owner, permission summary, status and compatibility information.

The public catalogue may filter all kinds from one route, but every item has a
canonical, server-rendered page and sitemap entry for SEO. The CMS page builder
is reserved for informational pages, articles and use cases. Marketplace item
pages are rendered from their structured catalogue records, not arbitrary page
blocks.

Community publication, moderation, ratings, revenue share, referral rewards
and bonus payouts are post-release. The initial data model reserves immutable
author identity, publication status, licence, item version and attribution;
there is no balance, payout or public upload flow in M1.

## Delivery slices

1. M1: `McpPort`, allowlisted first-party Google provider, Fake provider and
   policy/approval/idempotency coverage for the existing automation.
2. Platform: immutable composable agent profiles and application to a tenant
   configuration, with policy monotonicity tests.
3. Growth: evolve the existing integration catalogue into a unified structured
   marketplace and canonical SEO pages. Keep the CMS builder informational.
4. Post-release: vetted community publishing, then referral/bonus attribution
   and revenue sharing after legal, tax and anti-fraud decisions.

## Out of scope

No arbitrary remote MCP server, executable upload, browser/exec capability,
unreviewed community content, money movement, or visual workflow builder is
introduced by these slices. The execution sandbox card remains a prerequisite
for the first third-party executable capability.
