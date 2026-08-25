# syntax=docker/dockerfile:1
#
# One file, three deployable targets (server, bot, migrate) built via
# `docker build --target <name> .` — the deps/build work is identical for
# all three, so three near-duplicate Dockerfiles would only be three places
# to keep that work in sync.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev deps included — this stage builds, it does not run.
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm run build:bot && npm run build:migrate

# A separate, `--omit=dev` install — `packages: 'external'` in every
# scripts/build-*.mjs means the runtime genuinely needs `node_modules`, but
# none of the dev tooling used to produce `dist/` belongs in a runtime image.
FROM node:24-alpine AS runtime-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/server ./dist/server
COPY --from=build --chown=node:node /app/dist/web ./dist/web
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]

FROM node:24-alpine AS bot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/bot ./dist/bot
# post-changelog.js reads this off disk at runtime — everything else the bot
# does comes from dist/bot or the database, but the changelog's source of
# truth is this file, not something worth duplicating into a build-time define.
COPY --from=build --chown=node:node /app/CHANGELOG.md ./CHANGELOG.md
USER node
CMD ["node", "dist/bot/main.js"]

FROM node:24-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/migrate ./dist/migrate
USER node
CMD ["node", "dist/migrate/main.js"]
