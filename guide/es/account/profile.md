# Cuenta

Gestiona tu perfil, tus métodos de inicio de sesión, las conexiones con GitHub y GitLab y tus sesiones activas en Cuenta.

Antes de empezar: abre el menú de tu avatar, arriba a la derecha, y elige **Cuenta**.

## Actualiza tu perfil {#profile}

1. Edita tu nombre y elige **Guardar**. **Guardado** confirma el cambio.
2. Para cambiar tu foto, elige **Subir** y selecciona un PNG o JPEG de hasta 3 MB. Tu avatar se actualiza cuando la subida termina bien.

La foto se redimensiona automáticamente y el archivo original no se conserva. Malmoi no obtiene fotos de GitLab; si te registras por primera vez con GitLab, tu avatar muestra la primera letra de tu nombre. Puedes subir una foto aquí.

![La página Cuenta con las secciones de perfil, métodos de inicio de sesión, GitHub App y GitLab PAT](/guide/account.webp "Actualiza tu perfil y tus métodos de inicio de sesión en Cuenta.")

## Gestiona los métodos de inicio de sesión {#sign-in-methods}

En mal-moi.com están disponibles GitHub, GitLab y Google, en ese orden. En tu propia instalación solo aparecen los proveedores activos. Elige **Conectar** en otro proveedor e inicia sesión con la misma dirección de correo electrónico. No se puede quitar el último método; Cuenta indica **Es tu única forma de iniciar sesión.**

Si ya has autorizado Malmoi en GitLab, GitLab puede devolverte aquí sin mostrar otra pantalla.

## Conexiones de repositorios {#connections}

Para el acceso a repositorios, consulta [Gestiona la conexión con GitHub](../github/connection.md) o [Gestiona el token y la conexión de GitLab](../gitlab/connection.md). Iniciar sesión y conectar un repositorio son acciones independientes. En **GitLab PAT**, la fila de un token sin conectar se llama **Token de GitLab**.

Iniciar sesión con GitLab no conecta un token, y quitar GitLab de tus métodos de inicio de sesión no borra un token conectado. Para quitar el token, elige **Desconectar** en la sección GitLab PAT y después **Desconectar token** en el diálogo de confirmación. Los proyectos que usan ese token dejan de sincronizar y publicar hasta que un propietario del proyecto los vuelva a conectar. Quitar el token no elimina tu método de inicio de sesión con GitLab.

## Cierra sesiones {#sessions}

1. Elige **Cerrar sesión en todas partes**.
2. Usa el botón de confirmación del cuadro de diálogo, Continuar a GitHub, Continuar a GitLab o Continuar a Google. Malmoi elige uno de tus métodos de inicio de sesión conectados; sigue su confirmación de inicio de sesión.

Si ya has autorizado Malmoi en GitLab, GitLab puede devolverte aquí sin mostrar otra pantalla.

Esto también cierra la sesión del dispositivo que estás usando.

![El diálogo para cerrar sesión en todas partes con los botones Cancelar y Continuar en GitHub](/guide/sign-out-everywhere.webp "Continúa en tu proveedor de inicio de sesión para confirmar.")

## Qué pasa después {#next}

Vuelve a un proyecto después de actualizar Cuenta.
