<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Переиспользование developer-ai — spec.md", "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Переиспользование developer-ai — W1 план.md" -->

# Переиспользование developer-ai

## Цель

Использовать проверенный код из `C:\Users\rudin\dev\developer-ai` для Turni, уменьшая объём новой разработки без переноса несовместимой архитектуры или ослабления требований безопасности.

Источник-донор: 277 TypeScript-файлов клиентской части (99 тестов) и 614 серверных (170 тестов). Перенос идёт по реестру: взять / адаптировать / не брать. Массового копирования каталога нет.

## Неподвижные границы Turni

- Внешние контракты принадлежат `@turni/contracts`; на границах Zod.
- Guest transport: native WebSocket + signed guest session; гостю не стримить итог LLM.
- LLM только за `LlmPort`; vendor SDK только в platform integrations.
- PII перед LLM и логами редактируется fail-closed; пользовательский текст не попадает в логи/трейсы.
- Tenant data: `withTenant`, FORCE RLS, NOBYPASSRLS; никаких tenant-less cache/search путей.
- PolicyEngine default-deny; денежные, аллергены, жалобы и любые действия требуют approval.
- PostgreSQL+pgvector (768), Yandex embeddings; не Weaviate/Ollama/TypeORM.
- UI strings через next-intl; Tailwind только в `packages/ui`.

## Реестр кандидатов на перенос

| Донор | Решение | Целевое место | Условия |
|---|---|---|---|
| `apps/client/src/ui` | Взять с адаптацией | `packages/widget` | Shadow DOM/custom elements, layout, launcher/modal, responsive viewport, themes, consent, input, message list, menu, suggestion rail, forms, loading/error states. Убрать старые aliases/контракты |
| `apps/client/src/ui/components/message-list` | Взять с адаптацией | `packages/widget` | Markdown только через DOMPurify allowlist; рендер не должен автоматически исполнять LLM output |
| `apps/client/src/shared/lib/base-component.ts` | Взять с адаптацией | `packages/widget` | Сохранить lifecycle/cleanup/style mechanism; убрать `any`, внешнюю загрузку CSS и неиспользуемую i18n-связность |
| `apps/client/src/shared/lib/{escape-html,event-emitter,backoff}` | Взять с адаптацией | `packages/widget/src/shared` | Строгие типы; deterministic jitter/clock для тестов |
| `apps/client/src/features/{messaging,connection,session}` | Адаптировать | `packages/widget/src/transport` | Перенести state/reconnect/queue идеи. Заменить Socket.IO, JWT, chatId и persistent message queue на Turni WS events, signed guest session и безопасную in-memory очередь |
| `apps/client/src/features/{history,feedback,voice,widget-config,i18n}` | В каталог будущих функций | `packages/widget` + соответствующие backend-модули | Реализовывать только с отдельным HTTP/WS contract, policy и tenant ownership; не копировать endpoint paths |
| `apps/client/src/shared/lib/markdown/sanitize-html.ts` и XSS tests | Взять с адаптацией | `packages/widget` | Сохранить строгий allowlist URI/tags, `noopener noreferrer`, negative XSS tests |
| `apps/server/src/shared/utils/{clock,resilience,http-origin}` | Взять с адаптацией | `apps/backend/src/platform` | Clock/fake clock, retry/timeout, origin normalisation. Вынести только framework-neutral code |
| `apps/server/src/shared/utils/circuit-breaker.util.ts` | Адаптировать | `platform/integrations/llm/resilience` | Взять half-open semantics и тесты; circuit key = tenant/provider/model или provider/model по назначению; только typed retryable errors учитываются |
| `apps/server/src/infrastructure/security/{cors,crypto,services/api-key-registry}` | Адаптировать | `platform/security` или http entrypoint | Origin allowlist, HMAC and timing-safe comparison, hashed API key registry. Не переносить Nest guards, JWT/cookie identity |
| `apps/server/src/infrastructure/observability/{prometheus,health,tracing}` | Адаптировать | `platform/observability` | HTTP/queue/LLM metrics, health readyness, correlation structure. Trace attrs only redacted metadata; no raw text |
| `apps/server/src/domain/ai/services/ai-cancellation.service.ts` | Адаптировать | `agent-core/application` + Redis adapter | AbortController lifecycle + Pub/Sub idea; run identity должен быть tenant-scoped и валидироваться Zod |
| `apps/server/src/shared/agents/utils/llm-pricing.util.ts` | Адаптировать | reporting/cost service | Переиспользовать формулу/тесты, но цены/резолюция модели из `model_configs`; никакого хардкода OpenAI-прайсинга |
| `response-parsing`, quick replies, cache | Переосмыслить позже | FrontLine/agent-core | Можно использовать test cases и pure normalisers, но сначала policy/eval; cache key SHA-256/HMAC и tenant+policy/prompt/model snapshot |
| vector math, metadata filter ideas | Точечно адаптировать | memory module | Только pure algorithms; текущая схема/чанкер/RLS/pgvector остаются каноничными |

## Запрещённые переносы

- Socket.IO, `socket.io-client`, старые API paths, `chatId` ownership и JWT flow.
- Nest decorators/guards/modules как готовый security-module.
- TypeORM, Weaviate, Ollama, LangChain-bound agents, старые prompt/orchestrator flows.
- `hash.util.ts` с MD5.
- `redactForLog` и `redactForStore` в текущем виде: previews пользовательского текста запрещены.
- `captureText`: сохраняет полный prompt/response в trace.
- Persistent browser outbox с телами сообщений.
- Коммерческий `TT Commons Pro` до отдельного подтверждения лицензии для Turni.

## Волны реализации

### W1. Виджет: безопасное визуальное ядро

Создать рабочий `packages/widget`: сборка, public API, custom element, Shadow DOM, tokenized styles, responsive launcher/modal, message list, composer, loading/error/consent и keyboard accessibility. Наследуются тесты на DOM lifecycle, viewport, scroll boundaries, visible states и XSS. В этот этап входят только текущие Turni events: guest session issue/resume и native WS. Без history/voice/feedback/config endpoint.

### W2. Транспорт и контракт

Определить Zod transport DTO в `@turni/contracts`. Widget adapter реализует reconnect/backoff, dedup, session resume, typing, no-token-stream guest flow. Очередь не хранит message bodies persistently; mutation использует idempotency keys на бэкенде.

### W3. Platform utilities and observability

Добавить framework-neutral ports/adapters: CORS/origin validation, pino-safe redaction, HMAC helper где нужно, half-open resilience, timeout/retry, correlation IDs, health/readiness и Prometheus metrics. Любой worker access — tenant-scoped.

### W4. Отдельные capabilities

History, feedback, voice/TTS, remote widget config, quick replies, response cache и cancellation — каждая становится отдельной карточкой. Их запуск зависит от policy, tenancy, audit и API contract. Site-assistant остаётся вне продуктового скоупа; его код может использоваться только как референс для изолированных алгоритмов/тестов.

## W1: рабочий план (детально)

**Цель:** создать `@turni/widget` как рабочий и тестируемый Shadow DOM guest-chat widget, который использует текущие Zod WS contracts Turni и не переносит Socket.IO/JWT/PII persistence.

**Архитектура:** `packages/widget` — boundary library, зависит только от `@turni/contracts` и DOMPurify. Содержит: pure `WidgetState` reducer; `WidgetTransport` с injectable WebSocket factory, native WS, session resume и bounded in-memory outbox; `turni-chat-widget` custom element с изолированным визуальным состоянием, HTML escaping/sanitisation, типизированными событиями; default CSS scoped to Shadow DOM. Backend contract остаётся в `packages/contracts/src/ports/widget-chat.ts`. W1 не меняет contracts или backend database.

**Точки донора:** `apps/client/src/shared/lib/base-component.ts` (lifecycle/cleanup discipline, но без `any` и без remote CSS); `apps/client/src/shared/lib/{backoff,event-emitter,escape-html}.ts`; `apps/client/src/shared/lib/markdown/sanitize-html.ts` (строгий DOMPurify allowlist); `apps/client/src/ui/layout/{widget,widget-view,widget-scroll-boundary}.ts`; `apps/client/src/features/{connection,messaging,session}` (только паттерны state/reconnect).

### Задачи

1. **Nx package skeleton.** Файлы: `packages/widget/{package.json,project.json,tsconfig.lib.json,tsconfig.build.json}`, `packages/widget/src/index.ts`; изменить `eslint.config.mjs`, добавить DOMPurify в root package.json. Тест: `index.spec.ts`. Ожидание: `nx run widget:test|typecheck|lint|build` распознают проект; public API экспортирует только widget-owned типы/функции.

2. **Safe render primitives.** Файлы: `shared/safe-html.ts` (+spec), `shared/backoff.ts` (+spec). Ожидание: sanitizer имеет tag/URI allowlists, блокирует script/event-handler/style/data URI, добавляет `rel="noopener noreferrer"` к якорям; escape-функция даёт text-only вывод для произвольных строк; backoff bounded, cancellable, принимает deterministic random source для тестов.

3. **Stateful native WS transport.** Файлы: `transport/widget-transport.ts` (+spec), `transport/types.ts`, `transport/index.ts`. Требуемый API:
   ```ts
   type WidgetTransportConfig = Readonly<{
     url: string;
     sessionToken: string;
     webSocketFactory: (url: string) => WebSocketLike;
     newClientMessageId: () => string;
   }>;

   class WidgetTransport {
     connect(): void;
     disconnect(): void;
     sendMessage(text: string): boolean;
     sendTyping(): boolean;
     subscribe(listener: (event: WidgetServerEvent) => void): () => void;
   }
   ```
   Ожидание: отправляет `session.resume` сразу после открытия сокета; парсит каждое событие через `WidgetServerEventSchema` и игнорирует невалидный payload; отправляет `message.send` только после `session.ok`; хранит только bounded in-memory очередь текстовых сообщений во время reconnect, никогда не пишет сообщения/токен в browser storage; reconnect использует bounded backoff; дублирующиеся user messages сохраняют client UUID; API стриминга гостевого вывода не вводится.

4. **Custom element и визуальное взаимодействие.** Файлы: `components/turni-chat-widget.ts` (+spec), `components/widget-state.ts` (+spec), `components/widget-styles.ts`; изменить `index.ts`. Требуемый внешний интерфейс:
   ```ts
   customElements.define('turni-chat-widget', TurniChatWidget);

   widget.configure({
     websocketUrl: string,
     guestSessionToken: string,
     position?: 'bottom-right' | 'bottom-left',
     locale?: 'ru'
   });
   ```
   Ожидание: open/close launcher, desktop fixed position и mobile full-screen dialog; accessible composer с send button; user text рендерится escaped; guest `message.new`, `status.typing`, `error` и `session.ok` состояния рендерятся из текущего контракта; `aria-live` анонсирует agent message/status; disconnect компонента уничтожает transport/listeners/timers; никаких hard-coded remote font/assets и Tailwind.

5. **Integration and security verification.** Файлы: `widget-contract.integration.spec.ts`; при необходимости расширить `apps/backend/src/entrypoints/http/app.spec.ts`. Ожидаемые тесты: expired/tampered token → видимое invalid-session состояние; malformed WS payload не рендерится и не throws; XSS-строка не создаёт script/event attributes в Shadow DOM; reconnect повторно отправляет `session.resume`, а не невалидированный payload; widget никогда не принимает и не отображает draft/token-stream событие; прогон widget test/typecheck/lint/build + backend test/typecheck/lint/build.

### Out of scope для W1

History, feedback, TTS/voice, forms, remote configuration, quick replies, cache, cross-instance cancellation, Prometheus/health и platform utilities — отдельные планы после W1/W2.

### Definition of done (W1)

- Зелёный изолированный widget package и backend regression suite.
- Widget не импортирует donor source в рантайме, нет Socket.IO/JWT/TypeORM/Weaviate/LangChain зависимостей.
- Browser memory/persistence не содержит guest token или текст сообщений после disconnect.
- Весь код на strict TypeScript, тесты пишутся раньше production-реализации.

## Testing and acceptance (общее для переноса)

- Каждый импортированный модуль сохраняет или получает эквивалентный Vitest test; тесты не импортируют donor code в рантайме.
- Новый widget bundle, source и deps проходят текущий widget size gate (≤70 KB, когда карточка достигнет этого критерия).
- Contract tests покрывают malformed HTTP/WS messages, expired/tampered guest token, reconnect/dedup, XSS payloads и отказ стримить guest LLM tokens.
- Security tests покрывают CORS allowlist, missing/invalid origin, timing-safe verification, redaction, отсутствие raw user content в pino/traces.
- Typecheck strict без `any`, lint, backend/widget build и eval gate там, где добавлено agent behavior.
- Никаких изменений в `packages/contracts` или миграциях БД без ревью фаундера.

## Правило миграции

Каждый implementation PR должен ссылаться на эту спеку и явно называть donor-файлы. Описание PR фиксирует: (1) решение copied/adapted/reimplemented; (2) удалённую donor-зависимость и несовместимость; (3) Turni boundary (contract, policy, tenant, PII); (4) унаследованные/новые тесты.

## Открытые решения

- Подтвердить лицензию или заменить `TT Commons Pro` до любого переноса активов.
- Выбрать bundle build baseline для `packages/widget` (Vite library mode — вариант реализации, ещё не принят).
- Определить продуктовый приоритет будущих карточек history/feedback/voice/remote config после W2.
