# Эксплуатация dev-VPS

Этот справочник относится к текущему стенду Turni на Ubuntu: checkout лежит в
`/srv/turni/platform`, конфигурация — вне Git в `/srv/turni/config`, а сервисы
работают в двух независимых Compose-проектах.

- `turni-site`: Strapi CMS, отдельный Postgres CMS и публичный `core-site`.
- `turni-product`: Postgres+pgvector, Redis, MinIO, миграции, backend и кабинет.

Все команды ниже безопасны для данных: они **не** удаляют Docker volumes. Не
используйте `docker compose down -v`, `docker volume rm` или очистку каталога
`/var/lib/docker` для «перезапуска» стенда.

## Быстрая проверка

Выполняйте под `root`:

```bash
docker ps
curl -fsS http://127.0.0.1:3000/healthz
curl -I http://127.0.0.1:3001/login
curl -I http://127.0.0.1:3002
curl -I http://127.0.0.1:1337/admin
```

У product `migrate` должен иметь статус `Exited (0)`; backend — `healthy`.
Статус `Restarting` у web, backend или CMS требует смотреть логи именно этого
контейнера, а не пересобирать весь сервер вслепую:

```bash
docker logs --tail=100 turni-product-backend-1
docker logs --tail=100 turni-product-web-1
docker logs --tail=100 turni-cms
docker logs --tail=100 turni-core-site
```

## Обновить стенд из `main`

Не переключайте VPS на ветку, пока необходимые фиксы не смержены в `main`.
Перед обновлением убедитесь, что на самом сервере нет ручных изменений в Git:

```bash
sudo -u turni /bin/sh
cd /srv/turni/platform
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
```

Пустой вывод `git status --short` означает, что переключение безопасно. Если
вывод не пустой, остановитесь: сначала сохраните или отмените только понятные
ручные изменения. Файлы `/srv/turni/config/*.env` находятся вне Git и не
затрагиваются.

Из shell пользователя `turni` обновите оба стека:

```bash
docker compose --project-name turni-product \
  --env-file ../config/product.env \
  -f compose.yml \
  -f ops/compose/dev-vps/product.yml \
  up -d --build

docker compose --project-name turni-site \
  --env-file ../config/site.env \
  -f compose.site.yml \
  -f ops/compose/dev-vps/site.yml \
  up -d --build
```

Выйдите обратно в root командой `exit` и выполните раздел «Быстрая проверка».

## Пересобрать один сервис

Работайте из `/srv/turni/platform` под `turni`. `--force-recreate` применяет
изменённые env-переменные; `--build` нужен после изменения Dockerfile или
исходников.

```bash
# Публичный сайт
docker compose --project-name turni-site \
  --env-file ../config/site.env \
  -f compose.site.yml \
  -f ops/compose/dev-vps/site.yml \
  up -d --build --force-recreate core-site

# CMS
docker compose --project-name turni-site \
  --env-file ../config/site.env \
  -f compose.site.yml \
  -f ops/compose/dev-vps/site.yml \
  up -d --build --force-recreate cms

# Backend и кабинет
docker compose --project-name turni-product \
  --env-file ../config/product.env \
  -f compose.yml \
  -f ops/compose/dev-vps/product.yml \
  up -d --build --force-recreate backend web
```

Если одновременная сборка Next и Strapi перегружает VPS, собирайте последовательно:

```bash
docker compose --project-name turni-site --env-file ../config/site.env \
  -f compose.site.yml -f ops/compose/dev-vps/site.yml build core-site
docker compose --project-name turni-site --env-file ../config/site.env \
  -f compose.site.yml -f ops/compose/dev-vps/site.yml up -d core-site
docker compose --project-name turni-site --env-file ../config/site.env \
  -f compose.site.yml -f ops/compose/dev-vps/site.yml build cms
docker compose --project-name turni-site --env-file ../config/site.env \
  -f compose.site.yml -f ops/compose/dev-vps/site.yml up -d cms
```

На стенде с 3 vCPU высокая load average во время параллельной сборки означает
конкуренцию build-процессов, а не обязательно зависание. Проверяйте
`free -h`, `nproc` и `uptime`; при доступной памяти дайте сборке завершиться.

## CMS: первый вход и токены сайта

Текущий dev-Caddyfile сознательно проксирует `cms.turni.ru` без IP-ограничения
и Basic Auth. Это удобно для стенда, но не подходит для production. Первый
заход в `https://cms.turni.ru/admin` открывает форму **Create your first
administrator**.

После создания администратора откройте **Settings → API Tokens** и создайте
два узких токена — не один full-access. Полный список permissions для
каждого описан в `apps/cms/README.md`, кратко:

1. `site-read` типа **Custom** — только `find`/`findOne` на `page`,
   `site-setting`, навигацию, `integration` и `booking-slot.available`.
   Никакого доступа к `lead`/`feedback`.
2. `site-lead-write` типа **Custom** — только `create` на `lead`/`feedback`
   и `booking-slot.reserve`. Никакого `find`/`findOne` на `lead`/`feedback` —
   утёкший токен не должен давать прочитать чужие заявки. Не используйте
   **Full access** даже в dev: сервер сайта пишет только через этот узкий
   токен, и стенд должен отражать реальные production-права.

Strapi показывает каждое значение один раз. Сохраните их в `/srv/turni/config/site.env`,
не в Git и не в чат:

```dotenv
CMS_READ_TOKEN=<site-read token>
CMS_WRITE_TOKEN=<site-lead-write token>
```

Затем пересоздайте core-site без обязательной пересборки:

```bash
cd /srv/turni/platform
docker compose --project-name turni-site \
  --env-file ../config/site.env \
  -f compose.site.yml \
  -f ops/compose/dev-vps/site.yml \
  up -d --force-recreate core-site
```

`CMS_READ_TOKEN` передаётся в core-site только в актуальном `main`. Если в
логах CMS видны `401` для `/api/pages`, `/api/site-setting` или navigation,
сначала выполните `git pull --ff-only origin main`, затем создайте read-токен
и пересоздайте core-site.

## Caddy и домены

Единственные публичные порты VPS — `80` и `443`; Caddy направляет домены так:

| Домен | Внутренний сервис |
|---|---|
| `turni.ru` | `127.0.0.1:3002` (core-site) |
| `cms.turni.ru` | `127.0.0.1:1337` (Strapi) |
| `app.turni.ru` | `127.0.0.1:3001` (cabinet) |
| `api.turni.ru` | `127.0.0.1:3000` (backend) |

После обновления Caddyfile всегда проверяйте конфигурацию перед reload:

```bash
sudo cp /srv/turni/platform/ops/caddy/Caddyfile.dev-vps.example /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Если HTTPS не выпускается, проверьте A-записи всех пяти доменов, входящие
80/443 в firewall и `sudo journalctl -u caddy -n 100 --no-pager`.

## Диагностика известных ошибок

### `open /home/turni/compose.site.yml: no such file or directory`

Compose запущен не из checkout. Перейдите в `/srv/turni/platform` или укажите
полные пути к `-f` файлам. Стандартный вариант:

```bash
sudo -u turni /bin/sh
cd /srv/turni/platform
```

### Docker apt пишет URL с `$(.` или `/etc/os-release`

В `/etc/apt/sources.list.d/docker.sources` попал невычисленный shell-код.
Пересоздайте только этот файл командой из раздела «Установить Docker Engine» в
`ubuntu-dev-vps.md`, затем выполните `sudo apt update`. Не добавляйте
`$(. /etc/os-release ...)` в одинарных кавычках: тогда shell его не вычислит.

### `password authentication failed for user "turni"` у `migrate`

Смена `POSTGRES_PASSWORD` в env не меняет пароль уже созданной роли в
Postgres-volume. Синхронизируйте их, не удаляя данные:

```bash
PRODUCT_DB_PASSWORD="$(openssl rand -hex 32)"
docker exec -i turni-postgres psql -U turni -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE turni WITH PASSWORD '$PRODUCT_DB_PASSWORD';"
sed -i -E "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PRODUCT_DB_PASSWORD|; s|^DATABASE_URL=.*|DATABASE_URL=postgresql://turni:$PRODUCT_DB_PASSWORD@postgres:5432/turni|" /srv/turni/config/product.env
unset PRODUCT_DB_PASSWORD
```

Затем повторно поднимите `migrate`, `backend` и `web` командой из раздела
«Пересобрать один сервис». Для CMS действует то же правило: пароль роли в
`turni-cms-postgres` должен совпадать с `CMS_POSTGRES_PASSWORD` в `site.env`.

### Backend сообщает `Every signing secret must differ`

В `/srv/turni/config/product.env` должны быть разными значения
`WIDGET_SESSION_SECRET`, `WIDGET_ROUTING_SECRET`, `OWNER_AUTH_SECRET` и
`WEBHOOK_ROUTING_SECRET`. Не выводите их в терминал и не используйте одно
значение для нескольких строк. После правки пересоздайте backend.

### Backend сообщает `KEY_CREDENTIALS_V1 is required`

Добавьте base64-ключ ровно на 32 случайных байта в `product.env` под `turni`:

```bash
sudo -u turni /bin/sh
cd /srv/turni
P=config/product.env
sed -i '/^KEY_CREDENTIALS_V1=/d' "$P"
openssl rand -base64 32 | sed 's/^/KEY_CREDENTIALS_V1=/' >> "$P"
```

Актуальный `ops/compose/dev-vps/product.yml` передаёт эту переменную в backend.
Выполните `git pull --ff-only origin main`, затем пересоздайте backend и web.

### Web перезапускается с `require is not defined in ES module scope`

Это была ошибка образа Next standalone. Она исправлена в `main`: сервер
запускается как `.cjs`. Обновите checkout и пересоберите только web с
`--build --force-recreate web`.

### CMS перезапускается: `public/uploads doesn't exist`

Это была ошибка runtime-образа Strapi. Она исправлена в `main`. Выполните
`git pull --ff-only origin main` и пересоберите CMS с `--build --force-recreate cms`.

### В web: `getaddrinfo EAI_AGAIN backend`

Web не разрешает внутреннее Docker DNS-имя backend. Пересоздайте пару в одном
Compose-проекте, без удаления сети или volumes:

```bash
cd /srv/turni/platform
docker compose --project-name turni-product \
  --env-file ../config/product.env \
  -f compose.yml \
  -f ops/compose/dev-vps/product.yml \
  up -d --force-recreate backend web
docker exec turni-product-web-1 getent hosts backend
```

Последняя команда должна вернуть внутренний IP. Если не вернула — сохраните
вывод `docker ps` и лог web, не раскрывая env-файлы.

## После изменения характеристик VPS

Обычная перезагрузка или resize не удаляют volumes. Сервисы с
`restart: unless-stopped` поднимутся сами; после возврата VPS выполните
`docker ps` и проверки из начала файла. Если сервис был вручную остановлен,
запустите соответствующий `docker compose ... up -d`.
