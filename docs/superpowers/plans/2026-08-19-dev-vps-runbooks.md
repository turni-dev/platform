# Dev VPS Runbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the verified Ubuntu dev-VPS deployment and recovery workflow in repository documentation.

**Architecture:** Keep first-install instructions in the existing Ubuntu runbook and isolate frequent operations and incident recovery in a second runbook. Both documents reference external env files by name only and never contain credential values.

**Tech Stack:** Ubuntu, Docker Compose, Caddy, GitHub, Strapi, Next.js.

---

### Task 1: Update the installation runbook

**Files:**
- Modify: `docs/runbooks/ubuntu-dev-vps.md`

- [ ] **Step 1: Align the deployment model and prerequisites with the current dev stack**

Document the two Compose projects, `main` checkout, DNS names, GitHub deploy access, and the fact that CMS is intentionally open for this dev-only environment.

- [ ] **Step 2: Make first-install commands copy-safe**

Include Docker repository setup without a quoted command substitution, Caddy setup without an unused environment drop-in, and external `site.env` / `product.env` file locations.

- [ ] **Step 3: Document initial launch and verification**

Provide separate commands for site and product startup, plus local health checks and a warning never to use `down -v`.

- [ ] **Step 4: Verify documentation safety**

Run: `git diff --check && rg -n -S "<real-|ghp_|github_pat_|BEGIN .*PRIVATE|CMS_ADMIN_PASSWORD_HASH=\\$2" docs/runbooks/ubuntu-dev-vps.md`

Expected: no formatting errors and no committed credentials.

### Task 2: Add the operating and recovery runbook

**Files:**
- Create: `docs/runbooks/dev-vps-operations.md`

- [ ] **Step 1: Add normal update and targeted rebuild procedures**

Document switching to `main`, safe `git pull --ff-only`, full stack updates, and service-only recreations.

- [ ] **Step 2: Add CMS administration and token wiring**

Document first Strapi admin creation, a read-only content token, a dev-only write token, `CMS_API_TOKEN`, `CMS_WRITE_TOKEN`, and core-site recreation.

- [ ] **Step 3: Add observed failure signatures and reversible fixes**

Cover missing compose file due to wrong directory, Docker apt source interpolation, existing Postgres password mismatch, missing credential key, web CommonJS startup, CMS uploads directory, content 401, backend DNS, and high CPU during parallel builds.

- [ ] **Step 4: Verify the new runbook**

Run: `git diff --check && rg -n -S "ghp_|github_pat_|BEGIN .*PRIVATE|CMS_ADMIN_PASSWORD_HASH=\\$2" docs/runbooks/dev-vps-operations.md`

Expected: no formatting errors and no committed credentials.

### Task 3: Commit documentation

**Files:**
- Modify: `docs/runbooks/ubuntu-dev-vps.md`
- Create: `docs/runbooks/dev-vps-operations.md`

- [ ] **Step 1: Review changed documentation**

Run: `git diff -- docs/runbooks/ubuntu-dev-vps.md docs/runbooks/dev-vps-operations.md`

Expected: the installation and recovery responsibilities do not overlap excessively and all command paths are under `/srv/turni`.

- [ ] **Step 2: Commit the verified documentation**

Run: `git add docs/runbooks/ubuntu-dev-vps.md docs/runbooks/dev-vps-operations.md && git commit -m "docs: record dev vps operations"`
