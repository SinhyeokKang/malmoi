# Claude Design prompt — 검색 UX 통일 (`search-ux-unify` T0)

> 아래 블록을 그대로 Claude Design에 넘긴다. DS·코드베이스는 Claude Design이 이미 알고 있어 적지 않는다 — 기존 컴포넌트는 이름으로만
> 가리킨다. **이 시안은 `/design-sync`의 SoT가 아니다** — 이미 구현된 화면이라, 받은 시안은 `design.md` "시각 값의 정본 — T0"에
> 반영하고 사용자가 승인한 날짜를 적은 뒤에야 정본이 된다(spec "착수 조건"). 시안이 아래 **Fixed** 항목과 다르면 시안이 아니라
> Fixed가 이긴다 — 충돌은 사용자에게 묻는다.

---

# Malmoi — unify the global search dialog with the rest of the app

**Deliverable: static design frames only. Do not build a prototype.** No click handlers, no state transitions. One frame per
state, side by side on the canvas, each labelled with its frame id below. Export as a `*.dc.html` handoff with real CSS
values inline. Light only — there is no dark mode.

## What this is

The global search already exists: a `FieldButton` capsule in the middle of both headers (app shell and public shell) opens a
`CommandDialog` (same panel as `LargeModal`, pinned 16 from the top). It searches four groups in this order — **Projects →
Pages → Keys → Docs** — up to 5 rows per group. An empty query shows a preview instead.

This pass **does not add features**. It makes the dialog look and behave like the rest of the app:

- Result rows become the app's row primitive, **`ListRow` (`variant="canvas"`)** — the same IconTile + title + description row
  used on Logs, Sources and Account — instead of today's hand-built rounded, bordered rows.
- **Every** result row gets a 28 tile.
- One spacing system for input, status lines, group heads, rows and the empty state.
- The active row never changes height or width when it moves.
- Archived is one badge everywhere.
- Key chips (`Kbd`) get one look.

## Fixed (user decisions — do not change)

| What | Value |
|---|---|
| Header search capsule | `FieldButton` **320×40** (`h-10`, was 36), `rounded-full`, white, `border-border-subtle`, `shadow-low`. Hover = `bg-primary-foreground` (the white-bordered-control hover from `Button default`). Contents: Search 16 · `Search…` · key chip on the right |
| `Kbd` | **Gray face, no border**: `bg-foreground/5`, text `text-foreground/60`, `text-xs font-medium` sans, **height 20 (`h-5`)**, `px-1.5`, `rounded`. Labels: `⌘K` (macOS) / `Ctrl K` (others) / `↵` / `Esc` |
| Result row | `ListRow variant="canvas"`, full width of the list, **no radius**, `px-4 py-row-y` (13), `text-sm`. Title line and description line are each **one line, truncated** — long key names never wrap |
| Tile | **Every row has a 28 tile.** Projects: `ProjectThumbnail sm` (radius 8). All others: `IconTile sm` (radius 4) with the **same glyph the sidebar/user menu uses for that destination**: `Go to your projects` = `Box`; a Page row = that page's nav icon (Home `House`, Sources `Files`, Translations `Languages`, Logs `History`, Members `Users`, Project settings `Settings`, MCP connector `McpIcon`, Account `CircleUser`, Changelog `Compass`); `New project` = `Plus`; Keys = `Languages`; Docs rows and `Go to docs` = `CircleHelp`. No `Folder`, no `BookOpen` |
| Active row | `ListRow selected` = `bg-foreground/[0.07]` **only**. No border, no focus ring, **no hover fill** — even with the mouse resting on another row, exactly one row is painted |
| Row hint | `Go to` + `Kbd ↵` sits on the right of **every** row and is `invisible` unless the row is active, so it always reserves its space. Rows never grow or reflow when the active row moves |
| Archived | `StatusBadge state="archived"` = `Badge soft-neutral` `Archived` (dark text on the 5% gray face), `px-2`. Same in all six places (see frame B1). On `/projects` an archived row still dims its name and meta to `#a3a3a3`, but **the badge stays dark** |
| Group head | `text-xs font-medium text-muted-foreground` (menu-label tone) |
| Status lines | Outside the list, `text-xs`. Loading = muted. Failure = `text-destructive` |
| Colors | No new raw colors, no new tokens, no new components |

## Open (decide these in the frames)

1. **Spacing system.** Proposal to start from — change it if you have a better system, but keep one rule for all parts:
   - **16 from the left edge** for status lines, group heads, the empty state and the tile's left edge.
   - **The input's Search glyph center lines up with the tile center** (x = 30). `Input` bare puts its icon at `left-2.5`, so the input row is `px-3`.
   - Input row height 48 · list `py-2` · group `py-1` with **one divider between groups** (`border-divider`) · head `pt-2 pb-1`.
2. **Input row right side**: clear `X` (the `Input` clearable button, shown only when there is text) and the `Esc` `Kbd`. Pick the order and gap.
3. **Two-line rows** (Keys, Docs): title line + description, about 68 tall vs about 54 for one-line rows. Check that a mixed list still reads as one rhythm.
4. **Mobile 375**: the always-reserved `Go to ↵` (about 70) plus an archived badge squeezes the title to about 170. Decide whether the hint hides below `sm` (it may, since that is not tied to the active row).
5. **Logo link radius**: both headers use `rounded-sm` for the logo's focus/hover shape. Confirm it reads right in the app header.

## Content to use

- Projects: `Web App` (`web-app`), `Marketing Site` (`marketing-site`), `Mobile App` (`mobile-app`, **archived**).
- Pages (signed in, project `Web App`): `Home`, `Sources`, `Translations` with context ` · Web App`; work items `Projects`, `MCP connector`, `Account`; `New project`; `Changelog`.
- Keys rows — the title is the key with the context ` · Web App · web`, and the description is the snippet:
  - `checkout.button.pay` — `ko` `결제하기`
  - `checkout.summary.total_with_tax_and_shipping_fee_label` — `en` `Total (incl. tax and shipping)` — **use this one to show truncation**
- Docs rows: `Edit translations` / `Search across your projects…`, `Publish to GitHub` / `Open one pull request with every unsent edit…`.
- Matched text uses the existing `Highlight` (§6.2) on the **matched field only**: project **name** (never the slug), key title or snippet (never the ` · project · source` context).

## Frames

All search frames are 1440×900 with the app shell dimmed behind the dialog, unless noted.

| id | state | what differs |
|---|---|---|
| **H1** | App header | Logo · centered capsule (40) with `⌘K` chip · `New project` · avatar. Show the capsule at rest and on hover (two crops are fine). |
| **H2** | Public header, signed out | Same capsule with `Ctrl K`. Header nav `Changelog` · `Docs` · GitHub · primary sign-in. |
| **S1** | Signed in, empty query | Preview. **Projects**: current project first, 3 rows, then `Go to your projects` (`Box`). **Pages**: 3 rows of the current project. **Docs**: 3 rows, then `Go to docs` (`CircleHelp`). No Keys group. The first row is active. Exactly one row goes to `/docs`. |
| **S2** | Query `app` | All four groups. Projects includes `Mobile App` with the `Archived` badge **after** the archived-last ordering. Keys shows two-line rows with highlighted matches. The active row is the 2nd Keys row, and the mouse cursor rests on a Pages row that is **not** painted. |
| **S3** | Query `checkout` | Keys and Docs only. The long key row is active and truncates at the same point it would when inactive. |
| **S4** | Loading | Query `pay`. Projects and Pages are shown. A muted status line `Loading keys…` sits above the list. No empty state. |
| **S5** | Keys failed, other results present | Query `pay`. Danger status line `Keys can't be searched right now. Edit your search to try again.` Projects, Pages and Docs still listed. |
| **S6** | Everything failed or empty | Query `pay`. Two danger lines (Keys + `Docs can't be searched right now. Reopen search to try again.`). **No** "No results" empty state under failures. |
| **S7** | No results | Query `zzzz`. `NoMatch`: `No results for “zzzz”` + `Try another search.` No status line. |
| **S8** | Signed out | Public shell behind. Empty query preview = **Docs only** (3 rows + `Go to docs`). No Projects, Pages, Keys or Changelog groups. |
| **S9** | Signed in, project list unavailable | Status line (danger) `Projects can't be searched right now. Reopen search to try again.` Docs only, as S8. The header still shows the avatar. |
| **S10** | Session ended | Status line (danger) `Your session ended. Sign in again to search your projects.` Docs only. |
| **S11** | Mobile 375×812 | S2 at phone width — answers Open #4. |
| **W1** | Project switcher | LNB project-zone switcher (`DropdownMenu`, width 256) opened with the query `app`. Borderless input with accessible name `Search projects` and placeholder `Search projects…`, plus a gray `Esc` `Kbd` on the right. Rows are `ProjectThumbnail` 16 + name; `Mobile App` has the `Archived` badge (dark, `px-2`) and the current project has `Check` after the badge; then `Plus New project`. Second crop: query `zz` → one muted line `No projects match “zz”`. **No highlight in the switcher.** |
| **K1** | `Kbd` specimen | `⌘K`, `Ctrl K`, `↵`, `Esc` on white, on the 7% active row and on the canvas gray. Show that a 20-tall chip in a 28-tile row does not change the row height. |
| **B1** | Archived specimen | The same `Archived` badge in its six homes: search row · switcher row · `/projects` row (dimmed name and meta, dark badge) · Home head action · Logs filter · Sources archived head. |

## Rules

- No new colors, tokens, sizes outside this brief, or components. Reuse `ListRow`, `IconTile`, `ProjectThumbnail`, `StatusBadge`, `Badge`, `Kbd`, `Input` (clearable), `FieldButton`, `NoMatch`, `CommandDialog`.
- One look per concept: the active row looks like a selected row elsewhere in the app, and archived looks the same everywhere.
- Text is the existing English copy above. Curly quotes in `No … match “q”` and `No results for “q”`, and no period after either.
- Do not draw a dark variant, a command palette footer, a close `X` button on the dialog, or a "current project" marker in search results.
