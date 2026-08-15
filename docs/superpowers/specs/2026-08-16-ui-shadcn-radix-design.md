# UI kit: shadcn/Radix foundation

**Card:** `Доска MVP-1` → `С1 [E6] packages/ui`

## Goal

Make `packages/ui` the isolated shared source of presentational, accessible UI
primitives for the cabinet and future landing layer. The package uses the
shadcn/Radix approach internally; Tailwind remains confined to this package.
Every visual decision remains themeable through `--turni-*` CSS custom
properties.

## Scope

- Add the smallest shadcn-compatible component infrastructure in
  `packages/ui`: class-name composition and a `Slot`-based primitive boundary.
- Reimplement the existing public `Button`, `Input`, and `Badge` as dumb
  primitives, preserving their exported names and native-element semantics.
- Keep the supported variants deliberately small: button `primary` and
  `secondary`; badge `neutral`, `success`, `warning`, and `danger`; input
  invalid state.
- Keep CSS and Tailwind implementation details private to `packages/ui`.
- Move the UI tests to `packages/ui/src/__tests__/` and test rendered
  accessibility attributes plus token-only theming.

## Non-goals

- No cabinet-specific components, marketing sections, form state, data
  fetching, or copy.
- No visual redesign or designer-owned token changes.
- No change to contracts, database schema, application code, or the widget.
- No Tailwind use outside `packages/ui`.

## Architecture

`packages/ui` owns the component source and its internal styling. Consumers
import the stable public exports only. Component class lists may use Tailwind
utilities internally, but their color, spacing, radius, typography, focus, and
state values resolve via semantic `--turni-*` variables from `tokens.scss`.
Consumers theme the kit by overriding those variables; they never need to
fork component classes or supply a Tailwind theme.

The primitives forward refs, retain native HTML elements by default, preserve
consumer `className`, and expose visual state as explicit typed props or
standard ARIA attributes. Radix `Slot` is used only where composition is
needed, keeping application behavior and vendor types out of the public API.

## Behaviour and accessibility

- `Button` defaults to `type="button"`, passes native attributes through, and
  has a visible focus state and disabled semantics.
- `Input` remains a native input and maps `invalid` to `aria-invalid="true"`.
- `Badge` remains non-interactive and carries its semantic tone via a data
  attribute.
- No Russian UI strings are added; therefore no component bypasses the
  application i18n dictionary.

## Verification

1. Focused red/green tests verify public markup, default button type, invalid
   input ARIA state, tone/variant state, class merging, and token-only visual
   references.
2. `ui` test, typecheck, and lint targets pass.
3. The repository lint rule confirms Tailwind utility classes remain confined
   to `packages/ui`.

## Risks and guards

- Hard-coded Tailwind palette values would make the landing unthemeable;
  implementation tests inspect styles for semantic token references.
- Shipping a broad generated shadcn catalogue would inflate scope; only the
  three existing primitives are converted.
- Vendor implementation types must not become consumer API; public props are
  React-native attributes and local union types only.
