# Add sources

Add more translation files later, or change a source's base language.

Each source is one set of translation files in your repository. Project owners can add a source and declare its base language; translators (Editor role) can read source status but cannot change project settings.

## Open Sources {#sources}

Open **Sources** from the project navigation. Each row shows whether the source has been read, whether its last workflow failed, and which languages are available.

## Add sources {#add-sources}

1. Choose detected files or enter a supported path.
2. Add the source. A file can fail while the other files are added, so check each result.
3. Update the workflow in **Settings** so it has a step for the new source; adding a source does not connect the workflow automatically.

## Change the base language {#base-language}

1. Declare the language that supplies the source text.
2. Edit the workflow's `base-locale:` value to match it.
3. Run the workflow. If unpublished edits are waiting, the run waits until they are published or a project owner resolves them.

## What happens next {#next}

The next successful workflow run reads the source with its declared base language.
