# When code changes

Repository updates refresh your project, while unpublished edits keep automatic syncing on hold.

The workflow sends the repository's source files to the project. A valid request replaces the project's translated values with the repository values and clears their editor attribution. Keys that disappear from code remain stored as orphaned keys so a later code change can bring them back.

## Sync from the repository {#repository-changes}

Run the generated workflow on the base branch. The request checks the project token, commit, files, and configured Sources. A stale commit or invalid payload is rejected without advancing the last successful commit.

## Keep unpublished edits {#deferred}

If any translation has an unpublished edit token, the request returns a deferred result. New keys and removed keys wait too; the repository is not partially loaded. Publish the edits, or ask a project owner to use the approved Sync flow.

## Keep removed keys {#removed-keys}

A key missing from the repository is marked orphaned rather than deleted. Its translations remain available if the key returns in a later workflow run.
