# Brief R — independent review (report only)

You review one batch of inbox-page. **Report only — no code edits, no commits, no builds of your own beyond reading/running tests.**
The batch id, worktree, branch, and handoff path are given in your task spec.

Read: `docs/features/inbox-page/{spec,design,tasks,orch}.md`, the batch handoff, and the diff `git log -p $(git merge-base dev <branch>)..<branch>` (run in the batch worktree).

Check:
1. Every tasks.md item of the batch is done with its listed verification; tests exist for each `/tdd` table row in scope and actually assert the behaviour (not tautologies, not mocks of the thing under test).
2. Handoff claims (gate result, unmodified tests, differences from plan) are true — verify with git, don't trust prose. You may run `pnpm vitest run <files>` for the batch's tests.
3. "Differences from plan": judge each one — accept with reason, or 🔴/🟡.
4. Runtime list classification (2026-09-30 rule): any (b) item measurable deterministically via entry point → isolated DB → view model, or via DOM test, is 🟡 "move to a scenario test". A scenario test that stops at DB rows without asserting the view-model/DOM output is also 🟡.
5. Project rules from CLAUDE.md: no `dark:`, no Korean UI literals, dictionary keys in en·ko·es together, `Object.hasOwn` for foreign keys, `import "server-only"` where appropriate, no `any`, comments Korean "why only", surgical scope (no adjacent refactors), primitives from `components/ui/` not hand assembly.
6. Relevant POSTMORTEM entries: grep `docs/POSTMORTEM.md` for the touched areas (inbox, attention, sidebar, roving focus, route hardcoding, layout auth, client-graph, store, StrictMode) and check the batch does not repeat them.
7. Batch-specific risks given in your task spec.

Output `.scratch/review-<batch>.md` in the batch worktree: findings ranked 🔴 (must fix before integration) / 🟡 (should fix) / ⚪ (note), each with file:line and a concrete failure scenario. Then `worker_done` once (summary = counts per severity).
