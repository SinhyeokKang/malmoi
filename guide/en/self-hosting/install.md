# Install

Register the outside services under your own accounts, fill in the settings, and start Malmoi with Docker Compose.

## Register the outside services {#external-apps}

Create every service below under your own accounts. Don't reuse mal-moi.com's OAuth apps, GitHub App, Resend domain, or keys. `<ORIGIN>` is your `MALMOI_ORIGIN`.

| What | Where | Settings | Values for `deploy/.env` |
| --- | --- | --- | --- |
| HTTPS domain | DNS and certificate | Domain root · A/AAAA to the server · ports 80/443 open · public-CA certificate as `deploy/certs/fullchain.pem` and `privkey.pem` · `server_name` in `deploy/nginx/malmoi.conf` (two places) set to the domain | `MALMOI_ORIGIN=https://<domain>` — no path, query, or user info; IPv6 literals and non-ASCII domains are rejected |
| GitHub OAuth App (sign-in) | GitHub Developer settings → OAuth Apps | Homepage `<ORIGIN>` · Authorization callback `<ORIGIN>/api/auth/callback/github` | `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` |
| GitHub App (reading and writing repositories, connecting accounts) | GitHub Developer settings → GitHub Apps | Public (otherwise only the owning account can install it) · Callback URL `<ORIGIN>/api/github/callback` · Request user authorization (OAuth) during installation on · Redirect on update on · Setup URL empty · Webhook off · Permissions: Contents read and write, Pull requests read and write (Metadata read is automatic) | `GITHUB_APP_ID` (a number) · `GITHUB_APP_CLIENT_ID` (`Iv…`, different from the ID) · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY` (the PEM on one line, line breaks written as `\n`) |
| Google OAuth | Google Cloud Console → OAuth consent screen and Credentials | Consent screen External and In production (Internal blocks everyone outside your organization with `403 org_internal`, and testing mode admits only listed test users) · scopes `email` and `profile` · Authorized redirect URI `<ORIGIN>/api/auth/callback/google` · privacy policy URL = `MALMOI_PRIVACY_URL` | `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` |
| Resend sending domain (invitation emails, required) | Resend → Domains and API Keys | Domain verified (SPF and DKIM) · open and click tracking off (tracking rewrites invitation links) · TLS Enforced recommended · an API key with Sending access limited to that domain | `RESEND_API_KEY` · `INVITATION_EMAIL_FROM="Malmoi <invite@<verified domain>>"` |

- The GitHub App permissions are the smallest set the app's calls need. On each installation, the repository list under Repository access decides which repositories Malmoi can reach; a repository missing from it shows as not installed.
- Both login providers are required. The app always offers GitHub and Google sign-in.

## Fill in the settings {#settings}

Every value goes in `deploy/.env`. The web container checks the names below at every start and refuses to start if one is missing or malformed ([startup checks](troubleshooting.md#startup-checks)). Compose fills some of them itself; leave those alone.

| Name | Filled by | Notes |
| --- | --- | --- |
| `MALMOI_ORIGIN` | You | Same host as `server_name` in the nginx file |
| `MALMOI_PRIVACY_URL` | You | HTTPS, no user info, and not this installation's `/privacy` |
| `MALMOI_UPLOAD_DIR` | Compose (`/data/uploads`) | The `uploads` volume is mounted there; the check confirms it exists and is writable |
| `AUTH_URL` · `AUTH_TRUST_HOST` | Compose (`${MALMOI_ORIGIN}` · `true`) | `AUTH_URL` must equal `MALMOI_ORIGIN` |
| `AUTH_SECRET` | You | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` · `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | You | Both providers are required |
| `APP_SIGNING_SECRET` | You | `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` — different from `AUTH_SECRET` and the encryption keys |
| `DATABASE_URL` | Compose | The runtime role `malmoi_app` with `RUNTIME_DB_PASSWORD` |
| `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` | You | The slug is `[a-z0-9-]`. Without it, new users can't install the GitHub App from inside Malmoi |
| `CRON_SECRET` | You | The web and scheduler containers get the same value — `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEYS` · `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` · `PII_ENCRYPTION_KEYS` · `PII_ENCRYPTION_ACTIVE_KEY_ID` · `EMAIL_LOOKUP_KEY` · `EMAIL_LOOKUP_KEY_ID` | You | Wrap the key ring JSON in single quotes: `TOKEN_ENCRYPTION_KEYS='{"k1":"<32-byte base64>"}'`. The three key values must differ (`openssl rand -base64 32` each) |
| `RESEND_API_KEY` · `INVITATION_EMAIL_FROM` | You | Starts with `re_` · `Name <address>` |
| `OPERATOR_EMAILS` | You (optional) | Comma-separated full email addresses; empty means no operators |

Compose also reads `MALMOI_IMAGE`, `POSTGRES_PASSWORD`, `MIGRATE_DB_PASSWORD`, and `RUNTIME_DB_PASSWORD`; `deploy/.env.example` describes them. Make the three database passwords different, each with `openssl rand -hex 32`, because they go into connection URLs as they are. Don't add `INVITATION_EMAIL_ORIGIN`, `VERCEL_ENV`, or `BLOB_*`: the web container receives only the names Compose lists, and if you edit Compose to pass them, the startup check rejects `INVITATION_EMAIL_ORIGIN` and `VERCEL_ENV` makes the deployment mode invalid.

## Install {#install}

1. Pick the latest app release `v<x.y.z>`, get the same tag of the repository, and use its `deploy/` directory: `git clone --depth 1 --branch v<x.y.z> https://github.com/SinhyeokKang/malmoi.git`. Look up the image digest with `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v<x.y.z>` and pin it: `MALMOI_IMAGE=ghcr.io/sinhyeokkang/malmoi:v<x.y.z>@sha256:<digest>`.
2. Run `cd deploy && cp .env.example .env && chmod 600 .env` and fill in the values ([settings](#settings)). The file holds every key and password, so don't keep plain copies in a repository, a chat, or an unencrypted backup. Wrap any value containing `$` in single quotes.
3. Put the certificate in `deploy/certs/` (`chmod 600 privkey.pem`) and set `server_name` in `nginx/malmoi.conf`. Open only ports 80 and 443; don't publish the PostgreSQL or app ports.
4. Run `docker compose config -q` to catch syntax errors and missing required values, then `docker compose up -d`.
5. Check `docker compose ps`: postgres is healthy, migrate has exited with code 0, web is healthy, and proxy and scheduler are up. `docker compose logs migrate` shows the migrations applied with no bootstrap error. If web keeps restarting, the `preflight: <name> <reason>` lines in `docker compose logs web` name the problem ([troubleshooting](troubleshooting.md#startup-checks)).
6. Open `https://<domain>/`, sign in with GitHub and Google, create a project, and confirm the generated workflow file has `api-url: "https://<domain>"`. Upload a profile picture and send one invitation to a test address.
7. Make the first backup right away ([backup](operate.md#backup)). From this moment the six keys in `.env` are paired with the database: lose them and nobody's name or email can be recovered.

## What happens next {#next}

Keep backups on a schedule and update when a new release comes out ([update, back up, and restore](operate.md#update)). If web keeps restarting or sign-in breaks, start with [troubleshooting](troubleshooting.md#startup-checks).
