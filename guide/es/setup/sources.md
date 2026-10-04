# Añade fuentes

Añade más archivos de traducción más adelante o cambia el idioma base de una fuente.

Cada fuente es un conjunto de archivos de traducción de tu repositorio. Los propietarios del proyecto pueden añadir una fuente y declarar su idioma base; los traductores (rol Editor) pueden ver el estado de las fuentes, pero no cambiar la configuración del proyecto.

## Abre Fuentes {#sources}

Abre **Fuentes** desde la navegación del proyecto. Cada fila muestra el estado de la fuente — **Sin sincronizar todavía**, **Sincronizando…**, **Sincronizada**, **Sincronizado en parte** o **Sincronización fallida** — y cuántas claves e idiomas tiene.

![The Sources page listing two synced sources with their file paths, key counts, and languages](/guide/sources.webp "Each source is one set of translation files.")

## Añade fuentes {#add-sources}

1. Elige **Añadir fuentes** y luego elige los archivos detectados o introduce una ruta compatible.
2. Elige el **Idioma base** de cada selección y luego **Añadir las fuentes seleccionadas**. Un archivo puede fallar mientras se añaden los demás, así que revisa cada resultado.
3. Sigue el enlace **Configuración** del resultado y copia los pasos de la nueva fuente del workflow generado en el archivo de workflow de tu repositorio. Añadir fuentes no edita ese archivo automáticamente.

![The Add sources dialog with detected translation files on the left, a preview of their keys and values, and a base language menu](/guide/add-sources.webp "Select files, check the preview, and choose a base language.")

## Cambia el idioma base {#base-language}

1. Abre los detalles de la fuente desde **Fuentes**. En **Idioma base**, elige el idioma que aporta el texto de origen y luego elige **Guardar**. Hasta que se aplique, los detalles de la fuente muestran **Pendiente de aplicar**. El cambio se aplica con la siguiente actualización desde el workflow de GitHub Actions de tu repositorio. Elegir **Sincronizar** no lo aplica.
2. Edita el valor `base-locale:` del workflow para que coincida.
3. Ejecuta el workflow. Si hay ediciones sin enviar, la actualización se retiene. Publica o resuelve esas ediciones y ejecuta el workflow de nuevo.

[Sincronizar desde el repositorio](../sync/revert.md#resync) reemplaza los valores, pero conserva el idioma base actual.

## Qué pasa después {#next}

La siguiente ejecución correcta del workflow lee la fuente con el idioma base declarado.
