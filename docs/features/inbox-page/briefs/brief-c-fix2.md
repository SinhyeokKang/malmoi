# Brief C fix2 — issue #204 (skeleton first-row 1px)

First: `git status` clean → `git rebase dev` (dev now has your C commits + canon docs; your branch should become equal to dev).

Issue: https://github.com/SinhyeokKang/malmoi/issues/204 (read it with `gh issue view 204`). The `/inbox` skeleton (`app/(edit)/inbox/loading.tsx`) and the Home "Needs your attention" skeleton (`app/(edit)/projects/[slug]/(home)/loading.tsx`) put the header divider on the first row's top border; the real `Card` puts it on the header's `border-b` inside `min-h-12` and the first real row drops its top border. Skeleton first row 72 vs real 71 → 1px jump.

Fix both skeletons so the divider sits where `Card` puts it (header bottom border, first row without top border). Test-first: add a guard (e.g. in `loading-parity.test.tsx` or a sibling) that fails on the current skeleton markup — assert the skeleton header carries the same divider classes as `Card`'s header and the first skeleton row carries no top border, for both skeletons. Check whether other card skeletons copied the same pattern (grep the `(edit)` loading files) — fix only these two, list any others in the handoff.

Rules as in brief-c.md (stop before `/push`, `pnpm gate --base dev` last line only, no pipes). One commit: `fix(inbox): put skeleton card divider on the header like Card` with `Refs #204` (not Closes). Append a "fix2" section to `.scratch/handoff-c.md`. Then `worker_done` once and idle.
