# Implementation decisions

## Phase 2

- Continued the existing implementation without rebuilding Phase 1. Both migrations and the JSON seed were verified against the user-configured Neon database before finishing the customer flow.
- Added availability flags for option groups and choices via migration 0001. An unavailable required group blocks purchase; an unavailable optional group may be omitted. Selected unavailable choices are rejected by server pricing.
- The browser submits only table number, item IDs, choice IDs, quantities and notes. POST /orders rejects unknown fields such as client prices. The service reads the database catalog while holding shared catalog/table locks, then inserts the order and snapshots atomically. This simple lock strategy suits the small demo catalog.
- All public route parameters, queries and order bodies are validated. Rate limiting is an in-memory ten-attempts-per-IP-per-minute fixed window. TRUST_PROXY_HOPS is explicit and defaults to zero; deployment must verify the actual proxy topology.
- The order UUID acts as a shareable receipt link for this signup-free demo. Newly created orders have database-generated random UUIDs. Anyone with the link can read its receipt; no personal customer fields are collected.
- Only the internal status service can change status in Phase 2. It locks the order row, validates the transition and emits after commit. There is no unauthenticated status mutation route. Kitchen authorization is deferred to Phase 3.
- Socket.IO starts with HTTP long-polling and upgrades to WebSockets. Clients rejoin their order room and refetch on reconnect. A ten-second HTTP refresh recovers missed events or updates from a separate process; terminal orders stop periodic refresh.
- Carts persist per table in localStorage and gracefully fall back to memory when storage is unavailable. Displayed totals are estimates until server confirmation. POST requests are never automatically retried; an uncertain network response tells the customer to check with staff before retrying, since this phase does not add idempotency keys.
- Native modal dialogs provide focus trapping, Escape dismissal and focus restoration. Loading, empty, invalid-link, server-error, reconnect and cancelled-order states are included. The 375px browser test exposed a native dialog max-width constraint; explicit mobile sizing fixes the gap.
- The Socket.IO client and Playwright runner implement the technologies explicitly requested in the project brief. No new UI, rate-limit or sanitization dependency was introduced.
- Vitest database tests use the configured disposable seeded database, restore temporary option-availability changes and remove test-created orders. Playwright runs a test-owned API and invokes the internal status service directly to verify actual live events without adding a test HTTP endpoint.
- Category-level stock images remain replaceable placeholders from the original JSON. Image/content refinement, the full landing page, kitchen/admin and deployment are outside this phase.

## Phase 1

- The workspace already contains a portfolio. The cafe app lives in its own `kape-alon/` directory and Git repository to preserve that work.
- Node 24 LTS runs TypeScript development scripts using native type stripping, avoiding another runtime dependency. Production uses compiled JavaScript. Use explicit `.ts` imports in API code; TypeScript rewrites them during builds.
- Supporting packages approved by the user: `pg`, `drizzle-kit`, `typescript-eslint`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and Node/React/React DOM/Express/pg/bcrypt type packages.
- Currency is Philippine pesos, stored as integer centavos. Cafe identity, locale, currency, reporting timezone, demo table, and kitchen warning threshold live in `packages/shared/src/config.ts`.
- Option groups use `item_options`; their choices use a separate `option_choices` table. Choices add a nonnegative amount to the base item price. Required groups enforce a minimum selection count.
- Orders snapshot table number; order items snapshot name, selected choices and unit price including add-ons. Menu deletion retains historical line items via a nullable foreign key.
- Order transitions are forward only; nonterminal orders may be cancelled. Served and cancelled orders are terminal. Enforcement in authenticated update endpoints comes in Phase 3.
- Seed records and images live exclusively in `apps/api/seed/seed-data.json`. IDs are deterministic UUIDs. Sample order times are relative to the moment of seeding, so the dashboard can show recent activity. Prices are computed from the seed catalog using the same service intended for database-sourced order pricing.
- The dataset contains 25 items, five categories, ten tables, two demo users and nine sample orders. One pastry is unavailable. Category-level Unsplash photographs are placeholders, not exact depictions of individual dishes.
- Demo passwords come from `DEMO_PASSWORD`, not the content JSON, and are hashed with bcrypt cost 12. Demo emails are in the JSON. Authentication, JWT cookies and role enforcement are Phase 3 work.
- Seeding requires `ALLOW_DEMO_RESET=true`, validates data before connecting for writes, and wipes/reloads all application tables in one transaction. No `CASCADE` is used, so unrelated dependent tables cause a safe failure. Migration bookkeeping is retained.
- `/health` checks PostgreSQL and responds 200 or 503. Other errors use `{ error: { code, message, details? } }`. Browser CORS accepts one exact origin. Future write endpoints also need origin/CSRF protection; CORS alone is not authorization.
- The frontend is an explicitly labeled foundation preview, not the Phase 4 landing page. It wires React Router, TanStack Query and Tailwind, with a first-request wake-up message.
- No JWT, QR, rate-limit, or additional runtime libraries are added ahead of the relevant phase. Request approval for additional packages then. Socket.IO is installed; rooms, events and client integration begin in Phase 2.
- Order creation and customer-flow E2E tests depend on Phase 2 endpoints. Phase 1 tests cover shared contracts, pricing, seed validity and HTTP health/error behavior.
