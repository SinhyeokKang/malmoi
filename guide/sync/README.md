# How syncing works

Repository changes bring source keys into Malmoi, and publishing puts saved translations into a pull request.

## How it works {#how-it-works}

The repository owns the set of source keys. Malmoi owns the translated values between syncs. Sync replaces the values in Malmoi with the repository's; it does not merge two values or choose a winner. This is a no-merge flow. Publish writes the Malmoi values to a generated pull request.

Read [When code changes](push.md) for the incoming direction and [Merging the pull request](merging.md) for the return path.
