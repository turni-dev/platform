<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/LLM-рантайм — RU-first (замена OpenRouter).md" -->

# LLM-рантайм — RU-first (замена OpenRouter)

## Контекст и решение

OpenRouter начал ограничивать доступ из РФ (гео-блок региона продаж). Он играл две роли: (1) «мозг роутинга» (микс моделей, fallback, учёт токенов, вайтлист в БД), (2) канал доступа к зарубежным моделям. Обе роли заменяются.

**Решение фаундера (10.07): Yandex-first в MVP.** Один контур Yandex AI Studio для generate/classify/embed. Второй провайдер — опционально, позже, только по результатам eval/доступности.

Порт `LlmPort` / `EmbeddingPort` не меняется — меняются только адаптеры и конфиг (закон портов: вендор за границей порта).

Yandex AI Studio отдаёт OpenAI-совместимый эндпоинт `https://llm.api.cloud.yandex.net/v1` → `YandexGptAdapter` пишется обычным OpenAI-совместимым клиентом, **без langchain** (это подтверждено разбором donor-проекта developer-ai, где langchain — тонкая обёртка `ChatOpenAI` над тем же URL, ~2% фреймворка используется).

## Архитектура роутинга

```
Domain-код → LlmPort/EmbeddingPort → LlmResolver (role → model + retry/degradation, in-app, таблица model_configs)
  → classify/generate: Yandex AI Studio primary (нативно из РФ, 152-ФЗ)
  → complex/judge: owner escalation / delayed jobs; second-family judge опционально позже
  → embed: RU-эмбеддинги (Yandex Text Embeddings v2)
```

«Праймари-система» = Yandex AI Studio напрямую. Роутинг-мозг (то, что раньше давал OpenRouter) перенесён в приложение (`LlmResolver` за портом + таблица `model_configs`).

## Слои: было / стало

| Слой | Было (OpenRouter) | Стало (RU-first) |
|---|---|---|
| Граница домена | `LlmPort` / `EmbeddingPort` | без изменений |
| Адаптеры MVP | `OpenRouterAdapter`, `OpenRouterEmbeddings` | `YandexGptAdapter` + `YandexEmbeddingsAdapter`; second-provider adapters опционально позже |
| Роутинг-мозг | в OpenRouter | `LlmResolver` in-app: model_configs (role→model), retry, circuit breaker, учёт токенов/cost, degradation |
| OpenAI-совместимость | нативно | Yandex OpenAI-compatible API где полезно; вендор-детали внутри адаптеров |

## Карта ролей моделей (model_configs)

| Роль | Назначение | Primary (RU) | Fallback / эскалация |
|---|---|---|---|
| classify | интент, FrontLine, risk ур.1 | YandexGPT Lite / AI Studio Classifier | retry → delayed-очередь |
| generate | ответы гостю/черновики | YandexGPT Pro 5.1 | retry → «передал владельцу» |
| complex | нюансные кейсы, длинные навыки | YandexGPT Pro / Alice AI LLM по eval | owner escalation при провале confidence/latency |
| judge | eval-гейт в CI (оффлайн) | YandexGPT/Alice AI LLM как первый judge | second-family judge опционально позже |
| embed | RAG / pgvector | Yandex Text Embeddings v2 (`text-embeddings-v2-doc/query`, 768) | second-provider/bge-m3 опционально позже — смена = миграция + переиндексация |

Конкретные слаги моделей уточняются на момент кодинга. Judge в MVP тоже Yandex-first; второй provider добавляется только если качество judge не проходит.

## Эмбеддинги и pgvector — решено (10.07)

- `vector(768)` зафиксировано в схеме. Прежний вариант `text-embedding-3-small/768` (OpenRouter) отменён.
- Primary: Yandex Text Embeddings v2 (`text-embeddings-v2-doc/query`, 768) — тот же контур Yandex AI Studio, что generate/classify.
- Fallback embeddings не в MVP. bge-m3 остаётся P1, его 1024-мерность требует отдельной миграции/индекса.
- Причина dim=768: Yandex Text Embeddings v2 закрывает doc/query в одном провайдере с этой размерностью.
- Порог cosine ≥0.45 нужно перекалибровать на RU-эвале (раньше калибровался под OpenAI). Redaction PII перед отправкой query-эмбеддинга остаётся.
- Self-host Postgres: индекс HNSW (`vector_cosine_ops`, m=16/ef=64), partial `WHERE embedding_model='current'`.

## Tool-calling — риск Yandex-first

- YandexGPT: tool/function-сценарии проверяются eval-ами; сложные цепочки не доверяются автономному react-loop.
- Почему это терпимо: архитектура и так толкает детерминизм в код, а не в автономные tool-цепочки LLM (level-0 guard, FrontLine-workflow, Workflow-примитив, structured I/O — правило «детерминизм в код, не в модель»). Агент почти не полагается на мульти-tool автономию.
- Митигации: (1) сценарии проектируются под один tool-вызов за шаг; (2) сложные цепочки — детерминированный Workflow зовёт инструменты, не LLM; (3) eval-гейт ловит регрессии tool-вызовов; (4) при острой нехватке — эскалация владельцу через роль `complex`; второй provider добавляется позже отдельным решением.

## Безопасность / 152-ФЗ

- Yandex AI Studio — локализация данных в РФ, трансграничной передачи нет → снимает часть DPA-риска, который был у OpenRouter.
- Redaction PII перед LLM остаётся (имя/телефон/email → плейсхолдеры, fail-closed) — теперь defense-in-depth, не единственный барьер.
- Второй provider в MVP выключен. Если позже включаются Sber/ProxyAPI/foreign-judge — PII туда запрещён по policy (плейсхолдеры обязательны), RU-only-флаг на тенанте полностью отключает такой маршрут.

## Деградации

`LlmPort`: CB 60 с → Yandex retry/backoff → delayed-очередь → «передал владельцу». Single-vendor-риск принимается для MVP ради меньшей операционной сложности; контролируется eval-ами, алертами и owner escalation.

## Чеклист миграции (для кодинга)

1. `libs/infrastructure/`: `openrouter/` → `llm/`; адаптеры `yandexgpt/`, `yandex-embeddings/`; second-provider adapters опционально позже; `FakeLlm` без изменений.
2. `model_configs` seed: роли classify/generate/complex/judge/embed → Yandex slugs + retry/degradation policy + поле `provider`.
3. ENV/DI: `LLM_PROVIDER=yandex`, `YANDEX_FOLDER_ID`, `YANDEX_API_KEY`/IAM; `LLM_SECOND_PROVIDER=off` по умолчанию.
4. Секреты в sops/age: Yandex AI Studio folder id + API key/IAM credentials.
5. Эмбеддинги: `vector(768)`, primary Yandex Text Embeddings v2 doc/query; калибровать порог cosine на RU-эвале. `EmbeddingsGigaR` сейчас 2560, bge-m3 1024 — требуют отдельной миграции/индекса.
6. Второй provider — только по отдельному решению с контракт-тестами и redaction-policy; MVP это не блокирует.
7. Contract-тесты `LlmPort`/`EmbeddingPort` гонять против всех адаптеров (закон порта).
8. Eval-judge: начать с Yandex judge; second-family judge только если eval-качество не проходит.
9. Обновить cost-учёт под Yandex AI Studio прайсы (перепроверить юнит-экономику COGS).

## Открытый вопрос

COGS ≈ 4,8 тыс ₽/клиент считался под OpenRouter-прайсы (gemini-flash). Yandex AI Studio прайсы другие — нужно пересчитать COGS и порог маржи после выбора моделей.
