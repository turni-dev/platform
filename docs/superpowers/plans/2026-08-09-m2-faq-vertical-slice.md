# M2 FAQ Vertical Slice Implementation Plan

Goal: prove one policy-protected FAQ scenario from a widget message to a completed guest reply and metadata-only event.

Architecture: FaqChatPipeline evaluates policy before FrontLine and publishes only safe event metadata. A widget connection accepts an injected completed-message handler, and the HTTP entrypoint forwards its optional composition callback. No contract, migration, database, or LLM runtime changes are needed.

### Task 1: Policy-protected FAQ pipeline

Files:
- Create apps/backend/src/modules/chat/application/faq-chat-pipeline.ts
- Test apps/backend/src/modules/chat/application/__tests__/faq-chat-pipeline.spec.ts

- [x] Test exact FAQ after auto, safe handoff for unknown FAQ, and allergen policy result that never queries FrontLine.
- [x] Run the focused test RED.
- [x] Implement injected policy evaluator, FrontLine workflow and event bus. Inputs carry UUIDv7 tenant, guest, event and correlation IDs; published props contain only verdict/count metadata, never user text.
- [x] Run focused tests, backend typecheck and lint.

### Task 2: Completed widget-message handler

Files:
- Modify apps/backend/src/modules/channels/application/widget-chat-connection.ts
- Move test to apps/backend/src/modules/channels/application/__tests__/widget-chat-connection.spec.ts

- [x] Add a RED test for an injected asynchronous handler whose completed agent reply is appended after the accepted guest message.
- [x] Make receive asynchronous, retain session validation/deduplication, and call the handler only for accepted message.send events.
- [x] Run focused tests, backend typecheck and lint.

### Task 3: HTTP composition and end-to-end scenario

Files:
- Modify apps/backend/src/entrypoints/http/app.ts
- Test apps/backend/src/entrypoints/http/__tests__/faq-chat.e2e.spec.ts

- [x] Test WebSocket session receives a completed FAQ reply from injected handler and an allergen negative path returns only safe handoff.
- [x] Run the focused test RED.
- [x] Add an optional typed widget-message handler to HTTP composition and pass it to each connection. Do not expose tokens, secrets, or user text in logs.
- [x] Run focused tests, backend typecheck and lint.

## Completion checks

- [x] Review tracks for policy bypass, PII in events, and cross-module infrastructure imports.
- [x] Run backend/llm test, typecheck, lint, eval, diff check, and source-artifact scan.
- [x] Commit verified slice and record only this slice as complete on the M2 card: 3d176e2.
