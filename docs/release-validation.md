# M7 release validation

Validation date: 2026-10-29. Scope: the M6 application at `510a7c7` plus the uncommitted M7 changes. This report separates local release evidence from hosted launch approval. It does not claim that M7 is deployed or that the production launch gates are complete.

## Delivered checks

- Shared write transactions now set a 12-second PostgreSQL statement limit and a 30-second idle transaction limit before acquiring the advisory lock. A regression test deliberately leaves a transaction idle, verifies that it expires, and checks that another writer can proceed. Settings are transaction-local to support Neon pooling; they do not rely on startup parameters.
- The frontend now sends anti-framing, content-type, referrer and unused-device permission headers.
- Axe checks cover the storefront, product detail, admin login, reference management, order review and fulfilled order on desktop Chromium and Pixel 7 emulation. These check WCAG 2 A/AA and 2.1 A/AA rules supported by axe; they are not a complete accessibility certification.
- The scan found a logo accessible-name mismatch in `apps/web/src/app/(shop)/layout.tsx`. Removing the overriding `aria-label` lets its complete visible text supply its accessible name.
- Browser coverage checks stock visibility after receipt, order, cancellation and fulfillment. It checks that public responses omit purchase costs, warehouse IDs and customer data, and that a script-looking product description is displayed as text.
- Proxy unit tests reject unsupported/traversal paths and sanitize server errors, exceptions and upstream redirects. Existing integration tests cover unauthenticated access, CSRF, session expiry/rotation/logout, password recovery and login throttling.
- Production dependency auditing now runs in CI and fails on high or critical advisories. The audit here found zero known production dependency vulnerabilities; this is not a penetration test.
- `pnpm db:backup` and `pnpm db:restore` provide guarded PostgreSQL archive operations. See [recovery](recovery.md) for operator steps, retention and media requirements.

## Execution evidence

| Check                                           | Result                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Production build, type checks, lint, formatting | Passed                                                                                                    |
| Unit tests                                      | 40 passed                                                                                                 |
| PostgreSQL integration tests                    | 49 passed, including the abandoned-transaction regression                                                 |
| Desktop/mobile browser suite                    | 16 passed (8 desktop, 8 mobile), two workers, no retries; zero axe violations on the audited screens      |
| Production dependency audit                     | Zero known vulnerabilities                                                                                |
| Hosted read-only availability smoke             | API readiness, web readiness, public catalog API and storefront passed; deployed revision not established |
| Backup/restore drill                            | Passed against fresh PostgreSQL 18 databases on the temporary Neon branch                                 |

The successful recovery drill compared fingerprints for all backed-up rows across 26 public tables (19 restored rows, including migration history), verified all 211 constraint and 82 index definitions, confirmed empty session/throttle tables, found zero stock ledger mismatches, and queried the restored order through the application service: total **37.50 UAH**, stock remaining **7**. Backup permissions were `0600`. The drill also proved that an existing archive cannot be overwritten and a nonempty database cannot be restored over. Export, restore and data comparison took 22 seconds for this small fixture; this is not a recovery-time promise for a larger database.

The first recovery comparison overlapped browser fixture creation and was invalidated. A later comparison identified two incomplete fixtures from an interrupted browser run (balances with no movements). The final drill therefore used a fresh migrated source and empty target, with no concurrent writers. Browser fixture cleanup is now transactional. The application data on the hosted prototype was never changed.

An earlier browser run found the logo accessibility defect and a catalog navigation assertion that expired while the successful save was followed by a remote server render. The navigation assertion now allows 15 seconds. A subsequent mobile run exposed a query timeout and an idle write transaction; the server-side limits and regression test above address prolonged lock retention. The final 16-case browser run passed after that fix, including mobile inventory, orders and storefront flows.

GitHub run status could not be independently retrieved during this session because the API was rate-limited. Local checks are not a substitute for the next GitHub run. Logs are retained in ignored `.local`; temporary database credentials and archives were removed after validation. The temporary Neon branch and all its test/recovery databases were deleted, and absence was verified.

## Performance scope

The repeatable catalog benchmark inserts 1,000 products and 2,000 published variants into an isolated database, measures category browsing, text search, price filtering, attribute filtering and the final page, then removes its fixtures. Each scenario records its first query separately and p50/p95 for 20 subsequent serial calls. Products have descriptions and two SKUs with distinct numeric attribute values; this is a catalog query benchmark, not a concurrent-load or full media-delivery test. It does not represent Render wake-up or browser rendering latency.

Measured locally against Neon Frankfurt, with no concurrent test writers:

| Scenario  | Warm p50 | Warm p95 | Response size |
| --------- | -------- | -------- | ------------- |
| browse    | 953 ms   | 978 ms   | 11417 bytes   |
| search    | 908 ms   | 936 ms   | 11417 bytes   |
| price     | 950 ms   | 973 ms   | 11422 bytes   |
| attribute | 951 ms   | 969 ms   | 11417 bytes   |
| lastPage  | 955 ms   | 985 ms   | 7642 bytes    |

Each response count and page length was asserted against the fixture. These measurements include network round trips from the developer machine; they do not establish production latency or a load-capacity limit.

After building the API, inject matching `DATABASE_URL` and `TEST_DATABASE_URL` for an isolated test database and run from the repository root:

```sh
BENCHMARK_CONFIRM=isolated node apps/api/scripts/catalog-benchmark.mjs
```

Confirm the actual target is disposable. The guard cannot tell whether an operator incorrectly supplied production credentials in both variables. If interrupted, remove the disposable branch rather than keeping fixture data in a shared environment.

## Administrator handover

Use this acceptance walkthrough on the prototype with clearly named disposable fixtures before taking real orders:

1. Sign in at `/admin/login`. Verify that an anonymous browser cannot open admin pages. Password recovery is documented in [admin reference management](admin-reference.md).
2. Add a parent/child category, numeric diameter attribute and values, a piece/pair unit, warehouse and supplier. Exercise name search and filters.
3. Create a product with two distinct SKU/attribute combinations and attach shared and variant images. Search by SKU; verify another product can share a tag and removing one association retains it. See [catalog operations](catalog.md).
4. Create one supply with both SKUs. Confirm its draft does not change stock, then receive it once. Verify quantities and purchase totals in [inventory](inventory.md).
5. Publish the SKUs with UAH selling prices. In an anonymous browser, filter by category/diameter/price and open the selected variant. Verify the Instagram profile and prepared inquiry. See [storefront](storefront.md).
6. Create and review an order for one warehouse. Confirm totals and stock deduction. Cancel the first test order with a reason and verify the stock is restored. Create a second order and fulfill it; fulfillment must not deduct stock a second time. See [orders](orders.md).
7. Run a separate inventory count and enter an explicit quantity, including zero where appropriate. Explain discrepancies, post once, and inspect the audit trail. Archive test products when done.
8. Rehearse [application rollback](deployment.md#m7-release-and-rollback-checklist) and [database recovery](recovery.md) with a release operator. Record the responsible person and recovery objectives.

## Remaining hosted launch gates

- Commit/push M7, pass GitHub checks, then dispatch the manual prototype release and verify matching Render/Netlify revision evidence. A successful availability smoke alone cannot establish which application revision is running.
- Run the administrator walkthrough against that deployed revision. Do not run the whole fixture-writing integration suite against business data.
- Confirm the real Instagram handle and image upload/delivery. Verify Cloudinary backup settings and restore a disposable image. Provider backups are not established by the database restore drill.
- Configure encrypted off-machine backup storage, retention, schedule and ownership; this repository does not silently create a recurring paid service or backup scheduler.
- Exercise provider rollback on the prototype. Verify the environment values after rollback, especially the database target.
- Before a separate live production launch, confirm domain, production credentials/data isolation, availability budget and recovery objectives. The prototype's Neon branch happens to be named `production`; that name is not evidence of production readiness.

Keyboard navigation, visible focus, responsive overflow, validation and empty/error states are covered by the browser flows. A manual screen-reader review and broader browser/device coverage remain advisable before a larger public launch; this run uses Chromium desktop and mobile emulation only.
