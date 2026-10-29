# Prototype deployment

Neon is connected: project `hhs` (`billowing-fog-37470920`), AWS Frankfurt, PostgreSQL 18, branch `production`. The initial migration is applied. Render and Netlify application hosting are still pending. The user selected `https://github.com/rsabadash/hhs`. Authenticate locally with `gh auth login --hostname github.com` before publishing this project. Do not put tokens in tracked files.

## Account setup

1. Neon setup is complete for this prototype. Use the pooled `DATABASE_URL` from the ignored root `.env.local` as Render’s secret. Copy `DATABASE_URL_UNPOOLED` into GitHub’s `DIRECT_DATABASE_URL` secret. Keep prototype data separate from future production data.
2. Create a Render account, connect the GitHub repository, and import `render.yaml`. Set its secret `DATABASE_URL`. Keep automatic deploys **off**; the release workflow supplies the checked commit. The first deployment may fail readiness until the initial migration is applied by the release workflow.
3. Create a Netlify project for the repository, with the base directory `apps/web`. The root `netlify.toml` describes the build. Disable automatic Git-triggered builds (for example, unlink the Git integration after site creation while retaining CLI deploy access) so the release workflow owns publication. Set `API_URL` to the Render HTTPS URL for both build and function runtime scopes.
4. In GitHub, create an environment named `prototype`. Add the settings below. Keep repository variable `DEPLOY_ENABLED` unset until all settings are ready.
5. Create a Cloudinary account before M3 image integration. Credentials are not needed for the foundation and must never be sent to the browser.

Accounts, plan terms and provider build/runtime behavior must be verified when provisioning. The free Render service can sleep; initial requests may fail readiness during wake-up. The Netlify adapter and deployment scripts have not yet been exercised against real accounts.

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

Run **Deploy prototype** from `main`. It runs the full checks workflow against an isolated PostgreSQL 18 service. After success, it applies the checked migration, deploys the exact API commit and waits for it, builds/deploys the frontend from the same checkout, and checks API/web readiness. Releases are serialized and are manually initiated during the prototype stage.

The database migration happens before application deployment. Use backward-compatible migrations. A failed application deployment does not undo a successful migration. Inspect GitHub and provider logs, correct the issue, and rerun the release; migrations are tracked by Prisma. Never edit an already applied migration. Before real business data is accepted, establish and test database export/restore and media backup procedures in M7.

For application rollback, deploy a previously checked commit that remains compatible with the current schema using the provider dashboards. Keep automatic Git deployments disabled. Verify both readiness endpoints after rollback. Destructive schema changes need a separate recovery plan; there is no automatic database rollback.

## Official references

- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render deployment API and commit selection](https://api-docs.render.com/reference/create-deploy)
- [Netlify Next.js runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify CLI deployment](https://cli.netlify.com/commands/deploy/)
- [Neon plans](https://neon.com/pricing)
