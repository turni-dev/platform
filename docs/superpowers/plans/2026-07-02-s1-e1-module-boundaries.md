# S1 E1 Module Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the current Nx dependency direction through ESLint.

**Architecture:** Project tags describe roles; the official Nx ESLint rule checks imports against a small dependency matrix. A forbidden contracts-to-backend import proves the rule changes behavior.

**Tech Stack:** Nx 21, ESLint 9 flat config, TypeScript

---

### Task 1: Prove the missing boundary

**Files:**
- Create temporarily: `packages/contracts/src/module-boundary.violation.ts`

- [x] Add a contracts-to-backend relative import and run ESLint.
- [x] Verify the current lint incorrectly exits 0.

### Task 2: Enforce and verify boundaries

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Install `@nx/eslint-plugin` with npm.
- [x] Configure `type:app` and `type:boundary` dependency constraints.
- [x] Verify the violating import fails with `@nx/enforce-module-boundaries`.
- [x] Remove the temporary fixture and run all Nx checks.
- [x] Commit and synchronize the Obsidian card.
