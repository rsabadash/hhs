# Database backup and recovery

Use this procedure before accepting real business records and before a risky migration. A database backup does not contain Cloudinary image files. Recovery is an operator action; the release workflow does not automatically roll back database migrations.

## Create a backup

Install PostgreSQL 18 client tools (`pg_dump` and `pg_restore`) and make them available on `PATH`. On macOS with Homebrew: `brew install libpq`, then `export PATH="/opt/homebrew/opt/libpq/bin:$PATH"`. The client must support the server version. Run from the repository root after installing dependencies.

Inject `BACKUP_DATABASE_URL` through a secret manager or a private terminal prompt. Use the **direct, unpooled** URL for the intended database. The command deliberately does not load application `.env` files or fall back to `DATABASE_URL`.

```sh
pnpm db:backup /absolute/private/path/hhs-before-release.dump
```

The command creates a PostgreSQL custom archive with permissions `0600`, refuses to overwrite a file, and excludes `Session` and `LoginThrottle` rows. The schema for these tables is retained; restored users must sign in again. Remote connections require certificate verification. Credentials go through the child process environment, not command arguments or logs.

Only an exit code of zero means a usable backup. Remove a failed partial archive and retry with a new filename. Keep archives outside the repository, encrypt them before off-machine storage, restrict access, and record the date, migration revision, application commit and checksum. Backups contain administrator password hashes and customer contact details. Do not upload them to ordinary CI artifacts.

## Restore into a new database

1. Stop admin writes if recovering a live incident. Record the last known good application commit, applied migration and incident time. Preserve the failed database for investigation.
2. Provision a **new, empty database** on an isolated branch or recovery project. Restrict its credentials to the recovery operator. Keep applications and other migration tools disconnected until recovery is complete.
3. Inject `RESTORE_DATABASE_URL` with its direct URL and set `RESTORE_CONFIRM_DATABASE` to the exact database name. If `BACKUP_DATABASE_URL` is also present, the script additionally rejects a matching source and target.
4. Run the command below using an archive you created and trust. PostgreSQL archives can execute SQL; never restore an untrusted upload.

```sh
pnpm db:restore /absolute/private/path/hhs-before-release.dump
```

The command refuses a target containing user tables, views or sequences. It restores in one transaction and stops on the first error. It does not drop existing tables, use `--clean`, or overwrite a running database. Use a fresh target rather than attempting to bypass these guards.

5. Compare source/backup and restored row counts and fingerprints for business tables and `_prisma_migrations`. For a drill, keep the source idle from baseline capture through export and comparison; a changing source will not match its earlier snapshot even when restoration is correct. Confirm `Session` and `LoginThrottle` are empty. Verify stock balances equal the signed movement totals:

```sql
SELECT b."variantId", b."warehouseId"
FROM "StockBalance" b
WHERE b.quantity <> COALESCE((
  SELECT sum(m.quantity) FROM "StockMovement" m
  WHERE m."variantId" = b."variantId"
    AND m."warehouseId" = b."warehouseId"
), 0);
```

Expected result: no rows. Investigate any discrepancy before resuming writes.

6. Start the application version compatible with the restored migration history against the recovery database. Check `/health/ready`, the public catalog, administrator sign-in, supply totals, order totals and stock history. Use dedicated fixture records for write verification. Check that existing image URLs still load.
7. After the checks pass, update Render's pooled `DATABASE_URL` and GitHub's direct migration secret to the recovered database, deploy the compatible application, and run the hosted smoke script. Resume writes only after verification. Keep the old database read-only until reconciliation is complete.

## Retention and media

Before live business use, assign an owner and agree a recovery point objective (acceptable lost transactions), recovery time objective, backup frequency, retention and encrypted storage destination. A proposed starting point is daily exports plus a pre-migration export, with a monthly restore drill; this is **not configured automatically** and must fit the business's acceptable data loss. Check the actual Neon plan's restore window separately.

Cloudinary automatic backups are disabled by default. Verify their status in the account, enable them if appropriate for the plan, and back up existing assets as well. Test restoring one disposable image; do not use a real product image for the drill. Cloudinary version backups cover original assets, not every metadata change. Database references and image recovery must be checked together. See [Cloudinary backups and version management](https://cloudinary.com/documentation/backups_and_version_management).

For PostgreSQL archive guidance, see [Neon pg_dump backups](https://neon.com/docs/manage/backup-pg-dump). Provider retention and costs must be checked before relying on them.
