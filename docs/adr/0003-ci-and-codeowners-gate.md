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

After `verify` succeeds on a push to `main`, build the root `Dockerfile` and publish the backend to GHCR with both `staging` and immutable `sha-<commit>` tags. The image runs compiled JavaScript as the non-root `node` user and exposes an HTTP healthcheck.

Define a staging deployment job behind `STAGING_DEPLOY_ENABLED=true`. It uses the `staging` GitHub environment and calls a restricted remote command, `turni-deploy <immutable-image>`, over SSH. The deploy key must not permit an unrestricted shell.

## Consequences

The codebase has a concrete CI and image-delivery pipeline. Staging deployment remains disabled until GHCR permissions, the `staging` environment, secrets, deploy user, known-host entry, and restricted `turni-deploy` command exist.
