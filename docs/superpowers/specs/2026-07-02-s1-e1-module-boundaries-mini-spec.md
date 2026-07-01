# S1 E1 Module Boundaries Mini-Spec

## Card

`C1 [E1] Enforce module boundaries in ESLint/Nx for apps/backend and packages/*`

## Mini-Spec

- Goal: make the accepted Nx project boundaries executable instead of relying on tags alone.
- Input: Nx projects tagged `type:app` and `type:boundary`, plus TypeScript imports.
- Output: official Nx ESLint rule with explicit dependency constraints.
- Criteria: backend may import contracts; contracts cannot import backend; current lint remains green.
- Traps: do not block external npm packages; do not allow deep cross-project relative imports; keep constraints extensible for future project types.

## Design

Use `@nx/enforce-module-boundaries` in the existing flat ESLint config. Applications may depend on stable boundary packages. Boundary packages may depend only on other boundary packages. A temporary violating source file provides a red/green behavioral check of the actual rule and is removed before commit.
