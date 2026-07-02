# S1 E1 Contracts And Ports Design

## Goal

Define stable vendor-neutral integration boundaries. Runtime DTO schemas are
the source of TypeScript types; vendor SDK types remain inside adapters.

## Ownership

- `@turni/contracts`: messenger, payments, storage, notifications, booking,
  CMS, email, provisioning, calendar, and speech boundaries.
- `@turni/llm`: LLM and embedding boundaries, per repository architecture.

## Rules

- Every structured input and output has a strict Zod schema and `z.infer` type.
- Raw webhook payloads enter as `unknown` and are parsed by adapters.
- Money uses decimal strings plus ISO currency, never floating-point numbers.
- Port methods are asynchronous and expose only Turni DTOs.
- Adding a vendor requires an adapter, not a port change.

## Delivery Slices

1. Common identifiers, MessengerPort, and PaymentPort.
2. BlobPort, NotifyPort, EmailPort, and CmsPort.
3. BookingSystemPort, BotProvisionerPort, CalendarPort, and SpeechPort.
4. LlmPort and EmbeddingPort in `@turni/llm`.
