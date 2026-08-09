# Core Iteration 2 — Three Parallel Tracks

## Goal

Advance the three ready core cards without changing database schema or public contracts.

## Tracks

1. [x] **PII runtime boundary** — compose `RedactingLlmPort` around every resolver-produced text port; prove requests are redacted and output restoration remains intact.
2. [x] **Policy cascade** — add a provider-neutral classifier port inside the policy application layer, call L1 and L2 only after L0 has no match, reduce by maximum risk, and return approval on any classifier failure or confidence below 0.8.
3. [x] **Eval gate** — create an offline deterministic evaluator that calculates FN for labelled policy cases and causes CI to fail above 2%; do not make live provider calls.

## Constraints

- Tests only in `__tests__/`; no generated JS, declarations, or maps outside build directories.
- TDD: focused test must demonstrably fail before production code.
- No migrations or contract changes. No raw message content in policy outcomes or eval logs.
- Each agent owns only its listed directories and leaves commits to the coordinating agent.

## Success evidence

- [x] Targeted tests, typecheck and lint pass for each touched project.
- [x] A final run verifies all affected packages; then changes are reviewed and committed atomically.
