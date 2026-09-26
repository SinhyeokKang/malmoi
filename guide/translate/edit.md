# Edit translations

Open the translation screen, find a key, edit its language fields, and save the values before publishing.

Before you start: Join a project and choose **Translations** in the project navigation.

## Find a key {#find-key}

The table has one row per key. The first column shows the source text; the other columns show one language each. Use the search box to find a key by its name, its source text, or a translation.

Choose **This source** to narrow the list, **This namespace** to narrow it further, or **Clear filters** to start over. The **State** filter includes **Not sent**, **Needs review**, and **New from GitHub**.

## Edit and save {#save}

Type in the language fields and choose **Save**. Moving to another field does not save. Press Escape to undo what you typed. If any language fails to save, none of them are saved — try again. Press Ctrl+Enter or Cmd+Enter to save from a field.

Saving clears **Needs review** for the languages you saved. Some non-base cells in YAML, TypeScript, and code-dictionary sources cannot be cleared; Malmoi keeps the existing value there.

## Leave unsaved changes {#unsaved-changes}

If you change keys, filters, or pages with an unsaved edit, choose **Keep editing** or **Discard changes**. **Save** is locked while Publish is running. Refreshing or closing the page can also ask the browser to confirm.

## What happens next {#next}

Saved values appear in the Publish preview. Publish uses all saved unpublished edits in the project.
