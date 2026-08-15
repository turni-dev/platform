# UI kit application integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing shared textarea primitive and migrate the current web and core-site controls to the tokenized `@turni/ui` package.

**Architecture:** `packages/ui` remains the only Tailwind source; apps import its tokens through Sass and its controls through the package alias. Existing page handlers, i18n strings, routes, and layout SCSS remain unchanged except for obsolete native-control rules. `Button asChild` uses direct variant classes and rejects disabled composition at the type boundary.

**Tech Stack:** React 19, Next.js 16, TypeScript, Sass, Tailwind v4, Radix Slot, Vitest, Nx.

---

## File map

- Modify `packages/ui/src/index.tsx`, `packages/ui/src/__tests__/primitives.spec.tsx`, and `packages/ui/src/tokens.scss` for the safe Button API and new `Textarea`.
- Modify `packages/ui/package.json` and `tsconfig.base.json` so app imports resolve to the source package.
- Modify `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.scss`, `apps/web/src/app/(auth)/auth-forms.tsx`, `apps/web/src/app/(cabinet)/dashboard/sign-out-button.tsx`, `apps/web/src/app/(cabinet)/agent/create-agent-button.tsx`, `apps/web/src/app/(cabinet)/agent/markdown-editor.tsx`, and `apps/web/src/app/(cabinet)/agent/knowledge/knowledge-controls.tsx` for shared controls.
- Modify `apps/web/src/app/(auth)/auth.module.scss` and `apps/web/src/app/(cabinet)/cabinet.module.scss` only to remove rules made obsolete by shared controls.
- Create `apps/web/src/__tests__/ui-integration.spec.tsx` for consumer import/control contracts.
- Modify `apps/core-site/src/app/layout.tsx`; rename `apps/core-site/src/app/globals.css` to `apps/core-site/src/app/globals.scss`; modify `apps/core-site/src/app/page.tsx` and add `apps/core-site/src/app/__tests__/page.spec.tsx`.

### Task 1: Harden Button and add Textarea

- [ ] Write one failing test for direct variant classes when an `asChild` anchor supplies a conflicting `data-variant`, one type-level rejection of `disabled` with `asChild`, and Textarea forwarding/invalid ARIA.
- [ ] Run `npm run nx -- test ui` and `npm run nx -- typecheck ui`; verify the new assertions fail before production edits.
- [ ] Implement `ButtonProps` as a discriminated union (`asChild: true` excludes `disabled`; native mode keeps it), select variant classes directly rather than through child-overridable data selectors, and add `Textarea` with Input-equivalent classes/ref/invalid prop.
- [ ] Update package exports and the TypeScript path alias to resolve `packages/ui/src/index.tsx`; preserve existing token exports.
- [ ] Run `npm run nx -- test ui`, `npm run nx -- typecheck ui`, and `npm run nx -- lint ui`; commit `feat(ui): add textarea and safe button composition`.

### Task 2: Migrate web controls

- [ ] Add a failing `apps/web/src/__tests__/ui-integration.spec.tsx` that imports `Button`, `Input`, and `Textarea` from `@turni/ui` and asserts the migrated source files contain no native controls for the migrated roles while preserving representative `name`, `required`, `pattern`, `inputMode`, `autoComplete`, and disabled props.
- [ ] Run `npm run nx -- test web --runInBand` (or the configured web Vitest target) and verify the new contract fails because pages still render native controls.
- [ ] Replace each current native `button` with `Button`, each current `input` with `Input`, and the markdown `textarea` with `Textarea`; keep labels, handlers, state, attributes, and translated children byte-for-byte equivalent.
- [ ] Import `@turni/ui/tokens.scss` from `apps/web/src/app/globals.scss`; remove only `.input`, `.submit`, `.secondary`, and editor input/textarea declarations now supplied by the kit.
- [ ] Run `npm run nx -- test web`, `npm run nx -- typecheck web`, `npm run nx -- lint web`, and `npm run nx -- build web`; commit `feat(web): use shared ui controls`.

### Task 3: Integrate core-site

- [ ] Add a failing core-site source/render test asserting the home page imports and renders `Button` with `asChild` around the CTA anchor and that globals use the shared token stylesheet.
- [ ] Run the core-site focused test and verify it fails before the integration.
- [ ] Rename `globals.css` to `globals.scss`, add `@use '@turni/ui/tokens.scss';`, import the renamed file from the layout, and render the existing home-page message with a translated-free static CTA anchor to `https://app.turni.ru/login` through `Button asChild`.
- [ ] Run `npm run nx -- typecheck core-site`, `npm run nx -- lint core-site`, and `npm run nx -- build core-site`; commit `feat(core-site): consume shared ui kit`.

### Final verification

- [ ] Run `npm run nx -- test ui`, `npm run nx -- typecheck ui`, `npm run nx -- lint ui`, `npm run nx -- test web`, `npm run nx -- typecheck web`, `npm run nx -- lint web`, `npm run nx -- build web`, `npm run nx -- typecheck core-site`, `npm run nx -- lint core-site`, and `npm run nx -- build core-site`.
- [ ] Run `git diff --check` and verify `git status --short` shows only the unrelated concurrent VK/backend files; do not stage or alter them.

## Self-review

- Spec coverage: Tasks 1–3 cover Textarea, safe asChild semantics, package resolution, web migration, core-site token/CTA integration, tests, and both production builds.
- Placeholder scan: no TODO/TBD/deferred steps remain.
- Type consistency: `Button`, `Input`, and `Textarea` are imported from the same `@turni/ui` package in all consumers; `asChild` is enabled only for anchor-like composition and cannot receive `disabled`.
