# Multi-stage: build with dev dependencies, ship only the compiled output and prod deps.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./dist/db/migrations
EXPOSE 3000
# Coolify (and `docker compose ps`) read this to show the container as healthy/unhealthy —
# wget is busybox-provided on node:*-alpine, so it costs nothing extra to install.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# Migrations run on every start, before the server listens. A deploy that carried a new
# migration used to need somebody to open the container's console and run this by hand, and
# every sync answered 500 until they did. The migrator skips what is already applied, so a start
# with nothing new costs one query.
#
# `&&` is the failure policy: a migration that fails keeps the server from starting at all, and
# the container restarts and retries. A server running against a schema it does not match would
# answer 500 anyway — a stopped one says so in the logs instead of in every request.
# `exec` hands PID 1 to node, so Coolify's stop signal reaches the server rather than the shell.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/index.js"]
