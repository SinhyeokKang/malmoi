# FAQ

Short answers to common questions about Malmoi, with a link to the page that explains each one in full.

## What does Malmoi do? {#what-is-malmoi}

Malmoi is a translation management (i18n) tool for GitHub repositories. It finds your existing translation files, lets your team edit them in the browser, and sends saved changes back as a pull request without changing the file layout. See [How syncing works](sync/README.md#how-it-works).

## Do translators need Git or a GitHub account? {#translators}

No. Translators sign in with GitHub or Google, edit in the browser, and choose **Publish**; they never use Git. See [Join a project](translate/join.md#join).

## Which roles are there? {#roles}

There are two: **Owner** and **Editor**. Editors edit and publish translations; owners also manage the repository connection, sources, members, and syncing. See [Invite translators](setup/members.md#roles).

## Which file formats are supported? {#formats}

JSON and YAML catalogs, Chrome extension messages, and TypeScript or JavaScript code dictionaries, either one file per language or all languages in one file. See [Supported file formats](reference/formats.md#formats).

## Will Malmoi rewrite my files? {#file-structure}

Malmoi supplies the values, and the existing file keeps its shape: YAML catalogs and code dictionaries keep their comments, blank lines, and key order, and JSON files keep their indentation and escapes. See [Preserve file structure](reference/formats.md#file-structure).

## How do translations get back to my repository? {#pull-request}

**Publish** puts saved changes into one pull request for your development team to review and merge. While that pull request is open, the next Publish updates it instead of opening another. See [Publish your changes](translate/publish.md#publish).

## What happens if code changes while translators are editing? {#code-changes}

Malmoi never merges the two. While there are unsent edits or a Malmoi pull request is open, the whole repository update is held and Logs shows **Held**; once the edits are published and the pull request is merged or closed, the next update goes through. See [When code changes](sync/push.md#deferred).

## What happens to translations when a key is removed from code? {#removed-keys}

They are kept. If the key comes back in a later commit, its translations come back with it. See [Keep removed keys](sync/push.md#removed-keys).

## Do I have to add the workflow? {#workflow}

No. Without it, the nightly run picks up repository changes once a day. With it, changes arrive on every commit. See [Nightly sync or the workflow](sync/nightly.md#workflow).

## Does Malmoi have paid plans? {#pricing}

No. Malmoi has no paid plans and is open source under the MIT License.

## Does Malmoi translate text for me? {#machine-translation}

No. Malmoi has no machine translation or translation memory. You can connect your own AI agent; what it writes is saved as your edit, with the same checks as the browser. See [Connect an AI agent](ai-agents/README.md).

## Is there an approval step? {#review}

No. **Needs review** only marks translations whose source text changed, and saving clears it. See [Edit translations](translate/edit.md#save).

## What doesn't Malmoi support? {#not-supported}

Malmoi does not support ICU plural forms, concurrent editing, fine-grained permissions, in-context editing, screenshot attachments, translator notes, approval workflows, translation memory, or built-in machine or AI translation.

## How many projects and members can I have? {#limits}

You can own up to 3 active projects, and new invitations stop once a project has 10 members. Archiving a project frees a slot. See [Limits](reference/limits.md#limits).

## Can I change Malmoi's language, time zone, or theme? {#preferences}

Yes, in **Preferences**. These change only how Malmoi looks to you, not the languages your projects translate into. See [Preferences](account/preferences.md#preferences).

## What does Malmoi store about me? {#privacy}

Your name, email address, and profile picture from GitHub or Google, your project memberships, and who last changed each translation. Names, email addresses, and connection tokens are stored encrypted, and on mal-moi.com, Malmoi does not sell your data or use it for advertising. The **Privacy Policy** of the site you use lists everything; it is linked in the page footer.

## How do I delete my account? {#delete-account}

There is no delete button. Write to the address in the **Privacy Policy** of the site you use, linked in the page footer. On mal-moi.com, requests are answered within 30 days; on another site, the operator's policy sets the time. Translations stay with the project, but they no longer point to you.
