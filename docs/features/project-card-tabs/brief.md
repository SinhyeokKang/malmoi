# Claude Design brief — Home project meta card → tabs

Paste this into Claude Design. The handoff it produces becomes the visual source of truth for this feature (the open spec decisions D2–D6, D8 get decided from it).

## Context

Malmoi is a localization management tool. The project Home (`/projects/[slug]`) is a two-column page: left column `minmax(0,1fr)` with four count cards, "Needs your attention", "Recent logs"; **right column fixed 320px** with the `Project` meta card (an `<aside>` landmark). Light theme only, existing tokens (`app/globals.css`), Geist + Pretendard, lucide icons. Card radius 12, border `#e5e5e5`, inner dividers `#f0f0f0`, card head `min-h-12` padding `12 16` 15/500. Fact rows: label column 96px 13px `neutral-400`, value 14px. Existing badges: `soft-neutral` (run type: `Manual sync`, `Nightly sync`, `CI sync`, `Manual publish`, `Nightly publish`…), `soft-red` `Sync failed`, `soft-amber` `Partially synced` / `Held`. External links are blue with no glyph; in-app links are foreground + `ChevronRight`.

## Problem with the current card

```
Project
Repository   acme/web
Branch       main
Sources      2
Locales      [🇺🇸 en] [🇰🇷 ko] [🇯🇵 ja] [🇫🇷 fr]      ← union across sources
Keys         903
Members      4
─────
Last sync    [Nightly sync] 1d ago · [Sync failed] 10m ago · [Held]   ← 5 facts, two different sources
Last publish Pull request #127 · [Nightly publish] 2d ago
Created      3 weeks ago
─────
Settings ›
```

- Too many facts inline in one row; in 320px they wrap and you can't tell which fragment belongs to which fact.
- Locales are stored **per source** but shown as one merged row.
- `Last sync` time is the newest success across all sources, while the failure next to it is the worst single source — they look like one event but aren't.

## What to design

Turn the card into **three tabs: `Overview` · `Sync` · `Publish`**. The card head stays `Project` (it names the landmark). **Rule: one fact per row** (label + one value; a status badge only when the badge *is* that row's value).

**Put in as many facts as fit — vertical space is plentiful. The product owner will remove rows during this round.** Candidate rows (all exist in data today). **Every label must fit the 96px label column at 13px** — longer labels wrap.

- **Overview tab**: Repository (link; when disconnected the status badge is the value) · Connection · Branch · Sync branch (where Malmoi opens PRs) · CI (push token `Configured` / `Not set up`) · Sources (count, links to the Sources page — **only when there are 2+ sources**) · Default source (**only with 2+ sources**) · Keys (total) · Members · Pending invites · Created · Archived (when archived).
- **Sync tab**: Run (run-type badge of the last successful sync) · Synced (time) · Hold (`Held` badge, may stream in late) · Values changed · Keys seen (these two are **project-wide numbers from that one run** — keep them next to `Run`, never inside a per-source row) · per source: Commit (short SHA → GitHub link) · Committed (commit time ≠ sync time) · Synced / state (that source's success time, or `Syncing` / `Sync failed` / `Partially synced` as the row's value).
- **Publish tab**: Pull request (`#127` link) · PR state (`Open` / no open PR / `Couldn't check` — streams in late, and **is absent entirely** when we didn't check) · Published (time) · Run · Files changed · Held back (edits not included, waiting for next publish) · Dropped (items the writer skipped) · Sources in that PR · Unsent now.
- **Already decided — do not draw**: locales of any kind (the Sources page owns them), per-source base locale / format / path / key count, next nightly run, sync status / reason / last failure (the danger banner above owns those), last nightly check.
- Never show a person's name/email; run type badges only.

## Decisions we need from this round

1. **Sync tab axis** — per-source list (row = source, value = that source's time or its state) with project-wide `Run` / `Hold` / `Values changed` / `Keys seen` rows above, **or** project-level rows only (`Synced`, `Run`, `Hold`) — in the latter, failures don't appear in the card at all (the banner owns them).
2. **Which candidate rows to drop** — default is keep all.
3. **Where `Held` lives** — Sync tab or Publish tab.
4. **Default tab / status signal** — always `Overview`, or open `Sync` on failure, or a dot/badge on the tab label. (A danger banner above already reports sync failure.) Only facts known at first paint may pick the default tab — a hold that streams in late must not switch tabs.
5. **Where the tab list sits relative to the card head** — inside the head, right below it, or replacing it. The landmark must still be named `Project` for screen readers.
6. **Tab heights differ** — accept that the `Settings ›` footer moves up/down per tab, or give the panel a min-height of the tallest tab.
7. **Late rows** (`Hold`, `PR state`) — reserve their slot from first paint, or let the row appear when the value arrives.

## States to draw (artboards)

`2a` default (1 source and 2 sources) · `2a` empty (first sync not done) · `2b` sync failed on one of two sources / partially synced · `2c` not connected (repo row loses link, shows status badge) · `2d` archived (`Archived` row) · `2e` loading skeleton — **row count = the most common shape of the default tab** · Publish: never published · first sync not done in one source · hold arriving late.

## Constraints

- Width 320, the left column must not change. No new raw colors; reuse badges above. No external-link glyph.
- **Tab style is fixed — use the existing segmented-control look**, full width with three equal segments. Track `--canvas` rgb(245 246 247) radius 12, padding 4, gap 4; segments **radius 10** (concentric: 12 = 10 + 4), padding `4px 8px`, 14px; selected = white background + `--shadow-low` (0 4px 12px 4px rgb(22 24 27 / 0.05)) + weight 500; unselected = muted text, hover → foreground. Each segment's content width is ~74px inside the card, which is why the labels are `Overview` · `Sync` · `Publish` (`Last publish` truncated).
- `Settings ›` footer link stays (OWNER only — EDITORs don't see it, so draw the skeleton without it for them).
- No actions inside the card (Sync/Publish/Reconnect live in the page header and banners).
