<!-- reference copy for design context — source of truth is packages/ui/src/tokens.scss, code is NOT moved here -->

# UI-токены — справка для дизайна

Источник истины — `packages/ui/src/tokens.scss` (CSS-переменные, единственное место, откуда их берёт код в `apps/web`, `apps/core-site`, `packages/widget`). Здесь — снимок для контекста дизайна, не редактируется напрямую; при правке токенов в коде обновите и этот файл.

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
  --turni-warning-surface: #fdf3e0;
  --turni-danger: #b42318;
  --turni-focus-ring: #1b65c1;
  --turni-control-height: 40px;
  --turni-font-size-sm: 12px;
  --turni-focus-width: 3px;
  --turni-focus-offset: 2px;
  --turni-disabled-opacity: 0.55;
  --turni-radius-sm: 4px;
  --turni-radius-md: 8px;
  --turni-space-1: 4px;
  --turni-space-2: 8px;
  --turni-space-3: 12px;
  --turni-space-4: 16px;
  --turni-font-body: Arial, sans-serif;
}
```

Единственный акцентный цвет продукта — `--turni-accent` (`#176b4d`, тёмно-зелёный), используется только на ключевых элементах (см. рамку промпта иллюстраций в [`design-ux.md`](./design-ux.md#11-иллюстрации-лист-промптов)).

**Пока не в токенах, но заявлено спекой** (см. `design-ux.md` §4.7 «Дизайн-система»): семантические цвета `--color-safe/waiting/risk/owner/agent/guest/money`, `--text-hero`, `--touch-target-min: 44px`/`--touch-target-cta: 52px`, `--radius-card: 16px`/`--radius-control: 10px`/`--radius-bubble: 18px`, `--duration-undo: 30s`. Тёмная тема — не в MVP-1, но переменные писать так, чтобы поддержать её с первого дня.

Реализация UI-кита (shadcn/Radix, где Tailwind допустим, что кастомное поверх SCSS-модулей) — `docs/superpowers/specs/2026-08-16-ui-shadcn-radix-design.md` и `docs/superpowers/specs/2026-08-16-ui-app-integration-design.md`.
