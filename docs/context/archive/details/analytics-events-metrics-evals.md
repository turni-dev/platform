<!-- source: Obsidian "1. Projects/Личное/ИИ сотрудник или команда/Архив/Детали/Аналитика — события, метрики, evals.md" -->

# Аналитика: tracking plan, метрики, evals, алерты

Рабочий документ Data Analyst (12.06.2026). Стек: Postgres (events jsonb) + Metabase.

**Tracking plan:** ~22 события с первого дня — онбординг (started/step_completed/completed), работа с базой знаний, жизненный цикл диалога (created/message_in/out/resolved), llm_call (модель, токены, стоимость, latency, версия промпта), rag_retrieved, risk_assessed, agent_no_answer, approval (created/viewed/decided), guest_feedback, report_sent/opened, подписка/биллинг, error_occurred.

**North Star metric:** авторазрешённые диалоги в неделю на активного клиента. Целевые метрики: активация ≥70% за 24ч, TTV ≤48ч до первого auto-resolved, resolution ≥60%, доля правок <30%, p95 latency ≤10с, W4-retention ≥80%, cost/resolution ≤3₽, LLM-COGS ≤10% MRR. «Сэкономлено часов» считается честно: только auto-resolved и approved-без-правок диалоги, baseline замеряется у клиента индивидуально; методика публикуется клиенту.

**Evals:** датасет диалогов (реальные + правки владельцев как бесплатная разметка + синтетика для редких рисков). Ключевые метрики качества: risk recall (FN ≤2%, самое критичное — пропущенный риск), risk precision ≥80%, faithfulness ≥95% (LLM-judge против чанков KB), корректное «не знаю» ≥90%, качество vs golden ≥4.2/5. Регрессионный прогон в CI при смене промпта/модели с блокирующим гейтом на FN-rate. Размер датасета растёт с 50 до 500 по мере роста клиентской базы.

**Дашборды:** founder (MRR/churn, resolution, cost/resolution, latency, воронка), клиентский (обработано/решено/сэкономлено времени/риски), качество ИИ (FN/FP, faithfulness, edit rate, cost по моделям).

**Алерты (cron + SQL → Telegram):** аномальный cost/диалог у tenant, latency >10с, rejected rate >20%/день, молчание агента, непросмотренный approval >2ч, дневной COGS >150% бюджета, и отдельный ночной ретро-джоб на пропуск риска (пере-классификация вчерашних safe с низким confidence и всех edited/rejected).
