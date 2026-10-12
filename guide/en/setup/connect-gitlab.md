# Connect GitLab

Connect a GitLab.com repository with a personal access token so Malmoi can read your translation files and open translation merge requests.

Before you start: Sign in with a verified email, go to **Projects**, and choose **New project**. You can own up to three active projects. You need the Maintainer role or higher in the GitLab project. Connecting is the first step of a new project.

## Connect with a personal access token {#connect-gitlab}

Malmoi connects to GitLab.com with a personal access token from your own GitLab account. GitLab Self-Managed and GitLab Dedicated are not supported.

1. Choose the **GitLab** tab at the top of the first step. If your Malmoi installation offers GitLab only, the step has no tabs and shows GitLab directly.
2. If GitLab isn't connected yet, choose **Create a token in GitLab**. GitLab's personal access token page opens in a new tab with the name `Malmoi` and the `api` scope filled in. Create the token there and copy it. Malmoi needs this legacy kind of token; a fine-grained token is rejected.
3. Paste the token into **Personal access token** and choose **Connect**. While Malmoi checks it with GitLab, the step says so; a refused token shows the reason below the help text. Malmoi doesn't show the token again. If your saved token expired or can't be used anymore, the step shows **Reconnect GitLab**: paste a new token the same way.
4. Malmoi lists the GitLab projects where you have the Maintainer role or higher. If there are none, it shows **No GitLab projects to add**: get that role in GitLab, then choose **Try again**.
5. Select the repository, choose the **Branch** that contains your translation files, and choose **Next**. Translations come back as a merge request against this branch.

Below the search box, Malmoi shows which GitLab account is connected and when its token expires. To use a new token for the same account, choose **Replace token**. You can also manage the token in [Account](../account/profile.md#gitlab-token). The project publishes with the token of the person who connected it, so commits and merge requests on GitLab are attributed to that GitLab account.

## What happens next {#next}

Choose the translation files in the next step; continue with [Create a project](create-project.md#choose-files).
