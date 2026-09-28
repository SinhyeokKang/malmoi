# Claude Design prompt — `MCP connector` page (`/mcp`)

> 아래 블록을 그대로 Claude Design에 넘긴다. 시안 링크를 받으면 `design.md` §8에 붙인다.

---

# Malmoi — "MCP connector" page (`/mcp`)

**Deliverable: static design frames only. Do not build a prototype.** No click handlers, no state transitions, no
interactive components. Put **one frame per state** side by side on the canvas, each labelled with its frame id below.
Export as a design handoff (`*.dc.html`) with real CSS values (px, hex, weights) inline so they can be read back by
computed-style comparison.

## What this page is

Malmoi is a localization management tool (light theme only, English UI). This page lets a signed-in user create **one**
personal API token that AI coding agents (Claude Code, Codex, Cursor) use to call Malmoi over MCP. There is exactly one
token per account. It cannot be edited — to change permissions you rotate (reissue) it. The page has three sections:
the token card, connection snippets, and a one-line link to the guide.

## Design system — reuse, don't invent

Everything below already exists in the product. Match it exactly; do not introduce new colors, radii, shadows or type sizes.

**Canvas & shell.** App canvas `#f5f6f7`-ish very light grey (`--canvas`). Left sidebar 240px wide, no background, no border
(sits on the canvas). Top header 40px, full width, holds the logo. Content is a white panel: `border-radius: 16px`,
1px very light border (`--border-subtle`), low shadow. Outer padding 8px, gap 8px between sidebar and panel.

**Sidebar.** Zone "Your work" with items (each 32px tall, 16px lucide icon + 14px label, `padding: 6px`, radius 8):
`Projects` (Box icon) · `New project` (Plus) · **`MCP connector` (Plug) ← new, active** · `Account` (CircleUser).
Below it the project zone (Home · Sources · Translations · Members · Logs · Settings) for the current project.

**Panel header (`PanelHeader`).** `padding: 12px 16px`, bottom border 1px `#e5e5e5`. Title row min-height 36px.
`h1` = 18px / 500 / letter-spacing 0.01em: **MCP connector** (same string as the sidebar label). Optional description
line under it: 13px `#737373`.

**Panel body.** `padding: 16px`, content max-width **896px** (`limited`, same as `/account` and project Settings).
Cards stacked with 16px gap.

**Card (`RowCard`, same as Members / Projects).** White, `border: 1px #e5e5e5`, `border-radius: 12px`. Header `padding: 16px`:
`h2` 15px/500 + optional neutral count badge + optional 13px muted description; **actions sit at the right of the header**.
Header bottom divider `#f0f0f0` (lighter than row dividers `#e5e5e5`). Body rows `padding: 14px 14px 14px 12px`.

**Type.** Pretendard. Sizes: 13 (`xs`, labels/meta/captions), 14 (`sm`, body/buttons), 15 (`base`, row names/card h2),
18 (page h1), 20 (modal title). Weights: 400 body, 500 titles/labels/buttons-never-bolder, 600 only at ≥24px. Base
text `#0a0a0a`-ish (`--foreground`), muted `#737373`, lighter meta `#a3a3a3` (neutral-400).

**Buttons.** Height 36 (`md`), `padding: 0 12px`, 14px/400, radius 10.
`primary` = black fill `#171717` white text (one per screen);
`default` = white fill, 1px `#e5e5e5` border, dark text;
`danger` = like default but red text `#dc2626` and border `rgba(220,38,38,.4)` — no red fill;
`sm` = height 28, `padding: 0 8px`, 13px (used for Copy inside code blocks).
Loading state: spinner replaces label, button keeps its width.

**Badge (`neutral`).** Pill radius 999, `padding: 2px 6px`, 13px/500, `background: rgba(10,10,10,.05)`, dark text.
Only one badge word in this page: `Expired`.

**Alert.** `danger`: white bg, border `rgba(220,38,38,.4)`, red text + CircleX icon. `warning`: bg `#fffbeb`, border `#fde68a`,
text `#78350f` + TriangleAlert icon. 14px, radius 10, `padding: 12px`.

**Inputs / choices.** Radio 16px circle (unselected border `#d4d4d4`), Checkbox 16px square (same border), label 14px, help
text 13px muted. Field height 36. `SegmentedControl`: a track of buttons, 36px tall, radius 10, selected segment white
on `--muted` (`#f5f5f5`) track.

**Code block (`CodeBlock`).** Card radius 12, 1px `#e5e5e5` border. Filename bar 40px tall, white, bottom divider
`#f0f0f0`, filename 13px mono muted on the left, `Copy` `sm` button on the right. Body `padding: 16px`, mono 13px /
line-height 1.7, white body, horizontal scroll, no syntax highlighting.

**Token chip (from onboarding step 4).** `height: 36px`, radius 10, 1px border, `padding: 0 10px`, `background: #f5f5f5`,
**sans 13px** (not mono), followed by a `Copy` button (36).

**Modal (`OnboardingModal`, for issuing).** Same shell as the New project and Invite members modals: **width 1024px**
(`calc(100% - 96px)` capped at 1024), height capped at 800 / viewport, white, radius 16, medium shadow, dim
`rgba(10,10,10,.32)` + 6px backdrop blur. The form is narrower than the modal — lay the fields in a single left column of
max 560px; do not shrink the modal. Header:
title 20px/500 + close X. Body `padding: 24px`, `gap: 16px`. Footer: top divider `#f0f0f0`, left caption 13px muted
(`Step 1 of 2`), right buttons.

**Dialog (440px, for Revoke).** Width 440, radius 12, title 15px/500, body 13px muted, footer buttons right-aligned
(Cancel `default` + confirm `danger`).

**Icons.** lucide, 16px. No brand icons.

## Page content and copy (use these strings verbatim)

### Section 1 — Token card (always first)

Card `h2`: **Your token**. Header description (13px muted): `One token per account. Rotate it to change what it can do.`
Header action (right): see per-state.

Body when a token exists — a single meta block, 13px, label column 96px in `#a3a3a3`, values in dark text:
```
Allowed actions   Translate & publish · Members            (or: Read only — when nothing is checked)
Scope             All projects                              (or: 3 projects)
Created           Sep 28, 2026
Last used         2 minutes ago                             (or: Never)
Expires           in 89 days                                (relative label; absolute date on hover)
```
Under the meta block, a permanent caption (13px muted, no bold):
`Project settings and Members apply only where you're a project owner.`

Body when no token — `EmptyRowCard inset`: 40px round chip (`rgba(10,10,10,.05)`) with a 16px Plug icon, padding 32,
centred, title 15px/500 `No token yet`, text 13px muted `Create a token to let an AI agent work in your projects.`
**No button in the empty state** — the action is the header button.

### Section 2 — Connect (card)

Card `h2`: **Connect**. Description: `Set the token as an environment variable; never paste it into a config file.`
Body:
- Row 1: label 13px muted `Server URL`, then a sans `<code>` chip `https://mal-moi.com/api/mcp` + `Copy` (36).
- Row 2: `SegmentedControl` with three segments `Claude Code` · `Codex` · `Cursor` (Claude Code selected).
- Row 3: one `CodeBlock` with filename bar. For the Claude Code segment, filename `~/.claude.json` and body:
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
(Only draw the Claude Code variant; the other two are the same block with a different filename.)

### Section 3 — Guide line (no card)

13px muted paragraph with an inline link (blue `#2563eb`, no underline):
`See what an agent can do and example prompts in the guide → Connect an AI agent`

## Frames (one static frame each, all at 1440×900, sidebar + header visible)

| id | state | what differs |
|---|---|---|
| **1a** | No token | Header action: `primary` **Create token**. Section 1 body = empty state. Sections 2–3 present below (the snippet still shows `${MALMOI_TOKEN}`). |
| **1b** | Active token | Header actions (right, gap 8): `default` **Rotate** · `danger` **Revoke**. Meta block filled as above. |
| **1c** | Expired token | Same as 1b but header action is `primary` **Create token** only; an `Expired` neutral badge sits after the `h2`; meta values in `#a3a3a3` (muted-out), `Expires` reads `Sep 1, 2026`. |
| **2a** | Issue modal — step 1 (form) | 1024px modal over 1a. Title **Create token**. Fields, top→bottom: (1) `Expires in` — three radios in a row `30 days` · `90 days` (selected) · `365 days`, help `Expiry is required.`; (2) `Allowed actions` — four checkboxes, each with a 13px muted hint beneath the label: `Translate & publish` — `Save translations and open publish PRs.` / `Project settings` — `Sources, base branch, push token, archive.` / `Members` — `Invite, change roles, remove.` / `Create projects` — `List your GitHub repositories and set up new projects.`; a single 13px muted line under the group: `Reading keys, events and members inside your projects never needs a grant.`; (3) `Scope` — radios `All my projects` (selected) · `Chosen projects`, and under the second a list of the user's projects as checkbox rows (name 15px/500 + `owner/repo` 14px muted), archived ones absent. Footer: `Step 1 of 2` · right `default` **Cancel** + `primary` **Create**. |
| **2b** | Issue modal — step 1, zero memberships | As 2a but the `Chosen projects` radio is visually disabled (text `#a3a3a3`) with a 13px muted reason beneath: `You're not a member of any project yet.` No project list. |
| **2c** | Issue modal — step 2 (token shown once) | Same modal. Title **Your token**. Body: 14px line `Copy it now — it won't be shown again.` (the phrase "won't be shown again" in weight 400, wrapped in a `<strong>` styled normal — i.e. no bold). Then the token chip `mlm_3f9a…` full 47-char value + `Copy` (36). Then a 13px muted line `Set it as MALMOI_TOKEN in your shell, then use the Connect snippet below.` Footer: `Step 2 of 2` · right `primary` **Done**. |
| **2d** | Rotate modal — step 1 | As 2a but title **Rotate token**, and a `warning` Alert at the top of the body: `Rotating stops the current token immediately. Every agent using it stops until you paste the new one.` Confirm button label **Rotate and show new token**. |
| **3a** | Revoke dialog | 440px Dialog over 1b. Title **Revoke your token?** Body: `Every agent using it stops immediately. This can't be undone.` Footer: `default` **Cancel** · `danger` **Revoke token**. |
| **4a** | Server rejection (inline) | Frame 2a with a `danger` Alert at the top of the modal body: `We couldn't create the token. Try again in a moment.` Form values preserved; **Create** button enabled. |
| **4b** | Result unconfirmed (page) | Frame 1b with a `warning` Alert inside Section 1 body, above the meta block: `We couldn't confirm the result. If you didn't get a token value, rotate to get a new one.` and no extra buttons (the header's Rotate is the recovery). |

Frames **not** needed: loading/busy (the button primitive renders its own spinner) and copy-failed (the Copy button
renders `Copy failed` itself).

## Rules

- Light theme only. No dark variant.
- Do not add colors beyond those named above (black/greys, red `#dc2626`, amber alert, link blue).
- Exactly one `primary` button per frame.
- No table; no per-row kebab menus; no badges other than `Expired`.
- No tooltips. Reasons for disabled controls are written as visible 13px text beneath them.
- Keep the token string sans-serif; only the JSON snippet is monospace.
