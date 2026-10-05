# Solución de problemas

Encuentra el siguiente paso cuando falla el acceso a GitHub, la configuración o la sincronización del repositorio.

## Restablece el acceso a GitHub {#github-access}

Si tu autorización de GitHub caducó, abre **Cuenta** y elige **Volver a autorizar la GitHub App**. Los métodos de inicio de sesión y el acceso a repositorios son independientes.

**Configuración** del proyecto muestra la conexión con el repositorio como una insignia, y cada insignia tiene su propio siguiente paso:

- **Desconectado** — las sincronizaciones y publicaciones se detienen hasta que se reconecte. Elige **Volver a conectar**. Si se quitó la app, la tarjeta también muestra un enlace **Instalar la app**: instálala, vuelve y reconecta.
- **Sin conectar** — aún no hay ninguna instalación conectada. Elige **Conectar**.
- **Repositorio incorrecto** — la dirección ahora apunta a un repositorio distinto. No hay ningún botón: compruébalo en GitHub y, si el repositorio realmente se sustituyó, crea un proyecto nuevo para él.
- **No se pudo comprobar** — Malmoi no puede comprobar la conexión en este momento. Vuelve a abrir la página antes de cambiar nada.

Si el repositorio no aparece, en Malmoi elige **Elegir repositorios** y luego, en GitHub, abre **Repository access** de la GitHub App de Malmoi. Si se quitó la app, elige **Instalar la app**.

## Resuelve fallos del workflow {#workflow-failures}

Revisa en el registro de Actions la ruta del workflow generado, `PUSH_TOKEN`, las acciones permitidas y la rama base seleccionada. Una instalación ausente o una política de acciones pueden detener una ejecución antes de que la solicitud llegue al proyecto. Un 401 significa que el token es incorrecto o se rotó: elige **Rotar token** en **Configuración**, confirma con **Rotar y mostrar el nuevo token** y copia el valor en `PUSH_TOKEN`. Solo se muestra una vez, y el token de push anterior deja de funcionar al instante.

## Resuelve actualizaciones rechazadas {#rejected-updates}

Un 409 puede significar que el proyecto está archivado, que el proyecto o la fuente no coinciden, que el formato no coincide o que el commit está obsoleto. Un 400 significa que los archivos enviados por el workflow o el conjunto de archivos configurado no superaron la validación. Lee el motivo en el registro de la ejecución del workflow en GitHub Actions antes de cambiar la configuración del proyecto.

Si el registro de la ejecución muestra `deferred`, la actualización se retiene y Registros la muestra como **Retenido**. Si hay ediciones guardadas sin enviar, publícalas y ejecuta el workflow de nuevo. Con `open-pr`, sigue abierto un pull request de Malmoi: fusiónalo o ciérralo. Con `pr-check-failed`, Malmoi no pudo consultar GitHub; ejecuta el workflow de nuevo más tarde.

Si **Publicar** está desactivado, puede que no haya nada sin enviar (“No hay nada que enviar — todas las ediciones ya se enviaron.”), que GitHub no esté conectado, que el proyecto esté archivado o que se esté ejecutando Sincronizar (“Publicar no está disponible en este momento.”). Consulta [Publica tus cambios](../translate/publish.md#publish) para el camino del editor. Los propietarios del proyecto pueden arreglar la conexión o esperar a Sincronizar.

Un commit que contiene `[skip-malmoi-i18n]` se omite; lee ese resultado en el registro de la ejecución del workflow.

## Qué pasa después {#next}

Usa el motivo que muestra el registro de la ejecución del workflow para elegir la reparación correspondiente.
