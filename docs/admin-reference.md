# M2: admin access and reference data

M2 adds `/admin/login` and management pages for categories, attributes and their values, units, warehouses, and suppliers. The public storefront remains the M1 placeholder. Product editing, uploads, stock and orders belong to later milestones.

## Sign in and manage records

Open `/admin` and sign in with a provisioned administrator account. There is no public registration. Every administrator has the same management role.

Each reference list has search at the top, ascending/descending name sorting beside the results and pagination (20 records per page). Open **Фільтри** to change filters in the side panel, then choose **Застосувати**. Closing the panel discards unapplied changes. **Скинути фільтри** clears filters immediately while retaining search and sorting. The panel fills the screen width on mobile.

Categories can be browsed through **Підкатегорії** or by choosing all, root or child categories in the filter panel. The category editor includes a paginated parent-category search. Moving a category under itself or a descendant is rejected, including concurrent moves.

Additional filters: whole/fractional units, suppliers with/without contacts, and warehouses with/without an address. Attribute values are scoped to their attribute and searchable by label.

Use **Додати запис**, complete the fields, then **Зберегти**. Use **Редагувати** to update an existing record. Reference deletion is deliberately unavailable: these records will be referenced by catalog and inventory history.

- Attributes have a name and a list of values. In **Атрибути**, add a name, fill **Значення 1**, then use **Додати значення** for additional rows. Save everything with **Зберегти**. **Значення (N)** and **Редагувати** reopen the same form.
- Include measurements in the value label, for example `4 мм`, `6 мм`, or `40 см`. There is no type selector. Values must be nonempty and unique within the attribute, ignoring case and surrounding spaces.
- Unused values can be edited or removed. Values attached to products or variants are read-only; add another value instead. The attribute and values save atomically. Explicit removals preserve any other values added by another administrator while the form was open.
- Older numeric attributes retain their displayed measurement text and value IDs when saved through the new form. Product/variant assignments and filters keep using those IDs. No schema migration is required.
- Unit precision is whole quantities or up to 3 decimal places, matching the inventory schema. Symbol and precision cannot change once a SKU uses the unit.
- An attribute value already attached to a product or variant cannot be changed to mean something else. Create a new value instead.

## Provision or recover an administrator

Deploy the migration before using the new API. On a trusted machine, set `DATABASE_URL` to the intended database, plus `ADMIN_EMAIL` and `ADMIN_PASSWORD`, using process environment variables or the ignored `apps/api/.env`. Passwords must be 14–200 characters. Do not commit these values or send them in chat.

```sh
pnpm db:seed
```

This creates the account only if its email does not already exist. An existing password is never overwritten by seeding. No demo administrator is included in a deployment.

For recovery, set the same email and a new password in the private environment, then run:

```sh
pnpm db:admin-reset
```

Recovery updates the password and revokes all of that administrator's existing sessions in one transaction. Remove `ADMIN_PASSWORD` from the local environment after use. A reset does not clear login throttling; wait for its window to expire if necessary.

## Authentication and deployment configuration

The existing `DATABASE_URL` on Render and server-only `API_URL` on Netlify are sufficient. Render must have `NODE_ENV=production` so the session cookie is Secure. All deployed browser access must use HTTPS. Keep the API free of permissive CORS rules.

The browser uses same-origin `/api/admin/*` routes in Next.js. This proxy verifies write origins against the request's Host and protocol, requires JSON and a custom CSRF header, caps ordinary reference bodies at 32 KiB and batched attribute edits at 1 MiB, and forwards only the required headers. The Nest API separately requires the custom header and JSON for writes, permits no CORS, and authenticates every reference read/write. Authenticated responses are `no-store`. The proxy never accepts arbitrary upstream URLs.

Sessions contain random 256-bit tokens in a host-only, HttpOnly, SameSite=Strict cookie. Only SHA-256 token hashes are stored in PostgreSQL. Sessions expire after eight hours; successful sign-in replaces the current browser's previous token, and sign-out revokes it. Password recovery revokes all sessions for that account.

Login attempt limits are persisted in PostgreSQL across restarts and API replicas: five attempts per normalized email per 15 minutes, and 60 attempts globally per minute. Unknown accounts get the same password-check cost and message as incorrect passwords. The global limit is intentionally conservative for the small admin team; under sustained abuse legitimate sign-ins may also be temporarily limited. Throttle keys contain hashed emails, not raw emails or IP addresses.

## API contract

All paths below are Nest API paths; browsers prepend `/api`.

| Method | Path                          | Result                                      |
| ------ | ----------------------------- | ------------------------------------------- |
| POST   | `/admin/auth/login`           | `{id,email}` and a session cookie           |
| GET    | `/admin/auth/me`              | `{id,email}` or 401                         |
| POST   | `/admin/auth/logout`          | `{ok:true}` and an expired cookie           |
| GET    | `/admin/references/:kind`     | `{items,total,page,pageSize}`               |
| GET    | `/admin/references/:kind/:id` | One record or 404                           |
| POST   | `/admin/references/:kind`     | Created record (201)                        |
| PUT    | `/admin/references/:kind/:id` | Updated record (200); full editable payload |

Writes require `Content-Type: application/json` and `x-hhs-csrf: 1`. Browser writes to the proxy also require a matching Origin. Login accepts `{email,password}`; logout accepts `{}`.

| Kind               | Editable fields                                                                    |
| ------------------ | ---------------------------------------------------------------------------------- |
| `categories`       | `name`, `parentId` (UUID or null)                                                  |
| `attributes`       | `name`, `values[{id?,label}]`, `removedValueIds[]` (optional)                      |
| `attribute-values` | `attributeId`, `label`, `numericValue` (decimal string for NUMBER, otherwise null) |
| `units`            | `name`, `symbol`, `allowsFraction` (boolean)                                       |
| `warehouses`       | `name`, `address`                                                                  |
| `suppliers`        | `name`, `email`, `phone`                                                           |

`GET /admin/references/attributes/:id` includes all values and product/variant usage counts. The inline editor accepts up to 1000 submitted values; existing IDs must belong to the attribute. Omitted existing values are preserved, and only explicit `removedValueIds` are deleted. Legacy payloads with `kind` and `measurementSymbol` and the individual `attribute-values` API remain supported for compatibility; the admin editor uses labels only.

List query parameters: `q` (up to 100 characters), `page` (positive integer), `pageSize` (1–50), `sort` (`asc`/`desc`). Optional filters: `parentId` (UUID or `root`), `kind` (`NUMBER`/`CHOICE`/`TEXT`), `allowsFraction`, `hasAddress`, `hasContact` (the last three are `true`/`false`). Attribute-value lists require `attributeId`. Unknown query/body fields are rejected. UUIDs are validated before querying.

Errors use HTTP 400 (invalid input), 401 (missing/expired session), 403 (write protection), 404 (not found), 409 (duplicate or protected relationship), and 429 (login throttled), with a `message`. Validation errors additionally include `fields: [{path,message}]`. Unexpected service failures do not expose database errors to the browser.

## Verified results — 2026-10-29

M2 is implemented locally and ready for review/release. It is not deployed yet. The migration was applied on an expiring child branch of the Neon prototype, not on the deployed database.

- Production API and Next.js builds passed.
- Type checks, ESLint, Prettier and diff whitespace checks passed.
- 14 unit tests passed, including proxy origin/header/body-size protections.
- 17 integration tests passed on Neon PostgreSQL 18, including simultaneous category moves, typed values, used-reference protections, throttling, session expiry/rotation/logout, and password recovery.
- All 8 desktop/mobile smoke tests passed. The 2 admin scenarios were also rerun to capture and visually inspect the responsive screens.
- Test administrators and business fixtures were cleaned up. The temporary Neon branch and test credential file were removed after verification.

The first browser run caught an internal-hostname origin-check mismatch. A regression test now verifies valid browser Host matching and rejects foreign or spoofed forwarded origins. Browser tests also explicitly wait for category navigation before submitting a child form.

## Verification

Run against a disposable database, never live inventory. Set `DATABASE_URL`, `DIRECT_DATABASE_URL` and `TEST_DATABASE_URL` to that isolated database and `API_URL=http://127.0.0.1:4000`.

```sh
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm test
pnpm test:integration
pnpm test:e2e
```

Integration tests launch the compiled API on port 4101. Playwright starts production builds on ports 3000/4000, creates random test administrators, exercises reference forms on desktop/mobile, tests logout/expiry, and cleans its fixtures. It refuses to seed if `DATABASE_URL` differs from `TEST_DATABASE_URL`. GitHub checks build the API before integration tests and supply an isolated PostgreSQL 18 service.
