# Create a project with GitLab

Connect a GitLab.com repository with a personal access token, choose the translation files Malmoi should manage, and create the project.

Before you start: Sign in with a verified email, go to **Projects**, and choose **New project**. You can own up to three active projects. You need the Maintainer role or higher in the GitLab project. Using another host? Follow [Create a project with GitHub](../github/create.md) instead.

## Connect GitLab {#connect-gitlab}

Malmoi connects to GitLab.com with a personal access token from your own GitLab account. GitLab Self-Managed and GitLab Dedicated are not supported.

1. Choose the **GitLab** tab at the top of the first step. If your Malmoi installation offers GitLab only, the step has no tabs and shows GitLab directly.
2. If GitLab isn't connected yet, the step shows **Connect GitLab**. Choose **Create a token in GitLab**. GitLab's personal access token page opens in a new tab with the name `Malmoi` and the `api` scope filled in.
3. On GitLab, check the expiration date, keep the `api` scope selected, and choose **Generate token**. Copy the token GitLab shows; GitLab shows it only once. Malmoi needs this legacy kind of token; a fine-grained token is refused.
4. Back in Malmoi, paste the token into **Personal access token** and choose **Connect**. While Malmoi checks it with GitLab, the step says so; a refused token shows the reason below the help text. Malmoi doesn't show the token again. If your saved token expired or can't be used anymore, the step shows **Reconnect GitLab**: paste a new token the same way.

![Step 1 of 4 of New project on the GitLab tab before GitLab is connected, with the Create a token in GitLab link and an empty Personal access token field](/guide/gitlab-connect-token.webp "Choose Create a token in GitLab, then paste the token and choose Connect.")

![GitLab's Generate legacy token page with Malmoi filled in as the token name and an expiration date set](/guide/gitlab-pat-form.webp "Check the name and expiration date that Malmoi filled in.")

![The scope list on the same page with only api selected, above the Generate token button](/guide/gitlab-pat-scopes.webp "Keep only the api scope selected and choose Generate token.")

## Select the repository {#select-repository}

1. Malmoi lists the GitLab projects where you have the Maintainer role or higher. If there are none, it shows **No GitLab projects to add**: get that role in GitLab, then choose **Try again**.
2. Select the repository, choose the **Branch** that contains your translation files, and choose **Next**. Translations come back as a merge request against this branch.

![Step 1 of 4 of New project on the GitLab tab, with the connected account and token expiry above the list, a project selected, and main chosen as its branch](/guide/gitlab-connect.webp "Select the GitLab project and its branch, then choose Next.")

Below the search box, Malmoi shows which GitLab account is connected and when its token expires. To use a new token for the same account, choose **Replace token**. You can also manage the token in [Manage the GitLab token and connection](connection.md#gitlab-token). The project publishes with the token of the person who connected it, so commits and merge requests on GitLab are attributed to that GitLab account.

## Choose files {#choose-files}

1. Select the detected files. Files with a single language are supported.
2. If your files are not detected, choose **Set the path yourself** and enter a supported path and format. See [Supported file formats](../reference/formats.md#formats) for path examples.
3. Review the preview, then choose **Next**.

Malmoi shows one source for each selected set of files. A source can use a different base language from another source.

![Step 2 of 4 with two detected sets of translation files selected and a preview of one set's keys and values](/guide/create-files.webp "Select the detected files and check their keys.")

## Fill in project details {#confirm-project}

1. Check each source's **Base language**. Its file decides which keys exist; keys found only in another language are left out.
2. Enter the project **Name** and **Address**. The address is the name in the project URL; it must be globally unique and cannot be changed later.
3. Review the file and size limits in [Limits](../reference/limits.md#files), then choose **Create project**.

![Step 3 of 4 with the project name and address filled in and English chosen as a source's base language](/guide/create-name.webp "Check the base language, name, and address before you create the project.")

The project is ready immediately. The last step says **Malmoi is ready**, and you can translate and invite teammates right away.

## Finish setup {#finish-setup}

1. Copy the push token shown on the ready page. It is shown once; rotate it later in **Settings** if you lose it.
2. Add the CI jobs and the `PUSH_TOKEN` variable by following [Add the GitLab CI jobs](ci.md). If the ready page says the CI file isn't available yet, keep the push token for later.
3. Choose **Open project** to go to the project's Home page.

The creator becomes **Owner**.

## What happens next {#next}

The nightly run keeps the project current once a day, with or without the CI jobs. The CI jobs update it on every commit and add code references after their first run. A failed job does not make the project unready. If something goes wrong, see [Troubleshoot GitLab](troubleshooting.md).
