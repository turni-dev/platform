# AGENTS.md - Turni

Turni is a TypeScript/Nx monorepo for AI employees; MVP-1 starts with a restaurant administrator.

## Source Of Truth

`docs/context/` and `openspec/` are authoritative — not Obsidian. Before implementation, read the active card(s) in `docs/context/task-board.md` (`В работе` / next `Готово к работе`) and the linked `openspec/changes/<slug>` (proposal/tasks/design) if one exists; if not, propose one before starting. WIP=1 is a human-capacity rule and does not bind agent-driven cards — an agent may run multiple `В работе` cards in parallel when they are independent. If context and code differ, follow context and record the question.

Read only the relevant files: overview (`docs/context/overview.md`, `docs/context/decisions.md`, `docs/context/product-scope.md`), `docs/context/architecture/*` for architecture/data/API/LLM runtime, `docs/context/security-and-quality.md` for policy/eval/security, `docs/context/architecture/frontend-and-nfr.md` for NFR/frontend architecture. Do not load unrelated files. `docs/context/archive/` is historical/business material, not needed for day-to-day coding.

## Architecture

- Strict TypeScript, Nx, NestJS/Fastify modular monolith, Drizzle/Postgres+pgvector/citext, Redis/BullMQ, XState, Next.js, shadcn, SCSS, Docker Compose, GHCR.
- RU-first LLM behind `LlmPort`: YandexGPT primary; Sber/ProxyAPI only later; never OpenRouter. Yandex Text Embeddings v2 is 768-dimensional; see ADR 0005 before changing it.
- `apps/backend/src/modules/<context>/{domain,application,infrastructure}` owns its bounded context. Entrypoints are `src/entrypoints/{http,worker}`.
- Shared external boundaries only: `packages/contracts`, `ui`, `widget`, `fsm`, `llm`. Code, paths and DB use English/kebab-case; UI uses Russian and next-intl.
- `platform/database` owns connections, transactions and `withTenant`; integrations own vendor SDKs. A backend module never imports another module's infrastructure.

## Non-Negotiables

1. Every action passes `PolicyEngine` (default deny). Allergens, money and complaints always require locked approval policies.
2. Vendor types stay inside integrations. Boundaries use our Zod DTOs and each external port has a Fake adapter.
3. Tenant data uses `withTenant`, `SET LOCAL app.tenant_id`, FORCE RLS and `app_rw` with NOBYPASSRLS. No raw worker DB access or RLS bypass.
4. Keep strict TS: no `any`, no floating promises, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Validate every HTTP/WS/queue/env/LLM boundary with Zod; contracts are the only type source.
5. Prompts are immutable DB versions; only CI may activate one after a green eval. FN <=2% blocks release.
6. Redact PII before LLM (fail closed); hash/encrypt/mask storage; never log message bodies or secrets. Foreign providers require redaction.
7. Mutating POST/webhooks are Postgres-idempotent; undo is 30 seconds; FSM statuses are text+CHECK; IDs are UUIDv7.
8. Use expand/contract migrations; concurrent indexes outside transactions; secrets only through sops/age.
9. Guests receive completed policy-checked responses, never tokens; show typing; p95 <=10s; disclose that the agent is AI.
10. Meet OWASP Top 10:2025 and OWASP LLM Top 10.

## Delivery Loop

1. Add a mini-spec comment to the card: goal, input, output, criteria and traps.
2. Keep scope narrow: branch <=2 days, PR <=400 lines, feature flag where deploy differs from release. Respect CODEOWNERS; do not change contracts or migrations without founder review.
3. Write the focused test first. After each edit run affected tests/typecheck/lint; run full affected workflows and eval when closing the card.
4. Commit atomic verified changes. DoD: main, tests and eval green, analytics events, policy preserved, docs/ADR updated, card closed with a comment.
5. Keep backend and frontend (`apps/web`, `apps/core-site`) in balance. A backend capability without the screen that uses it is not done — an unbounded lead lets the backend outrun what the frontend can ever catch up to. When a backend card ships a capability an owner/guest needs to act on (approvals, connections, automations, policy-visible state), open or update the matching frontend card in the same batch, not as an unscheduled follow-up. When picking the next batch of ready-to-work cards, check feature parity between the two layers before adding more backend-only scope.

## Test and Artifact Hygiene

- Put all new tests in a sibling `__tests__/` directory; do not colocate `*.spec.*` files with production code.
- Do not leave generated `.js`, `.d.ts`, or `.map` artifacts in source directories. Generated outputs belong only in configured build directories and must be removed before committing.

## Efficient Agent Work

- Read targeted files/notes and batch independent inspections. Do not re-read known context or produce progress narration without new information.
- Use subagents only for independent, non-overlapping files; they reduce latency, not total token cost.
- Start a new session after a completed, committed logical task. Escalate immediately for policy bypass, red eval, PII leak or pilot incident.

## Commands

`npm install` (`apps/cms` is deliberately outside the root workspaces, so install its dependencies separately with `npm ci --prefix apps/cms`) · `docker compose up` · `npm run nx -- run-many -t serve|test|lint|typecheck` · `npm run eval` · `npm run db:migrate`
