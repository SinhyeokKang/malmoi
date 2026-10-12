# Add sources

Add more translation files later, change a source's base language, or remove a source you no longer manage.

Each source is one set of translation files in your repository. Project owners can add a source and declare its base language; translators (Editor role) can read source status but cannot change project settings.

## Open Sources {#sources}

Open **Sources** from the project navigation. Each row shows the source's status — **Not synced yet**, **Syncing…**, **Synced**, **Partially synced**, or **Sync failed** — and how many keys and languages it has.

![The Sources page listing two synced sources with their file paths, key counts, and languages](/guide/sources.webp "Each source is one set of translation files.")

## Add sources {#add-sources}

1. Choose **Add sources**, then choose detected files or enter a supported path. Choose **Next**; it stays off until you select at least one new file.
2. Under **Choose base languages**, choose the **Base language** for each new source, then choose **Add selected sources**. Choose **Back** to change your selection; your choices are kept. A file can fail while the other files are added, so check each result. If nothing is added, you stay on this step with your selection intact.
3. Follow the result's **Settings** link and copy the new source steps from the generated workflow into your repository's workflow file (on GitLab, copy the whole CI file and replace Malmoi's jobs in `.gitlab-ci.yml` with it). Adding sources does not edit that file automatically.

![The Choose base languages step of Add sources, with one source's path and its languages as radio options, step 2 of 2, and Back and Add selected sources buttons](/guide/add-sources.webp "Choose the base language for each new source, then add the selected sources.")

## Remove a source {#remove-source}

1. Open the source's details from **Sources** and choose **Remove source**. It is available to project owners only, and not for the last source in a project.
2. Read the confirmation, then choose **Remove source** again. If the source has unsent edits, the dialog says how many; re-adding the source later replaces them with the repository's values. If a Malmoi pull request is open, the dialog says the source's changes in it drop out at the next publish.
3. Remove the source's step from your repository's workflow file. Until you do, the next run fails and stops the sources after it. On GitLab, remove the source's job from `.gitlab-ci.yml`; until you do, only that job fails, and the other sources' jobs still update them.

Removing a source stops syncing it. Files in your repository aren't changed, and the source disappears from **Sources**, Publish, and the nightly update. Its keys, translations, and history are kept.

![The Remove emails from this project? confirmation over the source details, with a warning to remove the source's step from the workflow](/guide/source-remove.webp "Read the warning, then choose Remove source again.")

## Add a removed source again {#re-add}

Choose **Add sources** and select the same path with the same file format. The removed source comes back with its translations. The first sync after that replaces its unsent edits with the repository's values wherever the repository has one; edits the repository has no value for stay unsent. If you choose a different file format for the path, Malmoi adds a new source instead; update the workflow as for any new source.

## Change the base language {#base-language}

1. Open the source's details from **Sources**. Under **Base language**, choose the language that supplies the source text, then choose **Save**. Until it applies, the source's details show **Waiting to apply**. The change applies on the next update from your repository's GitHub Actions workflow or GitLab CI jobs. Choosing **Sync** does not apply it.
2. Edit the workflow's `base-locale:` value to match it, or the job's `MALMOI_I18N_BASE` value on GitLab.
3. Run the workflow. If there are unsent edits, the update is held. Publish or resolve those edits, then run the workflow again.

[Sync from the repository](../sync/revert.md#resync) replaces values but keeps the current base language.

![The source details with its path pattern, sync status, the Base language menu with a Save button, and its languages](/guide/source-details.webp "Choose the base language and Save, then update the workflow.")

## What happens next {#next}

The next successful workflow run reads the source with its declared base language. After a removal, a run that still includes the removed source's step is rejected as removed and loads nothing, so delete that step.
