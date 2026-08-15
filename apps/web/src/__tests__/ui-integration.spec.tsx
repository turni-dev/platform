import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'apps/web/src');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

describe('shared UI controls integration', () => {
  it('uses shared controls while preserving form contracts', () => {
    const auth = read('app/(auth)/auth-forms.tsx');
    const create = read('app/(cabinet)/agent/create-agent-button.tsx');
    const editor = read('app/(cabinet)/agent/markdown-editor.tsx');
    const knowledge = read('app/(cabinet)/agent/knowledge/knowledge-controls.tsx');
    const signOut = read('app/(cabinet)/dashboard/sign-out-button.tsx');

    expect(auth).toContain("from '@turni/ui'");
    expect(auth).toMatch(/type="email"[\s\S]*required/);
    expect(auth).toContain('autoComplete="email"');
    expect(auth).toContain('pattern=');
    expect(auth).toContain('inputMode=');
    expect(knowledge).toContain('name=');
    expect(editor).toContain('<Textarea');
    for (const source of [auth, create, editor, knowledge, signOut]) {
      expect(source).not.toMatch(/<button\b/);
      expect(source).not.toMatch(/<input\b/);
      expect(source).not.toMatch(/<textarea\b/);
    }
  });
});
