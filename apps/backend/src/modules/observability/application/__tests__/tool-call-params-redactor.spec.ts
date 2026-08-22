import { describe, expect, it } from 'vitest';
import { redactToolCallParams, redactToolCallText } from '../tool-call-params-redactor.js';

describe('redactToolCallText', () => {
  it('redacts an email in free text', () => {
    expect(redactToolCallText('пишите на guest@example.com')).toBe(
      'пишите на [[TURNI_PII:EMAIL:1]]'
    );
  });

  it('redacts a phone number in free text', () => {
    expect(redactToolCallText('позвоните +7 999 123 45 67')).toBe(
      'позвоните [[TURNI_PII:PHONE:1]]'
    );
  });

  it('leaves text without PII untouched', () => {
    expect(redactToolCallText('стол на четверых, 19:00')).toBe('стол на четверых, 19:00');
  });
});

describe('redactToolCallParams', () => {
  it('redacts text fields but leaves non-text params as-is', () => {
    const redacted = redactToolCallParams({
      note: 'контакт guest@example.com',
      limit: 5,
      active: true,
      id: 'seat-12'
    });

    expect(redacted).toEqual({
      note: 'контакт [[TURNI_PII:EMAIL:1]]',
      limit: 5,
      active: true,
      id: 'seat-12'
    });
  });

  it('redacts text nested inside arrays and objects', () => {
    const redacted = redactToolCallParams({
      guests: [{ contact: 'guest@example.com' }, { contact: 'no pii here' }]
    });

    expect(redacted).toEqual({
      guests: [{ contact: '[[TURNI_PII:EMAIL:1]]' }, { contact: 'no pii here' }]
    });
  });

  it('leaves null and empty params untouched', () => {
    expect(redactToolCallParams({ note: null })).toEqual({ note: null });
    expect(redactToolCallParams({})).toEqual({});
  });
});
