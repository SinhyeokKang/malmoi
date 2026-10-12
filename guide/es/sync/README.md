# Cómo funciona la sincronización

Los cambios del repositorio traen el texto de la aplicación a Malmoi, y publicar devuelve las traducciones guardadas para que las revise el equipo de desarrollo.

## Cómo funciona {#how-it-works}

El repositorio decide qué textos de la aplicación — claves — existen. Malmoi guarda los valores traducidos entre actualizaciones. Cada actualización desde el repositorio reemplaza los valores de Malmoi por los del repositorio; no combina dos valores ni elige un ganador. Es un flujo sin fusión. Las actualizaciones automáticas se retienen mientras haya ediciones sin enviar o siga abierta una solicitud de cambios de Malmoi (una pull request, o una merge request en GitLab). Las actualizaciones llegan desde el workflow de tu repositorio en cada commit, o desde la [ejecución nocturna](nightly.md#repository-changes) una vez al día.

**Publicar** reúne los valores de Malmoi en una solicitud de cambios (un *pull request* en GitHub, o una *merge request* en GitLab) para que el equipo de desarrollo la revise y la fusione.

Lee [Cuando cambia el código](push.md) para el sentido de entrada y [Fusiona el pull request](merging.md) o [Fusiona la merge request](merging-gitlab.md) para el camino de vuelta.
