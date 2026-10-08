# Brief Q — inbox-page runtime QA (T5 + T6)

You run in the **main checkout** (`/Users/sinhyeok/code/malmoi`, branch `dev`). **No code edits, no commits, no `pnpm build` while `pnpm dev` runs.** Read `docs/features/inbox-page/{spec,design,tasks,orch}.md` and `.claude/commands/runtime-test.md` (procedure, §7.1 fixtures, §8 filing) and follow `/runtime-test`.

## Scope
1. **T5 local** — every bullet of tasks.md T5 (local part) + the runtime (b) lists in `.scratch/inbox-page/handoff-{a,b,c}.md`.
2. **T6** — tasks.md T6: computed-style comparison of `/inbox` cards/rows vs Home `Needs your attention` card (header · row padding · type · rules), sidebar Inbox badge vs `Projects` badge, `loading.tsx` skeleton vs real layout (DESIGN §6.67), dark tokens. Also B's (b): Home attention row height == Home skeleton row height (sub-line now `leading-normal`), dropdown unread dot inside the 16px gutter, roving focus survives a response while the menu is open. Widths 1280 · 1440 · 1890; DOM checks: horizontal scroll, overlap, clipping, empty boxes. Record differences with reasons (0 or each justified).
3. **T5 prefetch (production build)** — on `https://dev.mal-moi.com` (preview is production mode and uses the dev DB). Follow tasks.md T5's prefetch paragraph exactly: read the target user's `User.attentionSeenAt` from the dev DB **before** (read-only — a short `.scratch/` script using `lib/db.ts`/Prisma with the main checkout's `.env.local`, which points at dev; never prod), confirm in the network panel that hovering/viewport makes the sidebar `/inbox` link fire a prefetch RSC request **and it completes**, then read the same value again. Pass = request completed + value unchanged. No request observed = **unverified**, not pass.

## Rules
- Sign in yourself via **Continue with GitHub** in ego-browser (live `SinhyeokKang` session) — ask only if it fails. EDITOR view (Google) only if needed; ask the coordinator then.
- dev DB residents (QA projects, operator-check) are never deleted. If you change dev DB state (e.g. to create unread items or a 10+ count), record a before/after table and restore.
- File every defect via **BugShot** immediately (title tag `[inbox-page]`), per runtime-test §8. Use `gh` only if BugShot itself is blocked, and then file that blockage to `SinhyeokKang/bugshot-2` first.
- Before you finish: stop `pnpm dev`, remove any repo clone you put under `.scratch/` (move outside the repo), `rm -rf .next/dev`.

## Handoff
`.scratch/inbox-page/handoff-q.md`: each check → pass / fail(issue #) / unverified(reason); T6 diff table; DB before/after; issue numbers. Then `worker_done` once (outcome succeeded even if defects were found — defects are the issues).
