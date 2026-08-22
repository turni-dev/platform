<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Проектирование — ревью специалистов.md" -->

# Ревью специалистов: DBA · AppSec · API · SRE (13.06.2026)

Доводка проектирования данных и API (data-and-api-design.md) до production-уровня. Это имплементационный справочник — при кодинге соответствующих задач открывать нужную секцию.

## DBA — правки схемы (главное)

- FSM-статусы: `text + CHECK`, не enum (`ALTER TYPE` — боль, drizzle их криво генерит).
- `email` → citext; FK бизнес-данных — `ON DELETE RESTRICT` (каскад опасен для аудита); chunks→revisions — CASCADE.
- Добавить: `deleted_at` (agents, memory_files, channels, users; partial uniq `WHERE deleted_at IS NULL`) · `created_by` (actions, approvals, revisions, bookings) · `conversations.unread_count_for_owner` (инкремент в той же транзакции) · `messages.content_tokens` · approvals `CHECK (num_nonnulls(action_id, message_id) = 1)` · bookings анти-дубль uniq · usage_counters через `ON CONFLICT DO UPDATE`.
- events: партиционировать помесячно СРАЗУ (20М/год; retention = DROP PARTITION; «потом» = перенос 20М строк под нагрузкой). messages — год можно без партиций, но `ts` заложить в PK-кандидаты.
- RLS-канон: `nullif(current_setting('app.tenant_id', true), '')::uuid` (fail-closed: NULL/пустой GUC после SET LOCAL → 0 строк) · роль `app_rw` NOBYPASSRLS, НЕ владелец таблиц · `withTenant` = транзакция + `set_config(..., true)` первым стейтментом · assert на установленный tenant · REVOKE INSERT/UPDATE/DELETE на глобальных (prompts, model_configs) от `app_rw` · SECURITY DEFINER — аудит каждой.
- Индексы: партиальные на горячие пути (`approvals WHERE decision IS NULL`, `actions WHERE status IN (...)`) · HNSW m=16/ef=64, partial `WHERE embedding_model='current'` · `conversations` fillfactor=85 (HOT-апдейты last_msg_at) · `events` btree (tenant,name,ts), не BRIN (всегда есть tenant-фильтр).
- Миграции: drizzle-kit SQL руками ревьюим (любит DROP/CREATE) · NOT NULL в два шага · `CREATE INDEX CONCURRENTLY` вне транзакции (отдельные файлы) · seed идемпотентным `ON CONFLICT`.
- Объём год-1 ≈ 25–30 ГБ. Retention: messages 90 дн → Parquet в S3 → batched DELETE; events-партиции → Parquet → DROP.
- Топ-ошибки: SET вместо SET LOCAL+пул (межтенантная утечка — худший инцидент) · events без партиций · jsonb-фильтры без generated columns · CREATE INDEX без CONCURRENTLY на проде · суперюзер-коннект воркера обходит RLS.

## AppSec (главное)

- Email-код: argon2-хэш кода в Postgres, TTL 5 мин, 3 запроса/email/15 мин, 5 попыток на код, lockout 30 мин; единый ответ «код отправлен». Код безопаснее magic-link (Outlook-сканеры сжигают ссылки).
- Сессии: opaque 32Б в httpOnly+Secure+SameSite=Lax cookie, хранилище Postgres; ротация id при логине; idle 7 дн / absolute 30 дн; + Origin-проверка на мутирующих (Lax не закрывает всё).
- Гость: JWT HS256 `{tenant, agent, guest_session, scope, exp 1ч}`, в первом WS-фрейме (не в query — логи!); привязка к `__Host-` cookie; QR-токен одноразовый 60 с. `widget_key`: домен-биндинг по Origin + CORS per key + rate limits (10 сессий/час/IP, 30 msg/мин) + altcha при аномалии — LLM-токены = деньги.
- Ключи: sops/age master → per-purpose data keys (`KEY_PHONE_V1`, `KEY_CREDENTIALS_V1`, `PEPPER_V1`); версия в шифртексте (`v1:`), ротация фоновым перешифрованием; pepper только в env; оффлайн-бэкап age-ключа у двоих + квартальный тест restore (бэкап БД без ключа бесполезен).
- Вебхуки: TG — secret header constant-time + дедуп `update_id` (SETNX 24ч); ЮKassa — не верить payload, re-fetch `GET /payments/{id}` + `payment_events(event_id UNIQUE)`; всё → `webhook_inbox` → 200 сразу → асинхронная обработка.
- Worker — главная RLS-дыра: джоба обязана получать `tenant_id` в payload и открывать `withTenant`; «голый» db в worker запрещён линтером. CI-grep на `sql.raw(`.
- Виджет: рендер ответов агента = XSS-вектор №1 (poisoned RAG → `<img onerror>`): markdown-сабсет + DOMPurify; embed только iframe; postMessage с проверкой origin per key; standalone — `frame-ancestors 'none'`.
- SSRF-guard заранее (для будущего URL-fetch агента): блок приватных диапазонов + metadata, без редиректов в приват.
- До пилота (ранжировано): 1) RLS fail-closed+worker-контекст (2–3 дн); 2) DOMPurify+iframe (1–2 дн); 3) rate limits+lockout+Origin (1–2 дн); 4) идемпотентность вебхуков (1 дн); 5) иерархия ключей+бэкап (1–2 дн).

## API-архитектор (главное)

- Approval-карточка обязана нести контекст: `reason` (enum), `policy_rule_id`, `confidence`, `rag_sources[] {file, excerpt, score}`, `conversation_excerpt` — иначе владелец решает вслепую (и UI делает доп. запросы).
- Добавить: `POST /approvals/bulk-decision` → 207 Multi-Status · `GET /inbox/counters` (бэйджи) · фильтры списков · `/healthz` + `/readyz` (вне v1, без auth) · `POST /tenant/export` → 202+Location (и `DELETE /tenant` — 202, soft 30 дн) · onboarding answer с `step_id`, конфликт FSM → 409 + текущий state · test-chat → 202+run_id, дельты через SSE · `GET .../revisions/:rev` (diff для rollback).
- Идемпотентность: таблица `idempotency_keys` в Postgres (не Redis — потеря = двойная бронь); повтор → сохранённый ответ; тот же ключ, другой hash → 422.
- Конкурентность: memory PUT — `If-Match: rev` → 412 + актуальная ревизия (без заголовка — 428); approvals decision — `UPDATE WHERE status='pending'`, проигравший → 409 + `decided_by`/`decided_at` («уже одобрено Машей»); undo_token валиден 30 с → 410.
- Ordering: per-conversation `seq bigint` из БД (не ULID — clock skew); cursor по seq.
- WS: auth первым фреймом (таймаут 5 с → close 4401) · ping 25 с · resume: `last_seq` → дослать из Postgres (источник правды) · лимит 5 неподтверждённых отправок · деплой → close 1012, reconnect с jitter.
- SSE: один мультиплекс ок · event id из Redis Stream per-tenant (MAXLEN 10k/24ч) · переполнение буфера → `sync.required` → refetch · `X-Accel-Buffering: no` + `: ping` 15 с.
- Эволюция: v1 additive-only (клиенты игнорируют неизвестные поля), `oasdiff breaking` блокирует merge; виджет — только через loader `widget.js` с нашего CDN (авто-апдейт бандла).
- DX: `zod-openapi` → спека артефактом CI · свой тонкий fetcher (orval лишний в монорепо) · schemathesis в CI · prism-mock для фронта. Есть чек-лист «API готов к фронту» (10 пунктов, полный текст — в исходной заметке).

## SRE (главное)

- Пулы (self-host PG, 27.06): сами задаём `max_connections` (≈100, под RAM DB-VPS) → api 10, worker 15, staging 5×2. PgBouncer не ставить пока (не нужен при ~30 коннектах; поднять при >3 инстансах). Self-host = на нас тюнинг `shared_buffers`/`work_mem`/`effective_cache_size` под RAM DB-VPS. Контейнеры: api 1.5G, worker 2G, redis 768M (`noeviction`+AOF — иначе BullMQ теряет джобы).
- Деградации: Yandex AI Studio down/timeout → CB 60 с + retry/backoff другой Yandex-моделью + delayed-джобы; гостю через 10 с «отвечу через минуту», через 3 мин эскалация владельцу. Второй provider — опционально позже, не блокирует MVP. Redis down → api пишет входящие в Postgres-inbox (outbox-паттерн), reconciler разгребает при подъёме — диалоги не теряются. TG-вебхук: только валидация+inbox+202 за <50 мс.
- Метрики: `pipeline_stage_duration{stage}` против бюджета · queue depth/age · llm_cost counter · ws_connections; tenant — только в трейсы (кардинальность Mimir free 10k серий!). Tempo: sample 10% ok / 100% errors и >8 с.
- Алерты v1: p95>10с/5мин · oldest job>120с · LLM errors>20% · healthcheck fail 2 мин (внешний) · cost rate >$X/час (защита кошелька).
- Деплой: compose scale + nginx reload ≈ почти zero-downtime; WS close 1012; worker SIGTERM → дождаться active (`stop_grace_period` 30 с); миграции ДО, только expand/contract.
- Capacity: 1 VPS 4/8 тянет год-1 с запасом ×3 (узкое место — RAM worker и event-loop, не CPU). k6 на staging с мок-LLM (3с±1с): диалог-штурм 10 rps / WS 1000 коннектов / залп 2000 вебхуков.
- Runbook «VPS умер»: RTO 20–30 мин, RPO 0 по данным (DBaaS+PITR; Redis-очереди восстанавливаются reconciler'ом из inbox). Учения раз в квартал.
