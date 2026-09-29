# Example prompts

Here is what the agent does for a few common requests, and what to check after each.

## Prompts to try {#prompts}

### Connect this repo to Malmoi {#connect-repo}

The agent lists your repositories, detects the translation files, and creates the project with its first sync, like [Create a project](../setup/create-project.md) in the browser. The result includes the workflow file and a push token. Ask the agent to commit the workflow file on the base branch you chose, after storing the push token.

If your GitHub connection or the Malmoi GitHub App is missing, the agent returns a link to **Account**. Finish there in the browser and ask the agent to try again. If no translation files are found, the link opens project setup in the browser, where you can choose the format yourself.

### Store the push token {#push-token}

The push token appears once in the agent's conversation, which your agent also sends to its AI provider. If that matters, rotate it later from **Settings** in the browser. Ask the agent to store it as the repository's `PUSH_TOKEN` secret by passing it on standard input:

```text
gh secret set PUSH_TOKEN --repo OWNER/REPO
```

Replace `OWNER/REPO` with the repository. Don't add `--body`; `--body -` would store a single dash. The name must stay `PUSH_TOKEN`, because the workflow reads that secret. See [Add the workflow](../setup/workflow.md#push-token) for the rest of the setup.

### Fill the empty fr translations and publish {#fill-and-publish}

The agent finds keys with no French value, writes them, and saves them. It then previews the changes and publishes them as one pull request, like **Publish** in the browser. Logs show the saves and the publish under your name.

Review the pull request before merging it. The agent can publish only if the token allows **Translate & publish**.

## What happens next {#next}

Check [Logs](../sync/logs.md) to see what the agent changed. On the **MCP connector** page, disconnect an app or rotate or revoke the token when you no longer need it.
