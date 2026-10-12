# Fusiona la merge request

Revisa la merge request generada en GitLab y fusiónala para devolver las traducciones a tu repositorio.

Antes de empezar: necesitas permiso para fusionar merge requests en el proyecto de GitLab. La merge request contiene los archivos de traducción generados desde Malmoi.

## Fusiona la merge request de traducciones {#merging-gitlab}

Malmoi abre la merge request de traducciones numerada como `!128`.

1. Abre la merge request de traducciones en GitLab y revisa sus cambios.
2. Fusiónala con el método de fusión de tu proyecto. Se admiten commits de fusión, squash y fast-forward.

Si una publicación detecta que nada de la merge request difiere ya de la rama base, Malmoi la cierra con un comentario y borra su rama.

## Conserva el marcador anti-bucle {#skip-marker}

Malmoi añade `[skip-malmoi-i18n]` al título de la merge request y a su commit. Consérvalo en el título. Si tu proyecto de GitLab usa su propia plantilla de mensaje para commits de fusión o de squash, conserva `%{title}` en ella; si no, el marcador no llega a la rama base y los jobs de CI se ejecutan de nuevo sin motivo.

## Qué pasa después {#next}

Cuando la merge request se fusiona, el repositorio contiene las traducciones publicadas.
