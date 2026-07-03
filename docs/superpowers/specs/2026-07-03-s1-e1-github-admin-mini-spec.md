# S1 E1 GitHub Admin Mini-Spec

- Goal: enforce repository and deployment controls required by the existing CI delivery workflow.
- Input: `turni-dev/platform`, the `verify` status check, and owner-authorized GitHub CLI access.
- Output: least-privilege Actions/GHCR permissions, staging and production environments, and protected `main`.
- Criteria: `main` requires `verify`, force pushes and deletion are blocked, production requires manual approval, and staging deploy secrets remain environment-scoped.
- Traps: never print secret values, weaken CODEOWNERS review, grant broad organization tokens, or enable deployment before host keys and restricted SSH credentials exist.
