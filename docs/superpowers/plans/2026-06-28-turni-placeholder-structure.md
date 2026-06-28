# Turni Placeholder Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the inherited scoreboard template and commit the approved placeholder-only Turni DDD monorepo structure.

**Architecture:** Keep the modular monolith under `apps/backend`, with HTTP and worker composition roots, context-owned DDD layers, and backend-only platform adapters. Keep only stable cross-application boundaries and reusable code under `packages`; keep operational assets under `ops`.

**Tech Stack:** Git-tracked directory placeholders, npm documentation, PowerShell verification, Git

---

### Task 1: Remove the inherited template

**Files:**
- Delete: `.nx/`, `.env.example`, `apps/`, `docker-compose.yml`, `libs/`, `nx.json`, `package.json`, `README.md`, `tools/`, `tsconfig.base.json`

- [ ] **Step 1: Run the structural red check**

```powershell
$required = @(
  'apps/backend/src/entrypoints/http/.gitkeep',
  'apps/backend/src/modules/policy/domain/.gitkeep',
  'apps/backend/src/platform/database/.gitkeep',
  'packages/contracts/.gitkeep',
  'ops/compose/.gitkeep'
)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing.Count -eq 0) { throw 'Expected the new structure to be absent' }
$missing
```

Expected: all five paths are reported missing.

- [ ] **Step 2: Prove recursive deletion targets are inside the repository**

```powershell
$root = (Resolve-Path '.').Path
$targets = @('.nx', 'apps', 'libs', 'tools')
$resolved = $targets | ForEach-Object { [System.IO.Path]::GetFullPath((Join-Path $root $_)) }
$outside = $resolved | Where-Object { -not $_.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar) }
if ($outside) { throw "Unsafe deletion target: $outside" }
$resolved
```

Expected: four absolute paths under `C:\Users\rudin\pet\platform`.

- [ ] **Step 3: Delete the verified template directories and root files**

```powershell
Remove-Item -Recurse -Force -LiteralPath '.nx', 'apps', 'libs', 'tools'
Remove-Item -Force -LiteralPath '.env.example', 'docker-compose.yml', 'nx.json', 'package.json', 'README.md', 'tsconfig.base.json'
```

Expected: every listed path is removed.

- [ ] **Step 4: Verify removal**

```powershell
$removed = @('.nx', '.env.example', 'apps', 'docker-compose.yml', 'libs', 'nx.json', 'package.json', 'README.md', 'tools', 'tsconfig.base.json')
$remaining = $removed | Where-Object { Test-Path -LiteralPath $_ }
if ($remaining) { throw "Template artifacts remain: $remaining" }
```

Expected: exit code 0 with no output.

### Task 2: Align instructions and create placeholders

**Files:**
- Modify: `AGENTS.md`
- Create: 51 empty `.gitkeep` files under `apps/`, `packages/`, `tools/`, `ops/`, and `docs/adr/`, exactly as listed by the approved design

- [ ] **Step 1: Update `AGENTS.md`**

Replace the old structure with `apps/backend/src/entrypoints/{http,worker}`, the seven context modules with `domain/application/infrastructure`, backend `platform`, reusable `packages`, `tools/bootstrap`, `ops`, and `docs/adr`. Replace all pnpm commands with npm equivalents, both `libs/ui` references with `packages/ui`, and the CODEOWNERS reference from `libs/contracts` to `packages/contracts`.

- [ ] **Step 2: Create every leaf directory with an empty `.gitkeep`**

Use this exact path generator as the source of truth:

```powershell
$contexts = @('channels', 'agent-core', 'memory', 'policy', 'approvals', 'reporting', 'tenancy')
$layers = @('domain', 'application', 'infrastructure')
$paths = @(
  'apps/backend/src/entrypoints/http',
  'apps/backend/src/entrypoints/worker',
  'apps/backend/src/platform/database',
  'apps/backend/src/platform/queue',
  'apps/backend/src/platform/tenant-context',
  'apps/backend/src/platform/observability',
  'apps/backend/src/platform/fakes',
  'apps/backend/src/platform/integrations/llm/gigachat',
  'apps/backend/src/platform/integrations/llm/yandexgpt',
  'apps/backend/src/platform/integrations/llm/proxyapi',
  'apps/backend/src/platform/integrations/llm/ru-embeddings',
  'apps/backend/src/platform/integrations/telegram',
  'apps/backend/src/platform/integrations/yookassa',
  'apps/backend/src/platform/integrations/s3',
  'apps/backend/src/platform/integrations/strapi',
  'apps/backend/src/platform/integrations/smtp',
  'apps/web', 'apps/landing', 'apps/cms',
  'packages/contracts', 'packages/ui', 'packages/widget', 'packages/fsm', 'packages/llm',
  'tools/bootstrap',
  'ops/compose', 'ops/containers', 'ops/observability', 'ops/sops',
  'docs/adr'
)
foreach ($context in $contexts) {
  foreach ($layer in $layers) {
    $paths += "apps/backend/src/modules/$context/$layer"
  }
}
```

Create one empty `.gitkeep` under each generated path. Do not create package, Nx, source, Docker, or dependency files.

- [ ] **Step 3: Run the structural green check**

Run the generator from Step 2, followed by:

```powershell
$missing = $paths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $_ '.gitkeep') -PathType Leaf) }
if ($missing) { throw "Missing placeholders: $missing" }
if ($paths.Count -ne 51) { throw "Unexpected placeholder count: $($paths.Count)" }
```

Expected: exit code 0 with no output.

### Task 3: Verify and commit

**Files:**
- Verify: all workspace files
- Commit: the approved Turni metadata, documentation, and placeholders

- [ ] **Step 1: Search for obsolete project content**

```powershell
$hits = rg -n -i 'scoreboard-fok|@scoreboard-fok|mcu-firmware|timer-service|apps/client|apps/server|libs/ui|libs/domain|libs/infrastructure|pnpm' -g '!.git/**' -g '!docs/superpowers/**' .
if ($LASTEXITCODE -eq 0) { throw "Obsolete content remains:`n$hits" }
if ($LASTEXITCODE -ne 1) { throw "rg failed with exit code $LASTEXITCODE" }
```

Expected: exit code 0 from the wrapper and no matches.

- [ ] **Step 2: Inspect and stage the complete change**

```powershell
git diff --check
git status --short
git diff -- AGENTS.md
git ls-files --others --exclude-standard
git add --all
git diff --cached --check
git diff --cached --name-status
```

Expected: no whitespace errors and no scoreboard application files staged as additions.

- [ ] **Step 3: Commit the scaffold**

```powershell
git commit -m "chore: initialize Turni monorepo structure"
```

Expected: the commit succeeds.

- [ ] **Step 4: Verify committed state**

```powershell
git status --short
git show --stat --oneline --summary HEAD
```

Expected: empty status and a commit headed `chore: initialize Turni monorepo structure`.
