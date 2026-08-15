import { describe, expect, it } from 'vitest';
import { createVkMessenger, deriveRandomId } from '../vk-messenger.adapter.js';

const connection = {
  id: '01900000-0000-7000-8000-000000000001',
  type: 'vk'
} as const;

function transport(responses: readonly unknown[]): {
  fetch: typeof fetch;
  body: (call: number) => URLSearchParams;
} {
  const bodies: URLSearchParams[] = [];
  let call = 0;
  const fetchMock = (_url: string, init: RequestInit): Promise<Response> => {
    bodies.push(new URLSearchParams(init.body as URLSearchParams));
    const body = responses[call] ?? { response: 1 };
    call += 1;

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
  };

  return {
    fetch: fetchMock as unknown as typeof fetch,
    body: (index) => bodies[index] ?? new URLSearchParams()
  };
}

function messenger(responses: readonly unknown[]): ReturnType<typeof createVkMessenger> {
  return createVkMessenger({ accessKey: 'k', groupId: 42, fetch: transport(responses).fetch });
}

describe('VkMessengerAdapter', () => {
  it('validates a key and reports the community name', async () => {
    const stub = transport([{ response: { groups: [{ id: 42, name: 'Кафе' }] } }]);

    await expect(
      createVkMessenger({ accessKey: 'k', groupId: 42, fetch: stub.fetch })
        .validateCredentials({ secret: 'k' })
    ).resolves.toEqual({ valid: true, identity: 'Кафе' });
  });

  it('reports an invalid key instead of throwing', async () => {
    await expect(
      messenger([{ error: { error_code: 5, error_msg: 'auth failed' } }])
        .validateCredentials({ secret: 'k' })
    ).resolves.toEqual({ valid: false });
  });

  it('sends a reply to the recipient the message names', async () => {
    const stub = transport([{ response: 908 }]);

    const result = await createVkMessenger({ accessKey: 'k', groupId: 42, fetch: stub.fetch })
      .send(connection, {
        conversationId: '01900000-0000-7000-8000-000000000002',
        recipientRef: '777',
        content: { type: 'text', text: 'Мы работаем с 10:00' }
      });

    expect(result).toEqual({ externalId: '908' });
    expect(stub.body(0).get('peer_id')).toBe('777');
    expect(stub.body(0).get('message')).toBe('Мы работаем с 10:00');
    expect(Number(stub.body(0).get('random_id'))).toBeGreaterThan(0);
  });

  it('refuses to send content the channel cannot carry yet', async () => {
    await expect(
      messenger([{ response: 1 }]).send(connection, {
        conversationId: '01900000-0000-7000-8000-000000000002',
        recipientRef: '777',
        content: { type: 'image', url: 'https://example.test/a.png' }
      })
    ).rejects.toThrow();
  });

  it('derives a stable random_id per reply so a retry cannot double-send', () => {
    expect(deriveRandomId('reply-a')).toBe(deriveRandomId('reply-a'));
    expect(deriveRandomId('reply-a')).not.toBe(deriveRandomId('reply-b'));
    expect(deriveRandomId('reply-a')).toBeGreaterThan(0);
    expect(deriveRandomId('reply-a')).toBeLessThanOrEqual(2_147_483_647);
  });

  it('registers the callback server and enables message events on that server', async () => {
    const stub = transport([{ response: { server_id: 3 } }, { response: 1 }]);

    await createVkMessenger({ accessKey: 'k', groupId: 42, fetch: stub.fetch })
      .setupWebhook(connection, {
        url: 'https://app.example/api/v1/webhooks/vk/key',
        secret: 'secret-that-is-long-enough'
      });

    expect(stub.body(0).get('url')).toBe('https://app.example/api/v1/webhooks/vk/key');
    expect(stub.body(0).get('secret_key')).toBe('secret-that-is-long-enough');
    expect(stub.body(0).get('title')?.length).toBeLessThanOrEqual(14);
    expect(stub.body(1).get('server_id')).toBe('3');
    expect(stub.body(1).get('message_new')).toBe('1');
  });

  it('reads the confirmation code', async () => {
    await expect(messenger([{ response: { code: 'abc123' } }]).confirmationCode())
      .resolves.toBe('abc123');
  });

  it('refuses to parse a callback it cannot address', async () => {
    await expect(messenger([]).parseWebhook({ type: 'confirmation', group_id: 42 }))
      .rejects.toThrow();
  });
});
