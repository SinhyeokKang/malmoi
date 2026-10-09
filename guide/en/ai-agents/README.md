# Connect an AI agent

Let an AI agent such as Claude Code, Codex, claude.ai, or Cursor work in Malmoi for you, by signing in through your browser or with a personal token.

Before you start: Sign in to Malmoi. To let the agent create projects, connect GitHub and install the GitHub App in [Account](../account/profile.md#github-connection) first.

The agent connects over MCP (Model Context Protocol) at your site's server address. To copy it, choose **Copy server URL** on the **Connected apps** card of the **MCP connector** page. Malmoi doesn't write translations itself: the agent writes the values, and Malmoi saves them as your edits, with the same checks as the browser.

There are two ways to connect. Claude Code, Codex, and claude.ai can [sign in through your browser](browser.md#browser): you add only the server address, approve the agent in Malmoi, and never copy a token. Agents that only accept a fixed header, such as Cursor, use a [personal token](token.md#token).
