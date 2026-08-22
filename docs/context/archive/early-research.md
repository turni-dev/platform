<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Ранний ресерч.md" -->

# Ранний ресерч: рынок, идеи, контекст (июнь 2026)

Ранний рыночный ресерч по нише «ИИ-сотрудников» / control plane для агентов. Hermes/OpenClaw упоминаются как пример, идея не привязана к конкретному runtime.

## Главные выводы
1. «Control plane» уже стал категорией, куда зашли гиганты (Microsoft Agent 365 GA, $15/user/мес; Google Gemini Enterprise; Kore.ai; open-source Galileo Agent Control) — конкурировать в лоб в enterprise-governance нельзя, ниша — SMB/mid-market и вертикали.
2. Рынок «ИИ-сотрудников» горячий, но с кризисом доверия: 11x (70–80% churn за 3 мес, скандал с фейковым ARR), Artisan (галлюцинации, бан LinkedIn), Klarna (откатила замену 700 агентов), NBER (~90% фирм не видят измеримого эффекта) — ставка на надёжность/аудит/recurring-пользу попадает точно в эту боль.
3. Pricing сместился: per-seat умирает (21%→15% за год), гибрид (база+usage) — стандарт (41%), outcome-based растёт (Intercom $0.99/resolution, HubSpot $0.50) — для нас: база + активные агенты + per-outcome в вертикалях.
4. Появились стандарты, на которые стоит опираться, а не изобретать свои: MCP (97M downloads/мес, под Linux Foundation), OWASP ASI Top 10 для агентов (дек 2025), agent identity (Okta for AI Agents, Entra ID у Microsoft).

## Рынок «ИИ-сотрудников» (обзор игроков)
Lindy (личный ассистент, free–$200/мес), Relevance AI (AI-команды для GTM, unicorn, жалобы на много setup), Sintra (дёшево, 40k+ юзеров SMB), 11x (AI SDR, ~$5k/мес, churn 70–80%), Artisan (AI BDR, $2–7k/мес, бан LinkedIn), Salesforce Agentforce (enterprise, 83% support-запросов без человека). Уроки: громкие провалы — от обещаний автономности без контроля качества; выживают продавцы узкого повторяемого сценария с измеримым результатом; SMB покупает self-serve и дёшево, enterprise — через governance.

## Control plane: кто уже строит
Microsoft Agent 365 (identity на агента, Purview-метки, Defender) валидирует модель «агент = first-class identity + права + аудит». Galileo Agent Control (open source) — политика пишется один раз и enforce на всех агентах, близко к Policy Gateway идее проекта. Futurum Agent Control Plane Framework — референс-модель для архитектуры. Дифференциация — не «ещё один governance», а упаковка под бизнес-результат (найм ИИ-сотрудника за 10 минут, шаблоны вертикалей, approval-инбокс, отчёт «что сделал и сколько сэкономил»).

## Технологии и паттерны
Tiny teams (swyx) — маленькие команды с агентами делают $1M+/чел выручки, маркетинг-нарратив «продавать образ жизни» подтверждён практикой. Bottleneck сместился с модели на harness engineering (компакция контекста, subagent isolation, hooks, KV-cache hit rate). Ambient agents + inbox-паттерн (Temporal для durable workflows, человек разбирает approvals) — совпадает с идеей Approval Inbox. Context engineering: память как управляемый слой (compaction, retrieval, mem0), «context rot» при росте окна. Anthropic Managed Agents и аналог OpenAI — runtime коммодитизируется, ценность уходит в control plane. LangGraph — production-стандарт с human approval steps, CrewAI — быстрый прототип, opaque в проде. Observability/evals: Arize Phoenix, LangSmith, Braintrust — важно, что оценка только финального вывода скрывает 20–40% ошибок, нужны trajectory-level evals.

## Безопасность
OWASP Top 10 for Agentic Applications (ASI01–ASI10, 2026) — использовать как чек-лист Security PoC и как язык продаж. Agent identity — новая дисциплина: агент как first-class identity с owner-человеком, scoped privileges, kill switch, step-up auth для рискованных действий; Trust Center должен говорить на этом языке.

## Монетизация
Гибрид (подписка+usage) — 41% рынка. Outcome-based в вертикалях: $0.50–2.00 за resolution/lead. SMB покупают результат процесса, а не стек («AI Integrators» вместо MSP). Возможная услуга — managed-внедрение + process maps.

## Идеи в бэклог продукта
1. Approval Inbox как главный экран продукта, а не настройки агента.
2. Еженедельный отчёт «сделал X, сэкономил Y часов» как retention-механизм и обоснование цены.
3. Политики как код поверх готового движка (Galileo) вместо своего DSL с нуля.
4. MCP как слой инструментов — каталог MCP-серверов с risk class вместо своих интеграций.
5. Trajectory evals на каждом recurring workflow — «QA для ИИ-сотрудника» как фича тарифа Team+.
6. Identity-интеграция (Okta/Entra) — enterprise-апселл.
7. Нарратив «tiny teams»: кейсы «1 человек + 5 агентов = отдел».

Источники (ссылки на статьи и видео по теме control plane, рынку AI-агентов, pricing, безопасности и observability) сохранены в оригинальной заметке Obsidian.
