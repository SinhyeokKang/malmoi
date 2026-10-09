# Instalar

Registra los servicios externos con tus propias cuentas, completa la configuración e inicia Malmoi con Docker Compose.

## Registra los servicios externos {#external-apps}

Crea cada servicio de la tabla con tus propias cuentas. No reutilices las apps OAuth, la GitHub App, el dominio de Resend ni las claves de mal-moi.com. `<ORIGIN>` es tu `MALMOI_ORIGIN`.

| Qué | Dónde | Configuración | Valores para `deploy/.env` |
| --- | --- | --- | --- |
| Dominio HTTPS | DNS y certificado | Raíz del dominio · A/AAAA al servidor · puertos 80/443 abiertos · certificado de CA pública como `deploy/certs/fullchain.pem` y `privkey.pem` · `server_name` en `deploy/nginx/malmoi.conf` (dos sitios) con el dominio | `MALMOI_ORIGIN=https://<domain>` — sin ruta, query ni datos de usuario; se rechazan literales IPv6 y dominios no ASCII |
| GitHub OAuth App (inicio de sesión) | GitHub Developer settings → OAuth Apps | Homepage `<ORIGIN>` · Authorization callback `<ORIGIN>/api/auth/callback/github` | `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` |
| GitHub App (leer y escribir repositorios, conectar cuentas) | GitHub Developer settings → GitHub Apps | Public (si no, solo la cuenta propietaria puede instalarla) · Callback URL `<ORIGIN>/api/github/callback` · Request user authorization (OAuth) during installation activado · Redirect on update activado · Setup URL vacío · Webhook desactivado · Permisos: Contents lectura y escritura, Pull requests lectura y escritura (Metadata lectura es automático) | `GITHUB_APP_ID` (un número) · `GITHUB_APP_CLIENT_ID` (`Iv…`, distinto del ID) · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY` (el PEM en una línea, con los saltos escritos como `\n`) |
| Google OAuth | Google Cloud Console → pantalla de consentimiento de OAuth y Credenciales | Pantalla de consentimiento External e In production (Internal bloquea a todos fuera de tu organización con `403 org_internal`, y el modo de prueba solo admite a los usuarios de prueba registrados) · ámbitos `email` y `profile` · URI de redirección autorizada `<ORIGIN>/api/auth/callback/google` · URL de la política de privacidad = `MALMOI_PRIVACY_URL` | `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` |
| Dominio de envío de Resend (correos de invitación, obligatorio) | Resend → Domains y API Keys | Dominio verificado (SPF y DKIM) · seguimiento de aperturas y clics desactivado (el seguimiento reescribe los enlaces de invitación) · TLS Enforced recomendado · una clave de API con Sending access limitada a ese dominio | `RESEND_API_KEY` · `INVITATION_EMAIL_FROM="Malmoi <invite@<verified domain>>"` |

- Los permisos de la GitHub App son el conjunto mínimo que necesitan las llamadas de la app. En cada instalación, la lista de repositorios de Repository access decide a qué repositorios llega Malmoi; un repositorio que no esté en ella aparece como no instalado.
- Los dos proveedores de inicio de sesión son obligatorios. La app siempre ofrece GitHub y Google.

## Completa la configuración {#settings}

Todos los valores van en `deploy/.env`. El contenedor web comprueba los nombres de la tabla en cada arranque y no arranca si falta alguno o tiene un formato incorrecto ([comprobaciones de arranque](troubleshooting.md#startup-checks)). Compose rellena algunos por sí mismo; no los toques.

| Nombre | Lo rellena | Notas |
| --- | --- | --- |
| `MALMOI_ORIGIN` | Tú | El mismo host que `server_name` en el archivo de nginx |
| `MALMOI_PRIVACY_URL` | Tú | HTTPS, sin datos de usuario y que no sea el `/privacy` de esta instalación |
| `MALMOI_UPLOAD_DIR` | Compose (`/data/uploads`) | Ahí se monta el volumen `uploads`; la comprobación confirma que existe y admite escritura |
| `AUTH_URL` · `AUTH_TRUST_HOST` | Compose (`${MALMOI_ORIGIN}` · `true`) | `AUTH_URL` debe ser igual a `MALMOI_ORIGIN` |
| `AUTH_SECRET` | Tú | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` · `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | Tú | Los dos proveedores son obligatorios |
| `APP_SIGNING_SECRET` | Tú | `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` — distinto de `AUTH_SECRET` y de las claves de cifrado |
| `DATABASE_URL` | Compose | El rol de ejecución `malmoi_app` con `RUNTIME_DB_PASSWORD` |
| `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` | Tú | El slug es `[a-z0-9-]`. Sin él, los usuarios nuevos no pueden instalar la GitHub App desde Malmoi |
| `CRON_SECRET` | Tú | Los contenedores web y del programador reciben el mismo valor — `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEYS` · `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` · `PII_ENCRYPTION_KEYS` · `PII_ENCRYPTION_ACTIVE_KEY_ID` · `EMAIL_LOOKUP_KEY` · `EMAIL_LOOKUP_KEY_ID` | Tú | Pon el JSON del llavero entre comillas simples: `TOKEN_ENCRYPTION_KEYS='{"k1":"<32-byte base64>"}'`. Los tres valores de clave deben ser distintos (`openssl rand -base64 32` para cada uno) |
| `RESEND_API_KEY` · `INVITATION_EMAIL_FROM` | Tú | Empieza por `re_` · `Nombre <dirección>` |
| `OPERATOR_EMAILS` | Tú (opcional) | Direcciones de correo completas separadas por comas; vacío significa sin operadores |

Compose también lee `MALMOI_IMAGE`, `POSTGRES_PASSWORD`, `MIGRATE_DB_PASSWORD` y `RUNTIME_DB_PASSWORD`; `deploy/.env.example` los describe. Haz que las tres contraseñas de la base de datos sean distintas, cada una con `openssl rand -hex 32`, porque van tal cual en las URL de conexión. No añadas `INVITATION_EMAIL_ORIGIN`, `VERCEL_ENV` ni `BLOB_*`: el contenedor web solo recibe los nombres que lista Compose, y si editas Compose para pasarlos, la comprobación de arranque rechaza `INVITATION_EMAIL_ORIGIN` y `VERCEL_ENV` invalida el modo de despliegue.

## Instala {#install}

1. Elige la última versión de la app `v<x.y.z>`, descarga la misma etiqueta del repositorio y usa su directorio `deploy/`: `git clone --depth 1 --branch v<x.y.z> https://github.com/SinhyeokKang/malmoi.git`. Consulta el digest de la imagen con `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v<x.y.z>` y fíjalo: `MALMOI_IMAGE=ghcr.io/sinhyeokkang/malmoi:v<x.y.z>@sha256:<digest>`.
2. Ejecuta `cd deploy && cp .env.example .env && chmod 600 .env` y completa los valores ([configuración](#settings)). El archivo contiene todas las claves y contraseñas, así que no guardes copias en texto plano en un repositorio, un chat o una copia de seguridad sin cifrar. Pon entre comillas simples cualquier valor que contenga `$`.
3. Coloca el certificado en `deploy/certs/` (`chmod 600 privkey.pem`) y ajusta `server_name` en `nginx/malmoi.conf`. Abre solo los puertos 80 y 443; no publiques los puertos de PostgreSQL ni de la app.
4. Ejecuta `docker compose config -q` para detectar errores de sintaxis y valores obligatorios que falten, y después `docker compose up -d`.
5. Revisa `docker compose ps`: postgres está healthy, migrate terminó con código 0, web está healthy, y proxy y scheduler están en marcha. `docker compose logs migrate` muestra las migraciones aplicadas sin errores de bootstrap. Si web se reinicia una y otra vez, las líneas `preflight: <name> <reason>` de `docker compose logs web` indican el problema ([solución de problemas](troubleshooting.md#startup-checks)).
6. Abre `https://<domain>/`, inicia sesión con GitHub y con Google, crea un proyecto y confirma que el archivo de workflow generado tiene `api-url: "https://<domain>"`. Sube una foto de perfil y envía una invitación a una dirección de prueba.
7. Haz la primera copia de seguridad enseguida ([copia de seguridad](operate.md#backup)). Desde este momento, las seis claves de `.env` forman pareja con la base de datos: si las pierdes, no se puede recuperar el nombre ni el correo de nadie.

## Qué pasa después {#next}

Haz copias de seguridad periódicas y actualiza cuando salga una versión nueva ([actualizar, hacer copias y restaurar](operate.md#update)). Si web se reinicia una y otra vez o el inicio de sesión falla, empieza por [solución de problemas](troubleshooting.md#startup-checks).
