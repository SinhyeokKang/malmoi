# Publish your changes

Review saved translation changes and publish them for the development team to review in GitHub.

Before you start: Save the values you want to publish. Publish includes all saved unpublished edits in the project, not only yours.

## Preview saved changes {#preview}

Malmoi puts the files into one change request (a *pull request* on GitHub). You do not need a GitHub account; the development team reviews and merges it.

1. Choose **Publish** at the top of Home or Translations.
2. A preview opens; review the keys and languages.
3. Choose **Open pull request**, or Replace pull request #N when one is already open.

## Publish the changes {#publish}

Choose **Open pull request** or Replace pull request #N. If your changes already match the files and no pull request is open, the button is **Publish**. When a pull request is open and the files match, the action is Close pull request #N.

If the action fails, your saved values are kept. Try again later or tell a project owner.

## Read the result {#result}

The result can say:

- **Sent for review** — a new pull request is open for the development team.
- **Your earlier pull request now holds this** — the existing pull request was updated.
- **Nothing changed in the files** — there is nothing new to publish.
- **Not sent — some values can't be written to the files** or N edits weren't sent — your saved values are kept. Tell a project owner which files are listed.
- An open pull request was closed — the files already match the repository.
- GitHub did not answer — try again later.
- **We couldn't confirm whether your changes were sent.** Check **Logs** before trying again.

## Automatic publishing {#nightly}

If you do not publish, saved changes are published automatically once a night. See [Every night](../sync/nightly.md#nightly) for eligibility and timing.

## What happens next {#next}

The development team reviews the pull request and merges it into the repository.
