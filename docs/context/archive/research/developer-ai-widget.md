<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Ресёрч/Ресёрч — виджет developer-ai (что берём).md" -->

# Ресёрч: виджет и бэкенд developer-ai — что взяли

Исследован embed-чат-виджет и NestJS-бэкенд внутреннего проекта `developer-ai` (ИИ-агент для
застройщиков). IP-статус: право переиспользования взято на себя лично автором, юристом не проверено —
митигация: логика переписывается, файлы не копируются 1:1, ничего клиенто-специфичного не
переносится.

## Вывод

Сам подход (Shadow DOM embed, feature-sliced структура, redaction-паттерн, observability) — берётся
как референс и переписывается под свои контракты. Текущий прод-бандл (~334KB gzip, при бюджете
≤70KB) и транспорт (socket.io) — не берутся как есть, это главный источник несовпадения с бюджетом
виджета.

## Клиент (embed-виджет) — что взяли

Измеренный прод-бандл: 1039KB raw / 334KB gzip (бюджет ≤70KB, разрыв ×5 из-за voice/TTS +
site-assistant DOM-агент + i18n на 2 языка + socket.io-client — ничего из этого не нужно в MVP).

1. **`embed-layout.ts`** — CSS-трюк fixed-позиционирования + responsive (мобильный = fullscreen) поверх
   Shadow DOM — прямая экономия времени, решает то, что всё равно предстояло изобретать.
2. Структура модулей connection/session/messaging/history/widget-facade — состав ответственности и
   разбиение по файлам (не код 1:1).
3. `shared/lib/backoff.ts` — reconnect/backoff логика.
4. Feature-sliced подход (entities/features/shared/app) для организации кода виджета.
5. Паттерн Web Components в Shadow DOM без фреймворка (`shadow-styles.ts`, `base-component.ts`) —
   важно для веса бандла.
6. Транспорт реально отвязан от socket.io кодом: `reconnection: false`, вся логика переподключения
   (backoff, online/offline, keepalive, flush очереди) написана руками и transport-agnostic; socket.io
   трогают только `createSocket()`/`emit`. Замена на plain WS = переписать один модуль.

**Не взято:** `socket.io-client` (заменяется на plain WS под свой MessengerPort/канал-адаптер);
voice/TTS-клиент (не в скоупе MVP-1); `site-assistant` DOM-навигация по хосту (отдельная рискованная
категория capability); `@developer-ai/contracts` (своя разметка на Zod DTO); i18n-loader как есть (UI
MVP только русский).

## Бэкенд (NestJS) — что взяли как референс, не бизнес-логику

- **Security-модель гостевой сессии** (главная находка, самая большая экономия): anti-hijack chatId
  (сервер сам выпускает chatId, виджет никогда не принимает внешний из URL); двойная аутентификация
  HTTP+WS (HttpOnly signed cookie для HTTP + короткоживущий HS256 JWT для WS-handshake, куки не ходят
  по WS); `jwt-signer.ts` — минимальный HS256 с issuer+sid; cookie domain sanitization для embed на
  произвольном домене заказчика; `chat-ownership.service` — привязка гость-сессия↔chat;
  `ban.guard`/`ban-list.service`/`identity.guard` — скелет anti-abuse.
- **Rate limiting**: Redis `INCR`+`EXPIRE` только на первом инкременте, ключ по категории — прямой
  паттерн token-bucket per widget_key.
- **`redact-for-log.ts` / `redact-for-store.ts`** — разделение redaction на «для лога» (в проде полная
  редакция, остаётся `<text:147c,fp=...>` sha256-fingerprint для корреляции без раскрытия) и «для
  хранения» (тройка `{fingerprint, length, preview}` в отдельные колонки) — конкретнее прежнего единого
  описания redaction, взято как паттерн.
- **Observability**: `infrastructure/observability/{prometheus,metrics,audit}` +
  `shared/observability/tracing/{with-span,trace-context,request-state-machine}` — готовый слой на
  prom-client; готовый Grafana-дашборд и k6-подобный нагрузочный тест именно для chat-pipeline;
  `llm-pricing.util.ts` — утилита подсчёта стоимости LLM-вызова (если не завязана на langchain);
  `@nestjs/throttler` — паттерн rate-limiting на уровне модуля.
- **`request-state-machine.ts`** — декларативный граф легальных переходов состояния запроса
  (received→…→completed/failed/cancelled) + `FUNNEL_STAGES` — модель-валидатор, дополняет
  XState-FSM, полезна для tracking-plan (воронка событий).
- **PipelineCallbacks** (`onPhase`/`onProgressiveResponse`/`onResponseChunk`) — взят `onPhase` (статусы
  «печатает», фазы обработки); `onResponseChunk` (стриминг) НЕ взят — инвариант: гостю не стримим.
- **Yandex env-контур** (`secrets.schema.ts`) — рабочий референс: `LLM_BASE_URL=https://llm.api.cloud.yandex.net/v1`,
  три пути auth (`YC_API_KEY`/`YC_IAM_TOKEN`/`IAM_TOKEN`), `YC_FOLDER_ID` — сверено при доработке
  LlmResolver/Yandex-адаптера. Их embeddings-контур (Ollama+Weaviate, `nomic-embed-text-v2-moe`) НЕ
  взят — решено Yandex Text Embeddings v2 + pgvector(768).

**Не взято:** `shared/agents/{base,types}` построены поверх `@langchain/core` — осознанно своя лёгкая
модель (LlmPort + собственный FSM ~200 строк, без agent-фреймворка); `domain/ai`, `domain/search-base`,
веб-краулинг (playwright/cheerio/robots-parser) — специфика чужого проекта, не MVP-1 (загрузка знаний
ручная).

## Урок-антипаттерн: `content-capture.ts`

Их трейсинг сознательно убрал редакцию: «всегда пишем полный текст, включая пользовательский ввод,
в audit_log.spans во всех окружениях» — диагностика победила PII-дисциплину, даже при том что
`redact-for-store`/`redact-for-log` в этой же кодовой базе аккуратны. **Правило, зафиксированное как
следствие этого урока:** трейсинг/аудит редактирует PII по умолчанию (fail-closed), а не «включим
редакцию, если понадобится» — тот же класс граблей, что sticky-memory у OpenClaw.

## Наблюдение об архитектурном отличии

Бэкенд developer-ai — single-client (один застройщик), без мультитенантности/RLS → архитектурно ближе
к агентскому треку (client-hosted, один тенант на деплой), чем к мультитенантному SaaS-ядру. Для
SaaS-ядра берутся точечные паттерны (security/rate-limit/redaction/observability), но не общая
архитектура (нужна мультитенантность, которой там нет).

## Итог

Ядро клиента взято как форк-переписывание (embed-layout + Shadow DOM + структура + reconnect), выкинуты
voice/site-assistant/socket.io/их contracts, добавлен свой транспорт и Zod DTO. Бэкендовые паттерны
(redaction split, observability, k6-нагрузка, LLM-cost) переиспользованы как референс независимо от
виджета.
