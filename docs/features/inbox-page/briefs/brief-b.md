# Brief B — inbox-page T3

Plan sources (read all first): `docs/features/inbox-page/{spec,design,tasks,orch}.md`. Your item: **T3** exactly as tasks.md lists it, design D3 and the `/tdd` table row for `attentionRowSlots` · Home caller.

## Ownership
- You may edit: new `components/inbox/row-slots.tsx`, `components/shell/attention-inbox.tsx` (replace row slot construction with the shared fragment ONLY — keep `itemKey`, keep local unread state as is; store wiring is T4), `components/home/attention-card.tsx`, new `components/__tests__/inbox-row-slots.test.tsx`, a new Home caller regression test, and `components/__tests__/client-graph.test.ts` only if the new import graph strictly requires it.
- Existing `attention-inbox.test.tsx` and `home-*.test.tsx` must pass **unmodified**.
- Do NOT touch (batch A owns, running in parallel): `lib/inbox/**`, `app/inbox/**`, `app/__tests__/entry-points.test.ts`.
- Do NOT add (T4 owns): routes, nav, dictionary keys, `/inbox` page, sidebar.
- Recall POSTMORTEM 2026-09-20 · 09-24 (row remount loses roving focus) — keep row keys stable.

## How to run
- Setup in this worktree: `pnpm install && pnpm db:generate`. Never copy `.env.local`.
- Run `/ship bypass` for T3, plan source = tasks.md. Temp worktree branch = dev equivalent. **Stop before step 11 (`/push`).** No `git push`, `/merge`, `/sync`, `db:deploy`. No schema change.
- Commit message as tasks.md `[C]` line (ship's test-first commit #0 is fine). Canon docs are NOT yours — propose edits in the handoff.
- Gate: `pnpm gate --base dev`, read only its last line. Never pipe it through grep/head. Another worker may run a gate concurrently; if the only failure is a single test timeout, rerun once.
- Runtime checks: per `/ship` 6.2, anything deterministic becomes a test; leave only (b) items in the handoff, each with a one-line reason.

## Handoff
Write `.scratch/handoff-b.md`: commit SHAs, exact gate last line, changed files, differences from plan, proposed canon doc edits, runtime (b) list. Then send `worker_done` once per your preamble and idle.
