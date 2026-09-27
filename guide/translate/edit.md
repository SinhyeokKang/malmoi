# Edit translations

Open the translation screen, find the text you want to translate, edit it in each language, and save before publishing.

Before you start: Join a project and choose **Translations** in the project navigation.

## Find a key {#find-key}

The key list is on the left. Each row is one piece of text in the app — a *key* — and shows its source text followed by its key name. Select a row to open its translations in every language on the right. Use the search box to find a key by its name, its source text, or a translation.

![The translation screen with a key selected in the list and its text in three languages](/guide/translation-editor.webp "Select a row to edit its text in every language.")

**Scope** starts at **This source**, which shows only keys from the same set of translation files; choose **All sources** to widen it. Choose **This namespace** to narrow the list to the selected group of keys. **Clear filters** resets the scope, completion, and state filters; it keeps your search text. The **State** filter includes **Not sent**, **Needs review**, and **New from GitHub**. Needs review marks translations whose source text changed; it is not an approval step.

## Edit and save {#save}

1. Select a row in the key list.
2. Type in the language fields.
3. Choose **Save**, or press Ctrl+Enter or Cmd+Enter.

**Saved** confirms the save. Moving to another field does not save. Press Escape while editing a field to undo what you typed in that field. If any language fails to save, none of them are saved — try again. If Malmoi says it could not confirm the save, check the current values before saving again. Saving clears **Needs review** for the languages you saved.

Some projects do not allow an empty translation. If Malmoi refuses an empty field, enter a value or press Escape in that field to undo the edit, then save any other changes. Nothing is saved while the invalid empty edit remains.

## Leave unsaved changes {#unsaved-changes}

If you change keys, filters, or pages with an unsaved edit, choose **Keep editing** or **Discard changes**. **Save** is locked while **Publish** is running. Refreshing or closing the page can also ask the browser to confirm.

## What happens next {#next}

Continue with [Publish your changes](publish.md).
