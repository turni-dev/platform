# S1 E1 Coverage Gate Mini-Spec

## Card

`C1 [E1] Strict-TS + eslint + zod-env + coverage gate >=80% + ADR docs/adr`

## Mini-Spec

- Goal: complete the quality gate left after the initial Nx scaffold by adding enforced test coverage.
- Input: existing Vitest/Nx projects, strict TypeScript config, and CI workflow.
- Output: Vitest V8 coverage provider, 80% global thresholds, Nx coverage targets with project-specific source scopes and report directories, npm script, and CI step.
- Criteria: `npm run coverage` succeeds locally and fails if statements, branches, functions, or lines drop below 80%.
- Traps: do not weaken strict TS/eslint rules; do not count test files or bootstrap `main.ts` in coverage; do not fake coverage with empty tests; do not let parallel Nx targets clean or overwrite each other's reports.

## Notes

The first S1/E1 scaffold already introduced strict TS, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `@total-typescript/ts-reset`, no-explicit-any, no-floating-promises, and Zod env parsing for the backend HTTP entrypoint.
