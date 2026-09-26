# Add sources

Add more translation files later, or change a source's base language.

Each source is one set of translation files in your repository. Project owners can add a source and declare its base language; translators (Editor role) can read source status but cannot change project settings.

## Open Sources {#sources}

Open **Sources** from the project navigation. Each row shows whether the source has been read, whether its status is **Last sync failed** or **First sync failed**, and which languages are available.

## Add sources {#add-sources}

1. Choose **Add sources**, then choose detected files or enter a supported path.
2. Choose the **Base language** for each selection, then choose **Add selected sources**. A file can fail while the other files are added, so check each result.
3. Follow the result's **Settings** link and copy the new source steps from the generated workflow into your repository's workflow file. Adding sources does not edit that file automatically.

## Change the base language {#base-language}

1. Open the source's details from **Sources**. Under **Base language**, choose the language that supplies the source text, then choose **Save**. The change waits for the next update from the repository.
2. Edit the workflow's `base-locale:` value to match it.
3. Run the workflow. If unpublished edits are waiting, the run is deferred. Publish or resolve those edits, then run the workflow again.

For a manual replacement, see [Sync from the repository](../sync/revert.md#resync).

## What happens next {#next}

The next successful workflow run reads the source with its declared base language.
