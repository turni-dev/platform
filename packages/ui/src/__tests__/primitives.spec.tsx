import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Input } from '../index.js';

describe('UI foundation', () => {
  it('composes a button onto its child when asChild is enabled', () => {
    const button = renderToStaticMarkup(
      <Button asChild variant="secondary">
        <a href="/agents">Agents</a>
      </Button>
    );

    expect(button).toMatch(/^<a\b/);
    expect(button).toContain('data-variant="secondary"');
  });

  it('uses a button type by default and merges custom classes', () => {
    const button = renderToStaticMarkup(
      <Button
        className="custom-button"
        data-variant="secondary"
        variant="primary"
      >
        Action
      </Button>
    );

    expect(button).toContain('type="button"');
    expect(button).toContain('custom-button');
    expect(button).toContain('data-variant="primary"');
  });

  it('maps an invalid input to its ARIA state', () => {
    expect(
      renderToStaticMarkup(
        <Input aria-invalid="false" aria-label="Field" invalid />
      )
    ).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<Input aria-label="Optional field" />)).not.toContain(
      'aria-invalid'
    );
  });

  it('publishes the requested badge tone', () => {
    expect(renderToStaticMarkup(<Badge tone="success">Status</Badge>)).toContain(
      'data-tone="success"'
    );
  });

  it('publishes stable semantic tokens without oversized radii', async () => {
    const tokens = await readFile(
      new URL('../tokens.scss', import.meta.url),
      'utf8'
    );

    for (const token of [
      '--turni-surface',
      '--turni-text',
      '--turni-accent',
      '--turni-danger',
      '--turni-focus-ring'
    ]) {
      expect(tokens).toContain(token);
    }
    expect(tokens).toContain('--turni-radius-md: 8px');
    expect(tokens).not.toMatch(/letter-spacing:\s*-/);
  });

  it('defines Tailwind theme utilities entirely from semantic tokens', async () => {
    const stylesheet = await readFile(
      new URL('../tailwind.css', import.meta.url),
      'utf8'
    );

    expect(stylesheet).toContain('@import "tailwindcss/theme.css" layer(theme);');
    expect(stylesheet).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);'
    );
    expect(stylesheet).toContain('--color-turni-accent: var(--turni-accent);');
    expect(stylesheet).not.toContain('preflight.css');
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
