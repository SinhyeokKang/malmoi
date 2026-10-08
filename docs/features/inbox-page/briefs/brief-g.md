# Brief G — inbox-page guide text + shell shots

You run in the **main checkout** (`/Users/sinhyeok/code/malmoi`, branch `dev`) — you need the dev server and `.env.local`. Read `docs/features/inbox-page/{spec,orch}.md` (decision D3), `guide/AUTHORING.md`, `guide/SHOOTING.md`.

## Scope
1. `/guide` — update the inbox section (`guide/{en,ko,es}/translate/edit.md` `#inbox`) and any other guide text that describes the header inbox, the sidebar user zone (`Projects · MCP connector · Preferences · Account`), or the user menu items: there is now an **Inbox** page at `/inbox`, an **Inbox** sidebar item with an unread count, a user-menu item, and the header button's accessible name is `Inbox`. Viewing the page marks items read like opening the menu. en is the source, ko·es structural translations in the same commit. Facts come from the code on dev, not from this brief.
2. `/guide-shots` — **retake every shot that shows the app shell** (the LNB gained an Inbox item; SHOOTING says shell changes stale every shot). Keep shots without the shell (GitHub screens, shell-less skeletons) as is and say which. Consider whether the `#inbox` section should also show the new page (one new shot max; if added, add the mapping row). Follow SHOOTING masking/setup rules and log the run in its progress section.
3. `pnpm guide:check` before/after; `pnpm test` green (guide tests).

## Rules
- Sign in via **Continue with GitHub** yourself; ask the coordinator only on failure. dev DB residents are never deleted; any setup edits get reverted and logged (before/after) in SHOOTING's log entry as earlier runs did.
- Commit: guide text `docs(guide): …` and shots `docs(guide): retake shell shots for inbox sidebar item` (separate commits, English). **Do not push.** Stop `pnpm dev` and `rm -rf .next/dev` before finishing, then run `pnpm gate` (last line only, no pipes).

## Handoff
`.scratch/inbox-page/handoff-g.md`: commits, gate last line, shots retaken/kept, `guide:check` before/after. Then `worker_done` once.
