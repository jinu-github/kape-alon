# Kape Alon

A mobile-first QR-menu cafe ordering demo. **Through Phase 3B:** customer ordering, live tracking, staff authentication, kitchen board, and admin menu/reporting/QR tools.

Nothing has been deployed. Historical phase notes below describe earlier checkpoints.

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

The browser sends item IDs, option IDs, quantities and notes. The API loads the catalog from PostgreSQL, validates availability and option selections, calculates integer-cent prices, and saves immutable item snapshots in a transaction. The internal status service emits Socket.IO updates only after commit.

Rename the cafe in **`packages/shared/src/config.ts`**. `kape-*` npm package identifiers are internal and need not change.

## Local setup

Requirements: Node.js 24+, npm, and PostgreSQL. Use Docker Compose locally, or configure a dedicated Neon demo database in DATABASE_URL.

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

For Neon, skip the Docker command. Keep existing configured environment files; copy the examples only for a new checkout.

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

Seeded users are `admin@example.com` and `kitchen@example.com`, both using `DEMO_PASSWORD`. Use the pre-filled demo login from the landing page.

## Checks and schema changes

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run format:check
```

The default Vitest suite requires no database. It covers HTTP health/errors, shared validation, the full status-transition matrix, integer-cent pricing, selection limits and item/option availability. Database integration tests are intentionally skipped by the default command.

For a seeded disposable database configured in apps/api/.env:

    npm run test:integration
    npm exec playwright -- install chromium
    npm run test:e2e

Integration tests exercise the real API, PostgreSQL persistence, rate limiting, Socket.IO room isolation, polling transport and reconnection. They temporarily toggle seeded option availability and restore it, then remove their own test orders. The Playwright suite uses a test-owned API on port 3001 and Vite on 5173; stop other instances before running it. It verifies the customer flow at 375px, keyboard focus, saved cart, live status events, reconnect recovery and loading/empty/error states. Screenshots are saved locally under qa/ (gitignored).

Use the default localhost ports/origins for browser tests. No production status-update endpoint is exposed for testing.

After changing `apps/api/src/db/schema.ts`:

```sh
npm run build -w @kape/shared
npm run db:generate
npm run db:migrate
```

Review and commit generated SQL and metadata. Use migrations rather than schema push. `docker compose down` preserves the database volume.

## Deployment configuration

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact Render free service and Vercel settings, Neon migrations, environment variables, cross-site cookies and post-deploy checks. Root `render.yaml` and `apps/web/vercel.json` are ready to configure; nothing has been deployed.

## Phase checklist

- [x] Foundation source and initial migration
- [ ] Run migration and seed smoke test against local Docker Postgres
- [x] Customer menu, cart, order creation and live tracking
- [x] Kitchen, auth, admin, QR generator and guarded reset
- [ ] Accessibility/mobile QA, customer Playwright test, screenshots and deployment

See `DECISIONS.md` for scope choices and approved supporting packages.

## Phase 1 verification (historical; see Phase 2 below)

- Production build, strict type checks, ESLint and 13 Vitest tests pass.
- bcrypt hashing/comparison and native Node TypeScript workspace imports were smoke-tested.
- The initial Drizzle SQL migration was generated and inspected. Docker and `psql` are unavailable on the implementation machine, so real PostgreSQL migration/seed execution remains unverified.
- The local browser preview timed out; visual QA at 375px remains unverified. The customer-flow Playwright test belongs to Phase 2/4.

## Phase 2 review

Open [table 5](http://localhost:5173/t/5) after starting the API and web app. Customize a Spanish Latte with Large and Extra espresso shot, add it to the cart, increase quantity to two, and place the order. The server-calculated total is PHP 490.00. The saved receipt opens at /orders/:id.

Available API routes:

| Route               | Behavior                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| GET /menu           | Categories, items, groups, choices and availability                                 |
| GET /tables/:number | Validates an active table                                                           |
| POST /orders        | Shared Zod validation, sanitized notes, database pricing, transactional persistence |
| GET /orders/:id     | Saved receipt and current status                                                    |

Customer tracking joins a Socket.IO room for its order UUID. The client starts with long-polling, upgrades to WebSockets when available, reconnects automatically and refetches the receipt on each reconnect. A 10-second read interval also recovers missed updates and stops for served/cancelled orders.

Status changes are implemented in the internal customer service, with row locking and allowed-transition checks. The browser tests call that same service inside their API process and verify emitted events; the authenticated kitchen controls arrive in Phase 3. A normal newly placed order stays Received until that service is called.

Order attempts are limited to ten per IP per minute in one API process. TRUST_PROXY_HOPS defaults to zero; set it only to the verified reverse-proxy hop count in deployment. Horizontal scaling would require a shared limiter and Socket.IO adapter.

### Verification and remaining limits

- Final checks: production build, strict typecheck (including tests), lint, 18 default Vitest tests and all four Playwright tests passed. The default suite skips the ten opt-in database tests; those passed separately against Neon.

- Both migrations and the seed have run successfully against the configured Neon database. Integration checks confirmed 25 menu items, five categories, ten tables, two hashed demo users and nine sample orders.
- Ten real-database integration tests passed, including room isolation, polling-only delivery, reconnect recovery, server pricing and persisted status transitions.
- The local 375px customer flow passed, including a real Socket.IO status update and forced transport reconnect. Mobile item/cart sheets and tracking screenshots were visually inspected; the sheet-width issue found during review was fixed.
- Local Docker Postgres, Safari/Firefox, physical mobile devices, deployed Vercel/Render routing and Render wake-up behavior remain unverified. The implementation is local-only.
- The pg driver reports a future SSL-mode semantics warning for the configured connection URL. Certificate verification has not been disabled; use explicit sslmode=verify-full when configuring future URLs to preserve the current verification behavior.
- `npm audit --omit=dev` reports zero vulnerabilities. Full audit reports four moderate findings in Drizzle Kit's transitive `@esbuild-kit`/esbuild development tooling. No high or critical findings remain. Do not run the suggested forced downgrade blindly; reassess migration-tool upgrades before deployment.

## Phase 3A: staff access and kitchen

Run commands from `D:\kape-alon`. Keep the API and frontend in separate terminals:

```powershell
npm run db:migrate
npm run dev:api
```

```powershell
npm run dev:web
```

In `apps/api/.env`, set a random `JWT_SECRET` (at least 32 characters), `DEMO_MODE=true`, and the same `DEMO_PASSWORD` used when seeding. See `apps/api/.env.example`. Never expose JWT_SECRET through Vite. Existing installations can update only the seed photos with `npm run seed:images -w @kape/api`; this preserves orders. Do not run the full seed just to update photos.

Open [the landing page](http://localhost:5173). **Open kitchen board** and **Open admin** lead to pre-filled demo login forms. Sign in to continue. Admin management features are intentionally deferred; the admin entry confirms role-protected access.

The kitchen board shows New, Preparing and Ready orders, options, notes, elapsed time and age warnings. Click **Start preparing → Mark ready → Mark served**. A separate customer's tracking page updates live. Served orders leave the board. New tickets receive a visible highlight. Sign out clears and revokes the session.

New API routes: `POST /login`, `POST /logout`, `GET /me`, `GET /demo-access/:role` (demo mode only), `GET /kitchen/orders`, `PATCH /kitchen/orders/:id/status`, and admin-only `GET /admin/access`. Staff writes require the configured Origin header and cookie; login returns a safe user profile, never the JWT in JSON.

Production needs HTTPS, NODE_ENV=production, exact WEB_ORIGIN and VITE_API_URL values, credentialed CORS and Socket.IO cookies. Vercel-to-Render cookies use SameSite=None; Secure. Browsers that block third-party cookies require a same-site deployment or compatible same-origin proxy. See DECISIONS.md for details; a production cross-domain deployment has not been tested.

Focused checks:

```powershell
npm run build
npm run typecheck
npm run lint
npm test
npm run test:e2e -- e2e/kitchen.spec.ts
```

The Playwright test starts its own API, needs the migrated seeded DATABASE_URL, uses ports 3001/5173, and deletes only its own order. Stop development servers before running it. Screenshots are saved locally under `qa/kitchen-tablet.png` and `qa/menu-fixes-375.png`.

### Phase 3A verification

- Build, strict typecheck, lint and 25 default Vitest tests passed. The ten existing opt-in database tests were not rerun.
- Both focused Playwright tests passed against Neon: customer-to-kitchen live status changes (including rejected skipped transitions), seeded kitchen/admin login, logout, tablet layout, and the four menu regressions. Tablet kitchen and 375px menu screenshots were inspected.
- Migration 0002 and image-only sync succeeded against Neon without resetting orders. All ten distinct stock image URLs returned HTTP 200 after replacing one broken cold-drink URL.
- Not verified: deployed Vercel/Render cross-site cookies, production proxy/WebSocket setup, Render wake-up, Safari/Firefox, physical devices, and local Docker Postgres. No Phase 3B admin tools were built.

## Phase 3B: admin tools

Sign in through **Open admin** on the landing page. All /admin API routes require the admin role.

- **Menu:** add/edit/delete categories and items, prices in cents, images, tags, availability, and option groups/choices. Expand Manage categories to organize categories. Move or remove items before deleting their category. Customer menus update live.
- **Order history:** filter by inclusive date range and status, page through results, and open receipt details.
- **Dashboard:** today's orders, served-order revenue, top five served items and hourly order counts, using the cafe timezone. The chart includes a text table.
- **Table QR codes:** choose an active table, download PNG, or print a table card. Set CUSTOMER_BASE_URL in apps/api/.env to the frontend origin in production; it defaults to WEB_ORIGIN.
- **Demo reset:** enabled only by ALLOW_DEMO_RESET=true. Type RESET DEMO DATA and confirm to wipe/reseed all cafe data and sign everyone out. Requires DEMO_PASSWORD. Limited to one attempt per five minutes per API process.

New routes: GET /admin/menu, /admin/settings, /admin/dashboard, /admin/orders and /admin/orders/:id; POST /admin/categories and /admin/items; PUT/DELETE /admin/categories/:id and /admin/items/:id; POST /admin/reset. Monetary inputs use integer cents. Writes use credentialed cookies and the exact configured Origin.

Focused checks (stop dev servers before Playwright):

```powershell
npm run test:e2e -- e2e/admin.spec.ts
$env:INTEGRATION_TESTS='1'
node --env-file=apps/api/.env node_modules/vitest/vitest.mjs run apps/api/test/admin.integration.test.ts
Remove-Item Env:INTEGRATION_TESTS
```

Reset guard tests do not wipe Neon. To review the real reset, use a disposable database and expect all menu edits, orders and sessions to be replaced. No deployment or physical QR scan/print has been verified.

### Phase 3B verification

- Production build, strict typecheck and lint passed; 31 default Vitest tests passed. The two new Neon CRUD/dashboard tests passed separately. Existing Phase 2/3A browser flows were not repeated.
- The focused admin Playwright test passed: edits to price and availability reached the open customer menu without reloading; history details, QR URL, PNG download, print layout and the disabled-reset state were checked. Tablet dashboard and print screenshots were inspected.
- Windows locked Playwright trace files during the initial attempt. The successful focused run used:

  npm run test:e2e -- e2e/admin.spec.ts --trace off --output test-results-admin

- Unverified: destructive end-to-end demo reset on a disposable database, physical QR scanning/printing, physical tablets, other browser engines and production deployment/cookies. Reset confirmation, role checks, disabled configuration and rate limiting passed unit/API tests with a fake reset callback.
- The browser test's temporary price increment was restored after a timeout; the final successful run also restored the item's original values. No full seed/reset was run against existing Neon data.
