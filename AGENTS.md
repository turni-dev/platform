# AGENTS.md — Turni

Turni — платформа ИИ-сотрудников (первый шаблон «администратор общепита»). Монорепо.
**Единственный источник правды — заметки в Obsidian** (через Obsidian MCP, папка «1. Projects/Личное/ИИ сотрудник или команда»). Перед реализацией задачи открой профильную заметку. Если код и заметки расходятся — заметки главнее; не выдумывай, помечай вопросы.

## Источник правды (читать по теме)
- Обзор: «Обзор проекта», «Платформа — ядро продукта», «Решения и видение»
- Стек/решения: «Тех-решения (консилиум)», «Принятые решения — производство (свод)»
- Архитектура: «Архитектура и задачи разработки», «Порты и адаптеры», «Проектирование — данные и API», «Проектирование — ревью специалистов», «Схема БД — детально», «НФТ и фронт-архитектура»
- LLM: «LLM-рантайм — RU-first (замена OpenRouter)»
- Policy/качество: «Сценарии MVP-1 и policy-матрица», «Eval-датасет seed (MVP-1)», «Аналитика и качество», «Безопасность и доверие»
- Задачи: «Доска MVP-1» (префиксы С0…С6; бери из лейна «Готово к работе», WIP=1)

## Стек
TypeScript strict · Nx-монорепо · NestJS (Fastify) модульный монолит · Drizzle · PostgreSQL (self-host) + pgvector(1024, HNSW cosine) + citext · Redis + BullMQ · XState (FSM) · Next.js + shadcn (Tailwind только в packages/ui) + SCSS · RU-first LLM за LlmPort (GigaChat/YandexGPT primary, ProxyAPI foreign-optional) · Docker Compose (без k8s) · GHCR.

## Структура
- `apps/backend`: модульный DDD-монолит; `src/entrypoints/{http,worker}` — composition roots.
- `apps/backend/src/modules/{channels,agent-core,memory,policy,approvals,reporting,tenancy}`: каждый bounded context содержит `domain`, `application`, `infrastructure`.
- `apps/backend/src/platform`: database · queue · tenant-context · observability · integrations/{llm/{gigachat,yandexgpt,proxyapi,ru-embeddings},telegram,yookassa,s3,strapi,smtp} · fakes.
- `apps/`: web · landing · cms.
- `packages/`: contracts · ui · widget · fsm · llm. Сюда выносится только код, реально используемый несколькими системами, или стабильные внешние границы.
- `tools/bootstrap` · `ops/{compose,containers,observability,sops}` · `docs/adr/`.

Backend-модуль не импортирует `infrastructure` другого модуля. Drizzle-схемы, миграции и репозитории принадлежат bounded context; `platform/database` содержит соединение, транзакции и `withTenant`. Vendor SDK разрешён только в `platform/integrations`. `packages/llm` содержит только `LlmPort`, vendor-neutral DTO и валидацию.

Имена: npm-scope `@turni/*`; lowercase, kebab-case; английский в коде/путях/БД, UI — русский.

## Железные правила (нарушение = красный ревью)
1. Ничего мимо PolicyEngine (default-deny). Аллергены/деньги/жалобы → всегда approval (locked-политики, read-only в UI).
2. Vendor-тип не пересекает границу порта — только наши Zod-DTO (anti-corruption). Внешние сервисы только за портами; у каждого есть Fake-адаптер.
3. Мультитенантность: всё через `withTenant` (SET LOCAL app.tenant_id), FORCE RLS, роль app_rw NOBYPASSRLS. «Голый» db в worker запрещён (CI-grep на sql.raw). RLS не обходить.
4. strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `any` запрещён eslint'ом, no-floating-promises. Zod на каждой границе (HTTP/WS/очереди/env/LLM-вывод). Единственный источник типов — `@turni/contracts`.
5. Промпты в БД, immutable-версии; `active=true` ставит ТОЛЬКО CI после зелёного eval. Eval-гейт FN≤2% — блокирующий.
6. PII: redaction перед LLM (fail-closed) + hash+encrypt+mask; тела сообщений не в логи (pino redact). RU-first; foreign (ProxyAPI) только с redaction. **НЕ использовать OpenRouter** (недоступен в РФ).
7. Idempotency на мутирующих POST и вебхуках (Postgres, не Redis). Undo 30с. FSM-статусы = text+CHECK (не enum). id = UUIDv7.
8. Миграции expand/contract; `CREATE INDEX CONCURRENTLY` вне транзакции. Секреты только sops/age — не в коде/логах/промптах.
9. Гостю не стримим (policy видит весь ответ целиком) + typing-индикатор. p95 ≤10с. Агент всегда раскрывает, что он ИИ.
10. OWASP Top 10:2025 + OWASP LLM Top 10 — обязательный минимум.

## Как работать над задачей
1. Возьми задачу из «Доска MVP-1» (лейн «Готово к работе»; префикс спринта и исполнитель — в карточке). Прочитай связанную спеку-заметку.
2. Mini-спека (цель / вход / выход / критерии / ловушки) — первым комментом к задаче.
3. Trunk-based: ветка ≤2 дня, PR ≤400 строк, фичефлаги (деплой ≠ релиз).
4. DoD: PR в main · тесты + eval-гейт зелёные · события аналитики · ничего мимо policy · ADR/доки обновлены.
5. CODEOWNERS (`packages/contracts`, миграции) — без ревью фаундера не менять.

## Команды (заполнить при скаффолде)
- `npm install`
- `docker compose up` — Postgres+pgvector, Redis, MinIO
- `npm run nx -- run-many -t serve | test | lint | typecheck`
- `npm run eval` — eval-гейт (FN≤2%)
- `npm run db:migrate` — миграции (expand/contract)

## Не делать
- LLM напрямую в domain (только через `LlmPort`). OpenRouter — нет (RU-first).
- Хардкод строк UI в JSX (i18n-словарь next-intl). Tailwind вне `packages/ui`.
- Пользовательский текст в shell-командах (homoglyph/инъекции). Сырой vendor-тип за границей порта.
- Токен-стрим гостю. Прямой доступ к prod-БД в обход `withTenant`.
