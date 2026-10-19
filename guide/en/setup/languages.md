# Add and remove languages

Add a language to a source or remove one from the source's details, then publish the change to your repository as a file.

Project owners change a source's languages; translators (Editor role) can see each language's status but not change it. Adding and removing work for **JSON catalog**, **YAML catalog**, **Chrome extension messages**, **Code dictionary (one file per language)**, **Flutter ARB**, and **Apple strings file** sources. For a code dictionary containing all languages in one file, change the language objects in the repository; Malmoi reads the change on the next update.

## Open the Languages card {#languages}

Open **Sources**, open the source's details, and find the **Languages** card. Each row shows a language's progress and any available action. For supported formats, a language that isn't in the source can be added with **Add language** at the top of the card.

A row can show:

- **Adding** or **Removing** — a change you requested that the repository doesn't have yet.
- **Inactive** — the language file is gone from the repository. Its translations are kept in Malmoi.
- **Unsent** — the change hasn't gone into a pull request yet (a merge request on GitLab).
- A link to the pull request (a merge request on GitLab) — the change went out in Malmoi's last publish. The link points to that publish's pull request, which may no longer be open.
- **Not confirmed in the pull request** — the last publish couldn't finish, so Malmoi can't tell what the pull request contains. Publish again before you cancel or change this language.

![The Languages card of a source, with an Add language button above rows for the base language, regular languages, one being added, one being removed, and an inactive one](/guide/languages-card.webp "Each row shows the language's status and one action.")

For supported formats, **Remove language** is turned off on the base language's row; choose another [base language](sources.md#base-language) first. Translators see disabled buttons and a description saying only project owners can change languages.

For an all-languages code dictionary, the card has no description or new add or remove actions, including on base and inactive rows. Any remaining addition or removal can still be canceled by a project owner, unless the last publish is unconfirmed and may have included that change. For an inactive language, owners are told to restore the file in the repository and sync; translators see only that its translations are kept.

## Add a language {#add}

1. In the **Languages** card, choose **Add language**.
2. For a JSON or YAML catalog, a Flutter ARB file, an Apple strings file, or a code dictionary with one file per language, choose a language from **Common languages** or type a code in **Language code**: a lowercase language with an optional region, such as `fr`, `pt-BR`, or `zh_TW`. Languages that were in this source before are listed first, under **Previously in this source**. For Chrome extension messages, choose from **Language**; Chrome supports a fixed list of codes.
3. Check **File to create**, the path the file will have. Choose **Add language** again to confirm.

![The Add a language dialog over the source details, with es chosen as the language code and i18n/emails/es.json under File to create](/guide/language-add.webp "Choose a language and check the file Malmoi will create.")

Malmoi refuses a language that is already in the source, one whose file path matches an existing language's (for example `pt-BR` and `pt_br`), one that would write to a file another source owns, and one that is being removed — cancel that removal instead.

The new language appears with **Adding**, and translators can open it and translate right away. The file doesn't exist in your repository yet: Publish creates it, once the language has at least one translation. Until then Publish lists the language as **Not included**.

New YAML and per-language code files follow the base file's root, key structure, export, and formatting conventions where applicable. They contain translated keys only, without the base file's comments, `import` statements, or type declarations. If those conventions can't be used safely, Publish stops; cancel the addition or create the file in the repository. See [New language files](../reference/formats.md#languages) for the limits, including later dotted-key insertions. New Flutter ARB files contain `@@locale` and translated keys only, without `@key` metadata. New Apple strings files use the base file's encoding and contain translated keys only. Register the language in your app's code where needed.

If you add a language that was in this source before, Malmoi brings back its saved translations as unsent edits, so the next Publish sends them.

## Remove a language {#remove}

1. In the **Languages** card, choose **Remove language** on the language's row.
2. Read the confirmation. It shows the language, its file, how many translations Malmoi keeps, and whether a pull request already includes the change.
3. If the language has unsent edits, the confirmation says how many will be discarded; each goes back to the value last sent to the repository. If some edits were never sent, there's no value to go back to, and Malmoi asks you to publish first.
4. Choose **Remove language** again. The row stays in the list with **Removing**, and translators can no longer save edits in that language.

![The Remove ja from emails? confirmation listing the language, its file, the translations kept, and the pull request status, with a warning that 1 unsent edit will be discarded](/guide/language-remove.webp "Read what the removal discards, then choose Remove language.")

Removing a language deletes its file in the next Publish. It doesn't touch your app's code. The confirmation, and the pull request description, remind you to remove references to the language (supported-language lists, routing, and the code that loads the file) before you merge, so the app doesn't load a missing file.

The translations stay in Malmoi. After the pull request is merged, Malmoi shows the language as **Inactive** (see [What happens after the merge](#after-merge)), and adding the same code again brings the translations back.

### Cells for a removing language {#frozen}

In **Translations**, a cell for a language that is being removed is read-only. If you type in it anyway, the cell says the edit can't be saved, with a **Discard change** button. Saving a key that has an edit in a removing language saves none of that key's languages. Discard that edit, or cancel the removal, then save.

## Cancel a change {#cancel}

- To cancel a removal, choose **Cancel removal** on the language's row. There is no confirmation.
- To cancel an addition, choose **Remove language** on the language's **Adding** row. The language becomes **Inactive** and its translations are kept; unsent edits in it stop being tracked until you add the language again.

If the change hasn't gone into a pull request, canceling ends it. If a pull request already includes it, Malmoi tells you to publish to update the pull request: the next Publish takes the change back out of it. A cancel doesn't finish until you do that.

## What blocks other work {#blocks}

While a language change is pending, Malmoi blocks a few other changes:

- Base language: you can't choose a language that is being added or removed as the base language, and you can't remove the base language.
- Base branch: in **Settings**, **Base branch** can't be changed while any source has a language change that isn't finished. Malmoi names the source; finish or cancel its language change first. A change is finished once its pull request is merged or closed, which Malmoi notices at the next Publish or [nightly run](../sync/nightly.md#held).
- Updates from the repository: if a language removal hasn't been published yet, the workflow doesn't update the project: Logs shows **Held**, and **Held because** says a language removal is still unsent. The project list, Inbox, and Home say so too. The nightly run publishes the removal instead of updating the project. The update resumes once the removal is published or cancelled. Adding a language doesn't hold updates. See [Keep unsent edits](../sync/push.md#deferred).
- Sync: a project owner's [Sync from the repository](../sync/revert.md#resync) drops pending language changes. Its confirmation lists each one: a language that won't be added (its translations stay in Malmoi) or won't be removed (it stays in the source). If a dropped change was already in a pull request, publish again afterward so the pull request stops carrying it.

## Publish the change {#publish}

Choose **Publish**, as for any change. If only language files changed, the preview is titled **Publish language changes**. When a publish includes language changes, each file in the preview is headed by what happens to it:

- **New file** — Publish creates the file.
- **Updated** — a file that exists in the repository changes.
- **Removed** — Publish deletes the file; the translations stay in Malmoi.
- **Not included** — the language has no translations yet, so there's no file to create.
- **Held** — the file is already on the base branch. After the open pull request closes, the language becomes active at the next publish or nightly check.
- Taken back — you canceled a change after it went into a pull request, so Publish removes it from there.

![The Publish language changes preview with one file, i18n/emails/ja.json, headed Removed, and an Open pull request button](/guide/publish-language-changes.webp "Each file is headed by what Publish does to it.")

If a Malmoi pull request is open, Publish replaces what it holds with everything unsent, including the language changes, instead of opening a second one.

## What happens after the merge {#after-merge}

Malmoi learns what happened to a pull request at the next Publish or nightly run, so a merge can take up to a day to show.

You don't have to wait for the nightly run. Once the pull request is no longer open, **Publish** turns on even if nothing else is waiting to be sent, and its preview closes the language request right away. If the pull request closed without merging and nothing else was waiting, the result says Language request closed and nothing is written to the repository.

- Removal merged: the language becomes **Inactive**. Its translations, history, and row stay.
- Removal closed without merging: the file is still in the repository, so the language stays active and the removal request is gone. Request it again if you still want it removed. Logs records the closing.
- Addition merged: the language is an ordinary language of the source.
- Addition closed without merging: the file isn't in the repository, so the language becomes **Inactive** and its translations are kept.

## What happens next {#next}

Review the pull request, merge it, and update your app's code for the added or removed language. [Logs](../sync/logs.md#logs) records each request, cancellation, and closing, with who did it.
