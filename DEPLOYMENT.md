# Deploy the demo

Configuration only: nothing has been deployed. The Git repository root must be the contents of `D:\kape-alon`, including the root lockfile and all three workspaces. Keep the existing Neon database; do not run the seed.

## 1. Reserve the frontend URL

Import the repository into Vercel and use a stable production domain, for example `https://kape-alon.vercel.app`. Substitute your actual assigned URLs everywhere below.

| Vercel setting                                            | Exact value                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Framework                                                 | Vite                                                                        |
| Root Directory                                            | `apps/web`                                                                  |
| Include source files outside Root Directory in Build Step | Enabled (shared workspace and root lockfile are required)                   |
| Node.js version                                           | `24.x`                                                                      |
| Install command                                           | `cd ../.. && npx --yes npm@11.19.0 ci --include=dev --ignore-scripts=false` |
| Build command                                             | `cd ../.. && npm run build -w @kape/shared && npm run build -w @kape/web`   |
| Output directory                                          | `dist` (relative to apps/web)                                               |
| Configuration                                             | `apps/web/vercel.json`                                                      |

The SPA rewrite serves index.html for deep links; existing assets are served normally. Do not add an /api proxy: this configuration uses Render directly. [Vercel Vite SPA guidance](https://vercel.com/docs/frameworks/frontend/vite), [monorepo source access](https://vercel.com/docs/monorepos/monorepo-faq).

## 2. Apply pending migrations once, before deploying the API

Use a single operator/process, from the exact release checkout. In the existing ignored `apps/api/.env`, confirm DATABASE_URL points to the intended Neon database (prefer its direct, non-pooler URL for migrations) and JWT_SECRET is present. Do not print or commit that file.

```powershell
Set-Location D:\kape-alon
npx --yes npm@11.19.0 ci --include=dev --ignore-scripts=false
npm run build -w @kape/shared
npm run db:migrate
```

The Drizzle journal skips applied migrations. Review pending SQL first and take a Neon backup/branch before future destructive schema changes. Do not run migrations concurrently. Re-run this step for each release with new migrations, then manually deploy that same commit. Build/start never seed, reset, or migrate. This avoids depending on a paid pre-deploy hook and avoids migration races during restarts. Existing data and bcrypt hashes remain unchanged.

## 3. Deploy the API

Create a Render Blueprint from the root `render.yaml`, or enter these Web Service settings:

| Render setting | Exact value                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / plan | Node / Free                                                                                                                                                      |
| Root directory | Repository root (`.`; leave blank in dashboard)                                                                                                                  |
| Node version   | `NODE_VERSION=24.20.0`                                                                                                                                           |
| Build          | `npx --yes npm@11.19.0 ci --include=dev --ignore-scripts=false && node scripts/verify-native.mjs && npm run build -w @kape/shared && npm run build -w @kape/api` |
| Start          | `npm run start -w @kape/api`                                                                                                                                     |
| Health check   | `/health`                                                                                                                                                        |
| Auto-deploy    | Off; deploy manually after migration review                                                                                                                      |
| Instances      | One                                                                                                                                                              |

Use a region near Neon. No Render database, disk, worker, or paid service is required. The existing server binds to Render's PORT on all interfaces and attaches Socket.IO to the same server. [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Node version selection](https://render.com/docs/node-version).

npm 11.19.0 is pinned in install commands. Root package.json retains the approved bcrypt@6.0.0 and esbuild allowScripts entries. Install includes development dependencies for TypeScript builds; do not upload Windows node_modules. Render installs its Linux dependencies fresh, and verify-native.mjs actually hashes/compares a password, failing the build if bcrypt cannot load. Update the allow-list deliberately if the lockfile changes.

## 4. Set environment variables

API variables go in **Render → service → Environment**, available during build/runtime. Never copy API secrets into Vercel.

| API variable      | Example / value                                                                         | Secret?                                                      |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| NODE_VERSION      | `24.20.0` (Blueprint)                                                                   | No                                                           |
| NODE_ENV          | `production`                                                                            | No                                                           |
| PORT              | Render-provided, usually `10000`; do not override                                       | No                                                           |
| DATABASE_URL      | `postgresql://USER:PASSWORD@ep-example.REGION.aws.neon.tech/neondb?sslmode=verify-full` | **Yes**                                                      |
| JWT_SECRET        | Generate a random 48-byte base64url value; Blueprint generates a value                  | **Yes**                                                      |
| WEB_ORIGIN        | `https://kape-alon.vercel.app` — exact origin, no trailing slash                        | No                                                           |
| CUSTOMER_BASE_URL | Same frontend origin; used in table QR codes                                            | No                                                           |
| DEMO_PASSWORD     | The **same** 8–72 character value used for existing seeded users                        | Treat as credential; deliberately public when DEMO_MODE=true |
| DEMO_MODE         | `true` for this sample-data demo; false disables autofill                               | No                                                           |
| ALLOW_DEMO_RESET  | `false` initially; set true only to enable destructive demo reset                       | No                                                           |
| TRUST_PROXY_HOPS  | `1` for the direct Render reverse-proxy path; verify forwarding before launch           | No                                                           |

Changing DEMO_PASSWORD does not change stored hashes: use the existing seed password. A new JWT_SECRET signs everyone out. Keep Neon TLS verification enabled. JWT_SECRET can be generated locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`; store the result only in secret settings.

Web variables go in **Vercel → project → Settings → Environment Variables → Production**, followed by a redeploy:

| Web variable | Example                                                                             | Secret?                        |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------ |
| VITE_API_URL | `https://kape-alon-api.onrender.com` (actual Render origin, no path/trailing slash) | No; embedded in browser bundle |

There is **no separate VITE_SOCKET_URL**: all Socket.IO clients use VITE_API_URL. HTTP polling uses `https://kape-alon-api.onrender.com/socket.io/`; upgrades use `wss://kape-alon-api.onrender.com/socket.io/`. Kitchen uses namespace `/kitchen`, not a different transport path. Do not put `/api`, `/socket.io`, or `wss://` in VITE_API_URL.

Use the stable production frontend URL in WEB_ORIGIN; arbitrary Vercel preview domains will fail staff Origin checks. Preview deployments need their own API/origin configuration. Redeploy Vercel after changing its build-time URL.

## 5. Cookies, CORS and live updates

The chosen approach is direct HTTPS to Render, retaining existing application behavior:

- NODE_ENV=production selects `__Host-kape_session`: HttpOnly, Secure, SameSite=None, Path=/, no Domain, eight-hour expiry. These are **code-derived settings, not additional environment variables**. Development uses SameSite=Lax and no Secure.
- Fetch sends credentials; the kitchen Socket.IO client uses withCredentials. API CORS returns the exact WEB_ORIGIN and allows credentials; staff writes and kitchen handshakes enforce that origin.
- Socket.IO starts with polling and upgrades to WebSockets; reconnect refetches state. Both transports connect directly to Render. [Render WebSocket support](https://render.com/docs/websocket).
- Browsers that block third-party cookies can still reject these cookies. This free-domain setup requires allowing cookies for the demo. For reliable access without that exception, use frontend/API subdomains of the same registrable domain, update all three URL settings, and retain direct Socket.IO. No token-in-localStorage workaround is introduced.

## 6. Finish and check

After Render supplies its actual URL, set VITE_API_URL and deploy Vercel. Confirm WEB_ORIGIN/CUSTOMER_BASE_URL match the final Vercel domain; redeploy Render if changed.

- [ ] Render build reports bcrypt hashing/comparison passed; /health returns 200 and database up.
- [ ] Refresh /t/5, /kitchen, /admin and an order tracking URL; assets load and no SPA 404.
- [ ] Sign in as kitchen/admin. In browser Network/Application, verify the Secure/HttpOnly/SameSite=None cookie, successful /me, credentialed CORS and logout.
- [ ] Place one sample order; kitchen sees it and status changes reach the receipt. Verify /socket.io polling succeeds and upgrade returns 101; temporarily block WebSockets to check polling.
- [ ] Check separate browsers receive distinct rate-limit IPs through Render's trusted proxy; do not increase TRUST_PROXY_HOPS without verifying the path.
- [ ] QR downloads encode the production frontend URL; reset remains disabled.
- [ ] Let the free API sleep, then test the existing waking-up/retry flow. Free instances spin down after inactivity; cold starts may exceed the client's 60-second request timeout. [Free service limits](https://render.com/docs/free).

Local configuration/build checks do not verify Render Linux installation, hosted routing, cookie policy, proxy forwarding, cold starts or live WebSocket upgrades. Complete this checklist after deployment.
