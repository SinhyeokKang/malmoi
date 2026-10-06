# Crea un proyecto

Crea un proyecto conectando un repositorio y eligiendo los archivos de traducción que Malmoi debe gestionar.

Antes de empezar: inicia sesión con un correo verificado, ve a **Proyectos** y elige **Nuevo proyecto**. Puedes ser propietario de hasta tres proyectos activos.

## Conecta GitHub {#connect-github}

1. Si GitHub no está conectado, elige **Instalar la GitHub App**, o **Conectar tu cuenta** si tu organización ya la instaló. Si el botón de instalación no está disponible, elige **Autorizar la GitHub App** y sigue las instrucciones para pedir acceso de instalación a un administrador. Si ya aparecen repositorios, continúa abajo.
2. Si el repositorio no aparece, elige **Añadir repositorios** para abrir la instalación de la app en GitHub. En **Repository access**, elige **Only select repositories**, añade el repositorio y guarda.
3. Si Malmoi muestra **Esperando aprobación**, pide a un propietario de la organización que la apruebe y luego elige **Intentar de nuevo**.
4. Selecciona el repositorio, elige la **Rama** que contiene tus archivos de traducción y elige **Siguiente**. Es la rama base que Malmoi lee y contra la que abre los pull requests de traducciones.

![Step 1 of 4 of New project with a repository selected in the list and dev chosen as its branch](/guide/create-repository.webp "Select the repository and its branch, then choose Next.")

## Elige los archivos {#choose-files}

1. Selecciona los archivos detectados. Se admiten archivos con un solo idioma.
2. Si no se detectan tus archivos, elige **Indicar la ruta manualmente** e introduce una ruta y un formato compatibles. Consulta [Formatos de archivo compatibles](../reference/formats.md#formats) para ver ejemplos de rutas.
3. Revisa la vista previa y elige **Siguiente**.

Malmoi muestra una fuente por cada conjunto de archivos seleccionado. Una fuente puede usar un idioma base distinto del de otra fuente.

![Step 2 of 4 with two detected sets of translation files selected and a preview of one set's keys and values](/guide/create-files.webp "Select the detected files and check their keys.")

## Completa los datos del proyecto {#confirm-project}

1. Comprueba el **Idioma base** de cada fuente. Su archivo decide qué claves existen; las claves que solo aparecen en otro idioma se dejan fuera.
2. Introduce el **Nombre** y la **Dirección** del proyecto. La dirección es el nombre que aparece en la URL del proyecto; debe ser única en todo Malmoi y no se puede cambiar después.
3. Revisa los límites de archivos y de tamaño en [Límites](../reference/limits.md#files) y elige **Crear proyecto**.

![Step 3 of 4 with the project name and address filled in and English chosen as a source's base language](/guide/create-name.webp "Check the base language, name, and address before you create the project.")

El proyecto queda listo al instante. El último paso dice **Malmoi está listo** y puedes traducir e invitar a tus compañeros de inmediato.

## Termina la configuración {#finish-setup}

![Step 4 of 4, Malmoi is ready, with the push token, its Copy button, and the workflow file to save in the repository](/guide/create-ready.webp "Copy the push token and the workflow before you leave this page.")

1. Copia el token de push que aparece en la página de finalización. Solo se muestra una vez; si lo pierdes, rótalo más tarde en **Configuración**.
2. Añade el workflow y el secreto siguiendo [Añade el workflow](workflow.md).
3. Elige **Abrir proyecto** para ir a la página de Inicio del proyecto.

Quien lo crea pasa a ser **Propietario**.

## Qué pasa después {#next}

La ejecución nocturna mantiene el proyecto al día una vez al día, con o sin el workflow. El workflow lo actualiza en cada commit y añade referencias de código después de su primera ejecución. Un workflow que falla no deja el proyecto sin estar listo.
