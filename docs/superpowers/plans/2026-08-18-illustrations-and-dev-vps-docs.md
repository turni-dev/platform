# Иллюстрации сайта и Ubuntu dev-стенд: план подготовки документов

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить готовые к применению промпты иллюстраций и безопасный runbook полного dev-стенда Turni на одном Ubuntu VPS.

**Architecture:** Первый документ задаёт общий art direction и три конкретных слота для медиа, которые загружаются в Strapi CMS. Второй документ описывает один VPS с изолированными site/CMS и product Compose-стеками, Caddy как HTTPS ingress, SOPS/age для секретов и целевым GitHub→GHCR→SSH процессом, ясно отделяя реализованное от будущей автоматизации.

**Tech Stack:** Markdown, Docker Compose, Ubuntu, UFW, Caddy, SOPS/age, GitHub Actions, GHCR.

---

### Task 1: Пакет промптов иллюстраций корп-сайта

**Files:**
- Create: `docs/content/site-illustration-prompts.md`

- [ ] **Step 1: Зафиксировать общую арт-дирекцию и правила использования**

  Описать единую спокойную минималистичную изометрическую иллюстрацию: светлая
  нейтральная база, один акцент из токенов сайта, мягкая геометрия, без людей,
  текста, логотипов и UI, который мог бы быть принят за работающий продукт.
  Указать прозрачный фон, экспорт в WebP/AVIF, размещение в Strapi CMS, alt
  как обязательное поле и правило не класть файлы в Git.

- [ ] **Step 2: Описать три промпта и метаданные**

  Для hero, «обвязки агента» и «развёртывания в контуре клиента» дать цель,
  сюжет, точный prompt, negative prompt, формат, рекомендуемую композицию и
  русский alt-текст. Отдельно дать требования к честному mock-screen
  компоненту: белый экран, явно маркированный макет, без метрик и элементов,
  создающих видимость работающей функции.

- [ ] **Step 3: Проверить документ на противоречия**

  Run:

  ```powershell
  rg -n -i 'TODO|TBD|плейсхолдер|несуществующ' docs/content/site-illustration-prompts.md
  ```

  Expected: нет незаполненных инструкций; слово «несуществующий» допустимо
  только в запрете выдавать макет за живой продукт.

### Task 2: Runbook полного Ubuntu dev-стенда

**Files:**
- Create: `docs/runbooks/ubuntu-dev-vps.md`
- Reference: `compose.yml`
- Reference: `compose.site.yml`
- Reference: `ops/sops/README.md`
- Reference: `docs/runbooks/github-repository-settings.md`

- [ ] **Step 1: Описать модель стенда и обязательные входные данные**

  Указать один Ubuntu VPS как dev-only, два раздельных Compose-проекта и
  маршрутизацию `turni.ru` → core-site, `cms.turni.ru` → CMS. Перечислить
  ввод владельца: VPS IP, DNS-записи, статический IP администратора для CMS,
  age identity вне сервера/репозитория и восстановленные production-пароли.

- [ ] **Step 2: Дать воспроизводимую подготовку сервера и ingress**

  Добавить команды для обновления Ubuntu, установки Docker Engine/Compose,
  создания непривилегированного deploy-пользователя, UFW (только SSH, 80 и
  443), установки Caddy и проверки DNS/HTTPS. Конфиг Caddy должен закрывать
  `cms.turni.ru` одновременно basic auth и allowlist IP, не открывать порты
  Postgres, Redis, MinIO, Strapi и Mailpit в интернет.

- [ ] **Step 3: Описать секреты, запуск и проверку двух стеков**

  Дать шаблон структурированных файлов окружения с именами переменных без
  значений секретов; описать расшифровку SOPS без вывода в терминал, права
  `0600`, запуск `compose.site.yml` и `compose.yml`, health-проверки,
  просмотр логов без тел заявок и rollback к предыдущему тегу образа.

- [ ] **Step 4: Описать безопасный путь к CI/CD без ложных утверждений**

  Зафиксировать: CI уже проверяет код, но не публикует site-образы и не имеет
  production ingress/deploy workflow. Описать требуемые следующие изменения:
  публикация неизменяемых тегов в GHCR, SSH secrets только после готового
  deploy-пути, deploy через allowlisted `sudo`-скрипт и ручное approval в
  GitHub environment. Не предлагать передавать age private key в GitHub.

- [ ] **Step 5: Проверить Markdown и точность ссылок на проект**

  Run:

  ```powershell
  git diff --check; rg -n 'compose\.site\.yml|compose\.yml|ops/sops/README\.md|github-repository-settings\.md' docs/runbooks/ubuntu-dev-vps.md
  ```

  Expected: `git diff --check` не выводит ошибок; все четыре существующих
  источника упомянуты в runbook.

- [ ] **Step 6: Зафиксировать документацию одним коммитом**

  ```powershell
  git add docs/content/site-illustration-prompts.md docs/runbooks/ubuntu-dev-vps.md
  git commit -m "docs: add illustration prompts and dev vps runbook"
  ```

