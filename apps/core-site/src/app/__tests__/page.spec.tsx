import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appDirectory = resolve(__dirname, '..');

describe('core site shared UI integration', () => {
  it('renders the shared Button around the cabinet login link', () => {
    const pageSource = readFileSync(resolve(appDirectory, 'page.tsx'), 'utf8');

    expect(pageSource).toContain("import { Button } from '@turni/ui';");
    expect(pageSource).toMatch(
      /<Button\s+asChild>\s*<a href="https:\/\/app\.turni\.ru\/login">Открыть кабинет<\/a>\s*<\/Button>/s
    );
  });

  it('loads shared styles from the root layout', () => {
    const layoutSource = readFileSync(resolve(appDirectory, 'layout.tsx'), 'utf8');

    expect(layoutSource).toContain("import './globals.scss';");
    expect(layoutSource).toContain("import '@turni/ui/tailwind.css';");
  });
});
