# Dev VPS Runbooks Design

## Goal

Зафиксировать развёртывание и ежедневную эксплуатацию текущего dev-стенда Turni
на одном Ubuntu VPS без сохранения секретов в Git.

## Documents

- `docs/runbooks/ubuntu-dev-vps.md` — линейное развёртывание с чистого Ubuntu:
  доступ по SSH, Docker, DNS, Caddy, checkout `main`, внешние env-файлы и
  первый запуск site- и product-стеков.
- `docs/runbooks/dev-vps-operations.md` — краткий операционный справочник:
  обновление из `main`, пересборка одного или всех сервисов, health-проверки,
  CMS-токены и диагностика уже встречавшихся отказов.

## Deployment Model

VPS использует пользователя `turni`, checkout `/srv/turni/platform` и два
изолированных Compose-проекта: `turni-site` и `turni-product`. Конфигурация и
секреты лежат только в `/srv/turni/config/site.env` и
`/srv/turni/config/product.env`; Caddy — единственная публичная точка входа.
Для текущего dev-стенда `cms.turni.ru` намеренно открыт без gateway-защиты;
это нужно отметить как неприемлемое для production.

## Safety Boundaries

Документы используют переменные-заглушки и никогда не содержат реальных
паролей, API-токенов, SSH-ключей, password-хэшей, IP-адресов или содержимого
env-файлов. Команды обновления не удаляют Docker volumes: `down -v`, удаление
томов и сброс баз данных в runbook не предлагаются.

## Verification

Каждый путь заканчивается конкретной проверкой: `docker ps`, container logs,
внутренние health URL либо `caddy validate`. Для диагностических процедур
указана наблюдаемая причина и минимальная обратимая команда восстановления.
