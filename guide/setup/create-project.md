# Create a project

Create a project by connecting a repository and choosing the translation files Malmoi should manage.

Before you start: Sign in with a verified email. You can own up to three active projects.

## Connect GitHub {#connect-github}

1. Choose **Install GitHub App**. If no installation link exists, choose **Authorize GitHub App**. If the app is already installed, choose **Connect your account**.
2. In Malmoi, choose **Choose repositories** to open the app's installation on GitHub. Under **Repository access**, choose **Only select repositories**, add the repository, and save.
3. If Malmoi shows **Waiting for approval**, ask an organization owner to approve it, then choose **Try again**.

Malmoi shows the repository and its default branch. Choose the branch that contains the files you want to read.

## Choose files {#choose-files}

1. Select the detected files. Detection requires at least two languages.
2. For a TypeScript dictionary that is not detected, choose **Set the path yourself** and enter its path and format.
3. Check each source and its **Base language**, then continue.

Malmoi shows one source for each selected set of files. A source can use a different base language from another source.

## Name the project {#confirm-project}

1. Enter the project **Name** and **Address**. The address is the name in the project URL; it must be globally unique and cannot be changed later.
2. Review the file and size limits in [Limits](../reference/limits.md#files), then create the project.

The project is ready immediately. The first page inside creation says **Malmoi is ready**, and you can translate and invite teammates right away.

## Finish setup {#finish-setup}

1. Copy the push token shown on the ready page. It is shown once; rotate it later in **Settings** if you lose it.
2. Add the workflow and secret by following [Add the workflow](workflow.md).

Anyone signed in can create a project. The creator becomes **Owner**, and an account can have three active projects.

## What happens next {#next}

The workflow keeps the project current and adds code references after its first run. A failed workflow does not make the project unready.
