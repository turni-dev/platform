# ADR 0001: Nx Monorepo Foundation

## Status

Accepted

## Context

Turni starts from a placeholder-only repository. The MVP-1 board asks for an Nx monorepo foundation with strict TypeScript, linting, tests, and explicit boundaries before product modules and database work begin.

Some older Obsidian notes reference `libs/*`, `pnpm`, and separate `api`/`worker` apps. The active repository instructions and current structure use `apps/backend` and `packages/*` with npm commands.

## Decision

Use Nx project targets over the current layout:

- `apps/backend` for the NestJS modular monolith and future HTTP/worker entrypoints.
- `packages/contracts` for public Zod DTOs and inferred TypeScript types.
- Placeholder projects for `packages/ui`, `packages/widget`, `packages/fsm`, and `packages/llm` will be added only when they contain code.

Root commands use npm and delegate to Nx.

## Consequences

This keeps the first working slice small and testable while preserving the accepted DDD directory layout. Database, compose, CI, and module-boundary hardening remain separate S1/E1 tasks.
