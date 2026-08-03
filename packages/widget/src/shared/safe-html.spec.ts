import { describe, expect, it } from 'vitest';

import { escapeHtml } from './safe-html.js';

describe('escapeHtml', () => {
  it('renders guest input as text instead of markup', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
  });

  it('escapes every HTML-sensitive character', () => {
    expect(escapeHtml("&<'\">" )).toBe('&amp;&lt;&#39;&quot;&gt;');
  });
});
