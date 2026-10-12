# Crea un proyecto con GitLab

Conecta un repositorio de GitLab.com con un token de acceso personal, elige los archivos de traducción que Malmoi debe gestionar y crea el proyecto.

Antes de empezar: inicia sesión con un correo verificado, ve a **Proyectos** y elige **Nuevo proyecto**. Puedes ser propietario de hasta tres proyectos activos. Necesitas el rol Maintainer o superior en ese proyecto de GitLab. ¿Usas otro servicio? Sigue [Crea un proyecto con GitHub](../github/create.md) en su lugar.

## Conecta GitLab {#connect-gitlab}

Malmoi se conecta a GitLab.com con un token de acceso personal de tu propia cuenta de GitLab. GitLab Self-Managed y GitLab Dedicated no son compatibles.

1. Elige la pestaña **GitLab** en la parte superior del primer paso. Si tu instalación de Malmoi solo ofrece GitLab, el paso no tiene pestañas y muestra GitLab directamente.
2. Si GitLab aún no está conectado, el paso muestra **Conectar GitLab**. Elige **Crear un token en GitLab**. La página de tokens de acceso personal de GitLab se abre en una pestaña nueva con el nombre `Malmoi` y el alcance `api` ya rellenados.
3. En GitLab, comprueba la fecha de caducidad, deja seleccionado el alcance `api` y elige **Generate token**. Copia el token que muestra GitLab; solo lo muestra una vez. Malmoi necesita este tipo de token clásico; un token detallado (fine-grained) se rechaza.
4. De vuelta en Malmoi, pega el token en **Token de acceso personal** y elige **Conectar**. Mientras Malmoi lo comprueba con GitLab, el paso lo indica; si rechaza el token, el motivo aparece debajo del texto de ayuda. Malmoi no vuelve a mostrar el token. Si tu token guardado caducó o ya no se puede usar, el paso muestra **Volver a conectar GitLab**: pega un token nuevo de la misma forma.

![El paso 1 de 4 de Nuevo proyecto en la pestaña GitLab antes de conectar GitLab, con el enlace Crear un token en GitLab y el campo Token de acceso personal vacío](/guide/gitlab-connect-token.webp "Elige Crear un token en GitLab y luego pega el token y elige Conectar.")

![La página Generate legacy token de GitLab con Malmoi como nombre del token y una fecha de caducidad fijada](/guide/gitlab-pat-form.webp "Comprueba el nombre y la fecha de caducidad que rellenó Malmoi.")

![La lista de alcances de la misma página con solo api seleccionado, sobre el botón Generate token](/guide/gitlab-pat-scopes.webp "Deja seleccionado solo el alcance api y elige Generate token.")

## Selecciona el repositorio {#select-repository}

1. Malmoi lista los proyectos de GitLab en los que tienes el rol Maintainer o superior. Si no hay ninguno, muestra **No hay proyectos de GitLab para añadir**: consigue ese rol en GitLab y luego elige **Intentar de nuevo**.
2. Selecciona el repositorio, elige la **Rama** que contiene tus archivos de traducción y elige **Siguiente**. Las traducciones vuelven como una merge request contra esta rama.

![El paso 1 de 4 de Nuevo proyecto en la pestaña GitLab, con la cuenta conectada y la caducidad del token sobre la lista, un proyecto seleccionado y main como rama](/guide/gitlab-connect.webp "Selecciona el proyecto de GitLab y su rama y luego elige Siguiente.")

Debajo del cuadro de búsqueda, Malmoi muestra qué cuenta de GitLab está conectada y cuándo caduca su token. Para usar un token nuevo de la misma cuenta, elige **Reemplazar token**. También puedes gestionar el token en [Gestiona el token y la conexión de GitLab](connection.md#gitlab-token). El proyecto publica con el token de quien lo conectó, así que los commits y las merge requests en GitLab quedan a nombre de esa cuenta de GitLab.

## Elige los archivos {#choose-files}

1. Selecciona los archivos detectados. Se admiten archivos con un solo idioma.
2. Si no se detectan tus archivos, elige **Indicar la ruta manualmente** e introduce una ruta y un formato compatibles. Consulta [Formatos de archivo compatibles](../reference/formats.md#formats) para ver ejemplos de rutas.
3. Revisa la vista previa y elige **Siguiente**.

Malmoi muestra una fuente por cada conjunto de archivos seleccionado. Una fuente puede usar un idioma base distinto del de otra fuente.

![El paso 2 de 4 con dos conjuntos detectados de archivos de traducción seleccionados y una vista previa de las claves y los valores de uno de ellos](/guide/create-files.webp "Selecciona los archivos detectados y comprueba sus claves.")

## Completa los datos del proyecto {#confirm-project}

1. Comprueba el **Idioma base** de cada fuente. Su archivo decide qué claves existen; las claves que solo aparecen en otro idioma se dejan fuera.
2. Introduce el **Nombre** y la **Dirección** del proyecto. La dirección es el nombre que aparece en la URL del proyecto; debe ser única en todo Malmoi y no se puede cambiar después.
3. Revisa los límites de archivos y de tamaño en [Límites](../reference/limits.md#files) y elige **Crear proyecto**.

![El paso 3 de 4 con el nombre y la dirección del proyecto rellenados e inglés como idioma base de una fuente](/guide/create-name.webp "Comprueba el idioma base, el nombre y la dirección antes de crear el proyecto.")

El proyecto queda listo al instante. El último paso dice **Malmoi está listo** y puedes traducir e invitar a tus compañeros de inmediato.

## Termina la configuración {#finish-setup}

1. Copia el token de push que aparece en la página de finalización. Solo se muestra una vez; si lo pierdes, rótalo más tarde en **Configuración**.
2. Añade los jobs de CI y la variable `PUSH_TOKEN` siguiendo [Añade los jobs de GitLab CI](ci.md). Si la página de finalización indica que el archivo de CI aún no está disponible, guarda el token de push para más adelante.
3. Elige **Abrir proyecto** para ir a la página de Inicio del proyecto.

Quien lo crea pasa a ser **Propietario**.

## Qué pasa después {#next}

La ejecución nocturna mantiene el proyecto al día una vez al día, con o sin los jobs de CI. Los jobs de CI lo actualizan en cada commit y añaden referencias de código después de su primera ejecución. Un job que falla no deja el proyecto sin estar listo. Si algo sale mal, consulta [Soluciona problemas de GitLab](troubleshooting.md).
