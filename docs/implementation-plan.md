# Jewelry materials catalog and inventory — implementation plan

Status: implementation authorized on 2026-10-28. The user waived further UX revision. M1 technical foundation is deployed and verified; M2 authentication and reference data is deployed and the user confirmed administrator provisioning works; M3 catalog implementation and real Cloudinary upload/delivery/deletion are verified, awaiting release; detailed proposed rules remain documented defaults to refine during their feature milestones.

Updated: 2026-10-29.

## 1. Current position

The discovery stage established the business, language, currency, product variants, Instagram contact flow, and manual orders. The user also confirmed deferring automatic unit conversion, one warehouse per order, one selling price per SKU across warehouses, cancellation before fulfillment with stock restoration, and visible sold-out variants. Stock corrections must be a separate inventory process. Admin search/filtering and multi-product supplies are explicit requirements. An interactive Ukrainian UX draft covers the public catalog, variant selection, product editing, receiving supplies, and creating an order.

The UX draft uses sample data and simulated actions. It is not a deployed application, does not persist business records, and does not send Instagram messages. Its order, cancellation, receiving, and filter interactions have been checked in a browser, including narrow layouts. That validates the prototype only, not the application or its database rules. The user subsequently chose to skip further UX revision and start step-by-step implementation.

The initial drafts predated variants and orders. M1 replaces those incomplete drafts with a buildable foundation, variant-based schema, migration, health endpoints, and automated checks. See [foundation status](foundation.md) for verified results and remaining external setup. No business workflow is claimed complete by the schema or placeholder storefront.

## 2. Confirmed requirements

| ID  | Requirement                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------- |
| R01 | One business selling materials for jewelry making.                                                      |
| R02 | Ukrainian user interface; UAH currency.                                                                 |
| R03 | Public browsing, searching, filtering, product details, and contact through Instagram.                  |
| R04 | Admin can create and update categories, including parent/child relationships.                           |
| R05 | Admin can create and update attributes and their values, units, warehouses, suppliers, and supplies.    |
| R06 | Product information includes category, description, attributes, images, and tags.                       |
| R07 | Products have variants with distinct SKUs. Variants can have different images.                          |
| R08 | Tags are created when attached to products and removed from the database when no product uses them.     |
| R09 | Supplies go to a specific warehouse; each line identifies the item, unit, purchase price, and quantity. |
| R10 | Items can be published publicly with selling prices.                                                    |
| R11 | Admin creates orders; saving an order reduces stock. Customers do not use checkout in this release.     |
| R12 | Next.js frontend, NestJS backend, a GitHub monorepo, CI/CD, unit tests, and e2e smoke tests.            |
| R13 | Start with free prototype hosting; a modest production budget is acceptable later.                      |
| R14 | Deliver in reviewable milestones; further UX revision waived by the user on 2026-10-28.                 |

Additional confirmed requirements:

- R15: Admin lists must support search and filtering.
- R16: One supply can contain multiple products and variants; each row identifies a specific SKU.
- R17: Stock corrections belong to a separate inventory process, not an inline balance-edit button.

Representative products:

| Product              | Attributes                 | Selling unit |
| -------------------- | -------------------------- | ------------ |
| Нитка з перлин       | Довжина, діаметр           | шт           |
| Кільце-конектор      | Довжина, діаметр, покриття | шт           |
| Заглушки для сережок | Діаметр                    | пара         |

Attribute measurements, such as millimeters or centimeters, are distinct from inventory units, such as pieces or pairs. The prototype assumes one piece of a pearl strand means one complete strand; confirm that terminology during catalog implementation. Length for ring connectors also needs a clear definition and measurement unit.

## 3. Decision register

Confirmed decisions are not requests for approval again. Where a workflow is proposed below, only its detailed behavior remains to be reviewed.

| ID  | Decision                         | Status                                                         | Rule / remaining detail                                                                                                                                                            |
| --- | -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Purchase/selling unit conversion | Confirmed                                                      | Defer automatic conversion. One stock/selling unit per SKU; receive quantities and purchase costs in that unit. Packaging can be noted.                                            |
| D02 | Prices                           | Confirmed                                                      | One current selling price per SKU across warehouses; purchase costs remain on supply lines. Preserve selling prices on historical orders.                                          |
| D03 | Order warehouse                  | Confirmed                                                      | One warehouse per order. A sale using two warehouses becomes two orders initially.                                                                                                 |
| D04 | Cancellation                     | Confirmed                                                      | Cancellation before fulfillment restores the order quantities once. Creation deducts stock; fulfillment does not deduct again. Detailed status UX remains under review.            |
| D05 | Editing orders                   | Proposed                                                       | Freeze lines/prices after creation; cancel and recreate an incorrect unfulfilled order.                                                                                            |
| D06 | Receiving supplies               | Proposed lifecycle                                             | Draft → received. Draft edits do not affect stock; received lines are immutable. Receive every line in the document atomically.                                                    |
| D07 | Stock corrections                | Separate process confirmed; detailed workflow proposed         | Use an inventory count/reconciliation document, Ukrainian «Інвентаризація», instead of a quick stock-adjustment action. See the workflow below.                                    |
| D08 | Public publication               | Sold-out visibility confirmed; publication conditions proposed | Published variants stay visible when sold out. Propose explicit publication per variant with valid price/catalog fields. Decide whether first publication requires positive stock. |
| D09 | Catalog presentation             | Proposed                                                       | One card per product; choose variants on its page. Variant images override shared product images. Filters must match one visible variant.                                          |
| D10 | Quantity precision               | Proposed                                                       | Pieces/pairs are whole numbers; a unit defines permitted precision. Lock a SKU's stock unit once inventory history exists.                                                         |
| D11 | Admin access                     | Proposed                                                       | Admin-only management, no public registration, one permission level initially. Multiple admins may share that role.                                                                |
| D12 | Admin search/filtering           | Confirmed                                                      | All management lists support relevant search and filters, with pagination and sorting. See the list-specific requirements below.                                                   |
| D13 | Multi-product supplies           | Confirmed                                                      | One supply contains multiple product-variant/SKU lines. Each line has its own unit, quantity and purchase unit cost; all go to the supply's selected warehouse.                    |

A customer Instagram handle and a note can be recorded directly on an order. A full customer CRM, Instagram API integration, automatic messaging, payments, shipping integration, tax accounting, returns, partial receipts, warehouse transfers, and profit/cost-valuation accounting are not proposed for the first release. Their exclusion still needs overall scope sign-off; already-confirmed decisions above remain settled. Selling below purchase cost is not blocked unless the business requests that rule.

The earlier quick-adjustment proposal is superseded by D07. Treat a separate inventory process as stock counting and reconciliation, rather than assuming it is approval for unrelated transfers, returns, or full warehouse automation.

## 4. UX work to finish before implementation

### Public storefront

- Catalog: mobile and desktop, search by product name/SKU, nested categories, relevant attribute filters, tags, price, availability, pagination, clear/reset filters.
- Product details: variant selection, valid combinations, SKU, selling unit, price, gallery, image fallback, stock availability, description, attributes, tags.
- Instagram handoff: buyer can copy a message containing the selected SKU and product details and open the business profile. No promise of automatic DM delivery or message prefill; validate the chosen link behavior on mobile and desktop.
- States: loading, service unavailable, no results, product unpublished, unavailable variant, and unsupported attribute combination.

### Admin

- Sign-in, expired session, sign-out, and documented admin credential recovery.
- Products: searchable/filterable list, product editor, variant table, unique SKUs, attribute values, images and ordering, tags, price, publication.
- Reference management: category tree with safe reparenting, typed attributes/options, units, suppliers, and warehouses.
- Supplies: searchable/filterable list; draft editor with an add/remove-row control and searchable product/SKU picker; multiple SKU lines, each with its own unit, quantity and purchase unit cost; line totals and a document total; receiving summary, received detail view and line-specific validation failures.
- Inventory: searchable/filterable balances by SKU and warehouse, movement history, and a separate «Інвентаризація» list/create/count/review/post workflow. No direct editing of balances.
- Orders: list, create form, warehouse, buyer reference, multiple SKU lines, frozen selling prices, before/after stock summary, order details, fulfillment, cancellation, and insufficient-stock errors.

### Admin search and filters

Search/filtering is part of each relevant milestone, not a later add-on. The controls below are the proposed UX specification for the confirmed requirement.

| List                | Search                                                           | Filters                                                                                          |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Products / variants | Product name and SKU                                             | Category including descendants, attributes, tags, publication, price, availability and warehouse |
| Supplies            | Supply reference and included product/SKU                        | Supplier, destination warehouse, draft/received status, creation/receipt date range              |
| Orders              | Order reference, buyer Instagram handle and included product/SKU | Warehouse, status, creation date range                                                           |
| Stock balances      | Product name and SKU                                             | Warehouse, category, attributes, tags, in-stock/out-of-stock                                     |
| Stock movements     | Product/SKU and source document reference                        | Warehouse, operation type, date range                                                            |
| Inventory counts    | Document reference and included product/SKU                      | Warehouse, draft/counting/posted/cancelled status, date range                                    |
| Categories          | Name and category path                                           | Parent category / tree branch                                                                    |
| Attributes          | Name and option values                                           | Value type and measurement unit where applicable                                                 |
| Units               | Name and symbol                                                  | Allowed quantity precision                                                                       |
| Suppliers           | Name, email and phone                                            | Has supplies / no supplies                                                                       |
| Warehouses          | Name and address                                                 | Has stock / empty                                                                                |

Each list must preserve query, filters, sorting and pagination in its URL, show active filters and a clear-all action, reset pagination when filters change, and distinguish no data from no matching results. Sorting must be stable. Validate and bound query parameters on the backend; use server-side filtering/pagination rather than downloading the whole dataset. Search must work with Ukrainian text. Filter counts and rows use the same conditions. Product attribute and price filters must refer to the same variant; availability must use the selected warehouse when one is chosen.

Product/SKU pickers inside supplies, orders and inventory counts also need search. Display SKU and variant attributes clearly, so two variants of the same product cannot be confused. Draft/unpublished variants remain selectable for legitimate internal operations such as receiving stock; public visibility is a separate rule.

### Multi-product supply workflow

1. Create a supply with its reference, supplier and destination warehouse. One supplier per document is the proposed default.
2. Search and add any number of supported SKU rows, including variants of different parent products. Rows can have different stock units, for example `шт` and `пара`.
3. Enter each line's quantity and purchase price per that line's unit. Show line totals and the overall UAH amount. A purchase cost is not a selling price.
4. Save/edit a draft without changing stock. Add/remove rows while it remains a draft.
5. Review and receive the entire document in one atomic operation. If any line is invalid, no line changes stock and the document stays unreceived. Retrying the action must not duplicate any movements.

Example: one delivery can include a pearl strand SKU, two connector SKUs with different coatings, and an earring-back SKU measured in pairs. The current UX draft shows only one supply line and must be expanded to demonstrate this requirement before M0 is complete.

### Separate inventory process: proposed «Інвентаризація» workflow

The separate process is confirmed. The following counting/reconciliation workflow is the proposed interpretation to review in UX:

1. **Create a draft:** choose a warehouse and the product/SKU scope. Allow a selected subset; counting the entire warehouse is not mandatory. A draft does not change balances.
2. **Start counting:** capture expected quantity and balance revision for every scoped SKU. Record who started the count and when.
3. **Enter physical counts:** show `Очікувана кількість`, `Фактична кількість`, and `Різниця`. Uncounted is distinct from an explicit zero. Require a count for every scoped line before posting; exclude a line explicitly if it will not be counted. Unscoped items are unchanged.
4. **Review differences:** explain the reason for discrepancies and review proposed positive/negative changes. Reject negative physical counts and invalid fractional units.
5. **Post once:** validate that every counted SKU balance still matches its captured revision. In one transaction, create the reconciliation movements and mark the document posted. Zero differences create no stock movement. No partial posting if any line fails.
6. **Preserve history:** posted counts cannot be edited or silently undone. A new count/reconciliation document corrects a mistake. Cancelling an unposted count changes no stock.

Proposed states: `Чернетка → Підрахунок → Проведено`; an unposted document can become `Скасовано`.

Proposed concurrency rule for the MVP: do not block an entire warehouse while someone counts. If a supply, order, cancellation or another count changes a scoped SKU after its snapshot, block posting and require the affected line to be recounted against an updated snapshot. Recheck all revisions atomically at posting. Never silently overwrite newer movements or reuse a stale physical count. Confirm this rule during UX review.

For example, expected stock is 50 pairs and the physical count is 47 pairs. Posting records a `−3 pairs` movement linked to the inventory document, with its actor, timestamp and reason. Balances for other SKUs and warehouses remain unchanged.

The prototype is an initial workflow exploration, not approval of every screen. Expand it to cover missing creation/list states and the agreed error/correction flows. Review terminology and accessibility before visual polish. Use real product examples and photos when available.

Exit criteria for UX: agreed navigation and workflows, mobile layouts for customer flows, usable admin layouts, required fields, clear errors, and an approved status model. Keep purely visual preferences separate from business rules.

## 5. Technical architecture

### Application structure

- `apps/web`: Next.js, TypeScript, public storefront, and authenticated admin interface.
- `apps/api`: NestJS modular application. Modules: auth, reference data, catalog, media, inventory, supplies, orders.
- `packages/api-client`: frontend client/types generated from the API contract; add when the contract is established.
- `tests/e2e`: Playwright scenarios and isolated fixture setup.
- `docs`: decisions, setup, deployment, release checklist, and operational procedures.
- `pnpm` workspace with a committed lockfile. Add a task orchestrator only if build complexity warrants it.

Keep business rules and database writes in NestJS. The frontend must not implement a second stock or pricing authority. Next.js may proxy API requests to keep browser authentication on one origin; authorization still runs on every protected API operation.

### Database decision

Recommend PostgreSQL with Prisma migrations. Product relationships, unique SKUs, supply/order history, and atomic stock operations suit a relational database. Foreign keys and database constraints protect integrity independently of forms. Use exact decimal values for money and quantities, with declared precision and rounding rules; avoid floating-point arithmetic for persisted totals.

MySQL is also viable, but there is no identified need to choose it over PostgreSQL. A document database would add complexity around the relationships and inventory consistency without a demonstrated benefit here. Image bytes belong in media storage, not database records.

Use ordinary indexed PostgreSQL queries for the first catalog. Select language/search behavior using Ukrainian examples; add trigram or full-text indexing if measured queries need it. An external search cluster is deferred.

### Domain model to design and review

| Entity                          | Responsibility                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin, session                  | Authenticated management, session expiry/revocation.                                                                                                                      |
| Category                        | Parent/child structure; no cycles; references protected from destructive changes.                                                                                         |
| Attribute, option               | Numeric/text/selection definitions, measurement unit, allowed values, and validation.                                                                                     |
| Product attribute configuration | Which attributes describe the product and which distinguish its variants.                                                                                                 |
| Product                         | Shared name, description, category, tags, and fallback gallery.                                                                                                           |
| Variant                         | Unique SKU, stock unit, variant attribute values, current selling price, publication state, optional gallery. A product with no meaningful choices still has one variant. |
| Tag, product-tag                | Normalized unique tags and product associations.                                                                                                                          |
| Media asset, image association  | Provider ID, metadata, alt text, ownership, order, and product/variant association.                                                                                       |
| Unit                            | Inventory unit with permitted quantity precision.                                                                                                                         |
| Warehouse, supplier             | Stock location and source of supplies.                                                                                                                                    |
| Supply, supply line             | Warehouse, supplier, reference, status, SKU, quantity, unit, purchase cost, receipt time.                                                                                 |
| Order, order line               | Warehouse, buyer reference, status, SKU and product-description snapshot, quantity, unit, selling price and totals snapshot.                                              |
| Stock movement                  | Signed inventory change, SKU, warehouse, source operation, actor, timestamp, and reason.                                                                                  |
| Stock balance                   | Unique SKU/warehouse balance, updated transactionally with movements if a materialized balance is used.                                                                   |

Add InventoryCount and InventoryCountLine entities: warehouse, scope, status, actor/timestamps, SKU/unit, expected quantity, snapshot revision, actual quantity (nullable while uncounted), difference and reason. Link reconciliation movements uniquely to their source count line.

Images, prices, stock, supply lines, and order lines must reference the correct product or variant level. Historical unit and descriptive snapshots must survive later catalog edits. Do not hard-delete records needed by stock, purchase, or sale history; define archive behavior.

### Inventory invariants

1. Stock is specific to SKU and warehouse, never just the parent product.
2. Receiving inserts movements for every supply line and updates balances/status in one transaction. Invalid lines abort the entire document.
3. Creating an order checks all requested quantities and deducts all lines in one transaction; any failure leaves no partial order or stock changes.
4. Enforce uniqueness/idempotency for receiving, order creation, cancellation, and inventory-count posting. A retried HTTP request cannot duplicate a business operation.
5. Lock balances in a consistent order or use conditional atomic updates with safe retries so concurrent orders cannot oversell. Aggregate duplicate SKU lines before checking stock.
6. Cancelling an eligible order inserts reversing movements and changes status in one transaction, once only.
7. Fulfillment changes status only; it does not change stock a second time.
8. Never edit an existing stock movement or balance directly to correct history. Corrections use the separate inventory-count/reconciliation process with linked movements and reasons. Order cancellation remains its own defined reversal operation.
9. Reconcile movement sums and balances in integration tests and operational checks.
10. Inventory posting must reject stale balance revisions and leave all balances unchanged on conflict. Uncounted and unscoped lines never implicitly become zero.
11. Form validation is helpful, but all invariants must also be enforced by the backend/database.

### Security and media

- Use secure password hashing, HTTP-only sessions, expiry, revocation, login throttling, and CSRF protection for browser writes.
- No default production admin password or public admin-registration endpoint. Document initial provisioning and recovery.
- Public response schemas explicitly allowlist fields. Never expose supplier data, purchase costs, private customer notes, or admin-only inventory details.
- Validate file size, supported image format/content, ownership, and image associations. Keep media-provider credentials server-side.
- Handle interrupted uploads, removed associations, and orphan cleanup without deleting assets still in use. Preserve original and optimized delivery references as appropriate.
- Use environment variables/secrets, safe error responses, pagination, bounded request sizes, and audit records for stock-changing actions.

## 6. Delivery milestones

Every milestone gets a demonstrable result and acceptance review. Do not start the next feature milestone merely because some files have been written. Tests accompany each feature; the final hardening milestone is not the first time tests are added.

| Milestone                              | Work                                                                                                                                                                                                                            | Lead workstreams        | Acceptance / demo                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — requirements and UX               | Preserve confirmed decisions; resolve remaining workflow details, admin search/filter states, multi-product supply UX, inventory-count UX, boundaries and terminology.                                                          | Product management + UX | Approved brief, screen inventory, workflows, and explicit exclusions. Further UX revision waived; carry open details into their feature milestones.                                                   |
| M1 — technical foundation              | Review/rework drafts; establish product/variant schema, initial migrations, local PostgreSQL setup, runtime configuration, API contract, GitHub repository and basic CI; bootstrap deployment with health endpoints.            | Backend + frontend      | Fresh checkout installs, migrates, builds, typechecks and lints; web/API health works locally and in a prototype environment; CI is green.                                                            |
| M2 — authentication and reference data | Admin sessions, guard rules, category tree, typed attributes/options, units, warehouses and suppliers; Ukrainian admin shell/forms and searchable/filterable management lists.                                                  | Backend + frontend + UX | Admin signs in and creates/edits each reference type. Unauthenticated writes fail. Category cycles and invalid values are rejected.                                                                   |
| M3 — product catalog management        | Parent products, variants, unique SKUs, attributes, tags, shared/variant galleries, image ordering/alt text, publication/prices and admin product search/filters.                                                               | Frontend + backend + UX | Create the three representative products with variants. Edit them, upload images, see fallback, and verify last-use tag deletion.                                                                     |
| M4 — supplies and inventory            | Multi-product supplies with searchable SKU pickers; atomic receiving; inventory balances/history; searchable/filterable lists; separate inventory-count documents, difference review and idempotent reconciliation posting.     | Backend + frontend      | Receive several SKUs/units in one supply, all-or-nothing. Count scoped stock, review differences and post once. Reject stale counts. Other SKUs/warehouses stay unchanged; no history is overwritten. |
| M5 — public catalog and publication    | Publish/unpublish variants, catalog/detail pages, search/filtering, responsive gallery and variant selector, UAH formatting, Instagram handoff and availability.                                                                | Frontend + UX + backend | An admin-created, received, published variant is found publicly. Hidden data stays hidden. Combined filters match a single variant; selection updates SKU, photo, price and availability.             |
| M6 — manual orders                     | Searchable/filterable admin order list/create/detail, buyer reference, warehouse, SKU picker, price snapshots, atomic stock deduction, fulfillment/cancellation.                                                                | Backend + frontend      | Create an Instagram order, see correct stock changes, reject insufficient stock, preserve historical prices, and exercise approved cancellation. Concurrent orders cannot oversell.                   |
| M7 — release validation                | Complete cross-feature integration and smoke coverage, accessibility/error-state review, performance checks using representative data, security checks, backup/restore drill, deployment/rollback procedure and admin handover. | All four workstreams    | Full core workflow passes against production-like PostgreSQL; staging smoke passes; production configuration and backup recovery are verified before public launch.                                   |

Dependencies: M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7. After contracts are stable, frontend and backend tasks within a milestone can be coordinated, but this plan does not start separate agents or tasks. Establish CI and a minimal deployment in M1; evolve them with each milestone.

Avoid calendar promises before M0 decisions, account access, and actual task sizes are known. Estimate each approved milestone as it starts and revise estimates from demonstrated progress.

## 7. Testing strategy

### Unit tests

Target domain rules and meaningful form behavior: attribute validation, SKU/tag normalization, category-cycle detection, decimal rounding and totals, permitted quantity precision, variant combination rules, publication eligibility, and status transitions. Use Vitest where suitable and test behavior rather than duplicating implementation details.

### Integration tests with real PostgreSQL

- Apply migrations on an empty database and exercise foreign keys, uniqueness, and check constraints.
- Test multi-product receiving twice, concurrent receiving, duplicate order submission, cancellation retries, and fulfillment retries. A failed line must roll back the whole multi-line supply.
- Test two concurrent orders competing for the last available stock; at most one may consume it.
- Verify rollback when any order/supply line fails and verify no partial stock mutation.
- Test separate warehouses, duplicate SKU lines, whole-number units, tag cleanup under concurrent edits, and historical price/unit snapshots.
- Test inventory posting once, positive/negative/zero differences, cancelled drafts, explicit zero versus uncounted, scoped versus unscoped items, and stale counts after orders/supplies/cancellations or overlapping inventory counts.
- Test admin search/filter combinations with Ukrainian text, stable sorting/pagination, date ranges, warehouse-specific availability and products referenced inside supplies/orders.
- Verify session expiry/revocation, authorization, CSRF behavior, public field allowlists, draft/unpublished visibility, and upload limits/ownership.

Use an isolated test database. Mocks are appropriate for provider failures; they must not replace database transaction tests. Run an opt-in smoke test against actual configured image storage before launch, with dedicated disposable assets.

### Playwright e2e smoke tests

1. Admin signs in; anonymous access to admin is rejected.
2. Admin creates reference data, a product, and at least two distinct variants.
3. Images attach to the intended variant and shared-image fallback works.
4. Admin adds multiple product/variant lines to one supply, including different units; receives it and sees correct stock for every line in the chosen warehouse.
5. Admin publishes; customer finds the product using search and combined filters and selects the right SKU.
6. Instagram contact uses the correct profile and selected SKU message; automated tests do not send messages.
7. Admin creates an order; quantity and public availability change correctly.
8. Insufficient-stock orders fail; cancellation restores stock once.
9. Admin finds products, supplies and orders using search/filter combinations; clearing filters restores the expected list.
10. Admin performs a scoped inventory count, reviews discrepancies and posts it once; stock history shows the reconciliation. A stale count is rejected without overwriting a subsequent sale or supply.

Use deterministic fixtures, dedicated identities and disposable data. PR/staging tests can mutate their isolated environments. Production smoke checks are read-only by default; never create fake orders against live stock.

## 8. CI/CD and hosting

Proposed prototype services, subject to account and plan verification before provisioning:

| Component         | Proposed host    | Constraint                                                                                                          |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Next.js           | Netlify          | Free usage quotas and repository/team restrictions must fit the selected GitHub owner and visibility.               |
| NestJS            | Render           | Free service sleeps when idle; suitable for prototype validation, not the planned production availability standard. |
| PostgreSQL        | Neon             | Free storage/compute/restore limits; use separate development/test and production data.                             |
| Images            | Cloudinary       | Free credits cover shared storage/transformation/delivery usage; verify expected catalog size.                      |
| Repository/checks | GitHub + Actions | Private-repository runner/storage allowances depend on the account plan.                                            |

Vercel is an alternative for paid commercial frontend hosting. Its Hobby plan is restricted to personal/non-commercial use. A free prototype is a starting budget, not a production reliability guarantee. Confirm provider terms and quotas again when deployment is configured.

### Pull requests

- Install from a frozen lockfile; generate the database client and API contract.
- Run formatting/linting, type checks, unit tests, PostgreSQL integration tests and builds.
- Run core Playwright smoke tests against the built application with isolated PostgreSQL.
- Upload failure diagnostics with bounded retention and no secrets; validate configuration changes.
- Require applicable checks before merging, where supported by the chosen repository plan.

### Deployment

- Serialize deployments and ensure the deployed revision is the one that passed checks.
- Prevent independent provider auto-deploys from bypassing the CI gate.
- Run migrations with a dedicated controlled release step. Use backward-compatible schema changes so application rollback remains possible; do not promise automatic rollback of destructive database changes.
- Deploy backend/frontend in the order needed by their API compatibility; run health checks and staging smoke tests.
- Keep preview deployments off production data and keep secrets out of fork/PR jobs.
- Document how to restore the previous application release and recover from migration failures.
- Establish database backup/export and a tested restore process before live business records are accepted. Account for the provider's restore-window limitations and media backups separately.

Required external setup, collected when its milestone starts: GitHub owner/name/visibility, hosting account access, database credentials, image-provider credentials, business Instagram handle, initial admin identity, and eventually production domain/budget. Do not request passwords in the conversation; use the platform's secret mechanisms.

## 9. Definition of done

A milestone is done when its approved requirements work end-to-end, relevant tests pass, migrations and configuration are reproducible, errors/loading/empty states are usable, Ukrainian labels and UAH formatting are correct, documentation is updated, and the demonstration has been reviewed.

The application MVP is done only after all approved milestone acceptance criteria pass and the agreed environment is deployed. A schema, mockup, successful compilation, or locally working page alone is not release completion.

Workstream responsibilities:

- Product management: maintain decisions, scope, acceptance criteria, dependencies and milestone reviews.
- UX: produce and review flows, screens, terminology, responsive behavior, accessibility and failure states.
- Frontend: implement the approved screens, API integration, validation feedback and browser tests.
- Backend/database: implement contracts, schema, migrations, authorization, stock rules, integrations and database tests.

## 10. Immediate next step

Do not ask again about unit-conversion deferral, one warehouse per order, shared SKU prices across warehouses, cancellation before fulfillment, or sold-out visibility: those decisions are confirmed.

M1 is complete: the prototype release passed checks, migrations, Render/Netlify deployment and health checks in [run 40853149068](https://github.com/rsabadash/hhs/actions/runs/40853149068). M2 is deployed and the administrator account is working. M3 is the current milestone; see [catalog management](catalog.md). Implement subsequent milestones in the order above. Skipping UX revision does not mean implementing every feature at once.

Target repository: `https://github.com/rsabadash/hhs`. Neon, Render and Netlify are connected and the GitHub prototype environment is configured. Releases are manually dispatched after checks. M3 local checks and the real Cloudinary upload/delivery/deletion smoke have passed. Release remains; the hosted API needs the Cloudinary environment variables before uploads can be used.

See [foundation status](foundation.md) for delivered checks and remaining setup. Early unvalidated drafts are preserved locally under `.local/early-drafts` and are not shipped as completed features.

## References

Hosting research was checked on 2026-10-28; revalidate before deployment.

- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html)
- [NestJS OpenAPI support](https://docs.nestjs.com/openapi/introduction)
- [Netlify Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify credit limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
- [Render free-service limitations](https://render.com/docs/free)
- [Neon pricing](https://neon.com/pricing)
- [Cloudinary plans](https://cloudinary.com/documentation/billing_and_plans)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
