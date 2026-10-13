# Account

Manage your profile, sign-in methods, GitHub and GitLab connections, and active sessions in Account.

Before you start: Open your avatar menu at the top right and choose **Account**.

## Update your profile {#profile}

1. Edit your name and choose **Save**. **Saved** confirms the change.
2. To change your picture, choose **Upload** and select a PNG or JPEG up to 3 MB. Your avatar updates after the upload succeeds.

The picture is resized automatically and the original file is not kept. Malmoi does not take a picture from GitLab; if you first sign up with GitLab, your avatar starts with the first letter of your name. You can upload a picture here.

![The Account page with the profile, the GitHub, GitLab, and Google sign-in methods, and the GitHub App section](/guide/account.webp "Update your profile and sign-in methods in Account.")

## Manage sign-in methods {#sign-in-methods}

The available providers on mal-moi.com are GitHub, GitLab, and Google, in that order. On your own installation, only enabled providers appear. Choose **Connect** for another provider and sign in with the same email address. The last method cannot be removed; Account says **This is your only way to sign in.**

If you've already authorized Malmoi in GitLab, GitLab may return you here without showing another screen.

## Repository connections {#connections}

For repository access, see [Manage the GitHub connection](../github/connection.md) or [Manage the GitLab token and connection](../gitlab/connection.md). Signing in and connecting a repository are separate. In **GitLab PAT**, an unconnected token row is named **GitLab token**.

Signing in with GitLab does not connect a token, and removing GitLab from your sign-in methods does not delete a connected token. To remove the token, choose **Disconnect** in the GitLab PAT section, then **Disconnect token** in the confirmation dialog. Projects using that token stop syncing and publishing until a project owner reconnects them. Removing the token does not remove your GitLab sign-in method.

## Sign out of sessions {#sessions}

1. Choose **Sign out everywhere**.
2. Use the dialog's confirmation button, Continue to GitHub, Continue to GitLab, or Continue to Google. Malmoi chooses one of your connected sign-in methods; follow its sign-in confirmation.

If you've already authorized Malmoi in GitLab, GitLab may return you here without showing another screen.

This also signs out the device you are using.

![The Sign out everywhere? dialog with Cancel and Continue to GitHub buttons](/guide/sign-out-everywhere.webp "Continue to your sign-in provider to confirm.")

## What happens next {#next}

Return to a project after updating Account.
