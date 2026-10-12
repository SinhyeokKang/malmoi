# Añade los jobs de GitLab CI

Añade los jobs de CI generados a tu proyecto de GitLab para que los cambios del repositorio lleguen a Malmoi.

Antes de empezar: ten a mano el token de push de la página **Malmoi está listo**. Guarda la variable de CI/CD antes de hacer commit de los jobs.

## Guarda el token de push {#ci-variable}

1. En GitLab, abre **Settings** › **CI/CD** del proyecto, despliega **Variables** y selecciona **Add variable**. Llámala `PUSH_TOKEN`, pega el token de push como valor, selecciona **Protect variable** y deja **Visibility** en **Masked**.

![El formulario Add variable de GitLab con PUSH_TOKEN como clave, la visibilidad Masked y Protect variable seleccionado](/guide/gitlab-ci-variable.webp "Llámala PUSH_TOKEN, deja Masked, selecciona Protect variable y pega el token como valor.")

## Protege la rama base {#protected-branch}

1. Comprueba que la rama base que elegiste está protegida en GitLab; GitLab protege la rama predeterminada salvo que lo hayas cambiado. Una variable protegida solo llega a ramas protegidas, así que en una rama sin proteger los jobs fallan sin `PUSH_TOKEN`. No protejas las ramas `malmoi-i18n/sync-*` de Malmoi, tampoco con una regla comodín: Publicar escribe en ellas y falla mientras estén protegidas.

![La configuración Protected branches de GitLab con la rama predeterminada main protegida y Maintainers con permiso para fusionar y hacer push](/guide/gitlab-protected-branch.webp "Comprueba que la rama base aparece en Protected branches.")

## Añade los jobs de CI {#gitlab-ci}

1. Copia los jobs de la página **Malmoi está listo**, o más tarde desde **Configuración** con **Archivo de CI**, y añádelos a `.gitlab-ci.yml` en la raíz del repositorio. Si el archivo ya existe, añádelos a él.
2. Haz commit del archivo en la rama base.

Hay un job por cada fuente, y los nombres de los jobs incluyen la dirección del proyecto, así que dos proyectos de un mismo repositorio no sobrescriben los jobs del otro. Los jobs solo se ejecutan con commits nuevos en la rama base y omiten los commits que contienen `[skip-malmoi-i18n]`. Usan la etapa `test`; si tu archivo define su propia lista `stages:`, conserva `test` en ella. El runner debe poder llegar a `github.com` (cada job descarga el script de Malmoi en una versión fija), `registry.npmjs.org`, Docker Hub (los jobs usan la imagen oficial de Node.js) y Malmoi.

Si tu código lee las traducciones mediante una función envoltorio, rellena `MALMOI_I18N_WRAPPER` (vacío de forma predeterminada) en el `variables:` del job de esa fuente, con un envoltorio por línea. Usa `module#export` para una función directa, o añade `()` para un hook, como `next-intl#useTranslations()`. Ayuda a Malmoi a encontrar referencias de código; no decide qué claves de traducción existen. Para cambiar la rama base más adelante, cambia **Rama base** en **Configuración** y edita el valor `MALMOI_I18N_BASE_BRANCH`. Cuando añadas fuentes, vuelve a copiar el archivo completo desde **Configuración** y reemplaza con él los jobs de Malmoi.

## Si el archivo de CI no está disponible {#ci-unavailable}

Si Malmoi indica que el archivo de CI de GitLab aún no está disponible en esta versión de Malmoi, no hay jobs que copiar. Guarda igualmente el token de push; hasta que el archivo de CI esté disponible, la [ejecución nocturna](../sync/nightly.md#repository-changes) y **Sincronizar** cargan los cambios del repositorio.

![El diálogo Archivo de CI en la Configuración de Malmoi indica que el archivo de CI de GitLab aún no está disponible en esta versión de Malmoi](/guide/gitlab-ci-file.webp "Hasta que el archivo de CI esté disponible, guarda el token de push; la ejecución nocturna y Sincronizar cargan los cambios del repositorio.")

## Ejecútalo y compruébalo {#first-run}

Al hacer commit de los jobs en la rama base, se inician. Para ejecutarlos de nuevo, vuelve a ejecutar el job desde su pipeline. Revisa el registro del job: `applied` significa que los archivos se cargaron y **Fuentes** está actualizado en Malmoi. Un job correcto también puede informar `deferred` cuando hay ediciones sin enviar — la actualización se retiene y Registros la muestra como **Retenido**; consulta [Cuando cambia el código](../sync/push.md#deferred). Un job fallido muestra su motivo en el registro. En Malmoi, la pestaña **Sincronizar** de Inicio muestra la última sincronización: **Sincronización de CI** como **Última sincronización**, su **Resultado** y cuántas traducciones cambió en **Cambiados**. **Registros de sincronización** lista todas las sincronizaciones.

## Qué pasa después {#next}

Tras la primera ejecución correcta, Malmoi puede mostrar referencias de código para las claves. El proyecto sigue estando listo aunque una ejecución posterior falle.
