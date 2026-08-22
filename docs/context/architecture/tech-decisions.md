<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Тех-решения (консилиум).md", "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Вопросы по технической части.md", "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Архитектура и задачи разработки.md" -->

# Тех-решения, стек и задачи разработки

## Стек (финал консилиума, 13.06 с уточнениями до 27.06/10.07)

Nx-монорепо · NestJS (Fastify), модульный монолит, домены общаются только через contracts (nx module boundaries) · Drizzle ORM · Postgres+pgvector (self-host DB-VPS) · Redis+BullMQ · XState (FSM) · Next.js + shadcn (Tailwind только в `ui/`) + SCSS · RU-first/Yandex-first LLM за `LlmPort` (YandexGPT + Yandex Text Embeddings primary; второй провайдер опционально позже — см. llm-runtime.md) · Grafana Cloud.

## Сводная таблица решений консилиума

Роли консилиума: Software Architect, AI Engineer, DevSecOps, Tech Lead/Team Lead. Вход — 45 вопросов фаундера (раздел «Вопросы и ответы фаундера» ниже). Решения, принятые вопреки предпочтениям фаундера, помечены отдельно — вето остаётся за фаундером.

| Тема | Решение |
|---|---|
| Репозиторий | Nx-монорепо (apps: api, web, worker; packages: widget; libs: contracts, db, domain/*, shared/*) |
| Бэкенд | NestJS (Fastify), модульный монолит, домены общаются только через contracts |
| db в libs | Да — api и worker нуждаются в одной схеме и RLS-хелперах; иначе монолит склеится (спорный вопрос, решён в пользу этого) |
| ORM | Drizzle — RLS через `withTenant()` тривиален, типизированный SQL, LLM-дружелюбен |
| Очереди | BullMQ + Redis; мониторим глубину, age, failed, noeviction, AOF. Kafka не сейчас, события уже в contracts |
| Temporal | Отказ; SLA-таймеры = delayed jobs, отчёты = repeatable, ретраи встроенные |
| FSM | XState (решение фаундера 14.06, замена своей либы): персистентность в Postgres, переход = audit-запись, property-based тесты переходов. Применять: approval, бронь, онбординг, run; НЕ применять: диалог, CRUD, UI |
| Реалтайм | WS — виджет (двунаправленный, готовые сообщения); SSE — кабинет (стрим черновиков владельцу); Redis pub/sub между worker и api |
| Стриминг гостю | НЕТ в MVP (консилиум против желания фаундера про токен-за-токеном): риск рождается в выходе (галлюцинация про аллергены), guard на лету её не ловит. Гостю — typing-индикатор + ответ целиком после policy (~6,2 с p95 бюджет). Владельцу в кабинет — стрим без ограничений |
| Модели (вайтлист в model_configs) | Пересмотрено 27.06 на RU-first (см. llm-runtime.md): классификация — YandexGPT Lite / AI Studio Classifier; ответы — YandexGPT Pro 5.1; сложное — YandexGPT Pro/Alice AI LLM по eval. Второй provider опционально позже |
| Embeddings | Решено 10.07: `vector(768)`, primary Yandex Text Embeddings v2. Sber EmbeddingsGigaR (2560) и bge-m3 (1024) требуют отдельной миграции/индекса. Порог cosine ≥0.45 перекалибровать на RU-эвале |
| Чанкинг | Секция `##`, >500 ток → по `###`/абзацам с заголовком-префиксом; top-4 (не 6), cosine ≥0.45; ниже порога → out_of_kb → эскалация; файлы ≤800 ток (часы, аллергены) — целиком через `pin_to_context`; re-rank — нет |
| Risk-каскад | Ур.0 regex/словари из policies (≤5 мс, risk намертво) → ур.1 flash-lite structured output → ур.2 при confidence<0.8. Итог = max. FN ≤2% на сете ≥300 рисковых, гейт в CI |
| Промпты | В БД, immutable-версии, active по одному на key, Redis-кеш+pubsub; `prompt_key@version` в каждый event; active=true ставит только CI после зелёного eval |
| Fallback LLM | Yandex-first: retry/circuit breaker внутри Yandex AI Studio → очередь+деградация → при полном отказе «передал владельцу». Второй провайдер добавляется позже только по факту |
| Стили | shadcn+Tailwind только внутри `ui/` (vendor-код, не трогаем руками, тема через CSS-vars), всё кастомное — SCSS-модули, линтер запрещает tailwind-классы вне `ui/`. Mantine и свой кит отклонены (решение консилиума против вкуса фаундера, который не любит Tailwind) |
| TG-бот клиента | BotFather-мастер в MVP (deep-link, проверка токена live, автонастройка после вставки); Managed Bots — MVP-2 за интерфейсом `BotProvisioner` (консилиум отложил хотелку фаундера про Managed Bots сразу; new API нужен, бан мастер-бота = ложатся все) |
| Политики владельца | Фаундер хотел «редактировать всё» → компромисс: 3 слоя — locked-каркас (аллергены, деньги, анти-джейлбрейк — read-only «защита платформы») + свободные (тон, меню, акции) + safeguards: LLM-линт конфликтов, обязательный dry-run на последних 20 диалогах с диффом, откат в клик, алерт при скачке эскалаций ×2 |
| Мульти-точка | `tenants→locations` в схему сразу (nullable location_id), UI потом. Данные у нас = source of truth, наружу — экспорт/синк |
| Виджет фаундера | Принимаем в `packages/widget` после чек-листа: Shadow DOM/изоляция · ≤70KB gzip · WS-reconnect+восстановление сессии · XSS/без ключей в клиенте · TS+контракты из contracts. ≥2 провала — рефакторим |
| Инфра | Пересмотрено 27.06: self-host Postgres (без DBaaS). Timeweb: prod-app VPS + отдельный DB-VPS с Postgres+pgvector+citext (ставим сами) + staging. Приватная сеть, наружу 443. Плюс: контроль расширений/версий, нет лимита DBaaS; минус: бэкапы/PITR/HA/апгрейды на нас |
| Файлы | Timeweb S3 (не MinIO в проде — лишний stateful-сервис); MinIO в local compose (S3-код один) |
| Деплой | GHCR → ssh `compose pull && migrate && up -d`; deploy-юзер с ограниченным ключом; prod по тегу + manual approve (GitHub environments). Не watchtower |
| Мониторинг | Grafana Cloud free + Alloy-агент; UptimeRobot; алерты в TG (p95>10с, очереди, cost, rejected) |
| PII | `phone_hash` (HMAC+pepper в sops) для матчинга + `phone_encrypted` (AES-GCM app-level) для показа/уведомлений + `phone_masked` для списков. Хэш-онли отклонён (убивает показ владельцу). pino redact + regex-санитайзер, тела сообщений в логи не пишем. Redaction перед LLM: имя/телефон/email → плейсхолдеры до отправки, обратная подстановка после ответа. Yandex-first — основной рантайм MVP, локализация в РФ; второй provider только позже по eval/доступности с обязательным redaction/policy; RU-only-флаг per-tenant для чувствительных вертикалей |
| ЮKassa | «Сразу» = каркас таблиц (subscriptions/invoices/payment_events) + заявка на онбординг (3–7 дней lead time) + тестовый магазин сейчас; боевая интеграция — спринт перед первым платящим |
| Бэкапы | Self-host: сами настраиваем — WAL-archiving + PITR (pgBackRest/wal-g → S3) + ежедневный `pg_dump`→S3, retention 30 дн; квартальный restore-drill обязателен (нет управляемого отката) |
| Git | Trunk-based: ветки ≤2 дн, PR ≤400 строк, фичефлаги. Фронт-дев мержит сам при: зелёный CI + Claude Code review-бот + не тронуты CODEOWNERS-файлы (contracts, миграции); фаундер смотрит только границы + демо 2×/нед |
| Mini-спеки | 5 строк (цель/вход/выход/критерии/ловушки), готовит ИИ-ассистент днём, спека = первый коммент в issue |

## Структура монорепо (принята)

```
apps/ api · web · worker (тот же Nest-код, entrypoint BullMQ)
packages/ widget (publishable, контракты из libs/contracts)
libs/ contracts · db · domain/{channels, agent-core, memory, policy, approvals, reporting, tenancy} · shared/{fsm, llm}
```

Правило: domain-либы зависят только от contracts/db/shared; друг от друга — через события в contracts.

## Бюджет латентности (p95, типовой кейс ≈6,2 с из 10)

Ingress+дедуп 150 мс → правила ур.0 5 мс → [embedding ∥ классификатор] 800 мс → retrieve+промпт 100 мс → генерация 3000 мс → policy-проверка ответа 1200 мс → persist+отправка 300 мс → резерв ~4,4 с.

## Очереди BullMQ

`inbound` · `agent-run` (concurrency на tenant) · `approvals-sla` (delayed, cancel при решении) · `reports` (repeatable cron) · `integrations`. LLM: 3 ретрая exp backoff, jobId=runId (идемпотентность); `removeOnFail:false` + алерт.

## Первая неделя фаундера (порядок)

1. Скелет Nx+Nest+Drizzle+CI до прода («hello world в проде» за день 1–2; бутстрап-скрипты → tools/bootstrap, токены в sops).
2. Домены tenants+agents + contracts-границы (задаёт паттерн модулей).
3. Пайплайн v0: TG webhook → BullMQ → FSM → LLM → ответ (без политик).
4. Policy-слой + typing-индикатор (безопасность раньше красоты).
5. Промпты в БД + ручной eval-скрипт.

Кабинет и виджет — неделя 2 (фронт-дев + приёмка виджета по чек-листу).

---

## Вопросы и ответы фаундера (контекст решений)

Опыт фаундера: Node.js (Nest.js), Golang (Gin), REST/WebSocket, PostgreSQL, Redis, Kafka, SQL, Strapi (backend); JS/TS, React, Next.js, Webpack, Vite, SCSS, Storybook, GSAP, Redux Toolkit, Zustand, Jest (frontend); MCP, RAG, Weaviate, LangChain, OpenAI/Claude, Ollama, CoT/ReAct/ToT (AI/данные); Git, Cloud, Prometheus, Grafana, Docker, CI/CD, Nginx, Figma, Jira, n8n (DevOps). AI-инструменты разработки: Codex и Claude Code.

Существующий код до старта: bootstrap на sh-файлах + инструкции для получения токенов Google Drive/Telegram/OpenRouter, всё в Docker на VPS.

Ключевые предпочтения фаундера, повлиявшие на решения (часть принята консилиумом «как есть», часть — компромисс, отмечено выше в сводной таблице):
- NestJS (Fastify), модульный монолит с прицелом на будущее разделение на сервисы.
- Drizzle или TypeORM — решено в пользу Drizzle консилиумом.
- Не любит Tailwind, любит SCSS и shadcn/ui — компромисс: shadcn+Tailwind только в `ui/`.
- Чат гостя на WebSocket, передача ответа через SSE-пакеты.
- Redis для очередей (любит Redis), с прицелом на Kafka при переходе к микросервисам.
- Temporal — отказались, реализуем сами.
- Промпты — в БД, а не в репо.
- Стриминг гостю token-за-token — желание фаундера, консилиум решил иначе (см. таблицу выше, «Стриминг гостю»).
- Бюджет латентности p95 ≤10 с — подтверждён как жёсткий SLO.
- Embeddings — исходно предлагалось «можно через локальную модель», но опасение упереться в железо → внешний провайдер (далее RU-first Yandex, см. llm-runtime.md).
- Md-память: владелец редактирует всё, включая policies (позже консилиум ограничил policies тремя слоями — см. «Политики владельца» в таблице).
- TG-боты: Managed Bots сразу (консилиум отложил до MVP-2, BotFather-мастер в MVP).
- Веб-виджет: сразу отдельный минимальный пакет (есть готовая реализация у фаундера).
- Мульти-точка: вопрос куда пользователю удобнее получать/хранить данные — решён как `tenant→locations` в схеме сразу.
- Хостинг: Timeweb Cloud, окружения local→staging→prod, docker-compose без k8s.
- Секреты: sops-encrypted в репо.
- Домен: turni.ru.
- Файловое хранилище: рассматривался вариант в Docker — итоговое решение по S3 в сводной таблице («Файлы»).
- Бэкапы: pg_dump ежедневно в S3.
- ПДн телефонов: хэшировать чувствительные данные — итоговая схема PII в сводной таблице.
- Биллинг: ЮKassa сразу.
- Логи: маскировать PII с первого дня.
- Git-flow: trunk-based (tbd).
- Definition of Ready: mini-спеки от ИИ-ассистента перед кодингом каждой E-задачи.

## Пайплайн запроса

```
Гость (TG/веб) → Channel Adapter → Front Line (быстрый ответ?)
  да → Ответ ≤10 с
  нет → Memory+RAG retrieve → черновик ответа (LLM) → Policy Engine (safe/risky/blocked)
    safe → Ответ
    risky → Approval Service (карточка + TG-пуш; гостю «уточню») → decision (✅/✏️ → ответ, ❌ → не отправлено)
Ответ → Reporter (события, отчёты)
Approval-правка → learned/pending (подтверждение владельца)
```

Жёсткое правило: ни один ответ/действие не уходит мимо Policy Engine. Master Router в MVP — passthrough-интерфейс (заложен для мульти-агентов).

## Память (ядро дифференциации)

```
identity.md        — кто бизнес, тон (целиком в каждый промпт)
knowledge/         — меню, часы, FAQ (онбординг + правки владельца)
policies/          — md-правила риска и сценарии (AOP)
learned/YYYY-MM.md — выученное из правок, ТОЛЬКО через подтверждение
```

Хранение: md в Postgres (`memory_files` + `memory_revisions` + `memory_chunks`/pgvector). Версии таблицей, не git (мультитенантность, RLS, atomic lock). Чанкинг по `##`-заголовкам ≤500 ток. Diff правки владельца → дешёвая модель → кандидат-правило → карточка «Запомнить?».

**Уточнение модели памяти** (из ресёрча Hermes/OpenClaw/Claude Code): к `identity/knowledge/policies/learned` добавляются `venue.md`/`owner.md` — профиль заведения/владельца (средний чек, преференции, уровни одобрения, тон). Разделение `identity → soul.md` — на обсуждении.

## Модель данных — 11 таблиц (обзорно)

| Таблица | Зачем |
|---|---|
| tenants / users / agents | Организация, владелец+staff (tg_chat_id), конфиг моделей |
| guests | Идентификация по телефону, уникальность (tenant, phone) |
| memory_files / revisions / chunks | Память: контент, версии, вектора |
| conversations / messages | Диалоги; в message — snapshot вердикта, latency |
| actions / approvals | Намерения (бронь...) со статусами + undo_deadline; карточки с SLA и решением |
| policies | Индекс исполняемых правил (контент в memory_files) |
| events / usage_counters | Tracking plan (~22 события) · биллинг и rate limits |

Полная DDL-схема — в database-schema.md.

## Бэклог разработки (34 задачи, 0.5–2 дня part-time)

| Эпик | Задачи | Owner | Блокируется |
|---|---|---|---|
| E1 Скелет+CI | монорепо · docker pg+pgvector · CI+migrations · схема БД+RLS · автотест изоляции тенантов · пакет contracts | Ф/Д | — |
| E2 Пайплайн | LlmResolver + YandexGPT/YandexEmbeddings adapters (retry, degradation, токены) · event bus · веб-чат API+SSE · TG-адаптер · идентификация по телефону · FrontLine · e2e-дымовой | Ф | E1 |
| E3 Память | CRUD файлов+ревизии+lock · чанкер+retrieve · онбординг→identity/knowledge · learned-pipeline · UI md (история, diff) | Ф/Фр | E1, E5 |
| E4 Policy | PolicyEngine (md-правила + LLM) · парсер правил · eval-раннер + CI-гейт FN≤2% · датасет 50–100 кейсов | Ф | E2 |
| E5 Approval | ApprovalService+SLA · TG-нотификатор · decide+авто-ответ гостю · undo 30 с | Ф/Д | E4 |
| E6 UI | виджет чата · карточка approve · карточка learned · лента диалогов | Фр | E2–E5, прототип |
| E7 Эксплуатация | tracking 22 события · Metabase 3 дашборда · rate limits+usage · деплой РФ+бэкапы · TG-дайджест | Ф/Д | E2 |

Последовательность: E1 → E2 → (E3 ∥ E4) → E5 → E6 ∥ E7.

## Технические риски (топ-5)

| Риск | Митигация |
|---|---|
| Латентность >10 с (3–4 LLM-вызова) | Детерминированные правила без LLM · черновик и risk параллельно · быстрые модели · стриминг «печатает» · бюджет латентности в трейсах с E2 |
| Пропуск риска (FN>2%) | Датасет до тюнинга · блокирующий CI-гейт · fail-closed при низком confidence |
| Конкурентные записи памяти | Optimistic lock по `current_rev` · learned только через pending |
| RLS-утечка между тенантами | FORCE RLS · непривилегированная роль · tenant_id в одном middleware · тест-матрица в CI |
| Доступ к LLM из РФ (OpenRouter заблокирован) | Решено 10.07 Yandex-first: Yandex AI Studio нативно из РФ; retry/backoff внутри Yandex → delayed-очередь → деградация до «передал владельцу»; second provider опционально позже (см. llm-runtime.md) |

## Ядровые принципы из ресёрча (приняты 14.06)

Заимствовано из Hermes/OpenClaw/Claude Code — must-have в ядро:

- Тиринг промпта `stable → context → volatile` + provider prompt-caching. Стабильный префикс (soul/политики/инструменты) кешируется; изменчивое (snapshot памяти, retrieved-чанки, время) — отдельно. Экономия input-токенов (цель LLM-COGS ≤10% MRR) + латентность.
- Frozen-snapshot памяти на сессию: правки пишутся на диск, но не мутируют уже собранный промпт до новой сессии/форс-ребилда.
- Files = source of truth, индекс производный: md каноничен, вектора/FTS — производные, переиндексация свободная.
- Iteration budget на tool-loop (макс. итераций на диалог, стоп со сводкой) — защита от runaway (OWASP LLM10).
- Read-only вспомогательные шаги, действия — через approval: классификация/retrieve только читают; бронь/отправка — через policy/approval (OWASP LLM06).
- Fallback по ролям моделей: classify/generate/judge/embed — у каждой своя цепочка fallback; автомат активации на 429/5xx/401 + refresh.
- Учёт стоимости per-conversation (токены in/out + cache) → дашборд cost/resolution + per-tenant cost circuit-breaker (LLM10).

## Регламент: cron-планирование + retention/удаление (14.06)

### Планировщик

Очереди по приоритету (раздельные): `realtime` (inbound, agent-run — высший приоритет) · `sla` (delayed approval-таймеры) · `scheduled` (отчёты, follow-up, напоминания, кампании) · `maintenance` (cleanup, архивация, partition pre-create, retro-eval, бэкап, cost-rollup — низший, off-peak). Durable (BullMQ, AOF) и ephemeral — разные Redis/логические БД.

Анти-thundering-herd: никогда «всем тенантам в 10:00» — окно (пн 8:00–11:00 по tz локации) + джиттер по `hash(tenant_id)`, батчами с лимитом concurrency. Per-tenant concurrency cap. Глобальный лимит параллелизма воркера + backpressure. Рассылки/кампании rate-limited (лимиты каналов, напр. TG 30 msg/s) + дневное окно.

Надёжность: идемпотентный `jobId` (tenant+date+type), exp backoff, dead-letter+алерт, `removeOnFail:false`. Catch-up без шторма: после простоя reconciler разбирает пропущенные delayed-джобы rate-limited. TZ-aware расписание. Наблюдаемость: queue depth/age, job duration, fail rate (алерт oldest-job>120с).

Реестр cron-джоб: approval SLA-таймеры (per-event delayed, sla) · недельный отчёт (пн, окно 3ч по tz + джиттер, scheduled) · follow-up/напоминания (per-booking delayed, scheduled) · кампании возврата (по триггеру, rate-limited, scheduled) · ночной retro-eval (ежедневно, maintenance) · cost-rollup/usage_counters (ежечасно, maintenance) · cleanup inbox/auth/sessions/idemp (ежедневно, maintenance) · partition pre-create events (ежемесячно, maintenance) · архивация→S3+DELETE messages (ежедневно батчами, maintenance) · бэкап pg_dump→S3 (ежедневно ночью, maintenance) · retention/inactivity sweep (ежедневно, maintenance).

### Retention / удаление

| Класс | Хранение | Действие |
|---|---|---|
| messages | 90 дн hot | → Parquet S3; risk-flagged (аллерген/жалоба/компенсация) — дольше (~1 год, юр-споры) → DELETE |
| events | партиции >12 мес | → Parquet S3 → DROP PARTITION |
| webhook_inbox / auth_codes / sessions / idempotency | дни | cron-чистка |
| memory_revisions | пока агент активен | immutable; purge при удалении агента/тенанта |
| guests (PII) | по активности | гость без обращений N мес → анонимизация PII (phone_hash для дедупа остаётся, phone_enc/name стираются) |
| bookings | N мес после даты | агрегат в отчёт → обезличить |
| usage_counters / invoices | дольше | по юр-требованиям (счета ИП/УСН ~4–5 лет) |

Неактивность: тенант без входа+диалогов 12 мес → уведомление за 30 дн → пауза → архив → удаление. Гость неактивен N мес → анонимизация PII.

Self-delete (152-ФЗ + фича): владелец self-serve в кабинете → soft-delete 30 дн grace (отменяемо) → hard-purge по всем таблицам + производным (chunks/embeddings, архивы S3) + отмена подписки. Гость (через виджет/владельца): opt-out + удаление PII конкретного гостя. Бэкапы → crypto-shredding: per-tenant ключ шифрования PII; при удалении уничтожаем ключ → данные в бэкапах нечитаемы сразу; полное физ-стирание — в окне ретенции бэкапа. Аудит удаления: факт удаления (кто/когда/объём) без самих данных — для комплаенса.

## TTL/кэш-регламент + бюджет-осознанность агента (14.06)

Принцип: всё кэшируемое имеет явный TTL + владельца инвалидации. Safety/correctness-critical (политики, активные промпты, аллергены, стоп-лист) — инвалидация событием, не TTL.

| Структура | TTL | Инвалидация |
|---|---|---|
| Provider prompt-cache (YandexGPT/second provider) | 5 мин (1 ч для долгих сессий) | — |
| Активная версия промпта/политики (Redis) | 5 мин (backstop) | событие pubsub — немедленно |
| Знания/RAG: ответы | не кэшируем (grounded, свежесть) | — |
| Эмбеддинги | persistent | при ревизии файла памяти |
| Меню/стоп-лист (iiko, MVP-2) | короткий backstop | вебхук iiko — немедленно |
| Список моделей / статус провайдера | часы | refresh-джоб |
| Rate-limit окна | = окно (мин/час) | — |
| Dedup вебхуков (update_id) | 24 ч | SETNX |
| idempotency_keys | 24–48 ч | Postgres |
| auth_codes | 5 мин · сессия кабинета idle 7 д/abs 30 д · widget-токен гостя 1 ч | logout/ротация |
| run-context snapshot памяти | per-run (frozen) | новая сессия/форс-ребилд |

Бюджет-осознанность агента — слой Execution Environment: на диалог лимит итераций tool-loop, токен/cost-бюджет, латентность-бюджет. Два уровня: система жёстко энфорсит (стоп/эскалация при превышении, per-tenant cost circuit-breaker); агент мягко осознаёт (в run-context: «это ответ гостю, 1–2 вызова, отвечай кратко»; при приближении к лимиту — заверши/эскалируй). Caveat (урок Hermes): не пихать «context-pressure»-предупреждения, от которых модель «сдаётся» рано — жёсткие лимиты в системе, агенту — спокойные правила. Прозрачность: агент отчитывается о потраченном → дашборд cost/resolution + «агент сделал X» владельцу.

## Production Playbook — 5 столпов (Databricks, 14.06)

Тезис: прод-AI на масштабе — системная задача, не выбор модели. POC не доезжают до прода из-за отсутствия фундамента (eval/observability/governance/data/orchestration).

| Столп | Принцип | У нас |
|---|---|---|
| Evaluation | Метрики с числами до кода; тест-кейсы из реальных логов; авто-грейдинг (AI-judge); синтетика отражает реальные сбои | D1–D10 + North Star; FN≤2% CI-гейт; `eval_cases` (manual/edited/synthetic); правки владельцев = разметка |
| Observability | «Не можешь воспроизвести упавший диалог за 5 мин — ты не в проде» | events + `correlation_id`=trace (Tempo) + аудит; стандарт replay диалога <5 мин |
| Governance | Агент объясняет решения + аудит + возможность вмешаться | ExplainWhy + аудит + approval/вмешательство |
| Data/Context | Опасные галлюцинации без управляемого контекста; устаревшие данные/размытая политика → вредный вывод даже у способной модели | grounded RAG + политики + event-инвалидация аллергенов/стоп-листа; «не знаю» вместо выдумки |
| Orchestration | Паттерны композиции агент/инструменты/workflow | Agent + Workflow примитивы; master-router; Execution Environment |
| Cost | Видимость: поведение, данные, вызовы инструментов, стоимость | per-conversation cost-учёт + circuit-breaker |

Sharp-апгрейды, внедрённые как стандарты:
1. Eval-first — метрики с числами до кода. Ни одна фича не стартует без определения «как меряем успех».
2. «Replay <5 мин» — обязательный стандарт observability.
3. Incident-флайвил: `detect → diagnose → contain → fix → add test case` — каждый прод-инцидент/эскалация/правка → eval-кейс (регрессия).
4. Governed context = свежесть критична: устаревший аллерген/стоп-лист/политика = опасный вывод → event-инвалидация (не TTL) для safety-critical.

## Открытые вопросы (не закрыты на момент записи)

- Чанкинг ##≤500 ток / top-6 / cosine — фаундер просил обсудить отдельно (итоговые числа top-4/cosine≥0.45 зафиксированы в сводной таблице выше, но происхождение — предмет обсуждения).
- Risk-классификатор: каскад правила→LLM только для серых зон vs LLM на всё — фаундер просил обдумать (итог — каскад, см. таблицу).
- Approval-дефолты (жалобы, возвраты/деньги, банкеты 8+, аллергены-неточно, негатив, «позови человека», всё вне базы знаний) — список предполагалось дополнить.
- Разделение `identity → soul.md` — на обсуждении.
