# Cada noche

Cada noche, Malmoi publica los cambios guardados o recoge los cambios nuevos del repositorio de cada proyecto activo.

La ejecución nocturna está programada a las 18:00 UTC. Para cada proyecto hace como máximo una cosa: publicar las ediciones sin enviar, actualizar el proyecto desde el repositorio u omitirlo porque no hay nada que hacer. Cada visita deja como máximo un evento en **Registros**, marcado como **Proceso nocturno**.

## Qué proyectos se comprueban {#eligible}

Un proyecto debe estar activo, conectado a un repositorio y tener al menos una fuente cuya primera sincronización haya terminado bien. Los proyectos archivados o sin conexión quedan excluidos. Una ejecución comprueba como máximo 50 proyectos, empezando por los que llevan más tiempo esperando desde su última comprobación nocturna; puede detenerse antes si se acaba el tiempo, así que algunos proyectos tendrán que esperar a otra noche. Un proyecto con commits nuevos al que se llega tarde en una ejecución también se deja para la noche siguiente, donde pasa al principio.

## Publicación automática {#nightly}

Si hay alguna edición guardada sin enviar, la ejecución nocturna publica los cambios guardados del proyecto mediante una solicitud de cambios (un *pull request* en GitHub). Un pull request abierto se actualiza en lugar de abrir un segundo. Esa noche el proyecto no se actualiza desde el repositorio.

Los valores guardados que no se pueden publicar permanecen en Malmoi. Si tus cambios no se publicaron durante la noche, revisa **Registros** y pregunta a un propietario del proyecto por cualquier fallo informado.

## Actualizaciones desde el repositorio {#repository-changes}

Si no hay nada pendiente de publicar, la ejecución nocturna comprueba si la rama que lee Malmoi tiene commits nuevos desde la última vez que Malmoi leyó tus fuentes.

- Sin commits nuevos y sin fallos la vez anterior: no se lee nada y el evento dice **Al día**. Si un archivo no se pudo actualizar, la ejecución nocturna lo reintenta cada noche hasta que lo consigue.
- Commits nuevos: Malmoi lee las fuentes del repositorio y actualiza el proyecto, igual que la Sincronizar de un propietario del proyecto, pero sin descartar nada. En Inicio, la pestaña **Sincronizar** muestra entonces **Sincronización nocturna** como **Última sincronización**, con el momento en que terminó en **Sincronizado** y cuántas traducciones cambió en **Cambiados**.

Si alguien guarda una traducción mientras se ejecuta la actualización nocturna, Malmoi se detiene antes de la siguiente fuente para que la edición nueva no se sobrescriba. Las fuentes que ya actualizó siguen actualizadas.

## Cuando la ejecución nocturna retiene una actualización {#held}

La ejecución nocturna retiene la actualización — el proyecto no se actualiza y **Registros** muestra **Retenido** con el motivo — cuando:

- Sigue abierto un pull request de Malmoi. Sus traducciones aún no están en el repositorio, así que una actualización las sobrescribiría. Fusiona o cierra el pull request; la siguiente ejecución nocturna recoge los cambios. La pestaña **Sincronizar** de Inicio muestra **Retenido** en su fila **Espera**, y la tarjeta Por enviar explica el motivo.
- GitHub no respondió si ese pull request está abierto. Malmoi no adivina; Inicio muestra **Retenido** y la siguiente ejecución vuelve a comprobarlo.
- El cambio es demasiado grande para una sincronización en el servidor. Las actualizaciones nocturnas usan el mismo presupuesto de archivos que la creación de un proyecto (consulta [Límites](../reference/limits.md#files)). Reduce el tamaño de los archivos o entrega el cambio con el workflow del repositorio.

Si la ejecución nocturna no puede leer la rama del repositorio, o GitHub no responde a tiempo, el evento muestra **Fallida** en **Registros** en lugar de una retención. Si la rama ya no existe, Inicio también muestra la sincronización como fallida hasta la siguiente sincronización correcta; si GitHub solo falló al responder, Inicio no cambia y la siguiente ejecución lo intenta de nuevo. Un propietario del proyecto puede comprobar la rama y la conexión con GitHub en **Configuración** del proyecto.

## Sincronización nocturna o workflow {#workflow}

El workflow es opcional. Sin él, la ejecución nocturna recoge los cambios del repositorio una vez al día. Con [el workflow](../setup/workflow.md), el GitHub Actions de tu repositorio envía los cambios en cada commit a esa rama y también recoge referencias de código. En **Registros**, las ejecuciones del workflow se marcan como **CI**; CI es el workflow de tu repositorio.

## Qué pasa después {#next}

La siguiente ejecución nocturna comprueba los proyectos que siguen siendo elegibles. Lee el resultado de cada noche en [Registros](logs.md#logs).
