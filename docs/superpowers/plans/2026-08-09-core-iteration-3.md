# Core Iteration 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the next three MVP-1 core primitives executable without weakening tenancy, policy, or PII boundaries.

**Architecture:** Reporting gains a database-backed implementation of its existing event-bus port, policy gains an LLM-backed classifier behind its existing local port, and FrontLine is a deterministic FAQ workflow that can return only a configured completed answer or `out_of_kb`. No contracts or migrations change. The semantic-cache portion of the card is deliberately deferred because the source notes conflict on caching knowledge/RAG outputs.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle-shaped repository boundary, `@turni/contracts`, `@turni/llm`.

---

### Task 1: Database domain-event bus

**Files:**
- Create: `apps/backend/src/modules/reporting/infrastructure/database-domain-event-bus.ts`
- Test: `apps/backend/src/modules/reporting/infrastructure/__tests__/database-domain-event-bus.spec.ts`

- [x] Write a failing test showing that a valid `DomainEventEnvelope` is parsed then appended once with only its canonical fields, and an invalid envelope is rejected before the database port is called.
- [x] Run the focused test and observe the expected missing-module failure.
- [x] Implement `DatabaseDomainEventBus implements DomainEventBus` with a narrow injected append port, Zod validation, and no logging of event body/props. The eventual Drizzle composition root may translate this port to the existing append-only `events` table under `withTenant`.
- [x] Run the focused reporting tests, typecheck, and lint.

### Task 2: LLM policy classifier adapter

**Files:**
- Create: `apps/backend/src/modules/policy/infrastructure/llm-policy-classifier.ts`
- Test: `apps/backend/src/modules/policy/infrastructure/__tests__/llm-policy-classifier.spec.ts`

- [x] Write failing tests showing that the adapter calls `LlmPort.classify` with role `classify`, uses the policy result Zod schema as structured output, and rejects malformed model output.
- [x] Run the focused test and observe the expected missing-module failure.
- [x] Implement the adapter behind `PolicyClassifierPort`; it must not log source text, must use only the injected (already redacted) `LlmPort`, and must leave cascade fail-closed behavior unchanged.
- [x] Run focused policy tests, typecheck, and lint.

### Task 3: Exact FAQ FrontLine workflow

**Files:**
- Create: `apps/backend/src/modules/frontline/application/frontline-workflow.ts`
- Test: `apps/backend/src/modules/frontline/application/__tests__/frontline-workflow.spec.ts`

- [x] Write failing tests for normalized exact matching within a tenant-owned FAQ map, for `out_of_kb` when no exact answer exists, and for rejection of an invalid/empty response.
- [x] Run the focused test and observe the expected missing-module failure.
- [x] Implement a pure deterministic workflow: input question plus tenant-scoped FAQ entries produces `auto` with the configured template or `out_of_kb`; it never calls an LLM or caches knowledge output.
- [x] Run focused FrontLine tests, typecheck, and lint.

## Completion checks

- [x] Review each implementation for PII logging, tenant scoping, and accidental changes to contracts/migrations.
- [x] Run `npm run nx -- run-many -t test,typecheck,lint -p backend,llm`, `npm run eval`, and `git diff --check`.
- [x] Scan `apps` and `packages` source directories for generated `.js`, `.d.ts`, and `.map` artifacts before committing.
