# Troubleshooting

Find the next step when GitHub access, setup, or repository syncing fails.

## Restore GitHub access {#github-access}

If your GitHub authorization expired, open **Account** and choose **Reauthorize GitHub App**. Sign-in methods and repository access are separate.

Project **Settings** shows the repository connection as a badge, and each badge has its own next step:

- **Disconnected** — syncs and publishes stop until it's reconnected. Choose **Reconnect**. If the app was removed, the card also shows an **Install the app** link: install it, then come back and reconnect.
- **Not connected** — no installation is connected yet. Choose **Connect**.
- **Wrong repository** — the address now holds a different repository. There is no button: check it on GitHub, and if the repository really was replaced, create a new project for it.
- **Couldn't check** — Malmoi can't check the connection right now. Reopen the page before changing anything.

If the repository is not listed, in Malmoi choose **Choose repositories**, then in GitHub open **Repository access** for the Malmoi GitHub App. If the app was removed, choose **Install the app**.

## Resolve workflow failures {#workflow-failures}

Check the Actions log for the generated workflow path, `PUSH_TOKEN`, allowed actions, and the selected base branch. A missing installation or action policy can stop a run before the request reaches the project. A 401 means the token is wrong or was rotated: choose **Rotate token** in **Settings**, confirm with **Rotate and show new token**, then copy the value into `PUSH_TOKEN`. It is shown only once, and the old push token stops working immediately.

## Resolve rejected updates {#rejected-updates}

A 409 can mean the project is archived, the project or source does not match, the format does not match, or the commit is stale. A 400 means the files sent by the workflow or configured file set failed validation. Read the reason in the workflow run log in GitHub Actions before changing the project configuration.

If the run log shows `deferred`, the update is held, and Logs shows it as **Held**. If saved edits are unsent, publish them and run the workflow again. With `open-pr`, a Malmoi pull request is still open: merge or close it. With `pr-check-failed`, Malmoi couldn't check GitHub; run the workflow again later.

If **Publish** is disabled, there may be nothing unsent (“Nothing to send — every edit is already sent.”), GitHub may not be connected, the project may be archived, or Sync may be running (“Publishing is currently unavailable.”). See [Publish your changes](../translate/publish.md#publish) for the editor path. Project owners can fix the connection or wait for Sync.

A commit containing `[skip-malmoi-i18n]` is skipped; read that result in the workflow run log.

## What happens next {#next}

Use the reason shown in the workflow run log to choose the matching repair.
