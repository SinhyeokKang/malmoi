# Create a project

Create a project by connecting a repository and choosing the translation files Malmoi should manage.

Before you start: Sign in with a verified email, open **Projects**, and choose **New project**. You can own up to three active projects.

## Connect GitHub {#connect-github}

1. If GitHub is not connected, choose **Install GitHub App**, or **Connect your account** if your organization already installed it. If the installation button is unavailable, choose **Authorize GitHub App** and follow any instruction to ask an administrator for installation access. If repositories are already listed, continue below.
2. If the repository is not listed, choose **Choose repositories** to open the app's installation on GitHub. Under **Repository access**, choose **Only select repositories**, add the repository, and save.
3. If Malmoi shows **Waiting for approval**, ask an organization owner to approve it, then choose **Try again**.
4. Select the repository, choose the **Branch** that contains your translation files, and choose **Next**. This is the base branch that Malmoi reads and opens translation pull requests against.

## Choose files {#choose-files}

1. Select the detected files. Detection requires at least two languages.
2. If your files are not detected, choose **Set the path yourself** and enter a supported path and format. See [Supported file formats](../reference/formats.md#formats) for path examples.
3. Review the preview, then choose **Next**.

Malmoi shows one source for each selected set of files. A source can use a different base language from another source.

## Name the project {#confirm-project}

1. Check each source's **Base language**. Its file decides which keys exist; keys found only in another language are left out.
2. Enter the project **Name** and **Address**. The address is the name in the project URL; it must be globally unique and cannot be changed later.
3. Review the file and size limits in [Limits](../reference/limits.md#files), then choose **Create project**.

The project is ready immediately. The first page inside creation says **Malmoi is ready**, and you can translate and invite teammates right away.

## Finish setup {#finish-setup}

1. Copy the push token shown on the ready page. It is shown once; rotate it later in **Settings** if you lose it.
2. Add the workflow and secret by following [Add the workflow](workflow.md).

The creator becomes **Owner**.

## What happens next {#next}

The workflow keeps the project current and adds code references after its first run. A failed workflow does not make the project unready.
