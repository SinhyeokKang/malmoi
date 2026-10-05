# Conecta un agente de IA

Deja que un agente de IA como Claude Code, Codex, claude.ai o Cursor trabaje en Malmoi por ti, iniciando sesión desde el navegador o con un token personal.

Antes de empezar: inicia sesión en Malmoi. Para que el agente pueda crear proyectos, conecta primero GitHub e instala la GitHub App de Malmoi en [Cuenta](../account/profile.md#github-connection).

El agente se conecta mediante MCP (Model Context Protocol) en `https://mal-moi.com/api/mcp`. Malmoi no escribe traducciones por sí mismo: el agente escribe los valores y Malmoi los guarda como tus ediciones, con las mismas comprobaciones que en el navegador.

Hay dos formas de conectar. Claude Code, Codex y claude.ai pueden [iniciar sesión desde el navegador](browser.md#browser): solo añades la dirección del servidor, apruebas al agente en Malmoi y nunca copias un token. Los agentes que solo aceptan una cabecera fija, como Cursor, usan un [token personal](token.md#token).
