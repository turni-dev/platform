import { describe, expect, it } from 'vitest';
import { GuestSessionRequestSchema } from '../ports/widget-chat.js';

describe('widget chat contracts', () => {
  it('accepts a bounded signed routing key while retaining trim and non-empty validation', () => {
    const signedRoutingKey = `${'eyJ0ZW5hbnRJZCI6IjAxOGY4ZDdlLTVmMWEtN2MxZi04ZjM4LTJiMzI1ZDU5ZDE5ZiJ9'.repeat(3)}.${'a'.repeat(43)}`;

    expect(GuestSessionRequestSchema.parse({ widgetKey: signedRoutingKey })).toEqual({
      widgetKey: signedRoutingKey
    });
    expect(() => GuestSessionRequestSchema.parse({ widgetKey: '   ' })).toThrow();
    expect(() => GuestSessionRequestSchema.parse({ widgetKey: 'x'.repeat(1025) })).toThrow();
  });
});
