# Ejemplos de prompts

Esto es lo que hace el agente ante algunas peticiones habituales, y qué comprobar después de cada una.

## Prompts para probar {#prompts}

### Conecta este repo a Malmoi {#connect-repo}

El agente lista tus repositorios, detecta los archivos de traducción y crea el proyecto con su primera sincronización, como [Crea un proyecto](../setup/create-project.md) en el navegador. El resultado incluye el archivo de workflow y un token de push. Pide al agente que haga commit del archivo de workflow en la rama base que elegiste, después de guardar el token de push.

Si falta tu conexión con GitHub o la GitHub App de Malmoi, el agente devuelve un enlace a **Cuenta**. Termina allí en el navegador y pide al agente que lo intente de nuevo. Si no se encuentran archivos de traducción, el enlace abre la configuración del proyecto en el navegador, donde puedes elegir el formato tú mismo.

### Guarda el token de push {#push-token}

El token de push aparece una sola vez en la conversación del agente, que tu agente también envía a su proveedor de IA. Si eso importa, rótalo más tarde desde **Configuración** en el navegador. Pide al agente que lo guarde como el secreto `PUSH_TOKEN` del repositorio pasándolo por la entrada estándar:

```text
gh secret set PUSH_TOKEN --repo OWNER/REPO
```

Sustituye `OWNER/REPO` por el repositorio. No añadas `--body`; `--body -` guardaría un único guion. El nombre debe seguir siendo `PUSH_TOKEN`, porque el workflow lee ese secreto. Consulta [Añade el workflow](../setup/workflow.md#push-token) para el resto de la configuración.

### Rellena las traducciones vacías en fr y publica {#fill-and-publish}

El agente encuentra las claves sin valor en francés, las escribe y las guarda. Luego previsualiza los cambios y los publica como un único pull request, como **Publicar** en el navegador. Registros muestra los guardados y la publicación a tu nombre.

Revisa el pull request antes de fusionarlo. El agente solo puede publicar si el token permite **Traducir y publicar**.

## Qué pasa después {#next}

Consulta [Registros](../sync/logs.md) para ver qué cambió el agente. En la página **Conector MCP**, desconecta una aplicación o rota o revoca el token cuando ya no lo necesites.
