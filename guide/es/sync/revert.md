# Deshacer y resincronizar

Los propietarios del proyecto pueden devolver un valor editado a su última versión publicada, o reemplazar los valores del proyecto con los archivos del repositorio.

Antes de empezar: guarda o descarta cualquier edición de traducción abierta antes de usar cualquiera de los dos controles exclusivos de propietarios.

## Revierte un valor {#revert}

1. En **Traducciones**, selecciona una clave con ediciones sin enviar y elige **Revertir a lo último enviado**.
2. Lee la confirmación, que lista los idiomas afectados. Se incluyen todas las ediciones sin enviar de esta clave, incluso las guardadas por otro compañero.
3. Elige **Revertir traducciones** para restaurar sus últimos valores publicados confirmados, o **Cancelar** para conservar las ediciones.

![The Revert confirmation naming the one language that goes back to its last confirmed version, with Cancel and Revert translations buttons](/guide/revert-confirm.webp "Check the listed languages, then choose Revert translations.")

Si hay una sincronización en curso, Malmoi muestra **Sincronizando…** con la hora más próxima en que podrás volver a revertir, y no se revierte nada. Si no hay un valor publicado anterior para algún idioma afectado, no se revierte nada. Si alguien cambia los valores mientras el cuadro de diálogo está abierto, elige **Revisar de nuevo** antes de confirmar. Revertir deja **Por revisar** sin cambios.

## Sincroniza desde el repositorio {#resync}

1. Elige **Sincronizar** en la parte superior de **Inicio** o de **Traducciones**.
2. Si hay ediciones sin enviar, el cuadro de diálogo indica cuántas se descartarán.
3. Elige **Descartar cambios y sincronizar** cuando hay ediciones sin enviar, o **Sincronizar desde el repositorio** cuando no hay ninguna. Cierra el cuadro de diálogo para conservar los cambios.
4. Espera en el cuadro de diálogo. Permanece abierto mientras se ejecuta Sincronizar y muestra el resultado en el mismo lugar, bajo un título que nombra el desenlace; elige **Cerrar** cuando lo hayas leído.

![The Sync confirmation warning that one unsent edit will be discarded, with a Discard changes and sync button](/guide/sync-discard.webp "Check how many edits will be discarded before you sync.")

Solo los propietarios del proyecto pueden usar Sincronizar; los editores lo ven desactivado en Traducciones. Si ya había otra sincronización en curso cuando abriste la página, **Sincronizar** aparece desactivado con ese motivo. Mientras se ejecuta Sincronizar, nadie puede guardar ni revertir traducciones en este proyecto; ven **Sincronizando…** con la hora más próxima en que podrán volver a guardar, y su texto se conserva. Si el cuadro de diálogo no muestra ningún resultado después de aproximadamente un minuto, indica que el resultado estará en [Registros](logs.md) y te permite cerrarlo. Sincronizar lee directamente los archivos de la rama base. El resultado lista cualquier fuente que no se pudo leer o no se reemplazó. Los archivos que se leyeron correctamente aportan los valores de reemplazo. Las ediciones guardadas después de que confirmaste, y las ediciones que no se pudieron reemplazar, siguen guardadas; revisa el recuento de ediciones restantes en el resultado.

## Qué pasa después {#next}

Revisa el resultado para ver las fuentes que fallaron o no se reemplazaron antes de continuar. No necesitas ejecutar el workflow para terminar una sincronización manual.
