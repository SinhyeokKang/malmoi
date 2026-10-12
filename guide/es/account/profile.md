# Cuenta

Gestiona tu perfil, tus métodos de inicio de sesión, las conexiones con GitHub y GitLab y tus sesiones activas en Cuenta.

Antes de empezar: abre el menú de tu avatar, arriba a la derecha, y elige **Cuenta**.

## Actualiza tu perfil {#profile}

1. Edita tu nombre y elige **Guardar**. **Guardado** confirma el cambio.
2. Para cambiar tu foto, elige **Subir** y selecciona un PNG o JPEG de hasta 3 MB. Tu avatar se actualiza cuando la subida termina bien.

La foto se redimensiona automáticamente y el archivo original no se conserva.

![La página Cuenta con las secciones de perfil, métodos de inicio de sesión y GitHub App](/guide/account.webp "Actualiza tu perfil y tus métodos de inicio de sesión en Cuenta.")

## Gestiona los métodos de inicio de sesión {#sign-in-methods}

Elige **Conectar** en otro proveedor e inicia sesión con la misma dirección de correo electrónico. No se puede quitar el último método; Cuenta indica **Es tu única forma de iniciar sesión.**

## Gestiona la conexión con GitHub {#github-connection}

Los propietarios de proyectos usan la sección **GitHub App** para autorizar la selección de repositorios y gestionar el acceso de la instalación. Es independiente del inicio de sesión. Los traductores pueden omitir esta sección.

Si la autorización caduca, elige **Volver a autorizar la GitHub App**. Los proyectos que ya están conectados siguen sincronizándose mientras renuevas esta autorización.

## Gestiona el token de GitLab {#gitlab-token}

Los propietarios de proyectos que usan repositorios de GitLab.com conectan un token de acceso personal de GitLab en la sección **GitLab PAT**. Los traductores pueden omitir esta sección.

1. Si no hay ningún token conectado, elige **Crear un token en GitLab**, crea allí un token de acceso personal clásico con el alcance `api`, pégalo en **Token de acceso personal** y elige **Conectar**.
2. Revisa la insignia: **Conectado**, **Caduca pronto** cuando el token caduca en 14 días o menos, o **Caducado**. La sección también muestra la fecha de caducidad y cuántos proyectos usan esta conexión.
3. Para renovar el token, elige **Reemplazar token** y pega un token nuevo de la misma cuenta de GitLab. Los proyectos que usan esta conexión pasan a usarlo al instante. Un token de otra cuenta de GitLab se rechaza; para cambiar de cuenta, desconecta primero.

Al elegir **Desconectar**, Malmoi borra el token guardado. Los proyectos que lo usaban muestran **Desconectado** y dejan de sincronizar y publicar hasta que un propietario del proyecto los vuelva a conectar en **Configuración** del proyecto, y **Registros** anota que se quitó la conexión. Desconectar en Malmoi no revoca el token en GitLab; revócalo allí si ya no lo necesitas.

Los proyectos que conectas publican con tu token, así que sus commits y merge requests en GitLab quedan a nombre de tu cuenta de GitLab.

## Cierra sesiones {#sessions}

1. Elige **Cerrar sesión en todas partes**.
2. Usa el botón de confirmación del cuadro de diálogo, Continuar con GitHub o Continuar con Google. Malmoi elige uno de tus métodos de inicio de sesión conectados; sigue su confirmación de inicio de sesión.

Esto también cierra la sesión del dispositivo que estás usando.

## Qué pasa después {#next}

Vuelve a un proyecto después de actualizar Cuenta.
