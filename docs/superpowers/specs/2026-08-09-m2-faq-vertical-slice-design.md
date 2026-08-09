# M2 FAQ Vertical Slice Design

## Goal

Deliver one observable guest FAQ path in which policy is impossible to bypass: validated widget message, policy verdict, deterministic FAQ response or safe fallback, and redacted audit event.

## Chosen approach

The slice composes the existing PolicyCascade, FrontlineWorkflow, and DomainEventBus. A new application service accepts tenant, guest, correlation and event UUIDv7 values supplied by its boundary. It evaluates policy first; only auto is allowed to consult FrontLine. It emits metadata-only domain events and returns a completed response, never an LLM token stream.

The WebSocket connection receives an optional injected async handler. It keeps guest-session validation and idempotency, then appends the handler's completed server events. HTTP passes this handler from its composition options. No runtime FAQ configuration, database migration, or shared-contract change is introduced in this slice.

## Outcomes

- Exact FAQ after auto policy: configured answer and frontline.answered.
- Unknown FAQ after auto policy: fixed safe handoff text and frontline.out_of_kb.
- Any non-auto policy verdict: fixed safe handoff text and risk.assessed; FrontLine is not called.
- Handler errors: the connection returns no sensitive content and preserves its established protocol behavior.

## Testing

Application tests prove policy-first ordering, tenant isolation, metadata-only audit events, and no FrontLine call on non-auto verdicts. Connection and HTTP tests prove a completed agent event is delivered only after a valid resumed session and message deduplication still holds. A focused end-to-end test covers FAQ success and an allergen-policy negative path.

## Exclusions

Live FAQ persistence, LLM generation, approvals persistence, semantic cache, prompt DB, and Drizzle event composition remain separate cards. The full cards remain open after this vertical slice.
