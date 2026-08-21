# Design: Obsidian → Repo Context Migration

## Problem

`AGENTS.md` names Obsidian notes under `1. Projects/Личное/ИИ сотрудник или команда/` as the project's Source of Truth. Every implementation task requires opening Obsidian to read overview, architecture, and task-board notes. This is friction and a single point of failure outside the repo.

## Goal

Move everything in that Obsidian folder that is relevant to building this product into the repo, condensed and organized, so day-to-day work never needs Obsidian. Non-code-relevant material (business/admin, decided-and-closed research, already-archived notes) goes to a clearly separated archive rather than being dropped.

## Scope

Source: Obsidian vault `obsidian_store`, folder `1. Projects/Личное/ИИ сотрудник или команда/` (94 notes).

Out of scope: other Obsidian projects (Only / ИИ застройщика, Аутсорс-студия, personal notes, Excalidraw, templates, daily notes).

## Target layout

- `docs/context/` — condensed, current project context. One file per topic, English filenames (kebab-case), Russian content preserved where the source is Russian product/business language (matches existing repo convention of English paths + Russian UI/content).
  - `overview.md` (from "Обзор проекта", "Платформа — ядро продукта", "Агентский трек — бизнес-процесс и видение")
  - `architecture/` (from "Производство/Архитектура/*" — LLM runtime, DB schema, ports & adapters, data & API design, NFR/frontend architecture, tech decisions)
  - `security-and-quality.md` (from "Производство/Безопасность и качество/*")
  - `design-ux.md` (from "Производство/Дизайн и UX/*" build-ready notes)
  - `channels-and-notifications.md` (from "Производство/Каналы и нотификации/*")
  - `process.md` (from "Производство/Процесс/*", "Готовность к кодингу — гейты и чеклисты")
  - `decisions.md` (from "Производство/Принятые решения — производство (свод)", "Решения и видение")
  - `product-scope.md` (from "Производство/Продукт — этапы и scope", "Производство — карта")
  - `marketplace-mcp.md` (from "Маркетплейс, MCP и композиционные профили")
- `docs/context/archive/` — condensed reference material, not needed for day-to-day coding:
  - `admin/` (from "Администрирование/*" — pricing, market, competitors, offer)
  - `research/` (from "Производство/Ресёрч/*" — "что берём" notes: decisions already absorbed into architecture/decisions, kept for provenance)
  - everything already under Obsidian's own "Архив/*" (early research, cancelled decisions, per-role team notes, resolved Q&A)
  - `кейс-вера-круч.md` (client case study, tangential to this product)

Each condensed file keeps a one-line pointer back to its Obsidian source path in a front-matter comment, for the rare case someone needs the original discussion history.

## Task board → openspec

"Доска MVP-1" (the Kanban-style task board) is not copied as a static file. Each card currently in an active column (`Готово к работе` / in progress) becomes an `openspec/changes/<slug>` change proposal, using the existing openspec workflow (`openspec-propose` → `openspec-apply-change` → `openspec-archive-change`). Cards already done or cancelled are summarized into `docs/context/decisions.md` instead of migrated as open changes.

## AGENTS.md update

Replace the "Source Of Truth" section: point to `docs/context/` for product/architecture context and `openspec/` for active work, instead of the Obsidian vault. Keep the guidance to "read only the relevant notes" — same principle, new location.

## Process

1. Read each of the 94 notes (via the Obsidian MCP tools), grouped by target file above.
2. Condense: strip discussion/back-and-forth, keep decisions, constraints, current state. Target is a fraction of the original length per the "лаконично" instruction.
3. Write condensed content to the `docs/context/` (or `archive/`) files.
4. Convert active board cards to openspec changes.
5. Update `AGENTS.md`.
6. Commit.

Given the volume (94 source notes), the read/condense/write work is delegated to a background agent per topic group, since raw note content doesn't need to stay in the main conversation — only the final condensed output does.

## Non-goals

- Not migrating unrelated Obsidian projects.
- Not deleting anything from Obsidian — it stays as historical backup; the repo becomes the thing actually read day-to-day.
- Not building tooling/automation for future Obsidian sync — this is a one-time migration.
