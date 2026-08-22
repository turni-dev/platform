<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Детали/Задачи разработки и модель данных.md" -->

# Handoff для разработки: модель данных, контракты, задачи

Документ System Analyst (12.06.2026) — техническая проекция продуктового видения на схему БД, контракты модулей и бэклог.

**Модель данных (Postgres, FORCE RLS по tenant_id везде кроме tenants):** tenants, users, guests (уникальность по телефону), agents (в MVP один на tenant), memory_files (md-контент прямо в Postgres, не object storage — решение ради транзакционности, RLS и единого источника истины с pgvector), memory_revisions (версионирование таблицей, не git — совместимость с мультитенантностью и RLS, rollback одной строкой), memory_chunks (embeddings + HNSW), conversations, messages, actions (намерения типа брони, с undo-окном 30с), approvals (SLA, decision, edited_payload), policies (md-скиллы, компилированные в jsonb), events (append-only tracking), usage_counters (rate limits/биллинг).

**Контракты модулей (TS-интерфейсы):** Router (в MVP passthrough), FrontLine, Memory (retrieve/append с requiresApproval), PolicyEngine (assess → Verdict safe/risky/blocked), ApprovalService, Reporter. Шина — typed DomainEvent через in-process EventEmitter с записью в events.

**Memory-подсистема (ядро дифференциации):** структура identity.md / knowledge/ / policies/ / learned/YYYY-MM.md. Онбординг пишет identity+knowledge с возможностью правки владельцем («прозрачная память» как UX-фича). Approve с правкой → diff → дешёвая модель формулирует кандидат-правило → learned/ со статусом pending, требует явного подтверждения владельца — защита от отравления памяти. Чтение — identity целиком в промпт + top-6 cosine similarity из knowledge/learned. Конкурентные записи защищены optimistic lock.

**Бэклог задач** разбит на эпики E1–E7 (Скелет+CI, Пайплайн, Память, Policy, Approval, UI, Эксплуатация), задачи по 0.5–2 дня part-time с явными зависимостями и исполнителями (фаундер/фронт/девопс).

**Топ-5 технических рисков:** латентность >10с при нескольких LLM-вызовах (решение — детерминированные правила без LLM где можно, параллелизация, бюджет латентности в трейсах); ложноотрицательные по риску >2% (датасет до тюнинга, блокирующий CI-гейт, fail-closed при низком confidence); конкурентные записи в память (optimistic lock, learned только через pending); ошибки RLS (FORCE RLS, единое middleware, матрица изоляции в CI); недоступность OpenRouter из РФ (fallback-провайдер, egress-прокси, деградация до «передал владельцу»).
