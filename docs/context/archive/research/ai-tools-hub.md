<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Производство/Ресёрч/Ресёрч — ИИ-инструменты (хаб).md" -->

# Ресёрч: ИИ-инструменты — что взяли (сводный хаб)

Сводная заметка по паттернам, заимствованным у ряда ИИ-продуктов, с привязкой к решениям и узким
местам. Детальные разборы Hermes/OpenClaw и NotebookLM вынесены отдельно (см. `hermes-openclaw.md`,
`notebooklm.md`).

## Сводная таблица

| Инструмент | Что сделали правильно | Взято → куда |
|---|---|---|
| Intercom Fin | AI-саппорт-агент, resolution-биллинг, эскалации | Триггеры эскалации, определение «resolution», бенчмарк resolution |
| NotebookLM | Source-grounded RAG + клик-цитаты + ingest источников | Онбординг-ingest, кликабельные цитаты, авто-FAQ |
| Perplexity | Answer engine: нумерованные цитаты, follow-up | Стиль «кратко+источник», follow-up-чипсы |
| Cursor / Claude Code | Plan→approval, read-only сабагенты, конфиг-слои | Read-only хелперы / действия через approval; сам способ разработки |
| Devin | Автономный SWE, dynamic re-planning | Урок: не переобещать автономию, узкий scope |
| ElevenLabs | Полный voice-loop, turn-taking, sub-sec латентность | Кандидат-адаптер за SpeechPort для голос-канала (MVP-3) |
| Hermes | Тиринг промпта+кеш, компрессия, провайдер-резолюция | см. `hermes-openclaw.md` |
| OpenClaw | File-память, tool-policy+sandbox; урок ClawHavoc | см. `hermes-openclaw.md` |
| n8n | 400+ интеграций, MCP server/client, self-host | см. `hermes-openclaw.md` |

## Детальные выводы (5 инструментов, не разобранных отдельно)

**Intercom Fin** — ближайший аналог (саппорт-агент). Биллинг за результат ($0.99/resolution)
подтвердил, что resolution — правильная метрика успеха (North Star). Реальный бенчмарк resolution
42–50% (при среднем 76% по 8000+ агентам) — собственный таргет ≥60% в MVP-1 признан амбициозным, но
реалистичным, не завышенным. Дефолтные триггеры эскалации (просьба человека / фрустрация /
повторяющийся цикл) взяты как канон в policy. Outcome = resolution ИЛИ procedure-handoff — взято в
определения успеха.

**Perplexity** — нумерованные inline-цитаты (клик → источник) и multi-turn follow-up усилили решение
про кликабельные цитаты в ExplainWhy и follow-up-чипсы (уже были заложены, Perplexity их валидировал).

**Cursor / Claude Code** — plan mode + approval до выполнения валидировал approval-механику «показывает
ДО того как сделал». Правило «сабагенты read-only, действия только у родителя через approval» взято как
паттерн под OWASP LLM06 (вспомогательные шаги — read-only, действия — только через policy/approval).
Слоистая модель конфига (always-on инструкции + SKILL.md on-demand + MCP-инструменты + AGENTS.md
контекст) подтвердила таксономию памяти soul/venue+skills+MCP-каталог. Отдельно зафиксировано:
собственная разработка с Cursor/Claude Code ускоряет критический путь при ограничении part-time.

**Devin** — SWE-bench resolution ~13,86% на сложных задачах; их урок «качество задачи = главный фактор
успеха, размытые тикеты проваливаются» подтвердил: узкий tool-whitelist + approval, прогрессию
стажёр→помощник→администратор (не давать автономию на сложном), принцип «не переобещать автономию» —
агент = force multiplier для владельца, не замена (откатили Devin к той же роли для senior-инженеров).

**ElevenLabs** — полный voice-loop одним провайдером (STT+LLM+TTS), custom turn-taking, латентность
~500мс+сеть — кандидат-адаптер за SpeechPort, когда дойдёт очередь до голос-канала (MVP-3). Урок:
голосовой realtime-бюджет принципиально другой, чем текстовый p95 ≤10с.

## Кросс-инструментальный синтез — принятые паттерны

1. Source-grounded + кликабельные цитаты (NotebookLM, Perplexity) → faithfulness, аллергены, доверие.
2. Plan/approval до действия + read-only хелперы (Cursor/Claude Code) → OWASP LLM06, ядро продукта.
3. Resolution как метрика успеха + дефолтные триггеры эскалации (Fin) → North Star.
4. Онбординг через ingest источников (NotebookLM) → онбординг/аллергены.
5. Не переобещать автономию; узкий scope; качество спеки = качество выхлопа (Devin) → прогрессия
   доверия, tool-whitelist.
6. Конфиг/память слоями (Cursor/Claude Code) → soul/venue/skills/MCP-таксономия.
7. Курируемый каталог, не открытый реестр (OpenClaw/ClawHavoc) → governance MCP-каталога.
8. Тиринг промпта + кеш + dual-compression + fallback по ролям (Hermes) → стоимость/латентность.
9. Voice loop с turn-taking за портом (ElevenLabs) → голос-канал, MVP-3.
10. Разработка с Claude Code/Cursor как способ разгрузки критического пути при part-time.
