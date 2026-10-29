# Manual Instagram orders (M6)

Orders are created by an administrator after agreeing the purchase with the buyer. There is no public checkout, payment processing, shipping integration or automatic Instagram messaging.

## Create and review an order

1. Open **Замовлення → Нове замовлення**.
2. Select one warehouse and enter the buyer name and Instagram handle or other contact. Add an optional note.
3. Use **Додати SKU** to search by SKU, product or variant name. Attributes and units identify the variant. Add up to 100 distinct SKUs and their quantities.
4. Select **Перевірити замовлення**. Review the current selling price, each line total, the total in UAH, and stock before/after deduction for each SKU in that warehouse. This preview does not reserve or deduct anything.
5. Select **Створити й списати запаси**. The server checks current stock and prices again and saves all lines and stock movements in one transaction. A changed price or insufficient stock rejects the whole order; return to editing and review again.

The SKU must be active, its product must be active, and its selling price must be positive. An unpublished SKU can be sold manually; publication only controls the public catalog. The purchase/selling unit is the SKU's stock unit. Pieces/pairs require whole quantities; fractional units allow three decimal places. Unit conversion and order-specific discounts are deferred. Prices come from the catalog, not an editable order-price field.

Each line rounds quantity × price half-up to two decimal places using exact decimal arithmetic. The total sums the rounded lines. Duplicate SKU rows submitted through the API are combined before availability checking; conflicting prices for the same SKU are rejected.

## Fulfill or cancel

An order starts as **Підтверджено** with stock already deducted. **Позначити виконаним** records the administrator and time without deducting stock again. A fulfilled order cannot be cancelled in this MVP.

Before fulfillment, enter a cancellation reason and select **Скасувати й повернути запаси**. This restores every line to the original warehouse exactly once and records the administrator, time and reason. It works even if the product has since been archived or its price changed. Repeated fulfillment/cancellation requests return the existing result. Competing fulfillment and cancellation requests cannot both succeed.

Saved lines, quantities, buyer information and prices are immutable. To correct an unfulfilled order, cancel it and create a new one. Returns after fulfillment and partial fulfillment are deferred.

Order detail shows the SKU, product/variant/attribute description, unit and price captured at creation, so subsequent catalog edits cannot rewrite the order. Warehouse names and administrator emails reflect their current records. **Рух запасів цього замовлення** opens its sale and cancellation movements; those movements link back to the order.

## Search and filters

The order list searches reference, buyer name, contact and saved SKU/product descriptions. Search is above the list; **Фільтри** opens a side panel for warehouse, status and inclusive creation-date range in UTC. Timestamps are displayed in Europe/Kyiv. Pagination and filters stay in the URL. Sorting beside the results offers newest first (default) or oldest first, with an ID tie-breaker.

## API and consistency

All endpoints require an admin session. Writes also require the CSRF header; the Next proxy checks the browser origin, JSON content type and body size.

| Method | Endpoint                    | Purpose                                                                            |
| ------ | --------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/admin/orders`             | List; `q`, `warehouseId`, `status`, `from`, `to`, `page`, `pageSize`               |
| POST   | `/admin/orders/preview`     | Validate buyer/warehouse/SKU quantities and return current price and stock preview |
| POST   | `/admin/orders`             | Create once using UUID `requestKey` and the reviewed `unitPrice` on every line     |
| GET    | `/admin/orders/:id`         | Immutable order snapshots, totals, status and audit details                        |
| POST   | `/admin/orders/:id/fulfill` | Confirm fulfillment with empty JSON body                                           |
| POST   | `/admin/orders/:id/cancel`  | Cancel with nonempty `reason` (maximum 500 characters)                             |

Creation requests contain `warehouseId`, `customerName`, `contact`, optional `notes`, and `items` with `variantId`, decimal-string `quantity`, and reviewed decimal-string `unitPrice`. Preview uses the same fields without `requestKey`; prices are optional in preview. Maximum 100 input rows, 160-character name, 250-character contact and 2,000-character note.

The server stores a hash of the normalized creation payload. Retrying the same request key and payload returns the existing order, even after catalog changes or cancellation. A different payload with the same key returns a conflict. On an uncertain network/server response, the browser retains the original request and offers a safe retry. Do not reload or start another order to retry an uncertain result: first check the order list, since refreshing loses the in-memory request key.

Order writes share the PostgreSQL advisory transaction lock used by supplies, inventory counts, catalog and reference changes. Balance revisions increment on sales and cancellation, so an open inventory count becomes stale and must be recounted. Database constraints prevent negative stock, mismatched warehouse/source references and duplicate sale/cancellation movements per line. Public availability uses current balances across all warehouses on the next catalog request.

## Migration and validation

`202610290006_orders` adds creation fingerprints, fulfillment/cancellation actors and cancellation reasons. It is additive; existing rows can have null fingerprints/actors. Readiness checks require the new columns. Apply it through the release workflow before deploying the new API. No additional provider credentials are needed.

Validation covers duplicate request delivery, conflicting request keys, exact totals, aggregate overflow, insufficient-stock rollback, concurrent sales, fulfillment versus cancellation, archive/price/name/unit history, warehouse isolation, stale inventory counts, public sold-out/restored availability, authentication/CSRF, and desktop/mobile admin flows. Test data belongs to an isolated temporary PostgreSQL branch; prototype records are not used for writes.

Verified locally on 2026-10-29: build, type checks, lint and formatting passed; 34 unit tests, 48 database integration cases and 16 desktop/mobile browser cases passed across the initial runs and targeted reruns. The browser flow also simulates a successful save whose response is lost and confirms a retry preserves one order and one deduction. Desktop/mobile review and fulfillment screenshots were inspected. The isolated database branch was removed after validation. These results do not claim a hosted release; the migration and application still need the normal checked deployment.
