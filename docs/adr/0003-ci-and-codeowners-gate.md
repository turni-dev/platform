# ADR 0003: CI And CODEOWNERS Gate

## Status

Accepted

## Context

S1/E1 requires CI for build, tests, migrations, CODEOWNERS, branch protection, and later staging deploy. The repository now has npm, Nx, a backend health slice, contracts, and a local Compose file.

Branch protection, GitHub environments, deploy users, and GHCR permissions require repository administration outside the working tree.

## Decision

Add a GitHub Actions workflow that runs on pull requests and pushes to `main`:

- `npm ci`
- `docker compose config`
- `npm run nx -- run-many -t test lint typecheck`
- `npm run nx -- run-many -t build`
- `npm run db:migrate`

Add `.github/CODEOWNERS` for contracts and database-sensitive paths. Use `@turni/founders` as the intended owner placeholder until the GitHub organization team is created.

## Consequences

The codebase now has a concrete CI gate that can become a required branch-protection check. Staging deployment remains blocked until GHCR, environments, secrets, and deploy users exist.
