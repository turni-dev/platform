# S1 E1 Nx Monorepo Mini-Spec

## Card

`C1 [E1] Monorepo Nx (apps: backend/web/worker; packages: contracts/ui/widget/fsm/llm) + npm + lint + module boundaries`

## Mini-Spec

- Goal: turn the placeholder Turni repository into a minimal, verifiable Nx/npm monorepo foundation.
- Input: Obsidian MVP-1 board, architecture notes, root `AGENTS.md`, and the current placeholder directory layout.
- Output: Nx root config, strict TypeScript config, project targets, `@turni/contracts`, and a NestJS Fastify backend health API.
- Criteria: `npm run nx -- run-many -t test lint typecheck` succeeds locally; `/healthz` returns a contract-validated payload.
- Traps: do not restore obsolete `libs/*`; do not start DB/compose work from neighboring cards; keep vendor SDK types behind future ports.

## Notes

The older kickoff note still mentions `libs/*`, `pnpm`, and split `api/worker` apps. The current root `AGENTS.md`, current placeholder structure, and later project decisions use `apps/backend` plus `packages/*` and npm, so this task follows the newer structure.
