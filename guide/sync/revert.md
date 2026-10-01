# Undo and resync

Project owners can return an edited value to its last published version, or replace project values with the repository's files.

Before you start: Save or discard any open translation edit before using either owner-only control.

## Revert a value {#revert}

1. In **Translations**, select a key with unsent edits and choose **Revert to last sent**.
2. Read the confirmation, which lists the affected languages. All unsent edits for this key are included, even those saved by another teammate.
3. Choose **Revert translations** to restore their last confirmed published values, or **Cancel** to keep the edits.

![The Revert confirmation naming the one language that goes back to its last confirmed version, with Cancel and Revert translations buttons](/guide/revert-confirm.webp "Check the listed languages, then choose Revert translations.")

If a sync is running, Malmoi shows **Syncing…** with the latest time you can revert again, and nothing is reverted. If a previous published value is unavailable for any affected language, nothing is reverted. If someone changes the values while the dialog is open, choose **Review again** before confirming. Reverting leaves **Needs review** unchanged.

## Sync from the repository {#resync}

1. Choose **Sync** at the top of **Home** or **Translations**.
2. If there are unsent edits, the dialog shows how many will be discarded.
3. Choose **Discard changes and sync** when there are unsent edits, or **Sync from repository** when there are none. Close the dialog to keep the changes.
4. Wait in the dialog. It stays open while Sync runs and shows the result in the same place; choose **Close** when you've read it.

![The Sync confirmation warning that one unsent edit will be discarded, with a Discard changes and sync button](/guide/sync-discard.webp "Check how many edits will be discarded before you sync.")

Only project owners can use Sync; editors see it turned off in Translations. While Sync runs, no one can save or revert translations in this project; they see **Syncing…** with the latest time they can save again, and their text stays. If the dialog shows no result after about a minute, it says the result will be in [Logs](logs.md) and lets you close it. Sync reads the files on the base branch directly. The result lists any source that could not be read or was not replaced. Files that were read successfully supply the replacement values. Edits saved after you confirmed, and edits that could not be replaced, remain saved; check the remaining-edit count in the result.

## What happens next {#next}

Check the result for sources that failed or were not replaced before continuing. You do not need to run the workflow to finish a manual Sync.
