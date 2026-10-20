# Kape Alon

A mobile-first QR-menu cafe ordering demo. **Phase 1 only:** workspace tooling, PostgreSQL schema and migration, validated JSON seeds, shared contracts, API health and a frontend foundation preview.

Ordering, live tracking, kitchen/admin screens and authentication are not implemented yet. Nothing has been deployed.

<!-- Screenshots: add 375px customer menu, live kitchen board and admin dashboard in Phase 4. -->

## Architecture

```text
apps/web           React + TypeScript + Vite, Router, TanStack Query, Tailwind
apps/api           Express + TypeScript, PostgreSQL/Drizzle, Socket.IO (Phase 2)
  src/services     Business logic independent of HTTP handlers
  src/db           Schema and pooled database connection
  drizzle          Versioned SQL migrations and Drizzle metadata
  seed             All sample content and its validation schema
packages/shared    Zod contracts, cafe config and order transition rules
```

The browser will send item IDs, option IDs, quantities and notes. The API will load the catalog from PostgreSQL, validate availability and option selections, calculate integer-cent prices, and save immutable item snapshots. Live events will be emitted after successful transactions in Phase 2.

Rename the cafe in **`packages/shared/src/config.ts`**. `kape-*` npm package identifiers are internal and need not change.

## Local setup

Requirements: Node.js 24+, npm, Docker with Compose.

Run these commands from this directory:

```sh
npm ci
```

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env`. PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Start Postgres, build the shared package, apply migrations, then load sample data:

```sh
docker compose up -d --wait
npm run build -w @kape/shared
npm run db:migrate
npm run seed
```

`npm run seed` **wipes all cafe application data** in the configured database. It requires `ALLOW_DEMO_RESET=true` and a `DEMO_PASSWORD`; the example values are for this disposable demo only. Run again to reset. Never point this command at a real customer database.

Open two terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Visit [the local preview](http://localhost:5173) and [API readiness](http://localhost:3001/health). If Postgres is unavailable, readiness returns HTTP 503 without exposing connection details. The frontend shows connection progress and a retry state. Node automatically loads each application's `.env`.

Seeded users are `admin@example.com` and `kitchen@example.com`, both using `DEMO_PASSWORD`. Login will be available in Phase 3.

## Checks and schema changes

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run format:check
```

Tests use Vitest and a real ephemeral HTTP listener with an injected database probe. They validate health responses, CORS, errors, notes, status rules, prices, option selection and seed references. They do **not** replace a real PostgreSQL migration/seed smoke test.

After changing `apps/api/src/db/schema.ts`:

```sh
npm run build -w @kape/shared
npm run db:generate
npm run db:migrate
```

Review and commit generated SQL and metadata. Use migrations rather than schema push. `docker compose down` preserves the database volume.

## Deployment plan (Phase 4)

These are intended settings, not a claim that deployment has been tested.

- **Postgres:** create a Neon or Supabase database; use its PostgreSQL connection URL and TLS settings as `DATABASE_URL`. Never disable certificate verification. Use a direct connection for migrations when required by the provider; the API's `pg` pool is capped at five connections.
- **API / Render:** repository root is this project directory. Build with `npm ci && npm run build -w @kape/shared && npm run build -w @kape/api`; start with `npm run start -w @kape/api`. Set `NODE_ENV=production`, `DATABASE_URL`, and `WEB_ORIGIN` to the exact HTTPS frontend origin, without a trailing slash. Render supplies `PORT`. Run migrations as a separate release operation before serving traffic.
- **Web / Vercel:** build from the monorepo root with `npm ci && npm run build -w @kape/shared && npm run build -w @kape/web`; output directory is `apps/web/dist`. Set `VITE_API_URL` to the Render HTTPS origin. SPA rewrites for `/t/*`, order tracking, `/kitchen` and `/admin` are added in Phase 4.
- **CORS / cookies:** fetch requests for future auth must use `credentials: 'include'`. Cross-site cookies need `HttpOnly; Secure; SameSite=None` and may still face browser third-party-cookie restrictions. Phase 3 must verify the deployment topology, CSRF defenses and login behavior.
- **WebSocket:** Phase 2 will attach Socket.IO to the HTTP server, restrict its CORS origin, authenticate privileged rooms, and use the same public API origin and default `/socket.io` path. Verify both polling and WebSocket upgrades through Render before release.
- **Sleeping API:** free Render instances may take time to wake. The preview already displays a friendly connecting message and supports retry; tune timeouts and reconnection behavior when implementing the customer flow.

Provider limits and deployment details must be verified against current official documentation during Phase 4. No paid service is required or configured.

## Phase checklist

- [x] Foundation source and initial migration
- [ ] Run migration and seed smoke test against local Docker Postgres
- [ ] Customer menu, cart, order creation and live tracking
- [ ] Kitchen, auth, admin, QR generator and reset
- [ ] Accessibility/mobile QA, customer Playwright test, screenshots and deployment

See `DECISIONS.md` for scope choices and approved supporting packages.

## Phase 1 verification

- Production build, strict type checks, ESLint and 13 Vitest tests pass.
- bcrypt hashing/comparison and native Node TypeScript workspace imports were smoke-tested.
- The initial Drizzle SQL migration was generated and inspected. Docker and `psql` are unavailable on the implementation machine, so real PostgreSQL migration/seed execution remains unverified.
- The local browser preview timed out; visual QA at 375px remains unverified. The customer-flow Playwright test belongs to Phase 2/4.
- `npm audit --omit=dev` reports zero vulnerabilities. Full audit reports four moderate findings in Drizzle Kit's transitive `@esbuild-kit`/esbuild development tooling. No high or critical findings remain. Do not run the suggested forced downgrade blindly; reassess migration-tool upgrades before deployment.
