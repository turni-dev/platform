<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Архитектура/Порты и адаптеры.md" -->

# Порты и адаптеры (внешние интеграции)

Принцип фаундера: «если что-то поменяется — чтобы не было больно переходить». Реализация: Ports & Adapters.

- Порт = интерфейс в `libs/contracts` (термины НАШЕГО домена).
- Адаптер = реализация в `libs/infrastructure/<vendor>`.
- Domain-код знает только порты.

## Законы

1. Ни один vendor-тип не пересекает границу порта — на входе/выходе только наши DTO (anti-corruption layer). Например, Telegram `Update` превращается в наш `InboundMessage` внутри адаптера.
2. Выбор адаптера — конфиг (env/model_configs), не код.
3. У каждого порта есть Fake-адаптер для тестов и localhost (`FakeLlm` отвечает шаблонами, `FakePayment` всегда «оплачено») — разработка без внешних сервисов и интернета.
4. Contract-тесты на порт: один тест-сьют гоняется против всех адаптеров порта.
5. Новый вендор = новый адаптер + конфиг. Изменение порта = ADR.

## Реестр портов

| Порт | Методы (суть) | Адаптер MVP | Замена потом | Заметки |
|---|---|---|---|---|
| LlmPort | `generate(req)`, `classify(req)` — оба со structured output | YandexGptAdapter (Yandex-first MVP); second provider опционально позже | прямые Anthropic/OpenAI, Ollama | Внутри `LlmResolver`: retry, circuit breaker, учёт токенов/cost, выбор модели из model_configs, degradation. См. llm-runtime.md |
| EmbeddingPort | `embed(texts[]) → vectors` | YandexEmbeddingsAdapter (`text-embeddings-v2-doc/query`, dim=768) | second-provider/bge-m3 опционально позже | `embedding_model` пишется в чанк — смена размерности = миграция + переиндексация |
| MessengerPort | `send(connection, OutboundMessage)`, `parseWebhook(raw) → InboundMessage`, `setupWebhook`, `validateCredentials` | TelegramAdapter | VkAdapter, MaxAdapter, AvitoAdapter (P1) | Канал = connection.type → адаптер из реестра. Наши типы сообщений: text, buttons, image |
| BotProvisionerPort | `provision(tenant) → connection` | BotFatherGuideAdapter (мастер с проверкой токена) | ManagedBotsAdapter (MVP-2) | Решение консилиума |
| PaymentPort | `createInvoice`, `parseWebhook`, `fetchPayment(id)` | YooKassaAdapter | Robokassa, CloudPayments | Re-fetch по API — закон (AppSec) |
| BlobPort | `put`, `get`, `signedUrl`, `delete` | S3Adapter (Timeweb) | любой S3 | Локально MinIO — тот же адаптер, другой endpoint |
| NotifyPort | `notifyOwner(user, Notification)` | TelegramNotifyAdapter + EmailAdapter (fallback) | push, MAX | Уведомления об approvals/алертах; роутинг по notify_prefs |
| BookingSystemPort | `checkAvailability`, `createBooking`, `syncMenu`, `syncStopList` | InternalBookingAdapter (наша книга) | IikoAdapter (read MVP-2 → write MVP-3), RestoplaceAdapter | Самый важный для вертикали; меню/стоп-лист падают в memory как knowledge-файлы |
| CmsPort | `getPage(slug)`, `getCollection(type)` | StrapiAdapter | Payload, markdown | Используется только лендингом на build |
| CalendarPort (P1) | `freeBusy`, `createEvent` | — | GoogleCalendarAdapter | Консалтинг-трек |
| EmailPort | `send(to, template, data)` | SmtpAdapter (REG.RU Mail hosting) | Unisender/Postmark только если деliverability проваливается | Коды входа, отчёты |
| SpeechPort (P2) | `stt`, `tts` | — | для голос-канала | Заложен интерфейсом, не реализуем |

## Структура в монорепо

```
libs/contracts/ports/        # интерфейсы + DTO (zod)
libs/infrastructure/
  llm/{gigachat,yandexgpt,proxyapi,ru-embeddings}/  telegram/  yookassa/  s3/  strapi/  smtp/  fakes/
```

DI: NestJS-модуль `InfrastructureModule` биндит порты на адаптеры по env (`MESSENGER_TELEGRAM=on`, `LLM_PROVIDER=gigachat|yandexgpt`, `LLM_FOREIGN_OPTIONAL=proxyapi|off`, `LLM_RU_ONLY` per-tenant override). Fakes автоматически в `NODE_ENV=test`.

## Деградации по портам (свод с SRE)

- LlmPort: CB 60 с → Yandex retry/backoff → delayed-очередь → «передал владельцу».
- MessengerPort: ретраи отправки 3×, недоставка → алерт.
- PaymentPort: вебхук в inbox, обработка асинхронно.
- NotifyPort: TG недоступен → email.
- BookingSystemPort (iiko): API недоступен → работаем по последнему синку memory + пометка «данные могли устареть» в карточке approval.

## Транзакционная почта + фирменный отправитель

Код входа идёт по email → доставляемость письма = критический путь онбординга (код в спам = владелец не вошёл = сломанный старт). Уточнение к `EmailPort`/`NotifyPort`.

- Что шлём (только владельцу/B2B; гостю — никогда): код входа (критично), счета/квитанции (биллинг, P1), важные уведомления как fallback `NotifyPort` (когда TG недоступен), опционально недельный дайджест (если владелец без TG).
- Отправитель фирменный: `noreply@turni.ru` (транзакционное) + `reply-to: support@turni.ru` (живой адрес). Не личный gmail.
- Доставляемость: SPF + DKIM + DMARC на отправляющем домене. На 11.07.2026 DNS REG.RU verified для `turni.ru`: SPF, DKIM `dkim._domainkey.turni.ru`, DMARC `_dmarc.turni.ru`.
- Провайдер (решение 11.07): REG.RU Mail hosting / SMTP за `EmailPort`. Unisender убран как лишний сервис для MVP. Зарубежные SendGrid/Postmark не используются — хуже доставляемость в РФ + юр-риск. ESP возвращаем только если REG.RU SMTP провалит deliverability или появится массовый маркетинг.
- Безопасность: код — argon2 + TTL 5 мин + lockout; в письмах нет чувствительных данных; код безопаснее magic-link (Outlook-сканеры сжигают ссылки).
- До пилота: подтвердить SMTP host/port, ротировать засвеченные пароли, перенести prod-секреты в sops/age, отправить тесты доставляемости (Mail.ru/Yandex/Gmail не в спам) — в QA-чеклист.
