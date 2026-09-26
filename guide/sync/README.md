# How syncing works

Repository changes bring source keys into Malmoi, and publishing sends saved translations back through a pull request.

## How it works {#how-it-works}

The repository owns the set of source keys. Malmoi owns the translated values between syncs. Sync replaces repository values in the database; it does not merge two values or choose a winner. Publish writes the database values to a generated pull request.

Read [When code changes](push.md) for the incoming direction and [Merging the pull request](merging.md) for the return path.
