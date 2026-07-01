# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --progress=false

FROM dependencies AS build
COPY nx.json tsconfig.base.json vitest.config.ts eslint.config.mjs ./
COPY types ./types
COPY apps/backend ./apps/backend
COPY packages/contracts ./packages/contracts
RUN npm run nx -- run-many -t build --projects=backend,contracts

FROM node:${NODE_VERSION} AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspaces=false --ignore-scripts --no-audit --progress=false

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=3000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/apps/backend/apps/backend/src ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const port=process.env.HTTP_PORT??'3000';fetch('http://127.0.0.1:'+port+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/entrypoints/http/main.js"]
