# Create a project

Create a project by connecting a repository and choosing the translation files Malmoi should manage.

Before you start: Sign in with a verified email, go to **Projects**, and choose **New project**. You can own up to three active projects. For a GitLab.com repository, you need the Maintainer role or higher in that GitLab project.

## Connect GitHub {#connect-github}

1. If GitHub is not connected, choose **Install GitHub App**, or **Connect your account** if your organization already installed it. If the installation button is unavailable, choose **Authorize GitHub App** and follow any instruction to ask an administrator for installation access. If repositories are already listed, continue below.
2. If the repository is not listed, choose **Add repositories** to open the app's installation on GitHub. Under **Repository access**, choose **Only select repositories**, add the repository, and save.
3. If Malmoi shows **Waiting for approval**, ask an organization owner to approve it, then choose **Try again**.
4. Select the repository, choose the **Branch** that contains your translation files, and choose **Next**. This is the base branch that Malmoi reads and opens translation pull requests against.

![Step 1 of 4 of New project with a repository selected in the list and dev chosen as its branch](/guide/create-repository.webp "Select the repository and its branch, then choose Next.")

## Connect GitLab {#connect-gitlab}

Malmoi connects to GitLab.com with a personal access token from your own GitLab account. GitLab Self-Managed and GitLab Dedicated are not supported.

1. Choose the **GitLab** tab at the top of the first step.
2. If GitLab isn't connected yet, choose **Create a token in GitLab**. GitLab's personal access token page opens in a new tab with the name `Malmoi` and the `api` scope filled in. Create the token there and copy it. Malmoi needs this legacy kind of token; a fine-grained token is rejected.
3. Paste the token into **Personal access token** and choose **Connect**. Malmoi checks it with GitLab and doesn't show it again.
4. Malmoi lists the GitLab projects where you have the Maintainer role or higher. If there are none, it shows **No GitLab projects to add**: get that role in GitLab, then choose **Try again**.
5. Select the repository, choose the **Branch** that contains your translation files, and choose **Next**. Translations come back as a merge request against this branch.

Above the list, Malmoi shows which GitLab account is connected and when its token expires. To use a new token for the same account, choose **Replace token**. You can also manage the token in [Account](../account/profile.md#gitlab-token). The project publishes with the token of the person who connected it, so commits and merge requests on GitLab are attributed to that GitLab account.

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

![Step 4 of 4, Malmoi is ready, with the push token, its Copy button, and the workflow file to save in the repository](/guide/create-ready.webp "Copy the push token and the workflow before you leave this page.")

1. Copy the push token shown on the ready page. It is shown once; rotate it later in **Settings** if you lose it.
2. Add the workflow and secret by following [Add the workflow](workflow.md).
3. Choose **Open project** to go to the project's Home page.

The creator becomes **Owner**.

For a GitLab project, the last step shows CI jobs for `.gitlab-ci.yml` instead of a GitHub workflow, and the push token goes into a CI/CD variable; see [Add the GitLab CI jobs](workflow.md#gitlab-ci). If the step says the GitLab CI file isn't available in this version of Malmoi yet, keep the push token anyway. Until then, the nightly run and **Sync** load repository changes.

## What happens next {#next}

The nightly run keeps the project current once a day, with or without the workflow. The workflow updates it on every commit and adds code references after its first run. A failed workflow does not make the project unready.
