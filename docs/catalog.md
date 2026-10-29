# M3: products, variants and images

The admin catalog lives at `/admin/products`. M2 login and reference management must already be available. This milestone adds catalog management. M5 exposes published active SKUs in the [public storefront](storefront.md). Publishing changes public visibility; it does not change stock.

## Create a product

1. Create its category, stock unit and attribute values in the reference screens.
2. Open **Товари → Додати товар**. Enter the Ukrainian name, description, category and comma-separated tags.
3. Add shared attributes that apply to every variant. For example, pearl material can be shared while diameter varies.
4. Add each variant with its own name, SKU, stock/selling unit, attributes and optional UAH selling price. A product without variations still has one SKU.
5. Save the product. Its gallery becomes available after saving.

SKU whitespace is trimmed and letters become uppercase. SKU uniqueness is also enforced case-insensitively by the database. A SKU belongs permanently to its product; existing variants are archived rather than deleted. The API rejects attempts to omit an existing variant from an update. A variant's stock unit cannot change once any balance, supply, order or inventory-count line references it.

Choose an attribute value once per attribute. Shared attributes cannot be overridden by variants. Active variants must have distinct combinations of attribute values; variants can have the same price but need different combinations. Attribute names/values are managed through reference pages, using searchable paginated pickers in the editor.

Prices use decimal strings with at most 12 integer digits and 2 fractional digits. Publishing requires an active variant and a positive price. Zero-stock publication is allowed so catalog preparation can precede receiving stock, and sold-out SKUs remain publishable. A blank price is allowed for drafts. Archiving a product unpublishes every variant; restoring it leaves those variants in draft until explicitly published again.

Product updates include the last `updatedAt` value. Another administrator's intervening change produces a conflict rather than silently replacing their work. Refresh and reapply changes after reviewing the current record. Gallery operations are independent of the product form.

Tags are normalized to Unicode NFC, lowercase Ukrainian text and single spaces. Duplicates are collapsed. Tags are removed from storage only when no product references them. Archiving retains tags because the archived product still references them. Tag replacement and cleanup run in the same serialized transaction as the product edit.

## Search and filters

Lists use server-side pagination (20 by default, maximum 50), stable name/ID sorting, Ukrainian name/SKU search, category including all descendants, tag, publication, price range, selected attribute values, active/archive status and warehouse-specific availability. Controls persist in the URL, and applying filters resets pagination. Clear filters with **Скинути фільтри**.

Variant-level filters must all match one active SKU. Shared product attributes count for every SKU. Availability means a positive balance in the selected warehouse, or any warehouse when none is selected. Warehouse selection affects availability filtering; it is not a restriction when availability is unset. Stock-writing workflows are delivered in M4; no direct balance editor is provided here.

## Cloudinary configuration

Set these server-only values in Render's API environment and, for local development, in ignored `apps/api/.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

No Cloudinary credentials belong in browser variables, Netlify, source control, or screenshots. No unsigned upload preset is needed. Without credentials, catalog editing works and the gallery explains that uploads are not configured.

The authenticated frontend sends a JSON data URL through the same-origin Next proxy. Uploads accept JPEG, PNG and WebP only, up to 3 MiB each and 20 images total per product. The server validates MIME, signature and decoded size, then Cloudinary validates the image and limits stored dimensions to 2000 × 2000. SVG, arbitrary URLs and user-selected public IDs are rejected. Credentials remain on the Nest server. Proxy limits are 32 KiB for existing admin routes, 256 KiB for product writes and 4,250,000 bytes for image uploads; the API parser is capped at 5 MiB.

Images can be shared or assigned to one variant of the same product. Edit alt text, scope and numeric order, then save that image. Lower order numbers display first; ties use ID order. The gallery preview displays a variant's own images when present and shared images otherwise. Deleting the final variant image restores shared fallback.

Upload reservations and failed deletions are stored in `ImageCleanup`. An upload that succeeds but loses its response or database transaction stays eligible for cleanup. Successful attachments remove their reservation. Deletion detaches the database record transactionally, attempts provider deletion immediately, and retains a retry record on failure. Never delete records from this queue manually without checking Cloudinary.

Retry abandoned uploads/deletions older than 24 hours with:

```sh
pnpm --filter @hhs/api images:cleanup
```

Run from a trusted machine with the intended database and Cloudinary environment. The command processes up to 100 records, checks for live attachments, deletes provider assets with CDN invalidation, and removes completed queue entries. Repeat if a backlog remains. No scheduler has been provisioned; include this command in prototype maintenance. CDN removal is not instantaneous.

Verify actual provider connectivity with a dedicated disposable 1-pixel asset:

```sh
pnpm --filter @hhs/api images:smoke
```

This checks authenticated upload, HTTPS delivery and deletion. It never creates a product or changes inventory. It reports the disposable asset ID if deletion fails so it can be removed in the Cloudinary console.

## API

All endpoints require an administrator session. Writes also require the existing JSON/CSRF checks. Browser routes prepend `/api`.

| Method | Nest path                             | Purpose                                                                            |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/admin/products`                     | Filtered product list                                                              |
| POST   | `/admin/products`                     | Create parent and variants atomically                                              |
| GET    | `/admin/products/:id`                 | Product, variants, attributes, tags, images                                        |
| PUT    | `/admin/products/:id`                 | Replace editable fields and supplied variant data, with `updatedAt` conflict check |
| GET    | `/admin/products/image-settings`      | Upload availability and byte limit; no credentials                                 |
| POST   | `/admin/products/:id/images`          | Upload `{data, alt, variantId}`                                                    |
| PUT    | `/admin/products/:id/images/:imageId` | Update `{alt, position, variantId}`                                                |
| DELETE | `/admin/products/:id/images/:imageId` | Detach and delete; returns `{ok, cleanupPending}`                                  |

Product payload: `name`, `description`, `categoryId`, `archived`, `tags[]`, `attributes[{attributeId,valueId}]`, `variants[]`, and `updatedAt` for updates. Variant payload: optional existing `id`, `name`, `sku`, `unitId`, `status`, decimal-string/null `sellPrice`, `archived`, and `attributes[]`. A product accepts 1–50 variants and up to 30 assignments at each level. Image ownership is derived from the database, not trusted from a provider URL supplied by the browser.

## Release and verification

The additive `202610290002_catalog_images` migration adds durable cleanup records and a product name index. The existing manual release workflow applies it before deployment. M3 has not been deployed as part of implementation.

Database verification uses an expiring isolated Neon branch, never the live prototype. Tests cover reference behavior, SKU uniqueness, concurrent edits, immutable historical units, same-SKU filters, descendant categories, tag lifetime, the three example product types, image ownership and provider failure recovery. Browser tests cover desktop/mobile product creation with two SKU variants, editing, filters and shared/variant gallery fallback. Provider-independent browser gallery fixtures and mocked image-provider failures do not substitute for the opt-in real Cloudinary smoke test.

### Local verification results — 2026-10-29

- API and Next.js production builds, type checks, lint and formatting passed.
- 18 unit tests, 24 PostgreSQL integration tests and 10 desktop/mobile browser tests passed.
- Desktop catalog and mobile editor screenshots were inspected; responsive forms and list layout fit the tested viewports.
- Concurrent writes exposed the previous 3-second database query budget. Queries now have a bounded 15-second budget and catalog/reference mutations a 30-second transaction budget, below the HTTP proxy timeout.
- Actual Cloudinary upload, HTTPS delivery and deletion passed with the configured credentials using `pnpm --filter @hhs/api images:smoke` (exit 0). The disposable asset was deleted. Provider failure/ownership logic and gallery fallback were verified separately with test doubles and isolated fixtures; this smoke does not certify the hosted UI deployment.

The temporary test database branch is deleted after verification; the hosted prototype database has not been migrated by this implementation run.
