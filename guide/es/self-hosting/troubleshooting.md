# Solución de problemas y privacidad

Lee las comprobaciones de arranque y los registros cuando algo falle, y consulta lo que guarda tu instalación para tu propia política de privacidad.

## Web se reinicia una y otra vez {#startup-checks}

El contenedor web arranca con `pnpm preflight && next start`. Cuando la comprobación falla, escribe solo líneas `preflight: <name> <reason>` en stderr (nunca los valores) y termina; Compose lo reinicia una y otra vez y el programador no arranca. Léelas con `docker compose logs web`.

| Motivo | Significado | Dónde corregirlo |
| --- | --- | --- |
| `missing` | Falta un nombre obligatorio o está vacío | `deploy/.env`, o la lista `environment` de Compose para los nombres que rellena Compose |
| `incomplete-pair` | Un proveedor de inicio de sesión tiene solo uno de sus dos valores; la línea nombra el que falta (como `AUTH_GOOGLE_SECRET`) | Rellena el valor que falta, o vacía los dos para desactivar ese proveedor |
| `no-login-provider` | No hay ningún proveedor de inicio de sesión activo; dos líneas nombran `AUTH_GITHUB_ID` y `AUTH_GOOGLE_ID` | Rellena al menos un par completo ([configuración](install.md#settings)) |
| `invalid-format` | Formato incorrecto: `RESEND_API_KEY` debe empezar por `re_`, `INVITATION_EMAIL_FROM` debe ser `Nombre <dirección>` o una dirección, `GITHUB_APP_SLUG` es `[a-z0-9-]`, `AUTH_TRUST_HOST` debe ser `true` | Ese valor |
| `malformed` · `not-https` · `userinfo` | Un problema de forma en `MALMOI_ORIGIN` o `MALMOI_PRIVACY_URL`: espacios, barras invertidas o una URL ilegible, `http://`, `user:pw@` | Una URL `https://` sin datos de usuario |
| `path` · `query` · `fragment` · `ipv6` · `idn` | Solo `MALMOI_ORIGIN` (una ruta o query en la URL de privacidad está bien): una ruta, `?`, `#`, un literal IPv6, un dominio no ASCII | `MALMOI_ORIGIN=https://<domain>` |
| `auth-url-mismatch` | `AUTH_URL` no coincide con `MALMOI_ORIGIN` (se ignora una barra final) | No sobrescribas el valor que fija Compose |
| `privacy-cycle` | `MALMOI_PRIVACY_URL` es el `/privacy` de esta instalación, que redirige a sí mismo | Apúntalo a tu política en otro sitio |
| `relative-path` | `MALMOI_UPLOAD_DIR` no es una ruta absoluta | Compose usa `/data/uploads` |
| `not-found` | La ruta de subidas no existe (el volumen no está montado) | El volumen `uploads` de Compose |
| `not-directory` | La ruta existe pero es un archivo o un enlace simbólico | El destino del montaje |
| `not-writable` | El usuario de la app (`node`, uid 1000) no puede escribir ahí | Propietario y permisos del volumen (`chown -R 1000:1000`) |
| `present` | `INVITATION_EMAIL_ORIGIN` está definido; la instalación lo obtiene de `MALMOI_ORIGIN` | Elimina la variable |
| `vercel-env-present` | `VERCEL_ENV` está definido junto con `MALMOI_ORIGIN`, lo que invalida el modo de despliegue | Elimina `VERCEL_ENV` |

## Migrate se detiene con un error {#migrate}

Lee `docker compose logs migrate`. Una única línea `bootstrap: <code>` viene de las comprobaciones de `deploy/bootstrap.sql`:

- `runtime-role-missing`, `migrate-role-missing`, `password-missing`, `password-empty`: falta una variable como `RUNTIME_DB_PASSWORD`.
- `runtime-role-is-migrate-role`: los dos nombres de rol son iguales.
- `runtime-role-privileged`: un rol de ejecución existente es superusuario o tiene CREATEROLE, CREATEDB o BYPASSRLS, lo que permitiría a la app funcionar con derechos de administración.
- `cannot-create-role`: el rol no existe y el rol que ejecuta el bootstrap no puede crear roles; pasa cuando el volumen no estaba vacío y el script del primer arranque nunca se ejecutó.

Un error de conexión de Prisma antes de eso suele significar que `MIGRATE_DB_PASSWORD` no coincide con el valor usado al crear el volumen. El script del primer arranque solo se ejecuta con un volumen vacío; cambia la contraseña con `\password` como en [rotar las claves](operate.md#rotate-keys).

## No llegan los correos de invitación {#email}

- “El correo electrónico no está disponible ahora. Vuelve a intentarlo más tarde.” antes de crear la invitación es un problema de configuración. El registro del servidor tiene `[invite-email] config unavailable reason=<code>`: `missing` (sin clave o remitente), `invalid-from` (forma del remitente) o `invalid-origin` (`MALMOI_ORIGIN` no es válido).
- Un rechazo después de crear la invitación viene de Resend. El registro tiene una línea, `[invite-email] batch <rejected|unknown> <http-NNN|network> count=N`, sin direcciones ni claves. Busca la misma solicitud a esa hora en Emails del panel de Resend. Normalmente `http-401` es una clave de API incorrecta o revocada, `http-403` un dominio de envío sin verificar o un remitente fuera del dominio de la clave, `http-422` un formato de dirección y `http-429` el límite de Resend. Con `unknown` (`network`, un tiempo de espera agotado o un 5xx), algunos mensajes pueden haber salido, y enviar de nuevo caduca el enlace anterior.
- La comprobación de arranque solo mira la forma de estos valores. Una clave que Resend rechaza aparece con la primera invitación, por eso las comprobaciones de la instalación envían una.

## Detrás del proxy {#proxy}

- Un `redirect_uri` que no coincide tras iniciar sesión, un error que te pide volver a intentarlo más tarde o formularios que no se envían significan que el host original no llegó a la app. El ejemplo de nginx reenvía `Host $host`. Si `MALMOI_ORIGIN` tiene un puerto no predeterminado (como `:8443`), `$host` quita el puerto: cambia `Host` y `X-Forwarded-Host` en `deploy/nginx/proxy-common.conf` a `$http_host` y haz que la redirección de 80 → 443 (`return 301 https://$host…`) conserve el puerto. Con cualquier otro proxy, el `Host` que recibe la app debe coincidir con el host de `MALMOI_ORIGIN`, más su puerto si no es 443. Los errores de inicio de sesión aparecen en `docker compose logs web` como `[auth] <type>`, con el tipo de error de Auth.js.
- Una actualización grande muestra 504 en el workflow del repositorio de destino aunque el servidor terminó de cargarla: el `proxy_read_timeout` de nginx (60 segundos por defecto) cerró la conexión mientras la app seguía trabajando. Revisa la actividad del proyecto en Registros y vuelve a lanzar el workflow. El cuerpo de las solicitudes está limitado a 5 MB (`client_max_body_size`).
- Con un balanceador de carga o una CDN delante de nginx, `$binary_remote_addr` es la dirección de ese dispositivo, así que todos comparten un único contador de límite de solicitudes y `/api/images/` y `/oauth/authorize` responden 429. Configura `real_ip_header` y `set_real_ip_from` para ese dispositivo.
- Si `/api/images/*` responde 404, revisa primero los permisos del volumen de subidas (`EACCES` en el registro de web).

## Sincronización nocturna {#nightly}

Ejecútala una vez ahora con `docker compose exec scheduler /usr/local/bin/nightly-pull`. `curl: (22) … 401` en el registro del programador significa que `CRON_SECRET` no coincide entre web y el programador (recrea ambos). El resultado es la línea de resumen `[pull] targets= published= …` en `docker compose logs web`. El programador solo registra los errores HTTP como fallos y no lo intenta de nuevo ni se pone al día más tarde.

## Alguien no puede iniciar sesión {#sign-in}

“Tu método de inicio de sesión no está disponible aquí. Pide ayuda a tu administrador.” en la pantalla de inicio de sesión significa que esa persona se registró con un proveedor que desactivaste y no tiene otro método de inicio de sesión conectado. Malmoi no le crea una segunda cuenta. Vuelve a activar ese proveedor, deja que inicie sesión y conecte un proveedor que siga activo, y luego desactívalo otra vez ([desactiva un proveedor de inicio de sesión](operate.md#sign-in-providers)).

## GitHub {#github}

Si una cuenta nueva no puede instalar la GitHub App, comprueba que la app sea Public. Si un repositorio aparece como no instalado, revisa Repository access en esa instalación.

## Materiales para tu política de privacidad {#privacy}

La política de privacidad de tu instalación la escribes tú. Su `/privacy` redirige a `MALMOI_PRIVACY_URL`, y la política de mal-moi.com no describe tu instalación, así que no la copies. Abajo tienes lo que la instalación guarda de verdad, qué cookies usa, adónde envía datos y cómo eliminar una cuenta. La tabla sigue el propio registro de campos guardados de la app (`lib/privacy/collected.ts`), que cambia cuando la app empieza a guardar algo nuevo: vuelve a compararla en cada actualización.

### Campos guardados {#stored-fields}

Significado de las columnas — recopilado: valores que hay que declarar como recopilados; conservación: valores que fijan cuánto tiempo se guarda algo; cookies: valores que lleva una cookie; no personal: valores que no describen a una persona (trabajo de traducción y datos internos de las filas). Los correos, nombres, imágenes y tokens de GitHub se guardan con cifrado de sobre (las claves están fuera de la base de datos, en `.env`), y el índice de correo es un HMAC. Las sesiones, las invitaciones y los tokens de agentes de programación solo se guardan como hashes.

| Modelo | Qué es | Recopilado | Conservación | Cookies | No personal |
| --- | --- | --- | --- | --- | --- |
| `User` | Una persona que inició sesión. El nombre, el correo y la imagen vienen de GitHub o Google y se cifran con la clave PII; el índice de correo es un HMAC de la dirección. Los tres ajustes de visualización y la hora de lectura de la Bandeja de entrada son ajustes guardados en la cuenta | `id`, `name`, `email`, `emailLookup`, `emailVerified`, `image`, `createdAt`, `uiLocale`, `timeZone`, `colorScheme`, `attentionSeenAt` | — | — | — |
| `Account` | Un método de inicio de sesión vinculado (GitHub o Google): el ID de cuenta del proveedor, más el token de usuario de la GitHub App recibido al conectar un repositorio (cifrado con la clave de tokens) y su caducidad | `userId`, `installRequestedAt`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at` | — | — | `type` |
| `Session` | Una sesión iniciada. Solo se guarda un resumen del valor de la cookie; caduca 24 horas después de la última actividad | — | `expires` | `sessionToken`, `userId` | — |
| `VerificationToken` | Comprobaciones para vincular un método de inicio de sesión y para cerrar otras sesiones. `identifier` contiene el ID de usuario y el ID de cuenta del proveedor en una cadena JSON. De 5 a 10 minutos | `identifier`, `token` | `expires` | — | — |
| `ProjectMember` | Pertenencia a un proyecto y rol | `userId`, `role`, `createdAt`, `updatedAt` | — | — | `projectId` |
| `ProjectInvitation` | Una invitación. La dirección se cifra (clave PII) con un índice; el token es un hash. Caduca a los 7 días, pero la fila, dirección incluida, se queda | `createdAt`, `email`, `emailLookup`, `role`, `tokenHash`, `acceptedAt`, `invitedBy` | `expiresAt` | — | `id`, `projectId` |
| `ApiToken` | Un token personal para agentes de programación: su hash, los permisos y proyectos que eligió la persona y cuándo se usó | `userId`, `grants`, `allProjects`, `projectIds`, `tokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | — |
| `OAuthConnection` | Un agente de programación conectado (Claude Code, Codex y otros): el nombre y la dirección que dio la app, hashes de tokens, permisos y proyectos, y cuándo se usó | `id`, `userId`, `clientId`, `clientName`, `redirectUri`, `grants`, `allProjects`, `projectIds`, `accessTokenHash`, `accessExpiresAt`, `refreshTokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | `issuer`, `resource` |
| `OAuthRefreshHistory` | Hashes de tokens de actualización que una conexión ya usó. Se eliminan con la conexión | `tokenHash`, `connectionId`, `usedAt` | — | — | — |
| `OAuthCode` | Una instantánea de intercambio de 60 segundos justo después del consentimiento. Se elimina al intercambiarse | `codeHash`, `clientId`, `clientName`, `redirectUri`, `userId`, `grants`, `allProjects`, `projectIds`, `connectionExpiresAt`, `usedAt` | `expiresAt` | — | `requestId`, `codeChallenge`, `issuer`, `resource` |
| `Translation` | Los valores de traducción no son datos personales; solo el último editor y la hora señalan a una persona | `updatedAt`, `updatedBy` | — | — | `id`, `projectId`, `surfaceId`, `keyId`, `localeCode`, `value`, `description`, `placeholders`, `needsReview`, `pendingEditToken` |
| `SyncRun` | Registros de sincronizaciones y publicaciones: quién lo pidió y cuándo | `trigger`, `startedAt`, `finishedAt`, `requestedBy` | — | — | `id`, `projectId`, `status`, `errorCode`, `prUrl`, `changed`, `changedValues`, `warnings`, `withheld` |
| `ProjectEvent` | La actividad de Registros: quién actuó y cuándo, con etiquetas de miembros enmascaradas y los valores de traducción antes y después en `payload`. Nunca se elimina | `occurredAt`, `finishedAt`, `actorKind`, `actorUserId`, `payload`, `searchText` | — | — | `id`, `ref`, `projectId`, `kind`, `subtype`, `result`, `surfaceIds`, `surfaceScope`, `syncRunId`, `runToken` |

- Modelos con solo campos no personales: `Project`, `TranslationSurface`, `Locale`, `StringKey`, `KeyRef`, `DeliveryConfirmation`, `TranslationBaseline`, `OAuthAuthorizationRequest`. Contienen coordenadas de repositorio, claves y estado de traducción, sin columnas de creador.
- Los valores de traducción pertenecen al proyecto y no describen a nadie; la autoría está solo en las filas de `Translation` y `ProjectEvent` de arriba.
- Una foto de perfil subida se vuelve a codificar como WebP de hasta 192 px (el original y sus metadatos se descartan) y se guarda en `avatars/<userId>/` dentro del volumen de subidas. Las imágenes de GitHub y Google se guardan como URL, y el navegador las carga desde allí.
- No hay recuento de visitas. Las llamadas externas de la app son solo los destinatarios de abajo.
- El registro de acceso del ejemplo de nginx guarda la dirección del cliente, la hora, el método, la ruta, el estado, el tamaño, la duración y el navegador. Enmascara el token de las rutas de invitación y de enlace de inicio de sesión (`/invite/<redacted>`, `/signin/link/<redacted>`) y omite las query strings y el referrer. El registro de errores de nginx sigue guardando la línea de solicitud completa y el referrer cuando no se puede llegar a la app, así que trata los registros del proxy con el mismo cuidado que los tokens. Describe en tu política los registros de tu proxy y tu balanceador de carga.

### Cookies {#cookies}

Los prefijos `__Host-` y `__Secure-` se añaden con HTTPS (los nombres de abajo van sin ellos). No hay cookies de publicidad, analítica ni seguimiento. Solo `malmoi-sidebar-collapsed` es legible por scripts; todas las demás son HttpOnly.

| Cookie | Duración | Para qué sirve |
| --- | --- | --- |
| `authjs.session-token` | 24 horas después de la última actividad | Mantiene tu sesión iniciada |
| `authjs.csrf-token` | Hasta cerrar el navegador | Confirma que una solicitud de inicio de sesión empezó en este sitio |
| `authjs.callback-url` | Hasta cerrar el navegador | La página a la que volver tras iniciar sesión |
| `authjs.state` · `authjs.pkce.code_verifier` | 15 minutos | Demuestra que la respuesta de un proveedor pertenece al inicio de sesión que empezó |
| `malmoi-gh-state` | 10 minutos | La misma prueba para conectar un repositorio |
| `malmoi-account-connect` · `malmoi-connect-state` · `malmoi-login-link` · `malmoi-link-state` · `malmoi-session-revocation` · `malmoi-revocation-state` | De 5 a 15 minutos | La misma prueba para añadir un método de inicio de sesión a la misma dirección y para cerrar otras sesiones |
| `malmoi-ui-locale` · `malmoi-color-scheme` | 1 año después de la última elección o inicio de sesión | El idioma de la interfaz y el tema elegidos en este navegador, también sin sesión. Al iniciar sesión se copian los valores de la cuenta |
| `malmoi-sidebar-collapsed` | 1 año después del último cambio | Si la barra lateral está contraída |

La zona horaria se guarda solo en la cuenta, no en una cookie.

### Destinatarios {#recipients}

La instalación envía datos a tres servicios. Supabase y Vercel (alojamiento, almacenamiento de archivos, recuento de visitas) de mal-moi.com no forman parte de ella.

| Destinatario | Qué se envía | Por qué |
| --- | --- | --- |
| GitHub | El perfil y el correo verificado recibidos al iniciar sesión, cuando el inicio de sesión con GitHub está activo. Lecturas de repositorios y escrituras de ramas, commits y pull requests mediante tu GitHub App (los commits los hace la app, no una persona). El token de usuario de la GitHub App de una persona conectada solo se usa para leer | Inicio de sesión · conectar repositorios y Publicar |
| Google | El perfil y el correo verificado de quienes inician sesión con Google, cuando el inicio de sesión con Google está activo | Inicio de sesión |
| Resend | La dirección invitada y el mensaje (enlace de invitación, nombre del proyecto, dirección de la imagen del proyecto, rol — no quién lo envió). El seguimiento de aperturas y clics está desactivado | Correos de invitación. Resend guarda los registros de envío durante el periodo de tu plan (30 días en Free); revisa tu plan e inclúyelo en tu política |

- El navegador carga las fotos de perfil de GitHub y Google directamente desde esos servicios.
- El logotipo y las imágenes de proyecto de los correos de invitación se cargan desde tu `MALMOI_ORIGIN`.
- Cuando alguien conecta un agente de programación, lo que el agente lee (traducciones, actividad, miembros, un token de push si lo pide) va a ese agente y a su servicio de IA. Lo elige y lo gestiona esa persona; la instalación no envía nada allí por su cuenta. Para mostrar el nombre de la app en la pantalla de consentimiento, Malmoi lee la descripción pública en la dirección que dio la app, sin datos de usuario en la solicitud.
- `/changelog` lee las GitHub Releases del repositorio original, sin datos de usuario en la solicitud.

### Elimina una cuenta {#delete-account}

No hay una pantalla de autoservicio para eliminar cuentas, así que este es un procedimiento manual para solicitudes de acceso, rectificación y supresión. Las filas de pertenencia y las invitaciones que envió la persona impiden eliminar su fila `User`, así que van primero. Al eliminar después la fila `User` desaparecen sus métodos de inicio de sesión, sesiones, tokens personales y agentes conectados, y se desvincula de los registros de sincronización y de la actividad. Los valores de traducción se quedan; solo se quita el vínculo con su autor.

1. Haz primero una [copia de seguridad](operate.md#backup): la eliminación no se puede deshacer. Cómo confirmas la identidad de la persona lo decide tu política.
2. Busca la cuenta. Los correos están cifrados, así que calcula en su lugar el índice de búsqueda (un HMAC). La dirección entra por el entorno, no por la línea de comandos (`EMAIL_LOOKUP_KEY` ya está en el contenedor web), y `PROJECT_IDS` enumera los proyectos cuyas invitaciones busca el paso 3. Sin proyectos queda vacío y solo se imprime la línea `user`:

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

   Usa el valor de la línea `user` en `SELECT id FROM "User" WHERE "emailLookup" = '<hmac>';`. Ese `id` es el `:uid` de abajo. Si no hay ninguna fila, no existe una cuenta con esa dirección (si estás cambiando la clave de búsqueda, ejecuta antes el reindex y vuelve a intentarlo).
3. Las líneas `invitation:<projectId>` son los índices de las invitaciones pendientes enviadas a esta persona, una por proyecto, porque cada proyecto indexa las direcciones de invitación de forma distinta.
4. Elimina la foto de perfil subida: `docker compose exec web rm -rf /data/uploads/avatars/<uid>` (si no hay directorio, no hay foto).
5. Elimina en una sola transacción. Conéctate con `docker compose exec postgres psql -U postgres -d malmoi -v ON_ERROR_STOP=1 -v uid=<uid>`, ejecuta las sentencias (en lugar de `<invitation indexes from step 3>`, pon los índices del paso 3 entre comillas simples y separados por comas) y revisa cada recuento de filas antes de `COMMIT` (usa `ROLLBACK` si algo no cuadra):

   ```sql
   BEGIN;
   -- detente si esta persona es el último propietario de un proyecto: cualquier fila aquí significa ROLLBACK y transferir la propiedad antes
   SELECT m."projectId" FROM "ProjectMember" m
    WHERE m."userId" = :'uid' AND m."role" = 'OWNER'
      AND NOT EXISTS (SELECT 1 FROM "ProjectMember" o WHERE o."projectId" = m."projectId" AND o."role" = 'OWNER' AND o."userId" <> m."userId");
   DELETE FROM "ProjectMember" WHERE "userId" = :'uid';
   DELETE FROM "ProjectInvitation" WHERE "invitedBy" = :'uid';                  -- invitaciones que envió esta persona
   DELETE FROM "ProjectInvitation" WHERE "acceptedAt" IS NULL AND "emailLookup" IN ('<invitation indexes from step 3>');  -- invitaciones pendientes para esta persona
   DELETE FROM "VerificationToken" WHERE "identifier" LIKE '%"' || :'uid' || '"%';   -- comprobaciones de vinculación y cierre de sesión
   UPDATE "Translation" SET "updatedBy" = NULL WHERE "updatedBy" = :'uid';       -- sin clave foránea, se desvincula a mano
   DELETE FROM "User" WHERE "id" = :'uid';                                       -- cascada a Account, Session, ApiToken, OAuth*; SyncRun y ProjectEvent pasan a NULL
   COMMIT;
   ```

6. Lo que queda: los valores de traducción (el trabajo del proyecto — solo desaparece el vínculo con el autor), las etiquetas enmascaradas de la actividad (`ProjectEvent` pierde el vínculo con quien actuó, pero no se elimina), las invitaciones a esta persona que ya se aceptaron (las sentencias de arriba solo eliminan las pendientes; la dirección cifrada se queda, así que menciónalo en tu política o quita la condición `"acceptedAt" IS NULL AND`), los registros de envío de Resend (caducan según el calendario de Resend) y las copias de seguridad (hasta que las descartes — menciónalo en tu política).
