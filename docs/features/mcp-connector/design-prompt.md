# Claude Design prompt — `MCP connector` page (`/mcp`)

> 아래 블록을 그대로 Claude Design에 넘긴다. DS·코드베이스는 Claude Design이 이미 알고 있어 적지 않는다 — 기존 컴포넌트는 이름으로만
> 가리킨다. 시안 링크를 받으면 `design.md` §8에 붙인다.

---

# Malmoi — "MCP connector" page (`/mcp`)

**Deliverable: static design frames only. Do not build a prototype.** No click handlers, no state transitions. One frame per
state, side by side on the canvas, each labelled with its frame id below. Export as a `*.dc.html` handoff with real CSS
values inline.

## What this page is

A new page in the shell, under **Your work** in the sidebar: `Projects` · `New project` · **`MCP connector`** (lucide `Plug`) ·
`Account`. It lets a signed-in user create **one** personal API token that AI coding agents (Claude Code, Codex, Cursor) use to
call Malmoi over MCP. Exactly one token per account; it can't be edited — to change what it can do you **rotate** it.
`limited` width (896), same as `/account`. Page title = sidebar label: **MCP connector**.

Reuse: `PanelHeader`/`PanelBody`, `RowCard` + `EmptyRowCard inset` (Members), `Button` `primary`/`default`/`danger`,
`Badge neutral`, `Alert` `danger`/`warning`, `Radio`/`Checkbox`, `SegmentedControl`, `CodeBlock` (from `/docs`), the token chip +
Copy from onboarding step 4, `OnboardingModal` (same shell as Invite members), 440 `Dialog`. No new colors, sizes or components.

## Sections (top → bottom)

### 1. Token card (`RowCard`)

`h2` **Your token** · description `One token per account. Rotate it to change what it can do.` · header actions on the right.

With a token — a meta block (label column in neutral-400, values dark):
```
Allowed actions   Translate & publish · Members     (or: Read only — when nothing is checked)
Scope             All projects                       (or: 3 projects)
Created           Sep 28, 2026
Last used         2 minutes ago                      (or: Never)
Expires           in 89 days
```
Under it a permanent muted caption: `Project settings and Members apply only where you're a project owner.`

Without a token — `EmptyRowCard inset` (Plug glyph): title `No token yet`, text `Create a token to let an AI agent work in your
projects.` **No button in the empty state** — the action is the header button.

### 2. Connect (`RowCard`)

`h2` **Connect** · description `Set the token as an environment variable; never paste it into a config file.`
- `Server URL` label + sans `<code>` chip `https://mal-moi.com/api/mcp` + Copy.
- `SegmentedControl`: `Claude Code` (selected) · `Codex` · `Cursor`.
- `CodeBlock` with filename bar `~/.claude.json`:
```
{
  "mcpServers": {
    "malmoi": {
      "type": "http",
      "url": "https://mal-moi.com/api/mcp",
      "headers": { "Authorization": "Bearer ${MALMOI_TOKEN}" }
    }
  }
}
```
Draw only the Claude Code variant.

### 3. Guide line (no card)

Muted paragraph with an inline link: `See what an agent can do and example prompts in the guide → Connect an AI agent`

## Frames (1440×900, shell visible)

| id | state | what differs |
|---|---|---|
| **1a** | No token | Header action `primary` **Create token**. Section 1 = empty state. Sections 2–3 below. |
| **1b** | Active token | Header actions `default` **Rotate** · `danger` **Revoke**. Meta block filled. |
| **1c** | Expired token | As 1b, but header action is `primary` **Create token** only; `Badge neutral` **Expired** after the `h2`; meta values in neutral-400; `Expires` reads `Sep 1, 2026`. |
| **2a** | Create modal — step 1 | `OnboardingModal` over 1a, title **Create token**, form in a single left column. (1) `Expires in` — radios `30 days` · `90 days` (selected) · `365 days`, help `Expiry is required.` (2) `Allowed actions` — four checkboxes with a muted hint each: `Translate & publish` — `Save translations and open publish PRs.` / `Project settings` — `Sources, base branch, push token, archive.` / `Members` — `Invite, change roles, remove.` / `Create projects` — `List your GitHub repositories and set up new projects.`; one muted line under the group: `Reading keys, events and members inside your projects never needs a grant.` (3) `Scope` — radios `All my projects` (selected) · `Chosen projects`; under the second, the user's projects as checkbox rows (name + `owner/repo`), archived ones absent. Footer `Step 1 of 2` · `default` **Cancel** · `primary` **Create**. |
| **2b** | Create modal — step 1, zero memberships | As 2a, but `Chosen projects` is `aria-disabled` (muted) with a reason beneath: `You're not a member of any project yet.` No project list. |
| **2c** | Create modal — step 2 (token shown once) | Title **Your token**. Line `Copy it now — it won't be shown again.` (no bold). Token chip with a full `mlm_…` value + Copy. Muted line `Set it as MALMOI_TOKEN in your shell, then use the Connect snippet below.` Footer `Step 2 of 2` · `primary` **Done**. |
| **2d** | Rotate modal — step 1 | As 2a, title **Rotate token**, `warning` Alert at the top of the body: `Rotating stops the current token immediately. Every agent using it stops until you paste the new one.` Confirm label **Rotate and show new token**. |
| **3a** | Revoke dialog | 440 `Dialog` over 1b. Title **Revoke your token?** Body `Every agent using it stops immediately. This can't be undone.` Footer `default` **Cancel** · `danger` **Revoke token**. |
| **4a** | Server rejection | Frame 2a with a `danger` Alert at the top of the modal body: `We couldn't create the token. Try again in a moment.` Form values preserved, **Create** enabled. |
| **4b** | Result unconfirmed | Frame 1b with a `warning` Alert in Section 1 above the meta block: `We couldn't confirm the result. If you didn't get a token value, rotate to get a new one.` No extra buttons — the header's Rotate is the recovery. |

Not needed: loading/busy (the `Button` primitive renders it) and copy-failed (`Copy` renders `Copy failed` itself).

## Rules

- Exactly one `primary` button per frame.
- No table, no per-row kebab menus, no badge other than `Expired`, no tooltips — reasons for disabled controls are visible text.
- Token string and server URL are sans; only the JSON snippet is mono.
