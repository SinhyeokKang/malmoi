# Añade fuentes

Añade más archivos de traducción más adelante, cambia el idioma base de una fuente o quita una fuente que ya no gestionas.

Cada fuente es un conjunto de archivos de traducción de tu repositorio. Los propietarios del proyecto pueden añadir una fuente y declarar su idioma base; los traductores (rol Editor) pueden ver el estado de las fuentes, pero no cambiar la configuración del proyecto.

## Abre Fuentes {#sources}

Abre **Fuentes** desde la navegación del proyecto. Cada fila muestra el estado de la fuente — **Sin sincronizar todavía**, **Sincronizando…**, **Sincronizada**, **Sincronizado en parte** o **Sincronización fallida** — y cuántas claves e idiomas tiene.

![The Sources page listing two synced sources with their file paths, key counts, and languages](/guide/sources.webp "Each source is one set of translation files.")

## Añade fuentes {#add-sources}

1. Elige **Añadir fuentes** y luego elige los archivos detectados o introduce una ruta compatible. Elige **Siguiente**; sigue desactivado hasta que selecciones al menos un archivo nuevo.
2. En **Elige los idiomas base**, elige el **Idioma base** de cada fuente nueva y luego **Añadir las fuentes seleccionadas**. Elige **Atrás** para cambiar tu selección; tus elecciones se conservan. Un archivo puede fallar mientras se añaden los demás, así que revisa cada resultado. Si no se añade nada, te quedas en este paso con tu selección intacta.
3. Sigue el enlace **Configuración** del resultado y copia los pasos de la nueva fuente del workflow generado en el archivo de workflow de tu repositorio. Añadir fuentes no edita ese archivo automáticamente.

![El paso Elige los idiomas base de Añadir fuentes, con la ruta de una fuente y sus idiomas como opciones de radio, el paso 2 de 2 y los botones Atrás y Añadir las fuentes seleccionadas](/guide/add-sources.webp "Elige el idioma base de cada fuente nueva y luego añade las fuentes seleccionadas.")

## Quita una fuente {#remove-source}

1. Abre los detalles de la fuente desde **Fuentes** y elige **Quitar fuente**. Solo está disponible para los propietarios del proyecto, y no para la última fuente de un proyecto.
2. Lee la confirmación y elige **Quitar fuente** otra vez. Si la fuente tiene ediciones sin enviar, el cuadro dice cuántas; si la vuelves a añadir más adelante, se reemplazarán con los valores del repositorio. Si hay una pull request de Malmoi abierta, avisa de que los cambios de esa fuente en ella quedarán fuera en la próxima publicación.
3. Quita el paso de la fuente del archivo de workflow de tu repositorio. Hasta que lo hagas, la próxima ejecución falla y detiene las fuentes que vienen después.

Quitar una fuente detiene su sincronización. Los archivos de tu repositorio no cambian, y la fuente desaparece de **Fuentes**, de Publicar y de la actualización nocturna. Sus claves, traducciones e historial se conservan.

## Vuelve a añadir una fuente quitada {#re-add}

Elige **Añadir fuentes** y selecciona la misma ruta con el mismo formato de archivo. La fuente quitada vuelve con sus traducciones. La primera sincronización posterior reemplaza sus ediciones sin enviar con los valores del repositorio allí donde el repositorio tiene uno; las ediciones sin valor en el repositorio siguen sin enviar. Si eliges otro formato de archivo para la ruta, Malmoi añade una fuente nueva; actualiza el workflow como con cualquier fuente nueva.

## Cambia el idioma base {#base-language}

1. Abre los detalles de la fuente desde **Fuentes**. En **Idioma base**, elige el idioma que aporta el texto de origen y luego elige **Guardar**. Hasta que se aplique, los detalles de la fuente muestran **Pendiente de aplicar**. El cambio se aplica con la siguiente actualización desde el workflow de GitHub Actions de tu repositorio. Elegir **Sincronizar** no lo aplica.
2. Edita el valor `base-locale:` del workflow para que coincida.
3. Ejecuta el workflow. Si hay ediciones sin enviar, la actualización se retiene. Publica o resuelve esas ediciones y ejecuta el workflow de nuevo.

[Sincronizar desde el repositorio](../sync/revert.md#resync) reemplaza los valores, pero conserva el idioma base actual.

## Qué pasa después {#next}

La siguiente ejecución correcta del workflow lee la fuente con el idioma base declarado. Tras quitar una fuente, una ejecución que aún incluya su paso se rechaza como fuente quitada y no carga nada, así que elimina ese paso.
