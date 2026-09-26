# Every night

Malmoi publishes saved changes for active projects every night.

The nightly run is scheduled for 18:00 UTC. It publishes saved changes through a change request (a *pull request* on GitHub). An open pull request is updated instead of opening a second one.

## Automatic publishing {#nightly}

A project must be active, connected to a repository, and have at least one source whose first sync has succeeded. Archived or unconnected projects are excluded. A run checks at most 50 projects, starting with those that have waited longest; it may stop earlier when time runs out, so some projects may wait until another night.

Saved values that cannot be published stay in Malmoi. If your changes were not published overnight, check **Logs** and ask a project owner about any reported failure.

## What happens next {#next}

The next nightly run checks projects that remain eligible.
