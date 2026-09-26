# Add the workflow

Add the generated GitHub Actions workflow so repository changes reach your project.

The workflow runs when the base branch changes and sends the repository files to Malmoi. Keep the generated path and the project push token together; the Settings screen shows the current workflow again when you need to repair it.

## Install the workflow {#workflow}

Save the generated file as `.github/workflows/malmoi-i18n.yml`. If your code reads translations through a wrapper such as `next-intl#useTranslations()`, add that wrapper during setup so key usage can be reported.

## Store the push token {#push-token}

Add the project token as the repository Actions secret `PUSH_TOKEN`. A token rotation invalidates the old token immediately, so update the secret at the same time.

## Confirm the first run {#first-run}

Run the workflow on the base branch and return to Sources. The project becomes ready only after the first sync succeeds. A failed run keeps the project out of the ready state and reports the reason in the Actions log.
