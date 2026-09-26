# Merging the pull request

Review the generated pull request in GitHub and merge it to return translations to your repository.

The pull request contains the generated files from the project's base snapshot. Review the diff in GitHub, then merge it using the repository's normal policy.

## Merge the translation pull request {#merging}

Squash, rebase, and merge commits are supported. The pull request is the review boundary; Malmoi does not merge competing translation values.

## Keep the loop marker {#skip-marker}

Keep `[skip-malmoi-i18n]` in the pull request title. Without the marker, merging can trigger the workflow again and replace values after the pull request was opened.
