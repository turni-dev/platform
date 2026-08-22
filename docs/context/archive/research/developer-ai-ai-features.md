<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Ресёрч/AI-обвязка и dashboard-фичи из developer-ai (что берём).md" -->

# AI-обвязка и dashboard-фичи из developer-ai — что взяли

Исследовали исходники внутреннего проекта `developer-ai` (NestJS+Postgres+Redis, тот же стек) —
сервисы вокруг агента (не сами агенты, а инфраструктура), плюс open-source AgentArea (Apache-2.0,
governance/policy слой). IP-статус developer-ai: риск принят осознанно, переносим паттернами, не
копипастой — исходники не публиковать. Родственная тема: `developer-ai-widget.md`.

## Вывод

Это набор именно тех продуктовых AI-фич, которые были нужны — отмена генерации, фидбэк, метрики,
аудит-лог, session-context, кеш, retention. Всё уже реализовано и обкатано на близком стеке.
Решение: забрать паттерны (структуры, приёмы, дисциплины), не копировать код; там, где их модель
single-tenant/доверяет хосту — ужесточать под мультитенантность (RLS, tenant_id, sandbox).

## Что взяли (по фиче → куда легло)

| Источник | Взятый паттерн | Куда |
|---|---|---|
| `AiCancellationService` | Interrupt/отмена генерации через AbortController; отмена должна идти через Redis pub/sub при нескольких репликах (их in-memory Map не годится) | pipeline / отмена генерации |
| `FeedbackService` | Композитный quality-score (feedback+confidence+hasResults+скорость), а не голый лайк; PII через `redactForStore` | eval-флайвил, аналитика качества |
| `SessionContextService` | Summarization-lock (Redis SET NX) против конкурентных записей в память; версионирование контекста при смене формата | memory-слой (у нас Postgres канонично, Redis — эфемерный слой, не Redis-only модель) |
| `QueryCacheRepository` | Версионированный кеш-ключ, кешируем только success, строгая валидация при чтении; ключ обязан включать tenant_id | cache-hit путь, цель LLM-COGS ≤10% MRR |
| `RetentionCleanupService` | Ежедневный крон, per-table retention-окна, идемпотентный ручной триггер | retention-sweep (152-ФЗ); risk-flagged строки — отдельное более долгое окно |
| `AuditLogRepository` | Структура audit_log (fingerprint+preview+metrics+spans+transitions+trace_id), `findByTraceId` → replay | аудит + replay диалога по correlation_id |
| Урок консистентности редакции | В одной и той же таблице `spans` содержали нередактированный PII, хотя request/response были редактированы — редакция должна быть консистентна по ВСЕМ стокам, не только на «очевидном» поле | внесено в security-DoD |
| «Агент читает БД» паттерн | Форма «агент вызывает read-only tool к структурированным данным» валидна; их модель доступа («доверяй хосту», single-tenant) — НЕ переносится | Execution Environment: только через withTenant + Policy Engine + default-deny |
| `CoordinatorPreRouterService` + input-guard | Детерминированный regex pre-router с порогом уверенности до LLM; guard-категории (off_topic/harmful/meta_jailbreak) с `guard:`-префиксом и locale-фоллбэком | FrontLine (intent дешёвой моделью) + PolicyEngine level-0 |
| Envelope-протокол / `IMessagingAdapter` | Единый формат `{body, metadata}` без алиасов; progressive quick-replies/status-фазы без стриминга текста (chunk-стриминг НЕ берём — инвариант) | event-envelope стандарт, MessengerPort |
| Их антипаттерн: vendor-тип (socket.io Server) протёк через интерфейс порта | Урок «не повторять» | правило: vendor-тип не пересекает порт |
| `BaseAgent` (template-method, без langchain) | Форма «span → context → preprocess → validate → processInternal(timeout) → postprocess», structured error codes, graceful shutdown | агентский слой поверх LlmPort |
| Их langchain-обёртка — только `ChatOpenAI` c `baseURL=https://llm.api.cloud.yandex.net/v1` | Подтверждение: Yandex = OpenAI-совместимый эндпоинт → langchain не нужен, можно обычный HTTP-клиент | LlmResolver + Yandex-адаптеры |
| Abort сквозь весь стек (`raceWithAbort`, `sleepWithAbort`, `throwIfCancelled` на каждой границе await) | Дисциплина: отмена проверяется на каждой границе, не один раз на входе | pipeline + карточка «Отмена/interrupt генерации» |
| `AgentExecutionContext` cost tracking | Per-model breakdown стоимости (input/output/cached), не только общий счётчик | cost-учёт токенов + per-tenant circuit-breaker |
| `orchestrateWorkflow` | `Promise.allSettled` для fail-soft параллельных агентов; fire-and-forget прогрев эмбеддинга параллельно с LLM-координатором; фазовые колбэки на переходах | pipeline-дизайн (латентность) — НЕ копировать: их coordinator — полноценный LLM-роутер по 7 агентам, у нас Master Router = passthrough осознанно |

## AgentArea (open-source, Apache-2.0) — governance-слой

Ближайший open-source аналог ядра; лицензия позволяет легально заимствовать. Главный вывод: они —
инфраструктура для инженеров (K8s/Temporal/A2A), мы — продукт для владельца бизнеса, но их
`libs/governance` — самая зрелая реализация policy-слоя из виденных.

- **Interceptor framework** — единый протокол `ExecutionInterceptor`: категории GATE/FILTER/OBSERVER,
  решения ALLOW/DENY/WARN/**ESCALATE**/MODIFY (эскалация человеку — первоклассное решение, не сбоку),
  фазы `pre_llm_call…tool_discovery…pre_delegation`. Взято как форма для наших level-0/1/2 + approval.
- **Монотонный резолвер политик** — нижний слой (workspace→agent→user) может только ужесточать
  политику верхнего, никогда не ослаблять; нарушение → `PolicyValidationError`. Закрывает дыру: у нас
  «locked-каркас + свободные политики клиента» был защищён только UI, не системой — взят как
  обязательный паттерн PolicyEngine.
- **Политики как данные** (YAML-дефолты + идемпотентный провижининг, реляционная модель
  `subject/target/effect/params/condition/priority`) — взята селекторная модель target/effect,
  дефолты в YAML, **два периода спенд-капа (за прогон И за месяц)**. НЕ взято: approval off-by-default
  — для нас approval на аллергенах/деньгах/жалобах всегда обязателен.
- **Триггеры** (cron/webhook/LLM-условие на естественном языке) + auto-disable триггера после N
  подряд ошибок (`consecutive_failures`) — взято в планировщик исходящих (напоминания/follow-up).
- **Кошелёк агента** (`service_budget_usd`, период execution/daily/monthly, расход привязан к
  execution_id/tool_call_id) — подтвердил переход на «agent runs» как единицу учёта в ценообразовании.

## Что не взяли

Temporal (тяжело для масштаба, остаёмся на BullMQ+FSM); K8s/Helm; A2A-протокол (не сейчас, MVP-1 —
один агент); LiteLLM-прокси (свой LlmPort + RU-first Yandex); Keto/ReBAC (избыточно, RLS + роли);
Python-стек целиком.
