# Merging the pull request

Review the generated pull request in GitHub and merge it to return translations to your repository.

Before you start: You need permission to merge pull requests in the repository. The pull request contains the translation files generated from Malmoi.

## Merge the translation pull request {#merging}

1. Open the translation pull request in GitHub and review its changed files.
2. Merge it using your repository's normal policy. Squash, rebase, and merge commits are supported.

## Keep the loop marker {#skip-marker}

Malmoi adds `[skip-malmoi-i18n]` to the pull request title. Keep it: removing it makes the workflow run again for no reason. The next Publish adds it back if it was removed.

## What happens next {#next}

After the pull request is merged, the repository contains the published translations.
