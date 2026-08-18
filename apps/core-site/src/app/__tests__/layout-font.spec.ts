import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutPath = resolve(process.cwd(), 'apps/core-site/src/app/layout.tsx');

describe('site layout font', () => {
  it('does not require a Google Fonts download during a container build', () => {
    const layout = readFileSync(layoutPath, 'utf8');

    expect(layout).not.toContain("from 'next/font/google'");
    expect(layout).not.toContain('Inter(');
  });
});
