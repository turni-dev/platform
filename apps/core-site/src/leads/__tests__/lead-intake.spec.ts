import { describe, expect, it, vi } from 'vitest';
import { handleLeadRequest, type LeadFetch } from '../lead-intake';
import { InMemoryRateLimiter } from '../../anti-abuse/rate-limit';
import { SESSION_COOKIE_NAME } from '../../anti-abuse/identity';

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
    foreignHosting: 'Не знаю',
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

// Generous by default so unrelated tests never trip it; low-limit tests build
// their own limiters explicitly.
function permissiveRateLimit(): { ip: InMemoryRateLimiter; session: InMemoryRateLimiter } {
  return {
    ip: new InMemoryRateLimiter({ windowMs: 60_000, max: 1_000 }),
    session: new InMemoryRateLimiter({ windowMs: 60_000, max: 1_000 })
  };
}

const options = (fetch: LeadFetch, warnings: string[] = []) => ({
  baseUrl: 'http://cms:1337',
  apiToken: 'write-token',
  fetch,
  rateLimit: permissiveRateLimit(),
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
      data: { name: 'Мария', contact: 'mariya@example.com', channels: 'Сайт' }
    });
  });

  it('carries the foreign hosting answer to the CMS, separate from consent', async () => {
    const { fetch, written } = deps();

    await handleLeadRequest(leadRequest({ foreignHosting: 'Нет' }), options(fetch));

    expect(written[0]?.body).toMatchObject({ data: { foreignHosting: 'Нет' } });
  });

  it('accepts a lead that skips the foreign hosting question, since it is optional', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(
      leadRequest({ foreignHosting: undefined }),
      options(fetch)
    );

    expect(response.status).toBe(303);
    expect(written).toHaveLength(1);
    const data = (written[0]?.body as { data: Record<string, unknown> }).data;
    expect(data['foreignHosting']).toBeUndefined();
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

/** Оснастка для сценариев с бронированием: reserve и создание заявки — два
 * разных эндпоинта, поэтому мок различает их по адресу. */
function depsWithReservation(reserveStatus: number): {
  fetch: LeadFetch;
  written: Written[];
  reserved: string[];
} {
  const written: Written[] = [];
  const reserved: string[] = [];
  const fetch = vi.fn<LeadFetch>((url, init) => {
    if (init.method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: [] }))
      });
    }

    if (url.includes('/reserve')) {
      reserved.push(url);

      return Promise.resolve({
        ok: reserveStatus < 300,
        status: reserveStatus,
        text: () => Promise.resolve('')
      });
    }

    written.push({ url, body: JSON.parse(init.body ?? '{}') as unknown });

    return Promise.resolve({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ data: { id: 1, documentId: 'lead-1' } }))
    });
  });

  return { fetch, written, reserved };
}

describe('handleLeadRequest with a chosen slot', () => {
  it('reserves the slot and stores the lead with the slot and its label', async () => {
    const { fetch, written, reserved } = depsWithReservation(200);

    const response = await handleLeadRequest(
      leadRequest({ slotId: '5|16 августа, 14:00 МСК' }),
      options(fetch)
    );

    expect(response.status).toBe(303);
    expect(reserved).toEqual(['http://cms:1337/api/booking-slots/5/reserve']);
    expect(written).toHaveLength(1);
    expect(written[0]?.body).toMatchObject({
      data: { bookedSlot: '5', slotLabel: '16 августа, 14:00 МСК' }
    });
  });

  it('refuses without creating a lead when the slot is already taken', async () => {
    const { fetch, written, reserved } = depsWithReservation(409);

    const response = await handleLeadRequest(
      leadRequest({ slotId: '5|16 августа, 14:00 МСК' }),
      options(fetch)
    );

    expect(response.status).toBe(409);
    expect(reserved).toHaveLength(1);
    expect(written).toHaveLength(0);
  });

  it('refuses without creating a lead when reservation fails', async () => {
    const { fetch, written } = depsWithReservation(500);

    const response = await handleLeadRequest(
      leadRequest({ slotId: '5|16 августа, 14:00 МСК' }),
      options(fetch)
    );

    expect(response.status).toBe(502);
    expect(written).toHaveLength(0);
  });

  it('still works exactly as before when no slot is chosen', async () => {
    const { fetch, written, reserved } = depsWithReservation(200);

    const response = await handleLeadRequest(leadRequest(), options(fetch));

    expect(response.status).toBe(303);
    expect(reserved).toHaveLength(0);
    expect(written).toHaveLength(1);
    expect(written[0]?.body).not.toHaveProperty('data.bookedSlot');
  });
});

describe('handleLeadRequest rate limiting', () => {
  it('rejects a submission once the per-ip limit is exhausted', async () => {
    const { fetch, written } = deps();
    const rateLimit = {
      ip: new InMemoryRateLimiter({ windowMs: 60_000, max: 1 }),
      session: new InMemoryRateLimiter({ windowMs: 60_000, max: 1_000 })
    };
    const request = () =>
      new Request('http://localhost/api/leads', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.7' },
        body: (() => {
          const body = new URLSearchParams();
          body.set('contact', 'me@example.com');
          body.set('consent', 'yes');
          body.set('idempotencyKey', 'key-a');

          return body;
        })()
      });

    const first = await handleLeadRequest(request(), { ...options(fetch), rateLimit });
    const second = await handleLeadRequest(request(), { ...options(fetch), rateLimit });

    expect(first.status).toBe(303);
    expect(second.status).toBe(429);
    expect(written).toHaveLength(1);
  });

  it('rejects a submission once the per-session limit is exhausted, even from a different ip', async () => {
    const { fetch, written } = deps();
    const rateLimit = {
      ip: new InMemoryRateLimiter({ windowMs: 60_000, max: 1_000 }),
      session: new InMemoryRateLimiter({ windowMs: 60_000, max: 1 })
    };
    const withCookie = (ip: string) =>
      new Request('http://localhost/api/leads', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip, cookie: `${SESSION_COOKIE_NAME}=same-session` },
        body: (() => {
          const body = new URLSearchParams();
          body.set('contact', 'me@example.com');
          body.set('consent', 'yes');
          body.set('idempotencyKey', 'key-b');

          return body;
        })()
      });

    const first = await handleLeadRequest(withCookie('203.0.113.1'), { ...options(fetch), rateLimit });
    const second = await handleLeadRequest(withCookie('203.0.113.2'), {
      ...options(fetch),
      rateLimit
    });

    expect(first.status).toBe(303);
    expect(second.status).toBe(429);
    expect(written).toHaveLength(1);
  });

  it('does not rate limit when no limiters are configured (explicit opt-out for tests)', async () => {
    const { fetch } = deps();

    const response = await handleLeadRequest(leadRequest(), {
      baseUrl: 'http://cms:1337',
      apiToken: 'write-token',
      fetch
    });

    expect(response.status).toBe(303);
  });
});

describe('handleLeadRequest session cookie', () => {
  it('mints a session cookie when the visitor has none yet', async () => {
    const { fetch } = deps();

    const response = await handleLeadRequest(leadRequest(), options(fetch));

    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('does not re-mint a cookie when the visitor already carries one', async () => {
    const { fetch } = deps();
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE_NAME}=existing` },
      body: (() => {
        const body = new URLSearchParams();
        body.set('contact', 'me@example.com');
        body.set('consent', 'yes');
        body.set('idempotencyKey', 'key-c');

        return body;
      })()
    });

    const response = await handleLeadRequest(request, options(fetch));

    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('handleLeadRequest analytics metadata', () => {
  it('attaches page/source derived only from headers to the stored lead', async () => {
    const { fetch, written } = deps();
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { referer: 'https://yandex.ru/search/?text=turni' },
      body: (() => {
        const body = new URLSearchParams();
        body.set('name', 'Мария');
        body.set('contact', 'mariya@example.com');
        body.set('task', 'Секретная задача');
        body.set('consent', 'yes');
        body.set('idempotencyKey', 'key-d');

        return body;
      })()
    });

    await handleLeadRequest(request, options(fetch));

    const data = (written[0]?.body as { data: Record<string, unknown> }).data;
    expect(data['page']).toBe('/search/');
    expect(data['source']).toBe('yandex.ru');
  });

  it('never derives page/source from the name, contact or task fields', async () => {
    const { fetch, written } = deps();
    const request = new Request('http://localhost/api/leads', {
      method: 'POST',
      body: (() => {
        const body = new URLSearchParams();
        body.set('name', 'Секретное имя');
        body.set('contact', 'secret@example.com');
        body.set('task', 'Секретная задача не должна попасть в метаданные');
        body.set('consent', 'yes');
        body.set('idempotencyKey', 'key-e');

        return body;
      })()
    });

    await handleLeadRequest(request, options(fetch));

    const data = (written[0]?.body as { data: Record<string, unknown> }).data;
    expect(String(data['page'])).not.toContain('Секретное');
    expect(String(data['source'])).not.toContain('secret');
    expect(data['page']).toBe('unknown');
    expect(data['source']).toBe('direct');
  });
});

describe('handleLeadRequest requested integration', () => {
  it('carries the requested integration slug to the CMS', async () => {
    const { fetch, written } = deps();

    await handleLeadRequest(
      leadRequest({ requestedIntegration: 'google-calendar' }),
      options(fetch)
    );

    expect(written[0]?.body).toMatchObject({ data: { requestedIntegration: 'google-calendar' } });
  });

  it('stores nothing for that field when the visitor came without the parameter', async () => {
    const { fetch, written } = deps();

    await handleLeadRequest(leadRequest(), options(fetch));

    expect(JSON.stringify(written[0]?.body)).not.toContain('requestedIntegration');
  });

  it('drops a value that is not a slug instead of writing it, and still takes the lead', async () => {
    const { fetch, written } = deps();

    const response = await handleLeadRequest(
      leadRequest({ requestedIntegration: `${'x'.repeat(2000)} <script>` }),
      options(fetch)
    );

    expect(response.status).toBe(303);
    expect(JSON.stringify(written[0]?.body)).not.toContain('xxxx');
    expect(JSON.stringify(written[0]?.body)).not.toContain('script');
  });
});
