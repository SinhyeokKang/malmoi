# Actualizar, hacer copias y restaurar

Actualiza una versión cada vez, guarda juntas las copias de la base de datos, las subidas y las claves, y rota claves sin perder datos.

## Actualiza a una versión nueva {#update}

Antes de iniciar la nueva versión o volver a la anterior, mantén web y el programador detenidos hasta que hayan pasado más de cinco minutos desde el inicio del último envío. No ejecutes procesos web antiguos y nuevos juntos: las versiones anteriores no reconocen la espera de recuperación de un envío sin confirmar. Cada envío tiene un límite de trabajo de cuatro minutos; si falla tras intentar modificar el repositorio, el envío y la sincronización esperan hasta cinco minutos desde su inicio. Puedes seguir editando. Revertir requiere un nuevo envío confirmado después de esa espera. Este límite no revierte solicitudes que GitHub ya haya recibido.

Actualiza una versión cada vez, en orden y solo a la última versión; las actualizaciones que saltan versiones aún no se han verificado. Las migraciones deben terminar antes de recrear web, para que una app antigua nunca lea una base de datos más nueva. El tráfico externo y el programador siguen apagados hasta que la versión nueva supere tus comprobaciones: si tienes que volver a la copia, no se pierde nada de lo que alguien guardó entretanto.

1. Detén la app y haz una copia con los comandos de [copia de seguridad](#backup), y sigue solo si imprimió `backup ok`. No ejecutes `docker compose up -d` después.
2. Compara el `deploy/` de la etiqueta nueva con el tuyo (deja `.env` como está), traslada los cambios de Compose, nginx y el programador, y cambia `MALMOI_IMAGE` en `.env` a la etiqueta y el digest nuevos. Si cambió `deploy/scheduler/`, ejecuta `docker compose build scheduler`.
3. Ejecuta `docker compose pull --ignore-buildable`. La imagen del programador se construye en local y no está en el registro, así que el comando falla sin `--ignore-buildable`.
4. Ejecuta `docker compose run --rm migrate`. Aplica las migraciones nuevas y vuelve a ejecutar el bootstrap, que se puede repetir sin riesgo. No cuentes con una ejecución de migrate de un `up` anterior.
5. Limita los puertos 80 y 443 a tu propia dirección IP en el firewall de tu proveedor de nube. Un firewall en el propio servidor no basta, porque los puertos publicados por Docker lo saltan.
6. Ejecuta `docker compose up -d --force-recreate --no-deps web proxy`. `--no-deps` evita que migrate se ejecute otra vez, y el programador sigue detenido.
7. Comprueba la versión nueva desde tu navegador: `docker compose ps` muestra web healthy, puedes iniciar sesión, se abre una pantalla de traducción, se ven las imágenes subidas y `docker compose logs web --since 5m` no tiene líneas `EACCES` ni `preflight:`. No publiques desde ella todavía.
8. Si todo funciona, ejecuta `docker compose up -d --no-deps scheduler` y vuelve a abrir los puertos 80 y 443 a todo el mundo. Las ejecuciones de workflow desde el paso 1 no llegaron al servidor; vuelve a lanzarlas con Run workflow.
9. Si algo va mal, mantén los puertos limitados. Vuelve al `MALMOI_IMAGE` anterior y a los archivos de `deploy/` de antes del paso 2, y repite los pasos 4 y 6, solo si se sabe que la versión anterior funciona con la base de datos nueva. Si no, restaura la copia del paso 1 — base de datos, imagen y claves juntas ([restaurar](#restore)). No hay migraciones hacia atrás.

## Haz una copia de seguridad {#backup}

Una copia son tres cosas tomadas con la app detenida: el volcado de la base de datos, el volumen de subidas y `.env` (las claves). Si alguna es de otro momento, la restauración no cuadra: las filas de la base de datos apuntan a archivos subidos y los valores cifrados solo se abren con las claves de ese momento. Guarda las copias fuera del checkout del repositorio y llévalas también fuera del servidor. Los permisos son 600 para archivos y 700 para directorios. Ejecuta los comandos como root desde el directorio `deploy/`: un contenedor escribe el archivo de subidas como root, y `/var/backups` requiere root. La parte entre paréntesis se detiene en el primer comando que falle; confía en la copia solo si termina con `backup ok`.

Ejecuta este bloque por separado: no lo envuelvas en `if`, `&&` ni `||`, porque pueden desactivar la parada ante errores.

```sh
( set -eu
  STAMP=$(date -u +%Y%m%dT%H%M%SZ); B=/var/backups/malmoi/$STAMP
  docker compose stop scheduler proxy web            # detiene el tráfico nuevo y las escrituras; solo queda postgres
  mkdir -p "$B"
  chmod 700 "$B"
  docker compose exec -T postgres pg_dump -U postgres -d malmoi -Fc > "$B/db.dump"
  docker compose exec -T postgres pg_restore -l < "$B/db.dump" > /dev/null   # el volcado se puede volver a leer
  docker run --rm -v malmoi_uploads:/data:ro -v "$B":/backup alpine:3.22 tar czf /backup/uploads.tar.gz -C /data .
  cp .env "$B/env"
  cp -r certs nginx "$B/"
  { echo "taken_at=$STAMP"; grep '^MALMOI_IMAGE=' .env
    docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'select count(*), max(migration_name) from _prisma_migrations'
  } > "$B/manifest.txt"
  (cd "$B" && sha256sum db.dump uploads.tar.gz env >> manifest.txt)
  chmod -R go-rwx "$B"                              # al final, para que cubra también el manifiesto
  echo "backup ok: $B"
)
```

- El manifiesto no tiene secretos: la hora, la imagen, el estado de las migraciones y las sumas de comprobación.
- En una copia rutinaria, vuelve a arrancarlo todo con `docker compose up -d`. Si la copia es el primer paso de una [actualización](#update), deja la app detenida.
- Solo el contenedor web escribe en el volumen de subidas. No lo montes en otro servicio ni dejes que otro proceso del servidor escriba en él: un segundo escritor podría hacer que web sirva archivos de fuera del volumen. La copia lo lee en solo lectura y la restauración escribe en él mientras web está detenido.
- Guarda las claves con el volcado. Sin la clave PII no se pueden recuperar correos ni nombres; sin la clave de tokens, tampoco las conexiones de GitHub. Después de rotar claves, conserva también las antiguas, porque las copias anteriores las necesitan.
- Si activaste `log_statement` (`ddl` o `all`) o `pg_stat_statements` con `track_utility`, el registro del servidor o las estadísticas guardan las sentencias `CREATE ROLE … PASSWORD`. La imagen estándar de postgres tiene ambas cosas desactivadas; si las activaste, desactívalas mientras se ejecuta el bootstrap.
- Una copia solo cuenta cuando una restauración a partir de ella ha funcionado. Prueba la restauración de abajo una vez en otro servidor, con el programador apagado. Allí limita todo lo que escriba en un repositorio real (Publicar, la sincronización nocturna) a un repositorio de prueba.

## Restaura en volúmenes vacíos {#restore}

Esto recupera una copia en un servidor nuevo o después de `docker compose down -v`. Las claves deben ser las de la copia; otras claves no abren los valores cifrados.

Los ensayos de restauración y las comprobaciones aisladas van en un servidor distinto del que está en producción. `deploy/compose.yaml` fija el nombre del proyecto de Compose, así que en el mismo servidor un directorio copiado sigue usando los volúmenes en producción `malmoi_pgdata` y `malmoi_uploads`: los pasos 2 y 4 se ejecutarían sobre tus datos reales, y `down -v` los borraría. Si tienes que usar el mismo servidor, añade `-p <another name>` (otro nombre de proyecto distinto del de producción) a cada comando de Compose, cambia el nombre del volumen del paso 4 a `<that name>_uploads` (ese nombre seguido de `_uploads`) y da otros puertos al proxy — si falta cualquiera de estas cosas, afectas a la instalación en producción.

Antes del paso 1, limita todos los puertos publicados del proxy a tu dirección IP en el cortafuegos de tu proveedor: los puertos 80 y 443 de la configuración incluida, o los otros puertos que hayas elegido para una restauración aislada. El cortafuegos del propio servidor no basta porque los puertos publicados por Docker lo eluden. Mantén la restricción hasta el paso 8, incluso al comprobar el inicio de sesión: las credenciales restauradas no deben permitir acceso público antes de la revisión.

1. Descarga el `deploy/` de la misma etiqueta, copia el `env` de la copia a `deploy/.env` y recupera `certs/` y `nginx/`. Deja `MALMOI_IMAGE` en el digest de la copia o en una etiqueta más nueva cuya compatibilidad hayas confirmado. Desde `deploy/`, ejecuta `read -r B` e introduce la ruta absoluta del directorio de la copia que quieres restaurar. Ejecuta `docker compose stop scheduler proxy web` y continúa solo si funciona.
2. Ejecuta `docker compose up -d postgres`. Con un volumen vacío, crea la base de datos y el rol de migración con el `MIGRATE_DB_PASSWORD` de `.env`.
3. Carga el volcado como rol de migración, sin propietarios ni permisos (el rol de migración pasa a ser el propietario y el paso 5 vuelve a conceder los permisos): `docker compose exec -T postgres pg_restore -U malmoi_migrate -d malmoi --no-owner --no-acl < "$B/db.dump"`. Lee el `errors ignored on restore: N` final. Solo se esperan mensajes `already exists` del esquema `public`; ante cualquier otro, detente en lugar de migrar una restauración parcial.
4. Restaura las subidas: `docker volume create malmoi_uploads && docker run --rm -v malmoi_uploads:/data -v "$B":/backup alpine:3.22 sh -c 'tar xzf /backup/uploads.tar.gz -C /data && chown -R 1000:1000 /data'` (el usuario de la app `node` es el uid 1000). A partir de aquí, cada comando de Compose avisa de que el volumen `already exists but was not created by Docker Compose`. Es inofensivo, y `down -v` también elimina el volumen.
5. Ejecuta `docker compose run --rm migrate`. Si el historial de migraciones restaurado está al día, no se migra nada, y el bootstrap crea el rol de ejecución, le concede sus permisos y vuelve a quitar el acceso al esquema a todos los demás. Hazlo siempre después de restaurar: si te lo saltas, la base de datos restaurada queda abierta a todos los roles.
6. Antes de arrancar web, cierra la sesión de todos con `docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d malmoi -c 'DELETE FROM "Session"'`. Continúa solo si funciona. Ejecuta `docker compose up -d --no-deps web proxy` y deja el programador apagado. Desde una dirección IP permitida, comprueba que puedes iniciar sesión, ver las traducciones de un proyecto y ver las imágenes subidas, y que `docker compose logs web` no tiene errores de descifrado (`credential-…`).
7. Mantén el acceso restringido mientras revisas lo que ha recuperado la copia. Los tokens personales, las apps conectadas, los tokens de push de los proyectos, los miembros eliminados y las invitaciones revocadas pueden volver a funcionar. Permite solo las direcciones IP de revisores de confianza en el cortafuegos de tu proveedor mientras los usuarios revocan las credenciales restauradas en la página de MCP y los propietarios eliminan miembros no deseados, cancelan invitaciones y rotan los tokens de push afectados. Contrasta todo con tus registros posteriores a la copia; si no puedes terminar la revisión, mantén cerrado el acceso público. Las ediciones y publicaciones posteriores a la copia se pierden; compáralas con los pull requests de los repositorios de destino.
8. Solo después de esas comprobaciones, si esta instalación pasa a ser la de producción, ejecuta `docker compose up -d --no-deps scheduler` y vuelve a abrir los puertos 80 y 443 a todo el mundo. En un servidor de prueba, deja el programador apagado y el acceso restringido.

## Rota las claves {#rotate-keys}

Las herramientas de claves se ejecutan dentro de la imagen de la app y se conectan como rol de migración mediante `DIRECT_URL`. Ningún servicio de Compose recibe a la vez las credenciales de administración de la base de datos y las seis claves, así que pasas `DIRECT_URL` desde tu shell. No escribas nunca una contraseña en una línea de comandos, donde la guardan el historial del shell y `ps`: mantenla en una variable del shell y pasa `-e DIRECT_URL` sin valor.

1. Haz una [copia de seguridad](#backup). Empareja la base de datos con las claves antiguas.
2. En `deploy/.env`, añade la clave nueva al llavero junto a la antigua y cambia `*_ACTIVE_KEY_ID` al nombre de la clave nueva. Para la clave de búsqueda, sustituye `EMAIL_LOOKUP_KEY` y `EMAIL_LOOKUP_KEY_ID`; la antigua no hace falta. Todos los valores nuevos deben ser distintos.
3. Bloquea el tráfico y detén las escrituras: `docker compose stop proxy scheduler web`. Sin el proxy no entra nada de fuera (navegadores, workflows de los repositorios de destino, agentes de programación, retornos de inicio de sesión), y sin el programador no hay sincronización nocturna. Solo queda postgres.
4. Pon `DIRECT_URL` en tu shell sin que quede en el historial: `read -rs P && export DIRECT_URL="postgresql://malmoi_migrate:${P}@postgres:5432/malmoi" && unset P`, escribiendo `MIGRATE_DB_PASSWORD` cuando lo pida. Omitir TLS solo está bien mientras el host sea exactamente `postgres`; para una base de datos en otro host, añade `?sslmode=verify-full`. Se rechazan otros parámetros de query.
5. Comprueba, aplica y verifica. `--no-deps` evita que migrate se ejecute:

   ```sh
   RUN='docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted'
   $RUN --mode=rotate-token                                              # solo comprobar
   $RUN --mode=rotate-token --apply --traffic-blocked --writers-drained
   $RUN --mode=rotate-pii   --apply --traffic-blocked --writers-drained
   $RUN --mode=reindex      --apply --traffic-blocked --writers-drained  # solo si cambiaste la clave de búsqueda
   $RUN --mode=verify
   ```

   Cada uno imprime una línea de JSON. `oldTokenKey` y `oldPiiKey` de `verify` deben ser 0 antes de arrancar la app con las claves nuevas. Un fallo imprime solo `credential-conversion-failed: keep traffic blocked`, sin valores; la línea de stderr justo anterior, `[credentials] … credential-env: missing environment variable <name>`, indica el motivo (un ID de clave activa vacío o que no está en su llavero). No vuelvas a arrancar la app con solo una parte de los datos convertida.
6. Ejecuta `unset DIRECT_URL` y después `docker compose up -d --force-recreate --no-deps web proxy scheduler` para que web lea el `.env` nuevo, y comprueba el inicio de sesión y las invitaciones.
7. Conserva las claves antiguas en el llavero. Las copias anteriores las necesitan.

Otros secretos y comprobaciones:

- `pnpm credentials:finalize:self-hosted` (la misma forma `RUN`, `--mode=backfill` por defecto) solo lee: confirma que se aplicó la migración de almacenamiento de credenciales e imprime `{"target":"self-hosted","pending":false,"applied":false}`. Una instalación nueva o una actualización normal siempre muestra `pending:false`, porque el servicio migrate aplica todas las migraciones. Su `--apply` ejecuta las migraciones directamente y no forma parte del procedimiento normal; las actualizaciones usan `docker compose run --rm migrate`.
- `APP_SIGNING_SECRET` y `AUTH_SECRET`: cambia `.env` y ejecuta `docker compose up -d --force-recreate web`. No hace falta bloquear el tráfico; solo los inicios de sesión y las conexiones de GitHub en curso en ese momento empiezan de nuevo. `CRON_SECRET` debe coincidir en web y en el programador, así que recrea ambos (`--force-recreate web scheduler`); si solo cambia uno, la sincronización nocturna recibe 401.
- Contraseñas de la base de datos: una vez creado el volumen, cambiar `MIGRATE_DB_PASSWORD` o `RUNTIME_DB_PASSWORD` solo en `.env` no hace nada. Abre `docker compose exec postgres psql -U postgres -d malmoi -X`, ejecuta `\password malmoi_app` (o `malmoi_migrate` — psql cifra la contraseña antes de enviarla, así que no llega al registro del servidor), luego actualiza `.env` y ejecuta `docker compose up -d --force-recreate web`. La contraseña nueva del rol de migración se aplica desde el siguiente `docker compose run --rm migrate`.

## Desactiva un proveedor de inicio de sesión {#sign-in-providers}

Deja al menos un proveedor activo. Desactivar uno oculta su botón y su fila en **Métodos de inicio de sesión**; no borra nada, y al volver a activarlo regresan los métodos conectados.

1. Pide a todos los que inician sesión con ese proveedor que conecten uno que siga activo: **Cuenta** → **Métodos de inicio de sesión** → **Conectar**. El otro proveedor tiene que verificar la misma dirección de correo.
2. Vacía los dos valores del proveedor en `deploy/.env` (por ejemplo `AUTH_GITHUB_ID=` y `AUTH_GITHUB_SECRET=`).
3. Ejecuta `docker compose up -d --force-recreate web` y comprueba que la pantalla de inicio de sesión muestra solo los proveedores activos.

Las sesiones ya abiertas siguen iniciadas, y esas personas aún pueden conectar un proveedor restante desde **Cuenta**. Quien solo tenía el proveedor que desactivaste ve “Tu método de inicio de sesión no está disponible aquí. Pide ayuda a tu administrador.” al iniciar sesión. Para dejarle entrar, rellena otra vez el par, recrea web, pídele que conecte otro proveedor y vuelve a desactivarlo.

## Qué pasa después {#next}

Después de una actualización o una restauración, busca líneas `preflight:` y errores de descifrado en el registro de web ([solución de problemas](troubleshooting.md#startup-checks)), y compara los campos guardados con tu política de privacidad ([materiales de privacidad](troubleshooting.md#privacy)).
