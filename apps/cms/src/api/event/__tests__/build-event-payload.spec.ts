import { describe, expect, it } from 'vitest';
import {
  buildIntegrationRequestEventPayload,
  buildLeadEventPayload
} from '../build-event-payload';

describe('buildLeadEventPayload', () => {
  it('carries only the lead id, page and source', () => {
    const payload = buildLeadEventPayload({
      id: 42,
      name: 'Секретное имя',
      contact: 'secret@example.com',
      task: 'Секретная задача',
      page: '/uslugi/',
      source: 'yandex.ru'
    });

    expect(payload).toEqual({
      data: { type: 'lead', leadId: 42, page: '/uslugi/', source: 'yandex.ru' }
    });
  });

  it('never includes the name, contact or task fields, however they are named on the lead', () => {
    const lead: Record<string, unknown> = {
      id: 1,
      name: 'Имя',
      contact: 'contact@example.com',
      company: 'Компания',
      task: 'Задача',
      channels: 'Сайт',
      page: '/',
      source: 'direct'
    };

    const payload = buildLeadEventPayload(lead as Parameters<typeof buildLeadEventPayload>[0]);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('Имя');
    expect(serialized).not.toContain('contact@example.com');
    expect(serialized).not.toContain('Компания');
    expect(serialized).not.toContain('Задача');
    expect(serialized).not.toContain('Сайт');
  });

  it('falls back to "unknown"/"direct" when the lead was created without analytics metadata', () => {
    const payload = buildLeadEventPayload({
      id: 7,
      name: undefined,
      contact: 'c@example.com',
      task: undefined,
      page: undefined,
      source: undefined
    });

    expect(payload).toEqual({
      data: { type: 'lead', leadId: 7, page: 'unknown', source: 'direct' }
    });
  });
});

describe('buildIntegrationRequestEventPayload', () => {
  it('carries the requested slug alongside the same metadata as the lead event', () => {
    const payload = buildIntegrationRequestEventPayload({
      id: 42,
      requestedIntegration: 'google-calendar',
      page: '/integrations/google-calendar',
      source: 'site'
    });

    expect(payload).toEqual({
      data: {
        type: 'integration_requested',
        leadId: 42,
        integrationSlug: 'google-calendar',
        page: '/integrations/google-calendar',
        source: 'site'
      }
    });
  });

  it('never includes the name, contact or task fields of the lead that requested it', () => {
    const lead: Record<string, unknown> = {
      id: 1,
      requestedIntegration: 'telegram',
      name: 'Имя',
      contact: 'contact@example.com',
      company: 'Компания',
      task: 'Задача',
      channels: 'Сайт',
      slotLabel: '16 августа, 14:00 МСК',
      page: '/integrations',
      source: 'direct'
    };

    const payload = buildIntegrationRequestEventPayload(
      lead as Parameters<typeof buildIntegrationRequestEventPayload>[0]
    );
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('Имя');
    expect(serialized).not.toContain('contact@example.com');
    expect(serialized).not.toContain('Компания');
    expect(serialized).not.toContain('Задача');
    expect(serialized).not.toContain('Сайт');
    expect(serialized).not.toContain('МСК');
    expect(serialized).toContain('telegram');
  });

  it('produces no event when the lead did not request an integration', () => {
    expect(
      buildIntegrationRequestEventPayload({ id: 3, contact: 'c@example.com', page: '/', source: 'direct' })
    ).toBeUndefined();
  });

  it('produces no event when the stored value does not look like a slug', () => {
    expect(
      buildIntegrationRequestEventPayload({ id: 4, requestedIntegration: 'Что угодно ещё' })
    ).toBeUndefined();
  });
});
