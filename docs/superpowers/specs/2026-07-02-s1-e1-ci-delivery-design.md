# S1 E1 CI Delivery Design

## Goal

Turn a green `main` commit into an immutable backend image in GHCR and optionally deploy that exact image to staging.

## Design

Extend the existing CI workflow with two dependent jobs:

1. `verify` remains the mandatory quality gate.
2. `publish-image` runs only for pushes to `main`, builds the production Dockerfile, and publishes `staging` plus immutable `sha-<commit>` tags to GHCR.
3. `deploy-staging` runs only when repository variable `STAGING_DEPLOY_ENABLED` equals `true`. The `staging` GitHub environment supplies SSH secrets. The remote key is restricted to a server-side `turni-deploy` command, which receives the immutable image reference.

The production image uses Node 24 Alpine, multi-stage npm installs, compiled JavaScript, a non-root user, and an HTTP healthcheck. Source TypeScript is not used at runtime.

## Boundaries

Repository code defines the image and workflow. Creating the GitHub organization, environments, secrets, branch protection, deploy user, and forced SSH command remains in the separate human-assisted admin card.

## Verification

The current compiled entrypoint must answer `/healthz`. Static assertions verify workflow dependencies, permissions, immutable tags, deploy gating, non-root runtime, and healthcheck. A real Docker build remains unavailable until Docker Desktop is running or CI executes it.
