# Troubleshooting

Find the next step when GitHub access, setup, or repository syncing fails.

## Restore GitHub access {#github-access}

If the GitHub App installation or user connection is unavailable, reconnect it from Account or the project settings. A sign-in method and the GitHub App connection are separate, so fixing one does not silently replace the other.

If the repository is not listed, open GitHub's **Repository access** and **Choose repositories** for the Malmoi App. For `not-installed`, choose **Install the app**. If the repository was replaced, create a new project for the new repository.

## Resolve workflow failures {#workflow-failures}

Check the Actions log for the generated workflow path, `PUSH_TOKEN`, allowed actions, and the selected base branch. A missing installation or action policy can stop a run before the request reaches the project. A 401 means the token is wrong or was rotated; save the current token as the repository secret.

## Resolve rejected updates {#rejected-updates}

A 409 can mean the project is archived, the project or source does not match, the format does not match, or the commit is stale. A 400 means the request payload or configured file set failed validation. A commit containing `[skip-malmoi-i18n]` is skipped. Read the reason in the workflow run log in GitHub Actions before changing the project configuration.

New keys may be waiting because saved edits are unpublished; publish them and run the workflow again. If the Publish button is disabled, an editor cannot use it while the preview is unavailable or another publish is running.

## What happens next {#next}

Use the reason shown in the workflow run log to choose the matching repair.
