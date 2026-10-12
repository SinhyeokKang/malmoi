# Soluciona problemas de GitHub

Encuentra el siguiente paso cuando falla el acceso a GitHub, el workflow o una actualización del repositorio.

## Restablece el acceso a GitHub {#github-access}

Si tu autorización de GitHub caducó, abre **Cuenta** y elige **Volver a autorizar la GitHub App**. Los métodos de inicio de sesión y el acceso a repositorios son independientes.

**Configuración** del proyecto muestra la conexión con el repositorio como una insignia, y cada insignia tiene su propio siguiente paso:

- **Desconectado** — las sincronizaciones y publicaciones se detienen hasta que se reconecte. Elige **Volver a conectar**. Si se quitó la app, la tarjeta también muestra un enlace **Instalar la app**: instálala, vuelve y reconecta.
- **No conectado** — aún no hay ninguna instalación conectada. Elige **Conectar**.
- **Repositorio incorrecto** — la dirección ahora apunta a un repositorio distinto. No hay ningún botón: compruébalo en GitHub y, si el repositorio realmente se sustituyó, crea un proyecto nuevo para él.
- **No se pudo comprobar** — Malmoi no puede comprobar la conexión en este momento. Vuelve a abrir la página antes de cambiar nada.

![La tarjeta Repositorio en la Configuración del proyecto con el repositorio marcado como Conectado, un botón para abrirlo en GitHub y la rama base](/guide/github-repository-card.webp "Comprueba la insignia de la tarjeta Repositorio antes de cambiar nada.")

## Encuentra un repositorio que no aparece {#repository-not-listed}

Al crear un proyecto, el primer paso solo lista los repositorios a los que la GitHub App puede acceder. Si una búsqueda no encuentra nada, la app aún no tiene acceso a ese repositorio.

1. Debajo de la lista, elige **Añadir repositorios**. GitHub abre la instalación de la app.
2. En **Repository access**, añade el repositorio y guarda.
3. Vuelve a Malmoi; el repositorio aparece ahora en la lista.

Si la app ya no está instalada en ninguna de tus cuentas u organizaciones, el primer paso vuelve a mostrar **Instalar la GitHub App**; instálala desde ahí.

![El paso 1 de 4 de Nuevo proyecto con una búsqueda sin repositorios coincidentes, un botón Borrar búsqueda y el enlace Añadir repositorios debajo](/guide/repository-not-listed.webp "Elige Añadir repositorios para dar a la app acceso al repositorio.")

## Resuelve fallos del workflow {#workflow-failures}

Revisa en el registro de Actions la ruta del workflow generado, `PUSH_TOKEN`, las acciones permitidas y la rama base seleccionada. Una instalación ausente o una política de acciones pueden detener una ejecución antes de que la solicitud llegue al proyecto. Un 401 significa que el token es incorrecto o se rotó:

1. En **Configuración** del proyecto, elige **Rotar token** en **Integración con CI**.
2. Confirma con **Rotar y mostrar el nuevo token** y copia el token nuevo. Solo se muestra una vez, y el token de push anterior deja de funcionar al instante.
3. Pega el token nuevo en el secreto `PUSH_TOKEN` del repositorio y ejecuta el workflow de nuevo.

![El diálogo para rotar el token de push en la Configuración del proyecto, que avisa de que el token actual deja de funcionar, con los botones Cancelar y Rotar y mostrar el nuevo token](/guide/rotate-token.webp "Rota el token solo cuando puedas actualizar el secreto PUSH_TOKEN de inmediato.")

## Resuelve actualizaciones rechazadas {#rejected-updates}

Un 409 puede significar que el proyecto está archivado, que el proyecto o la fuente no coinciden, que el formato no coincide o que el commit está obsoleto. Un 400 significa que los archivos enviados por el workflow o el conjunto de archivos configurado no superaron la validación. Lee el motivo en el registro de la ejecución del workflow en GitHub Actions antes de cambiar la configuración del proyecto.

Si el registro de la ejecución muestra `deferred`, la actualización se retiene y Registros la muestra como **Retenido**. Si hay ediciones guardadas sin enviar, publícalas y ejecuta el workflow de nuevo. Con `open-pr`, sigue abierto un pull request de Malmoi: fusiónalo o ciérralo. Con `pr-check-failed`, Malmoi no pudo consultar GitHub; ejecuta el workflow de nuevo más tarde.

Si **Publicar** está desactivado, puede que no haya nada sin enviar (“No hay nada que enviar — todas las ediciones ya se enviaron.”), que el repositorio no esté conectado, que el proyecto esté archivado o que se esté ejecutando Sincronizar (“Publicar no está disponible en este momento.”). Consulta [Publica tus cambios](../translate/publish.md#publish) para el camino del editor. Los propietarios del proyecto pueden arreglar la conexión o esperar a Sincronizar.

Un commit que contiene `[skip-malmoi-i18n]` se omite; lee ese resultado en el registro de la ejecución del workflow.

## Qué pasa después {#next}

Usa el motivo que muestra el registro de la ejecución del workflow para elegir la reparación correspondiente. Para repositorios en otro servicio, consulta [Soluciona problemas de GitLab](../gitlab/troubleshooting.md).
