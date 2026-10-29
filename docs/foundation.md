# M1 — technical foundation

Started 2026-10-28 after the user waived further UX revision. M1 is complete: hosted checks and deployment passed on 2026-10-29. The earlier local-verification notes below are historical.

## Implemented locally

- pnpm monorepo with Node 24, Next.js and NestJS; Ukrainian placeholder storefront and recovery screen.
- PostgreSQL/Prisma schema and initial migration for shared products, SKU variants, typed attributes/values, units, categories, tags, images, warehouses, suppliers, multi-line supplies, orders, inventory counts, balances and movement history.
- Exact decimal quantity/price columns; normalized SKU uniqueness; nonnegative balances; valid movement source/sign; one receipt per supply line; one cancellation per order line; document/line warehouse consistency; variant/image ownership constraints.
- Separate liveness and readiness endpoints, web-to-API readiness proxy, safe runtime configuration, and an OpenAPI health contract. No business endpoints are exposed yet.
- Unit tests for credential hashing, configuration and safe health responses; transactional database constraint tests; desktop/mobile Playwright smoke coverage.
- GitHub checks workflow, opt-in deployment workflow, Render and Netlify configuration, and setup documentation.
- Original incomplete drafts preserved locally in `.local/early-drafts` (ignored). They are not part of the supported implementation.

## Verification

Verified on 2026-10-28:

- Frozen lockfile consistency, formatting, ESLint and TypeScript checks passed.
- API and frontend production builds passed.
- 7 unit tests, 9 database integration tests and 6 desktop/mobile Playwright smoke tests passed.
- The initial migration applied successfully to an empty local database.
- `pnpm dev` started both apps; API and web readiness returned `200` with `status: ok`.
- Deployment scripts passed JavaScript syntax checks. Provider behavior is not yet verified.

The local database uses Prisma dev (PGlite / PostgreSQL 17.5 WASM); it is not a substitute for the PostgreSQL 18 service configured in GitHub Actions. Browser checks used installed Chrome in isolated Playwright contexts; CI uses Playwright Chromium. At that point, GitHub Actions and provider deployments had not run. Temporary app/database test processes were stopped after verification.

## Neon verification — 2026-10-29

Neon CLI 8.13.2 is authenticated. Project `hhs` (`billowing-fog-37470920`) was verified in `aws-eu-central-1` on PostgreSQL 18. The linked branch is `production` (`br-wild-union-bae6got7`). `neon deploy` confirmed that the existing branch matches the Postgres-only policy and pulled connection variables into ignored root `.env.local`.

The backend, migration CLI and seed command now load that environment file. Runtime uses the pooled URL with the existing Prisma `pg` adapter; migrations use the direct URL. No additional Neon services were enabled.

Verified results:

- `npm run build`: API and web builds completed successfully.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`: passed.
- `pnpm test`: 7 tests passed.
- Initial migration applied on a temporary branch of production; `pnpm test:integration`: 9 tests passed against Neon PostgreSQL 18.
- Prisma pooled-connection probe: write, read-back and rollback passed on that temporary branch.
- Initial migration then applied to production; Prisma reported `Database schema is up to date!`.
- `pnpm test:e2e`: 6 desktop/mobile tests passed using local production app builds and the Neon production database. The suite checked the Ukrainian page, missing-page recovery, and frontend → API → migrated database readiness. These smoke checks were read-only.

The first automated browser login timed out; manual `neon login` succeeded. One database test timed out during an interrupted run; connection/query timeouts and guaranteed connection cleanup were added, then all 9 tests passed. The `pg` dependency emitted a warning about a future major-version change in SSL URL semantics; current TLS verification succeeded without disabling certificate checks.

Credentials and `.neon` are ignored by Git. The temporary test branch and its local credential file were deleted after verification. Playwright stopped its local application servers. Application hosting and hosted CI/deployment were subsequently verified as described below. This setup does not claim the catalog/order business features are implemented.

## Deliberate boundaries

The schema establishes relationships and structural constraints. It does not implement business transactions. M4 must atomically update balances, increment revisions and append movements when receiving supplies or posting counts; M6 must prevent overselling and handle order/cancellation retries. Direct database writes can still make ledger totals disagree with balances, so application writes must go through the transaction services.

M2 will enforce category ancestry, attribute kind/value rules and whole-number units. M3 will enforce variant combinations, inherited attributes, tag cleanup, publication completeness and media lifecycle. M4/M6 will enforce document immutability, accurate snapshot units/prices, quantities matching movements, stock count freshness and permitted status transitions. These guarantees are not claimed by the migration alone.

Money uses UAH only. Quantity conversion is deferred. `Unit` is the SKU's inventory/selling unit; attribute `measurementSymbol` describes dimensional measurements such as mm and cm. Supply/order line unit symbols and order SKU/name/prices preserve historical display data. The services must prevent changing a stocked SKU's unit.

## Hosted release — 2026-10-29

[Deploy prototype run 40853149068](https://github.com/rsabadash/hhs/actions/runs/40853149068) passed its checks, migrations, exact-commit Render deployment, Netlify deployment and health checks.

- API: https://hhs-api.onrender.com
- Web: https://sage-daffodil-75ca07.netlify.app
- GitHub environment: `prototype`; release gate: repository variable `DEPLOY_ENABLED=true`.
- Render automatic deploys are off. Netlify Git builds are stopped; CLI deployment remains available.

M1 deployment is complete. Cloudinary belongs to M3 and is not required for M2. The CRM is not feature-complete. M2 implementation and verification are described in [admin and reference data](admin-reference.md).
