# Undo and resync

Project owners can return an edited value to its last published version, or replace project values with the repository's files.

Before you start: Save or discard any open translation edit before using either owner-only control.

## Revert a value {#revert}

In the translation screen, select a key and choose **Revert to last sent** when its edited cells should return to the last value included in a published change. The current language values remain visible so you can review them.

## Sync from the repository {#resync}

1. Choose **Sync** at the top of Home or Translations.
2. The dialog shows how many unsent changes will be discarded.
3. Choose **Discard changes and sync** when unsent changes exist, or **Sync from repository** when there are none. Close the dialog to keep the changes. Only project owners see this control.

Only project owners can use Sync; editors see it turned off in Translations. Sync reads the files on the base branch directly. The result lists any source that could not be read or was not replaced. Sources that synced now match the files on the base branch; unpublished edits that were not discarded remain saved.

## What happens next {#next}

After Sync, the project matches the files on the base branch. You do not need to run the workflow.
