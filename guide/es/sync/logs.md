# Consulta la actividad en Registros

Usa Registros para ver la actividad del proyecto, inspeccionar cambios y comprobar el resultado de las sincronizaciones y publicaciones.

Registros guarda los eventos del proyecto con la persona que los hizo, la hora, el tipo de evento y los detalles de antes y después cuando el evento los ofrece. La lista es una instantánea; en un proyecto activo, elige **Actualizar** para leerla de nuevo. Los proyectos archivados no muestran este botón.

## Encuentra un evento {#logs}

1. Abre **Registros** desde la navegación del proyecto.
2. Acota la lista con los filtros — **Toda la actividad**, **Cualquier fecha**, **Cualquier persona**, **Cualquier fuente** y **Cualquier resultado** — y usa **Buscar en los registros**.

Las fechas y las horas de los eventos usan UTC, salvo que [elijas otra zona horaria](../language.md#time-zone) en Preferencias. Los separadores de fecha y el filtro de fecha siguen esa zona horaria, y cada hora de evento lleva su desfase, como `08:10 UTC+9`. Los filtros de resultado se aplican a las ejecuciones de sincronización y de publicación.

En **Automatización**, el filtro **Cualquier persona** ofrece **CI** para las ejecuciones del workflow de tu repositorio y **Proceso nocturno** para la [ejecución nocturna](nightly.md). Una noche sin ediciones sin enviar aparece en **Sincronizaciones**, no en **Publicar**: la ejecución nocturna actualizó el proyecto desde el repositorio, informó **Al día**, retuvo la actualización (**Retenido**) o falló (por ejemplo, no pudo leer la rama del repositorio). Algunas noches no dejan ningún evento para un proyecto, por ejemplo cuando ninguna fuente está lista para comparar o la ejecución llegó al proyecto demasiado tarde para iniciar una actualización.

Si los filtros ocultan todos los eventos, la lista lo indica; elige **Borrar filtros** para verlo todo.

## Lee los detalles de un evento {#event-details}

Abre un evento para inspeccionar sus detalles sin cambiar los filtros de la lista. Los eventos de traducción identifican la clave y la fuente; los eventos de sincronización y de Publicar muestran su resultado observado. En **Valores**, una sincronización muestra cuántas traducciones cambió, y una publicación muestra cuántas cambió en los archivos del repositorio. Una sincronización retenida por ediciones sin enviar las muestra en **Ediciones sin enviar**; una retenida por otro motivo, como una solicitud de cambios de Publicar que sigue abierta (un *pull request* en GitHub), lo explica en **Retenido porque**.

![An event opened from Logs: a Publish run that sent two files to GitHub, with its trigger and a link to the pull request](/guide/logs-event.webp "Open an event to see its details.")

## Lee el historial archivado {#archived-history}

Los miembros actuales pueden leer Registros después de que un proyecto se archive. Archivar bloquea las escrituras del proyecto y los cambios de configuración; no borra el historial de actividad.
