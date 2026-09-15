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

## Deploying with Coolify

This is written for Coolify because that is what actually runs every application on the owner's
OVH VPS (ADR-0035, "Addendum"). `docker-compose.yml` has no reverse proxy in it on purpose —
Coolify runs one Traefik instance for the whole server and attaches to `app` itself; adding a
second proxy here would fight it for ports 80/443 rather than help it. If you ever need to run
this stack on a bare VPS with no Coolify, you would need to put a reverse proxy back (Caddy is a
one-file, low-effort choice); that setup is not maintained here because it is not how this service
is actually deployed.

### First-time setup

1. **Connect the repository.** In Coolify: **Sources** → add `xyrerris/nc-arena` — via the GitHub
   App integration if you can, since that is what lets Coolify register the push webhook for you
   automatically rather than you pasting one into GitHub by hand.
2. **New Resource → Docker Compose.** Point it at the repository and the branch you want deployed
   (e.g. `main`, or whatever branch you push backend changes to). Set the **Base Directory** to
   `backend` — the repo root is the Expo app, not this service, and Coolify needs to be told where
   `docker-compose.yml` actually lives so it doesn't look in the root instead.
3. **Environment Variables** (the resource's own tab, not a committed `.env` — that file is a
   local-dev convenience only, see above):
   - `POSTGRES_PASSWORD` — required, `docker-compose.yml` refuses to start `db` without it.
   - `POSTGRES_USER` / `POSTGRES_DB` — optional, default to `arena` / `arena_scout`.
   - A domain for `app`. Either leave `SERVICE_FQDN_APP` unset here and assign the domain from
     the **Domains** field on the `app` service in Coolify's UI once the stack exists, or set
     `SERVICE_FQDN_APP` to your domain directly in this tab — both end at Coolify wiring Traefik
     and requesting the Let's Encrypt certificate for `app`'s exposed port 3000; which one is
     available depends on the Coolify version you're running, so use whichever your UI offers.
4. **Turn on Automatic Deployment** for the tracked branch (a toggle on the resource, usually
   under its Git/webhook settings). From here, a `git push` to that branch is the whole deploy:
   Coolify's webhook fires, it rebuilds `app`'s image from this `Dockerfile` and restarts the
   stack — no SSH, no manual `docker compose` command.
5. **Deploy once by hand** the first time (a "Deploy" button in Coolify), then apply the committed
   migrations against the fresh `db`: open a console/terminal on the running `app` container from
   Coolify's UI and run `node dist/db/migrate.js`. Coolify's exact label for this varies by
   version — look for "Execute Command", "Terminal" or a console icon on the `app` service.
6. **Verify:** `curl https://<your-domain>/health` should return `{"ok":true}`. The `HEALTHCHECK`
   baked into the image (`Dockerfile`) is also what Coolify reads to show `app` as healthy rather
   than just "running".

### Every deploy after that

`git push` to the tracked branch → Coolify rebuilds and redeploys automatically. Run the migrate
command from step 5 again only after a push that added a new file under `src/db/migrations/` — a
redeploy with no new migration is a no-op for `db:migrate` (`drizzle-orm`'s migrator skips what is
already applied), so running it on every deploy is harmless if you'd rather not track which pushes
need it.

### Backups

Postgres's data directory is the `db-data` named volume, which Coolify preserves across redeploys
of this stack (it isn't recreated unless you delete the resource). Check whether your Coolify
version's scheduled-backup feature covers a plain compose service's database, not just its own
"Database" resource type — if not, the same daily-cron answer as any self-managed Postgres applies:
`docker compose exec -T db pg_dump -U arena arena_scout > backup-$(date +%F).sql`, run from
wherever you can reach the VPS's Docker socket (Coolify's own scheduled-task feature, if your
version has one, or a plain VPS cron job), shipped off the VPS. Nothing here automates it yet.

## What is deliberately not here

Per ADR-0035's "Consequences": the push direction is designed and implemented server-side, but
wiring `POST /v1/roster/sync` into the mobile app's `arenaRepository`/`useRoster` (through
TanStack Query, per ARCHITECTURE.md §7) is not — that depends on product decisions (when a push
fires, what the roster screen shows while one is in flight) the ADR names but does not make.
There is also no rate limiting, no structured logging destination, and no automated backup
script; all three are operational hardening for whoever runs this in anger, not part of the
contract.
