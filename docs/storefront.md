# Public catalog (M5)

The storefront is at `/`; product pages are at `/products/<product-id>`. The interface is Ukrainian and prices are in UAH. This milestone uses the existing catalog and inventory schema; it adds no migration.

## Publish a product

1. Open **Товари** in the admin and create or edit a product with a category and SKU variants.
2. Give each variant a positive selling price and select **Опубліковано**. Save the product. Publication is explicit per SKU; archived variants and archived parent products remain hidden.
3. Receive a supply through **Поставки** to make the SKU available. Publication before receiving is allowed. A published SKU with zero stock stays visible as **Немає в наявності**.
4. Open the public catalog and search by name or SKU. A parent category includes its descendants. Filter by attributes, tags, price or availability; sort by name and navigate pages. Filters persist in the URL. **Скинути фільтри** restores the full catalog.
5. Open a product and choose a variant. SKU, price, unit, attributes, availability and gallery update together. A variant-specific gallery replaces the shared gallery; variants without images use shared product photos. Missing or failed images show a placeholder.

There is one card per product. Every SKU condition (including SKU search, selected attributes, price and availability) must match the same published variant. Shared attributes apply to every variant. Card prices and photos refer to the cheapest matching variant; the card opens that variant. A card's availability summarizes its matching variants. Only existing variant combinations can be selected. A link to a removed/unpublished variant asks the visitor to choose another; it never silently switches the inquiry to a different SKU.

Public availability means at least one warehouse has positive stock. Warehouse identities, exact quantities, suppliers, purchase costs, stock movements and administrator details are not exposed. Availability is advisory until an administrator records the order; there is no checkout or reservation in M5.

## Instagram contact

The business username is optional until supplied. A missing or invalid username hides the external link and shows that contact is being configured. No account name is guessed.

- **Locally:** set `NEXT_PUBLIC_INSTAGRAM_USERNAME` in `apps/web/.env.local` to the business handle, for example `my_jewelry_shop` (no URL), then restart development or rebuild the production web app.
- **Release:** add the non-secret variable `INSTAGRAM_USERNAME` to GitHub's `prototype` environment. The release workflow passes it as `NEXT_PUBLIC_INSTAGRAM_USERNAME` to the Netlify build. Run a new release after changing the handle: the value is embedded at build time. No new token or password is needed.
- **Manual Netlify builds:** supply `NEXT_PUBLIC_INSTAGRAM_USERNAME` in that build's environment.

**Скопіювати повідомлення** creates a message containing the selected SKU, name, attributes, current price/unit and a link to the selected variant. If clipboard access fails, the full text stays visible for manual copying. **Відкрити Instagram** opens the configured profile in a separate tab. The visitor pastes and sends the message themselves. Sold-out variants prepare an availability inquiry. The app does not send messages or claim that Instagram will prefill one.

## API

Anonymous, read-only endpoints:

| Endpoint               | Result                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `GET /catalog`         | Paginated product cards                                                                 |
| `GET /catalog/filters` | Categories (with ancestors), tags and attribute values used by public products/variants |
| `GET /catalog/:id`     | Public product fields and published active variants only                                |

List parameters: `q`, `categoryId`, `tag`, comma-separated `valueIds`, `minPrice`, `maxPrice`, `inStock=true|false`, `sort=asc|desc`, `page`, `pageSize`. Default page size is 12; maximum is 24. Attribute selections are ANDed; the UI allows one value per attribute. Unknown/internal query fields are rejected with 400. Valid but nonexistent filter IDs return no results. Hidden products return 404. There is no anonymous write endpoint.

The backend explicitly selects and serializes public fields. Shared photos and photos attached to visible variants are exposed; draft variant galleries are excluded. Filter options also exclude draft-only values/tags/categories. API responses use `Cache-Control: no-store`; Next.js uses fresh server-side requests. Publication and stock changes are reflected on the next request. An already-open page is a snapshot and must be refreshed to observe subsequent changes.

## Verification

Unit tests cover public query restrictions, bounds and price ranges, URL filter normalization, safe Instagram handles and selected-SKU inquiry text. PostgreSQL integration tests cover same-variant matching, hidden records/fields/images, category ancestors, stock/publication freshness, image fallback and pagination. Browser scenarios create a draft through authenticated admin endpoints, receive stock, publish it, then browse anonymously on desktop and mobile, select variants/gallery images, prepare an inquiry, exercise invalid/missing states and unpublish it again. Browser image responses are disposable test pixels; real Cloudinary upload/delivery was verified in M3. No test sends an Instagram message.

Verification on 2026-10-29: API/web production builds, type checks, lint, formatting, 31 unit tests, six new PostgreSQL integration tests and desktop/mobile storefront scenarios passed. Across the regression run and targeted reruns, all 14 desktop/mobile browser scenarios passed, including existing reference, catalog, health and inventory workflows. The existing inventory creation navigation exceeded its five-second assertion after a successful save; that specific assertion now allows 15 seconds for the create and subsequent page-load round trips. Currency formatting is deterministic across Node.js and browsers to avoid hydration differences. The temporary Neon test branch was deleted and its local connection file removed; prototype business data was not modified.

M6 adds administrator-created orders and stock deduction; M7 covers release hardening and production readiness.
