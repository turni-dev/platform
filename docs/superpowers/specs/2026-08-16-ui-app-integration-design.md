# UI kit: application integration extension

**Card:** `Доска MVP-1` → `С1 [E6] packages/ui`

## Goal

Make the established tokenized UI kit the actual shared control layer of the
two existing Next.js applications, without changing page behaviour, copy,
routing, or the current visual direction.

## Scope

- Add `Textarea` to `@turni/ui` with the same native/ref/invalid-state contract
  as `Input`.
- Make `@turni/ui` resolvable from TypeScript application code and import its
  token stylesheet from both applications' root global styles.
- Replace every current native `button`, `input`, and `textarea` in
  `apps/web/src` with `Button`, `Input`, and `Textarea`, preserving handlers,
  HTML attributes, names, labels, validation, disabled states, and all
  next-intl-provided visible strings.
- Use `Button` as the existing `core-site` home-page CTA, with a normal anchor
  child and no client-side behaviour.
- Remove only the obsolete control declarations from the two web SCSS modules;
  retain application layout and page-specific SCSS.

## Non-goals

- No `Label`, `Alert`, `Card`, `Select`, modal, menu, or marketing-section
  component: none is required by the current pages.
- No visual redesign, user-facing copy change, route change, client-state
  change, or i18n catalog change.
- No changes outside `packages/ui`, `apps/web`, `apps/core-site`, root path
  resolution, and focused tests.

## Architecture

`packages/ui` stays the sole Tailwind source. Both applications import only
the token stylesheet into their global styles and use typed React exports for
controls; their own SCSS modules remain responsible for layout and local
composition. `Textarea` shares the Input contract rather than introducing a
form-state abstraction.

`Button` variants compile to direct token-backed utility classes, so an
`asChild` anchor cannot change the selected visual variant by supplying a
conflicting data attribute. `asChild` is an enabled composition mode only:
the public TypeScript props reject `disabled` in that mode instead of emitting
an unsafe, still-navigable disabled anchor.

The core site validates static consumption with `Button asChild`, whose anchor
targets the existing owner-login surface at `https://app.turni.ru/login`.
The web cabinet and auth flows keep their current local interactions; replacing
the element source is not an authorization or networking change.

## Accessibility and safety

- Native labels retain their `htmlFor`/`id` links; required, autocomplete,
  pattern, input-mode, and disabled attributes pass through unchanged.
- Error elements keep their existing `role="alert"` behaviour.
- The CTA is a true anchor, not a click handler pretending to be a link.
- A disabled action remains a native button; a disabled link-like child is a
  type error rather than a misleading interactive anchor.
- No user-entered text, authentication data, secrets, or API contracts change.

## Verification

1. Add failing package tests for `Textarea` forwarding and invalid ARIA state.
   Add regression tests that prove an `asChild` child cannot change a selected
   visual variant and that `asChild` cannot accept `disabled` at typecheck.
2. Add focused web/core-site render or source-contract tests proving imports
   use the shared controls and no matching native controls remain.
3. Run package/UI and both app test/typecheck/lint targets, then production
   builds of `web` and `core-site`.
4. Confirm the only changes outside `packages/ui` are the explicitly listed
   consumer integration files; leave concurrent VK work untouched.

## Risks and guards

- Replacing a native control can lose an HTML attribute; migration tests assert
  representative auth and editor attributes before the replacement.
- Importing UI global styles can reset applications; the kit deliberately
  omits Tailwind Preflight and applications import tokens only.
- Core-site does not have a local login route; the CTA uses the canonical app
  domain rather than a broken relative link.
