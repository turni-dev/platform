# ADR 0004: Coverage Gate

## Status

Accepted

## Context

The S1/E1 quality card requires strict TypeScript, ESLint rules, Zod boundaries, and coverage >=80%. Strict TypeScript and ESLint are already active in the Nx foundation.

## Decision

Use Vitest with the V8 coverage provider and global thresholds:

- statements >=80%
- branches >=80%
- functions >=80%
- lines >=80%

Expose the gate through Nx `coverage` targets and the root `npm run coverage` script. Run the same gate in CI.

Each Nx project passes its own production-source `include` glob and writes to a separate report directory. This includes untested production files in the denominator and prevents parallel targets from cleaning or overwriting a shared report.

## Consequences

New code must be testable enough to keep coverage above the MVP threshold. Test files and backend bootstrap `main.ts` are excluded so the gate measures production units rather than test scaffolding or process startup wiring. Reports are available under `coverage/<project>`.
