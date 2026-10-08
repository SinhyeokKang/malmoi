# Brief A — inbox-page T1 → T2

Plan sources (read all first): `docs/features/inbox-page/{spec,design,tasks,orch}.md`. Your items: **T1 then T2** exactly as tasks.md lists them, design D1·D2 and the `/tdd` table rows for `clampSeenAt`, `unread-store.ts`, `useInboxUnread`, `markAttentionSeenAction`.

## Ownership
- You may edit: `lib/inbox/plan.ts`, new `lib/inbox/unread-store.ts`, `lib/inbox/__tests__/{plan.test.ts,unread-store.test.ts,unread-store-hook.test.tsx}`, `app/inbox/actions.ts`, `app/inbox/__tests__/actions.test.ts`, `app/__tests__/entry-points.test.ts` (only the `USER_SCOPED_ACTIONS` entry).
- Do NOT touch (batch B owns, running in parallel): `components/inbox/**`, `components/shell/attention-inbox.tsx`, `components/home/attention-card.tsx`, `components/__tests__/**`.
- Do NOT add (T4 owns): `routes.inbox()`, `navWorkItems`, dictionary keys, `client-graph.test.ts` allowlist entry, any page under `app/(edit)/inbox/`.

## How to run
- Setup in this worktree: `pnpm install && pnpm db:generate`. Never copy `.env.local`.
- Run `/ship bypass` once per task (T1, then T2), plan source = tasks.md. Temp worktree branch = dev equivalent. **Stop before step 11 (`/push`).** No `git push`, `/merge`, `/sync`, `db:deploy`. No schema change.
- Commit boundaries/messages as tasks.md `[C]` lines (ship's test-first commit #0 is fine). Canon docs (PRODUCT/ARCHITECTURE/DESIGN/DIRECTORY/CLAUDE.md) are NOT yours — put exact proposed edits in the handoff instead.
- Gate: `pnpm gate --base dev`, read only its last line (`gate: ok` / `gate: FAILED at <step>`). Never pipe it through grep/head. Another worker may run a gate concurrently; if the only failure is a single test timeout, rerun once.
- Runtime checks: per `/ship` 6.2, anything deterministic becomes a test; leave only (b) items in the handoff, each with a one-line reason.

## Handoff
Write `.scratch/handoff-a.md`: commit SHAs, exact gate last line, changed files, differences from plan, proposed canon doc edits, runtime (b) list. Then send `worker_done` once per your preamble and idle. Note: the same terminal will later get batch C (T4) as a new Dispatch — do not start T4 on your own.
