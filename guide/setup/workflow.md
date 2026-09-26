# Add the workflow

Add the generated GitHub Actions workflow so repository changes reach Malmoi.

Before you start: Have the push token from the **Malmoi is ready** page. Store the secret before committing the workflow file.

## Store the secret {#push-token}

1. In GitHub, open the repository's **Settings**, choose **Secrets and variables**, then **Actions**.
2. Choose **New repository secret**, enter `PUSH_TOKEN`, paste the push token, and save it.

## Add the workflow {#workflow}

1. Copy the workflow from the **Malmoi is ready** page, or later from **Settings**, and save it as `.github/workflows/malmoi-i18n.yml` in the repository.
2. If your organization restricts actions, follow [Allow the actions](allowed-actions.md).
3. Commit the file on the base branch you chose during setup. The generated workflow has one step for each source.

If your code reads translations through a wrapper function other than the default `@/i18n#t`, add the `wrapper` input under that step's `with:`. Use `module#export` for a direct function, or append `()` for a hook, such as `next-intl#useTranslations()`. For multiple wrappers, use a YAML `|` block with one per line. Setup does not ask for this input. It helps Malmoi find code references; it does not decide which translation keys exist.

The `github-token` input is read-only and is used only to warn about an open pull request.

## Run and check it {#first-run}

Committing the workflow on the base branch starts it. To run it again, open GitHub **Actions**, choose the workflow, and choose **Run workflow**. Check the run log: `applied` means the files were loaded and **Sources** is updated in Malmoi. A green run can also report `deferred` when unpublished edits are waiting; see [When code changes](../sync/push.md#deferred). A failed run shows its reason in the log.

To change the base branch later, change **Base branch** in **Settings**, choose **Save**, and edit the workflow's `branches:` value. If you change a source's base language, follow [Add sources](sources.md#base-language) to update the workflow entry.

## What happens next {#next}

After the first successful run, Malmoi can show code references for keys. The project remains ready even when a later run fails.
