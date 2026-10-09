# Inicia sesión desde el navegador

Claude Code, Codex y claude.ai pueden conectarse iniciando sesión en Malmoi en tu navegador, así que nunca copias un token.

## Conecta tu agente {#browser}

1. Añade la dirección del servidor a tu agente. Para copiarla, elige **Copiar URL del servidor** en la tarjeta **Apps conectadas** de la página **Conector MCP** y úsala en lugar de `SERVER_URL` en los fragmentos de abajo. No llevan ningún token.
2. Inicia el inicio de sesión desde tu agente (consulta la línea siguiente bajo cada fragmento). Tu navegador abre **Conectar una app a Malmoi**.
3. Si no has iniciado sesión en Malmoi, elige **Continuar con GitHub** o **Continuar con Google**. Vuelves a la misma pantalla. Si la cuenta que aparece no es la tuya, elige **¿No eres tú?** para cambiar.
4. Comprueba el nombre de la aplicación y la dirección que aparece debajo. La aplicación eligió el nombre por sí misma, así que la dirección es lo que te indica qué aplicación lo pide.
5. Elige **Caduca en**, **Acciones permitidas** y **Alcance**, las mismas opciones que en un [token personal](token.md#token).
6. Elige **Autorizar**. Tu navegador devuelve al agente su conexión y vuelves al agente. **Denegar** despide al agente sin una conexión.

![La pantalla Conectar una app a Malmoi para Claude, con la cuenta que ha iniciado sesión y el enlace ¿No eres tú?, el nombre y la dirección de la app, la caducidad en 90 días y Traducir y publicar marcado en Acciones permitidas](/guide/oauth-consent.webp "Comprueba la dirección de la app y luego elige qué puede hacer.")

Si ya conectaste la misma aplicación antes, la pantalla lo indica: autorizar de nuevo reemplaza esa conexión, y la aplicación puede cerrar sesión en tus otros ordenadores. Una solicitud de inicio de sesión permanece abierta 10 minutos; si caduca o ya se respondió, empieza de nuevo desde el agente.

### Claude Code {#browser-claude-code}

Añade esto a `.mcp.json` en la raíz de tu proyecto:

```json title=".mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "type": "http",
      "url": "SERVER_URL"
    }
  }
}
```

Luego ejecuta `/mcp` en Claude Code, elige el servidor que acabas de añadir y elige Authenticate. Tu navegador se abre para iniciar sesión en Malmoi.

Si la entrada ya tiene una línea `headers` con un token personal, quítala primero. Mientras esté ahí, Claude Code sigue usando el token.

### Codex {#browser-codex}

Añade esto al archivo de configuración de Codex:

```toml title="~/.codex/config.toml"
[mcp_servers.malmoi]
url = "SERVER_URL"
```

Luego ejecuta `codex mcp login` seguido del nombre del servidor del fragmento. Tu navegador se abre para iniciar sesión en Malmoi.

Si la entrada ya tiene una línea `bearer_token_env_var`, quítala primero. Mientras esté ahí, Codex sigue usando el token.

### claude.ai {#browser-claude-ai}

claude.ai se conecta desde sus propios ajustes, así que no hay ningún archivo que editar.

1. En claude.ai, abre **Customize** → **Connectors**, elige **Add** y luego **Add custom connector**.
2. Pega la dirección del servidor que copiaste y ponle un nombre, como Malmoi.
3. Elige **Connect**. Se abre una ventana para iniciar sesión en Malmoi y autorizar, como en los pasos anteriores.

En un plan Team o Enterprise, solo el propietario de tu organización de claude.ai puede añadir un conector personalizado; pídele que añada Malmoi primero y luego elige **Connect** tú mismo. Un plan Free permite un conector personalizado.

## Apps conectadas {#connected-apps}

Cada agente que autorizas aparece en **Apps conectadas**, en la página **Conector MCP**, con una conexión por aplicación, con sus acciones permitidas, su alcance, cuándo se usó por última vez y cuándo caduca.

1. Abre **Conector MCP** en la barra lateral.
2. Busca la aplicación. Dos conexiones pueden tener el mismo nombre; la dirección bajo el nombre las distingue.
3. Elige **Desconectar** y luego **Desconectar app**.

![La página del conector MCP con dos apps conectadas, Claude Code y una app de Codex identificada por su dirección, cada una con sus acciones permitidas, alcance, último uso, caducidad y botón Desconectar, encima de la tarjeta de token personal](/guide/mcp-connector.webp "Desconecta una app que ya no uses.")

La aplicación pierde el acceso desde su siguiente solicitud. Tus otras aplicaciones y tu token personal siguen funcionando. Quitar el conector dentro de claude.ai no lo desconecta aquí; elige **Desconectar** para terminarlo. Una conexión que caducó sigue en la lista con **Caducada**; autoriza la aplicación de nuevo desde el agente para seguir usándola.

## Qué pasa después {#next}

Pide al agente que trabaje en Malmoi. Consulta [Qué puede hacer el agente](permissions.md#permissions) para ver qué puede cambiar, y [Ejemplos de prompts](prompts.md#prompts) para ver peticiones con las que empezar.
