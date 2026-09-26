# Undo and resync

Project owners can return an edited value to its last published version, or replace project values with the repository's files.

Before you start: Save or discard any open translation edit before using either owner-only control.

## Revert a value {#revert}

1. In **Translations**, select a key with unpublished edits and choose **Revert to last sent**.
2. Read the confirmation, which lists the affected languages. All unpublished edits for this key are included, even those saved by another teammate.
3. Choose **Revert** to restore their last confirmed published values, or **Cancel** to keep the edits.

If a previous published value is unavailable for any affected language, nothing is reverted. If someone changes the values while the dialog is open, choose **Review again** before confirming. Reverting leaves **Needs review** unchanged.

## Sync from the repository {#resync}

1. Choose **Sync** at the top of **Home** or **Translations**.
2. If unpublished edits exist, the dialog shows how many will be discarded.
3. Choose **Discard changes and sync** when unpublished edits exist, or **Sync from repository** when there are none. Close the dialog to keep the changes.

Only project owners can use Sync; editors see it turned off in Translations. Sync reads the files on the base branch directly. The result lists any source that could not be read or was not replaced. Files that were read successfully supply the replacement values. Edits saved after you confirmed, and edits that could not be replaced, remain saved; check the remaining-edit count in the result.

## What happens next {#next}

Check the result for sources that failed or were not replaced before continuing. You do not need to run the workflow to finish a manual Sync.
