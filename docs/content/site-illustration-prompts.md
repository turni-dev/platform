# Иллюстрации корп-сайта: пакет генерации

## Как использовать пакет

Это три связанные иллюстрации для сайта Turni. Генерируйте по одному изображению на слот, выбирайте лучший вариант и загружайте его в медиатеку Strapi CMS. В Git файлы не добавляем. Для каждого изображения в CMS обязательно заполнить русский alt-текст из этого документа.

**Экспорт:** прозрачный фон, `WebP` или `AVIF`; hero — 1600×1200 px, остальные — 1200×900 px. Целевой вес после оптимизации: до 250 KB для hero и до 180 KB для остальных. Не встраивайте текст в саму графику: он станет недоступен, непереводим и плохо масштабируется.

## Единая визуальная система

Спокойная минималистичная изометрическая 3D-иллюстрация для B2B-сайта. Светлая нейтральная база: белый `#ffffff`, очень светлый серый `#f4f5f7`, тонкие серые контуры `#cbd1d8`; единственный насыщенный акцент — зелёный Turni `#176b4d`. Мягкие скруглённые геометрические формы, много свободного пространства, деликатные тени, аккуратная глубина, без фотореализма. Стиль — инструмент для работы, не декоративная «нейросеть».

**Общий negative prompt для каждого слота:** people, faces, hands, robots with human faces, stock-photo aesthetic, dark background, neon, cyberpunk, gradients, photorealism, text, letters, numbers, logos, brand marks, dashboards, charts, fake product screenshots, phone mockups, confidential data, flags, clutter, watermark.

Не изображайте утверждения, которых продукт пока не подтверждает: автономные платежи, реальных клиентов, работающий чат, точные метрики, интеграции с логотипами либо интерфейс Turni. Иллюстрация объясняет идею, а не подменяет демо.

## Слот 1 — hero главной

**Где:** правая половина блока Hero на главной. Формат должен оставлять чистое поле слева: на широком экране текст расположен рядом с иллюстрацией.

**Задача:** передать, что агент снимает рутинные переключения между входящим сообщением, календарём и таблицей, а рискованное действие проходит через подтверждение владельца.

**Prompt:**

> Minimal calm isometric 3D illustration for a Russian B2B AI operations website, transparent background. A small abstract message card flows through a clear rule gate with a single green approval indicator, then branches into an abstract calendar tile and a structured table tile. The objects are generic geometric symbols, not real application interfaces. White and very light gray surfaces, thin gray outlines, one deep forest-green accent #176b4d, soft shadows, generous empty space, professional and trustworthy, no text, no logos, no people. Keep the visual mass on the right half of a 4:3 canvas.

**Alt в CMS:** «Схема: сообщение проходит через правило и попадает в календарь и таблицу после подтверждения.»

## Слот 2 — «Обвязка агента»

**Где:** страница `/products/private-agent`, секция «Агент — это не только модель».

**Задача:** объяснить харнес: правила, память, инструменты, журнал и ресурсные ограничения работают вокруг модели. Центральный элемент — абстрактный, не портрет робота и не интерфейс.

**Prompt:**

> Minimal calm isometric 3D illustration for a Russian B2B AI operations website, transparent background. A neutral central abstract processing core is surrounded by five simple connected modules: a shield-like rule boundary, a stack of memory cards, a small tool connector, an audit trail ribbon and a compact resource limit dial without numbers. Each module is geometric and generic, with no UI, text or logos. White and very light gray surfaces, thin gray outlines, one deep forest-green accent #176b4d, soft shadows, generous empty space, professional and restrained.

**Alt в CMS:** «Схема обвязки агента: правила, память, инструменты, журнал и ограничения окружают его рабочее ядро.»

## Слот 3 — развёртывание в контуре клиента

**Где:** страница `/products/private-agent`, секция «Почему мы разворачиваем у вас, а не у себя».

**Задача:** показать изолированный контур клиента и отдельные разрешённые подключения к его сервисам. Не рисовать серверные стойки как обещание конкретной инфраструктуры.

**Prompt:**

> Minimal calm isometric 3D illustration for a Russian B2B AI operations website, transparent background. A protected local workspace shown as a simple outlined enclosure contains an abstract agent core, a document stack and a message stream. Two small external generic service tiles connect through separate narrow permission gates; the data objects stay visibly inside the enclosure. No cloud logo, no country symbol, no real app UI, no text. White and very light gray surfaces, thin gray outlines, one deep forest-green accent #176b4d, soft shadows, generous empty space, calm trustworthy B2B isometric 3D.

**Alt в CMS:** «Схема развёртывания: данные и агент находятся в контуре клиента, а внешние сервисы подключены отдельными разрешениями.»

## Честный mock-screen для будущих страниц

Это не иллюстрация и не скриншот. Компонент должен выглядеть как белое окно приложения с серой рамкой, нейтральными прямоугольниками-заглушками и заметной подписью «Макет интерфейса». Нельзя помещать в него настоящие имена, сообщения, графики, KPI, статус «работает» или элементы, из которых посетитель сделает вывод о доступной сегодня функции. Когда появится реальная функция, mock-screen заменяется настоящим снимком с предварительной проверкой на PII.
