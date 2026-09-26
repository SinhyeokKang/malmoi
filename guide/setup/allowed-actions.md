# Allow the actions

Allow the four required actions if your repository or organization restricts GitHub Actions.

The generated workflow invokes four actions. If the repository or organization allows only selected actions, allow each name with `@*`; an omission stops the run before the project can read its files.

## Required actions {#allowed-actions}

The list is `SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push`, `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node`. The last two run inside Malmoi's action and therefore do not appear in your workflow file.

## Check repository access {#repository-access}

If GitHub reports that an action is not allowed, update the repository or organization Actions policy and run the workflow again. The project token does not grant permission to change that policy.
