# syntax=docker/dockerfile:1.7

# Product cabinet. `BACKEND_ORIGIN` is evaluated by next.config.ts during the
# build, so Compose passes the internal backend URL as a build argument.
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --progress=false

FROM dependencies AS build
ARG BACKEND_ORIGIN=http://backend:3000
ENV BACKEND_ORIGIN=${BACKEND_ORIGIN}
COPY nx.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
COPY packages/ui ./packages/ui
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npx next build --webpack

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
