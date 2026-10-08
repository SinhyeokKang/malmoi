# A review fixes

Continue batch A in `/Users/sinhyeokkang/orca/workspaces/malmoi/seo-a-content` from 4d9d2e67. Read the original brief-a.md and main checkout `.scratch/review-A.md`. Prior implementation terminal is settled and released; this Dispatch owns only this fix round.

Fix the new landing documentation nav accessible name using the existing localized `closing.links.label`, with a meaningful failing DOM test first. Fix `코드 사전는` to `코드 사전은` in guide/ko/reference/formats.md. No other changes. B waits for A integration before changing the shared landing test, so do not coordinate by copying B work.

Follow `/ship bypass`, temporary branch equals dev, stop before push. No schema/env changes, no push/merge/sync, no authoritative docs edits. Run focused RED/GREEN and `pnpm gate --base dev` without output filtering. Save exact full gate output to `.scratch/gate-A-fix1.log` if feasible so the next reviewer can validate the handoff claim without rerunning it.

Commit explicit owned paths with Codex trailer; update `.scratch/handoff-A.md` with this fix commit and gate result. Report any remaining defects rather than hiding them. Check coordinator mail, send current worker_done once with real report path, then idle.
