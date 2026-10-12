# Fusiona el pull request

Revisa el pull request generado en GitHub y fusiónalo para devolver las traducciones a tu repositorio.

Antes de empezar: necesitas permiso para fusionar pull requests en el repositorio, o merge requests en GitLab. El pull request contiene los archivos de traducción generados desde Malmoi.

## Fusiona el pull request de traducciones {#merging}

1. Abre el pull request de traducciones en GitHub y revisa sus archivos modificados.
2. Fusiónalo con la política habitual de tu repositorio. Se admiten squash, rebase y commits de fusión.

## Fusiona en GitLab {#merging-gitlab}

En un proyecto de GitLab, Malmoi abre en su lugar una merge request, numerada como `!128`.

1. Abre la merge request de traducciones en GitLab y revisa sus cambios.
2. Fusiónala con el método de fusión de tu proyecto. Se admiten commits de fusión, squash y fast-forward.

Si una publicación detecta que nada de la merge request difiere ya de la rama base, Malmoi la cierra con un comentario y borra su rama.

## Conserva el marcador anti-bucle {#skip-marker}

Malmoi añade `[skip-malmoi-i18n]` al título del pull request. Consérvalo: si lo quitas, el workflow se ejecuta de nuevo sin motivo. La siguiente publicación lo vuelve a añadir si se quitó.

En GitLab, el marcador está en el título de la merge request y en el commit de Malmoi. Si tu proyecto de GitLab usa su propia plantilla de mensaje para commits de fusión o de squash, conserva `%{title}` en ella; si no, el marcador no llega a la rama base y los jobs de CI se ejecutan de nuevo sin motivo.

## Qué pasa después {#next}

Cuando el pull request se fusiona, el repositorio contiene las traducciones publicadas.
