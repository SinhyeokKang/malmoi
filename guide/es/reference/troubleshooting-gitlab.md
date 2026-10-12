# Soluciona problemas de GitLab

Encuentra el siguiente paso cuando falla el acceso a GitLab, los jobs de CI o una actualización del repositorio.

## Restablece el acceso a GitLab {#gitlab-access}

En **Configuración** de un proyecto de GitLab, la tarjeta del repositorio muestra qué token usan las sincronizaciones y publicaciones, y cuándo caduca. En los 14 días anteriores a la caducidad, un aviso en la parte superior de la tarjeta indica cuántos días quedan y la tarjeta muestra **Caduca pronto**; después de esa fecha, el aviso indica que el token caducó y la tarjeta muestra **Desconectado**.

![La tarjeta Repositorio en la Configuración de un proyecto de GitLab muestra el proyecto como Conectado, qué token usa y cuándo caduca](/guide/gitlab-repository-card.webp "Comprueba qué token usa el proyecto y cuándo caduca.")

- Si el token es tuyo, la tarjeta muestra un campo de token: pega un token nuevo de la misma cuenta de GitLab en **Token de acceso personal** y elige **Reemplazar token**. Se actualizan todos los proyectos que usan tu conexión.
- Si el token es de otra persona, elige **Usar mi conexión de GitLab**. A partir de entonces, las sincronizaciones y publicaciones quedan a nombre de tu cuenta de GitLab. Si aún no has conectado GitLab, pega primero tu token en la tarjeta.

![La tarjeta Repositorio con un aviso de que el token caduca en 11 días, la insignia Caduca pronto y un campo Token de acceso personal vacío con Reemplazar token](/guide/gitlab-token-expiring.webp "Antes de esa fecha, pega un token nuevo de la misma cuenta y elige Reemplazar token.")

La conexión muestra **Desconectado**, y las sincronizaciones y publicaciones se detienen hasta que un propietario del proyecto la vuelva a conectar como se indica arriba, cuando:

- quien conectó el proyecto desconectó GitLab o dejó el proyecto, o
- el token no se puede usar: caducó, se revocó o su propietario perdió el acceso al repositorio.

## Corrige un token rechazado {#token-refused}

Al conectar o reemplazar un token, Malmoi lo comprueba con GitLab y, si lo rechaza, muestra el motivo debajo del texto de ayuda:

- Un token que GitLab no acepta —mal escrito, caducado o revocado— se rechaza. Crea un token nuevo y pégalo de nuevo.
- Un token detallado (fine-grained) se rechaza. Crea un token de acceso personal clásico con el alcance `api`.
- Un token sin el alcance `api` se rechaza. Crea un token nuevo con ese alcance.
- **Reemplazar token** rechaza un token de otra cuenta de GitLab. Desconecta GitLab en **Cuenta** primero y luego conecta la otra cuenta.
- Si el grupo principal de GitLab bloquea los tokens de acceso personal clásicos, Malmoi no puede conectar los repositorios de ese grupo.
- Un proyecto de GitLab archivado debe desarchivarse primero en GitLab. Un proyecto que usa el formato de objetos SHA-256 no es compatible.
- Solo se admite GitLab.com, no GitLab Self-Managed ni GitLab Dedicated.

![El diálogo para reemplazar el token de GitLab con un token pegado y un error que dice que GitLab no lo aceptó](/guide/gitlab-token-refused.webp "Crea un token nuevo en GitLab y pégalo de nuevo.")

## Resuelve fallos de los jobs de CI {#ci-failures}

Lee el registro del job en el pipeline. Si el job no encuentra `PUSH_TOKEN`, comprueba que la variable de CI/CD existe y que la rama base está protegida, porque una variable protegida solo llega a ramas protegidas. Un 401 significa que el token es incorrecto o se rotó:

1. En **Configuración** del proyecto, elige **Rotar token** en **Integración con CI**.
2. Confirma con **Rotar y mostrar el nuevo token** y copia el token nuevo. Solo se muestra una vez, y el token de push anterior deja de funcionar al instante.
3. Actualiza la variable de CI/CD `PUSH_TOKEN` del proyecto con el token nuevo y ejecuta el job de nuevo.

## Resuelve actualizaciones rechazadas {#rejected-updates}

Un 409 puede significar que el proyecto está archivado, que el proyecto o la fuente no coinciden, que el formato no coincide o que el commit está obsoleto. Un 400 significa que los archivos enviados por el job o el conjunto de archivos configurado no superaron la validación. Lee el motivo en el registro del job antes de cambiar la configuración del proyecto.

Si el registro del job muestra `deferred`, la actualización se retiene y Registros la muestra como **Retenido**. Si hay ediciones guardadas sin enviar, publícalas y ejecuta el job de nuevo. Con `open-pr`, sigue abierta una merge request de Malmoi: fusiónala o ciérrala. Con `pr-check-failed`, Malmoi no pudo consultar GitLab; ejecuta el job de nuevo más tarde.

Si **Publicar** está desactivado, puede que no haya nada sin enviar (“No hay nada que enviar — todas las ediciones ya se enviaron.”), que el repositorio no esté conectado, que el proyecto esté archivado o que se esté ejecutando Sincronizar (“Publicar no está disponible en este momento.”). Consulta [Publica tus cambios](../translate/publish.md#publish) para el camino del editor. Los propietarios del proyecto pueden arreglar la conexión o esperar a Sincronizar.

Los jobs no se ejecutan para un commit que contiene `[skip-malmoi-i18n]`.

## Qué pasa después {#next}

Usa el motivo que muestra el registro del job para elegir la reparación correspondiente. Para repositorios en otro servicio, consulta [Soluciona problemas de GitHub](troubleshooting-github.md).
