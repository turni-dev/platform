# VK Community Channel Design

## Goal

Give an owner a guest channel that works from Russian hosting: paste a VK community access key in the cabinet, and a guest writing to that community receives a policy-checked answer built from the FAQ the owner already edits in the cabinet.

## Why VK and not Telegram or MAX

Telegram was the M1 channel until 16.08.2026. It is dropped for an infrastructure reason, not a product one: outbound calls to the Bot API from Russian hosting need a VPN or proxy, which turns a channel card into an egress card. MAX is worse for us today — since August 2025 its bot tokens are issued only to verified Russian legal entities; sole proprietors, the self-employed and individuals cannot register at all, and we have no legal entity yet. A VK community is created by an individual and its API is reachable from Russian hosting, so VK is the only one of the three that blocks on neither.

Both remain reachable later. Every provider sits behind the existing `MessengerPort`, so a second channel is an adapter plus a webhook route, and MAX in particular mirrors the Telegram Bot API almost method for method.

## Boundaries

Vendor payloads live only in `platform/integrations/vk` behind `MessengerPort`, the port `FakeMessenger` already implements. The adapter owns three provider-specific concerns: parsing a callback body, confirming the server address, and sending a reply. Everything else — deduplication, guest and conversation resolution, message persistence, the answer pipeline — is a channel-agnostic service in `modules/channels`, so the next provider does not touch it.

The cabinet routes live behind `OwnerRequestGuard`, the same entrance the agent routes use. The callback route is public and authenticated by the shared secret instead.

Row-level security forces one design decision: the callback URL carries a signed routing key holding tenant and connection, not a raw connection id, because `withTenant` needs a tenant before any row can be read. This mirrors `WidgetRoutingKeyService`.

## Data

Migration `0016_vk_channel.sql`:

- `channel_connections.type` and `webhook_inbox.source` accept `'vk'`, added as `NOT VALID` then validated, so neither table takes a long lock.
- `CREATE UNIQUE INDEX CONCURRENTLY guests_tenant_channel_ref_uidx ON guests (tenant_id, (meta->>'channel_ref')) WHERE meta ? 'channel_ref'`, outside a transaction.

A guest is keyed by `meta.channel_ref` shaped `<channel>:<external id>` (`vk:123456`), so one index serves every future channel. Phone identification stays untouched and will merge into the same guest by `phone_hash` when its own card lands.

No column is added. The community access key goes to `credentials_enc` through `SecretCipher`; the secret we generate for VK goes to `webhook_secret`; `group_id`, `group_name` and the confirmation code go to `meta`.

Shared contracts change once: `MessengerConnectionSchema.type` gains `'vk'`. Migration and contracts both need founder review.

## Connection wizard

The owner pastes a community access key and nothing else. The backend then calls VK four times: `groups.getById` validates the key and yields the community name, `groups.getCallbackConfirmationCode` stores the code, `groups.addCallbackServer` registers our callback URL with a freshly generated secret, and `groups.setCallbackSettings` enables `message_new`. VK immediately calls the URL with `type: confirmation`; answering with the stored code moves the connection from `pending` to `active`.

A decrypted key never returns to the UI or to an event. The cabinet sees the community name and the status; `channel.connected` carries connection and group ids only.

## Inbound

A callback request is answered `ok` with status 200, which is what VK requires. Before that:

1. The `secret` field is compared timing-safe against `webhook_secret`; a mismatch is 403 and writes nothing.
2. `webhook_inbox` takes a row keyed `(source='vk', external_id=event_id)`. An event already `processed` returns `ok` without answering the guest twice.
3. The guest is found or created by `meta.channel_ref`, then the conversation for that connection, then the guest message.
4. `FaqChatPipeline` produces a completed reply — policy first, FrontLine only on `auto`.
5. The reply is sent with a `random_id` derived deterministically from `event_id`, so a VK retry cannot deliver a second copy, then the inbox row becomes `processed`.

A failure marks the row `failed` and answers 500. VK retries on its own schedule (10 s, 3 min, 10 min, 30 min, 1 h) and the retry is allowed to claim a `received` or `failed` row, so the external retry mechanism replaces a queue for now. A queue becomes necessary when an answer involves an LLM and holds an HTTP worker for seconds; that is a separate card.

## Answer

A reader turns the agent's existing `knowledge/faq.md` in `memory_files` into FrontLine entries: a `##` heading is the question, the text under it is the answer. The owner edits that file in the cabinet built by the previous card. No match, or any non-`auto` policy verdict, yields the existing safe handoff text.

## Testing

Adapter tests cover the Zod vendor boundary, key validation, callback parsing and `random_id` derivation. Service tests cover deduplication including the retry-after-failure path, guest and conversation reuse, tenant isolation, and metadata-only events. An end-to-end test covers address confirmation, a normal message answered from the FAQ, a duplicate `event_id` answered once, an allergen question reaching only the safe handoff, and a wrong secret writing nothing. Live verification runs against real Postgres; a real VK community needs a public HTTPS domain, so it runs through a tunnel and is reported as such.

## Exclusions

Telegram and MAX adapters, an egress proxy, a BullMQ queue, phone identification, semantic cache, LLM-generated answers and owner notifications stay out. So does any public ingress work: `ops/` still has no HTTPS entry point, and giving it one is its own card.
