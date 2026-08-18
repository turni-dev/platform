import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { turniTheme } from '../theme.js';

describe('AntD theme tokens', () => {
  it('derives its colors and metrics from the semantic tokens in tokens.scss', async () => {
    const tokens = await readFile(new URL('../tokens.scss', import.meta.url), 'utf8');

    expect(tokens).toContain('--turni-accent: #176b4d');
    expect(turniTheme.token?.colorPrimary).toBe('#176b4d');
    expect(tokens).toContain('--turni-danger: #b42318');
    expect(turniTheme.token?.colorError).toBe('#b42318');
    expect(tokens).toContain('--turni-success: #147447');
    expect(turniTheme.token?.colorSuccess).toBe('#147447');
    expect(tokens).toContain('--turni-radius-md: 8px');
    expect(turniTheme.token?.borderRadius).toBe(8);
    expect(tokens).toContain('--turni-control-height: 40px');
    expect(turniTheme.token?.controlHeight).toBe(40);
  });

  it('turns off runtime style hashing and enables CSS variables, for the Lighthouse-gated build', () => {
    expect(turniTheme.cssVar).toEqual({});
    expect(turniTheme.hashed).toBe(false);
  });

  it('wires the vendored font into every AntD control', () => {
    expect(turniTheme.token?.fontFamily).toContain('--font-body');
  });
});
