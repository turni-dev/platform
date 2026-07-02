# S1 E1 UI Foundation Design

## Goal

Provide stable semantic design-token names and accessible React primitives while
leaving final brand values available for designer review.

## Scope

- CSS variables for surfaces, text, borders, accent, success, warning, danger,
  typography, spacing, focus, and radii.
- `Button`, `Input`, and `Badge` primitives with refs and native attributes.
- No visible copy, Tailwind classes, application state, or icon implementation.
- Widget consumers import tokens only through a dedicated stylesheet export.
