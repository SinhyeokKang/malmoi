# Archiva un proyecto

Archiva un proyecto para dejar de editar y sincronizar sin perder sus traducciones ni su historial de actividad.

Archivar es una acción del propietario del proyecto. Detiene las escrituras del proyecto y el trabajo automático con el repositorio, pero no elimina traducciones, miembros ni el historial de actividad. Un pull request abierto no se cierra automáticamente.

## Archiva el proyecto {#archive}

Antes de archivar, fusiona o cierra cualquier pull request de traducciones abierto si no quieres dejarlo abierto.

1. Abre **Configuración** y elige **Archivar proyecto**.
2. Lee la confirmación y elige Archivar proyecto de nuevo. El botón pasa a ser **Restaurar proyecto**.

![La Configuración del proyecto desplazada hasta la tarjeta Archivar proyecto, debajo de las tarjetas del repositorio y de integración con CI](/guide/archive-card.webp "Elige Archivar proyecto al final de Configuración.")

Los miembros aún pueden abrir **Registros**; las demás páginas del proyecto no están disponibles mientras está archivado, aunque los propietarios pueden abrir Configuración.

Mientras está archivado, una ejecución del workflow recibe una respuesta 409 y el workflow del repositorio se pone en rojo. Elimina el workflow o restaura el proyecto.

## Restaura el proyecto {#restore}

Elige **Restaurar proyecto** en la misma tarjeta para retomar el trabajo del proyecto. Restaurar no elimina las traducciones existentes ni reescribe el historial de actividad.

## Qué pasa después {#next}

Al restaurar, los miembros pueden volver a trabajar y el workflow puede actualizar el proyecto.
