# Supplies and inventory (M4)

M4 adds authenticated Ukrainian admin pages for supplies, warehouse balances, stock movements and separate inventory-count documents. The [public storefront](storefront.md) reads availability; [manual orders](orders.md) deduct stock and restore it on cancellation.

## Receive a supply

1. Open **Складський облік → Постачання → Нове постачання**.
2. Enter a unique document reference; select a supplier and one destination warehouse.
3. Use **Додати SKU** to search by product, variant name or SKU. The picker shows the variant attributes and stock unit. Add up to 100 distinct SKUs from different products. Unpublished variants can be received; archived products/variants cannot.
4. Enter quantity and purchase price per stock unit. Pieces/pairs use whole quantities; fractional units permit up to three decimal places. Purchase prices permit two decimal places and may be zero. Unit conversion is deferred.
5. Save the draft. Drafts do not change stock; their rows, supplier, warehouse and notes can be edited.
6. Review line totals and the document total, then select **Отримати постачання** and confirm. All rows are received in one transaction. Received documents are immutable. Purchase prices do not change selling prices or publication status.

Amounts use decimal arithmetic. Each quantity × unit-cost line is rounded half-up to two decimal places; the document total sums those rounded line totals. The unit is determined by the SKU, never supplied independently by the browser. The SKU's unit cannot change once a supply/count/history reference exists.

A repeated receive request returns the already-received document without adding stock again. Duplicate document references are rejected; after an uncertain create response, find the existing reference before creating another document.

## View stock and history

**Залишки** requires a warehouse selection. Every matching SKU is shown, including zero for SKUs without a balance row at that warehouse. Search by Ukrainian product name, variant name or SKU, and filter by category (including descendants), shared/variant attributes, tag, availability and archive state. By default balances include archived SKUs so their stock remains visible.

**Рух запасів** records quantity, operation, warehouse, actor and time, with a link to the supply, order or inventory-count document. Filter by warehouse, operation and dates, or search by source reference/product/SKU. The per-SKU history link preserves warehouse and variant IDs.

Supplies and counts have searchable, paginated lists with relevant status, supplier, warehouse and date filters. All inventory lists place search above the results, sorting beside them and filters inside the **Фільтри** side panel. Filters, sort order and page are in the URL. Date ranges are inclusive calendar dates in UTC (labeled in the form); displayed timestamps use Europe/Kyiv. Applying filters starts at page one; resetting filters retains search and sorting. Sorting has an ID tie-breaker.

## Count and reconcile stock

1. Open **Інвентаризація → Нова інвентаризація**. Enter a unique reference, choose a warehouse and add the SKU scope. Archived SKUs are allowed so remaining stock can be counted. A count can cover a subset of the warehouse.
2. Save the draft, then **Почати підрахунок**. This captures each scoped SKU's quantity and balance revision. The system records the administrator and time.
3. Enter each physical quantity. Blank means uncounted; `0` means counted and absent. Review the displayed difference. Provide a reason for each nonzero difference. A line can be explicitly excluded; excluded and unscoped SKUs remain unchanged.
4. Save the counts, review, then **Провести інвентаризацію** and confirm. Every included line must have a valid quantity and an unchanged stock snapshot. At least one line must remain included.
5. Posting creates one movement per nonzero difference and updates balances atomically. Zero differences create no movement. A repeated post does not change stock again. Posted documents cannot be edited or cancelled.

Supply receipts, orders, order cancellations or other reconciliations can change stock while counting. Posting then fails with the affected SKU and changes no balances. Save any local edits, use **Оновити знімок і перерахувати …** on each affected line, physically recount, and save the new quantity. Refreshing a snapshot clears its previous physical count and reason; it never silently reuses a stale count. **Скасувати інвентаризацію** cancels an unposted document without changing stock.

Document revisions prevent two administrators from overwriting each other's edits. A revision conflict requires a page reload before reapplying changes. Stock is never edited directly from a balance row.

## API and transaction contract

All endpoints are under `/admin/inventory`, require the existing admin session, and require the CSRF header for writes. The Next proxy enforces browser origin and JSON/body limits.

| Method     | Path                                     | Purpose                                             |
| ---------- | ---------------------------------------- | --------------------------------------------------- |
| GET        | `/variants`, `/balances`, `/movements`   | Paginated SKU selection, stock and movement history |
| GET / POST | `/supplies`                              | List / create draft                                 |
| GET / PUT  | `/supplies/:id`                          | Detail / replace draft                              |
| POST       | `/supplies/:id/receive`                  | Atomic receipt                                      |
| GET / POST | `/counts`                                | List / create count draft                           |
| GET / PUT  | `/counts/:id`                            | Detail / replace draft scope                        |
| POST       | `/counts/:id/start`                      | Snapshot and begin counting                         |
| PUT        | `/counts/:id/results`                    | Save all physical-count/exclusion rows              |
| POST       | `/counts/:id/recount`                    | Refresh one snapshot and clear its count            |
| POST       | `/counts/:id/post`, `/counts/:id/cancel` | Post / cancel                                       |

Updates and actions require the last document `revision`. Creation omits it. Recount additionally requires `variantId`. Receiving, starting, posting and cancelling retry safely when already in the requested state. Draft rows are unique by SKU. Inputs reject negative quantities, unsupported precision, oversized documents, unknown fields and malformed IDs.

All catalog/reference/stock mutations share PostgreSQL transaction advisory lock `70120261029`. Future order creation/cancellation must use the same transaction protocol (or replace it consistently with a tested per-balance lock strategy). Batched stock updates, movements and document state changes commit together. Database constraints enforce nonnegative stock, movement provenance/sign and unique movements per source line. Counts compare revisions even if stock later returns to the same quantity.

Migration `202610290003_inventory` adds document revisions, lifecycle actor references, count cancellation time, count-line exclusions and a movement timeline index. It does not recalculate existing balances or rewrite movement history. Readiness requires the new schema.

## Deployment and verification

No new provider credentials are required. Use the existing **Deploy prototype** release workflow after the changes are committed/pushed: checked migrations run before Render API and Netlify frontend deployment. Do not manually alter hosted balances or apply test fixtures to the prototype database.

Local setup uses the existing commands: `pnpm db:generate`, `pnpm db:migrate`, `pnpm dev`, with the intended local/development database configured. Existing administrators keep their accounts.

Unit tests cover quantity/price boundaries and document input. PostgreSQL integration tests cover stock-neutral drafts, atomic receipts, concurrent retries, immutable received documents, optimistic revisions, count reasons/zero/exclusions, stale snapshots/recounts, competing reconciliations, cancellation, filters and 100-line documents. Desktop/mobile browser tests exercise multi-SKU receiving and a count made stale by a later receipt before recounting and posting zero stock. Run those suites only with an isolated `DATABASE_URL=TEST_DATABASE_URL` and matching direct migration URL.

### Verification on 2026-10-29

- Production API and web builds, TypeScript, lint, formatting and diff checks passed.
- 25 unit tests passed, including large-amount precision and half-up rounding.
- All 33 database integration cases passed. The remote Neon run hit the original 15-second timeout on one catalog and one multi-step count test; both affected suites then passed with a 30-second test allowance. Application transaction limits remain unchanged. The final migration was also reapplied successfully to a fresh branch snapshot.
- The ten existing desktop/mobile browser cases passed; the two new inventory scenarios passed after correcting a delayed-refresh race in the editor. They verify a receipt arriving during counting, stale-post rejection, explicit recount, posting zero stock, unchanged second-SKU stock and movement links. Captured mobile/desktop screens were inspected.
- Tests used a disposable Neon branch; the deployed prototype database was not migrated or used for fixture writes. No new provider secrets are needed.

For integration testing against a remote database with network latency, use `pnpm exec vitest run --config vitest.integration.config.ts --testTimeout=30000`. CI continues to use its local PostgreSQL service.
