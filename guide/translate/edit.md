# Edit translations

Open the translation screen, find the text you want to translate, edit it in each language, and save before publishing.

Before you start: Join a project and choose **Translations** in the project navigation.

## Find a key {#find-key}

The key list is on the left. Each row is one piece of text in the app — a *key* — and shows its source text followed by its key name. Select a row to open its translations in every language on the right. Use the search box to find a key by its name, its source text, or a translation.

![The translation screen with a key selected in the list and its text in three languages](/guide/translation-editor.webp "Select a row to edit its text in every language.")

In the key list, the arrow keys move between rows and Enter opens the row; Tab moves past the whole list in one step.

The **Sources** panel sets which keys the list shows. Select **All namespaces** under a source to list all of its keys, or select a group to list only that group. One filter sits above the list and shows its current choice: **All keys**, **Incomplete**, **Needs review**, **Unsent**, or **New from GitHub**. Needs review marks translations whose source text changed; it is not an approval step. Selecting a group keeps the filter, and changing the filter keeps the group. While the filter or a search is on, each source and group in the panel shows how many of its keys match, and groups with no matches are dimmed and can't be selected.

Search looks through every source in the project. While you search, **All sources** appears at the top of the **Sources** panel, and in a project with several sources the list shows each key's source before its name. Select **All namespaces** under a source, or a group, to narrow the results to it, or **All sources** to search everywhere again; typing a new search always searches everywhere. If you select a key from another source, the screen moves to that source. Clear the search to go back to the group of the key you selected. When nothing matches, choose **Search all sources** to widen a narrowed search, or **Clear search**. **Clear filters** sets the filter back to **All keys** and keeps your search text.

![The translation screen with the filter open, listing All keys, Incomplete, Needs review, Unsent, and New from GitHub](/guide/state-filter.webp "Narrow the list by status.")

## Edit and save {#save}

1. Select a row in the key list.
2. Type in the language fields.
3. Choose **Save**, or press Ctrl+Enter or Cmd+Enter.

**Saved** confirms the save. Moving to another field does not save. Press Escape while editing a field to undo what you typed in that field. If any language fails to save, none of them are saved — try again. If Malmoi says it could not confirm the save, check the current values before saving again. Saving clears **Needs review** for the languages you saved.

While a sync from the repository is running (a project owner's **Sync** or the nightly update), you can't save: Malmoi shows **Syncing…** with the latest time you can save again, and nothing is saved. Your text stays; choose **OK** and save again after the sync finishes. If a sync is already running when you open Translations, a note at the top says so; you can keep typing.

Some projects do not allow an empty translation. If Malmoi refuses an empty field, enter a value or press Escape in that field to undo the edit, then save any other changes. Nothing is saved while the invalid empty edit remains.

## Leave unsaved changes {#unsaved-changes}

If you change keys, filters, or pages with an unsaved edit, choose **Keep editing** or **Discard changes**. **Save** is locked while **Publish** is running. Refreshing or closing the page can also ask the browser to confirm.

## What happens next {#next}

Continue with [Publish your changes](publish.md).
