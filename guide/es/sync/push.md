# Cuando cambia el código

Las actualizaciones del repositorio refrescan tu proyecto; mientras haya ediciones sin enviar o un pull request de Malmoi abierto, esas actualizaciones se retienen.

El workflow actualiza el proyecto desde los archivos de origen del repositorio en cada commit; sin él, la [ejecución nocturna](nightly.md#repository-changes) hace lo mismo una vez al día. Cuando el workflow aplica una actualización, reemplaza los valores traducidos de esa fuente por los del repositorio. Las claves que desaparecen del código siguen almacenadas para que un cambio posterior del código pueda recuperarlas.

## Actualiza desde el repositorio {#repository-changes}

Ejecuta el workflow generado en la rama base. El workflow comprueba el token de push, el commit y los archivos. Si el commit es anterior al último que Malmoi leyó para esa fuente, o los archivos no coinciden con su configuración, ese paso falla sin reemplazar las traducciones de la fuente. Es posible que los pasos de fuentes anteriores del mismo workflow ya hayan terminado bien.

## Conserva las ediciones sin enviar {#deferred}

Si alguna traducción tiene una edición sin enviar, el workflow termina bien e informa `deferred`: la actualización del repositorio se retiene y Registros la muestra como **Retenido**. Las claves nuevas y las eliminadas también se retienen; el repositorio no se carga parcialmente. La pestaña **Sincronizar** de Inicio muestra **Retenido** en su fila **Espera**, y la tarjeta Por enviar explica el motivo. Publica las ediciones y ejecuta el workflow de nuevo, o un propietario del proyecto puede resolverlas con [Deshacer y resincronizar](revert.md).

![A project's Home with one unsent edit to send and a note that repository updates are held](/guide/home-paused.webp "Repository updates are held until the unsent edits are published.")

## Fusiona o cierra el pull request abierto {#open-pull-request}

Publicar quita la protección de las ediciones que envió, pero esos valores no están en el repositorio hasta que se fusione el pull request. Por eso, mientras hay un pull request de Malmoi abierto, el workflow también termina bien e informa `deferred`, con el motivo `open-pr`, y no carga nada. La pestaña **Sincronizar** de Inicio muestra **Retenido** en su fila **Espera**, y la tarjeta Por enviar explica el motivo. Fusiona o cierra el pull request. Después, la [ejecución nocturna](nightly.md#repository-changes) o la ejecución del workflow del siguiente commit recoge los cambios; fusionar el pull request no inicia por sí mismo una actualización (consulta [Conserva el marcador anti-bucle](merging.md#skip-marker)).

Si Malmoi no pudo consultar a GitHub si hay un pull request abierto, el motivo es `pr-check-failed` y la actualización también se retiene, porque Malmoi no puede descartar el pull request. Inicio también muestra **Retenido** aquí. Ejecuta el workflow de nuevo más tarde.

En todos los casos se retiene la actualización completa; Malmoi no elige unos valores del repositorio y conserva otros.

## Conserva las claves eliminadas {#removed-keys}

Una clave que falta en el repositorio se conserva en lugar de borrarse. Sus traducciones siguen disponibles si la clave vuelve en una ejecución posterior del workflow.

## Qué pasa después {#next}

Lee el resultado del workflow en GitHub Actions. Una actualización correcta hace que las claves del repositorio estén disponibles en Malmoi.
