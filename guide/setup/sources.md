# Add sources

Use **Sources** to add translation files and manage the base language for each source.

Sources owns the files and the base language used for a project. Project owners can add a source and declare its base language; editors can read source status but cannot change project settings.

## Open Sources {#sources}

Open Sources from the project navigation. Each row shows whether the source has been read, whether its last sync failed, and which languages are available.

## Add sources {#add-sources}

Choose detected files or enter a supported path. The entire selection is checked together, so a failed source does not leave a half-created project configuration.

## Change the base language {#base-language}

Declare the language that supplies the source text. The change takes effect on the next repository sync. If unpublished edits are waiting, that sync waits until the edits are published or a project owner resolves them.
