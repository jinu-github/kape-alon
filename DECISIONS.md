# Implementation decisions

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
