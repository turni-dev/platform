# VK Community Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner pastes a VK community access key in the cabinet and a guest writing to that community receives a policy-checked answer built from the FAQ the owner edits in the cabinet.

**Architecture:** VK payloads live only in `platform/integrations/vk` behind the existing `MessengerPort`. Deduplication, guest and conversation resolution, persistence and the answer pipeline live in a channel-agnostic service in `modules/channels`, so the next provider is an adapter plus a route. The callback URL carries an HMAC routing key holding tenant and connection, because RLS needs a tenant before any row can be read.

**Tech Stack:** TypeScript (strict), Fastify via NestJS, Drizzle over `postgres`, Zod at every boundary, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-vk-channel-design.md`

## Global Constraints

- Branch is `feat/vk-channel`; the spec commit `a30d0a1` is already on it.
- No `any`, no floating promises; `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- Tests go in a sibling `__tests__/` directory. Never colocate `*.spec.*` with production code — the exception in `entrypoints/http` is pre-existing, do not copy it.
- Every HTTP, queue, env and vendor boundary is validated with Zod; `packages/contracts` is the only shared type source.
- Tenant data is reached only through `withTenant`; no query runs outside it.
- The decrypted community key never reaches a log, an event, an error message or the UI.
- Domain events carry structure only — ids, counts, verdicts — never message text.
- Commands: `npm run nx -- run backend:test`, `backend:typecheck`, `backend:lint`, and the same for `contracts`.
- Migration files are named `NNNN_name.sql`, or `NNNN_name.concurrent.sql` when they must run outside a transaction.

---

### Task 1: VK API client and messenger adapter

**Files:**
- Create: `apps/backend/src/platform/integrations/vk/vk-api-client.ts`
- Create: `apps/backend/src/platform/integrations/vk/vk-callback.ts`
- Create: `apps/backend/src/platform/integrations/vk/vk-messenger.adapter.ts`
- Create: `apps/backend/src/platform/integrations/vk/index.ts`
- Test: `apps/backend/src/platform/integrations/vk/__tests__/vk-api-client.spec.ts`
- Test: `apps/backend/src/platform/integrations/vk/__tests__/vk-callback.spec.ts`
- Test: `apps/backend/src/platform/integrations/vk/__tests__/vk-messenger.adapter.spec.ts`

**Interfaces:**
- Consumes: `MessengerPort`, `InboundMessageSchema`, `OutboundMessage`, `CredentialValidation` from `@turni/contracts`.
- Produces:
  - `createVkMessenger(input: { accessKey: string; groupId: number; fetch?: FetchLike }): VkMessengerAdapter`
  - `class VkMessengerAdapter implements MessengerPort` with the port's four methods plus `confirmationCode(): Promise<string>`
  - `parseVkCallback(raw: unknown): VkCallback` where `VkCallback` is a discriminated union on `type`
  - `deriveRandomId(eventId: string): number`

- [ ] **Step 1: Write the failing callback-parsing test**

`__tests__/vk-callback.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseVkCallback } from '../vk-callback.js';

const confirmation = {
  type: 'confirmation',
  group_id: 1234,
  secret: 's3cret'
};

const messageNew = {
  type: 'message_new',
  event_id: 'e1b2c3',
  group_id: 1234,
  secret: 's3cret',
  object: {
    message: { from_id: 777, peer_id: 777, text: 'Когда вы работаете?' }
  }
};

describe('parseVkCallback', () => {
  it('reads a confirmation request', () => {
    expect(parseVkCallback(confirmation)).toEqual({
      type: 'confirmation',
      groupId: 1234,
      secret: 's3cret'
    });
  });

  it('reads a new message and drops every field we do not use', () => {
    expect(parseVkCallback(messageNew)).toEqual({
      type: 'message_new',
      eventId: 'e1b2c3',
      groupId: 1234,
      secret: 's3cret',
      senderId: '777',
      peerId: '777',
      text: 'Когда вы работаете?'
    });
  });

  it('refuses an event we do not handle', () => {
    expect(() => parseVkCallback({ type: 'wall_post_new', group_id: 1 })).toThrow();
  });

  it('refuses a message without text', () => {
    expect(() =>
      parseVkCallback({ ...messageNew, object: { message: { from_id: 7, peer_id: 7 } } })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run nx -- run backend:test -- vk-callback`
Expected: FAIL, `vk-callback.js` does not exist.

- [ ] **Step 3: Write `vk-callback.ts`**

```ts
import { z } from 'zod';

/**
 * The only place a VK payload is understood. Everything past this file speaks
 * our own vocabulary, so a change on their side stops here.
 */
const ConfirmationSchema = z.object({
  type: z.literal('confirmation'),
  group_id: z.number().int().positive(),
  secret: z.string().min(1).optional()
});

const MessageNewSchema = z.object({
  type: z.literal('message_new'),
  event_id: z.string().min(1),
  group_id: z.number().int().positive(),
  secret: z.string().min(1).optional(),
  object: z.object({
    message: z.object({
      from_id: z.number().int(),
      peer_id: z.number().int(),
      text: z.string().min(1)
    })
  })
});

const VkCallbackSchema = z.discriminatedUnion('type', [
  ConfirmationSchema,
  MessageNewSchema
]);

export type VkCallback =
  | Readonly<{ type: 'confirmation'; groupId: number; secret?: string }>
  | Readonly<{
      type: 'message_new';
      eventId: string;
      groupId: number;
      secret?: string;
      senderId: string;
      peerId: string;
      text: string;
    }>;

export function parseVkCallback(raw: unknown): VkCallback {
  const parsed = VkCallbackSchema.parse(raw);

  if (parsed.type === 'confirmation') {
    return {
      type: 'confirmation',
      groupId: parsed.group_id,
      ...(parsed.secret === undefined ? {} : { secret: parsed.secret })
    };
  }

  return {
    type: 'message_new',
    eventId: parsed.event_id,
    groupId: parsed.group_id,
    ...(parsed.secret === undefined ? {} : { secret: parsed.secret }),
    senderId: String(parsed.object.message.from_id),
    peerId: String(parsed.object.message.peer_id),
    text: parsed.object.message.text
  };
}
```

- [ ] **Step 4: Run the test again**

Run: `npm run nx -- run backend:test -- vk-callback`
Expected: PASS, four tests.

- [ ] **Step 5: Write the failing API client test**

`__tests__/vk-api-client.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { VkApiClient, VkApiError } from '../vk-api-client.js';

function respond(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  ) as unknown as typeof fetch;
}

describe('VkApiClient', () => {
  it('sends the key in the body and never in the URL', async () => {
    const fetchMock = respond({ response: [{ id: 1, name: 'Кафе' }] });
    const client = new VkApiClient({ accessKey: 'secret-key', fetch: fetchMock });

    await client.call('groups.getById', { group_id: '1' });

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    expect(url).toBe('https://api.vk.ru/method/groups.getById');
    expect(String(url)).not.toContain('secret-key');
    expect(String(init.body)).toContain('access_token=secret-key');
  });

  it('turns a VK error into our error without carrying the key', async () => {
    const client = new VkApiClient({
      accessKey: 'secret-key',
      fetch: respond({ error: { error_code: 5, error_msg: 'User authorization failed' } })
    });

    const failure = await client.call('groups.getById', {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(VkApiError);
    expect((failure as VkApiError).code).toBe(5);
    expect(JSON.stringify(failure)).not.toContain('secret-key');
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm run nx -- run backend:test -- vk-api-client`
Expected: FAIL, module not found.

- [ ] **Step 7: Write `vk-api-client.ts`**

```ts
import { z } from 'zod';

export type FetchLike = typeof fetch;

const apiVersion = '5.199';
const apiBase = 'https://api.vk.ru/method';

const VkEnvelopeSchema = z.object({
  response: z.unknown().optional(),
  error: z
    .object({ error_code: z.number().int(), error_msg: z.string() })
    .optional()
});

/** Carries the code, never the key and never the request body. */
export class VkApiError extends Error {
  public constructor(
    public readonly method: string,
    public readonly code: number,
    message: string
  ) {
    super(`VK ${method} failed (${code}): ${message}`);
    this.name = 'VkApiError';
  }
}

export class VkApiClient {
  private readonly accessKey: string;
  private readonly fetch: FetchLike;

  public constructor(input: Readonly<{ accessKey: string; fetch?: FetchLike }>) {
    if (input.accessKey.trim().length === 0) {
      throw new Error('A VK access key is required');
    }
    this.accessKey = input.accessKey;
    this.fetch = input.fetch ?? fetch;
  }

  /** The key travels in the body: a URL ends up in access logs, a body does not. */
  public async call(
    method: string,
    parameters: Readonly<Record<string, string | number>>
  ): Promise<unknown> {
    const body = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(parameters).map(([name, value]) => [name, String(value)])
      ),
      access_token: this.accessKey,
      v: apiVersion
    });

    const response = await this.fetch(`${apiBase}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new VkApiError(method, response.status, 'transport failure');
    }

    const envelope = VkEnvelopeSchema.parse(await response.json());
    if (envelope.error !== undefined) {
      throw new VkApiError(method, envelope.error.error_code, envelope.error.error_msg);
    }

    return envelope.response;
  }

  /** Key material must not leak through a serialized client. */
  public toJSON(): string {
    return '[VkApiClient]';
  }
}
```

- [ ] **Step 8: Run the client test**

Run: `npm run nx -- run backend:test -- vk-api-client`
Expected: PASS.

- [ ] **Step 9: Write the failing adapter test**

`__tests__/vk-messenger.adapter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createVkMessenger, deriveRandomId } from '../vk-messenger.adapter.js';

const connection = {
  id: '01900000-0000-7000-8000-000000000001',
  type: 'vk'
} as const;

function client(responses: readonly unknown[]): {
  fetch: typeof fetch;
  bodies: () => readonly string[];
} {
  const bodies: string[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const body = responses[call] ?? { response: 1 };
    call += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  return { fetch: fetchMock as unknown as typeof fetch, bodies: () => bodies };
}

describe('VkMessengerAdapter', () => {
  it('validates a key and reports the community name', async () => {
    const transport = client([{ response: { groups: [{ id: 42, name: 'Кафе' }] } }]);
    const messenger = createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport.fetch });

    await expect(messenger.validateCredentials({ secret: 'k' })).resolves.toEqual({
      valid: true,
      identity: 'Кафе'
    });
  });

  it('reports an invalid key instead of throwing', async () => {
    const transport = client([{ error: { error_code: 5, error_msg: 'auth failed' } }]);
    const messenger = createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport.fetch });

    await expect(messenger.validateCredentials({ secret: 'k' })).resolves.toEqual({
      valid: false
    });
  });

  it('sends a reply to the recipient with a deterministic random_id', async () => {
    const transport = client([{ response: 908 }]);
    const messenger = createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport.fetch });

    const result = await messenger.send(connection, {
      conversationId: '01900000-0000-7000-8000-000000000002',
      recipientRef: '777',
      content: { type: 'text', text: 'Мы работаем с 10:00' }
    });

    expect(result).toEqual({ externalId: '908' });
    expect(transport.bodies()[0]).toContain('peer_id=777');
    expect(transport.bodies()[0]).toContain('random_id=');
  });

  it('derives the same random_id for the same event and a different one otherwise', () => {
    expect(deriveRandomId('event-a')).toBe(deriveRandomId('event-a'));
    expect(deriveRandomId('event-a')).not.toBe(deriveRandomId('event-b'));
    expect(deriveRandomId('event-a')).toBeLessThanOrEqual(2_147_483_647);
  });

  it('registers the callback server and enables message events on that server', async () => {
    const transport = client([{ response: { server_id: 3 } }, { response: 1 }]);
    const messenger = createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport.fetch });

    await messenger.setupWebhook(connection, {
      url: 'https://app.example/api/v1/webhooks/vk/key',
      secret: 'secret-that-is-long-enough'
    });

    expect(transport.bodies()[0]).toContain('url=https%3A%2F%2Fapp.example');
    expect(transport.bodies()[0]).toContain('secret_key=secret-that-is-long-enough');
    expect(transport.bodies()[1]).toContain('server_id=3');
    expect(transport.bodies()[1]).toContain('message_new=1');
  });

  it('reads the confirmation code', async () => {
    const transport = client([{ response: { code: 'abc123' } }]);
    const messenger = createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport.fetch });

    await expect(messenger.confirmationCode()).resolves.toBe('abc123');
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `npm run nx -- run backend:test -- vk-messenger`
Expected: FAIL, module not found.

- [ ] **Step 11: Write `vk-messenger.adapter.ts`**

`title` for `groups.addCallbackServer` is capped at 14 characters by VK, so it is the constant `'Turni'`.

```ts
import { createHash } from 'node:crypto';
import {
  InboundMessageSchema,
  MessengerConnectionSchema,
  MessengerCredentialsSchema,
  OutboundMessageSchema,
  type CredentialValidation,
  type InboundMessage,
  type MessengerConnection,
  type MessengerCredentials,
  type MessengerPort,
  type OutboundMessage,
  type SendMessageResult,
  type WebhookSetup
} from '@turni/contracts';
import { z } from 'zod';
import { parseVkCallback } from './vk-callback.js';
import { VkApiClient, VkApiError, type FetchLike } from './vk-api-client.js';

const GroupsByIdSchema = z.object({
  groups: z.array(z.object({ id: z.number().int(), name: z.string().min(1) })).min(1)
});
const ConfirmationCodeSchema = z.object({ code: z.string().min(1) });
const SentMessageIdSchema = z.number().int().positive();
const AddedServerSchema = z.object({ server_id: z.number().int().positive() });

/** VK wants a positive 32-bit integer; the same event must always map to the
 * same one, or a retry delivers the guest a second copy of the answer. */
export function deriveRandomId(eventId: string): number {
  return createHash('sha256').update(eventId).readUInt32BE(0) % 2_147_483_647;
}

export class VkMessengerAdapter implements MessengerPort {
  public constructor(
    private readonly client: VkApiClient,
    private readonly groupId: number
  ) {}

  public async validateCredentials(
    credentials: MessengerCredentials
  ): Promise<CredentialValidation> {
    MessengerCredentialsSchema.parse(credentials);

    try {
      const response = GroupsByIdSchema.parse(
        await this.client.call('groups.getById', { group_ids: this.groupId })
      );

      return { valid: true, identity: response.groups[0]!.name };
    } catch (error) {
      if (error instanceof VkApiError) {
        return { valid: false };
      }
      throw error;
    }
  }

  public async send(
    connection: MessengerConnection,
    message: OutboundMessage
  ): Promise<SendMessageResult> {
    MessengerConnectionSchema.parse(connection);
    const parsed = OutboundMessageSchema.parse(message);
    if (parsed.content.type !== 'text') {
      throw new Error('The VK channel sends text only in this slice');
    }

    const sent = SentMessageIdSchema.parse(
      await this.client.call('messages.send', {
        peer_id: parsed.recipientRef,
        message: parsed.content.text,
        random_id: deriveRandomId(`${parsed.conversationId}:${parsed.recipientRef}:${parsed.content.text}`)
      })
    );

    return { externalId: String(sent) };
  }

  public parseWebhook(raw: unknown): Promise<InboundMessage> {
    const callback = parseVkCallback(raw);
    if (callback.type !== 'message_new') {
      throw new Error('Only a new message becomes an inbound message');
    }

    return Promise.resolve(
      InboundMessageSchema.parse({
        externalId: callback.eventId,
        connectionId: undefined,
        senderId: callback.senderId,
        occurredAt: new Date().toISOString(),
        content: { type: 'text', text: callback.text }
      })
    );
  }

  public async setupWebhook(
    connection: MessengerConnection,
    setup: WebhookSetup
  ): Promise<void> {
    MessengerConnectionSchema.parse(connection);

    const added = AddedServerSchema.parse(
      await this.client.call('groups.addCallbackServer', {
        group_id: this.groupId,
        url: setup.url,
        title: 'Turni',
        secret_key: setup.secret
      })
    );

    await this.client.call('groups.setCallbackSettings', {
      group_id: this.groupId,
      server_id: added.server_id,
      message_new: 1
    });
  }

  public async confirmationCode(): Promise<string> {
    return ConfirmationCodeSchema.parse(
      await this.client.call('groups.getCallbackConfirmationCode', {
        group_id: this.groupId
      })
    ).code;
  }
}

export function createVkMessenger(
  input: Readonly<{ accessKey: string; groupId: number; fetch?: FetchLike }>
): VkMessengerAdapter {
  return new VkMessengerAdapter(
    new VkApiClient({
      accessKey: input.accessKey,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch })
    }),
    input.groupId
  );
}
```

Note for the implementer: `parseWebhook` needs `connectionId`, which the adapter does not know — a connection is resolved from the routing key in Task 4, which calls `parseVkCallback` directly. Give `parseWebhook` the connection through the adapter's constructor if that reads cleanly; otherwise let it reject with `'A VK callback is parsed by the route that knows its connection'` and record the decision in the commit body. Do not bend the inbound path around the port.

`deriveRandomId` takes any seed string, and `send` seeds it with the reply itself — conversation, recipient and text. A VK retry replays the same event, which produces the same reply, which produces the same `random_id`, so VK discards the second copy. Seeding from the event id would work equally well but would mean threading a provider's event id through a shared contract.

- [ ] **Step 12: Run the adapter tests**

Run: `npm run nx -- run backend:test -- vk-messenger`
Expected: PASS. The `send` and `recipientRef` tests fail until Task 2 lands the contract; if so, do Task 2 first and return here.

- [ ] **Step 13: Export the module**

`index.ts`:

```ts
export { createVkMessenger, VkMessengerAdapter, deriveRandomId } from './vk-messenger.adapter.js';
export { parseVkCallback, type VkCallback } from './vk-callback.js';
export { VkApiClient, VkApiError, type FetchLike } from './vk-api-client.js';
```

- [ ] **Step 14: Typecheck, lint, commit**

```bash
npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/platform/integrations/vk
git commit -m "feat(vk): add the VK community messenger adapter"
```

---

### Task 2: Contracts and migrations

**Files:**
- Modify: `packages/contracts/src/ports/messenger.ts`
- Create: `apps/backend/src/modules/channels/infrastructure/database/migrations/0016_vk_channel.sql`
- Create: `apps/backend/src/modules/channels/infrastructure/database/migrations/0017_guest_channel_ref.concurrent.sql`
- Modify: `apps/backend/src/modules/channels/infrastructure/database/schema.ts`
- Modify: `apps/backend/src/modules/channels/infrastructure/database/__tests__/migration.spec.ts`
- Modify: `apps/backend/src/platform/fakes/core-fakes.spec.ts` (the fake's outbound fixture gains `recipientRef`)

**Interfaces:**
- Produces: `'vk'` accepted by `MessengerConnectionSchema.type`; `OutboundMessageSchema.recipientRef: string`; the SQL objects `channel_connections_type_check`, `webhook_inbox_source_check`, `guests_tenant_channel_ref_uidx`.

This task changes shared contracts and the database. Per CODEOWNERS it needs founder review before merge — commit it separately so the review has one diff to read.

- [ ] **Step 1: Write the failing migration test**

Add to `__tests__/migration.spec.ts`:

```ts
const vkMigrationUrl = new URL('../migrations/0016_vk_channel.sql', import.meta.url);
const channelRefMigrationUrl = new URL(
  '../migrations/0017_guest_channel_ref.concurrent.sql',
  import.meta.url
);

describe('vk channel migration', () => {
  it('widens both checks without a long lock', async () => {
    const migration = await readFile(vkMigrationUrl, 'utf8');

    expect(migration).toContain('DROP CONSTRAINT channel_connections_type_check');
    expect(migration).toContain("type IN ('telegram', 'widget', 'vk')");
    expect(migration).toContain("source IN ('telegram', 'yookassa', 'vk')");
    expect(migration).toContain('NOT VALID');
    expect(migration).toContain('VALIDATE CONSTRAINT');
  });

  it('indexes the channel reference concurrently and channel-agnostically', async () => {
    const migration = await readFile(channelRefMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
    expect(migration).toContain("(meta ->> 'channel_ref')");
    expect(migration).not.toContain('vk_user_id');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run nx -- run backend:test -- migration`
Expected: FAIL, both files missing.

- [ ] **Step 3: Write `0016_vk_channel.sql`**

```sql
ALTER TABLE channel_connections
  DROP CONSTRAINT channel_connections_type_check;
ALTER TABLE channel_connections
  ADD CONSTRAINT channel_connections_type_check
  CHECK (type IN ('telegram', 'widget', 'vk')) NOT VALID;
ALTER TABLE channel_connections
  VALIDATE CONSTRAINT channel_connections_type_check;

ALTER TABLE webhook_inbox
  DROP CONSTRAINT webhook_inbox_source_check;
ALTER TABLE webhook_inbox
  ADD CONSTRAINT webhook_inbox_source_check
  CHECK (source IN ('telegram', 'yookassa', 'vk')) NOT VALID;
ALTER TABLE webhook_inbox
  VALIDATE CONSTRAINT webhook_inbox_source_check;
```

- [ ] **Step 4: Write `0017_guest_channel_ref.concurrent.sql`**

```sql
CREATE UNIQUE INDEX CONCURRENTLY guests_tenant_channel_ref_uidx
  ON guests (tenant_id, (meta ->> 'channel_ref'))
  WHERE meta ? 'channel_ref';
```

- [ ] **Step 5: Mirror both in `schema.ts`**

In `channelConnections`, the type check becomes ``sql`${table.type} in ('telegram', 'widget', 'vk')` ``. In `webhookInbox`, the source check becomes ``sql`${table.source} in ('telegram', 'yookassa', 'vk')` ``. In `guests`, add:

```ts
    uniqueIndex('guests_tenant_channel_ref_uidx')
      .on(table.tenantId, sql`(${table.metadata} ->> 'channel_ref')`)
      .where(sql`${table.metadata} ? 'channel_ref'`),
```

- [ ] **Step 6: Widen the contracts**

In `packages/contracts/src/ports/messenger.ts`:

```ts
export const MessengerConnectionSchema = z.strictObject({
  id: UuidSchema,
  type: z.enum(['telegram', 'widget', 'vk'])
});

export const OutboundMessageSchema = z.strictObject({
  conversationId: UuidSchema,
  /** Where the reply goes on the provider's side — a VK peer, a Telegram
   * chat. Our conversation id means nothing to them. */
  recipientRef: z.string().min(1),
  content: MessageContentSchema
});
```

- [ ] **Step 7: Fix the fake's fixture**

`core-fakes.spec.ts` builds an `OutboundMessage`; add `recipientRef: '777'` to it so the strict object still parses.

- [ ] **Step 8: Run everything touched**

Run: `npm run nx -- run contracts:test && npm run nx -- run backend:test -- migration schema core-fakes`
Expected: PASS.

- [ ] **Step 9: Apply the migrations to the live database and check them**

```bash
npm run db:migrate
```

Then confirm by hand: inserting a `channel_connections` row with `type='vk'` succeeds, and two `guests` rows in one tenant with the same `meta->>'channel_ref'` collide while the same value in another tenant does not. Delete the probe rows afterwards.

- [ ] **Step 10: Commit**

```bash
git add packages/contracts/src/ports/messenger.ts apps/backend/src/modules/channels/infrastructure/database apps/backend/src/platform/fakes/core-fakes.spec.ts
git commit -m "feat(channels): accept vk connections and index guests by channel reference"
```

---

### Task 3: Connection wizard

**Files:**
- Create: `apps/backend/src/modules/channels/application/webhook-routing-key.ts`
- Create: `apps/backend/src/modules/channels/application/channel-connection-repository.port.ts`
- Create: `apps/backend/src/modules/channels/infrastructure/database/postgres-channel-connection-repository.ts`
- Create: `apps/backend/src/modules/channels/application/vk-connection-service.ts`
- Create: `apps/backend/src/modules/channels/application/channel-analytics.ts`
- Create: `apps/backend/src/entrypoints/http/channel-routes.ts`
- Modify: `apps/backend/src/entrypoints/http/app.ts`
- Modify: `apps/backend/src/platform/env.ts` (adds `VK_WEBHOOK_SECRET`, `PUBLIC_WEBHOOK_ORIGIN`)
- Test: `apps/backend/src/modules/channels/application/__tests__/webhook-routing-key.spec.ts`
- Test: `apps/backend/src/modules/channels/application/__tests__/vk-connection-service.spec.ts`

**Interfaces:**
- Consumes: `SecretCipher`, `readSecretKeyRing('credentials')`, `OwnerRequestGuard`, `AgentRepositoryPort`, `DomainEventBus`, `createVkMessenger` from Task 1, `withTenant`.
- Produces:
  - `class WebhookRoutingKeyService { issue(claims: { tenantId: string; connectionId: string }): string; verify(key: string): { tenantId: string; connectionId: string } }`
  - `interface ChannelConnectionRepositoryPort { create(record: ChannelConnectionRecord): Promise<void>; findById(input: { tenantId: string; connectionId: string }): Promise<ChannelConnectionRecord | undefined>; activate(input: { tenantId: string; connectionId: string }): Promise<boolean>; findByTenant(tenantId: string): Promise<readonly ChannelConnectionSummary[]> }`
  - `class VkConnectionService { connect(input: { tenantId: string; userId: string; accessKey: string; groupId: number }): Promise<ChannelConnectionSummary>; list(tenantId: string): Promise<readonly ChannelConnectionSummary[]> }`
  - `ChannelConnectionSummary = { id: string; type: 'vk'; status: 'pending' | 'active' | 'error' | 'disabled'; communityName: string }`

- [ ] **Step 1: Write the failing routing-key test**

```ts
import { describe, expect, it } from 'vitest';
import { WebhookRoutingKeyService } from '../webhook-routing-key.js';

const secret = 'webhook-routing-secret-long-enough-for-hmac';
const claims = {
  tenantId: '01900000-0000-7000-8000-000000000010',
  connectionId: '01900000-0000-7000-8000-000000000011'
};

describe('WebhookRoutingKeyService', () => {
  it('round-trips its own key', () => {
    const service = new WebhookRoutingKeyService(secret);

    expect(service.verify(service.issue(claims))).toEqual(claims);
  });

  it('refuses a key signed by someone else', () => {
    const forged = new WebhookRoutingKeyService('another-secret-long-enough-for-hmac').issue(claims);

    expect(() => new WebhookRoutingKeyService(secret).verify(forged)).toThrow();
  });

  it('refuses a tampered payload', () => {
    const service = new WebhookRoutingKeyService(secret);
    const [, signature] = service.issue(claims).split('.');

    expect(() => service.verify(`tampered.${signature ?? ''}`)).toThrow();
  });

  it('refuses a short secret at construction', () => {
    expect(() => new WebhookRoutingKeyService('too-short')).toThrow();
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then write the service**

Model it on `widget-routing-key.ts`, but with no `expiresAt`: a callback URL registered with VK must keep working. Claims are exactly `tenantId` and `connectionId`, both `z.uuidv7()`.

Run: `npm run nx -- run backend:test -- webhook-routing-key`
Expected: FAIL, then PASS.

- [ ] **Step 3: Write the connection repository**

Follow `postgres-guest-session-store.ts` line for line: Zod row schemas, `withTenant` around every statement, no ORM query builder. `create` inserts `id, tenant_id, agent_id, type, credentials_enc, webhook_secret, status, meta`; `activate` moves `status` from `pending` to `active` and returns whether one row changed; `findById` and `findByTenant` select without `credentials_enc` unless the caller asks for the decryptable record, and the summary shape never carries it at all.

- [ ] **Step 4: Write the failing wizard test**

`__tests__/vk-connection-service.spec.ts` — use an in-memory repository, a `FakeDomainEventBus`, and a stub messenger recording its calls:

```ts
it('stores the key encrypted, registers the callback and stays pending until VK confirms', async () => {
  const summary = await service.connect({
    tenantId, userId, accessKey: 'community-key', groupId: 42
  });

  expect(summary).toEqual({ id: connectionId, type: 'vk', status: 'pending', communityName: 'Кафе' });
  expect(messenger.setupWebhookCalls).toHaveLength(1);
  expect(messenger.setupWebhookCalls[0]!.url).toContain('/api/v1/webhooks/vk/');
  const stored = repository.rows[0]!;
  expect(stored.credentialsEncrypted).not.toContain('community-key');
  expect(cipher.decrypt(stored.credentialsEncrypted!, tenantId)).toBe('community-key');
  expect(stored.metadata['confirmation_code']).toBe('abc123');
  expect(JSON.stringify(events.publishedEvents)).not.toContain('community-key');
});

it('refuses an invalid key without writing a row', async () => {
  messenger.valid = false;

  await expect(service.connect({ ...input, accessKey: 'bad' })).rejects.toThrow(InvalidChannelCredentialsError);
  expect(repository.rows).toHaveLength(0);
});
```

- [ ] **Step 5: Write `vk-connection-service.ts`**

Order matters and the test above pins it: validate the key, create the row as `pending` with the encrypted key and a freshly generated `webhook_secret` (32 random bytes, base64url), read the confirmation code into `meta`, then register the callback server with the routing URL and the secret. A failure after the row exists leaves it `pending`, which is honest — the owner can retry.

`channel.connected` carries `connectionId` and `groupId` only. Add `ChannelAnalytics` in the shape of `AgentConfigurationAnalytics`.

- [ ] **Step 6: Write the cabinet routes**

`channel-routes.ts` registers `GET /api/v1/channels` (`guard.read`) and `POST /api/v1/channels/vk` (`guard.mutate`) with a Zod body of `accessKey` and `groupId`. Refusals use `problems.ts`; an invalid key is `invalidRequest`, never a body that says why.

- [ ] **Step 7: Run the whole module, typecheck, lint, commit**

```bash
npm run nx -- run backend:test && npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git add apps/backend/src/modules/channels apps/backend/src/entrypoints/http apps/backend/src/platform/env.ts
git commit -m "feat(vk): connect a community from the cabinet"
```

---

### Task 4: Inbound callback

**Files:**
- Create: `apps/backend/src/modules/channels/application/webhook-inbox.port.ts`
- Create: `apps/backend/src/modules/channels/infrastructure/database/postgres-webhook-inbox.ts`
- Create: `apps/backend/src/modules/channels/application/guest-conversation-store.port.ts`
- Create: `apps/backend/src/modules/channels/infrastructure/database/postgres-guest-conversation-store.ts`
- Create: `apps/backend/src/modules/channels/application/inbound-message-service.ts`
- Create: `apps/backend/src/entrypoints/http/vk-webhook-routes.ts`
- Modify: `apps/backend/src/entrypoints/http/app.ts`
- Test: `apps/backend/src/modules/channels/application/__tests__/inbound-message-service.spec.ts`

**Interfaces:**
- Consumes: Task 3's `WebhookRoutingKeyService` and `ChannelConnectionRepositoryPort`, `FaqChatPipeline`, `MessengerPort`.
- Produces:
  - `interface WebhookInboxPort { claim(input: { source: string; externalId: string; payload: Record<string, unknown> }): Promise<'claimed' | 'duplicate'>; markProcessed(...): Promise<void>; markFailed(...): Promise<void> }`
  - `interface GuestConversationStorePort { resolveGuest(input: { tenantId: string; channelRef: string; guestId: string }): Promise<string>; resolveConversation(input: { tenantId: string; agentId: string; connectionId: string; guestId: string; conversationId: string }): Promise<string>; appendMessage(input: { tenantId: string; conversationId: string; messageId: string; role: 'guest' | 'agent'; content: string }): Promise<void> }`
  - `class InboundMessageService { handle(input: InboundChannelMessage): Promise<'answered' | 'duplicate'> }`

- [ ] **Step 1: Write the failing service test**

The four behaviours to pin, each its own `it`:

```ts
it('answers a first-time guest and records both messages', async () => {
  await expect(service.handle(message)).resolves.toBe('answered');

  expect(messenger.sent).toHaveLength(1);
  expect(messenger.sent[0]!.message.content).toEqual({ type: 'text', text: 'Мы работаем с 10:00 до 22:00.' });
  expect(store.messages.map((row) => row.role)).toEqual(['guest', 'agent']);
});

it('treats a repeated event as a duplicate and answers nobody twice', async () => {
  await service.handle(message);
  await expect(service.handle(message)).resolves.toBe('duplicate');

  expect(messenger.sent).toHaveLength(1);
  expect(store.messages).toHaveLength(2);
});

it('lets a retry through after a failure', async () => {
  messenger.failOnce();

  await expect(service.handle(message)).rejects.toThrow();
  expect(inbox.statusOf(message.eventId)).toBe('failed');

  await expect(service.handle(message)).resolves.toBe('answered');
});

it('reuses the guest and the conversation on a second message', async () => {
  await service.handle(message);
  await service.handle({ ...message, eventId: 'event-2', text: 'ещё вопрос' });

  expect(store.guests).toHaveLength(1);
  expect(store.conversations).toHaveLength(1);
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run nx -- run backend:test -- inbound-message-service`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the inbox repository**

`claim` is a single statement, and the retry rule lives in it rather than in TypeScript:

```sql
INSERT INTO webhook_inbox (id, source, external_id, payload, status)
VALUES (${id}, ${source}, ${externalId}, ${payload}, 'received')
ON CONFLICT (source, external_id) DO UPDATE
  SET status = 'received', error = NULL
  WHERE webhook_inbox.status = 'failed'
RETURNING id
```

No row returned means the event is already `received` or `processed`, which is a duplicate; a returned row means this caller owns it. `webhook_inbox` has no tenant column and no RLS, so this one repository runs outside `withTenant` — say so in a comment above the class, because every neighbouring repository does the opposite.

- [ ] **Step 4: Write the guest and conversation store**

`resolveGuest` upserts on the new index:

```sql
INSERT INTO guests (id, tenant_id, meta)
VALUES (${guestId}, ${tenantId}, ${{ channel_ref: channelRef }})
ON CONFLICT (tenant_id, (meta ->> 'channel_ref')) WHERE meta ? 'channel_ref'
DO UPDATE SET last_seen_at = now()
RETURNING id
```

`appendMessage` takes `next_seq` from the conversation row and increments it inside the same transaction, honouring `messages_conversation_seq_uidx`.

- [ ] **Step 5: Write `inbound-message-service.ts`**

Provider-agnostic on purpose: its input is `{ tenantId, agentId, connectionId, channel: 'vk', eventId, senderRef, text, payload, occurredAt }` and a `MessengerPort` to answer through. Order: claim → resolve guest → resolve conversation → append guest message → `FaqChatPipeline.handle` → append agent message → `send` → `markProcessed`. Any throw marks `failed` and rethrows.

- [ ] **Step 6: Write the callback route**

`POST /api/v1/webhooks/vk/:routingKey`. Verify the routing key, load the connection under its tenant, `parseVkCallback` the body, compare `secret` with `timingSafeEqual` against `webhook_secret` — mismatch is `forbidden(reply)` and nothing is written. A `confirmation` returns `meta.confirmation_code` as `text/plain` and activates the connection. A `message_new` runs the service and returns the literal `ok`; a throw returns 500 with no detail, so VK retries.

- [ ] **Step 7: Run, typecheck, lint, commit**

```bash
npm run nx -- run backend:test && npm run nx -- run backend:typecheck && npm run nx -- run backend:lint
git commit -am "feat(vk): deliver inbound community messages through policy"
```

---

### Task 5: FAQ source, wiring and end-to-end

**Files:**
- Create: `apps/backend/src/modules/frontline/application/knowledge-faq-source.ts`
- Create: `apps/backend/src/modules/frontline/application/__tests__/knowledge-faq-source.spec.ts`
- Create: `apps/backend/src/entrypoints/http/__tests__/vk-channel.e2e.spec.ts`
- Modify: `apps/backend/src/entrypoints/http/main.ts`

**Interfaces:**
- Consumes: `AgentFileStorePort.read`, `FrontlineWorkflow`, everything from Tasks 1–4.
- Produces: `class KnowledgeFaqSource { entries(input: { tenantId: string; agentId: string }): Promise<readonly FrontlineFaqEntry[]> }`

- [ ] **Step 1: Write the failing parser test**

```ts
const faq = `## Когда вы работаете?
Ежедневно с 10:00 до 22:00.

## Есть ли парковка?
Да, во дворе.
`;

it('turns headings into questions and the text under them into answers', async () => {
  await expect(source.entries({ tenantId, agentId })).resolves.toEqual([
    { tenantId, question: 'Когда вы работаете?', response: 'Ежедневно с 10:00 до 22:00.' },
    { tenantId, question: 'Есть ли парковка?', response: 'Да, во дворе.' }
  ]);
});

it('ignores a heading with no answer under it', async () => { /* '## Пусто\n\n' yields [] */ });

it('yields nothing when the file does not exist', async () => { /* store.read resolves undefined */ });
```

- [ ] **Step 2: Run it, watch it fail, write the parser**

Split on lines starting with `## `, trim, drop empty bodies. No regex cleverness: a heading line, then everything until the next heading.

- [ ] **Step 3: Write the end-to-end test**

`vk-channel.e2e.spec.ts` drives `createHttpApp` with `app.inject`, a `FakeMessenger`, in-memory stores and a real `PolicyCascade`:

1. `POST /api/v1/webhooks/vk/<key>` with `type: 'confirmation'` and the right secret returns 200 and the confirmation code as the body.
2. A `message_new` matching `knowledge/faq.md` returns `ok` and sends exactly the configured answer.
3. The same `event_id` again returns `ok` and sends nothing more.
4. An allergen question returns `ok` and sends only the safe handoff, and FrontLine is never consulted.
5. A wrong `secret` returns 403, sends nothing and writes no inbox row.

- [ ] **Step 4: Run the end-to-end test**

Run: `npm run nx -- run backend:test -- vk-channel.e2e`
Expected: PASS, five tests.

- [ ] **Step 5: Wire the composition root**

In `main.ts` add `composeChannels(env, database)` next to `composeAgent`: the cipher from `readSecretKeyRing('credentials')`, the repositories, `WebhookRoutingKeyService(env.VK_WEBHOOK_SECRET)`, `KnowledgeFaqSource`, the `FaqChatPipeline` this card finally puts in production, and the messenger factory. Pass it into `createHttpApp`.

- [ ] **Step 6: Verify against live Postgres**

Start the stack, connect a fake community by inserting a connection through the cabinet route with a stubbed VK base URL, then post a callback with `curl` and confirm in `psql`: one `webhook_inbox` row `processed`, one guest with `meta->>'channel_ref'`, one conversation, two messages, `events` rows carrying no text. Delete the probe rows afterwards.

- [ ] **Step 7: Full green and commit**

```bash
npm run nx -- run-many -t test lint typecheck build
npm run eval
git commit -am "feat(vk): answer community guests from cabinet knowledge"
```

---

## Notes for the reviewer

- A real VK community needs a public HTTPS domain, which `ops/` does not provide. Everything above is verifiable without one; the live community test waits for the ingress card and must be reported as not done rather than assumed.
- The keys currently in `.env` (`VK_APP_SECRET`, `VK_SERVICE_TOKEN`) are application keys and cannot drive the wizard — it needs a community access key.
