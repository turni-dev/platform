# AGENTS.md - Turni

Turni is a TypeScript/Nx monorepo for AI employees; MVP-1 starts with a restaurant administrator.

## Source Of Truth

Obsidian notes in `1. Projects/Личное/ИИ сотрудник или команда` are authoritative. Before implementation, read the task card in `Доска MVP-1` (take only `Готово к работе`, WIP=1) and its linked spec. If notes and code differ, follow notes and record the question.

Read only the relevant notes: overview (`Обзор проекта`, `Платформа — ядро продукта`), architecture/data/API, LLM runtime, policy/eval/security, or NFR/frontend architecture. Do not load unrelated notes.

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

## Efficient Agent Work

- Read targeted files/notes and batch independent inspections. Do not re-read known context or produce progress narration without new information.
- Use subagents only for independent, non-overlapping files; they reduce latency, not total token cost.
- Start a new session after a completed, committed logical task. Escalate immediately for policy bypass, red eval, PII leak or pilot incident.

## Commands

`npm install` · `docker compose up` · `npm run nx -- run-many -t serve|test|lint|typecheck` · `npm run eval` · `npm run db:migrate`
