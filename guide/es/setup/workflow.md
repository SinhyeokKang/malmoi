# Añade el workflow

Añade el workflow de GitHub Actions generado, o los jobs de CI generados para un proyecto de GitLab, para que los cambios del repositorio lleguen a Malmoi.

Antes de empezar: ten a mano el token de push de la página **Malmoi está listo**. Guarda el secreto antes de confirmar (commit) el archivo del workflow.

## Guarda el secreto {#push-token}

1. En GitHub, abre **Settings** del repositorio, elige **Secrets and variables** y luego **Actions**.
2. Elige **New repository secret**, escribe `PUSH_TOKEN`, pega el token de push y guárdalo.

![El formulario de nuevo secreto de GitHub con PUSH_TOKEN como nombre y el campo del secreto vacío](/guide/push-token-secret.webp "Introduce PUSH_TOKEN como nombre, pega el token de push y añade el secreto.")

## Añade el workflow {#workflow}

1. Copia el workflow de la página **Malmoi está listo**, o más tarde desde **Configuración**, y guárdalo como `.github/workflows/malmoi-i18n.yml` en el repositorio.
2. Si tu organización restringe las acciones, sigue [Permite las acciones](allowed-actions.md).
3. Haz commit del archivo en la rama base que elegiste durante la configuración. El workflow generado tiene un paso por cada fuente.

![El diálogo Archivo del flujo de trabajo en la Configuración de Malmoi con el YAML generado y un botón Copiar](/guide/workflow-file.webp "Copia el YAML y guárdalo como .github/workflows/malmoi-i18n.yml.")

Si tu código lee las traducciones mediante una función envoltorio distinta de la predeterminada `@/i18n#t`, añade la entrada `wrapper` en el `with:` de ese paso. Usa `module#export` para una función directa, o añade `()` para un hook, como `next-intl#useTranslations()`. Para varios envoltorios, usa un bloque YAML `|` con uno por línea. La configuración no pide esta entrada. Ayuda a Malmoi a encontrar referencias de código; no decide qué claves de traducción existen.

La entrada `github-token` es de solo lectura y se usa únicamente para avisar de un pull request abierto.

### Actualiza un workflow antiguo {#update-workflow}

Un workflow que usa `malmoi-i18n-push-v1` o `malmoi-i18n-push-v2` sigue funcionando sin cambios. Para pasar a `malmoi-i18n-push-v3`, abre **Configuración** en Malmoi, elige **Archivo del flujo de trabajo**, copia el archivo completo y reemplaza `.github/workflows/malmoi-i18n.yml` con él. Luego vuelve a añadir lo que hubieras cambiado a mano, como una entrada `wrapper`, un `api-url` personalizado o disparadores editados. El archivo generado no los incluye, y si falta `wrapper` la ejecución sigue en verde mientras las referencias de código dejan de aparecer. La versión 3 avisa en el registro de la ejecución cuando una actualización se retiene porque hay un pull request de Malmoi abierto o no se pudo comprobar, y un valor que Malmoi no gestiona, como un número en un archivo YAML, ya no hace fallar la ejecución — esa clave se omite con una advertencia. Si vienes de la versión 1, también se aplican los cambios de la versión 2: se ejecuta en Node 24, así que la advertencia de obsolescencia de Node 20 desaparece del registro de la ejecución, y hace fallar algunas ejecuciones que la versión 1 dejaba pasar, como una clave definida dos veces en un archivo JSON o YAML, un `api-url` que no es HTTPS o un archivo de idioma que no se puede leer. Un workflow generado por un Malmoi autoalojado siempre incluye una línea `api-url` con la dirección de ese sitio, así que viene en el archivo copiado; consérvala.

## Añade los jobs de GitLab CI {#gitlab-ci}

Un proyecto de GitLab usa jobs de CI en `.gitlab-ci.yml` en lugar de un workflow de GitHub Actions. [Permite las acciones](allowed-actions.md) no se aplica.

1. En GitLab, abre **Settings** › **CI/CD** del proyecto, despliega **Variables** y selecciona **Add variable**. Llámala `PUSH_TOKEN`, pega el token de push como valor, selecciona **Protect variable** y deja **Visibility** en **Masked**.
2. Comprueba que la rama base que elegiste está protegida en GitLab; GitLab protege la rama predeterminada salvo que lo hayas cambiado. Una variable protegida solo llega a ramas protegidas, así que en una rama sin proteger los jobs fallan sin `PUSH_TOKEN`.
3. Copia los jobs de la página **Malmoi está listo**, o más tarde desde **Configuración** con **Archivo de CI**, y añádelos a `.gitlab-ci.yml` en la raíz del repositorio. Si el archivo ya existe, añádelos a él.
4. Haz commit del archivo en la rama base.

Hay un job por cada fuente, y los nombres de los jobs incluyen la dirección del proyecto, así que dos proyectos de un mismo repositorio no sobrescriben los jobs del otro. Los jobs solo se ejecutan con commits nuevos en la rama base y omiten los commits que contienen `[skip-malmoi-i18n]`. Usan la etapa `test`; si tu archivo define su propia lista `stages:`, conserva `test` en ella. El runner debe poder llegar a github.com (cada job descarga el script de Malmoi en una versión fija), registry.npmjs.org y Malmoi.

Si tu código lee las traducciones mediante una función envoltorio, añade `MALMOI_I18N_WRAPPER` en el `variables:` del job de esa fuente, con un envoltorio por línea, en el mismo formato que la entrada `wrapper` de arriba. Para cambiar la rama base más adelante, cambia **Rama base** en **Configuración** y edita el valor `MALMOI_I18N_BASE_BRANCH`. Cuando añadas fuentes, vuelve a copiar el archivo completo desde **Configuración** y reemplaza con él los jobs de Malmoi.

Si Malmoi indica que el archivo de CI de GitLab aún no está disponible en esta versión de Malmoi, no hay jobs que copiar. Guarda el token de push; hasta que el archivo de CI esté disponible, la [ejecución nocturna](../sync/nightly.md#repository-changes) y **Sincronizar** cargan los cambios del repositorio.

## Ejecútalo y compruébalo {#first-run}

Al hacer commit del workflow en la rama base, se inicia. Para ejecutarlo de nuevo, abre **Actions** en GitHub, elige el workflow y elige **Run workflow**. Revisa el registro de la ejecución: `applied` significa que los archivos se cargaron y **Fuentes** está actualizado en Malmoi. Una ejecución en verde también puede informar `deferred` cuando hay ediciones sin enviar — la actualización se retiene y Registros la muestra como **Retenido**; consulta [Cuando cambia el código](../sync/push.md#deferred). Una ejecución fallida muestra su motivo en el registro. En GitLab, los jobs empiezan cuando haces commit en la rama base; para ejecutarlos de nuevo, vuelve a ejecutar el job desde su pipeline, y lee los mismos resultados en el registro del job. En Malmoi, la pestaña **Sincronizar** de Inicio muestra la última sincronización: **Sincronización de CI** como **Última sincronización**, su **Resultado** y cuántas traducciones cambió en **Cambiados**. **Registros de sincronización** lista todas las sincronizaciones.

Para cambiar la rama base más adelante, cambia **Rama base** en **Configuración**, elige **Guardar** y edita el valor `branches:` del workflow. Si cambias el idioma base de una fuente, sigue [Añade fuentes](sources.md#base-language) para actualizar la entrada del workflow.

## Qué pasa después {#next}

Tras la primera ejecución correcta, Malmoi puede mostrar referencias de código para las claves. El proyecto sigue estando listo aunque una ejecución posterior falle.
