# Connect an AI agent

Let a coding agent such as Claude Code, Codex, or Cursor work in Malmoi for you, by signing in through your browser or with a personal token.

Before you start: Sign in to Malmoi. To let the agent create projects, connect GitHub and install the Malmoi GitHub App in [Your account](account.md#github-connection) first.

The agent connects over MCP (Model Context Protocol) at `https://mal-moi.com/api/mcp`. Malmoi doesn't write translations itself: the agent writes the values, and Malmoi saves them as your edits, with the same checks as the browser.

There are two ways to connect. Claude Code and Codex can [sign in through your browser](#browser): you add only the server address, approve the agent in Malmoi, and never copy a token. Agents that only accept a fixed header, such as Cursor, use a [personal token](#token).

## Sign in through your browser {#browser}

1. Add the server address to your agent. The snippets below have no token in them.
2. Start the sign-in from your agent (see the next line under each snippet). Your browser opens **Connect an app to Malmoi**.
3. If you aren't signed in to Malmoi, choose **Continue with GitHub** or **Continue with Google**. You come back to the same screen. If the account shown isn't yours, choose **Not you?** to switch.
4. Check the app's name and the address under it. The app chose the name itself, so the address is what tells you which app is asking.
5. Choose **Expires in**, **Allowed actions**, and **Scope**, the same choices as a [personal token](#token).
6. Choose **Authorize**. Your browser hands the agent back its connection, and you return to the agent. **Deny** sends the agent away without a connection.

If you connected the same app before, the screen says so: authorizing again replaces that connection, and the app may be signed out on your other computers. A sign-in request stays open for 10 minutes; if it expires or was already answered, start again from the agent.

### Claude Code {#browser-claude-code}

Add this to `.mcp.json` at the root of your project:

```json title=".mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "type": "http",
      "url": "https://mal-moi.com/api/mcp"
    }
  }
}
```

Then run `/mcp` in Claude Code, pick `malmoi`, and choose Authenticate. Your browser opens to sign in to Malmoi.

If the entry already has a `headers` line with a personal token, remove it first. While it is there, Claude Code keeps using the token.

### Codex {#browser-codex}

Add this to your Codex configuration file:

```toml title="~/.codex/config.toml"
[mcp_servers.malmoi]
url = "https://mal-moi.com/api/mcp"
```

Then run `codex mcp login malmoi`. Your browser opens to sign in to Malmoi.

If the entry already has a `bearer_token_env_var` line, remove it first. While it is there, Codex keeps using the token.

## Connected apps {#connected-apps}

Every agent you authorize is listed under **Connected apps** on the **MCP connector** page, one connection per app, with its allowed actions, scope, when it was last used, and when it expires.

1. Open **MCP connector** in the sidebar.
2. Find the app. Two connections can have the same name; the address under the name tells them apart.
3. Choose **Disconnect**, then **Disconnect app**.

The app loses access from its next request. Your other apps and your personal token keep working. A connection that has expired stays listed with **Expired**; authorize the app again from the agent to keep using it.

## Create a token {#token}

Use a personal token for agents that can't sign in through your browser, such as Cursor.

1. Open **MCP connector** in the sidebar and choose **Create token**.
2. Under **Expires in**, choose 30, 90, or 365 days. Every token expires.
3. Under **Allowed actions**, check what the agent may change. Leave everything unchecked for a read-only token.
4. Under **Scope**, choose **All my projects** or **Chosen projects**.
5. Choose **Create**, then **Copy** the token. It is shown only once; choose **Done** after you have stored it.

![Step 1 of 2 of the Create token dialog with 90 days selected, Translate & publish checked, and All my projects chosen](/guide/mcp-create-token.webp "Choose the expiry, the allowed actions, and the scope, then create the token.")

Keep the token out of files and chat. Store it in the `MALMOI_TOKEN` environment variable of the shell that starts your agent, for example with `read -s MALMOI_TOKEN && export MALMOI_TOKEN` and then pasting the token. The connection snippets below read that variable, so the token itself never appears in a settings file.

You have one personal token at a time; connected apps don't count toward it. To change what it allows, choose **Rotate**, then **Rotate and show new token**; the old token stops working immediately, and every agent using it stops until you give it the new one. **Revoke** stops the token without creating a new one. An expired token shows **Expired**; create a new one.

## Add Malmoi with a token {#connect}

The **Connect** card on the **MCP connector** page shows the same snippets with the server address for the site you are using: choose **Personal token** for these, or **Sign in with browser** for the ones [above](#browser).

![The MCP connector page with the current token's allowed actions, scope, and expiry above the Connect card and its Claude Code snippet](/guide/mcp-connector.webp "Copy the snippet for your agent from the Connect card.")

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

## What the agent can do {#permissions}

The agent can do only what you can do in a project, and only what you allowed it, with a token or a connected app alike. Neither ever adds a permission: if you are a translator (Editor role) in a project, **Project settings** and **Members** do nothing there.

A token with no allowed actions can still read translations, activity, and members in the projects its scope covers. Project owners can also preview a sync or a revert and read the workflow file without one. Only listing your GitHub repositories and their branches for a new project, and reading repository files, need an allowed action.

### Allowed actions and roles {#allowed-actions}

| Allowed action | What the agent can do | Who can use it |
| --- | --- | --- |
| **Translate & publish** | Save translations and publish them as a pull request. | Owners and Editors |
| **Project settings** | Add sources and rotate the push token (both also need write access to the repository), detect formats in the connected repository, sync from the repository, revert to the last published value, change the name, base branch, or base language, archive or restore. | Owners |
| **Members** | Invite people, cancel invitations, change roles, remove members. | Owners |
| **Create projects** | List your GitHub repositories and branches, detect formats, and create projects (creating also needs write access to the repository). | Anyone signed in, up to the [project limit](reference/limits.md#limits) |

**All my projects** covers every project you are a member of, including ones you join later. **Chosen projects** covers only the projects you pick. A project the agent creates with **Chosen projects** is added to that token or connection, and to no other.

Changes to your role or membership apply from the agent's next request. Archived projects can't be changed, even with the right allowed action, except for restoring them with **Project settings**; the agent can still read their activity.

### Tools by task {#tools}

| Task | Tools |
| --- | --- |
| Find out who and what | `whoami`, `list_projects`, `get_project`, `list_members`, `list_events` |
| Set up a project | `list_repositories`, `list_branches`, `detect_formats`, `create_project`, `add_sources`, `get_workflow`, `rotate_push_token` |
| Translate | `list_keys`, `get_key`, `set_translations` |
| Publish | `preview_publish`, `publish` |
| Undo and resync | `preview_revert`, `revert_to_last_sent`, `preview_sync`, `sync_repository` |
| Manage the project | `update_project`, `set_base_locale`, `archive_project`, `unarchive_project` |
| Manage members | `invite_members`, `revoke_invitation`, `change_member` |

Tools that can discard work or cut off access, such as `sync_repository`, `revert_to_last_sent`, `rotate_push_token`, `archive_project`, `revoke_invitation`, and `change_member`, are marked as destructive, so most agents ask you before running them. Publishing, syncing, and reverting each start with a preview; if anything changed after the preview, nothing happens and the agent is asked to preview again. `set_translations` saves up to 100 keys per call; a key that can't be saved is reported and the rest are saved.

## Example prompts {#prompts}

### Connect this repo to Malmoi {#connect-repo}

The agent lists your repositories, detects the translation files, and creates the project with its first sync, like [Create a project](setup/create-project.md) in the browser. The result includes the workflow file and a push token. Ask the agent to commit the workflow file on the base branch you chose, after storing the push token.

If your GitHub connection or the Malmoi GitHub App is missing, the agent returns a link to **Account**. Finish there in the browser and ask the agent to try again. If no translation files are found, the link opens project setup in the browser, where you can choose the format yourself.

### Store the push token {#push-token}

The push token appears once in the agent's conversation, which your agent also sends to its AI provider. If that matters, rotate it later from **Settings** in the browser. Ask the agent to store it as the repository's `PUSH_TOKEN` secret by passing it on standard input:

```text
gh secret set PUSH_TOKEN --repo OWNER/REPO
```

Replace `OWNER/REPO` with the repository. Don't add `--body`; `--body -` would store a single dash. The name must stay `PUSH_TOKEN`, because the workflow reads that secret. See [Add the workflow](setup/workflow.md#push-token) for the rest of the setup.

### Fill the empty fr translations and publish {#fill-and-publish}

The agent finds keys with no French value, writes them, and saves them. It then previews the changes and publishes them as one pull request, like **Publish** in the browser. Logs show the saves and the publish under your name.

Review the pull request before merging it. The agent can publish only if the token allows **Translate & publish**.

## What happens next {#next}

Check [Logs](sync/logs.md) to see what the agent changed. On the **MCP connector** page, disconnect an app or rotate or revoke the token when you no longer need it.
