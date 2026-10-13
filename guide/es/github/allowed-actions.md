# Permite las acciones

Permite las cuatro acciones que usa el workflow generado cuando tu repositorio u organización restringe GitHub Actions.

Antes de empezar: abre **Settings** del repositorio o de la organización y luego **Actions** → **General**.

## Permite las acciones necesarias {#allowed-actions}

1. Elige **Allow *OWNER*, and select non-*OWNER*, actions and reusable workflows**. GitHub muestra el nombre de tu cuenta u organización en lugar de OWNER. Añade los cuatro patrones separados por comas que aparecen abajo:

   ```text
   SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@*, actions/checkout@*, pnpm/action-setup@*, actions/setup-node@*
   ```

2. Guarda la política y ejecuta el workflow de nuevo.

![Los permisos de GitHub Actions con la opción de acciones seleccionadas marcada y los cuatro patrones introducidos](/guide/actions-policy.webp "Elige la opción de acciones seleccionadas, introduce los cuatro patrones y guarda.")

Cuando se bloquea una acción, la ejecución se detiene en **Set up job** con “not allowed to be used.” El token de push no puede cambiar esta política de GitHub.

## Qué pasa después {#next}

El workflow puede leer el repositorio cuando las cuatro acciones están permitidas. Si la ejecución sigue fallando, lee el motivo en su registro de GitHub Actions.
