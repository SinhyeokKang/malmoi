# When code changes

Repository updates refresh your project, while unpublished edits or an open Malmoi pull request keep automatic syncing on hold.

The workflow updates the project from the repository's source files on every commit; without it, the [nightly run](nightly.md#repository-changes) does the same once a day. When the workflow applies an update, it replaces that source's translated values with the repository values. Keys that disappear from code remain stored so a later code change can bring them back.

## Update from the repository {#repository-changes}

Run the generated workflow on the base branch. The workflow checks the push token, the commit, and the files. If the commit is older than the last one Malmoi read for that source, or the files do not match its configuration, that step fails without replacing the source's translations. Earlier source steps in the same workflow may already have succeeded.

## Keep unpublished edits {#deferred}

If any translation has an unpublished edit, the workflow succeeds and reports `deferred`. New and removed keys wait too; the repository is not partially loaded. Publish the edits and run the workflow again, or a project owner can resolve them with [Undo and resync](revert.md).

![A project's Home with one unsent change to send and a note that repository updates are paused](/guide/home-paused.webp "Unpublished edits hold repository updates until they are published.")

## Wait for the open pull request {#open-pull-request}

Publishing removes the protection for the edits it sent, but those values are not in the repository until the pull request is merged. So while a Malmoi pull request is open, the workflow also succeeds and reports `deferred`, with the reason `open-pr`, and loads nothing. Merge or close the pull request. After that, the [nightly run](nightly.md#repository-changes) or the workflow run for the next commit picks up the changes; merging the pull request itself doesn't start an update (see [Keep the loop marker](merging.md#skip-marker)).

If Malmoi could not check GitHub for an open pull request, the reason is `pr-check-failed` and nothing is loaded either. Run the workflow again later.

In each case the whole update waits; Malmoi does not choose some values from the repository and keep others.

## Keep removed keys {#removed-keys}

A key missing from the repository is kept rather than deleted. Its translations remain available if the key returns in a later workflow run.

## What happens next {#next}

Read the workflow result in GitHub Actions. A successful update makes the repository's keys available in Malmoi.
