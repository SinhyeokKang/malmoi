# Merging the merge request

Review the generated merge request in GitLab and merge it to return translations to your repository.

Before you start: You need permission to merge merge requests in the GitLab project. The merge request contains the translation files generated from Malmoi.

## Merge the translation merge request {#merging-gitlab}

Malmoi opens the translation merge request numbered like `!128`.

1. Open the translation merge request in GitLab and review its changes.
2. Merge it with your project's merge method. Merge commits, squash, and fast-forward are supported.

If a Publish finds that nothing in the merge request differs from the base branch any more, Malmoi closes the merge request with a comment and deletes its branch.

## Keep the loop marker {#skip-marker}

Malmoi adds `[skip-malmoi-i18n]` to the merge request title and to its commit. Keep it in the title. If your GitLab project uses its own merge commit or squash commit message template, keep `%{title}` in it; otherwise the marker doesn't reach the base branch and the CI jobs run again for no reason.

## What happens next {#next}

After the merge request is merged, the repository contains the published translations.
