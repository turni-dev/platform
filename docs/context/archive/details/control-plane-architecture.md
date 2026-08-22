<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Детали/Архитектура control plane.md" -->

# Архитектурное видение: Control Plane для ИИ-сотрудников

Идея: не конкурировать с open-source agent runtimes (Hermes/OpenClaw) и не писать свой runtime, а построить продуктовый **control plane поверх них** — слой настройки, безопасности, ролей, памяти, инструментов, сценариев, аудита и эксплуатации. Runtime выполняет задачи; control plane разрешает, ограничивает, наблюдает и объясняет.

**Модель агента:** роль + инструкции + источники знаний + память + инструменты + workflow + права + правила аппрува + runtime backend + аудит-логи. Универсальность продукта — не в «супер-агенте», а в конструкторе управляемых сценариев (роли, workflow, tool adapters, permission engine, memory layer, runtime adapters).

**Ключевые архитектурные компоненты:** Runtime Adapter layer (тонкий translation layer к Hermes/OpenClaw/Codex/OpenHands, единый AgentSpec/PolicyBundle, чтобы не завязываться на один runtime), Policy Gateway (каждый tool call проходит permission check → approval check → scoped credentials → execution → audit, а не вызывается агентом напрямую), уровни автономности (shadow mode → draft mode → approve-on-risk → dual control → emergency freeze), типизированная память (knowledge/work/preferences/long-term learnings/runtime), RAG вместо fine-tuning на данных клиента, tenant isolation (отдельные namespaces, ключи шифрования, audit logs), Trust Center для прозрачности клиенту.

**Главные угрозы:** неуправляемая агентность — prompt injection (прямой и через документы), skill injection, RCE через shell, SSRF, утечка secrets, cross-tenant bleed, approval bypass. Принцип защиты: ограничения enforce-ятся вне модели (default deny, sandbox, secrets broker, audit, tenant isolation, emergency freeze).

**MVP по приоритетам:** P0 — Agent Builder, Hermes/OpenClaw адаптеры, Policy Gateway, Approval Inbox, Audit Logs. P1 — Tool Registry, Memory Manager, RAG Layer, Workflow Engine, шаблоны. P2 — Trust Center, Evals, red-team harness, enterprise/on-prem, billing, marketplace.

**Первые вертикальные шаблоны:** Support Copilot (read-heavy, отправка после подтверждения), Sales Assistant (CRM read + черновики, изменения после approval), Ops Agent (read-only + sandbox shell, prod-действия через dual control).

**Бизнес-модель:** сочетание base subscription + active agents + usage limits + enterprise deployment; тарифы Starter/Team/Enterprise. Риски: зависимость от runtime (решение — adapter layer), сложность безопасности, слишком широкий MVP (решение — 2-3 вертикали сначала), игрушечность (решение — recurring workflows), недоверие бизнеса (решение — Trust Center и изоляция).

**Roadmap:** 1) Technical PoC (единый агент через разные runtime), 2) Security PoC (red-team проверки), 3) Product MVP (Agent Builder + 3 шаблона + approval inbox + audit), 4) 3 design-partner пилота (support/sales/ops), 5) Enterprise layer.

Итоговое позиционирование: «Мы превращаем open-source agent runtimes в управляемых ИИ-сотрудников для бизнеса» / «Control Plane для ИИ-сотрудников: найм, настройка, права, память, workflow, approvals и аудит поверх Hermes/OpenClaw».
