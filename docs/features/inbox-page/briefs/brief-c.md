# Brief C — inbox-page T4 (one commit)

You already did batch A in this terminal. Batches A and B are now in local `dev`. First: `git status` clean → `git rebase dev` (your worktree branch has only A commits, which are now in dev — after rebase your branch should equal dev; verify `git log --oneline dev..HEAD` is empty).

Plan sources: `docs/features/inbox-page/{spec,design,tasks,orch}.md`. Your item: **T4** (all 9 sub-items) as tasks.md lists it, design D1–D6, and every remaining `/tdd` table row (nav order, `isProtectedPath`, `routes.inbox()`, server page, `MarkSeen`, `InboxList`, `AttentionInbox` store/generation cases, `Sidebar`). Also the design notes on store isolation (`afterEach` → `setUnread(0)` in every test file that renders `AttentionInbox`/`Sidebar`) and the `client-graph.test.ts` allowlist.

## Ownership
- Everything design's table lists for T4, the tests named in tasks T4, `messages/{en,ko,es}.tsx`, `messages/ko-privacy.tsx`, and `components/landing/mockup/app-frame.tsx` comment.
- Dictionary keys go through `/translate` mode ① (all three dictionaries in the same commit).
- `attention-inbox.tsx` now uses B's shared `components/inbox/row-slots.tsx` — build on it, keep `itemKey`.
- Canon docs (PRODUCT/ARCHITECTURE/DESIGN/DIRECTORY/CLAUDE.md) and `guide/**` are NOT yours — put exact proposed edits in the handoff.
- `docs/features/inbox-page/briefs/` and `orch.md` are conductor-owned.

## How to run
- `/ship bypass` for T4, plan source = tasks.md. **Stop before step 11 (`/push`).** No `git push`, `/merge`, `/sync`, `db:deploy`. No schema change. Commit message: tasks.md T4 `[C]` line (ship's test-first commit #0 is fine).
- Gate: `pnpm gate --base dev`, read only its last line. Never pipe it through grep/head.
- Runtime checks: per `/ship` 6.2, everything deterministic (Action ordering, stale responses, StrictMode, shell switch race, write failure) must be a scenario test. The handoff's runtime list keeps only (b) items, each with a reason. tasks T5/T6 are run later by a QA worker — list what they must look at.

## Handoff
Write `.scratch/handoff-c.md`: commit SHAs, exact gate last line, changed files, differences from plan (each with reason), proposed canon doc edits (per document), guide impact, runtime (b) list. Then send `worker_done` once per your preamble and idle.

## Carried from batch A review (`.scratch/inbox-page/review-a.md` in the main checkout)
- `clampSeenAt` requires an exact `toISOString()` round-trip — `MarkSeen` must pass `now.toISOString()` (a `Date` silently becomes `invalid`). Assert the string form in the page/MarkSeen tests.
- Optional: lower-bound assertion in `lib/inbox/__tests__/inbox.integration.ts:142`.
