# When code changes

Repository updates refresh your project; while there are unsent edits or an open Malmoi pull request, those updates are held.

The workflow updates the project from the repository's source files on every commit; without it, the [nightly run](nightly.md#repository-changes) does the same once a day. When the workflow applies an update, it replaces that source's translated values with the repository values. Keys that disappear from code remain stored so a later code change can bring them back.

## Update from the repository {#repository-changes}

Run the generated workflow on the base branch. The workflow checks the push token, the commit, and the files. If the commit is older than the last one Malmoi read for that source, or the files do not match its configuration, that step fails without replacing the source's translations. Earlier source steps in the same workflow may already have succeeded.

## Keep unsent edits {#deferred}

If any translation has an unsent edit, the workflow succeeds and reports `deferred`: the repository update is held, and Logs shows it as **Held**. New and removed keys are held too; the repository is not partially loaded. Home shows "repository updates held" under the count of changes to send. Publish the edits and run the workflow again, or a project owner can resolve them with [Undo and resync](revert.md).

![A project's Home with one unsent edit to send and a note that repository updates are held](/guide/home-paused.webp "Repository updates are held until the unsent edits are published.")

## Held while a pull request is open {#open-pull-request}

Publishing removes the protection for the edits it sent, but those values are not in the repository until the pull request is merged. So while a Malmoi pull request is open, the workflow also succeeds and reports `deferred`, with the reason `open-pr`, and loads nothing; Home shows "held until the pull request is merged or closed". Merge or close the pull request. After that, the [nightly run](nightly.md#repository-changes) or the workflow run for the next commit picks up the changes; merging the pull request itself doesn't start an update (see [Keep the loop marker](merging.md#skip-marker)).

If Malmoi couldn't check GitHub for an open pull request, the reason is `pr-check-failed` and the update is held as well, because Malmoi can't rule the pull request out. Home says it couldn't check for an open pull request. Run the workflow again later.

In each case the whole update is held; Malmoi doesn't choose some values from the repository and keep others.

## Keep removed keys {#removed-keys}

A key missing from the repository is kept rather than deleted. Its translations remain available if the key returns in a later workflow run.

## What happens next {#next}

Read the workflow result in GitHub Actions. A successful update makes the repository's keys available in Malmoi.
