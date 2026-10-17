# Publica tus cambios

Revisa los cambios de traducción guardados y publícalos para que el equipo de desarrollo los revise en GitHub o GitLab.

Antes de empezar: guarda los valores que quieres publicar. Publicar incluye todas las ediciones guardadas sin enviar del proyecto, no solo las tuyas.

## Previsualiza los cambios guardados {#preview}

Malmoi reúne los archivos en una única solicitud de cambios (un *pull request* en GitHub, o una *merge request* en GitLab). No necesitas una cuenta de GitHub ni de GitLab; el equipo de desarrollo lo revisa y lo fusiona.

![La página de inicio de un proyecto con una edición por enviar y un botón Publicar activo que muestra el recuento](/guide/home-publish.webp "Publicar está en la parte superior de Inicio.")

1. Elige **Publicar** en la parte superior de **Inicio** o de **Traducciones**.
2. Revisa en la vista previa los textos (claves) y los idiomas y usa la acción que se describe abajo.

![La vista previa de publicación con 14 cambios agrupados por archivo, cada uno con su clave, idioma, valor anterior y nuevo y quién lo editó, y un botón para abrir una nueva pull request](/guide/publish-preview.webp "Revisa cada cambio antes de publicar.")

## Publica los cambios {#publish}

Elige **Abrir pull request** o Reemplazar pull request #N. Si tus cambios ya coinciden con los archivos y no hay ningún pull request abierto, el botón es **Publicar**. Cuando hay un pull request abierto y los archivos coinciden, la acción es Cerrar pull request #N.

En un proyecto de GitLab, los mismos botones nombran una merge request, numerada como `!128`: **Abrir merge request**, Reemplazar la merge request !N y Cerrar la merge request !N.

Un propietario del proyecto también puede añadir o quitar un idioma, lo que sale en la misma publicación como un archivo de idioma nuevo o borrado. Cuando solo cambian archivos de idioma, la vista previa se titula **Publicar cambios de idioma**. Consulta [Publica el cambio](../setup/languages.md#publish).

Si Publicar está desactivado, puede que no haya ediciones sin enviar o que publicar no esté disponible temporalmente. Espera a que termine una sincronización en curso; pregunta a un propietario del proyecto si sigue sin estar disponible.

Si la acción falla, tus valores guardados se conservan. Inténtalo de nuevo más tarde o avisa a un propietario del proyecto.

## Lee el resultado {#result}

El resultado puede decir:

- **Enviado a revisión** — hay un pull request nuevo abierto para el equipo de desarrollo.
- **Tu pull request anterior ahora contiene esto** — se actualizó el pull request existente.
- **Nada cambió en los archivos** — no hay nada nuevo que publicar.
- Solicitud de idioma cerrada — la pull request de un cambio de idioma se cerró sin fusionarse, así que Malmoi cerró su solicitud. No se escribió nada en el repositorio.
- **Excluido — algunos valores no se pueden escribir en los archivos** o N ediciones no se enviaron — tus valores guardados se conservan. Indica a un propietario del proyecto qué archivos aparecen.
- Se cerró el pull request anterior — tus ediciones ahora coinciden con la rama base, así que ya no tenía nada que revisar.
- **GitHub no respondió** — tus valores guardados se conservan; inténtalo de nuevo más tarde.
- **No pudimos confirmar si tus cambios se enviaron.** Revisa **Registros** antes de intentarlo de nuevo.

En un proyecto de GitLab, los resultados nombran una merge request y GitLab, como **Tu merge request anterior ahora contiene esto** y **GitLab no respondió**.

![El resultado de publicación que indica que los archivos no cambiaron porque las ediciones ya estaban en el repositorio](/guide/publish-result.webp "Lee el resultado antes de cerrarlo.")

## Publicación automática {#nightly}

Si no publicas, los cambios guardados se publican automáticamente una vez por noche. Consulta [Cada noche](../sync/nightly.md#nightly) para ver los requisitos y el horario.

## Mientras el pull request está abierto {#open-pull-request}

Tus valores publicados están a salvo mientras el pull request espera revisión. Malmoi retiene las actualizaciones del repositorio hasta que el equipo de desarrollo lo fusione o lo cierre, así que el texto nuevo de la aplicación que venga del código puede tardar más en aparecer. Si el pull request se cierra sin fusionarse, la siguiente actualización desde el repositorio reemplaza esos valores por los del repositorio.

## Qué pasa después {#next}

El equipo de desarrollo revisa el pull request y lo fusiona en el repositorio.

Para consultarlo más tarde, abre la pestaña **Publicar** de Inicio. **Última publicación** muestra cómo se envió la publicación más reciente, **Publicado** muestra cuándo y **Cambiados** muestra cuántas traducciones cambió en los archivos. Cuando aparece, **Estado de la PR** indica si el pull request sigue abierto. En un proyecto de GitLab, estas filas son **Merge request** y **Estado de la MR**. **Registros de publicación** lista todas las publicaciones.
