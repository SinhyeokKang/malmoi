# Publish your changes

Review saved translation changes and publish them for the development team to review in GitHub.

Before you start: Save the values you want to publish. Publish includes all saved unpublished edits in the project, not only yours.

## Preview saved changes {#preview}

1. Choose **Publish** in the project navigation. The header opens the preview.
2. Review the keys and languages. The final button is **Open pull request**, or Replace pull request #N when one is already open.

Malmoi puts the files into one change request (a *pull request* on GitHub). You do not need a GitHub account; the development team reviews and merges it.

## Publish the changes {#publish}

Choose **Open pull request** or Replace pull request #N. If the files are already the same as the base branch, the action is Close pull request #N.

If the action fails, your saved values are kept. Try again later or tell a project owner.

## Read the result {#result}

The result can say **Nothing changed in the files**, **Not sent — some values can't be written to the files**, or N edits weren't sent. It can also say that an open pull request was closed, that GitHub did not answer, or **We couldn't confirm whether your changes were sent.** Check the project list before trying again.

## Automatic publishing {#nightly}

If you do not publish, saved changes are published automatically once a night. The same rules apply: new and removed keys wait while unpublished edits remain, and the next successful run updates the open pull request.

## What happens next {#next}

The development team reviews the pull request and merges it into the repository.
