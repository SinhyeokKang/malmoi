# Brief C fix1 — inbox-page T4 review findings

Review: `.scratch/review-c.md` in your worktree. Same rules as brief-c.md (stop before `/push`, `pnpm gate --base dev` last line only, no pipes). Test-first for each behavioural item.

Fix:
- **🟡1** Privacy table "Where it comes from" cell still says "when you open that list" — en `messages/en.tsx` ≈754 and ko `messages/ko-privacy.tsx` ≈80. Align with the rest of the row ("open the list or view the Inbox page"). Keep the 2026-10-09 revision row; refresh its `digest`/`koDigest` in `policy-gate.test.tsx`.
- **🟡2** Add `routes.inbox()` to the robots `disallow` in `lib/seo/crawl.ts` + crawl test expectation (the file header says protected paths must be mirrored there). Do not touch `/mcp` (out of scope — conductor records it).
- **🟡3** Add to `components/__tests__/inbox-page-scenario.test.tsx`: open header menu → open response `marked: true` → Escape → header and sidebar badges both gone. Remove the item (and the other already-(a) items listed in review ⚪3) from the handoff's runtime (b) list.
- **⚪1** Directly assert the spec'd "no dot revival": closed menu + a pre-signal list response resolving `marked:false` / success / failure → reopening shows no `[data-unread-dot]` (it.each the closed-menu case at ≈542). This must fail if the `seenThrough` guard is removed.
- **⚪4** `app/(edit)/inbox/loading.tsx` skeleton card: match `Card`'s classes (`bg-background`) so skeleton and real card share the surface.

One commit: `fix(inbox): close review gaps in policy text, robots and badge scenarios`. Append a "fix1" section to `.scratch/handoff-c.md` (SHA, gate last line, updated runtime (b) list, and note the two red-commit selector fixes from review ⚪2). Then `worker_done` once and idle.
