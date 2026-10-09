# Update, back up, and restore

Update one release at a time, keep backups of the database, uploads, and keys together, and rotate keys without losing data.

## Update to a new release {#update}

Update one release at a time, in order, and only to the latest release; updates that skip releases haven't been verified yet. The migrations must finish before web is recreated, so an old app never reads a newer database. Outside traffic and the scheduler stay off until the new version passes your checks: if you have to go back to the backup, nothing anyone saved in between is lost.

1. Stop the app and take a backup with the [backup](#backup) commands. Don't run `docker compose up -d` afterwards.
2. Compare the new tag's `deploy/` with yours (leave `.env` alone), carry over changes to Compose, nginx, and the scheduler, and set `MALMOI_IMAGE` in `.env` to the new tag and digest. If `deploy/scheduler/` changed, run `docker compose build scheduler`.
3. Run `docker compose pull --ignore-buildable`. The scheduler image is built locally and isn't in the registry, so the command fails without `--ignore-buildable`.
4. Run `docker compose run --rm migrate`. It applies the new migrations and runs the bootstrap again, which is safe to repeat. Don't count on a migrate run from an earlier `up`.
5. Limit ports 80 and 443 to your own IP address in your cloud provider's firewall. A firewall on the server itself isn't enough, because Docker's published ports bypass it.
6. Run `docker compose up -d --force-recreate --no-deps web proxy`. `--no-deps` keeps migrate from running again, and the scheduler stays stopped.
7. Check the new version from your own browser: `docker compose ps` shows web healthy, you can sign in, a translation screen opens, uploaded pictures show, and `docker compose logs web --since 5m` has no `EACCES` or `preflight:` lines. Don't publish from it yet.
8. If everything works, run `docker compose up -d --no-deps scheduler` and open ports 80 and 443 to everyone again. Workflow runs that started while the ports were limited couldn't reach the server; rerun them with Run workflow.
9. If something is wrong, keep the ports limited. Go back to the previous `MALMOI_IMAGE` and repeat steps 4 and 6 only if the old version is known to work with the new database. Otherwise restore the backup from step 1 — database, image, and keys together ([restore](#restore)). There are no down migrations.

## Back up {#backup}

A backup is three things taken while the app is stopped: the database dump, the upload volume, and `.env` (the keys). If any one is from a different moment, the restore doesn't line up — database rows point at uploaded files, and the encrypted values open only with the keys from that time. Keep backups outside the repository checkout and copy them off the server. Permissions are 600 for files and 700 for directories.

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ); B=/var/backups/malmoi/$STAMP; mkdir -p "$B" && chmod 700 "$B"
docker compose stop scheduler proxy web            # stops new traffic and writes; only postgres keeps running
docker compose exec -T postgres pg_dump -U postgres -d malmoi -Fc > "$B/db.dump"
docker run --rm -v malmoi_uploads:/data:ro -v "$B":/backup alpine tar czf /backup/uploads.tar.gz -C /data .
cp .env "$B/env" && cp -r certs nginx "$B/"
{ echo "taken_at=$STAMP"; grep '^MALMOI_IMAGE=' .env
  docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'select count(*), max(migration_name) from _prisma_migrations'
} > "$B/manifest.txt"
(cd "$B" && sha256sum db.dump uploads.tar.gz env >> manifest.txt)
chmod -R go-rwx "$B"                                # last, so the manifest is covered too
```

- The manifest holds no secrets: the time, the image, the migration state, and the checksums.
- For a routine backup, start everything again with `docker compose up -d`. When the backup is the first step of an [update](#update), leave the app stopped.
- Keep the keys with the dump. Without the PII key, emails and names can't be recovered; without the token key, GitHub connections can't. After a key rotation, keep the old keys too, because older backups need them.
- If you turned on `log_statement` (`ddl` or `all`) or `pg_stat_statements` with `track_utility`, the server log or statistics keep the `CREATE ROLE … PASSWORD` statements. The stock postgres image has both off; if you enabled them, turn them off while the bootstrap runs.
- A backup counts only once a restore from it has worked. Try the restore below once on another server, with the scheduler left off. Limit anything that writes to a real repository (Publish, the nightly sync) to a test repository there.

## Restore into empty volumes {#restore}

This brings a backup back on a new server, or after `docker compose down -v`. The keys must be the ones from the backup; other keys can't open the encrypted values.

Restore drills and isolated checks belong on a different server from your live one. `deploy/compose.yaml` fixes the Compose project name, so on the same server a copied directory still uses the live `malmoi_pgdata` and `malmoi_uploads` volumes: steps 2 and 4 would run on your live data, and `down -v` would delete it. If you have to use the same server, add `-p <another name>` to every Compose command, change the volume name in step 4 to `<that name>_uploads`, and give the proxy different ports — missing any one of these hits the live installation.

1. Get the same tag's `deploy/`, copy the backup's `env` to `deploy/.env`, and bring back `certs/` and `nginx/`. Keep `MALMOI_IMAGE` at the backup's digest, or a newer tag you've confirmed compatible.
2. Run `docker compose up -d postgres`. On an empty volume this creates the database and the migration role with `MIGRATE_DB_PASSWORD` from `.env`.
3. Load the dump as the migration role, without owners or permissions (the migration role becomes the owner, and step 5 grants permissions again): `docker compose exec -T postgres pg_restore -U malmoi_migrate -d malmoi --no-owner --no-acl < "$B/db.dump"`. Read the closing `errors ignored on restore: N`. Only `already exists` messages for the `public` schema are expected; stop on anything else rather than migrating a partial restore.
4. Restore the uploads: `docker volume create malmoi_uploads && docker run --rm -v malmoi_uploads:/data -v "$B":/backup alpine sh -c 'tar xzf /backup/uploads.tar.gz -C /data && chown -R 1000:1000 /data'` (the app user `node` is uid 1000). From now on every Compose command warns that the volume `already exists but was not created by Docker Compose`. It's harmless, and `down -v` still removes the volume.
5. Run `docker compose run --rm migrate`. If the restored migration history is current, nothing is migrated, and the bootstrap creates the runtime role, grants its permissions, and takes schema access away from everyone else again. Always run this after a restore — skipping it leaves the restored database open to every role.
6. Run `docker compose up -d web proxy` and leave the scheduler off. Compose runs migrate once more before web because web depends on it; that's harmless. Check that you can sign in, see a project's translations, and see uploaded pictures, and that `docker compose logs web` has no decryption errors (`credential-…`).
7. The past comes back, so check it. Personal tokens, connected apps, and sessions revoked after the backup work again, and canceled invitations return. Sign everyone out with `docker compose exec -T postgres psql -U postgres -d malmoi -c 'DELETE FROM "Session"'` and ask people to review their tokens and connected apps on the MCP page. Edits and Publish runs after the backup are lost; compare with the pull requests in the target repositories.
8. Start the scheduler only after those checks. If this installation is now your live one, run `docker compose up -d` to bring the scheduler up too.

## Rotate keys {#rotate-keys}

The key tools run inside the app image and connect as the migration role through `DIRECT_URL`. No Compose service gets both the database admin credentials and the six keys, so you pass `DIRECT_URL` from your shell. Never type a password into a command line, where shell history and `ps` keep it: keep it in a shell variable and pass `-e DIRECT_URL` without a value.

1. Take a [backup](#backup). It pairs the database with the old keys.
2. In `deploy/.env`, add the new key to the key ring next to the old one and set `*_ACTIVE_KEY_ID` to the new key's name. For the lookup key, replace `EMAIL_LOOKUP_KEY` and `EMAIL_LOOKUP_KEY_ID`; the old one isn't needed. The new values must all differ.
3. Block traffic and stop writers: `docker compose stop proxy scheduler web`. Without the proxy nothing outside gets in (browsers, target repositories' workflows, coding agents, sign-in callbacks), and without the scheduler there's no nightly sync. Only postgres keeps running.
4. Put `DIRECT_URL` in your shell without writing it to history: `read -rs P && export DIRECT_URL="postgresql://malmoi_migrate:${P}@postgres:5432/malmoi" && unset P`, typing `MIGRATE_DB_PASSWORD` at the prompt. Skipping TLS is fine only while the host is exactly `postgres`; for a database on another host, add `?sslmode=verify-full`. Other query parameters are rejected.
5. Check, apply, and verify. `--no-deps` keeps migrate from running:

   ```sh
   RUN='docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted'
   $RUN --mode=rotate-token                                              # check only
   $RUN --mode=rotate-token --apply --traffic-blocked --writers-drained
   $RUN --mode=rotate-pii   --apply --traffic-blocked --writers-drained
   $RUN --mode=reindex      --apply --traffic-blocked --writers-drained  # only if you changed the lookup key
   $RUN --mode=verify
   ```

   Each prints one line of JSON. `oldTokenKey` and `oldPiiKey` from `verify` must both be 0 before you start the app with the new keys. A failure prints only `credential-conversion-failed: keep traffic blocked`, without values; the stderr line just before it, `[credentials] … credential-env: missing environment variable <name>`, says why (an active key ID that's empty or not in its key ring). Never start the app again with only part of the data converted.
6. Run `unset DIRECT_URL`, then `docker compose up -d --force-recreate --no-deps web proxy scheduler` so web reads the new `.env`, and check sign-in and invitations.
7. Keep the old keys in the key ring. Older backups need them.

Other secrets and checks:

- `pnpm credentials:finalize:self-hosted` (same `RUN` form, `--mode=backfill` by default) only reads: it confirms that the credential storage migration has been applied and prints `{"target":"self-hosted","pending":false,"applied":false}`. A new installation or a normal update always shows `pending:false`, because the migrate service applies every migration. Its `--apply` runs the migrations directly and isn't part of the normal procedure; updates use `docker compose run --rm migrate`.
- `APP_SIGNING_SECRET` and `AUTH_SECRET`: change `.env` and run `docker compose up -d --force-recreate web`. No traffic block is needed; only sign-ins and GitHub connections in progress at that moment start over. `CRON_SECRET` must match in web and the scheduler, so recreate both (`--force-recreate web scheduler`); if only one changes, the nightly sync gets 401.
- Database passwords: once the volume exists, changing `MIGRATE_DB_PASSWORD` or `RUNTIME_DB_PASSWORD` in `.env` alone does nothing. Open `docker compose exec postgres psql -U postgres -d malmoi -X`, run `\password malmoi_app` (or `malmoi_migrate` — psql hashes the password before sending it, so it doesn't reach the server log), then update `.env` and run `docker compose up -d --force-recreate web`. The migration role's new password applies from the next `docker compose run --rm migrate`.

## What happens next {#next}

After an update or a restore, check the web log for `preflight:` lines and decryption errors ([troubleshooting](troubleshooting.md#startup-checks)), and compare the stored fields with your privacy policy ([privacy materials](troubleshooting.md#privacy)).
