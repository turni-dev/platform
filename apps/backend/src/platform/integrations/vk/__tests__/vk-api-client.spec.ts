import { describe, expect, it } from 'vitest';
import { VkApiClient, VkApiError } from '../vk-api-client.js';

type FetchCall = readonly [string, RequestInit];

function transport(body: unknown): {
  fetch: typeof fetch;
  calls: () => readonly FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchMock = (url: string, init: RequestInit): Promise<Response> => {
    calls.push([url, init]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
  };

  return { fetch: fetchMock as unknown as typeof fetch, calls: () => calls };
}

describe('VkApiClient', () => {
  it('keeps the access key out of the URL and puts it in the body', async () => {
    const stub = transport({ response: [{ id: 1, name: 'Кафе' }] });
    const client = new VkApiClient({ accessKey: 'secret-key', fetch: stub.fetch });

    await client.call('groups.getById', { group_ids: '1' });

    const [url, init] = stub.calls()[0]!;
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(url).toBe('https://api.vk.ru/method/groups.getById');
    expect(url).not.toContain('secret-key');
    expect(body.get('access_token')).toBe('secret-key');
    expect(body.get('group_ids')).toBe('1');
  });

  it('turns a VK error into ours and never carries the key in it', async () => {
    const client = new VkApiClient({
      accessKey: 'secret-key',
      fetch: transport({ error: { error_code: 5, error_msg: 'User authorization failed' } }).fetch
    });

    const failure: unknown = await client
      .call('groups.getById', {})
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(VkApiError);
    expect((failure as VkApiError).code).toBe(5);
    expect(String(failure)).not.toContain('secret-key');
  });

  it('reports a transport failure as an error rather than a response', async () => {
    const failing = ((): Promise<Response> =>
      Promise.resolve(new Response('gateway', { status: 502 }))) as unknown as typeof fetch;
    const client = new VkApiClient({ accessKey: 'secret-key', fetch: failing });

    await expect(client.call('groups.getById', {})).rejects.toBeInstanceOf(VkApiError);
  });

  it('never serializes its key', () => {
    const client = new VkApiClient({ accessKey: 'secret-key', fetch: transport({}).fetch });

    expect(JSON.stringify({ client })).not.toContain('secret-key');
  });

  it('refuses to exist without a key', () => {
    expect(() => new VkApiClient({ accessKey: '   ', fetch: transport({}).fetch })).toThrow();
  });
});
