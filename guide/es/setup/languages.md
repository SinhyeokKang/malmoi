# Añade y quita idiomas

Añade un idioma a una fuente o quita uno desde los detalles de la fuente y publica el cambio en tu repositorio como un archivo.

Los propietarios del proyecto cambian los idiomas de una fuente; los traductores (rol Editor) pueden ver el estado de cada idioma, pero no cambiarlo. Añadir y quitar idiomas funciona en fuentes de **Catálogo JSON** y de **Mensajes de extensión de Chrome**, que guardan un archivo por idioma. En los demás formatos, añade o borra el archivo del idioma en el repositorio y Malmoi recoge el cambio en la siguiente actualización.

## Abre la tarjeta Idiomas {#languages}

Abre **Fuentes**, abre los detalles de la fuente y busca la tarjeta **Idiomas**. Cada fila muestra el progreso de un idioma y una acción. Un idioma que no está en la fuente se añade con **Añadir idioma**, en la parte superior de la tarjeta.

Una fila puede mostrar:

- **Añadiendo** o **Quitando** — un cambio que pediste y que el repositorio todavía no tiene.
- **Inactivo** — el archivo del idioma ya no está en el repositorio. Sus traducciones se conservan en Malmoi.
- **Sin enviar** — el cambio todavía no está en una pull request (una merge request en GitLab).
- Un enlace a la pull request (una merge request en GitLab) — el cambio salió en la última publicación. El enlace apunta a la pull request de esa publicación, que puede que ya no esté abierta.
- **Sin confirmar en la pull request** — la última publicación no pudo terminar, así que Malmoi no sabe qué contiene la pull request. Publica de nuevo antes de cancelar o cambiar este idioma.

![La tarjeta Idiomas de una fuente, con un botón Añadir idioma sobre las filas del idioma base, idiomas normales, uno que se está añadiendo, uno que se está quitando y uno inactivo](/guide/languages-card.webp "Cada fila muestra el estado del idioma y una acción.")

En la fila del idioma base, **Quitar idioma** está desactivado; elige antes otro [idioma base](sources.md#base-language). Para los traductores, y para los formatos que no admiten añadir ni quitar idiomas, los botones también están desactivados, y la descripción de la tarjeta explica por qué.

## Añade un idioma {#add}

1. En la tarjeta **Idiomas**, elige **Añadir idioma**.
2. En un catálogo JSON, elige un idioma de **Idiomas habituales** o escribe un código en **Código de idioma**: un idioma en minúsculas con una región opcional, como `fr`, `pt-BR` o `zh_TW`. Los idiomas que ya estuvieron en esta fuente aparecen primero, en **Antes en esta fuente**. En los mensajes de extensión de Chrome, elige en **Idioma**; Chrome admite una lista fija de códigos.
3. Comprueba **Archivo que se creará**, la ruta que tendrá el archivo. Elige **Añadir idioma** otra vez para confirmar.

![El diálogo para añadir un idioma sobre los detalles de la fuente, con es elegido como código de idioma e i18n/emails/es.json en Archivo que se creará](/guide/language-add.webp "Elige un idioma y comprueba el archivo que creará Malmoi.")

Malmoi rechaza un idioma que ya está en la fuente, uno cuya ruta de archivo coincide con la de otro idioma (por ejemplo `pt-BR` y `pt_br`), uno que escribiría en un archivo de otra fuente y uno que se está quitando; en ese caso, cancela la eliminación.

El idioma nuevo aparece como **Añadiendo** y los traductores pueden abrirlo y traducir enseguida. El archivo todavía no existe en tu repositorio: Publicar lo crea, cuando el idioma tiene al menos una traducción. Hasta entonces, la vista previa de Publicar muestra el idioma como **No incluido**.

Si añades un idioma que ya estuvo en esta fuente, Malmoi recupera sus traducciones guardadas como ediciones sin enviar, así que la siguiente publicación las envía.

## Quita un idioma {#remove}

1. En la tarjeta **Idiomas**, elige **Quitar idioma** en la fila del idioma.
2. Lee la confirmación. Muestra el idioma, su archivo, cuántas traducciones conserva Malmoi y si una pull request ya incluye el cambio.
3. Si el idioma tiene ediciones sin enviar, la confirmación dice cuántas se descartarán; cada una vuelve al último valor enviado al repositorio. Si alguna edición nunca se envió, no hay valor al que volver y Malmoi te pide que publiques primero.
4. Elige **Quitar idioma** otra vez. La fila se queda en la lista como **Quitando** y los traductores ya no pueden guardar ediciones en ese idioma.

![La confirmación para quitar ja de emails, con el idioma, su archivo, las traducciones que se conservan y el estado de la pull request, y un aviso de que se descartará 1 edición sin enviar](/guide/language-remove.webp "Lee lo que descarta la eliminación y luego elige Quitar idioma.")

Quitar un idioma borra su archivo en la siguiente publicación. No toca el código de tu app. Para que la app no cargue un archivo que falta, la confirmación y la descripción de la pull request te recuerdan que quites las referencias al idioma (listas de idiomas admitidos, rutas y el código que carga el archivo) antes de fusionar.

Las traducciones se quedan en Malmoi. Cuando se fusiona la pull request, Malmoi muestra el idioma como **Inactivo** (consulta [Qué pasa tras la fusión](#after-merge)), y si vuelves a añadir el mismo código, las traducciones regresan.

### Celdas de un idioma que se quita {#frozen}

En **Traducciones**, la celda de un idioma que se está quitando es de solo lectura. Si escribes en ella de todos modos, la celda avisa de que la edición no se puede guardar y ofrece **Descartar cambio**. Una clave con una edición en un idioma que se quita no se guarda en ningún idioma hasta que descartes esa edición. Descártala o cancela la eliminación y luego guarda.

## Cancela un cambio {#cancel}

- Para cancelar una eliminación, elige **Cancelar eliminación** en la fila del idioma. No hay confirmación.
- Para cancelar una incorporación, elige **Quitar idioma** en la fila **Añadiendo** del idioma. El idioma pasa a **Inactivo** y se conservan sus traducciones; las ediciones sin enviar de ese idioma dejan de seguirse hasta que lo añadas de nuevo.

Si el cambio todavía no está en una pull request, cancelarlo lo termina. Si una pull request ya lo incluye, Malmoi te dice que publiques para actualizar la pull request: la siguiente publicación retira el cambio de ella. La cancelación no termina hasta que lo hagas.

## Qué bloquea otras tareas {#blocks}

Mientras hay un cambio de idioma sin terminar, Malmoi bloquea algunas otras tareas:

- Idioma base: no puedes elegir como idioma base uno que se está añadiendo o quitando, ni quitar el idioma base.
- Rama base: en **Configuración**, **Rama base** no se puede cambiar mientras alguna fuente tenga un cambio de idioma sin terminar. Malmoi nombra la fuente; termina o cancela antes su cambio de idioma. Un cambio termina cuando su pull request se fusiona o se cierra, algo que Malmoi comprueba en la siguiente publicación o [ejecución nocturna](../sync/nightly.md#held).
- Actualizaciones desde el repositorio: si hay una eliminación de idioma que aún no se ha publicado, el workflow y la ejecución nocturna no actualizan el proyecto: Registros muestra **Retenido** y **Retenido porque** dice que una eliminación de idioma sigue sin enviar. La actualización se reanuda cuando la eliminación se publica o se cancela. Añadir un idioma no retiene las actualizaciones. Consulta [Conserva las ediciones sin enviar](../sync/push.md#deferred).
- Sincronización: la [sincronización desde el repositorio](../sync/revert.md#resync) de un propietario descarta los cambios de idioma pendientes. Su confirmación enumera cada uno: un idioma que no se añadirá (sus traducciones se quedan en Malmoi) o que no se quitará (se queda en la fuente). Si un cambio descartado ya estaba en una pull request, publica de nuevo después para que la pull request deje de incluirlo.

## Publica el cambio {#publish}

Elige **Publicar**, como con cualquier cambio. Si solo cambian archivos de idioma, la vista previa se titula **Publicar cambios de idioma**. Cuando una publicación incluye cambios de idioma, cada archivo de la vista previa lleva en su encabezado lo que le va a pasar:

- **Archivo nuevo** — Publicar crea el archivo.
- **Actualizado** — cambia un archivo que existe en el repositorio.
- **Quitado** — Publicar borra el archivo; las traducciones se quedan en Malmoi.
- **No incluido** — el idioma todavía no tiene traducciones, así que no hay archivo que crear.
- **Retenido** — el archivo ya está en la rama base. Cuando se cierre la pull request abierta, el idioma pasa a estar activo en la siguiente publicación o comprobación nocturna.
- Retirado — cancelaste un cambio después de que entrara en una pull request, así que Publicar lo retira de ella.

![La vista previa Publicar cambios de idioma con un archivo, i18n/emails/ja.json, marcado como Quitado, y un botón Abrir pull request](/guide/publish-language-changes.webp "Cada archivo indica qué hace Publicar con él.")

Si hay una pull request de Malmoi abierta, Publicar reemplaza lo que contiene por todo lo que está sin enviar, incluidos los cambios de idioma, en lugar de abrir una segunda.

## Qué pasa tras la fusión {#after-merge}

Malmoi se entera de lo que pasó con una pull request en la siguiente publicación o ejecución nocturna, así que una fusión puede tardar hasta un día en verse.

- Eliminación fusionada: el idioma pasa a **Inactivo**. Sus traducciones, su historial y su fila se conservan.
- Eliminación cerrada sin fusionar: el archivo sigue en el repositorio, así que el idioma sigue activo y la solicitud de eliminación desaparece. Vuelve a pedirla si aún quieres quitarlo. Registros anota el cierre.
- Incorporación fusionada: el idioma es un idioma normal de la fuente.
- Incorporación cerrada sin fusionar: el archivo no está en el repositorio, así que el idioma pasa a **Inactivo** y se conservan sus traducciones.

## Qué pasa después {#next}

Revisa la pull request, fusiónala y actualiza el código de tu app para el idioma añadido o quitado. [Registros](../sync/logs.md#logs) anota cada solicitud, cancelación y cierre, con quién lo hizo.
