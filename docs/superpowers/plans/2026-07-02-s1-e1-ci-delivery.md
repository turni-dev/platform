# S1 E1 CI Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a verified backend image to GHCR and provide a disabled-by-default staging deployment job.

**Architecture:** Add publish and deploy jobs after the existing CI verification job. Build a multi-stage non-root Node image from compiled backend output; deploy only an immutable SHA tag through a restricted SSH command.

**Tech Stack:** Docker BuildKit, Node.js 24 Alpine, GitHub Actions, GHCR, OpenSSH

---

### Task 1: Prove delivery artifacts are absent

**Files:**
- Inspect: `.github/workflows/ci.yml`
- Inspect: `Dockerfile`

- [x] Assert that `Dockerfile`, `publish-image`, and `deploy-staging` exist.
- [x] Verify RED because the image and jobs are absent.

### Task 2: Build the production image definition

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [x] Install dependencies with `npm ci` in cached build and production-dependency stages.
- [x] Build Nx projects and copy only runtime dependencies plus compiled backend output.
- [x] Run as the `node` user with a Node-based `/healthz` check.

### Task 3: Publish and deploy after verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/adr/0003-ci-and-codeowners-gate.md`

- [x] Add `publish-image` with `needs: verify`, `packages: write`, GHCR login, metadata, and Buildx push.
- [x] Add immutable `sha-<commit>` and moving `staging` tags.
- [x] Add `deploy-staging` with `needs: publish-image`, environment `staging`, and `vars.STAGING_DEPLOY_ENABLED == 'true'`.
- [x] Use SSH known-host verification and invoke `turni-deploy` with the immutable image only.

### Task 4: Verify and synchronize

- [x] Run static delivery assertions and the full Nx verification set.
- [x] Attempt `docker build`; record Docker daemon unavailability if it remains external.
- [x] Move the board card through `Ревью` to `Готово` after commit.
