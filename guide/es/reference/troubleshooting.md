# Solución de problemas

Encuentra el siguiente paso cuando falla el acceso a GitHub o GitLab, la configuración o la sincronización del repositorio.

## Restablece el acceso a GitHub {#github-access}

Si tu autorización de GitHub caducó, abre **Cuenta** y elige **Volver a autorizar la GitHub App**. Los métodos de inicio de sesión y el acceso a repositorios son independientes.

**Configuración** del proyecto muestra la conexión con el repositorio como una insignia, y cada insignia tiene su propio siguiente paso:

- **Desconectado** — las sincronizaciones y publicaciones se detienen hasta que se reconecte. Elige **Volver a conectar**. Si se quitó la app, la tarjeta también muestra un enlace **Instalar la app**: instálala, vuelve y reconecta.
- **Sin conectar** — aún no hay ninguna instalación conectada. Elige **Conectar**.
- **Repositorio incorrecto** — la dirección ahora apunta a un repositorio distinto. No hay ningún botón: compruébalo en GitHub y, si el repositorio realmente se sustituyó, crea un proyecto nuevo para él.
- **No se pudo comprobar** — Malmoi no puede comprobar la conexión en este momento. Vuelve a abrir la página antes de cambiar nada.

Si el repositorio no aparece, en Malmoi elige **Añadir repositorios** y luego, en GitHub, abre **Repository access** de la GitHub App. Si se quitó la app, elige **Instalar la app**.

## Restablece el acceso a GitLab {#gitlab-access}

En **Configuración** de un proyecto de GitLab, la tarjeta del repositorio muestra qué token usan las sincronizaciones y publicaciones, y cuándo caduca. En los 14 días anteriores a la caducidad, un aviso en la parte superior de la tarjeta indica cuántos días quedan y la tarjeta muestra **Caduca pronto**; después de esa fecha, el aviso indica que el token caducó y la tarjeta muestra **Desconectado**.

![La tarjeta Repositorio en la Configuración de un proyecto de GitLab muestra el proyecto como Conectado, qué token usa y cuándo caduca](/guide/gitlab-repository-card.webp "Comprueba qué token usa el proyecto y cuándo caduca.")

- Si el token es tuyo, la tarjeta muestra un campo de token: pega un token nuevo de la misma cuenta de GitLab en **Token de acceso personal** y elige **Reemplazar token**. Se actualizan todos los proyectos que usan tu conexión.
- Si el token es de otra persona, elige **Usar mi conexión de GitLab**. A partir de entonces, las sincronizaciones y publicaciones quedan a nombre de tu cuenta de GitLab. Si aún no has conectado GitLab, pega primero tu token en la tarjeta.

La conexión muestra **Desconectado**, y las sincronizaciones y publicaciones se detienen hasta que un propietario del proyecto la vuelva a conectar como se indica arriba, cuando:

- quien conectó el proyecto desconectó GitLab o dejó el proyecto, o
- el token no se puede usar: caducó, se revocó o su propietario perdió el acceso al repositorio.

Al conectar un token, Malmoi puede rechazarlo:

- Un token detallado (fine-grained) se rechaza. Crea un token de acceso personal clásico con el alcance `api`.
- Un token sin el alcance `api` se rechaza. Crea un token nuevo con ese alcance.
- **Reemplazar token** rechaza un token de otra cuenta de GitLab. Desconecta GitLab en **Cuenta** primero y luego conecta la otra cuenta.
- Si el grupo principal de GitLab bloquea los tokens de acceso personal clásicos, Malmoi no puede conectar los repositorios de ese grupo.
- Un proyecto de GitLab archivado debe desarchivarse primero en GitLab. Un proyecto que usa el formato de objetos SHA-256 no es compatible.
- Solo se admite GitLab.com, no GitLab Self-Managed ni GitLab Dedicated.

## Resuelve fallos del workflow {#workflow-failures}

Revisa en el registro de Actions la ruta del workflow generado, `PUSH_TOKEN`, las acciones permitidas y la rama base seleccionada. Una instalación ausente o una política de acciones pueden detener una ejecución antes de que la solicitud llegue al proyecto. Un 401 significa que el token es incorrecto o se rotó: elige **Rotar token** en **Configuración**, confirma con **Rotar y mostrar el nuevo token** y copia el valor en `PUSH_TOKEN`. Solo se muestra una vez, y el token de push anterior deja de funcionar al instante.

En GitLab, lee el registro del job en el pipeline. Si el job no encuentra `PUSH_TOKEN`, comprueba que la variable de CI/CD existe y que la rama base está protegida, porque una variable protegida solo llega a ramas protegidas. Después de rotar el token de push, actualiza la variable `PUSH_TOKEN`.

## Resuelve actualizaciones rechazadas {#rejected-updates}

Un 409 puede significar que el proyecto está archivado, que el proyecto o la fuente no coinciden, que el formato no coincide o que el commit está obsoleto. Un 400 significa que los archivos enviados por el workflow o el conjunto de archivos configurado no superaron la validación. Lee el motivo en el registro de la ejecución del workflow en GitHub Actions, o en el registro del job en GitLab, antes de cambiar la configuración del proyecto.

Si el registro de la ejecución muestra `deferred`, la actualización se retiene y Registros la muestra como **Retenido**. Si hay ediciones guardadas sin enviar, publícalas y ejecuta el workflow de nuevo. Con `open-pr`, sigue abierto un pull request de Malmoi (una merge request en GitLab): fusiónalo o ciérralo. Con `pr-check-failed`, Malmoi no pudo consultar GitHub o GitLab; ejecuta el workflow de nuevo más tarde.

Si **Publicar** está desactivado, puede que no haya nada sin enviar (“No hay nada que enviar — todas las ediciones ya se enviaron.”), que GitHub no esté conectado, que el proyecto esté archivado o que se esté ejecutando Sincronizar (“Publicar no está disponible en este momento.”). Consulta [Publica tus cambios](../translate/publish.md#publish) para el camino del editor. Los propietarios del proyecto pueden arreglar la conexión o esperar a Sincronizar.

Un commit que contiene `[skip-malmoi-i18n]` se omite; lee ese resultado en el registro de la ejecución del workflow.

## Qué pasa después {#next}

Usa el motivo que muestra el registro de la ejecución del workflow para elegir la reparación correspondiente.
