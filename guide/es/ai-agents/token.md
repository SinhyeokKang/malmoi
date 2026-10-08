# Usa un token personal

Usa un token personal para los agentes que no pueden iniciar sesión desde tu navegador, como Cursor.

## Crea un token {#token}

1. Abre **Conector MCP** en la barra lateral y elige **Crear token**.
2. En **Caduca en**, elige 30, 90 o 365 días. Todos los tokens caducan.
3. En **Acciones permitidas**, marca lo que el agente puede cambiar. Déjalo todo sin marcar para un token de solo lectura.
4. En **Alcance**, elige **Todos mis proyectos** o **Proyectos elegidos**.
5. Elige **Crear** y luego **Copiar** el token. Solo se muestra una vez; elige **Cerrar** cuando lo hayas guardado.

![El paso 1 de 2 del diálogo Crear token con 90 días seleccionados, Traducir y publicar marcado y Todos mis proyectos elegido](/guide/mcp-create-token.webp "Elige la caducidad, las acciones permitidas y el alcance y luego crea el token.")

No guardes el token en archivos ni en chats. Guárdalo en la variable de entorno `MALMOI_TOKEN` de la shell que inicia tu agente, por ejemplo con `read -s MALMOI_TOKEN && export MALMOI_TOKEN` y pegando después el token. Los fragmentos de conexión de abajo leen esa variable, así que el token en sí nunca aparece en un archivo de configuración.

Tienes un token personal a la vez; las aplicaciones conectadas no cuentan para él. Para cambiar lo que permite, elige **Rotar token** y luego **Rotar y mostrar el nuevo token**; el token anterior deja de funcionar al instante, y todos los agentes que lo usan se detienen hasta que les des el nuevo. **Revocar** detiene el token sin crear uno nuevo. Un token caducado muestra **Caducado**; crea uno nuevo.

## Añade Malmoi con un token {#connect}

Los fragmentos de abajo usan `https://mal-moi.com/api/mcp`. Para copiar la dirección del servidor del sitio que estás usando, elige **Copiar URL del servidor** en la tarjeta **Apps conectadas** de la página **Conector MCP**.

### Claude Code {#claude-code}

Añade esto a `.mcp.json` en la raíz de tu proyecto:

```json title=".mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "type": "http",
      "url": "https://mal-moi.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${MALMOI_TOKEN}"
      }
    }
  }
}
```

### Codex {#codex}

Añade esto al archivo de configuración de Codex:

```toml title="~/.codex/config.toml"
[mcp_servers.malmoi]
url = "https://mal-moi.com/api/mcp"
bearer_token_env_var = "MALMOI_TOKEN"
```

### Cursor {#cursor}

Añade esto a `.cursor/mcp.json` en tu proyecto:

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "url": "https://mal-moi.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MALMOI_TOKEN}"
      }
    }
  }
}
```

Reinicia el agente después de añadir la entrada. Si informa `unauthorized`, falta el token, caducó o se revocó: comprueba `MALMOI_TOKEN` o rota el token.

## Qué pasa después {#next}

Pide al agente que trabaje en Malmoi. Consulta [Qué puede hacer el agente](permissions.md#permissions) para ver qué permite el token, y [Ejemplos de prompts](prompts.md#prompts) para ver peticiones con las que empezar.
