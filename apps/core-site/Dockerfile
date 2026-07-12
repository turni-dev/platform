# syntax=docker/dockerfile:1.7
#
# core-site (marketing landing) — Next.js standalone build.
# Build context is the monorepo root: this app has no local package.json and
# relies on the root workspace deps (next, react). Build from repo root:
#   docker build -f apps/core-site/Dockerfile -t turni-core-site .
# (compose.marketing.yml does this via the `core-site` service.)

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/cms/package.json apps/cms/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --progress=false

FROM dependencies AS build
COPY nx.json tsconfig.base.json ./
COPY apps/core-site ./apps/core-site
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/core-site
RUN npx next build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Next standalone output (traced from the monorepo root) already bundles the
# minimal node_modules and the root package.json.
COPY --from=build --chown=node:node /app/apps/core-site/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/core-site/.next/static ./apps/core-site/.next/static

USER node
EXPOSE 3002
CMD ["node", "apps/core-site/server.js"]
