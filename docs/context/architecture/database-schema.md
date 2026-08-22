<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Схема БД — детально.md" -->

# Схема БД — детально (DDL-уровень)

Источник для задачи E1.4.

## Конвенции

- PK `id uuid` (UUIDv7, генерится в приложении — сортируемые).
- `created_at timestamptz NOT NULL DEFAULT now()` везде.
- Статусы — `text + CHECK`, не enum (решение DBA).
- FK бизнес-данных — `ON DELETE RESTRICT`.
- Все tenant-таблицы: `tenant_id uuid NOT NULL REFERENCES tenants` + **FORCE RLS**, политика `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` (fail-closed).
- Мягкое удаление — `deleted_at timestamptz NULL` где указано.

## Ядро тенанта

**tenants** (без RLS): `name`, `plan CHECK IN ('trial','start','pro')`, `status CHECK IN ('active','paused','deleted')`, `settings jsonb` (тихие часы, шаблоны фраз, sla_minutes).

**locations**: `tenant_id`, `name`, `tz DEFAULT 'Europe/Moscow'`, `address`, `deleted_at`.

**users**: `tenant_id`, `role CHECK IN ('owner','staff')`, `email citext`, `tg_chat_id bigint`, `notify_prefs jsonb`, `last_seen_at`, `deleted_at`. UNIQUE `(tenant_id, email) WHERE deleted_at IS NULL`.

**sessions**: `user_id FK`, `token_hash bytea UNIQUE`, `ip inet`, `ua text`, `idle_expires_at`, `absolute_expires_at`. Index `(user_id)`; чистка cron'ом.

**auth_codes**: `email citext`, `code_hash text` (argon2), `attempts smallint`, `expires_at`, `consumed_at`. Index `(email, expires_at)`.

## Агент и каналы

**agents**: `tenant_id`, `name`, `template DEFAULT 'dining'`, `status CHECK IN ('draft','training','active','paused')`, `autonomy jsonb` (тумблеры по категориям), `deleted_at`.

**channel_connections**: `tenant_id`, `agent_id FK`, `type CHECK IN ('telegram','widget')`, `credentials_enc` (формат `v1:iv:ct:tag`), `webhook_secret`, `allowed_origins text[]` (для widget), `status CHECK IN ('pending','active','error','disabled')`, `meta jsonb`, `deleted_at`. UNIQUE `(tenant_id, type, (meta->>'bot_username')) WHERE deleted_at IS NULL`.

**guests**: `tenant_id`, `phone_hash bytea` (HMAC), `phone_enc`, `phone_masked`, `name`, `meta jsonb`, `first_seen_at`, `last_seen_at`. UNIQUE `(tenant_id, phone_hash)`; phone-поля nullable (гость до идентификации).

## Диалоги

**conversations**: `tenant_id`, `agent_id`, `guest_id NULL`, `connection_id FK`, `status CHECK IN ('active','handed_off','closed')`, `last_msg_at`, `closed_at`, `unread_for_owner int DEFAULT 0`. Index `(tenant_id, last_msg_at DESC)`; `fillfactor=85`.

**messages**: `conversation_id FK`, `tenant_id`, `seq bigint` (per-conversation последовательность в транзакции), `role CHECK IN ('guest','agent','owner','system')`, `content text`, `content_tokens int`, `verdict jsonb` (snapshot: level, confidence, rule_ids), `latency_ms int`, `prompt_ref text` (`key@ver`), `model_id text`. UNIQUE `(conversation_id, seq)`; index `(tenant_id, created_at)`.

**actions**: `tenant_id`, `conversation_id`, `tool`, `payload jsonb`, `status CHECK IN ('proposed','pending_approval','executing','done','undone','cancelled','failed')`, `undo_deadline`, `error`, `created_by uuid NULL` (users), `executed_at`. Partial index `(tenant_id) WHERE status IN ('proposed','pending_approval','executing')`.

**approvals**: `tenant_id`, `action_id FK NULL`, `message_id FK NULL`, CHECK `(num_nonnulls(action_id, message_id) = 1)`, `reason text` (enum-словарь: refund, complaint, banquet, allergen_miss, out_of_kb, low_confidence, policy_rule), `policy_rule_id`, `confidence numeric(3,2)`, `card jsonb` (черновик+контекст), `rag_sources jsonb` (`[{file, excerpt, score}]`), `sla_deadline`, `decision CHECK IN ('approved','edited','rejected','expired') NULL`, `edited_payload jsonb`, `edit_diff`, `decided_by FK users NULL`, `decided_at`. Partial index `(tenant_id, sla_deadline) WHERE decision IS NULL`.

**bookings**: `tenant_id`, `location_id FK`, `guest_id FK`, `conversation_id NULL`, `at timestamptz`, `party_size smallint CHECK (party_size > 0)`, `status CHECK IN ('requested','confirmed','seated','no_show','cancelled')`, `note`, `created_by`. UNIQUE `(tenant_id, location_id, guest_id, at) WHERE status NOT IN ('cancelled','no_show')`; index `(tenant_id, location_id, at)`.

## Память и политики

**memory_files**: `tenant_id`, `agent_id`, `path`, `current_rev int DEFAULT 1`, `status CHECK IN ('active','pending_approval','archived')`, `pin_to_context bool DEFAULT false`, `deleted_at`. UNIQUE `(agent_id, path) WHERE deleted_at IS NULL`.

**memory_revisions**: `file_id FK CASCADE`, `rev int`, `content text`, `author CHECK IN ('owner','agent','system')`, `source_approval_id FK NULL`, `created_by NULL`. UNIQUE `(file_id, rev)`; immutable (UPDATE запрещён триггером).

**memory_chunks**: `tenant_id`, `file_id FK CASCADE`, `rev int`, `idx int`, `heading_path`, `text`, `tokens int`, `embedding vector(768)`, `embedding_model text`. HNSW `(embedding vector_cosine_ops) WITH (m=16, ef_construction=64)` partial `WHERE embedding_model = '<current>'`; index `(tenant_id, file_id)`. Текущая модель: Yandex Text Embeddings v2 (768 измерений); `EmbeddingsGigaR` — 2560, требует отдельной миграции.

**policies**: `tenant_id`, `agent_id`, `path`, `layer CHECK IN ('locked','custom')`, `compiled jsonb`, `enabled bool DEFAULT true`, `updated_by`. locked-строки сидируются платформой, UPDATE по ним запрещён политикой RLS на роль `app_rw`.

## Платформенные таблицы (глобальные, без RLS; app_rw — только SELECT)

- **prompts**: `key`, `version int`, `content`, `model_hints jsonb`, `active bool DEFAULT false`, `created_by`. UNIQUE `(key, version)`; partial UNIQUE `(key) WHERE active`; immutable-строки.
- **model_configs**: `role CHECK IN ('classify','generate','complex','judge','embed')`, `tier CHECK IN ('cheap','main','premium')`, `model_id`, `price_in numeric(8,4)`, `price_out numeric(8,4)`, `active bool`.
- **eval_cases**: `vertical`, `input`, `history jsonb`, `golden`, `risk_label CHECK IN ('safe','risky','blocked')`, `must_refuse bool`, `source CHECK IN ('manual','edited','synthetic')`.

## Аналитика и служебные таблицы

**events** — PARTITION BY RANGE (created_at), помесячно, партиции создаются cron'ом. `tenant_id uuid NULL`, `name text` (конвенция `context.entity.action`: `dialog.message.received`, `approval.card.decided`), `version smallint DEFAULT 1`, `actor jsonb` (`{type: guest|owner|agent|system, id}`), `props jsonb`. Index `(tenant_id, name, created_at)`; append-only.

Конверт события (стандарт для events и очередей):
```json
{ "event_id": "uuid7", "name": "approval.card.decided", "version": 1,
  "tenant_id": "...", "occurred_at": "ISO", "actor": {"type":"owner","id":"..."},
  "correlation_id": "run_id", "props": { ... типизировано в contracts ... } }
```
Правила: имена только из реестра в contracts (typed union); смена структуры props = version+1, старые консьюмеры не ломаются; `correlation_id` связывает всю цепочку run'а (он же trace id в Tempo).

**Слой для Metabase** (semantic views, читают events+таблицы): `vw_dialogs_daily` (tenant, day, total, auto_resolved, escalated, avg_latency); `vw_approvals_weekly` (reason, decision, time_to_decision); `vw_onboarding_funnel`; `vw_llm_cost_daily` (model, tokens, cost); `vw_bookings_value` (брони × средний чек тенанта). Петли улучшения: `approvals.edit_diff` → `eval_cases` (source='edited'); `events: dialog.no_answer` → «вопросы без ответа» → пополнение памяти.

- **usage_counters**: `(tenant_id, period date, metric text)` PK, `value bigint` — `INSERT ... ON CONFLICT DO UPDATE SET value = value + EXCLUDED.value`.
- **idempotency_keys**: `key text PK`, `tenant_id`, `request_hash`, `response jsonb`, `status_code smallint`, `expires_at` (в Postgres, не Redis).
- **webhook_inbox**: `source CHECK IN ('telegram','yookassa')`, `external_id`, `payload jsonb`, `status CHECK IN ('received','processed','failed')`, `error`. UNIQUE `(source, external_id)`.
- **subscriptions**: `tenant_id`, `plan`, `status CHECK IN ('trialing','active','past_due','paused','cancelled')`, `current_period_start/end`.
- **invoices**: `tenant_id`, `subscription_id`, `amount numeric(10,2)`, `currency char(3) DEFAULT 'RUB'`, `status CHECK IN ('draft','sent','paid','void')`, `due_at`, `paid_at`.
- **payment_events**: `provider`, `event_id UNIQUE`, `payment_id`, `payload jsonb`, `processed_at`.

## Retention

- messages: 90 дн горячих → Parquet в S3 → batched DELETE.
- events: партиции >12 мес → Parquet → DROP PARTITION.
- webhook_inbox / auth_codes / sessions / idempotency: cron-чистка.
- бэкап: DBaaS PITR + ночной `pg_dump` → S3 (30 дн).
