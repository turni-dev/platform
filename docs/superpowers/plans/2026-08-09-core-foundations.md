# Core Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Establish the first secure, testable core boundaries: PII-safe LLM invocation, validated domain events, and default-deny deterministic policy decisions.

**Architecture:** Each track is independent. PII is a decorator around the existing `LlmPort`; events use contracts plus an in-memory fake before introducing a DB/queue outbox; policy starts as pure deterministic L0 rules and requires no vendor model, migration, or public API.

**Tech Stack:** strict TypeScript, Zod, Vitest, existing `@turni/llm` and `@turni/contracts`.

---

### Track 1: PII redaction at the LLM boundary

**Files:** create only under `packages/llm/src/` and update its `index.ts`.

- [ ] Write tests that prove phone/email values become deterministic placeholders in the delegated LLM request and that exact placeholders restore in text and structured output.
- [ ] Run the focused test and observe it fail due to the absent redactor/decorator.
- [ ] Implement a provider-neutral `RedactingLlmPort` and redaction utility. It must fail closed if a generated placeholder is absent or modified in output, avoid logging, preserve LLM metadata, and wrap `generate` plus `classify`.
- [ ] Run package tests, lint, and typecheck; do not wire live runtime until an application composition root exists.

### Track 2: strict domain-event boundary and fake adapter

**Files:** create `packages/contracts/src/events.ts` and tests; update `packages/contracts/src/index.ts`; create only reporting application/fake files and tests.

- [ ] Write contract tests for a strict event envelope with UUIDv7 ID, tenant ID, name, positive version, ISO timestamp, actor, correlation ID, and JSON-safe `props`; aliases and extra fields must fail.
- [ ] Run the focused test and observe missing schema/port failure.
- [ ] Implement schema/types, a `DomainEventBus` port and ordered `FakeDomainEventBus` that accepts only validated envelopes.
- [ ] Run contracts/backend focused tests, lint and typecheck. Defer DB/BullMQ/outbox/migration until the delivery semantic is approved.

### Track 3: deterministic policy L0

**Files:** create only `apps/backend/src/modules/policy/domain/` source and specs.

- [ ] Write failing tests for allergen, money, complaint, prompt injection, human request, spam, unknown input, tie/max reduction and no raw input in outcome.
- [ ] Run the focused test and observe missing engine/rules failure.
- [ ] Implement pure `PolicyEngine.evaluate` with immutable RU guards and exact verdicts `auto|approval|escalate_human|out_of_kb|refuse`. Locked scores 8+ must never downgrade; no guard match is approval/default-deny.
- [ ] Run focused/backend tests, lint and typecheck. Defer L1/L2 classifier, tenant compiled rules, approvals persistence and public contracts to subsequent slices.

### Evidence

- [ ] Run tests and checks for all touched packages after agents return.
- [ ] Review specification compliance and code quality before any completion claim.
