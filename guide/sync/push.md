# When code changes

Repository updates refresh your project, while unpublished edits keep automatic syncing on hold.

The workflow updates the project from the repository's source files. A valid request replaces the project's translated values with the repository values. Keys that disappear from code remain stored so a later code change can bring them back.

## Sync from the repository {#repository-changes}

Run the generated workflow on the base branch. The request checks the project token, commit, files, and configured Sources. A stale commit or invalid payload is rejected without advancing the last successful commit.

## Keep unpublished edits {#deferred}

If any translation has an unpublished edit, the workflow succeeds and reports `deferred`. New and removed keys wait too; the repository is not partially loaded. Publish the edits and run the workflow again, or a project owner can discard them with **Sync**.

## Keep removed keys {#removed-keys}

A key missing from the repository is kept rather than deleted. Its translations remain available if the key returns in a later workflow run.
