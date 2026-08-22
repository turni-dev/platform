# Site Illustrations and Mock Screenshots

## Why

Referenced landing/product pages lean heavily on illustration for visual weight — without it the site's built-out block layout still reads as empty and cheap. Half of this card is already done (prompt sheet + `blocks.illustration` slot + media-library field on `parts.media`, commit 8dfd1ab, 2026-08-18); the remaining half is wiring the three generated illustrations into the live pages, generating the two missing slots, and building a reusable mock-screenshot component.

## What Changes

- Upload the three already-generated illustrations (`flow-message-to-calendar`, `hub-integrations`, `private-perimeter`) to the CMS media library and place them in the corresponding `blocks.illustration` slots on the live pages.
- Generate the two remaining illustration slots (empty catalog state, "thank you" page) using the existing prompt sheet (`docs/context/design-ux.md` → corp-site illustrations).
- Build a reusable mock-screenshot component for product pages.

## Impact

- Affected: `apps/core-site` (CMS media entries, page block content), no schema change (the `parts.media` migration already landed).
- Not affected: backend, contracts, other apps.
