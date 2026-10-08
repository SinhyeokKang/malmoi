# Limits

Malmoi allows 3 active owned projects, blocks new invitations at 10 members, and reads repository files up to 2 MB each.

## Project and member limits {#limits}

You can own up to 3 active projects. New invitations and resends are blocked once a project has 10 members. A project address (the name in its URL) can be up to 40 characters. Archiving a project frees a project slot. The same limit applies when you restore an archived project, when you are changed to **Owner**, and when you accept an invitation as **Owner**: Malmoi blocks the change if it would take someone past 3 active projects they own, and restoring checks every **Owner** of the project. A blocked invitation is not used up, so you can archive projects until you own fewer than 3 active ones and open the same link again. If you already own 3 or more active projects, they stay as they are and you can always archive one, but none of these changes goes through until you own fewer than 3. Pending invitations do not count toward the member check. Previously issued invitations can still be accepted, so membership can exceed that threshold.

## Invitation limits {#invitations}

A project can send up to 20 invitations in one hour, and one person can send up to 30 in one hour across all their projects, with no more than 20 addresses in one invitation request. The same address has a 60-second cooldown; all of these limits apply to the initial invitation and **Resend**. If any address would exceed a limit, no invitations are sent.

## File and translation limits {#files}

Each source must fit within 200 files, 2 MB per file, and 10 MB total when Malmoi reads it from the repository. When adding several sources together, their combined files must fit within the same budget. The nightly run reads the repository with the same budget; a larger change is held until you reduce the files or deliver it with the workflow. Each source step in a workflow can send up to 20,000 keys, 200 languages, 10,000 characters per value, and 200,000 translation values in total. These limits apply together; a source cannot send 20,000 keys in all 200 languages at once. A key name can be up to 1,000 characters. A profile picture must be PNG or JPEG and no larger than 3 MB. A project name can be up to 200 characters.
