import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Input } from './index.js';

describe('UI foundation', () => {
  it('renders native accessible primitives', () => {
    const button = renderToStaticMarkup(
      <Button
        className="custom-button"
        data-variant="secondary"
        variant="primary"
      >
        Action
      </Button>
    );
    expect(button).toContain('class="turni-button custom-button"');
    expect(button).toContain('type="button"');
    expect(button).toContain('data-variant="primary"');
    expect(
      renderToStaticMarkup(
        <Input aria-invalid="false" aria-label="Field" invalid />
      )
    ).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<Input aria-label="Optional field" />))
      .not.toContain('aria-invalid');
    expect(renderToStaticMarkup(<Badge tone="success">Status</Badge>))
      .toContain('data-tone="success"');
  });

  it('publishes stable semantic tokens without oversized radii', async () => {
    const tokens = await readFile(
      new URL('./tokens.scss', import.meta.url),
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
});
