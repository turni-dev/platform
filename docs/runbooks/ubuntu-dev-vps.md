# Ubuntu dev-стенд на одном VPS

Этот runbook поднимает **полный dev-стенд**, а не production: на одном Ubuntu VPS живут два изолированных Docker Compose-проекта и Caddy. Не переносите на него персональные данные пилота или production-секреты. Удалённый сервер должен быть Ubuntu 24.04 LTS либо другой поддерживаемой Docker версией Ubuntu.

## Что уже есть и чего пока нет

| Есть в репозитории | Пока отсутствует |
|---|---|
| `compose.site.yml` + `ops/compose/dev-vps/site.yml`: отдельные CMS Postgres, Strapi CMS и core-site | immutable GHCR-образы и ограниченная deploy-команда на VPS |
| `compose.yml` + `ops/compose/dev-vps/product.yml`: Postgres, Redis (2 роли), MinIO, Mailpit, миграции, backend и cabinet | отдельная database-login роль `NOBYPASSRLS` для backend перед пилотными данными |
| `apps/web/Dockerfile` и Dockerfile backend: standalone-сборки приложения | активный GitHub Actions workflow: `.github/workflows/ci.yml` сейчас полностью закомментирован |
| `ops/caddy/Caddyfile.dev-vps.example`: четыре домена, HTTPS и защита CMS | CI/CD с GHCR и готовый `turni-deploy` на VPS |
| SOPS/age bootstrap | site/product образы в GHCR |

`ops/compose/dev-vps/product.yml` добавляет к продуктовой инфраструктуре миграции, backend и кабинет. `ops/compose/dev-vps/site.yml` оставляет site-стек отдельным. Оба Compose-проекта не делят Docker-сеть или БД; связь между доменами делает только Caddy через `127.0.0.1`.

> Ограничение dev-стенда: текущие миграции создают `app_rw` без login-роли, поэтому backend подключается bootstrap-пользователем Postgres из `DATABASE_URL`. Это не соответствует production-требованию `NOBYPASSRLS`; не используйте стенд для пилотных/production данных, пока отдельная миграция с login-ролью не пройдёт founder review.

## Входные данные владельца

- IPv4 VPS и SSH-ключ администратора;
- A/AAAA записи `turni.ru`, `www.turni.ru`, `cms.turni.ru`, `app.turni.ru` и `api.turni.ru`, все на IP VPS;
- статический публичный IP администратора для CMS;
- новый пароль почты: старый, присланный в чат, отозван и не используется;
- офлайн age identity и два проверенных офлайн-бэкапа; private key не копируется в Git, GitHub Secrets, мессенджер или на VPS;
- отдельный GHCR read-only token только если образы приватные. Для GitHub Packages это classic PAT с минимальным `read:packages`.

## 1. Подготовить Ubuntu и SSH

Войдите под провайдерским администратором. Сначала добавьте свой публичный SSH ключ, убедитесь, что второй сеанс входит по ключу, и только затем выключайте password auth. Не закрывайте текущий SSH-сеанс до проверки нового.

```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y ca-certificates curl gnupg git ufw
sudo adduser --disabled-password --gecos '' turni
sudo install -d -m 700 -o turni -g turni /home/turni/.ssh
sudo install -m 600 -o turni -g turni /dev/null /home/turni/.ssh/authorized_keys
sudoedit /home/turni/.ssh/authorized_keys
sudoedit /etc/ssh/sshd_config.d/99-turni-hardening.conf
```

В `99-turni-hardening.conf` укажите:

```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
```

Примените только после проверки нового SSH-сеанса:

```bash
sudo systemctl reload ssh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

## 2. Установить Docker Engine и Compose

Используйте официальный Docker apt-репозиторий, а не `docker.io` из Ubuntu. Команды ниже соответствуют [официальной инструкции Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker turni
sudo -iu turni docker version
sudo -iu turni docker compose version
```

`<<EOF` означает многострочный ввод: после вставки блока shell показывает приглашение `>` и ждёт строку `EOF` без пробелов. Это нормальное поведение. Если ввод прерван или терминал уже ждёт `>`, нажмите `Ctrl+C` и выполните вариант без многострочного ввода:

```bash
sudo rm -f /etc/apt/sources.list.d/docker.sources
. /etc/os-release
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "${UBUNTU_CODENAME:-$VERSION_CODENAME}" "$(dpkg --print-architecture)" | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker turni
sudo -iu turni docker version
sudo -iu turni docker compose version
```

Docker-порты обходят обычные правила UFW. Поэтому все сервисные порты должны быть привязаны к `127.0.0.1`, а не к `0.0.0.0`.

## 3. Установить Caddy и открыть четыре домена

Установите Caddy из [официального репозитория](https://caddyserver.com/docs/install):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Создайте парольный хэш интерактивно, чтобы пароль не попал в историю shell: `sudo caddy hash-password`. Скопируйте [`ops/caddy/Caddyfile.dev-vps.example`](../../ops/caddy/Caddyfile.dev-vps.example) в `/etc/caddy/Caddyfile` и создайте системный environment-файл с ограниченными правами:

```bash
sudo install -m 640 -o root -g caddy /dev/null /etc/caddy/turni.env
sudoedit /etc/caddy/turni.env
sudo systemctl edit caddy
```

В `/etc/caddy/turni.env` укажите только подстановки для CMS:

```dotenv
CMS_ADMIN_IP=<ваш-статический-публичный-IP>
CMS_ADMIN_USER=turni-admin
CMS_ADMIN_PASSWORD_HASH=<результат-sudo-caddy-hash-password>
```

В открывшемся systemd override добавьте:

```ini
[Service]
EnvironmentFile=/etc/caddy/turni.env
```

Маршруты шаблона: `turni.ru` → core-site, `www.turni.ru` → редирект на основной домен, `cms.turni.ru` → Strapi только с разрешённого IP + Basic Auth, `app.turni.ru` → кабинет и `api.turni.ru` → backend. CMS защищена отдельно; не меняйте её на публичный маршрут.

Перед включением убедитесь, что DNS уже указывает на VPS: Caddy сам выпустит HTTPS-сертификаты, когда сможет принять порт 80/443. `remote_ip` здесь верен, потому что Caddy принимает соединение напрямую, без внешнего CDN/proxy. Если перед ним появится CDN, замените эту часть на `client_ip` и настройте trusted proxies по [документации Caddy matchers](https://caddyserver.com/docs/caddyfile/matchers).

```bash
sudo systemctl daemon-reload
sudo systemctl restart caddy
sudo systemctl is-active --quiet caddy
curl -I https://turni.ru
curl -I https://cms.turni.ru
curl -I https://app.turni.ru
curl -I https://api.turni.ru/healthz
```

## 4. Разместить репозиторий и изолировать порты

```bash
sudo install -d -m 0750 -o turni -g turni /srv/turni
sudo -iu turni git clone git@github.com:turni-dev/platform.git /srv/turni/platform
sudo -iu turni mkdir -p /srv/turni/config
```

Не публикуйте наружу Postgres, Redis, MinIO, Strapi или Mailpit. Все порты в `compose.yml` и `compose.site.yml` по умолчанию привязаны к `127.0.0.1`; наружу открывает только Caddy порты 80 и 443. Не переопределяйте `PRODUCT_BIND_ADDRESS` или `SITE_BIND_ADDRESS` значением `0.0.0.0`.

## 5. Секреты, миграции и запуск

Источником остаётся `ops/sops/secrets.enc.json`; смотрите [`ops/sops/README.md`](../../ops/sops/README.md). На сервере нет private age identity: расшифрованные значения доставляет владелец из защищённого канала в файлы с правами `0600`.

Скопируйте примеры из репозитория, но создавайте реальные файлы только вне Git. В `product.env` секреты подписи должны быть разными и длиной не менее 32 символов; `DATABASE_URL` указывает внутри Docker на `postgres`, а не на `localhost`. `APP_ORIGIN=https://app.turni.ru`, а `PUBLIC_WEBHOOK_ORIGIN=https://api.turni.ru` уже заданы в шаблоне — это важно для cookie и VK callback.

```bash
sudo -iu turni cp /srv/turni/platform/ops/compose/dev-vps/site.env.example /srv/turni/config/site.env
sudo -iu turni cp /srv/turni/platform/ops/compose/dev-vps/product.env.example /srv/turni/config/product.env
sudo chown turni:turni /srv/turni/config/site.env /srv/turni/config/product.env
sudo chmod 600 /srv/turni/config/site.env /srv/turni/config/product.env
sudoedit /srv/turni/config/site.env
sudoedit /srv/turni/config/product.env

sudo -iu turni bash -lc 'cd /srv/turni/platform && docker compose --project-name turni-site --env-file /srv/turni/config/site.env -f compose.site.yml -f ops/compose/dev-vps/site.yml up -d --build'
sudo -iu turni bash -lc 'cd /srv/turni/platform && docker compose --project-name turni-product --env-file /srv/turni/config/product.env -f compose.yml -f ops/compose/dev-vps/product.yml up -d --build'
```

В product-стеке сервис `migrate` применяет миграции под advisory lock и обязан завершиться успешно до запуска backend. Не удаляйте его и не запускайте backend в обход Compose: иначе новая БД не пройдёт миграции.

Проверки и безопасная диагностика:

```bash
sudo -iu turni docker compose --project-name turni-site -f /srv/turni/platform/compose.site.yml ps
sudo -iu turni docker compose --project-name turni-product -f /srv/turni/platform/compose.yml -f /srv/turni/platform/ops/compose/dev-vps/product.yml ps
curl -fsS http://127.0.0.1:3002/ >/dev/null
curl -fsS http://127.0.0.1:1337/admin >/dev/null
curl -fsS http://127.0.0.1:3001/login >/dev/null
curl -fsS http://127.0.0.1:3000/healthz >/dev/null
sudo -iu turni docker compose --project-name turni-site -f /srv/turni/platform/compose.site.yml logs --tail=100 core-site cms
sudo -iu turni docker compose --project-name turni-product -f /srv/turni/platform/compose.yml -f /srv/turni/platform/ops/compose/dev-vps/product.yml logs --tail=100 migrate backend web
```

Не отправляйте в issue/чат полный вывод логов CMS или формы: там могут быть контакты и тексты заявок.

## 6. Путь к CI/CD

Сейчас `.github/workflows/ci.yml` целиком закомментирован; CI/CD фактически не выполняется. Dev-стенд выше собирает исходный код на VPS и уже открывает все четыре домена, но не делает автодеплой. Отдельная инфраструктурная карта должна сделать следующее:

1. включить verify workflow и убедиться, что `npm ci`, tests, lint, typecheck, eval, build и Lighthouse проходят на GitHub Actions;
2. собирать и публиковать три immutable GHCR-тега `sha-<full-commit>` для backend, core-site и CMS; GitHub Actions использует `GITHUB_TOKEN` с `packages: write`, как описано в [GitHub Docs](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images?learn=continuous_deployment);
3. добавить VPS deployment compose, который ссылается только на эти теги и не делает `git pull` или `docker build` на сервере;
4. разрешить GitHub environment `staging` только после появления ограниченной команды `/usr/local/bin/turni-deploy`; SSH-ключ Actions получает только `turni` и способен вызвать лишь эту команду через allowlisted sudo;
5. хранить в GitHub только SSH key/known hosts и, при необходимости, узкий `read:packages` token. Private age key никогда туда не передавать.

До включения deploy-секретов пройдите [runbook настроек GitHub](github-repository-settings.md): там уже зафиксировано правило не заводить `STAGING_SSH_*`, пока VPS, ограниченный deploy-пользователь, known hosts и команда `turni-deploy` не готовы.

После появления immutable-образов откат — это установка предыдущего `sha-<commit>` в deployment compose и `docker compose up -d`; данные volumes не удаляются. Для текущей сборки из исходников откат — `git checkout` на известный commit, затем повторный `docker compose ... up -d --build`.

## Проверка перед передачей стенда

- `docker compose ps` обоих проектов показывает здоровые сервисы, а `migrate` завершился с кодом 0;
- `https://turni.ru` открывает сайт;
- `https://cms.turni.ru` возвращает 403 с чужого IP и basic auth с разрешённого;
- `https://app.turni.ru/login` открывает кабинет, а `https://api.turni.ru/healthz` возвращает 200;
- с внешней машины не доступны `5432`, `5433`, `6379`, `6380`, `9000`, `9001`, `1025`, `1337`, `3000`, `3001` и `3002`;
- пароль почты и ключи не находятся через `git grep`, `history` или GitHub Secrets, кроме допустимых deploy SSH credentials.
