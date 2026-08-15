# UI kit: shadcn/Radix foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing shared UI primitives into a themeable shadcn/Radix-style foundation whose Tailwind usage is confined to `packages/ui`.

**Architecture:** `packages/ui` keeps the public `Button`, `Input`, and `Badge` exports and owns its Tailwind entry stylesheet. Tailwind v4 generates only utilities sourced from the package and maps semantic utility names to `--turni-*` variables; Preflight is omitted to avoid global resets in consuming applications. `Button` uses Radix Slot only for explicit `asChild` composition.

**Tech Stack:** React 19, TypeScript, Radix Slot, Tailwind CSS v4, PostCSS, Sass tokens, Vitest, Nx.

---

## File structure

- Create `postcss.config.mjs`: activates the Tailwind v4 PostCSS plugin at the monorepo build boundary.
- Create `packages/ui/src/tailwind.css`: imports Tailwind theme/utilities without Preflight, restricts source discovery to the UI package, and exposes semantic token-backed colors.
- Create `packages/ui/src/__tests__/primitives.spec.tsx`: server-rendered public-contract and stylesheet tests.
- Modify `package.json` and `package-lock.json`: add the Tailwind/PostCSS toolchain and the UI package's Radix runtime dependency.
- Modify `packages/ui/package.json`: declare `@radix-ui/react-slot` as an explicit package dependency.
- Modify `packages/ui/src/index.tsx`: implement the stable dumb primitives with Tailwind utility classes and Radix Slot composition.
- Modify `packages/ui/src/tokens.scss`: add semantic sizing/focus/disabled variables needed to remove fixed component styling values.
- Delete `packages/ui/src/primitives.scss` and `packages/ui/src/ui.spec.tsx`: the former is replaced by Tailwind utilities and the latter moves to the required sibling test directory.

### Task 1: Prove and implement the themeable primitive contracts

**Files:**
- Create: `packages/ui/src/__tests__/primitives.spec.tsx`
- Create: `postcss.config.mjs`
- Create: `packages/ui/src/tailwind.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/tokens.scss`
- Delete: `packages/ui/src/primitives.scss`
- Delete: `packages/ui/src/ui.spec.tsx`

- [ ] **Step 1: Write the failing public-contract test**

Create `packages/ui/src/__tests__/primitives.spec.tsx` with this complete test file. It deliberately demands a Radix `asChild` button and a Tailwind stylesheet that do not exist yet.

```tsx
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge, Button, Input } from '../index.js';

describe('UI primitives', () => {
  it('renders native accessible primitives and composes a button child', () => {
    const button = renderToStaticMarkup(
      <Button className="custom-button" variant="primary">Action</Button>
    );

    expect(button).toContain('type="button"');
    expect(button).toContain('data-variant="primary"');
    expect(button).toContain('custom-button');
    expect(
      renderToStaticMarkup(
        <Button asChild variant="secondary"><a href="/agents">Agents</a></Button>
      )
    ).toMatch(/^<a href="\/agents"[^>]*data-variant="secondary"[^>]*>Agents<\/a>$/);
    expect(
      renderToStaticMarkup(<Input aria-label="Field" invalid />)
    ).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<Input aria-label="Optional field" />))
      .not.toContain('aria-invalid');
    expect(renderToStaticMarkup(<Badge tone="success">Status</Badge>))
      .toContain('data-tone="success"');
  });

  it('keeps Tailwind utilities token-backed and excludes global Preflight', async () => {
    const [tokens, styles] = await Promise.all([
      readFile(new URL('../tokens.scss', import.meta.url), 'utf8'),
      readFile(new URL('../tailwind.css', import.meta.url), 'utf8')
    ]);

    expect(tokens).toContain('--turni-accent');
    expect(tokens).toContain('--turni-control-height');
    expect(styles).toContain('@import "tailwindcss/theme.css" layer(theme);');
    expect(styles).toContain('@import "tailwindcss/utilities.css" layer(utilities) source(none);');
    expect(styles).toContain('--color-turni-accent: var(--turni-accent);');
    expect(styles).not.toContain('preflight.css');
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
```

- [ ] **Step 2: Verify that the new contract fails for the right reason**

Run: `npm run nx -- test ui`

Expected: FAIL because `Button` does not yet render its child for `asChild` and because `packages/ui/src/tailwind.css` cannot be read.

- [ ] **Step 3: Install the minimum documented dependencies**

Run these commands from the repository root:

```powershell
npm install -D tailwindcss @tailwindcss/postcss
npm install -w @turni/ui @radix-ui/react-slot
```

Expected: `package-lock.json`, root `package.json`, and `packages/ui/package.json` record the dependency graph; no files outside the repository are changed.

- [ ] **Step 4: Add the isolated Tailwind entry and PostCSS plugin**

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
};
```

Create `packages/ui/src/tailwind.css`:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);
@source "./index.tsx";

@theme inline {
  --color-turni-surface: var(--turni-surface);
  --color-turni-surface-subtle: var(--turni-surface-subtle);
  --color-turni-text: var(--turni-text);
  --color-turni-text-muted: var(--turni-text-muted);
  --color-turni-border: var(--turni-border);
  --color-turni-accent: var(--turni-accent);
  --color-turni-accent-contrast: var(--turni-accent-contrast);
  --color-turni-success: var(--turni-success);
  --color-turni-warning: var(--turni-warning);
  --color-turni-danger: var(--turni-danger);
  --color-turni-focus-ring: var(--turni-focus-ring);
}
```

The stylesheet intentionally omits `tailwindcss/preflight.css`, so importing a primitive cannot reset consumer application elements.

- [ ] **Step 5: Replace the component implementation with typed dumb primitives**

Replace `packages/ui/src/index.tsx` with:

```tsx
import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import './tokens.scss';
import './tailwind.css';

function classes(...classNames: Array<string | undefined>): string {
  return classNames.filter((className): className is string => className !== undefined && className !== '').join(' ');
}

const buttonClassName = classes(
  'inline-flex',
  'min-h-[var(--turni-control-height)]',
  'items-center',
  'justify-center',
  'rounded-[var(--turni-radius-md)]',
  'border',
  'border-transparent',
  'bg-turni-accent',
  'px-[var(--turni-space-4)]',
  'text-turni-accent-contrast',
  'outline-none',
  'focus-visible:outline-[var(--turni-focus-width)]',
  'focus-visible:outline-turni-focus-ring',
  'focus-visible:outline-offset-[var(--turni-focus-offset)]',
  'disabled:cursor-not-allowed',
  'disabled:opacity-[var(--turni-disabled-opacity)]'
);

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean;
  variant?: 'primary' | 'secondary';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ asChild = false, className, type = 'button', variant = 'primary', ...props }, ref) {
    const sharedProps = {
      ...props,
      className: classes(
        buttonClassName,
        variant === 'secondary' && 'bg-turni-surface text-turni-text border-turni-border',
        className
      ),
      'data-variant': variant
    };

    if (asChild) {
      return <Slot {...sharedProps} ref={ref} />;
    }

    return <button {...sharedProps} ref={ref} type={type} />;
  }
);
Button.displayName = 'Button';

export type InputProps = ComponentPropsWithoutRef<'input'> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid = false, ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        className={classes(
          'min-h-[var(--turni-control-height)] w-full rounded-[var(--turni-radius-sm)] border border-turni-border bg-turni-surface px-[var(--turni-space-3)] text-turni-text outline-none focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] aria-invalid:border-turni-danger',
          className
        )}
        aria-invalid={invalid || undefined}
      />
    );
  }
);
Input.displayName = 'Input';

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ className, tone = 'neutral', ...props }, ref) {
    return (
      <span
        {...props}
        ref={ref}
        className={classes(
          'inline-flex rounded-[var(--turni-radius-sm)] bg-turni-surface-subtle px-[var(--turni-space-2)] py-[var(--turni-space-1)] text-[length:var(--turni-font-size-sm)] text-turni-text data-[tone=success]:text-turni-success data-[tone=warning]:text-turni-warning data-[tone=danger]:text-turni-danger',
          className
        )}
        data-tone={tone}
      />
    );
  }
);
Badge.displayName = 'Badge';
```

Replace `packages/ui/src/tokens.scss` with:

```scss
:root {
  --turni-surface: #ffffff;
  --turni-surface-subtle: #f4f5f7;
  --turni-text: #17191c;
  --turni-text-muted: #5d6570;
  --turni-border: #cbd1d8;
  --turni-accent: #176b4d;
  --turni-accent-contrast: #ffffff;
  --turni-success: #147447;
  --turni-warning: #8a5800;
  --turni-danger: #b42318;
  --turni-focus-ring: #1b65c1;
  --turni-radius-sm: 4px;
  --turni-radius-md: 8px;
  --turni-space-1: 4px;
  --turni-space-2: 8px;
  --turni-space-3: 12px;
  --turni-space-4: 16px;
  --turni-control-height: 40px;
  --turni-font-size-sm: 12px;
  --turni-focus-width: 3px;
  --turni-focus-offset: 2px;
  --turni-disabled-opacity: 0.55;
  --turni-font-body: Arial, sans-serif;
}
```

Delete `packages/ui/src/primitives.scss` because all primitive styling now lives in Tailwind classes and the token-backed Tailwind entry. Delete the old colocated test file after its assertions have moved to the new test file.

- [ ] **Step 6: Verify the green test suite and static quality targets**

Run:

```powershell
npm run nx -- test ui
npm run nx -- typecheck ui
npm run nx -- lint ui
```

Expected: each command exits 0. The test target reports both primitive contract tests as passed; typecheck confirms the Slot/ref boundary; lint permits Tailwind class names because they remain in `packages/ui`.

- [ ] **Step 7: Commit the completed UI foundation slice**

Run:

```powershell
git add package.json package-lock.json postcss.config.mjs packages/ui/package.json packages/ui/src
git commit -m "feat(ui): add tokenized radix primitives"
```

Expected: exactly the UI dependency/configuration/source/test changes are committed; concurrent VK files remain unstaged and untouched.

## Plan self-review

- Spec coverage: Task 1 preserves the three public primitives, adds Radix composition, confines Tailwind source discovery to `packages/ui`, omits global Preflight, relies only on CSS variables for visual values, moves tests to `__tests__`, and verifies test/typecheck/lint targets.
- Placeholder scan: no unresolved items or deferred implementation phrases remain.
- Type consistency: `asChild`, `variant`, `invalid`, and `tone` use the same names in the public test and implementation; `tailwind.css` is the same file inspected by the test and imported by the package entrypoint.
