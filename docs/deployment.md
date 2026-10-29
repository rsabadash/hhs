# Prototype deployment

Neon is connected: project `hhs` (`billowing-fog-37470920`), AWS Frankfurt, PostgreSQL 18, branch `production`. The initial migration is applied. Render and Netlify are live; the complete M1 release succeeded in [run 40853149068](https://github.com/rsabadash/hhs/actions/runs/40853149068). The user selected `https://github.com/rsabadash/hhs`. Authenticate locally with `gh auth login --hostname github.com` before publishing this project. Do not put tokens in tracked files.

API: https://hhs-api.onrender.com. Web: https://sage-daffodil-75ca07.netlify.app. Render was configured manually; `render.yaml` documents the configuration but is not connected as a managed Blueprint.

For M2, apply the release migration and then provision the initial administrator on a trusted machine using [the admin guide](admin-reference.md). No account or password is shipped by default.

## Account setup

1. Neon setup is complete for this prototype. Use the pooled `DATABASE_URL` from the ignored root `.env.local` as Render’s secret. Copy `DATABASE_URL_UNPOOLED` into GitHub’s `DIRECT_DATABASE_URL` secret. Keep prototype data separate from future production data.
2. Create a Render account, connect the GitHub repository, and import `render.yaml`. Set its secret `DATABASE_URL`. Keep automatic deploys **off**; the release workflow supplies the checked commit. The first deployment may fail readiness until the initial migration is applied by the release workflow.
3. Create a Netlify project for the repository, with the base directory `apps/web`. The root `netlify.toml` describes the build. Disable automatic Git-triggered builds (set Netlify Build status to **Stopped builds**, which retains CLI deploy access) so the release workflow owns publication. Set `API_URL` to the Render HTTPS URL for both build and function runtime scopes.
4. In GitHub, create an environment named `prototype`. Add the settings below. Keep repository variable `DEPLOY_ENABLED` unset until all settings are ready.
5. Create a Cloudinary account before M3 image integration. Credentials are not needed for the foundation and must never be sent to the browser.

Accounts, plan terms and provider build/runtime behavior must be verified when provisioning. The free Render service can sleep; initial requests may fail readiness during wake-up. The Netlify adapter and deployment scripts have passed an actual prototype release.

## GitHub configuration

Repository variable:

| Variable         | Value                                     |
| ---------------- | ----------------------------------------- |
| `DEPLOY_ENABLED` | `true` only when ready to enable releases |

Environment `prototype` variables:

| Variable            | Value                     |
| ------------------- | ------------------------- |
| `RENDER_SERVICE_ID` | Render service identifier |
| `NETLIFY_SITE_ID`   | Netlify site identifier   |
| `API_URL`           | Render HTTPS origin       |
| `WEB_URL`           | Netlify HTTPS origin      |

Environment `prototype` secrets:

| Secret                | Purpose                            |
| --------------------- | ---------------------------------- |
| `DIRECT_DATABASE_URL` | Neon direct URL for migrations     |
| `RENDER_API_KEY`      | Deploy and inspect the API service |
| `NETLIFY_AUTH_TOKEN`  | Deploy the frontend                |

Never expose these secrets to pull-request checks. Configure branch protection for the `Checks / verify` job where available.

## Release

Run **Deploy prototype** from `main`. It runs the full checks workflow against an isolated PostgreSQL 18 service. After success, it applies the checked migration, deploys the exact API commit and waits for it, builds/deploys the frontend from the same checkout, and checks API/web readiness plus the public catalog API and storefront. Releases are serialized and are manually initiated during the prototype stage.

The database migration happens before application deployment. Use backward-compatible migrations. A failed application deployment does not undo a successful migration. Inspect GitHub and provider logs, correct the issue, and rerun the release; migrations are tracked by Prisma. Never edit an already applied migration. Before real business data is accepted, establish and test database export/restore and media backup procedures in M7.

For application rollback, deploy a previously checked commit that remains compatible with the current schema using the provider dashboards. Keep automatic Git deployments disabled. Verify both readiness endpoints after rollback. Destructive schema changes need a separate recovery plan; there is no automatic database rollback.

## Official references

- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render deployment API and commit selection](https://api-docs.render.com/reference/create-deploy)
- [Netlify Next.js runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify CLI deployment](https://cli.netlify.com/commands/deploy/)
- [Neon plans](https://neon.com/pricing)

## M3 image storage

Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to the Render API environment before using uploads. The catalog remains editable without these optional settings. Run the opt-in provider smoke and review image cleanup maintenance in [the catalog guide](catalog.md). No Cloudinary credential is needed by the Next.js build or the GitHub release workflow.

## M5 public catalog

Add the business Instagram handle as non-secret variable `INSTAGRAM_USERNAME` in GitHub environment `prototype`. The release workflow embeds it as `NEXT_PUBLIC_INSTAGRAM_USERNAME` in the web build; changes require a new release. Leave it unset until the real handle is known: the catalog still works, and the contact link stays hidden. See [the public catalog guide](storefront.md). M5 needs no additional database migration.

## M7 release and rollback checklist

Before dispatching a release, record the checked commit, current Render deploy ID, current Netlify deploy ID and applied Prisma migration. Create and verify a private database archive using [the recovery procedure](recovery.md). Confirm the database target, Cloudinary configuration, business Instagram handle and intended public URL. Keep provider Git-triggered publication disabled.

After deployment, verify that Render's commit matches the workflow commit and retain the Netlify deploy URL from the workflow log. Run:

```sh
API_URL=https://hhs-api.onrender.com \
WEB_URL=https://sage-daffodil-75ca07.netlify.app \
node scripts/smoke-deployment.mjs
```

This smoke checks availability, not administrator workflows or deployed revision. On the prototype, use a dedicated, clearly named test product to exercise receipt → publication → order → cancellation → stock history, then archive that fixture. Verify the public inquiry link opens the actual business Instagram profile. Never run the full fixture-writing test suite against live business data.

For an application rollback:

1. Pause administrator writes and further releases. Determine whether the issue is application-only or involves corrupted data. Verify that the previous application understands the current schema; do not remove applied migration history.
2. Choose the previously recorded compatible frontend/backend pair. For a return to an older API contract, restore the compatible frontend first, then the backend, while writes remain paused.
3. In Netlify, open the successful previous deploy and select **Publish Deploy**. This republishes its retained artifact. See [Netlify rollback guidance](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/).
4. In Render's **Deploys** page, choose the previous successful deploy, then **Rollback → Rollback to this deploy**. Verify database credentials and other environment settings: the rollback can reuse settings from that old deploy. If an artifact has expired, build the previously checked commit through **Manual Deploy → Deploy a specific commit**. See [Render rollbacks](https://render.com/docs/rollbacks) and [specific commit deploys](https://render.com/docs/deploys).
5. Keep automatic deployments disabled. Re-run readiness, public smoke, admin login and a read-only inspection of orders and stock history. Resume writes only after these checks pass and record the final deploy IDs.

A data incident needs the separate recovery procedure; code rollback cannot repair lost or incorrect transactions. Provider rollback execution remains a prototype launch check; writing this procedure does not establish that it has been exercised on the hosted services.

Shared write transactions apply PostgreSQL `statement_timeout=12s` and `idle_in_transaction_session_timeout=30s` locally before acquiring the application lock. The server can then release abandoned transactions even when a client cannot send rollback. These limits affect individual statements and idle periods, not the entire 30-second Prisma transaction budget. Transaction-local configuration also avoids unsupported pooled startup settings; see [Neon connection errors](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-errors.md) and [PostgreSQL transaction timeout behavior](https://www.postgresql.org/docs/17/runtime-config-client.html).
