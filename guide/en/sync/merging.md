# Merging the pull request

Review the generated pull request in GitHub and merge it to return translations to your repository.

Before you start: You need permission to merge pull requests in the repository, or merge requests on GitLab. The pull request contains the translation files generated from Malmoi.

## Merge the translation pull request {#merging}

1. Open the translation pull request in GitHub and review its changed files.
2. Merge it using your repository's normal policy. Squash, rebase, and merge commits are supported.

## Merge on GitLab {#merging-gitlab}

On a GitLab project, Malmoi opens a merge request instead, numbered like `!128`.

1. Open the translation merge request in GitLab and review its changes.
2. Merge it with your project's merge method. Merge commits, squash, and fast-forward are supported.

If a Publish finds that nothing in the merge request differs from the base branch any more, Malmoi closes the merge request with a comment and deletes its branch.

## Keep the loop marker {#skip-marker}

Malmoi adds `[skip-malmoi-i18n]` to the pull request title. Keep it: removing it makes the workflow run again for no reason. The next Publish adds it back if it was removed.

On GitLab, the marker is in the merge request title and in Malmoi's commit. If your GitLab project uses its own merge commit or squash commit message template, keep `%{title}` in it; otherwise the marker doesn't reach the base branch and the CI jobs run again for no reason.

## What happens next {#next}

After the pull request is merged, the repository contains the published translations.
