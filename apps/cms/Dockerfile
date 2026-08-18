# syntax=docker/dockerfile:1.7
#
# Strapi CMS — built as a self-contained npm project (apps/cms has its own
# package.json, so the build context is this directory, not the monorepo root).
# Debian slim base: Strapi's image pipeline (sharp/libvips) is far smoother
# there than on alpine. Node 22 is the newest LTS Strapi 5 officially supports.
#   docker build -f apps/cms/Dockerfile -t turni-cms apps/cms
# (compose.site.yml does this via the `cms` service.)

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS build
ENV NODE_ENV=development
WORKDIR /opt/app
# Со своим lock-файлом: без него npm подтягивал @strapi/admin новее ядра,
# и админка ломалась на несовпадении версий.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
# Панель собирается в том же режиме, в котором её будет отдавать сервер:
# dev-сборка под production-рантаймом ломает авторизацию в админке.
RUN NODE_ENV=production npm run build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app
COPY --from=build --chown=node:node /opt/app ./
RUN mkdir -p /opt/app/public/uploads && chown node:node /opt/app/public/uploads
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]
