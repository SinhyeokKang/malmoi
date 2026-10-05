# Edit translations

Open the translation screen, find the text you want to translate, edit it in each language, and save before publishing.

Before you start: Join a project and choose **Translations** in the project navigation.

## Find a key {#find-key}

The key list is on the left. Each row is one piece of text in the app — a *key* — and shows its source text followed by its key name. Select a row to open its translations in every language on the right. Use the search box above the panels to find a key by its name, its source text, or a translation.

![The translation screen with a key selected in the list and its text in three languages](/guide/translation-editor.webp "Select a row to edit its text in every language.")

In the key list, the arrow keys move between rows and Enter opens the row; Tab moves past the whole list in one step.

The **Sources** panel sets which keys the list shows. Select **All namespaces** under a source to list all of its keys, or select a group to list only that group. The filter at the top right of the key list shows its current choice: **All keys**, **Incomplete**, **Needs review**, **Unsent**, or **New from GitHub**. Needs review marks translations whose source text changed; it is not an approval step. Selecting a group keeps the filter, and changing the filter keeps the group. The filter narrows only the key list; it doesn't change the numbers in the **Sources** panel.

Search looks through every source in the project. While you search, **All sources** appears at the top of the **Sources** panel, and in a project with several sources the list shows each key's source before its name. Each source and group also shows how many of its keys match the search, and groups with no matches are dimmed and can't be selected. Select **All namespaces** under a source, or a group, to narrow the results to it, or **All sources** to search everywhere again; typing a new search always searches everywhere. If you select a key from another source, the screen moves to that source. Clear the search to go back to the group of the key you selected. When nothing matches, choose **Search all sources** to widen a narrowed search, or **Clear search**. **Clear filters** sets the filter back to **All keys** and keeps your search text.

![The translation screen with the filter open, listing All keys, Incomplete, Needs review, Unsent, and New from GitHub](/guide/state-filter.webp "Narrow the list by status.")

## Find text across your projects {#global-search}

If you don't know which project contains a piece of text, use the search in the middle of the header. Signed in, you can search your projects, Malmoi's pages, your projects' text, and the docs from any page, including the docs. Without signing in, search finds the docs only.

1. Choose **Search…**, or press Cmd+K on macOS or Ctrl+K on other platforms. The shortcut does nothing while a dialog or menu is open. In a text field, choose **Search…** instead.
2. Type at least two characters to search key names, source text, and saved translations across projects you belong to. The **Keys** group shows the key name, project and source, and the matching text; a matching translation also shows its language code.
3. Select a result, or use the arrow keys and press Enter. The search closes and opens Translations with that key selected and visible. You can edit and save it as described below.

Key results exclude archived projects and sources, sources that haven't finished their first sync, and text or languages removed from the repository. Key search matches the whole phrase you type without regard to case and uses its first 200 characters. **Projects**, **Pages**, and **Docs** match every word you type, in any order. Each group shows up to five results; narrow your text if the one you need isn't there.

If part of the search fails, a line under the search box says which part failed and how to try again, and the other groups stay usable. If your session ended, sign in again to search your projects; the docs remain searchable.

With an empty search, you see previews of **Projects**, **Pages**, and **Docs**. **Pages** takes you to screens in Malmoi, such as a project's Translations. **Projects** includes archived projects, while key results do not. Choose **Go to your projects** to see all of your projects, or **Go to docs** to open the docs. **Docs** searches guide titles and text and opens the matching section. Escape closes the search. Malmoi doesn't keep your search text in history or browser storage.

## See what needs you across projects {#inbox}

The inbox button between the divider and your avatar at the top right — in the app, and on the docs, changelog, and privacy pages while you're signed in — lists what needs your attention in every project you belong to, so you don't have to open each project's **Home**. When something is new since you last looked, the button shows how many items; above nine it shows 9+.

1. Choose the inbox button. Items are grouped by project, and the project with the newest item comes first. You see sources whose last sync failed or was only partly synced, text waiting for review, languages that have no translations, and unsent edits. Project owners also see projects that still need setup.
2. Select an item. A sync problem opens **Sources**, where you can read why; only project owners can try the sync again. The other items open **Translations** with the matching filter, and setup opens the project's **Settings**.
3. Close the list. Opening it marks everything in it as seen, and the number clears when the list closes. If the list doesn't load, choose **Try again**.

![The inbox open at the top right, with items grouped by project: a failed sync and a partial sync, then an unsent edit and text waiting for review](/guide/inbox-open.webp "Choose an item to go where you can resolve it.")

An item counts again only when it is new or has changed since you last opened the list, and it leaves the list once it is resolved. Text waiting for review is always listed but never counted, because every sync from the repository would make it look new. When nothing needs you, the list shows **Nothing needs you**. Archived projects aren't included.

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
