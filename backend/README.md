# Arena Scout backend

The REST service ADR-0035 designs: an account per roster owner, `GET /v1/roster` to pull the
whole ladder, `POST /v1/roster/sync` to push what a device added or edited, `PUT /v1/me/viewer`
to say which player is you. The contract is written down in [`openapi.yaml`](./openapi.yaml)
before the code — read that first.

This is a **second, independent package** from the Expo app at the repo root: its own
`package.json`, its own `tsconfig.json`, targeting Node rather than React Native. Nothing here
is reached by `npm run verify` at the root, and nothing in `src/` may import from here (ADR-0035,
"Consequences").

## Local development

```sh
cd backend
npm install
cp .env.example .env           # then edit DATABASE_URL if not using the compose Postgres
docker compose up -d db        # or point DATABASE_URL at any Postgres 16 you already have
npm run db:migrate
npm run dev                    # http://localhost:3000, reloads on save
```

`GET /health` returns `{ "ok": true }` once the service is up.

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` (needs `DATABASE_URL`
reachable) to have drizzle-kit diff and write the next `src/db/migrations/NNNN_*.sql` — commit
the generated SQL, the same discipline `src/core/db/migrations/` already follows on the client.
`0000_init.sql` was hand-written to match the schema at the time this ADR landed, because there
was no reachable Postgres to generate it against in that environment; treat it as the baseline
and let `db:generate` take over from here.

## Deploying to the OVH VPS

1. On the VPS: install Docker and the Compose plugin, point a DNS `A` record at the VPS's IP,
   and clone this repo (or just `backend/`, if the mobile app's source is not meant to sit on a
   public server).
2. `cd backend`, `cp .env.example .env`, and fill in `POSTGRES_PASSWORD` (and anything else you
   want to override — see `docker-compose.yml`'s `environment:` blocks for what reads from it).
3. Edit `Caddyfile`: replace `api.example.com` with the real domain. Caddy requests and renews
   its Let's Encrypt certificate automatically on first request to that domain over port 443 —
   no separate certbot step, but ports 80 and 443 do need to be open on the VPS's firewall.
4. `docker compose up -d --build`. First run: `docker compose exec app node dist/db/migrate.js`
   to apply the committed migrations against the fresh `db` container.
5. `curl https://<your-domain>/health` should return `{"ok":true}` over a valid certificate.

A `git pull && docker compose up -d --build` on the VPS is the whole deploy for a code change;
run the migrate command above again after any pull that added a migration.

### Backups

Postgres's data directory is the `db-data` named volume. A daily
`docker compose exec -T db pg_dump -U arena arena_scout > backup-$(date +%F).sql` on a cron job,
shipped off the VPS (the owner's own storage — this document does not choose one), is the
minimum viable answer; nothing here automates it yet.

## What is deliberately not here

Per ADR-0035's "Consequences": the push direction is designed and implemented server-side, but
wiring `POST /v1/roster/sync` into the mobile app's `arenaRepository`/`useRoster` (through
TanStack Query, per ARCHITECTURE.md §7) is not — that depends on product decisions (when a push
fires, what the roster screen shows while one is in flight) the ADR names but does not make.
There is also no rate limiting, no structured logging destination, and no automated backup
script; all three are operational hardening for whoever runs this in anger, not part of the
contract.
