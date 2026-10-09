# Self-hosting

You can run your own Malmoi on one Linux server with Docker Compose. This section is the operator's guide to installing, running, and fixing it.

## What's supported {#support}

The supported setup is Docker Compose on a single Linux server: one app instance, PostgreSQL 17, a volume for uploaded pictures, and a nightly scheduler, behind an HTTPS reverse proxy (an nginx example is included) at the root of a domain. It's verified on `linux/amd64`.

- Every app release `v<x.y.z>` publishes an image at `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`. The image tag is the app tag; it's separate from the workflow action tag (`malmoi-i18n-push-vN`).
- Support covers the latest app release only, through GitHub Issues, on a best-effort basis.
- Not supported: Kubernetes, more than one app instance, high availability, zero-downtime or automatic updates, air-gapped networks, GitHub Enterprise, GitLab, password, SAML, or email sign-in, mail through anything other than Resend, moving accounts or projects between mal-moi.com and an installation, an admin console, a setup wizard, and white-labeling.

## Compared with mal-moi.com {#compare}

| | mal-moi.com | Your own server |
| --- | --- | --- |
| Infrastructure | Run for you | One Linux server with Docker Compose, PostgreSQL 17, an upload volume, a scheduler, and an HTTPS proxy that you run |
| Updates | Every release goes live on its own | You update one release at a time from the published images |
| Where data lives | Supabase (database, Tokyo) and Vercel (hosting, pictures) | Your server's database and upload volume |
| Sign-in and email | GitHub and Google sign-in, invitation emails through Resend | GitHub sign-in, Google sign-in, or both, through OAuth apps that you register; a GitHub App and a Resend domain that you register |
| Limits | Up to 3 active owned projects per person | The same, except for people listed in `OPERATOR_EMAILS` |
| Support | GitHub Issues | The latest release only, through GitHub Issues, best effort |
| Cost | Free | Free software; you pay for your server, domain, and Resend plan |
| Privacy policy | Malmoi's | Yours — `/privacy` redirects to it |
| Search engines and analytics | Public pages are indexed, with cookieless page-view counts | Every page is marked `noindex`, with no page-view counting |

- Sign-up is open on both. Anyone with an email address verified by a sign-in provider you turned on (GitHub or Google) can sign in and create projects without an invitation; nothing in the app blocks sign-up, and access to a project still comes only from its members list.
- The workflow file your installation generates always includes an `api-url` line with your address. Never remove it: without it, the workflow sends the project's push token to mal-moi.com.
- The nightly sync runs at 18:00 UTC on both; on your server, the scheduler container runs it.
- The Latest badge on `/changelog` shows the newest upstream release, which may be newer than yours. Your version is the tag in `MALMOI_IMAGE`.

## Before you install {#requirements}

- A Linux server with Docker Engine and the Compose plugin.
- A domain whose root you give to Malmoi (not a subpath), with A or AAAA records pointing at the server and ports 80 and 443 open.
- A certificate from a public certificate authority. GitHub Actions runners reject self-signed and private-CA certificates.
- An address that GitHub Actions can reach. Target repositories' workflows send their updates to your `MALMOI_ORIGIN` from GitHub-hosted runners, so an IP allowlist, firewall, or VPN in front of the server stops every update.
- A privacy policy page of your own, on another site. The [privacy materials](troubleshooting.md#privacy) list what the installation stores.

Target repositories' workflows run the upstream action tag `malmoi-i18n-push-v3` from `SinhyeokKang/malmoi`, and the project's `PUSH_TOKEN` and `GITHUB_TOKEN` go into that step. That tag can move regardless of the version you installed. If that's not acceptable, fork the upstream repository and point `uses:` at a commit SHA in your fork.
