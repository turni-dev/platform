# Ubuntu dev-стенд на одном VPS

Этот runbook поднимает **dev-стенд**, а не production: на одном Ubuntu VPS живут два изолированных Docker Compose-проекта и Caddy. Не переносите на него персональные данные пилота или production-секреты. Удалённый сервер должен быть Ubuntu 24.04 LTS либо другой поддерживаемой Docker версией Ubuntu.

## Что уже есть и чего пока нет

| Есть в репозитории | Пока отсутствует |
|---|---|
| `compose.site.yml`: отдельные CMS Postgres, Strapi CMS и core-site | production-ready Caddyfile и VPS compose-override |
| `compose.yml`: Postgres, Redis (2 роли), MinIO и Mailpit для продукта | сервис backend в product Compose-файле |
| Dockerfile backend и шаблон GHCR/deploy workflow | активный workflow: `.github/workflows/ci.yml` сейчас полностью закомментирован |
| SOPS/age bootstrap | site images в GHCR и готовый `turni-deploy` на VPS |

Поэтому сейчас публично можно корректно поднять сайт/CMS, а продуктовый Compose поднимет только его инфраструктурные зависимости. Не выставляйте `app.turni.ru` или `api.turni.ru`, пока отдельная карта не добавит backend service и его конфигурацию в deployment compose.

## Входные данные владельца

- IPv4 VPS и SSH-ключ администратора;
- A/AAAA записи `turni.ru` и `cms.turni.ru`, обе на IP VPS;
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
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'
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

Docker-порты обходят обычные правила UFW. Поэтому все сервисные порты должны быть привязаны к `127.0.0.1`, а не к `0.0.0.0`.

## 3. Установить Caddy и закрыть CMS

Установите Caddy из [официального репозитория](https://caddyserver.com/docs/install):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Создайте парольный хэш интерактивно, чтобы пароль не попал в историю shell: `sudo caddy hash-password`. Поместите только получившийся хэш в `/etc/caddy/Caddyfile`; Caddy не принимает plaintext. В конфиге замените `ADMIN_IP` и `PASSWORD_HASH` на реальные значения.

```caddyfile
turni.ru {
    reverse_proxy 127.0.0.1:3002
}

cms.turni.ru {
    @blocked not remote_ip ADMIN_IP
    respond @blocked "Forbidden" 403

    basic_auth {
        turni-admin PASSWORD_HASH
    }
    reverse_proxy 127.0.0.1:1337
}
```

Перед включением убедитесь, что DNS уже указывает на VPS: Caddy сам выпустит HTTPS-сертификаты, когда сможет принять порт 80/443. `remote_ip` здесь верен, потому что Caddy принимает соединение напрямую, без внешнего CDN/proxy. Если перед ним появится CDN, замените эту часть на `client_ip` и настройте trusted proxies по [документации Caddy matchers](https://caddyserver.com/docs/caddyfile/matchers).

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl -I https://turni.ru
curl -I https://cms.turni.ru
```

## 4. Разместить репозиторий и изолировать порты

```bash
sudo install -d -m 0750 -o turni -g turni /srv/turni
sudo -iu turni git clone git@github.com:turni-dev/platform.git /srv/turni/platform
sudo -iu turni mkdir -p /srv/turni/config
sudo -iu turni tee /srv/turni/platform/compose.dev-vps.override.yml >/dev/null <<'EOF'
services:
  cms-postgres:
    ports: ["127.0.0.1:5433:5432"]
  cms:
    ports: ["127.0.0.1:1337:1337"]
  mailpit:
    ports: ["127.0.0.1:8026:8025"]
  core-site:
    ports: ["127.0.0.1:3002:3002"]
EOF
```

Не публикуйте наружу Postgres, Redis, MinIO, Strapi или Mailpit. Текущие `compose.yml` и `compose.site.yml` имеют удобные для localhost порты без 127.0.0.1, поэтому override обязателен на VPS.

## 5. Секреты и запуск

Источником остаётся `ops/sops/secrets.enc.json`; смотрите [`ops/sops/README.md`](../../ops/sops/README.md). На сервере нет private age identity: расшифрованные значения доставляет владелец из защищённого канала в файлы с правами `0600`.

Шаблон `/srv/turni/config/site.env` (значения не хранить в репозитории):

```dotenv
CMS_POSTGRES_DB=strapi
CMS_POSTGRES_USER=strapi
CMS_POSTGRES_PASSWORD=<random-secret>
CMS_APP_KEYS=<three-comma-separated-random-values>
CMS_API_TOKEN_SALT=<random-secret>
CMS_ADMIN_JWT_SECRET=<random-secret>
CMS_TRANSFER_TOKEN_SALT=<random-secret>
CMS_JWT_SECRET=<random-secret>
CMS_ENCRYPTION_KEY=<exactly-32-byte-base64-key>
CMS_WRITE_TOKEN=<site-lead-write-token>
SITE_SMTP_HOST=mail.hosting.reg.ru
SITE_SMTP_PORT=465
SITE_SMTP_USER=hello@turni.ru
SITE_SMTP_PASSWORD=<rotated-password>
SITE_EMAIL_FROM=hello@turni.ru
```

```bash
sudo chown turni:turni /srv/turni/config/site.env
sudo chmod 600 /srv/turni/config/site.env
sudo -iu turni bash -lc 'cd /srv/turni/platform && docker compose --project-name turni-site --env-file /srv/turni/config/site.env -f compose.site.yml -f compose.dev-vps.override.yml up -d --build'
sudo -iu turni bash -lc 'cd /srv/turni/platform && docker compose --project-name turni-product -f compose.yml up -d'
```

Проверки и безопасная диагностика:

```bash
sudo -iu turni docker compose --project-name turni-site -f /srv/turni/platform/compose.site.yml ps
sudo -iu turni docker compose --project-name turni-product -f /srv/turni/platform/compose.yml ps
curl -fsS http://127.0.0.1:3002/ >/dev/null
curl -fsS http://127.0.0.1:1337/admin >/dev/null
sudo -iu turni docker compose --project-name turni-site -f /srv/turni/platform/compose.site.yml logs --tail=100 core-site cms
```

Не отправляйте в issue/чат полный вывод логов CMS или формы: там могут быть контакты и тексты заявок.

## 6. Путь к CI/CD

Сейчас `.github/workflows/ci.yml` целиком закомментирован; CI/CD фактически не выполняется. Его шаблон публикует только backend image, а сайт/CMS не публикует. Следующая инфраструктурная карта должна сделать следующее:

1. включить verify workflow и убедиться, что `npm ci`, tests, lint, typecheck, eval, build и Lighthouse проходят на GitHub Actions;
2. собирать и публиковать три immutable GHCR-тега `sha-<full-commit>` для backend, core-site и CMS; GitHub Actions использует `GITHUB_TOKEN` с `packages: write`, как описано в [GitHub Docs](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images?learn=continuous_deployment);
3. добавить VPS deployment compose, который ссылается только на эти теги и не делает `git pull` или `docker build` на сервере;
4. разрешить GitHub environment `staging` только после появления ограниченной команды `/usr/local/bin/turni-deploy`; SSH-ключ Actions получает только `turni` и способен вызвать лишь эту команду через allowlisted sudo;
5. хранить в GitHub только SSH key/known hosts и, при необходимости, узкий `read:packages` token. Private age key никогда туда не передавать.

До включения deploy-секретов пройдите [runbook настроек GitHub](github-repository-settings.md): там уже зафиксировано правило не заводить `STAGING_SSH_*`, пока VPS, ограниченный deploy-пользователь, known hosts и команда `turni-deploy` не готовы.

После появления immutable-образов откат — это установка предыдущего `sha-<commit>` в deployment compose и `docker compose up -d`; данные volumes не удаляются. Для текущей сборки из исходников откат — `git checkout` на известный commit, затем повторный `docker compose ... up -d --build`.

## Проверка перед передачей стенда

- `docker compose ps` обоих проектов показывает здоровые сервисы;
- `https://turni.ru` открывает сайт;
- `https://cms.turni.ru` возвращает 403 с чужого IP и basic auth с разрешённого;
- с внешней машины не доступны `5432`, `5433`, `6379`, `6380`, `9000`, `9001`, `1025`, `1337`, `3000` и `3002`;
- пароль почты и ключи не находятся через `git grep`, `history` или GitHub Secrets, кроме допустимых deploy SSH credentials.
