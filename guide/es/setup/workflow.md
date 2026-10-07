# Añade el workflow

Añade el workflow de GitHub Actions generado para que los cambios del repositorio lleguen a Malmoi.

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

Un workflow que usa `malmoi-i18n-push-v1` sigue funcionando sin cambios. Para pasar a `malmoi-i18n-push-v2`, abre **Configuración** en Malmoi, elige **Archivo del flujo de trabajo**, copia el archivo completo y reemplaza `.github/workflows/malmoi-i18n.yml` con él. Luego vuelve a añadir lo que hubieras cambiado a mano, como una entrada `wrapper`, un `api-url` personalizado o disparadores editados. El archivo generado no los incluye, y si falta `wrapper` la ejecución sigue en verde mientras las referencias de código dejan de aparecer. La versión 2 se ejecuta en Node 24, así que la advertencia de obsolescencia de Node 20 desaparece del registro de la ejecución. También hace fallar algunas ejecuciones que la versión 1 dejaba pasar, como una clave definida dos veces en un archivo JSON o YAML, un `api-url` que no es HTTPS o un archivo de idioma que no se puede leer.

## Ejecútalo y compruébalo {#first-run}

Al hacer commit del workflow en la rama base, se inicia. Para ejecutarlo de nuevo, abre **Actions** en GitHub, elige el workflow y elige **Run workflow**. Revisa el registro de la ejecución: `applied` significa que los archivos se cargaron y **Fuentes** está actualizado en Malmoi. Una ejecución en verde también puede informar `deferred` cuando hay ediciones sin enviar — la actualización se retiene y Registros la muestra como **Retenido**; consulta [Cuando cambia el código](../sync/push.md#deferred). Una ejecución fallida muestra su motivo en el registro. En Malmoi, la pestaña **Sincronizar** de Inicio muestra la última sincronización: **Sincronización de CI** como **Última sincronización**, su **Resultado** y cuántas traducciones cambió en **Cambiados**. **Registros de sincronización** lista todas las sincronizaciones.

Para cambiar la rama base más adelante, cambia **Rama base** en **Configuración**, elige **Guardar** y edita el valor `branches:` del workflow. Si cambias el idioma base de una fuente, sigue [Añade fuentes](sources.md#base-language) para actualizar la entrada del workflow.

## Qué pasa después {#next}

Tras la primera ejecución correcta, Malmoi puede mostrar referencias de código para las claves. El proyecto sigue estando listo aunque una ejecución posterior falle.
