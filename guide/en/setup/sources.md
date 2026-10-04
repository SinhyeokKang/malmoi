# Add sources

Add more translation files later, or change a source's base language.

Each source is one set of translation files in your repository. Project owners can add a source and declare its base language; translators (Editor role) can read source status but cannot change project settings.

## Open Sources {#sources}

Open **Sources** from the project navigation. Each row shows the source's status — **Not synced yet**, **Syncing…**, **Synced**, **Partially synced**, or **Sync failed** — and how many keys and languages it has.

![The Sources page listing two synced sources with their file paths, key counts, and languages](/guide/sources.webp "Each source is one set of translation files.")

## Add sources {#add-sources}

1. Choose **Add sources**, then choose detected files or enter a supported path.
2. Choose the **Base language** for each selection, then choose **Add selected sources**. A file can fail while the other files are added, so check each result.
3. Follow the result's **Settings** link and copy the new source steps from the generated workflow into your repository's workflow file. Adding sources does not edit that file automatically.

![The Add sources dialog with detected translation files on the left, a preview of their keys and values, and a base language menu](/guide/add-sources.webp "Select files, check the preview, and choose a base language.")

## Change the base language {#base-language}

1. Open the source's details from **Sources**. Under **Base language**, choose the language that supplies the source text, then choose **Save**. Until it applies, the source's details show **Waiting to apply**. The change applies on the next update from your repository's GitHub Actions workflow. Choosing **Sync** does not apply it.
2. Edit the workflow's `base-locale:` value to match it.
3. Run the workflow. If there are unsent edits, the update is held. Publish or resolve those edits, then run the workflow again.

[Sync from the repository](../sync/revert.md#resync) replaces values but keeps the current base language.

## What happens next {#next}

The next successful workflow run reads the source with its declared base language.
