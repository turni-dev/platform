# S1 E1 CI And CODEOWNERS Mini-Spec

## Card

`C1 [E1] CI: build+test+migrations (expand/contract) + auto-deploy main->staging (GHCR) + CODEOWNERS + branch protection`

## Mini-Spec

- Goal: add repository-level CI and code ownership gates that can run before staging deploy secrets exist.
- Input: current Nx/npm scaffold, local Compose stack, and Obsidian S1/E1 CI requirement.
- Output: GitHub Actions workflow and CODEOWNERS rules for contracts and database-owned files.
- Criteria: workflow syntax is structurally valid, local equivalent commands pass, and CODEOWNERS covers `packages/contracts` plus migration/schema paths.
- Traps: do not fake branch protection or deploy-user setup from code; do not add GHCR deploy without real environments and secrets.

## Notes

The deploy part of the board card is intentionally left for the GitHub organization/environment setup. This slice creates the CI gate that branch protection will later require.
