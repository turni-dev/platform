import { describe, expect, it, vi } from 'vitest';
import { handleLeadRequest, type LeadFetch } from '../lead-intake.js';

interface Written {
  readonly url: string;
  readonly body: unknown;
}

function deps(existing: readonly string[] = []): {
  fetch: LeadFetch;
  written: Written[];
  warnings: string[];
} {
  const written: Written[] = [];
  const warnings: string[] = [];
  const fetch = vi.fn<LeadFetch>((url, init) => {
    if (init.method === 'GET') {
      const known = existing.some((key) => url.includes(key));

      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: known ? [{ id: 1 }] : [] }))
      });
    }

    written.push({ url, body: JSON.parse(init.body ?? '{}') as unknown });

    return Promise.resolve({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ data: { id: 1, documentId: 'lead-1' } }))
    });
  });

  return { fetch, written, warnings };
}

function leadRequest(overrides: Readonly<Record<string, string | undefined>> = {}): Request {
  const fields: Record<string, string | undefined> = {
    name: 'Мария',
    contact: 'mariya@example.com',
    company: 'Кофейня',
    task: 'Отвечать ночью',
    channels: 'Сайт',
    hasServer: 'Не знаю',
    timeline: 'Горит',
    consent: 'yes',
    idempotencyKey: 'key-1',
    ...overrides
  };

  const body = new URLSearchParams();
  for (const [field, value] of Object.entries(fields)) {
    if (value !== undefined) {
      body.set(field, value);
    }
  }

  return new Request('http://localhost/api/leads', { method: 'POST', body });
}

const options = (fetch: LeadFetch, warnings: string[] = []) => ({
  baseUrl: 'http://cms:1337',
  apiToken: 'write-token',
  fetch,
  onWarning: (message: string): void => {
    warnings.push(message);
  }
});

describe('handleLeadRequest', () => {
  it('stores the lead and sends the visitor back to the form', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(leadRequest(), options(fetch));

    expect(response.status).toBe(303);
    expect(written).toHaveLength(1);
    expect(written[0]?.body).toMatchObject({
      data: { name: 'Мария', contact: 'mariya@example.com', channels: ['Сайт'] }
    });
  });

  it('records when the consent was given, not just that it was', async () => {
    const { fetch, written } = deps();

    await handleLeadRequest(leadRequest(), options(fetch));

    const data = (written[0]?.body as { data: Record<string, unknown> }).data;
    expect(typeof data['consentAt']).toBe('string');
  });

  it('answers a fetch submission with json', async () => {
    const { fetch } = deps();
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new URLSearchParams({ contact: 'me@example.com', consent: 'yes', idempotencyKey: 'k' })
    });

    const response = await handleLeadRequest(request, options(fetch));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ status: 'accepted' });
  });

  it('refuses a lead without the personal data consent', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(
      leadRequest({ consent: undefined }),
      options(fetch)
    );

    expect(response.status).toBe(422);
    expect(written).toHaveLength(0);
  });

  it('refuses a lead without any way to answer it', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(leadRequest({ contact: '  ' }), options(fetch));

    expect(response.status).toBe(422);
    expect(written).toHaveLength(0);
  });

  it('accepts the bot silently and writes nothing', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(
      leadRequest({ companySite: 'http://spam.example' }),
      options(fetch)
    );

    expect(response.status).toBe(303);
    expect(written).toHaveLength(0);
  });

  it('writes one lead when the same attempt is submitted twice', async () => {
    const first = deps();
    await handleLeadRequest(leadRequest(), options(first.fetch));

    const second = deps(['key-1']);
    const response = await handleLeadRequest(leadRequest(), options(second.fetch));

    expect(response.status).toBe(303);
    expect(second.written).toHaveLength(0);
  });

  it('accepts a lead the unique key already refused, without a second record', async () => {
    const written: Written[] = [];
    const racing = vi.fn<LeadFetch>((url, init) => {
      if (init.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ data: [] }))
        });
      }
      written.push({ url, body: null });

      return Promise.resolve({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                name: 'ValidationError',
                message: 'This attribute must be unique'
              }
            })
          )
      });
    });

    const response = await handleLeadRequest(leadRequest(), options(racing));

    expect(response.status).toBe(303);
    expect(written).toHaveLength(1);
  });

  it('reports a failure without leaking what the visitor wrote', async () => {
    const warnings: string[] = [];
    const failing = vi.fn<LeadFetch>((_url, init) =>
      init.method === 'GET'
        ? Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ data: [] }))
          })
        : Promise.reject(new Error('ECONNREFUSED'))
    );

    const response = await handleLeadRequest(leadRequest(), options(failing, warnings));

    expect(response.status).toBe(502);
    expect(warnings.join(' ')).not.toContain('Отвечать ночью');
    expect(warnings.join(' ')).not.toContain('mariya@example.com');
  });

  it('refuses to accept leads when no CMS is configured', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(leadRequest(), {
      fetch,
      apiToken: 'write-token'
    });

    expect(response.status).toBe(503);
    expect(written).toHaveLength(0);
  });
});
