# Account

Manage your profile, sign-in methods, GitHub and GitLab connections, and active sessions in Account.

Before you start: Open your avatar menu at the top right and choose **Account**.

## Update your profile {#profile}

1. Edit your name and choose **Save**. **Saved** confirms the change.
2. To change your picture, choose **Upload** and select a PNG or JPEG up to 3 MB. Your avatar updates after the upload succeeds.

The picture is resized automatically and the original file is not kept.

![The Account page with the profile, sign-in methods, GitHub App, and GitLab PAT sections](/guide/account.webp "Update your profile and sign-in methods in Account.")

## Manage sign-in methods {#sign-in-methods}

Choose **Connect** for another provider and sign in with the same email address. The last method cannot be removed; Account says **This is your only way to sign in.**

## Manage the GitHub connection {#github-connection}

Project owners use the **GitHub App** section to authorize repository selection and manage installation access. This is separate from signing in. Translators can skip this section.

If authorization expires, choose **Reauthorize GitHub App**. Projects that are already connected keep syncing while you renew this authorization.

## Manage the GitLab token {#gitlab-token}

Project owners who use GitLab.com repositories connect a GitLab personal access token in the **GitLab PAT** section. Translators can skip this section.

1. If no token is connected, choose **Create a token in GitLab**, create a legacy personal access token with the `api` scope there, paste it into **Personal access token**, and choose **Connect**.
2. Check the badge: **Connected**, **Expires soon** when the token expires within 14 days, or **Expired**. The section also shows the expiry date and how many projects use this connection. Within 14 days of expiry, a notice at the top of the section says how many days are left.
3. To renew the token, choose **Replace token** and paste a new token for the same GitLab account. Projects that use this connection switch to it right away. A token from a different GitLab account is rejected; to switch accounts, disconnect first.

Choosing **Disconnect** deletes the saved token from Malmoi. Projects that used it show **Disconnected** and stop syncing and publishing until a project owner reconnects them in project **Settings**, and **Logs** records that the connection was removed. Disconnecting in Malmoi doesn't revoke the token in GitLab; revoke it there if you no longer need it.

Projects you connect publish with your token, so their commits and merge requests on GitLab are attributed to your GitLab account.

## Sign out of sessions {#sessions}

1. Choose **Sign out everywhere**.
2. Use the dialog's confirmation button, Continue to GitHub or Continue to Google. Malmoi chooses one of your connected sign-in methods; follow its sign-in confirmation.

This also signs out the device you are using.

## What happens next {#next}

Return to a project after updating Account.
