# Use a personal token

Use a personal token for agents that can't sign in through your browser, such as Cursor.

## Create a token {#token}

1. Open **MCP connector** in the sidebar and choose **Create token**.
2. Under **Expires in**, choose 30, 90, or 365 days. Every token expires.
3. Under **Allowed actions**, check what the agent may change. Leave everything unchecked for a read-only token.
4. Under **Scope**, choose **All my projects** or **Chosen projects**.
5. Choose **Create**, then **Copy** the token. It is shown only once; choose **Done** after you have stored it.

![Step 1 of 2 of the Create token dialog with 90 days selected, Translate & publish checked, and All my projects chosen](/guide/mcp-create-token.webp "Choose the expiry, the allowed actions, and the scope, then create the token.")

Keep the token out of files and chat. Store it in the `MALMOI_TOKEN` environment variable of the shell that starts your agent, for example with `read -s MALMOI_TOKEN && export MALMOI_TOKEN` and then pasting the token. The connection snippets below read that variable, so the token itself never appears in a settings file.

You have one personal token at a time; connected apps don't count toward it. To change what it allows, choose **Rotate token**, then **Rotate and show new token**; the old token stops working immediately, and every agent using it stops until you give it the new one. **Revoke** stops the token without creating a new one. An expired token shows **Expired**; create a new one.

## Add Malmoi with a token {#connect}

The snippets below use `https://mal-moi.com/api/mcp`. To copy the server address of the site you are using, choose **Copy server URL** on the **Connected apps** card of the **MCP connector** page.

### Claude Code {#claude-code}

Add this to `.mcp.json` at the root of your project:

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

Add this to your Codex configuration file:

```toml title="~/.codex/config.toml"
[mcp_servers.malmoi]
url = "https://mal-moi.com/api/mcp"
bearer_token_env_var = "MALMOI_TOKEN"
```

### Cursor {#cursor}

Add this to `.cursor/mcp.json` in your project:

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

Restart the agent after adding the entry. If it reports `unauthorized`, the token is missing, expired, or revoked: check `MALMOI_TOKEN`, or rotate the token.

## What happens next {#next}

Ask the agent to work in Malmoi. See [What the agent can do](permissions.md#permissions) for what the token allows, and [Example prompts](prompts.md#prompts) for requests to start with.
