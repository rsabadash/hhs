# HHS — materials for jewelry

Ukrainian catalog and inventory application for one business. Next.js frontend, NestJS API, PostgreSQL with Prisma, UAH prices. The deployed M1 foundation has passed a complete release. M2 adds admin authentication and searchable reference management; see the [admin guide](docs/admin-reference.md). Product management, images, supplies, inventory counts, and orders remain in the [implementation plan](docs/implementation-plan.md).

## Local setup

Requirements: Node.js 24, pnpm 10.28.2, and PostgreSQL (Docker Compose configuration included).

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. API liveness: `http://localhost:4000/health/live`. Readiness, including database/schema access: `http://localhost:4000/health/ready`. Web-to-API readiness: `http://localhost:3000/api/health`.

Without Docker, run `pnpm db:local` in another terminal. This downloads Prisma's local PostgreSQL-compatible runtime and prints a database URL. Put its **IPv4** URL (`127.0.0.1`, port `51214`, database `template1`) in both `DATABASE_URL` and `DIRECT_DATABASE_URL` in `apps/api/.env`, then generate/migrate as above. This local runtime is useful for development; CI verifies the migration against PostgreSQL 18.

Never commit `.env` files or paste real credentials into issues/chat. `API_URL` is server-only. Initial admin provisioning is available with `pnpm db:seed` after setting `ADMIN_EMAIL` and a password of at least 14 characters in the API environment. Existing accounts are left unchanged. Open `/admin/login` after provisioning. Use `pnpm db:admin-reset` for password recovery and session revocation; see the [admin guide](docs/admin-reference.md).

## Neon setup

The existing Neon project is `hhs` (`billowing-fog-37470920`), in AWS Frankfurt, running PostgreSQL 18. The workspace is linked locally to its `production` branch. `neon.ts` declares Postgres only; it does not deploy the NestJS or Next.js applications.

```sh
neon login
neon init -y --org-id org-shy-haze-35861208 --project-id billowing-fog-37470920 --branch production --services postgres --package-manager pnpm
neon config plan
neon deploy
pnpm db:generate
pnpm db:migrate
npm run build
pnpm dev
```

On this already-linked workspace, start with `neon config plan` / `neon deploy`; reinitialization is unnecessary. The CLI writes pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` into ignored `.env.local` at the repository root (or `.env` if it exists). NestJS, Prisma migrations and admin provisioning read these files automatically. Runtime queries retain the existing `pg` / Prisma adapter, suitable for the long-running NestJS server.

Environment precedence: injected process variables, then `apps/api/.env`, root `.env.local`, root `.env`. Do not create the API-local Docker example when using Neon; an existing API-local file can override the Neon target. Migrations choose `DIRECT_DATABASE_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. The Next.js app talks to the API and does not need database credentials.

Use temporary Neon branches for migration tests and fixture writes. The M2 smoke suite creates administrators and reference data, so it requires an isolated database. Do not run the complete suite against the deployed prototype or production. `neon checkout` changes the database target, so verify its branch before running migrations or starting development.

## Checks

```sh
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database integration tests require `TEST_DATABASE_URL` pointing to an **isolated migrated database**. Schema tests roll back transactions. Admin API/browser tests commit dedicated fixtures and clean them afterward. They never reset or truncate a database, but still require isolation. Migrations prefer `DIRECT_DATABASE_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`; explicitly set the direct migration URL to the test database when testing.

```sh
# Set DATABASE_URL, DIRECT_DATABASE_URL and TEST_DATABASE_URL to your test DB.
pnpm db:migrate
pnpm build
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

E2e tests start production API/web servers on ports 4000/3000, so those ports must be free. Export identical isolated `DATABASE_URL` and `TEST_DATABASE_URL` values, and `API_URL=http://127.0.0.1:4000` for Next.js. Integration tests additionally launch the compiled API on port 4101. To use an existing isolated Chrome executable, set `PLAYWRIGHT_EXECUTABLE_PATH`; CI downloads Playwright Chromium.

## Repository and deployment

Target: [rsabadash/hhs](https://github.com/rsabadash/hhs). Checks run on pull requests and pushes to `main`. The manual **Deploy prototype** workflow reruns checks and deploys only on `main` with `DEPLOY_ENABLED=true`.

Neon, Render, Netlify and GitHub deployment settings are configured. The first full prototype release passed on 2026-10-29; M2 requires a new release and initial admin provisioning. See [deployment setup](docs/deployment.md), [foundation status and limits](docs/foundation.md), and the [health API contract](docs/openapi.yaml).
