# Edit translations

Open the translation screen, find a key, edit its language fields, and save the values before publishing.

Before you start: Join a project and choose **Translations** in the project navigation.

## Find a key {#find-key}

The key list is on the left. Each row is one piece of text in the app — a *key* — and shows its source text followed by its key name. Select a row to open its translations in every language on the right. Use the search box to find a key by its name, its source text, or a translation.

Choose **This source** to set the scope to the current source, **This namespace** to narrow it to the group the key belongs to, or **Clear filters** to start over. The **State** filter includes **Not sent**, **Needs review**, and **New from GitHub**.

## Edit and save {#save}

Type in the language fields and choose **Save**. Press Ctrl+Enter or Cmd+Enter to save from a field. Moving to another field does not save. Press Escape to undo what you typed. If any language fails to save, none of them are saved — try again.

Saving clears **Needs review** for the languages you saved. In YAML catalogs and code dictionaries, a non-base language cannot be left empty. Enter a value or choose **Discard changes**; nothing is saved until you do.

## Leave unsaved changes {#unsaved-changes}

If you change keys, filters, or pages with an unsaved edit, choose **Keep editing** or **Discard changes**. **Save** is locked while Publish is running. Refreshing or closing the page can also ask the browser to confirm.

## What happens next {#next}

Saved values appear in the Publish preview. Publish uses all saved unpublished edits in the project.
