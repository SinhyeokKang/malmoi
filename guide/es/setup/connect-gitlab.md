# Conecta GitLab

Conecta un repositorio de GitLab.com con un token de acceso personal para que Malmoi pueda leer tus archivos de traducción y abrir merge requests de traducciones.

Antes de empezar: inicia sesión con un correo verificado, ve a **Proyectos** y elige **Nuevo proyecto**. Puedes ser propietario de hasta tres proyectos activos. Necesitas el rol Maintainer o superior en ese proyecto de GitLab. La conexión es el primer paso de un proyecto nuevo.

## Conecta con un token de acceso personal {#connect-gitlab}

Malmoi se conecta a GitLab.com con un token de acceso personal de tu propia cuenta de GitLab. GitLab Self-Managed y GitLab Dedicated no son compatibles.

1. Elige la pestaña **GitLab** en la parte superior del primer paso. Si tu instalación de Malmoi solo ofrece GitLab, el paso no tiene pestañas y muestra GitLab directamente.
2. Si GitLab aún no está conectado, elige **Crear un token en GitLab**. La página de tokens de acceso personal de GitLab se abre en una pestaña nueva con el nombre `Malmoi` y el alcance `api` ya rellenados. Crea allí el token y cópialo. Malmoi necesita este tipo de token clásico; un token detallado (fine-grained) se rechaza.
3. Pega el token en **Token de acceso personal** y elige **Conectar**. Mientras Malmoi lo comprueba con GitLab, el paso lo indica; si rechaza el token, el motivo aparece debajo del texto de ayuda. Malmoi no vuelve a mostrar el token. Si tu token guardado caducó o ya no se puede usar, el paso muestra **Volver a conectar GitLab**: pega un token nuevo de la misma forma.
4. Malmoi lista los proyectos de GitLab en los que tienes el rol Maintainer o superior. Si no hay ninguno, muestra **No hay proyectos de GitLab para añadir**: consigue ese rol en GitLab y luego elige **Intentar de nuevo**.
5. Selecciona el repositorio, elige la **Rama** que contiene tus archivos de traducción y elige **Siguiente**. Las traducciones vuelven como una merge request contra esta rama.

Debajo del cuadro de búsqueda, Malmoi muestra qué cuenta de GitLab está conectada y cuándo caduca su token. Para usar un token nuevo de la misma cuenta, elige **Reemplazar token**. También puedes gestionar el token en [Cuenta](../account/profile.md#gitlab-token). El proyecto publica con el token de quien lo conectó, así que los commits y las merge requests en GitLab quedan a nombre de esa cuenta de GitLab.

## Qué pasa después {#next}

En el siguiente paso eliges los archivos de traducción; continúa con [Crea un proyecto](create-project.md#choose-files).
