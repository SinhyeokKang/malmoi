# Crea un proyecto con GitHub

Instala la GitHub App en tu repositorio, elige los archivos de traducción que Malmoi debe gestionar y crea el proyecto.

Antes de empezar: inicia sesión con un correo verificado, ve a **Proyectos** y elige **Nuevo proyecto**. Puedes ser propietario de hasta tres proyectos activos. Necesitas acceso de escritura al repositorio. ¿Usas otro servicio? Sigue [Crea un proyecto con GitLab](../gitlab/create.md) en su lugar.

## Conecta GitHub {#connect-github}

1. En el primer paso de **Nuevo proyecto**, en **Conecta tus repositorios**, elige **Instalar la GitHub App**. Si tu organización ya la instaló, elige **Conectar tu cuenta**. Si el botón de instalación no está disponible, elige **Autorizar la GitHub App** y sigue las instrucciones para pedir acceso de instalación a un administrador. Si ya aparecen repositorios, continúa con [Selecciona el repositorio](#select-repository).
2. GitHub pregunta dónde instalar la app. Elige tu cuenta o la organización propietaria del repositorio. Una cuenta que ya tiene la app muestra **Configure**; elígela para dar a la app acceso a otro repositorio.
3. En **Repository access**, elige **Only select repositories**, selecciona el repositorio y elige **Install & Authorize**. Si no puedes instalar apps en esa organización, GitHub envía tu solicitud a sus propietarios.
4. GitHub te devuelve a Malmoi y el primer paso lista los repositorios a los que la app puede acceder.

![El paso 1 de 4 de Nuevo proyecto antes de conectar GitHub, con el botón Instalar la GitHub App y un enlace para conectar una cuenta que ya la tiene instalada](/guide/create-github-install.webp "Elige Instalar la GitHub App para instalarla en tu cuenta u organización.")

![GitHub pregunta dónde instalar la app Malmoi Sync, con la cuenta personal y una organización ya configuradas y otra organización disponible](/guide/github-app-install-target.webp "Elige la cuenta o la organización propietaria del repositorio.")

![La página Install & Authorize de GitHub con Only select repositories elegido y un repositorio seleccionado](/guide/github-app-install.webp "Elige Only select repositories, selecciona el repositorio y elige Install & Authorize.")

## Selecciona el repositorio {#select-repository}

1. Si el repositorio no aparece, elige **Añadir repositorios** para abrir la instalación de la app en GitHub. En **Repository access**, añade el repositorio y guarda.
2. Si Malmoi muestra **Esperando aprobación**, pide a un propietario de la organización que apruebe tu solicitud y luego elige **Intentar de nuevo**.
3. Selecciona el repositorio, elige la **Rama** que contiene tus archivos de traducción y elige **Siguiente**. Es la rama base que Malmoi lee y contra la que abre los pull requests de traducciones.

![El paso 1 de 4 de Nuevo proyecto con un repositorio seleccionado en la lista y dev como rama](/guide/create-repository.webp "Selecciona el repositorio y su rama y luego elige Siguiente.")

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

![El paso 4 de 4, Malmoi está listo, con el token de push, su botón Copiar y el archivo del flujo de trabajo que debes guardar en el repositorio](/guide/create-ready.webp "Copia el token de push y el flujo de trabajo antes de salir de esta página.")

1. Copia el token de push que aparece en la página de finalización. Solo se muestra una vez; si lo pierdes, rótalo más tarde en **Configuración**.
2. Añade el workflow y el secreto siguiendo [Añade el workflow](workflow.md).
3. Elige **Abrir proyecto** para ir a la página de Inicio del proyecto.

Quien lo crea pasa a ser **Propietario**.

## Qué pasa después {#next}

La ejecución nocturna mantiene el proyecto al día una vez al día, con o sin el workflow. El workflow lo actualiza en cada commit y añade referencias de código después de su primera ejecución. Un workflow que falla no deja el proyecto sin estar listo. Si algo sale mal, consulta [Soluciona problemas de GitHub](troubleshooting.md).
