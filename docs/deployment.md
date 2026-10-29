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
