# Connect an AI agent

Let a coding agent such as Claude Code, Codex, or Cursor work in Malmoi for you with a personal token.

Before you start: Sign in to Malmoi. To let the agent create projects, connect GitHub and install the Malmoi GitHub App in [Your account](account.md#github-connection) first.

The agent connects over MCP (Model Context Protocol) at `https://mal-moi.com/api/mcp`. Malmoi doesn't write translations itself: the agent writes the values, and Malmoi saves them as your edits, with the same checks as the browser.

## Create a token {#token}

1. Open **MCP connector** in the sidebar and choose **Create token**.
2. Under **Expires in**, choose 30, 90, or 365 days. Every token expires.
3. Under **Allowed actions**, check what the agent may change. Leave everything unchecked for a read-only token.
4. Under **Scope**, choose **All my projects** or **Chosen projects**.
5. Choose **Create**, then **Copy** the token. It is shown only once; choose **Done** after you have stored it.

Keep the token out of files and chat. Store it in the `MALMOI_TOKEN` environment variable of the shell that starts your agent, for example with `read -s MALMOI_TOKEN && export MALMOI_TOKEN` and then pasting the token. The connection snippets below read that variable, so the token itself never appears in a settings file.

You have one token at a time. To change what it allows, choose **Rotate** and create a new one; the old token stops working immediately, and every agent using it stops until you give it the new one. **Revoke** stops the token without creating a new one. An expired token shows **Expired**; create a new one.

## Add Malmoi to your agent {#connect}

The **Connect** card on the **MCP connector** page shows the same snippets with the server address for the site you are using.

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

The agent can do only what you can do in a project, and only what the token allows. A token never adds a permission: if you are a translator (Editor role) in a project, **Project settings** and **Members** do nothing there. The **MCP connector** page says the same: project settings and members apply only where you're a project owner.

A token with no allowed actions can still read translations, activity, and members in the projects its scope covers. Only listing your GitHub repositories and reading repository files need an allowed action.

### Allowed actions and roles {#allowed-actions}

| Allowed action | What the agent can do | Who can use it |
| --- | --- | --- |
| **Translate & publish** | Save translations and publish them as a pull request. | Owners and Editors |
| **Project settings** | Add sources, detect formats in the connected repository, sync from the repository, revert to the last published value, change the name, base branch, or base language, rotate the push token, archive or restore. | Owners |
| **Members** | Invite people, cancel invitations, change roles, remove members. | Owners |
| **Create projects** | List your GitHub repositories and branches, detect formats, and create projects. | Anyone signed in, up to the [project limit](reference/limits.md#limits) |

**All my projects** covers every project you are a member of, including ones you join later. **Chosen projects** covers only the projects you pick. A project the agent creates with a **Chosen projects** token is added to that token.

Changes to your role or membership apply from the agent's next request. Archived projects can't be changed, even with the right allowed action; the agent can still read their activity.

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

Check [Logs](sync/logs.md) to see what the agent changed. Rotate or revoke the token on the **MCP connector** page when you no longer need it.
