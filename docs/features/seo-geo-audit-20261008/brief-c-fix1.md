# C review fixes

Read main checkout `.scratch/review-C.md` and original brief-c.md. Continue C ownership in `/Users/sinhyeokkang/orca/workspaces/malmoi/seo-c-llms` from a554fc19; only `lib/seo/llms.ts` and its tests may change. Current full gate already passed; do not repeat a baseline full suite.

Two reproduced allowed-Markdown defects must be fixed before integration:

1. A reference label containing escaped closing bracket plus colon (`[x][foo\]:bar]` and `[foo\]:bar]: setup/README.md`) must retain every label byte and replace only the actual definition destination. Find the unescaped label closing delimiter; do not use the first raw `]:`.
2. `[same]()` is a valid current-document link. Permit the zero-length destination at the correct source offset and insert the absolute current-document URL instead of throwing. Preserve angle-bracket empty destinations and title/whitespace behavior where parser-valid.

Write focused failing regression tests before implementation; cover escape parity and exact unchanged surrounding bytes. Keep AST-bounded edits, no new dependency or whole-document regex. Do not expand public API or rewrite unrelated code. Validate with focused RED/GREEN, then one final unfiltered `pnpm gate --base dev` (it supplies full tests/typecheck/build; do not duplicate those separately without a new failure). Record full output once using a method that preserves gate exit status. No rebase needed for coordinator-only docs changes; no push/merge/sync/schema/env copies or authoritative-doc edits.

Local explicit-path commits with Codex trailer; update `.scratch/handoff-C.md` with fix commit, RED/GREEN and exact gate outcome. Include the original review defects and remaining status. Check mail, send worker_done once for this Dispatch, then idle. Independent review will recheck the two failure inputs and nearby parsing boundary.
