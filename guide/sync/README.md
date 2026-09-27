# How syncing works

Repository changes bring app text into Malmoi, and publishing sends saved translations back for the development team to review.

## How it works {#how-it-works}

The repository decides which pieces of app text — keys — exist. Malmoi holds the translated values between updates. Each update from the repository replaces the values in Malmoi with the repository's; it does not merge two values or choose a winner. This is a no-merge flow. Automatic updates wait while unpublished edits exist.

**Publish** puts Malmoi's values into a change request (a *pull request* on GitHub) for the development team to review and merge.

Read [When code changes](push.md) for the incoming direction and [Merging the pull request](merging.md) for the return path.
