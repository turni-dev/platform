# W1 guest chat widget design

**Goal:** Deliver a small, safe embeddable guest-chat widget that talks only to Turni's native WebSocket boundary.

## Decisions

- The widget is a vanilla TypeScript custom element, mounted in a Shadow DOM. It has no Socket.IO, voice/TTS, developer-ai contracts, browser-persisted text, or token persistence.
- A guest session is server-issued. The server owns the conversation identifier and sends the short-lived WebSocket credential to the widget only for the active connection. The widget keeps that credential in memory and destroys it with its temporary message queue on explicit disconnect.
- `WidgetChatTransport` sends `session.resume` before queued guest messages, accepts only `WidgetServerEventSchema` events, reconnects after a bounded backoff, and exposes only complete events to the UI.
- User and agent content is rendered as text, never interpolated with `innerHTML`. Consent is presented before optional phone collection and its callback contains no raw guest content.
- The first UI slice covers Russian greeting, quick actions, send input, typing, offline/retry and consent notice. It receives completed, policy-checked answers only; policy enforcement remains server-side.

## Tracks

1. Transport: connection lifecycle, validation, queue and memory cleanup.
2. Widget element: isolated Shadow-DOM UI and safe text rendering.
3. Consent and state model: Russian state messages and a content-free consent callback.
4. Delivery guard: bundle-size measurement and CI enforcement at 70 KB gzip.

## Acceptance criteria

- A host page can define `turni-chat-widget` without CSS leaking across the Shadow DOM boundary.
- Native WebSocket messages validate against `@turni/contracts`; invalid events are dropped and streamed deltas are not part of this public boundary.
- Guest messages wait in memory until the socket opens, reconnect after unexpected closure, and all credentials/text are erased on explicit disconnect.
- The element renders untrusted content with DOM text nodes, exposes consent before phone collection, and sends no raw PII through the consent callback.
- The built widget gzip size is at most 70 KB, verified in CI.

## Resolved ambiguity

The board W1 text previously said to exclude JWT/chatId. This design narrows that exclusion to *externally supplied or browser-persisted* identifiers and credentials. Server-issued conversation identity and a short-lived in-memory WS credential remain required for guest ownership isolation.
