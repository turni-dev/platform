import { describe, expect, it } from 'vitest';
import { buildLeadEventPayload } from '../build-event-payload';

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
