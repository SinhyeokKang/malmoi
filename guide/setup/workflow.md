# Add the workflow

Add the generated GitHub Actions workflow so repository changes reach Malmoi.

Before you start: Have the push token from the **Malmoi is ready** page. Store the secret before committing the workflow file.

## Store the secret {#push-token}

1. In GitHub, open the repository's **Settings**, choose **Secrets and variables**, then **Actions**.
2. Choose **New repository secret**, enter `PUSH_TOKEN`, paste the push token, and save it.

## Add the workflow {#workflow}

1. Copy the workflow from the **Malmoi is ready** page, or later from **Settings**, and save it as `.github/workflows/malmoi-i18n.yml` in the repository.
2. Commit the file on the base branch. The generated workflow has one step for each source.
3. If your organization restricts actions, follow [Allow the actions](allowed-actions.md) before running it.

If your code reads translations through a wrapper function, add the `wrapper` input to the step yourself; setup does not ask for it. The `github-token` input is read-only and is used only to warn about an open pull request.

## Run and check it {#first-run}

Committing the workflow on the base branch starts it. To run it again, open GitHub **Actions**, choose the workflow, and choose **Run workflow**. A successful run updates **Sources** in Malmoi; a failed run shows the reason when you open the run in GitHub Actions.

To change the base branch later, change **Base branch** in Settings and edit the workflow's `branches:` value. If you change a source's base language, follow [Add sources](sources.md#base-language) to update the workflow entry.

## What happens next {#next}

After the first successful run, Malmoi can show code references for keys. The project remains ready even when a later run fails.
