# Site Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец собирает страницы лендинга из блоков в админке Strapi, а `apps/core-site` рендерит их и принимает заявки, не касаясь продуктового стека.

**Architecture:** Девять блоков в `apps/core-site/src/blocks`, каждый — Zod-схема + серверный компонент + SCSS-модуль поверх CSS-переменных `@turni/ui`. Рендерер отображает `__component` динамической зоны Strapi на компонент. Источник контента читает Strapi напрямую и падает на семя в репозитории при любой проблеме. Заявки идут через route handler своего origin, который пишет в Strapi серверным токеном.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript strict, Zod, SCSS-модули, Strapi 5.50, Vitest + `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-08-16-site-blocks-design.md`

## Global Constraints

- Tailwind-классы запрещены вне `packages/ui` (правило `no-restricted-syntax` в `eslint.config.mjs`); стилизация — SCSS-модули и переменные `--turni-*`.
- Strict TS: без `any`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; каждая внешняя граница валидируется Zod.
- Тесты живут в соседнем `__tests__/`, не рядом с production-кодом.
- Контракты и миграции продукта не меняются; продуктовый бэкенд про CMS не знает.
- Ни строки копирайта в коде компонентов — контент приходит пропсами.
- Клиентский JS только в LeadForm; всё остальное — серверные компоненты.
- Контент-колонка ≤1120px, текст ≤720px, тач-цели ≥44px, body ≥16px.
- Тело заявки и ответы CMS не логируются.

---

### Task 1: Слой блоков и рендер главной из семени

**Files:**
- Create: `apps/core-site/src/page-schema.ts`
- Create: `apps/core-site/src/blocks/<name>/{schema.ts,<name>.tsx,<name>.module.scss}` — nav, hero, feature-grid, steps, security-list, case-cards, faq, lead-form, footer
- Create: `apps/core-site/src/block-renderer.tsx`
- Create: `apps/core-site/src/styles/blocks.scss`
- Create: `apps/core-site/src/content/seed/home.json`
- Create: `apps/core-site/src/content/seed-page.ts`
- Modify: `apps/core-site/src/app/page.tsx`, `apps/core-site/src/app/globals.scss`, `apps/core-site/src/app/__tests__/page.spec.tsx`
- Test: `apps/core-site/src/__tests__/{blocks.spec.tsx,block-renderer.spec.tsx,seed.spec.ts}`

**Interfaces:**
- Produces: `SitePageSchema` (`{slug,title,description?,blocks:SiteBlock[]}`), `SiteBlock` — union по `__component`; `renderBlocks(blocks): ReactNode[]`; `seedPage(slug): SitePage | undefined`.
- Consumes: `Button`, `Input`, `Textarea` из `@turni/ui`.

- [ ] **Step 1: Написать падающий тест схемы и рендерера**

```tsx
it('renders every block of a page in order', () => {
  const markup = renderToStaticMarkup(<>{renderBlocks(seedPage('home')!.blocks)}</>);
  expect(markup.indexOf('data-block="blocks.hero"'))
    .toBeLessThan(markup.indexOf('data-block="blocks.footer"'));
});

it('skips a block the frontend does not know yet', () => {
  const markup = renderToStaticMarkup(
    <>{renderBlocks([{ __component: 'blocks.unknown' } as never])}</>
  );
  expect(markup).toBe('');
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm run nx -- run core-site:test`
Expected: FAIL — модулей `site/*` ещё нет.

- [ ] **Step 3: Схемы блоков и схема страницы**

Каждая `schema.ts` экспортирует Zod-схему с литеральным `__component` и тип пропсов.
`page-schema.ts` собирает `z.discriminatedUnion('__component', [...])` и `SitePageSchema`.

- [ ] **Step 4: Девять компонентов и SCSS-модули**

Каждый компонент — серверный, ставит `data-block="blocks.<name>"` на корневую секцию,
берёт контент только из пропсов. FAQ — нативные `details/summary`. LeadForm — обычная
HTML-форма (`method="post" action="/api/leads"`) с honeypot-полем и чекбоксом согласия.

- [ ] **Step 5: Рендерер и семя**

`block-renderer.tsx` — карта `__component` → компонент, неизвестный ключ пропускается.
`home.json` — нейтральные заглушки по структуре L1 (S1–S10).

- [ ] **Step 6: Главная страница из семени**

`page.tsx` рендерит `seedPage('home')`; `globals.scss` подключает `blocks.scss`.

- [ ] **Step 7: Прогнать проверки**

Run: `npm run nx -- run-many -t test,typecheck,lint,build -p core-site,ui`
Expected: PASS.

- [ ] **Step 8: Коммит**

```bash
git add apps/core-site && git commit -m "feat(core-site): add the site block layer"
```

---

### Task 2: Контент-модель Strapi и чтение из CMS

**Files:**
- Create: `apps/cms/src/components/site/*.json` — по компоненту на блок
- Create: `apps/cms/src/api/page/content-types/page/schema.json`, `.../controllers/page.ts`, `.../routes/page.ts`, `.../services/page.ts`
- Create: `apps/core-site/src/content/cms-page-source.ts`
- Modify: `apps/core-site/src/app/page.tsx`
- Test: `apps/core-site/src/__tests__/{cms-page-source.spec.ts,schema-parity.spec.ts}`

**Interfaces:**
- Produces: `createCmsPageSource({ baseUrl, apiToken?, fetch })` → `{ getPage(slug): Promise<SitePage | undefined> }`.
- Consumes: `SitePageSchema`, `seedPage` из Task 1.

- [ ] **Step 1: Падающие тесты источника и паритета**

```ts
it('falls back to the seed when the CMS answers 500', async () => {
  const source = createCmsPageSource({ baseUrl: 'http://cms', fetch: failing });
  await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
});

it('keeps Strapi component fields in step with the Zod schema', () => {
  for (const [component, schema] of blockSchemas) {
    expect(strapiFields(component)).toEqual(zodFields(schema));
  }
});
```

- [ ] **Step 2: Прогнать и увидеть падение**

Run: `npm run nx -- run core-site:test`
Expected: FAIL — `cms-page-source` не существует.

- [ ] **Step 3: JSON-схемы компонентов и content-type `page`**

`page` — collection type с полями `slug` (uid, обязателен), `title`, `description`,
динамической зоной `blocks` со всеми девятью компонентами.

- [ ] **Step 4: Источник контента**

`fetch(`${baseUrl}/api/pages?filters[slug][$eq]=…&populate[blocks][populate]=*`)` →
`SitePageSchema.safeParse` → при любой проблеме предупреждение без тела ответа и семя.

- [ ] **Step 5: Подключить страницу к источнику**

`page.tsx` берёт `CMS_BASE_URL` из окружения; переменная не задана — сразу семя.

- [ ] **Step 6: Проверки и коммит**

Run: `npm run nx -- run-many -t test,typecheck,lint,build -p core-site`

```bash
git commit -m "feat(site): build pages from the Strapi dynamic zone"
```

---

### Task 3: Приём лидов

**Files:**
- Create: `apps/cms/src/api/lead/content-types/lead/schema.json` и стандартные controller/route/service
- Create: `apps/core-site/src/app/api/leads/route.ts`
- Create: `apps/core-site/src/leads/lead-request.ts`
- Modify: `apps/core-site/src/blocks/lead-form/lead-form.tsx` (состояния отправки)
- Test: `apps/core-site/src/__tests__/lead-intake.spec.ts`

**Interfaces:**
- Produces: `handleLeadRequest(request, { fetch, baseUrl, apiToken })` → `Response`.
- Consumes: блок `LeadForm` из Task 1.

- [ ] **Step 1: Падающие тесты приёма**

```ts
it('refuses a lead without the personal-data consent', async () => {
  const response = await handleLeadRequest(formRequest({ consent: undefined }), deps);
  expect(response.status).toBe(422);
  expect(written).toHaveLength(0);
});

it('writes one lead for a repeated idempotency key', async () => {
  await handleLeadRequest(formRequest({}, 'key-1'), deps);
  await handleLeadRequest(formRequest({}, 'key-1'), deps);
  expect(written).toHaveLength(1);
});
```

- [ ] **Step 2: Прогнать и увидеть падение**

Run: `npm run nx -- run core-site:test`
Expected: FAIL.

- [ ] **Step 3: Коллекция `lead` в Strapi**

Поля: `name`, `contact`, `company`, `task`, `channels`, `hasServer`, `timeline`,
`consentAt`, `idempotencyKey` (unique). Публичных прав на `create` нет.

- [ ] **Step 4: Route handler**

Zod-разбор `FormData`, honeypot, обязательное согласие, запись серверным токеном,
нейтральный текст ошибки, без логирования тела.

- [ ] **Step 5: Состояния формы**

Клиентский компонент: спиннер в кнопке, блокировка повторного клика, ошибка под полем без
потери значений; без JS форма по-прежнему отправляется.

- [ ] **Step 6: Проверки и коммит**

Run: `npm run nx -- run-many -t test,typecheck,lint,build -p core-site`

```bash
git commit -m "feat(site): accept leads through the site route handler"
```
