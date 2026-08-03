import { describe, expect, it } from 'vitest';
import { WIDGET_ELEMENT_TAG } from './index.js';

describe('widget public API', () => {
  it('exports the stable custom element tag', () => {
    expect(WIDGET_ELEMENT_TAG).toBe('turni-chat-widget');
  });
});
