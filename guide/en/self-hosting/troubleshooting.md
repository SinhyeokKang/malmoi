# Troubleshooting and privacy

Read the startup checks and logs when something goes wrong, and find what your installation stores for your own privacy policy.

## Web keeps restarting {#startup-checks}

The web container starts with `pnpm preflight && next start`. When the check fails, it writes only `preflight: <name> <reason>` lines to stderr (never the values) and exits; Compose restarts it again and again, and the scheduler doesn't start. Read them with `docker compose logs web`.

| Reason | Meaning | Fix |
| --- | --- | --- |
| `missing` | A required name is missing or empty | `deploy/.env`, or the `environment` list in Compose for names Compose fills |
| `incomplete-pair` | A sign-in provider has only one of its two values; the line names the missing one (such as `AUTH_GOOGLE_SECRET`) | Fill in the missing value, or empty both values to turn that provider off |
| `no-login-provider` | No sign-in provider is on; two lines name `AUTH_GITHUB_ID` and `AUTH_GOOGLE_ID` | Fill in at least one complete pair ([settings](install.md#settings)) |
| `invalid-format` | Wrong shape: `RESEND_API_KEY` must start with `re_`, `INVITATION_EMAIL_FROM` must be `Name <address>` or an address, `GITHUB_APP_SLUG` is `[a-z0-9-]`, `AUTH_TRUST_HOST` must be `true` | That value |
| `malformed` · `not-https` · `userinfo` | A shape problem in `MALMOI_ORIGIN` or `MALMOI_PRIVACY_URL`: spaces or backslashes or an unparsable URL, `http://`, `user:pw@` | An `https://` URL without user info |
| `path` · `query` · `fragment` · `ipv6` · `idn` | `MALMOI_ORIGIN` only (a path or query in the privacy URL is fine): a path, `?`, `#`, an IPv6 literal, a non-ASCII domain | `MALMOI_ORIGIN=https://<domain>` |
| `auth-url-mismatch` | `AUTH_URL` differs from `MALMOI_ORIGIN` (a trailing slash is ignored) | Don't override the value Compose sets |
| `privacy-cycle` | `MALMOI_PRIVACY_URL` is this installation's `/privacy`, which redirects to itself | Point it at your policy on another site |
| `relative-path` | `MALMOI_UPLOAD_DIR` isn't an absolute path | Compose uses `/data/uploads` |
| `not-found` | The upload path doesn't exist (the volume isn't mounted) | The `uploads` volume in Compose |
| `not-directory` | The path exists but is a file or a symlink | The mount target |
| `not-writable` | The app user (`node`, uid 1000) can't write there | Volume owner and permissions (`chown -R 1000:1000`) |
| `present` | `INVITATION_EMAIL_ORIGIN` is set; the installation derives it from `MALMOI_ORIGIN` instead | Remove the variable |
| `vercel-env-present` | `VERCEL_ENV` is set together with `MALMOI_ORIGIN`, which makes the deployment mode invalid | Remove `VERCEL_ENV` |

## Migrate stops with an error {#migrate}

Read `docker compose logs migrate`. A single `bootstrap: <code>` line comes from the checks in `deploy/bootstrap.sql`:

- `runtime-role-missing`, `migrate-role-missing`, `password-missing`, `password-empty`: a variable such as `RUNTIME_DB_PASSWORD` is missing.
- `runtime-role-is-migrate-role`: the two role names are the same.
- `runtime-role-privileged`: an existing runtime role is a superuser or has CREATEROLE, CREATEDB, or BYPASSRLS, which would let the app run with admin rights.
- `cannot-create-role`: the role doesn't exist and the role running the bootstrap can't create roles, which happens when the volume wasn't empty and the first-start script never ran.

A Prisma connection error before that usually means `MIGRATE_DB_PASSWORD` differs from the value used when the volume was created. The first-start script runs only on an empty volume; change the password with `\password` as in [rotate keys](operate.md#rotate-keys).

## Invitation emails don't arrive {#email}

- “Email is unavailable right now. Try again later.” before the invitation is created is a configuration problem. The server log has `[invite-email] config unavailable reason=<code>`: `missing` (no key or sender), `invalid-from` (sender shape), or `invalid-origin` (`MALMOI_ORIGIN` is invalid).
- A rejection after the invitation is created comes from Resend. The log has one line, `[invite-email] batch <rejected|unknown> <http-NNN|network> count=N`, with no addresses or keys. Find the same request at that time under Emails in the Resend dashboard. Usually `http-401` is a wrong or revoked API key, `http-403` an unverified sending domain or a sender outside the key's domain, `http-422` an address format, and `http-429` Resend's limit. With `unknown` (`network`, a timeout, or a 5xx), some messages may have gone out, and sending again expires the earlier link.
- The startup check only looks at the shape of these values. A key Resend refuses shows up at the first invitation, which is why the install checks send one.

## Behind the proxy {#proxy}

- A `redirect_uri` mismatch after sign-in, an error asking you to try again later, or forms that don't submit mean the original host didn't reach the app. The nginx example forwards `Host $host`. If `MALMOI_ORIGIN` has a non-default port (such as `:8443`), `$host` drops the port: change `Host` and `X-Forwarded-Host` in `deploy/nginx/proxy-common.conf` to `$http_host`, and make the 80 → 443 redirect (`return 301 https://$host…`) keep the port. With any other proxy, the `Host` the app receives must match the host of `MALMOI_ORIGIN`, plus its port if it isn't 443. Sign-in errors show in `docker compose logs web` as `[auth] <type>`, with the error type from Auth.js.
- A large update shows 504 in the target repository's workflow while the server finished loading it: nginx's `proxy_read_timeout` (60 seconds by default) closed the connection while the app kept working. Check the project's activity in Logs and rerun the workflow. Request bodies are limited to 5 MB (`client_max_body_size`).
- With a load balancer or CDN in front of nginx, `$binary_remote_addr` is that device's address, so everyone shares one rate limit counter and `/api/images/` and `/oauth/authorize` answer 429. Set `real_ip_header` and `set_real_ip_from` for that device.
- If `/api/images/*` answers 404, check the upload volume permissions (`EACCES` in the web log) first.

## Nightly sync {#nightly}

Run it once now with `docker compose exec scheduler /usr/local/bin/nightly-pull`. `curl: (22) … 401` in the scheduler log means `CRON_SECRET` differs between web and the scheduler (recreate both). The result is the `[pull] targets= published= …` summary line in `docker compose logs web`. The scheduler records only HTTP errors as failures and doesn't try again or catch up later.

## Someone can't sign in {#sign-in}

“Your sign-in method isn't available here. Ask your administrator.” on the sign-in screen means the person signed up with a provider you've turned off and has no other sign-in method connected. Malmoi doesn't create a second account for them. Turn that provider back on, let them sign in and connect a provider that stays on, then turn it off again ([turn a sign-in provider off](operate.md#sign-in-providers)).

## GitHub {#github}

If a new account can't install the GitHub App, check that the app is Public. If a repository shows as not installed, check Repository access on that installation.

## Privacy materials for your policy {#privacy}

You write the privacy policy for your installation. Its `/privacy` redirects to `MALMOI_PRIVACY_URL`, and mal-moi.com's policy doesn't describe your installation, so don't copy it. Below is what the installation actually stores, which cookies it sets, where it sends data, and how to delete an account. The table follows the app's own register of stored fields (`lib/privacy/collected.ts`), which changes when the app starts storing something new — compare it again at every update.

### Stored fields {#stored-fields}

Column meanings: collected — values to disclose as collected; retention — values that set how long something is kept; cookies — values a cookie carries; not personal — values that don't describe a person (translation work and row bookkeeping). Emails, names, pictures, and GitHub tokens are stored with envelope encryption (the keys live outside the database, in `.env`), and the email index is an HMAC. Sessions, invitations, and coding-agent tokens are stored only as hashes.

| Model | What it is | Collected | Retention | Cookies | Not personal |
| --- | --- | --- | --- | --- | --- |
| `User` | A person who signed in. Name, email, and picture come from GitHub or Google and are encrypted with the PII key; the email index is an HMAC of the address. The three display settings and the Inbox read time are settings stored on the account | `id`, `name`, `email`, `emailLookup`, `emailVerified`, `image`, `createdAt`, `uiLocale`, `timeZone`, `colorScheme`, `attentionSeenAt` | — | — | — |
| `Account` | A linked sign-in method (GitHub or Google): the provider's account ID, plus the GitHub App user token received when connecting a repository (encrypted with the token key) and its expiry | `userId`, `installRequestedAt`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at` | — | — | `type` |
| `Session` | A sign-in session. Only a digest of the cookie value is stored; it expires 24 hours after the last activity | — | `expires` | `sessionToken`, `userId` | — |
| `VerificationToken` | Challenges for linking a sign-in method and for signing out other sessions. `identifier` holds the user ID and the provider account ID in one JSON string. 5 to 10 minutes | `identifier`, `token` | `expires` | — | — |
| `ProjectMember` | Project membership and role | `userId`, `role`, `createdAt`, `updatedAt` | — | — | `projectId` |
| `ProjectInvitation` | An invitation. The address is encrypted (PII key) with an index; the token is a hash. It expires after 7 days but the row, address included, stays | `createdAt`, `email`, `emailLookup`, `role`, `tokenHash`, `acceptedAt`, `invitedBy` | `expiresAt` | — | `id`, `projectId` |
| `ApiToken` | A personal token for coding agents: its hash, the permissions and projects the person chose, and when it was used | `userId`, `grants`, `allProjects`, `projectIds`, `tokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | — |
| `OAuthConnection` | A connected coding agent (Claude Code, Codex, and others): the name and address the app gave, token hashes, permissions and projects, and when it was used | `id`, `userId`, `clientId`, `clientName`, `redirectUri`, `grants`, `allProjects`, `projectIds`, `accessTokenHash`, `accessExpiresAt`, `refreshTokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | `issuer`, `resource` |
| `OAuthRefreshHistory` | Hashes of refresh tokens a connection has already used. Removed with the connection | `tokenHash`, `connectionId`, `usedAt` | — | — | — |
| `OAuthCode` | A 60-second exchange snapshot right after consent. Removed once exchanged | `codeHash`, `clientId`, `clientName`, `redirectUri`, `userId`, `grants`, `allProjects`, `projectIds`, `connectionExpiresAt`, `usedAt` | `expiresAt` | — | `requestId`, `codeChallenge`, `issuer`, `resource` |
| `Translation` | Translation values aren't personal data; only the last editor and time point to a person | `updatedAt`, `updatedBy` | — | — | `id`, `projectId`, `surfaceId`, `keyId`, `localeCode`, `value`, `description`, `placeholders`, `needsReview`, `pendingEditToken` |
| `SyncRun` | Records of syncs and Publish runs: who asked and when | `trigger`, `startedAt`, `finishedAt`, `requestedBy` | — | — | `id`, `projectId`, `status`, `errorCode`, `prUrl`, `changed`, `changedValues`, `warnings`, `withheld` |
| `ProjectEvent` | Activity in Logs: who acted and when, with masked member labels and translation values before and after in `payload`. Never deleted | `occurredAt`, `finishedAt`, `actorKind`, `actorUserId`, `payload`, `searchText` | — | — | `id`, `ref`, `projectId`, `kind`, `subtype`, `result`, `surfaceIds`, `surfaceScope`, `syncRunId`, `runToken` |

- Models with only not-personal fields: `Project`, `TranslationSurface`, `Locale`, `StringKey`, `KeyRef`, `DeliveryConfirmation`, `TranslationBaseline`, `OAuthAuthorizationRequest`. They hold repository coordinates, keys, and translation state, with no creator columns.
- Translation values belong to the project and don't describe anyone; authorship is only in the `Translation` and `ProjectEvent` rows above.
- An uploaded profile picture is re-encoded as WebP within 192 px (the original and its metadata are discarded) and stored under `avatars/<userId>/` in the upload volume. GitHub and Google pictures are stored as URLs, and the browser loads them from there.
- There's no page-view counting. The app's outside calls are only the recipients below.
- The nginx example's access log records the client address, time, method, path, status, size, duration, and browser. It masks the token in invitation and sign-in link paths (`/invite/<redacted>`, `/signin/link/<redacted>`) and leaves out query strings and referrers. nginx's error log still records the full request line and referrer when the app can't be reached, so keep proxy logs as private as tokens. Describe your proxy and load balancer logs in your policy.

### Cookies {#cookies}

The prefixes `__Host-` and `__Secure-` are added over HTTPS (names below are without them). There are no advertising, analytics, or tracking cookies. Only `malmoi-sidebar-collapsed` is readable by scripts; every other cookie is HttpOnly.

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `authjs.session-token` | 24 hours after the last activity | Keeps you signed in |
| `authjs.csrf-token` | Until the browser closes | Confirms a sign-in request started on this site |
| `authjs.callback-url` | Until the browser closes | The page to return to after sign-in |
| `authjs.state` · `authjs.pkce.code_verifier` | 15 minutes | Proves a provider's answer belongs to the sign-in it started |
| `malmoi-gh-state` | 10 minutes | The same proof for connecting a repository |
| `malmoi-account-connect` · `malmoi-connect-state` · `malmoi-login-link` · `malmoi-link-state` · `malmoi-session-revocation` · `malmoi-revocation-state` | 5 to 15 minutes | The same proof for adding a sign-in method to the same address and for signing out other sessions |
| `malmoi-ui-locale` · `malmoi-color-scheme` | 1 year after the last choice or sign-in | The interface language and theme chosen in this browser, signed out too. Signing in copies the account's values |
| `malmoi-sidebar-collapsed` | 1 year after the last toggle | Whether the sidebar is collapsed |

The time zone is stored only on the account, not in a cookie.

### Recipients {#recipients}

The installation sends data to three services. mal-moi.com's Supabase and Vercel (hosting, file storage, page-view counting) aren't part of it.

| Recipient | What goes there | Why |
| --- | --- | --- |
| GitHub | The profile and verified email received at sign-in, when GitHub sign-in is on. Repository reads and branch, commit, and pull request writes through your GitHub App (commits are made by the app, not by a person). A connected person's GitHub App user token is used only to read | Sign-in · connecting repositories and Publish |
| Google | The profile and verified email, for people who sign in with Google, when Google sign-in is on | Sign-in |
| Resend | The invited address and the message (invitation link, project name, project picture address, role — not who sent it). Open and click tracking are off | Invitation emails. Resend keeps sending records for your plan's period (30 days on Free); check your plan and put it in your policy |

- GitHub and Google profile pictures are loaded by the browser straight from those services.
- The logo and project pictures in invitation emails load from your `MALMOI_ORIGIN`.
- When someone connects a coding agent, what the agent reads (translations, activity, members, a push token if asked) goes to that agent and its AI service. The person chooses and runs it; the installation sends nothing there itself. To show the app's name on the consent screen, Malmoi reads the public description at the address the app gave, with no user data in the request.
- `/changelog` reads the upstream repository's GitHub Releases, with no user data in the request.

### Delete an account {#delete-account}

There's no self-service screen for deletion, so this is a manual procedure for access, correction, and deletion requests. Membership rows and invitations someone sent block deleting their `User` row, so they go first. Deleting the `User` row then removes their sign-in methods, sessions, personal tokens, and connected agents, and clears them from sync records and activity. Translation values stay; only the link to their author is removed.

1. Take a [backup](operate.md#backup) first — deletion can't be undone. How you confirm the person's identity is up to your policy.
2. Find the account. Emails are encrypted, so compute the lookup index (an HMAC) instead. The address goes in through the environment, not the command line (`EMAIL_LOOKUP_KEY` is already in the web container), and `PROJECT_IDS` lists the projects whose invitations step 3 searches. With no projects it's empty, and only the `user` line prints:

   ```sh
   read -r SUBJECT_EMAIL; export SUBJECT_EMAIL
   export PROJECT_IDS="$(docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'SELECT id FROM "Project"' | tr '\n' ' ')"
   docker compose run --rm --no-deps -e SUBJECT_EMAIL -e PROJECT_IDS web node -e '
   const c=require("crypto"),k=Buffer.from(process.env.EMAIL_LOOKUP_KEY,"base64"),kid=process.env.EMAIL_LOOKUP_KEY_ID;
   const e=process.env.SUBJECT_EMAIL.trim().toLowerCase();
   const h=s=>"hmac:v1:"+kid+":"+c.createHmac("sha256",k).update(JSON.stringify(["malmoi/email-lookup","v1",s,e])).digest("hex");
   for(const s of ["user",...(process.env.PROJECT_IDS||"").split(/\s+/).filter(Boolean).map(p=>"invitation:"+p)])console.log(s+"\t"+h(s))'
   unset SUBJECT_EMAIL PROJECT_IDS
   ```

   Use the `user` line's value in `SELECT id FROM "User" WHERE "emailLookup" = '<hmac>';`. That `id` is `:uid` below. No row means there's no account for this address (if you're in the middle of a lookup key change, run the reindex first and try again).
3. The `invitation:<projectId>` lines are the indexes of pending invitations sent to this person, one per project, because each project indexes invitation addresses differently.
4. Remove an uploaded profile picture: `docker compose exec web rm -rf /data/uploads/avatars/<uid>` (no directory means there's none).
5. Delete in one transaction. Connect with `docker compose exec postgres psql -U postgres -d malmoi -v ON_ERROR_STOP=1 -v uid=<uid>`, run the statements (replace `<invitation indexes from step 3>` with the step 3 indexes, each in single quotes, separated by commas), and check every row count before `COMMIT` (use `ROLLBACK` if anything looks wrong):

   ```sql
   BEGIN;
   -- stop if this person is a project's last owner: any row here means ROLLBACK and transfer ownership first
   SELECT m."projectId" FROM "ProjectMember" m
    WHERE m."userId" = :'uid' AND m."role" = 'OWNER'
      AND NOT EXISTS (SELECT 1 FROM "ProjectMember" o WHERE o."projectId" = m."projectId" AND o."role" = 'OWNER' AND o."userId" <> m."userId");
   DELETE FROM "ProjectMember" WHERE "userId" = :'uid';
   DELETE FROM "ProjectInvitation" WHERE "invitedBy" = :'uid';                  -- invitations this person sent
   DELETE FROM "ProjectInvitation" WHERE "acceptedAt" IS NULL AND "emailLookup" IN ('<invitation indexes from step 3>');  -- pending invitations to this person
   DELETE FROM "VerificationToken" WHERE "identifier" LIKE '%"' || :'uid' || '"%';   -- sign-in linking and sign-out challenges
   UPDATE "Translation" SET "updatedBy" = NULL WHERE "updatedBy" = :'uid';       -- no foreign key, so clear it by hand
   DELETE FROM "User" WHERE "id" = :'uid';                                       -- cascades to Account, Session, ApiToken, OAuth*; SyncRun and ProjectEvent are set to NULL
   COMMIT;
   ```

6. What remains: translation values (the project's work — only the author link is gone), the masked labels in activity records (`ProjectEvent` loses the actor link but isn't deleted), invitations to this person that were already accepted (the statements above delete only pending ones; the encrypted address stays, so mention it in your policy or drop the `"acceptedAt" IS NULL AND` condition), Resend's sending records (they expire on Resend's schedule), and backups (until you discard them — mention it in your policy).
