# Fusiona el pull request

Revisa el pull request generado en GitHub y fusiónalo para devolver las traducciones a tu repositorio.

Antes de empezar: necesitas permiso para fusionar pull requests en el repositorio. El pull request contiene los archivos de traducción generados desde Malmoi.

## Fusiona el pull request de traducciones {#merging}

1. Abre el pull request de traducciones en GitHub y revisa sus archivos modificados.
2. Fusiónalo con la política habitual de tu repositorio. Se admiten squash, rebase y commits de fusión.

## Conserva el marcador anti-bucle {#skip-marker}

Malmoi añade `[skip-malmoi-i18n]` al título del pull request. Consérvalo: si lo quitas, el workflow se ejecuta de nuevo sin motivo. La siguiente publicación lo vuelve a añadir si se quitó.

## Qué pasa después {#next}

Cuando el pull request se fusiona, el repositorio contiene las traducciones publicadas.
