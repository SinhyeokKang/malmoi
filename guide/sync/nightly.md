# Every night

Every night, Malmoi publishes saved changes or picks up new repository changes for each active project.

The nightly run is scheduled for 18:00 UTC. For each project it does at most one thing: publish unsent edits, update the project from the repository, or skip because there is nothing to do. Each visit leaves at most one event in **Logs**, marked **Nightly**.

## Which projects are checked {#eligible}

A project must be active, connected to a repository, and have at least one source whose first sync has succeeded. Archived or unconnected projects are excluded. A run checks at most 50 projects, starting with those that have waited longest since their last nightly check; it may stop earlier when time runs out, so some projects may wait until another night. A project with new commits reached late in a run is also left for the next night, where it moves to the front.

## Automatic publishing {#nightly}

If any saved edit is unsent, the nightly run publishes the project's saved changes through a change request (a *pull request* on GitHub). An open pull request is updated instead of opening a second one. That night the project is not updated from the repository.

Saved values that cannot be published stay in Malmoi. If your changes were not published overnight, check **Logs** and ask a project owner about any reported failure.

## Updates from the repository {#repository-changes}

If nothing is waiting to be published, the nightly run checks whether the branch Malmoi reads has new commits since Malmoi last read your sources.

- No new commits and nothing failed last time: nothing is read and the event says **Up to date**. If a file failed to update, the nightly run tries again each night until it succeeds.
- New commits: Malmoi reads the sources from the repository and updates the project, the same way a project owner's Sync does, but without discarding anything. On Home, **Last sync** then starts with **Nightly sync**.

If someone saves a translation while the nightly update is running, Malmoi stops before the next source so the new edit is not overwritten. The sources it already updated stay updated.

## When the nightly run holds an update {#held}

The nightly run holds the update — the project is not updated, and **Logs** shows **Held** with the reason — when:

- A Malmoi pull request is still open. Its translations are not in the repository yet, so an update would overwrite them. Merge or close the pull request; the next nightly run picks up the changes. Home shows **Held** next to **Last sync**, and the To send card says why.
- GitHub didn't answer whether that pull request is open. Malmoi does not guess; Home shows **Held**, and the next run checks again.
- The change is too large for a server-side sync. Nightly updates use the same file budget as creating a project (see [Limits](../reference/limits.md#files)). Reduce the files' size, or deliver the change with the repository workflow.

If the nightly run can't read the repository's branch, or GitHub doesn't answer in time, the event shows **Failed** in **Logs** instead of a hold. If the branch no longer exists, Home also shows the sync as failed until the next successful sync; if GitHub only failed to answer, Home is unchanged and the next run tries again. A project owner can check the branch and the GitHub connection in project **Settings**.

## Nightly sync or the workflow {#workflow}

The workflow is optional. Without it, the nightly run picks up repository changes once a day. With [the workflow](../setup/workflow.md), your repository's GitHub Actions sends changes on every commit to that branch, and also collects code references. In **Logs**, workflow runs are marked **CI**; CI is your repository's workflow.

## What happens next {#next}

The next nightly run checks projects that remain eligible. Read each night's result in [Logs](logs.md#logs).
