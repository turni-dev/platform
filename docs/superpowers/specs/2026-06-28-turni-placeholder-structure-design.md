# Turni Placeholder Structure Design

## Goal

Replace the inherited `scoreboard-fok` template with the directory structure defined in `AGENTS.md`, without scaffolding applications or libraries yet.

## Preserved files

- `.git/`
- `AGENTS.md`
- `LICENSE`
- Generic repository dotfiles that contain no scoreboard-specific settings

## Removed template artifacts

- Existing `apps/`, `libs/`, and `tools/` contents
- Scoreboard-specific root configuration, environment, Docker, Nx, TypeScript, and README files
- Generated `.nx/` cache

## New tracked structure

Every leaf directory is represented by a `.gitkeep` file.

```text
apps/
  api/
  web/
  worker/
  landing/
  cms/
packages/
  widget/
libs/
  contracts/
  db/
  domain/
    channels/
    agent-core/
    memory/
    policy/
    approvals/
    reporting/
    tenancy/
  shared/
    fsm/
    llm/
  ui/
  infrastructure/
    llm/
      gigachat/
      yandexgpt/
      proxyapi/
      ru-embeddings/
    telegram/
    yookassa/
    s3/
    strapi/
    smtp/
    fakes/
tools/
  bootstrap/
deploy/
  compose/
  ci/
docs/
  adr/
```

The design specification remains under `docs/superpowers/specs/` and is not part of the product directory list.

## Package manager documentation

`AGENTS.md` will use regular npm commands instead of pnpm:

- `npm install`
- `npm run nx -- run-many -t serve | test | lint | typecheck`
- `npm run eval`
- `npm run db:migrate`

`docker compose up` remains unchanged.

No `package.json`, Nx project configuration, application source, Docker services, or dependency declarations will be created in this placeholder-only phase.

## Verification

- Compare tracked leaf directories with the structure listed above.
- Search the workspace for `scoreboard-fok`, scoreboard application names, and the old npm scope.
- Confirm `AGENTS.md` contains no pnpm commands.
- Inspect the final Git diff before committing.
