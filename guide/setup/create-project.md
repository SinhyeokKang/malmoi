# Create a project

Choose a repository and its translation files to create a project for your team.

Project creation checks the repository connection, discovers supported translation files, and prepares the first sync. Only project owners choose the repository and confirm the files.

## Connect GitHub {#connect-github}

Sign in with a verified account, then connect the GitHub App. The connection checks the GitHub account, the App installation, and the selected repository together.

## Choose files {#choose-files}

Select the detected files that belong to the project. A project can contain multiple non-overlapping Sources. Confirm the format and path shown for each selection before continuing.

## Confirm the project {#confirm-project}

The confirmation step checks the fixed file and size budget and the project name. A failed check leaves the project creation incomplete; it does not create a partial project.

## Finish setup {#finish-setup}

The final step shows the workflow file and a project push token. Keep the token in the repository secret described in [Add the workflow](workflow.md), then wait for the first successful sync before inviting editors.
