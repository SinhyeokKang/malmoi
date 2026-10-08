# Brief B fix1 — inbox-page T3 review findings

Review: `/Users/sinhyeok/orca/workspaces/malmoi/inbox-b/.scratch/review-b.md`. Same ownership/rules as brief-b.md (stop before `/push`, gate `pnpm gate --base dev` last line only, no pipes).

Fix, test-first where it adds a guard:
- **R1** — revert `components/__tests__/loading-parity.test.tsx` Logs block (≈132-133) to assert against `event-row.tsx` as before. Only the two Home guards were approved for retargeting.
- **R2** — Home attention row sub-line now renders in ListRow's `leading-normal` copy span (19.5px) while the Home skeleton (`app/(edit)/projects/[slug]/(home)/loading.tsx` ≈135) still uses `Skeleton size="xs"` without line height (17.33px). Align the **skeleton** to the real row (`lineHeight="normal"`, same as `DropdownMenuRowSkeleton`) — do not take Home rows off ListRow. Add a guard assertion (loading-parity or home-screen) that fails if the skeleton sub-line line height diverges from ListRow's copy span again. Include the EDITOR owner-guidance line if the skeleton models it.
- **Y1** — keep `text-pretty` on the Home title (intended unification); note it in the handoff's DESIGN proposal.
- **Y2** — carry the lost "why" into `row-slots.tsx` aside comment: time is muted (2026-09-30 user — matches Log row time; old gray-dim was 2.5:1).

Commit as `fix(inbox): keep Logs skeleton guard and align Home attention skeleton line height` (one commit). Append a "fix1" section to `.scratch/handoff-b.md` (SHA, gate last line). Then `worker_done` once and idle.
