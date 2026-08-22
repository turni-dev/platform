<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Проектирование — данные и API.md" -->

# Проектирование: хранение, модель данных, API

Дизайн-док уровня реализации. Контракты живут в `libs/contracts` (Zod → типы → OpenAPI генерацией). Схема доработана ревью специалистов (DBA/AppSec/API/SRE) — детали в specialist-review.md.

## 1. Векторное хранилище: pgvector, не отдельная БД

Наш масштаб: ~200 чанков/клиент × 500 клиентов ≈ 100k векторов — смешной объём для HNSW (p95 <10 мс). Изоляция тенантов — та же RLS, что и у всех данных (не отдельный механизм namespaces, как в Qdrant/Weaviate). Чанк и ревизия памяти — в одной транзакции. Эксплуатация проще: ноль новых сервисов, один бэкап.

**Решение: pgvector (HNSW, cosine), embedding vector(768).** Доступ к векторам — только через интерфейс `Memory.retrieve()`. Если когда-то упрёмся (>5–10 млн векторов или p95 retrieve >150 мс) — меняем реализацию, не код.

## 2. Модель данных (ERD, ключевые связи)

```
tenants ||--o{ locations/users/agents/guests
agents ||--o{ channel_connections/memory_files/policies
memory_files ||--o{ memory_revisions/memory_chunks
guests ||--o{ conversations
channel_connections ||--o{ conversations
conversations ||--o{ messages/actions/bookings
actions ||--o| approvals
locations ||--o{ bookings
tenants ||--o{ subscriptions/events
subscriptions ||--o{ invoices
```

Полный список таблиц с полями — см. database-schema.md. Все tenant-таблицы под FORCE RLS, id = UUIDv7 (решение №40).

Индексы первой очереди: `conversations(tenant, last_msg_at desc)` · `messages(conversation, id)` · `approvals(tenant, status, sla_deadline)` · `bookings(tenant, location, at)` · chunks HNSW + `(tenant, agent)` · `events BRIN(ts)`.

## 3. Дизайн API

Конвенции: `/api/v1`, ресурсный REST · Zod-схемы в contracts → OpenAPI · ошибки RFC 7807 (`type, title, status, detail, trace_id`) · пагинация cursor (`?cursor&limit≤100`) · `Idempotency-Key` на мутирующих POST · даты ISO-8601 UTC.

### Аутентификация

- Кабинет (MVP-1): email → 6-значный код (без SMS-затрат) → httpOnly session cookie — единственный вход. Telegram Login (OAuth2) — MVP-2+. `users.tg_chat_id` для пушей/инлайн-approval привязывается через pairing (старт бота владельца), отдельно от логина. Роли owner/staff в сессии.
- Гость (виджет): `POST /guest/sessions {widget_key}` → короткоживущий signed token → WS. Сессия гостя восстанавливается по token в localStorage.
- Вебхуки: TG — secret в path+header; ЮKassa — подпись.

### Ресурсы (MVP)

| Группа | Эндпоинты |
|---|---|
| Auth | `POST /auth/code` · `POST /auth/verify` · `POST /auth/logout` |
| Tenant | `GET/PATCH /tenant` · `GET/POST/PATCH /locations` · `GET/POST/PATCH /users` (staff) |
| Agents | `GET/POST/PATCH /agents` · `POST /agents/:id/test-chat` (песочница) |
| Onboarding | `GET /onboarding/state` · `POST /onboarding/answer` (FSM-шаг, возвращает next+карточки) |
| Channels | `GET /channels` · `POST /channels/telegram {bot_token}` (валидация live, автонастройка) · `POST /channels/widget` → widget_key · `DELETE /channels/:id` |
| Memory | `GET /memory/files` · `GET/PUT /memory/files/*path` (PUT = новая ревизия) · `GET /memory/files/*path/revisions` · `POST .../rollback {rev}` · `GET /memory/unanswered` · `POST /memory/unanswered/:id/answer` |
| Policies | `GET /policies` · `PUT /policies/*path` (только layer=custom) · `POST /policies/dry-run` → дифф ответов на последних 20 диалогах |
| Conversations | `GET /conversations?status&q` · `GET /conversations/:id` · `POST /conversations/:id/messages` (вмешательство владельца → агент в draft) · `POST /conversations/:id/handback` |
| Approvals | `GET /approvals?status` · `POST /approvals/:id/decision {decision, edited_text?}` · `POST /approvals/:id/undo` (окно 30 с) |
| Bookings | `GET /bookings?date&location` · `POST/PATCH /bookings/:id` (FSM-переходы) |
| Reports | `GET /reports/weekly?period` · `GET /reports/live` (сегодня) |
| Webhooks | `POST /webhooks/telegram/:connectionId` · `POST /webhooks/yookassa` |

### WS-протокол виджета (события — Zod в contracts)

- `c→s`: `message.send {client_msg_id, text}` · `typing` · `session.resume {token}`
- `s→c`: `message.new {id, role, text, ts}` · `status {kind: typing|waiting_approval|quiet_hours, eta?}` · `session.ok` · `error {code}`

Гарантии: `client_msg_id` = дедуп; доставка готовых сообщений целиком (без токен-стрима — решение консилиума, см. tech-decisions.md).

### SSE кабинета

`GET /streams/cabinet`, Last-Event-ID для resume. События: `approval.created|updated` · `draft.delta {run_id, chunk}` (live-черновик в карточке) · `conversation.updated` · `booking.created` · `report.ready`.

### Доменные события (внутренние, через BullMQ/Redis, contracts те же)

`message.received → agent.run.started → frontline.answered | memory.retrieved → draft.created → risk.assessed → reply.sent | approval.created → approval.decided → action.executed/undone` + `memory.appended`, `booking.transitioned`, `usage.incremented`. Каждое пишется в `events`.

## 4. Открытые хвосты проектирования (мелкие, решаются в коде)

Rate-limit стратегия per-widget_key (token bucket в Redis) · формат `heading_path` для цитирования источника в UI · хранение фото (гость прислал чек) — S3 + ссылка в `message.meta`, vision — P1 · экспорт данных тенанта (право на выгрузку) — джоба в `integrations`.

## Дополнения

- **Учёт стоимости**: `messages`/`conversations` — `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_est`. Питает дашборд cost/resolution и per-tenant cost circuit-breaker (OWASP LLM10, жёсткий стоп при превышении).
- **Recall по истории**: `pg_trgm` (+ tsvector) для подстрочного/кириллического поиска по прошлым сообщениям гостя — «не заставляем гостя повторять». Инкапсулировать в `Memory.recall()`.
- **Фильтр `embedding_model` обязателен при ретриве** (иначе смешение векторных пространств при смене модели) — единственная точка `Memory.retrieve()`.
- **Счётчик мест/вместимости**: поле вместимости в `locations`/`settings` (MVP-1) — информирует доступность брони и показывается в approval-карточке («осталось N мест»). Полная модель столов — MVP-2 (iiko). Авто-подтверждение посадки — настройка владельца вкл/выкл: включено + есть свободные места → агент подтверждает бронь сам; выключено или мест нет/неясно → approval.
- **FSM-движок — XState**: персистентность в Postgres, переход = audit-запись.
- **Мультиязычный гость**: ответ на языке гостя «из коробки» (LLM-свойство) без отдельного eval-гейта на не-RU; риск принят (в MVP-1 аллергены всё равно → approval, так что не-RU-аллерген-риск нивелирован).
