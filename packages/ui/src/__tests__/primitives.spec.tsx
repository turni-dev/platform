import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Input, Textarea } from '../index.js';

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

  it('keeps the selected button variant authoritative over child data attributes', () => {
    const button = renderToStaticMarkup(
      <Button asChild variant="primary">
        <a data-variant="secondary" href="/agents">Agents</a>
      </Button>
    );

    expect(button).toContain('bg-turni-accent');
    expect(button).toContain('text-turni-accent-contrast');
    expect(button).not.toContain('data-[variant=primary]');
  });

  it('rejects disabled when Button composes onto a child', () => {
    // @ts-expect-error disabled is only available for native buttons
    <Button asChild disabled><a href="/agents">Agents</a></Button>;
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

  it('renders a native textarea, forwards attrs and maps invalid to ARIA', () => {
    const ref = { current: null } as React.RefObject<HTMLTextAreaElement | null>;
    const textarea = renderToStaticMarkup(
      <Textarea ref={ref} aria-label="Notes" rows={4} invalid />
    );

    expect(textarea).toMatch(/^<textarea\b/);
    expect(textarea).toContain('aria-label="Notes"');
    expect(textarea).toContain('rows="4"');
    expect(textarea).toContain('aria-invalid="true"');
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

  it('disambiguates the badge font-size variable for Tailwind', async () => {
    const source = await readFile(new URL('../index.tsx', import.meta.url), 'utf8');
    const stylesheet = await readFile(
      new URL('../tailwind.css', import.meta.url),
      'utf8'
    );
    const result = await postcss([tailwindcss()]).process(stylesheet, {
      from: fileURLToPath(new URL('../tailwind.css', import.meta.url))
    });

    expect(source).toContain('text-(length:--turni-font-size-sm)');
    expect(source).not.toContain('tracking-normal');
    expect(result.css).toContain('font-size: var(--turni-font-size-sm);');
    expect(result.css).not.toContain('color: var(--turni-font-size-sm);');
  });
});
