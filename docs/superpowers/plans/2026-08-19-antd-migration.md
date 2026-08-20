# Ant Design Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `@turni/ui` (Radix + Tailwind) primitives with Ant Design v6 across both Next.js apps — the corp site (`apps/core-site`) and the owner cabinet (`apps/web`) — using one shared theme, so both surfaces render real, polished controls instead of four bespoke components.

**Architecture:** `packages/ui` stops exporting React primitives and becomes a thin shared foundation: a semantic color/spacing token file (`tokens.scss`, unchanged) plus an Ant Design `ThemeConfig` derived from those same tokens, plus a `TurniAntdProvider` client component that wraps `@ant-design/nextjs-registry`'s `AntdRegistry` and antd's `ConfigProvider`. Each app imports `antd` components directly in its own files and wraps its root layout in `TurniAntdProvider`. One self-hosted variable font (Manrope, vendored as a local file — see Global Constraints) replaces the system-font fallback in both apps.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.7, antd 6.6.1, @ant-design/nextjs-registry 1.3.0, @ant-design/cssinjs 2.1.2, TypeScript 5.9.3, Vitest 4.1.9, sass 1.101.0.

**Spec:** No separate spec document — the spec is the user's decision to drop Radix + Tailwind and standardize on Ant Design for both the corp site and the cabinet, captured in conversation, plus the design guidance below drawn from the `frontend-design` and `ui-ux-pro-max` skills.

## Design decisions (from frontend-design + ui-ux-pro-max)

- **`ui-ux-pro-max --design-system` for a B2B security/ops SaaS landing** recommended the "Real-Time / Operations Landing" pattern and a "Trust & Authority" style (light-mode-first; avoid dark-mode-by-default; badges/case studies/metrics). That's a content-composition concern, not a library concern — it is **out of scope for this plan** and already tracked separately as the `site-layout.json` findings (one-width sections, `featureGrid` repeated 3×, bento unused). This plan only swaps the component layer.
- **Brand color stays `#176b4d`** (the existing `--turni-accent`, already used in the logo and illustrations) rather than the tool's generic recommended blue — changing the brand color is a separate decision the user hasn't made, and `frontend-design` favors committing to an existing cohesive identity over a generic default.
- **Typography:** `apps/core-site/src/app/__tests__/layout-font.spec.ts` forbids `next/font/google` (the container build must not need network access), and the current fallback is plain system UI fonts / Arial — both flagged as generic by `frontend-design`. Fix: self-host **Manrope** (a distinctive, geometric, full-Cyrillic variable font — verified via Google Fonts CSS that it ships a `cyrillic` subset, unlike e.g. Plus Jakarta Sans) as a vendored `.ttf` via `next/font/local`, used in both apps at weight 400 (body) through 800 (headings/CTAs). One font, one file, no build-time network dependency, no test to update.
- **cssVar, not hashed:** the theme sets `cssVar: true, hashed: false` so antd emits real `--ant-*` CSS custom properties instead of runtime-hashed class names — cheaper for the Lighthouse ≥90 mobile-throttled gate on `apps/core-site`.
- **Link-styled buttons keep working without JavaScript:** every current `<Button asChild><a href=…></a></Button>` composition becomes `<Button href=…>` — antd's `Button` renders a real `<a>` when given `href`, so nav/hero/case-cards CTAs stay plain anchors, no client JS required for navigation.

## Global Constraints

- Every touched file keeps passing `tsc --noEmit` in strict mode (see each app's `tsconfig.json`).
- No `next/font/google` import and no `Inter(` call anywhere in `apps/core-site/src/app/layout.tsx` — enforced by the existing `layout-font.spec.ts`. Fonts must be vendored as local files.
- `apps/core-site` must still build and pass its Lighthouse assertion (`categories:performance` ≥ 0.90, mobile-throttled preset) from `apps/core-site/lighthouserc.json` — the CMS is not required for this (seed content only).
- Content schemas (`blocks.*` Zod schemas, `page-schema.ts`) are not touched. Only rendering changes.
- No native `<button>`, `<input>`, or `<textarea>` tags introduced in files that previously used `@turni/ui` — the point of the library is that every control is a real antd component.
- `npm install` runs from the repo root (single npm workspace root; `apps/core-site` and `apps/web` have no package.json of their own — every dependency lives in root `package.json`, except `packages/ui`, which has its own).

---

## Task 1: Repurpose `packages/ui` as the shared Ant Design foundation

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/theme.ts`
- Create: `packages/ui/src/provider.tsx`
- Create: `packages/ui/src/index.ts`
- Delete: `packages/ui/src/index.tsx`
- Delete: `packages/ui/src/tailwind.css`
- Delete: `packages/ui/src/__tests__/primitives.spec.tsx`
- Create: `packages/ui/src/__tests__/theme.spec.ts`
- Keep unchanged: `packages/ui/src/tokens.scss` (still the single source of truth for semantic colors — every block's `.module.scss` reads its CSS custom properties, and this task's theme is derived from the same literal values)

**Interfaces:**
- Produces: `turniTheme: import('antd').ThemeConfig` — consumed by `TurniAntdProvider`, and re-exported for tests.
- Produces: `TurniAntdProvider({ children }: { children: ReactNode }): React.JSX.Element` — consumed by both apps' `app/layout.tsx` (Task 2, Task 3) to wrap the page tree.

- [ ] **Step 1: Write the failing theme test**

Create `packages/ui/src/__tests__/theme.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { turniTheme } from '../theme';

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
    expect(turniTheme.cssVar).toBe(true);
    expect(turniTheme.hashed).toBe(false);
  });

  it('wires the vendored font into every AntD control', () => {
    expect(turniTheme.token?.fontFamily).toContain('--font-body');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts packages/ui/src/__tests__/theme.spec.ts`
Expected: FAIL — `Cannot find module '../theme'`

- [ ] **Step 3: Update `packages/ui/package.json`**

```json
{
  "name": "@turni/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.scss": "./src/tokens.scss"
  },
  "peerDependencies": {
    "react": "^19.2.0"
  },
  "dependencies": {
    "antd": "^6.6.1",
    "@ant-design/nextjs-registry": "^1.3.0",
    "@ant-design/cssinjs": "^2.1.2"
  }
}
```

- [ ] **Step 4: Write `packages/ui/src/theme.ts`**

```ts
import type { ThemeConfig } from 'antd';

/**
 * Every value here is copied from `tokens.scss` — that file stays the single
 * source of truth for the brand's semantic colors, this just hands the same
 * values to AntD. `theme.spec.ts` catches the two files drifting apart.
 */
export const turniTheme: ThemeConfig = {
  cssVar: true,
  hashed: false,
  token: {
    colorPrimary: '#176b4d',
    colorSuccess: '#147447',
    colorWarning: '#8a5800',
    colorError: '#b42318',
    colorInfo: '#1b65c1',
    colorBgBase: '#ffffff',
    colorTextBase: '#17191c',
    colorBorder: '#cbd1d8',
    borderRadius: 8,
    controlHeight: 40,
    fontSize: 16,
    fontFamily: "var(--font-body), system-ui, -apple-system, 'Segoe UI', sans-serif"
  }
};
```

- [ ] **Step 5: Write `packages/ui/src/provider.tsx`**

```tsx
'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { turniTheme } from './theme';

/**
 * Wraps AntD's SSR style registry and theme provider in one place so both
 * apps configure the same theme the same way. Renders `children` untouched,
 * so server components passed in from `app/layout.tsx` stay server components
 * — only this wrapper crosses the client boundary.
 */
export function TurniAntdProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AntdRegistry>
      <ConfigProvider theme={turniTheme}>{children}</ConfigProvider>
    </AntdRegistry>
  );
}
```

- [ ] **Step 6: Write `packages/ui/src/index.ts`**

```ts
export { turniTheme } from './theme';
export { TurniAntdProvider } from './provider';
```

- [ ] **Step 7: Delete the old Radix-based files**

```bash
rm packages/ui/src/index.tsx packages/ui/src/tailwind.css packages/ui/src/__tests__/primitives.spec.tsx
```

- [ ] **Step 8: Add `antd` to the root `package.json`**

`apps/core-site` and `apps/web` have no `package.json` of their own (see Global Constraints), so importing `from 'antd'` directly in Task 2 and Task 3 needs it declared in the root `dependencies`, not only in `packages/ui/package.json`. In root `package.json`, add (alphabetically, right after `@nestjs/platform-fastify`, before `drizzle-orm`):

```json
"antd": "^6.6.1",
```

- [ ] **Step 9: Install dependencies**

Run: `npm install` (from repo root)
Expected: `antd`, `@ant-design/nextjs-registry`, `@ant-design/cssinjs` appear under `node_modules`; `@radix-ui/react-slot` is gone from `packages/ui`'s resolved tree.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts packages/ui/src/__tests__/theme.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): replace Radix primitives with a shared AntD theme and provider"
```

---

## Task 4: Root workspace cleanup — drop Tailwind

*(Runs after Tasks 2 and 3: until both apps' `layout.tsx` stop importing `@turni/ui/tailwind.css`, that string is still present in the tree, so the "nothing references Tailwind" check below would fail if run earlier. `antd` was already added to root `package.json` in Task 1, Step 8, since Task 2 needed it.)*

**Files:**
- Modify: `package.json` (repo root)
- Delete: `postcss.config.mjs` (repo root — its only plugin was `@tailwindcss/postcss`; Next.js applies its own minimal PostCSS defaults with no config file present, and nothing else in the repo emits Tailwind directives)

- [ ] **Step 1: Edit root `package.json` devDependencies**

Remove these two lines entirely:

```json
"@tailwindcss/postcss": "^4.3.3",
"tailwindcss": "^4.3.3",
```

- [ ] **Step 2: Delete the Tailwind PostCSS config**

```bash
rm postcss.config.mjs
```

- [ ] **Step 3: Confirm nothing else references Tailwind**

Run: `grep -rn "tailwind" --include="*.ts" --include="*.tsx" --include="*.scss" --include="*.json" apps packages | grep -v node_modules`
Expected: no output (Tasks 1 through 3 must already have removed every reference; if this still shows a hit, stop and resolve it before continuing)

- [ ] **Step 4: Reinstall to prune the removed packages**

Run: `npm install` (from repo root)
Expected: exits 0; `tailwindcss`, `@tailwindcss/postcss` no longer in `node_modules`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json postcss.config.mjs
git commit -m "chore: drop Tailwind from the workspace"
```

---

## Task 2: Migrate `apps/core-site` to Ant Design

**Files:**
- Create: `apps/core-site/src/app/fonts/manrope-variable.ttf` (vendored, binary)
- Modify: `apps/core-site/src/app/layout.tsx`
- Modify: `apps/core-site/src/app/globals.scss`
- Modify: `apps/core-site/src/site/nav.tsx`
- Modify: `apps/core-site/src/blocks/hero/hero.tsx`
- Modify: `apps/core-site/src/blocks/case-cards/case-cards.tsx`
- Modify: `apps/core-site/src/blocks/lead-form/lead-form.tsx`
- Modify: `apps/core-site/src/blocks/lead-form/lead-form-shell.tsx`

**Interfaces:**
- Consumes: `TurniAntdProvider` from `@turni/ui` (Task 1).
- Consumes: `antd`'s `Button` and `Input` (including `Input.TextArea`) directly — no more `@turni/ui` component imports anywhere in this app after this task.

- [ ] **Step 1: Vendor the Manrope font file**

Manrope is a variable font with full Cyrillic coverage in one file (unlike e.g. Plus Jakarta Sans, which only ships a `cyrillic-ext` subset missing the core Cyrillic range — verified against the live Google Fonts CSS). Vendoring the source file means the app never contacts Google Fonts at build or run time, satisfying `layout-font.spec.ts`.

```bash
mkdir -p apps/core-site/src/app/fonts
curl -sL "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf" \
  -o apps/core-site/src/app/fonts/manrope-variable.ttf
```

Expected: a ~165 KB file appears at that path. (Licensed under the SIL Open Font License — see `https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt`.)

- [ ] **Step 2: Update `apps/core-site/src/app/layout.tsx`**

Replace the whole file:

```tsx
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { TurniAntdProvider } from '@turni/ui';
import './globals.scss';
import { Footer } from '../site/footer';
import { Nav } from '../site/nav';
import { siteNavigation, siteSettings } from '../content/site-pages';

const manrope = localFont({
  src: './fonts/manrope-variable.ttf',
  weight: '400 800',
  display: 'swap',
  variable: '--font-body'
});

/**
 * Шапка и подвал одинаковы на всех страницах и приходят из настроек сайта,
 * а не из блоков страницы: редактор задаёт их один раз.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, nav] = await Promise.all([siteSettings.get(), siteNavigation.get()]);

  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <TurniAntdProvider>
          <Nav
            brand={settings.brand}
            nav={nav}
            navCta={settings.navCta}
          />
          <main>{children}</main>
          <Footer
            footerContacts={settings.footerContacts}
            footerLegalLinks={settings.footerLegalLinks}
            footerNote={settings.footerNote}
          />
        </TurniAntdProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update `apps/core-site/src/app/globals.scss`**

Change line 16 from:

```scss
  font-family: var(--font-sans), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

to:

```scss
  font-family: var(--font-body), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

(`--font-sans` was never defined anywhere in the repo — this wires the real vendored font in for the first time. The `@use '@turni/ui/tokens.scss';` line at the top of this file stays exactly as-is: `tokens.scss` still exists and still defines every `--turni-*` variable that the 18 block `.module.scss` files read.)

- [ ] **Step 4: Migrate `apps/core-site/src/site/nav.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the CTA rendering (was `<Button asChild><a href={navCta.href}>{navCta.label}</a></Button>`):

```tsx
        {navCta ? (
          <Button type="primary" href={navCta.href}>
            {navCta.label}
          </Button>
        ) : null}
```

- [ ] **Step 5: Migrate `apps/core-site/src/blocks/hero/hero.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the primary CTA (was `<Button asChild><a href={primaryCta.href}>{primaryCta.label}</a></Button>`):

```tsx
            <Button type="primary" size="large" href={primaryCta.href}>
              {primaryCta.label}
            </Button>
```

- [ ] **Step 6: Migrate `apps/core-site/src/blocks/case-cards/case-cards.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the empty-state CTA (was `<Button asChild><a href={emptyState.cta.href}>{emptyState.cta.label}</a></Button>`):

```tsx
              <Button type="primary" href={emptyState.cta.href}>
                {emptyState.cta.label}
              </Button>
```

- [ ] **Step 7: Migrate `apps/core-site/src/blocks/lead-form/lead-form.tsx`**

Change the import:

```tsx
import { Input } from 'antd';
```

Change every `<Textarea id="lead-task" name="task" rows={5} />` to:

```tsx
            <Input.TextArea id="lead-task" name="task" rows={5} />
```

(The three `<Input>` usages — `lead-name`, `lead-contact`, `lead-company` — need no prop changes, only the import.)

- [ ] **Step 8: Migrate `apps/core-site/src/blocks/lead-form/lead-form-shell.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the submit button (was `<Button type="submit" disabled={state === 'sending'}>`):

```tsx
      <Button type="primary" size="large" htmlType="submit" loading={state === 'sending'}>
        {state === 'sending' ? 'Отправляем…' : submitLabel}
      </Button>
```

(AntD reserves `type` for the button's own visual variant — `htmlType` is the native `type` attribute. `loading` replaces `disabled` here since AntD's loading state already disables the button and shows a spinner.)

- [ ] **Step 9: Verify the existing font test still passes**

Run: `npx vitest run --config vitest.config.ts apps/core-site/src/app/__tests__/layout-font.spec.ts`
Expected: PASS — the new layout still contains neither `from 'next/font/google'` nor `Inter(`.

- [ ] **Step 10: Run the full core-site test suite**

Run: `npx vitest run --config vitest.config.ts apps/core-site/src`
Expected: all suites PASS, including `schema-parity.spec.ts` and `design-tokens.spec.ts` (both untouched by this task, since content schemas and `site.scss` rhythm tokens are unaffected).

- [ ] **Step 11: Typecheck**

Run: `npx tsc -p apps/core-site/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/core-site
git commit -m "feat(core-site): migrate to AntD components and a self-hosted Manrope font"
```

---

## Task 3: Migrate `apps/web` (owner cabinet) to Ant Design

**Files:**
- Create: `apps/web/src/app/fonts/manrope-variable.ttf` (vendored, binary — same file as Task 2, copied so each Next app resolves its own local font path)
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.scss`
- Modify: `apps/web/src/app/(auth)/auth-forms.tsx`
- Modify: `apps/web/src/app/(cabinet)/agent/create-agent-button.tsx`
- Modify: `apps/web/src/app/(cabinet)/agent/knowledge/knowledge-controls.tsx`
- Modify: `apps/web/src/app/(cabinet)/agent/markdown-editor.tsx`
- Modify: `apps/web/src/app/(cabinet)/dashboard/sign-out-button.tsx`
- Modify: `apps/web/src/__tests__/ui-integration.spec.tsx`

**Interfaces:**
- Consumes: `TurniAntdProvider` from `@turni/ui` (Task 1).
- Consumes: `antd`'s `Button` and `Input` (including `Input.TextArea`) directly.

- [ ] **Step 1: Vendor the Manrope font file for this app**

```bash
mkdir -p apps/web/src/app/fonts
cp apps/core-site/src/app/fonts/manrope-variable.ttf apps/web/src/app/fonts/manrope-variable.ttf
```

- [ ] **Step 2: Write the failing integration test update**

Edit `apps/web/src/__tests__/ui-integration.spec.tsx` — change the two assertions that encode the old library:

```ts
    expect(auth).toContain("from 'antd'");
```

(was `expect(auth).toContain("from '@turni/ui'");`)

```ts
    expect(editor).toContain('<Input.TextArea');
```

(was `expect(editor).toContain('<Textarea');`)

Leave every other assertion in the file unchanged — they check prop text (`type="email"`, `autoComplete=`, `pattern=`, `inputMode=`, `name=`) and absence of raw `<button`/`<input`/`<textarea`, all of which stay true for the antd-based rewrite.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts apps/web/src/__tests__/ui-integration.spec.tsx`
Expected: FAIL — the source files still import from `'@turni/ui'` and render `<Textarea`.

- [ ] **Step 4: Update `apps/web/src/app/layout.tsx`**

Replace the whole file:

```tsx
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { TurniAntdProvider } from '@turni/ui';
import './globals.scss';

const manrope = localFont({
  src: './fonts/manrope-variable.ttf',
  weight: '400 800',
  display: 'swap',
  variable: '--font-body'
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Dashboard');
  return { title: t('title') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <TurniAntdProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </TurniAntdProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Update `apps/web/src/app/globals.scss`**

Replace the whole file:

```scss
@use '@turni/ui/tokens.scss';

:root {
  color-scheme: light;
  font-family: var(--font-body), system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: #f4f5f7;
  color: #17191c;
}

* { box-sizing: border-box; }
body { margin: 0; }
```

(Only the `font-family` line changes — was hardcoded `Arial, sans-serif`.)

- [ ] **Step 6: Migrate `apps/web/src/app/(auth)/auth-forms.tsx`**

Change the import:

```tsx
import { Button, Input } from 'antd';
```

Change the two submit buttons — in `OwnerEmailForm` (was `<Button className={styles['submit']} type="submit" disabled={pending}>`):

```tsx
      <Button className={styles['submit']} type="primary" htmlType="submit" loading={pending}>
        {t(flow === 'register' ? 'registerSubmit' : 'loginSubmit')}
      </Button>
```

In `OwnerCodeForm`, the submit button (was `<Button className={styles['submit']} type="submit" disabled={pending}>`):

```tsx
      <Button className={styles['submit']} type="primary" htmlType="submit" loading={pending}>
        {t('verifySubmit')}
      </Button>
```

and the resend button (was `<Button className={styles['secondary']} type="button" onClick={resend} variant="secondary">`):

```tsx
      <Button className={styles['secondary']} htmlType="button" onClick={resend}>
        {t('resend')}
      </Button>
```

Leave both `<Input>` elements (`email`, `code`) exactly as they are — only the import source changes; every prop (`type="email"`, `autoComplete`, `required`, `pattern`, `inputMode`, `maxLength`, `value`, `onChange`) passes straight through to antd's `Input`.

- [ ] **Step 7: Migrate `apps/web/src/app/(cabinet)/agent/create-agent-button.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the button (was `<Button type="button" onClick={create} disabled={pending}>`):

```tsx
      <Button type="primary" onClick={create} loading={pending}>
        {label}
      </Button>
```

- [ ] **Step 8: Migrate `apps/web/src/app/(cabinet)/agent/knowledge/knowledge-controls.tsx`**

Change the import:

```tsx
import { Button, Input } from 'antd';
```

In `NewKnowledgeFile`, change the create button (was `<Button type="button" onClick={create} disabled={pending || name.trim() === ''}>`):

```tsx
        <Button type="primary" onClick={create} loading={pending} disabled={name.trim() === ''}>
          {labels.create}
        </Button>
```

In `DeleteKnowledgeFile`, change the button (was `<Button type="button" onClick={remove} disabled={pending}>`) — this one is a destructive action, so it gets antd's `danger` styling instead of the default primary look:

```tsx
      <Button danger onClick={remove} loading={pending}>
        {label}
      </Button>
```

The `<Input id="knowledge-name" ...>` element needs no changes beyond the import.

- [ ] **Step 9: Migrate `apps/web/src/app/(cabinet)/agent/markdown-editor.tsx`**

Change the import:

```tsx
import { Button, Input } from 'antd';
```

Change the textarea (was `<Textarea value={content} onChange={...} />`) — add `autoSize` so the editor is usable at more than two visible lines, since nothing in `cabinet.module.scss` sets an explicit height:

```tsx
      <Input.TextArea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setState('idle');
        }}
        autoSize={{ minRows: 12 }}
      />
```

Change the save button (was `<Button type="button" onClick={save} disabled={state === 'saving'}>`):

```tsx
        <Button type="primary" onClick={save} loading={state === 'saving'}>
          {state === 'saving' ? labels.saving : labels.save}
        </Button>
```

- [ ] **Step 10: Migrate `apps/web/src/app/(cabinet)/dashboard/sign-out-button.tsx`**

Change the import:

```tsx
import { Button } from 'antd';
```

Change the button (was `<Button type="button" onClick={signOut} disabled={pending}>`) — kept as antd's default (non-primary) variant, since signing out isn't this page's primary action:

```tsx
      <Button onClick={signOut} loading={pending}>
        {label}
      </Button>
```

- [ ] **Step 11: Run the integration test to verify it passes**

Run: `npx vitest run --config vitest.config.ts apps/web/src/__tests__/ui-integration.spec.tsx`
Expected: PASS

- [ ] **Step 12: Run the full web test suite**

Run: `npx vitest run --config vitest.config.ts apps/web/src`
Expected: all suites PASS.

- [ ] **Step 13: Typecheck**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add apps/web
git commit -m "feat(web): migrate the owner cabinet to AntD components and a self-hosted Manrope font"
```

---

## Task 5: Full-repo verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm Tailwind is fully gone**

Run: `grep -rn "tailwind" --include="*.ts" --include="*.tsx" --include="*.scss" --include="*.json" apps packages | grep -v node_modules`
Expected: no output.

- [ ] **Step 2: Confirm `@radix-ui` is fully gone**

Run: `grep -rln "@radix-ui" --include="*.json" . --exclude-dir=node_modules`
Expected: no output.

- [ ] **Step 3: Run every workspace test suite**

Run: `npx vitest run --config vitest.config.ts`
Expected: all suites PASS (packages/ui, apps/core-site, apps/web, apps/backend if included in this config).

- [ ] **Step 4: Typecheck every touched project**

Run:
```bash
npx tsc -p apps/core-site/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
npx tsc -p packages/ui/tsconfig.lib.json --noEmit
```
Expected: no errors from any of the three.

- [ ] **Step 5: Build `apps/core-site` and run its Lighthouse gate**

```bash
cd apps/core-site
npx next build
```
Expected: build succeeds without a `CMS_BASE_URL` set (seed-only path).

Then run the existing Lighthouse CI config (`apps/core-site/lighthouserc.json`) against a served build, following whatever npm/lhci script the project already uses for this — confirm `categories:performance` still scores ≥ 0.90. If it does not, the two levers documented in Task 1 are already in place (`cssVar: true`, `hashed: false`); the next lever is trimming the Manrope weight range in Task 2 Step 2 (e.g. `weight: '400 700'` instead of `'400 800'`) rather than reverting to system fonts.

- [ ] **Step 6: Build `apps/web`**

```bash
cd apps/web
npx next build --webpack
```
Expected: build succeeds.

- [ ] **Step 7: Report to the user**

Summarize: both apps now render Ant Design components from one shared, brand-colored theme; Tailwind and Radix are gone from the workspace; typography is a self-hosted Manrope instead of system fonts / Arial; the Lighthouse gate result. Flag explicitly that the `site-layout.json` composition findings (one-width sections, `featureGrid` repeated three times, unused `bento`/`numbered-steps`/`stat-card` blocks) are **not** addressed by this migration and remain a separate follow-up.
