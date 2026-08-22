<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Команда/CTO и архитектура.md" -->

# Роль: CTO / Архитектор (архив)

Часть ролевого синтеза команды по идее control-plane для ИИ-агентов.

Ставка на Control Plane вместо своего runtime считается верной: рынок runtime уже выигран Anthropic/OpenAI/LangGraph, ценность — в слое доверия и контроля (Policy Gateway с default deny, Approval Inbox, Audit Logs, уровни автономности). Overengineering-ловушки для соло/пары разработчиков: универсальный RuntimeAdapter с первого дня, полноценный Memory Manager, свой Workflow Engine (есть Temporal), визуальный Agent Builder, 5 уровней автономности сразу (нужны 2–3). Главная архитектурная сложность не в коде, а в семантике «не goal hijacking ли этот безобидный вызов», и в том, чтобы агент физически не мог обойти gateway (MCP-proxy паттерн, а не «вежливая просьба» в промпте).

Брать готовое: MCP как единственный интерфейс к тулзам (gateway становится MCP-proxy, runtime-agnostic бесплатно), Galileo Agent Control как policy engine, Temporal Cloud для durable workflows/approvals-как-signals, managed agents Anthropic как единственный runtime MVP, Postgres+pgvector с RLS, без Kubernetes.

Строить самим (ядро дифференциации): MCP Policy Proxy (~2-3 тыс строк, allow/deny/pause-for-approval на каждый tool call), Approval Inbox (web + Slack), Tool Registry (YAML-манифесты с risk class), append-only Audit Log с полной trajectory. Выкинуть из MVP: Memory Manager, Agent Builder, Trust Center (страница-заглушка), multi-runtime, свести к одной вертикали (Support Copilot).

Риски: продукт обещает контроль, но не качество — нужны trajectory evals с первого дня (оценка только финального вывода скрывает 20-40% ошибок); стоимость inference как риск при per-seat (лучше per-task/passthrough); vendor lock-in на Anthropic managed agents — митигация через переносимый MCP-слой; multi-runtime с первого дня нереален (семантика ошибок/interrupt/resume разная); каждый tool call через proxy добавляет latency, approval-паузы требуют durable-состояния.

План: PoC 2-4 недели (MCP Proxy с YAML-политиками, Slack-approval через Temporal signal, audit log, один Support Copilot на managed agent с 3-4 тулзами). MVP 2-3 месяца: мультитенантность+RLS+Tool Registry UI+Approval Inbox в вебе (месяц 1), workflow-триггеры на Temporal+RAG+Galileo guardrails (месяц 2), trajectory evals+полировка под design partners (месяц 3). Стек: TypeScript, Node/Hono (proxy), Next.js, Postgres+pgvector, Temporal Cloud, Anthropic API, Fly.io/Railway, без Kubernetes.

Запросы к другим ролям: от бизнеса — 3-5 design partners до конца PoC и решение по pricing; от sales — список 10 реальных интеграций, которые спрашивают клиенты; от маркетинга — позиционирование «контроль и аудит», не «умные агенты»; от devops — чек-лист SOC 2 readiness к месяцу 3; от поддержки — SLA на реакцию в Approval Inbox.
