<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Команда/Синтез команды.md" -->

# Синтез рефлексии команды (6 ролей) — архив

Свод консенсуса по ролевому анализу (Бизнес, Sales, Маркетинг, CTO, DevOps, Поддержка) идеи control plane для ИИ-агентов.

## Консенсус всех ролей
1. Одна вертикаль вместо трёх — Support Copilot: измеримый outcome (resolution), pricing-бенчмарк $0.5-2, структурированные данные (helpdesk API), «погорельцы» конкурентов как тёплые лиды. Sales Assistant — токсичная категория после Artisan/11x.
2. Позиционирование перевёрнуто: продаём «надёжного ИИ-сотрудника под контролем», control plane — это «почему доверяют», не «что покупают». Слово «control plane» наружу не выносить (занято Microsoft). Кандидат категории: «AI Workforce Management».
3. Approval Inbox — главный актив: одновременно главный экран продукта, демо для продаж и маркетинговый материал.
4. Обещание ценности — «стажёр под контролем», не «замена сотрудника»; никогда не обещать замену людей и «защиту от prompt injection» (только containment/blast radius).
5. Pricing — гибрид без per-seat: Starter ~$299/мес (1 агент+квота) + overage ~$0.6/resolution, outcome-тариф — апселл позже; cost-per-resolution telemetry и биллинг-события с первого дня.
6. Dogfooding: собственный Support Copilot — первая линия своей поддержки и build-in-public контент.

## Ключевые архитектурные решения (CTO+DevOps)
MCP-proxy вместо слоя RuntimeAdapter'ов даёт runtime-agnostic бесплатно; ни один tool call мимо гейтвея, весь egress через forward proxy. Брать готовое: Anthropic managed agents (единственный runtime MVP), Temporal Cloud (workflow+approvals как signals), Galileo Agent Control (policy engine), Postgres+pgvector+RLS, E2B/Modal (sandbox), Vanta (SOC 2). Строить самим только ядро: MCP Policy Proxy (~2-3 тыс. строк), Approval Inbox, Tool Registry (YAML, risk class), append-only Audit Log с hash-chain. Выкинуть из MVP: Memory Manager, визуальный Agent Builder, Trust Center (пока страница), multi-runtime; уровни автономности свести к 3 (shadow → draft → approve-on-risk). Trajectory evals с первого дня — оценка только финального вывода скрывает 20-40% ошибок.

## Главные риски и митигации
- Cross-tenant утечка (DevOps) → RLS + автотест изоляции в CI на каждый PR.
- Публичный косяк агента у клиента (CS/бизнес) → лестница автономности, incident playbook (ack ≤1ч, RCA ≤24ч) до запуска.
- Отрицательная маржа на активных клиентах (бизнес) → COGS-cap, цель cost-per-resolution <$0.15, gross margin ≥70%.
- Approval fatigue — 40 запросов/день → игнор инбокса (CS) → пресеты риска, batch-approvals, авто-повышение автономности после N безошибочных approve.
- Microsoft/Google bundling governance бесплатно (бизнес) → окно 12-18 мес, скорость+вертикаль+runtime-agnostic.
- Коммодитизация: Anthropic/OpenAI добавят approvals в managed agents (бизнес/CTO) → ценность в переносимом MCP-слое и вертикальной упаковке.
- Onboarding-провал, «много setup до пользы» (CS) → TTV ≤30 мин через shadow-run на исторических данных.

## Открытые вопросы к фаундеру (на момент синтеза)
1. Подтвердить Support Copilot как единственную вертикаль MVP (все роли — за).
2. Pricing inference: passthrough по API-ключам клиента или своя маржа?
3. SOC 2 Type I сейчас (~$15k) или после первого mid-market запроса?
4. Paid design partners: $500-1000/мес как фильтр серьёзности — да/нет?
5. 2 часа/нед на founder-led контент — реалистично?

## План на 90 дней (склейка ролей)
Недели 1-4: 20-30 discovery-интервью (sales) ‖ PoC MCP Proxy+Slack-approval+audit log+Support Copilot demo (CTO) ‖ landing+waitlist+первые посты (маркетинг) ‖ Terraform-стенд (devops). Недели 5-8: Security PoC на 7 атак с записанными демо (devops) ‖ продать 3 paid design partners (sales) ‖ onboarding-плейбук ≤14 дней (CS). Недели 9-12: мультитенантность+Approval Inbox web+3 уровня автономности (CTO) ‖ первый кейс с цифрами «X тикетов, Y часов» (маркетинг) ‖ health-метрики и анти-churn алерты (CS) ‖ цель $1.5K MRR.
