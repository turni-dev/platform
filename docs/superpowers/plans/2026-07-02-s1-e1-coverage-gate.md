# S1 E1 Coverage Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce at least 80% test coverage for every current Nx project locally and in CI.

**Architecture:** Keep threshold policy in the shared Vitest config. Each Nx target supplies its own source include glob and isolated report directory so uncovered production files count and parallel tasks cannot overwrite reports.

**Tech Stack:** Nx, Vitest 4, V8 coverage, npm, GitHub Actions

---

### Task 1: Install and scope the coverage provider

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/backend/project.json`
- Modify: `packages/contracts/project.json`
- Modify: `vitest.config.ts`

- [x] **Step 1: Run `npm run coverage` and verify RED**

Expected: fail because `@vitest/coverage-v8` is not installed.

- [x] **Step 2: Install dependencies with npm**

Run: `npm install`
Expected: lockfile contains the coverage provider compatible with Vitest 4.

- [x] **Step 3: Run the project coverage targets**

Run: `$env:NX_DAEMON='false'; npm run coverage`
Expected: both projects pass all four 80% thresholds and write isolated reports.

### Task 2: Verify the CI quality gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/adr/0004-coverage-gate.md`

- [x] **Step 1: Run all local CI-equivalent checks**

Run: `$env:NX_DAEMON='false'; npm run nx -- run-many -t test lint typecheck coverage build`
Expected: all targets pass.

- [x] **Step 2: Validate repository output**

Run: `git diff --check`
Expected: no output and exit code 0.

- [x] **Step 2a: Prevent compiled tests from running twice**

Run: `$env:NX_DAEMON='false'; npm run nx -- run-many -t build test`
Expected: build output contains no spec files and backend reports two source test files with four tests.

- [x] **Step 3: Commit the completed card**

Run: `git add . && git commit -m "test: enforce coverage gate"`
Expected: commit is created after all verification commands pass.
