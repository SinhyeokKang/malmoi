# What the agent can do

The agent can do only what you can do in a project, and only what you allowed it, with a token or a connected app alike.

## Your role and allowed actions {#permissions}

A token or a connected app never adds a permission: if you are a translator (Editor role) in a project, **Project settings** and **Members** do nothing there.

A token with no allowed actions can still read translations, activity, and members in the projects its scope covers. Project owners can also preview a sync or a revert and read the workflow file without one. Only listing your GitHub repositories and their branches for a new project, and reading repository files, need an allowed action.

### Allowed actions and roles {#allowed-actions}

| Allowed action | What the agent can do | Who can use it |
| --- | --- | --- |
| **Translate & publish** | Save translations and publish them as a pull request. | Owners and Editors |
| **Project settings** | Add sources and rotate the push token (both also need write access to the repository), detect formats in the connected repository, sync from the repository, revert to the last published value, change the name, base branch, or base language, archive or restore. | Owners |
| **Members** | Invite people, cancel invitations, change roles, remove members. | Owners |
| **Create projects** | List your GitHub repositories and branches, detect formats, and create projects (creating also needs write access to the repository). | Anyone signed in, up to the [project limit](../reference/limits.md#limits) |

**All my projects** covers every project you are a member of, including ones you join later. **Chosen projects** covers only the projects you pick. A project the agent creates with **Chosen projects** is added to that token or connection, and to no other.

Changes to your role or membership apply from the agent's next request. Archived projects can't be changed, even with the right allowed action, except for restoring them with **Project settings**; the agent can still read their activity.

### Tools by task {#tools}

| Task | Tools |
| --- | --- |
| Find out who and what | `whoami`, `list_projects`, `get_project`, `list_members`, `list_events` |
| Set up a project | `list_repositories`, `list_branches`, `detect_formats`, `create_project`, `add_sources`, `get_workflow`, `rotate_push_token` |
| Translate | `list_keys`, `get_key`, `set_translations` |
| Publish | `preview_publish`, `publish` |
| Undo and resync | `preview_revert`, `revert_to_last_sent`, `preview_sync`, `sync_repository` |
| Manage the project | `update_project`, `set_base_locale`, `archive_project`, `unarchive_project` |
| Manage members | `invite_members`, `revoke_invitation`, `change_member` |

Tools that can discard work or cut off access, such as `sync_repository`, `revert_to_last_sent`, `rotate_push_token`, `archive_project`, `revoke_invitation`, and `change_member`, are marked as destructive, so most agents ask you before running them. Publishing, syncing, and reverting each start with a preview; if anything changed after the preview, nothing happens and the agent is asked to preview again. `set_translations` saves up to 100 keys per call; a key that can't be saved is reported and the rest are saved. While a project owner's **Sync** or the nightly update is running, `set_translations` and `revert_to_last_sent` change nothing and tell the agent when it can try again.
