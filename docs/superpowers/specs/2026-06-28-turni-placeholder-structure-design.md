# Turni Placeholder Structure Design

## Goal

Replace the inherited `scoreboard-fok` template with a placeholder-only Turni monorepo structure. Keep all backend business and technical implementation inside one DDD-oriented backend application, and expose only genuinely reusable cross-system code as workspace packages.

## Preserved files

- `.git/`
- `AGENTS.md`
- `LICENSE`
- Generic repository dotfiles that contain no scoreboard-specific settings

## Removed template artifacts

- Existing `apps/`, `libs/`, and `tools/` contents
- Scoreboard-specific root configuration, environment, Docker, Nx, TypeScript, and README files
- Generated `.nx/` cache
- The empty `libs/` concept; Turni will use `packages/` only for cross-system reuse

## Architectural shape

Turni starts as one modular backend application with two process entrypoints:

- HTTP entrypoint for the NestJS API
- Worker entrypoint for BullMQ consumers

Business capabilities are bounded contexts under `apps/backend/src/modules`. Each context owns its domain, application logic, and infrastructure adapters. Shared technical runtime mechanisms live under `apps/backend/src/platform`, not beside the business modules in a repository-wide `libs` tree.

Code is moved to `packages/` only when it is intentionally reused across applications or forms a stable external boundary.

## New tracked structure

Every leaf directory is represented by a `.gitkeep` file during this placeholder-only phase. Each business module has the same three DDD layers; all layers are shown explicitly below.

```text
apps/
  backend/
    src/
      entrypoints/
        http/
        worker/
      modules/
        channels/
          domain/
          application/
          infrastructure/
        agent-core/
          domain/
          application/
          infrastructure/
        memory/
          domain/
          application/
          infrastructure/
        policy/
          domain/
          application/
          infrastructure/
        approvals/
          domain/
          application/
          infrastructure/
        reporting/
          domain/
          application/
          infrastructure/
        tenancy/
          domain/
          application/
          infrastructure/
      platform/
        database/
        queue/
        tenant-context/
        observability/
        integrations/
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
  web/
  landing/
  cms/
packages/
  contracts/
  ui/
  widget/
  fsm/
  llm/
tools/
  bootstrap/
ops/
  compose/
  containers/
  observability/
  sops/
docs/
  adr/
```

The design specification remains under `docs/superpowers/specs/` and is not part of the product directory list.

## Dependency rules

- A module's `domain` layer does not depend on NestJS, Drizzle, databases, queues, or vendor SDKs.
- A module's `application` layer depends on its domain and stable contracts.
- A module's `infrastructure` layer implements the module's ports and owns its Drizzle schemas, migrations, repositories, and module-specific adapters.
- `apps/backend/src/entrypoints` contains composition roots only. HTTP and worker processes assemble the same backend modules without duplicating business logic.
- Modules communicate through application ports, stable contracts, and events. A module never imports another module's infrastructure layer.
- `platform/database` owns connection management, transaction primitives, and `withTenant`; it does not own business schemas.
- `platform/integrations` contains vendor-specific adapters and SDK usage.
- `packages/contracts` contains public Zod DTOs, boundary schemas, and integration events.
- `packages/llm` contains `LlmPort`, provider-neutral DTOs, and validation only. Provider implementations remain in backend integrations.
- `packages/fsm` contains reusable XState primitives.
- `packages/ui` is the only location that may use Tailwind, matching `AGENTS.md`.
- `ops` contains repository operational assets and is not imported by TypeScript code. CI workflows will use the standard `.github/workflows` location when introduced.

## Extraction path

When a bounded context becomes a microservice, its complete `modules/<context>` directory can move into a new application. Its public boundary already lives in `packages/contracts`; backend platform dependencies are replaced by service-local adapters or extracted only after proven cross-service reuse.

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
- Confirm every business module contains `domain`, `application`, and `infrastructure` placeholders.
- Search the workspace for `scoreboard-fok`, scoreboard application names, and the old npm scope.
- Confirm the removed `libs/` directory does not remain.
- Confirm `AGENTS.md` describes the approved structure and contains no pnpm commands.
- Inspect the final Git diff before committing.
