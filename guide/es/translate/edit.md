# Edita traducciones

Abre la pantalla de traducción, encuentra el texto que quieres traducir, edítalo en cada idioma y guarda antes de publicar.

Antes de empezar: únete a un proyecto y elige **Traducciones** en la navegación del proyecto.

## Encuentra una clave {#find-key}

La lista de claves está a la izquierda. Cada fila es un texto de la aplicación — una *clave* — y muestra su texto de origen seguido del nombre de la clave. Selecciona una fila para abrir sus traducciones en todos los idiomas, a la derecha. Usa el cuadro de búsqueda sobre los paneles para encontrar una clave por su nombre, su texto de origen o una traducción.

![La pantalla de traducción con una clave seleccionada en la lista y su texto en tres idiomas](/guide/translation-editor.webp "Selecciona una fila para editar su texto en todos los idiomas.")

En la lista de claves, las flechas del teclado se mueven entre filas y Intro abre la fila; Tab salta toda la lista de una vez.

El panel **Fuentes** define qué claves muestra la lista. Selecciona **Todos los espacios de nombres** bajo una fuente para listar todas sus claves, o selecciona un grupo para listar solo ese grupo. El filtro de la parte superior derecha de la lista de claves muestra la opción actual: **Todas las claves**, **Incompletas**, **Por revisar**, **Sin enviar** o **Nuevas desde GitHub**. Por revisar marca las traducciones cuyo texto de origen cambió; no es un paso de aprobación. Al seleccionar un grupo se conserva el filtro, y al cambiar el filtro se conserva el grupo. El filtro solo acota la lista de claves; no cambia los números del panel **Fuentes**.

La búsqueda recorre todas las fuentes del proyecto. Mientras buscas en un proyecto con varias fuentes, aparece **Todas las fuentes** en la parte superior del panel **Fuentes**, y la lista muestra la fuente de cada clave antes de su nombre. En un proyecto con una sola fuente, usa **Todos los espacios de nombres** para buscar en toda la fuente. Cada fuente y grupo también muestra cuántas de sus claves coinciden con la búsqueda, y los grupos sin coincidencias se atenúan y no se pueden seleccionar. Selecciona **Todos los espacios de nombres** bajo una fuente, o un grupo, para acotar los resultados a ello, o **Todas las fuentes** para volver a buscar en todas partes; escribir una búsqueda nueva siempre busca en todas partes. Si seleccionas una clave de otra fuente, la pantalla pasa a esa fuente. Borra la búsqueda para volver al grupo de la clave que seleccionaste. Cuando nada coincide, elige **Buscar en todas las fuentes** para ampliar una búsqueda acotada, o **Borrar búsqueda**. **Borrar filtros** devuelve el filtro a **Todas las claves** y conserva el texto de tu búsqueda.

![La pantalla de traducción con el filtro abierto y las opciones Todas las claves, Incompletas, Por revisar, Sin enviar y Nuevas desde GitHub](/guide/state-filter.webp "Acota la lista por estado.")

## Busca texto en todos tus proyectos {#global-search}

Si no sabes qué proyecto contiene un texto, usa la búsqueda del centro de la cabecera. Con la sesión iniciada, puedes buscar desde cualquier página, incluida la documentación, entre tus proyectos, las páginas de Malmoi, el texto de tus proyectos y la documentación. Sin iniciar sesión, la búsqueda solo encuentra la documentación.

1. Elige **Buscar…**, o pulsa Cmd+K en macOS o Ctrl+K en otras plataformas. El atajo no hace nada mientras hay un cuadro de diálogo o un menú abierto. En un campo de texto, elige **Buscar…** en su lugar.
2. Escribe al menos dos caracteres para buscar nombres de claves, texto de origen y traducciones guardadas en los proyectos a los que perteneces. El grupo **Claves** muestra el nombre de la clave, el proyecto y la fuente, y el texto que coincide; una traducción que coincide también muestra su código de idioma.
3. Selecciona un resultado, o usa las flechas y pulsa Intro. La búsqueda se cierra y abre Traducciones con esa clave seleccionada y visible. Puedes editarla y guardarla como se describe abajo.

Los resultados de claves excluyen los proyectos y las fuentes archivados, las fuentes que no han terminado su primera sincronización y los textos o idiomas eliminados del repositorio. La búsqueda de claves coincide con la frase completa que escribes sin distinguir mayúsculas de minúsculas y usa sus primeros 200 caracteres. **Proyectos**, **Páginas** y **Documentación** coinciden con todas las palabras que escribes, en cualquier orden. Cada grupo muestra hasta cinco resultados; acota tu texto si el que necesitas no aparece.

Si una parte de la búsqueda falla, una línea bajo el cuadro de búsqueda indica qué parte falló y cómo reintentarlo, y los demás grupos siguen siendo utilizables. Si tu sesión terminó, inicia sesión de nuevo para buscar en tus proyectos; la documentación sigue siendo buscable.

Con la búsqueda vacía, ves vistas previas de **Proyectos**, **Páginas** y **Documentación**. **Páginas** te lleva a pantallas de Malmoi, como las Traducciones de un proyecto. **Proyectos** incluye los proyectos archivados, mientras que los resultados de claves no. Elige **Ir a tus proyectos** para ver todos tus proyectos, o **Ir a la documentación** para abrirla. **Documentación** busca en los títulos y el texto de la guía y abre la sección que coincide. Escape cierra la búsqueda. Malmoi no guarda el texto de tu búsqueda en el historial ni en el almacenamiento del navegador.

## Mira lo que requiere tu atención en todos tus proyectos {#inbox}

El botón de bandeja de entrada, entre la línea divisoria y tu avatar arriba a la derecha —en la app y, con la sesión iniciada, también en las páginas de documentación, novedades y privacidad—, reúne lo que requiere tu atención en todos los proyectos a los que perteneces, para que no tengas que abrir el **Inicio** de cada proyecto. Cuando hay algo nuevo desde la última vez que miraste, el botón muestra cuántos elementos hay; a partir de diez muestra 9+.

1. Elige el botón de bandeja de entrada. Los elementos se agrupan por proyecto, y primero aparece el proyecto con el elemento más reciente. Verás fuentes cuya última sincronización falló o solo se sincronizó en parte, texto que espera revisión, idiomas sin traducciones y ediciones sin enviar. Los propietarios del proyecto también ven los proyectos cuya configuración no ha terminado.
2. Selecciona un elemento. Un problema de sincronización abre **Fuentes**, donde puedes leer el motivo; solo los propietarios del proyecto pueden volver a intentar la sincronización. Los demás elementos abren **Traducciones** con el filtro correspondiente, y la configuración abre **Configuración** del proyecto.
3. Cierra la lista. Al abrirla, todo lo que contiene queda marcado como visto, y el número desaparece cuando la cierras. Si la lista no carga, elige **Intentar de nuevo**.

![La bandeja de entrada abierta arriba a la derecha, con los elementos agrupados por proyecto: una sincronización fallida y otra parcial, y después una edición sin enviar y texto que espera revisión](/guide/inbox-open.webp "Elige un elemento para ir a donde puedes resolverlo.")

Un elemento vuelve a contar solo cuando es nuevo o cambió desde la última vez que abriste la lista, y sale de la lista cuando se resuelve. El texto que espera revisión siempre aparece, pero nunca cuenta en el número, porque cada sincronización desde el repositorio lo haría parecer nuevo. Cuando nada requiere tu atención, la lista muestra **Nada requiere tu atención**. Los proyectos archivados no se incluyen.

## Edita y guarda {#save}

1. Selecciona una fila de la lista de claves.
2. Escribe en los campos de idioma.
3. Elige **Guardar**, o pulsa Ctrl+Intro o Cmd+Intro.

**Guardado** confirma que se guardó. Pasar a otro campo no guarda. Pulsa Escape mientras editas un campo para deshacer lo que escribiste en ese campo. Si algún idioma no se guarda, no se guarda ninguno — inténtalo de nuevo. Si Malmoi dice que no pudo confirmar el guardado, comprueba los valores actuales antes de guardar otra vez. Guardar quita **Por revisar** de los idiomas que guardaste.

Mientras se ejecuta una sincronización desde el repositorio (la **Sincronizar** de un propietario del proyecto o la actualización nocturna), no puedes guardar: Malmoi muestra **Sincronizando…** con la hora más próxima en que podrás volver a guardar, y no se guarda nada. Tu texto se conserva; elige **Aceptar** y guarda de nuevo cuando termine la sincronización. Si ya hay una sincronización en curso cuando abres Traducciones, una nota en la parte superior lo indica; puedes seguir escribiendo.

Algunos proyectos no permiten una traducción vacía. Si Malmoi rechaza un campo vacío, introduce un valor o pulsa Escape en ese campo para deshacer la edición y luego guarda los demás cambios. No se guarda nada mientras siga la edición vacía no válida.

## Salir con cambios sin guardar {#unsaved-changes}

Si cambias de claves, filtros o páginas con una edición sin guardar, elige **Seguir editando** o **Descartar cambios**. **Guardar** está bloqueado mientras **Publicar** se está ejecutando. Actualizar o cerrar la página también puede hacer que el navegador pida confirmación.

## Qué pasa después {#next}

Continúa con [Publica tus cambios](publish.md).
