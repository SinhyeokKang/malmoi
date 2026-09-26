# Add the workflow

Add the generated GitHub Actions workflow so repository changes reach Malmoi.

Before you start: Have the push token from the **Malmoi is ready** page. Store the secret before committing the workflow file.

## Store the secret {#push-token}

1. In GitHub, open the repository's **Settings**, choose **Secrets and variables**, then **Actions**.
2. Choose **New repository secret**, enter `PUSH_TOKEN`, paste the project token, and save it.

## Add the workflow {#workflow}

1. Save the generated file as `.github/workflows/malmoi-i18n.yml` in the repository.
2. Commit the file on the base branch. The generated workflow has one step for each source.
3. If your organization restricts actions, follow [Allow the actions](allowed-actions.md) before running it.

When a page shows a file to save, use the filename bar on the code block:

```yaml title=".github/workflows/malmoi-i18n.yml"
# Paste the generated workflow here.
```

If a repository reads translations through a wrapper, add the `wrapper` input to the generated step yourself. The setup screen does not collect it. The workflow's `github-token` input is read-only and only supports the warning about an open pull request.

## Run and check it {#first-run}

Run the workflow on the base branch. A successful run updates the project and reports success; a failed run leaves the project ready and shows the reason in the GitHub Actions run log.

To change the base branch later, edit the `branches:` value in the workflow. If you change a source's base language, also edit its `base-locale:` value.

## What happens next {#next}

After the first successful run, Malmoi can show code references for keys. The project remains ready even when a later run fails.
