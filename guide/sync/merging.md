# Merging the pull request

Review the generated pull request in GitHub and merge it to return translations to your repository.

The pull request contains the generated files from the project's base snapshot. Review the diff in GitHub, then merge it using the repository's normal policy.

## Merge the translation pull request {#merging}

Squash, rebase, and merge commits are supported. Malmoi adds `[skip-malmoi-i18n]` to the change. Keep it: removing it makes the workflow run again for no reason. The next Publish adds it back if it was removed.

## Keep the loop marker {#skip-marker}

Keep `[skip-malmoi-i18n]` in the pull request title.

## What happens next {#next}

After the pull request is merged, the repository contains the published translations.
