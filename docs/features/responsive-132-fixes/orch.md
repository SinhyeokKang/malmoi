# Responsive 1.3.2 fixes orchestration

## Scope and baseline

User requested `/orchestrate` for all seven audit findings, with regression care.
Source: [tasks.md](./tasks.md). Start dev: `8bd4983ccaf81b5c2538791c301deadf69182e35`.
Coordinator owns briefs, reviews, integration, documentation and remote writes. Workers own implementation. End at dev; production remains a separate `/merge`.

## Decisions

- Coordinator decision: follow current PRODUCT/ARCHITECTURE/DESIGN contracts; #7 corrects a stale document, not behavior.
- Coordinator decision: three isolated child worktrees based on local dev. Concurrent ship commits and gate build artifacts conflict in one checkout even though production source ownership is disjoint.
- Codex only (Sol/Astra). Inherit the configured Codex model/effort; record launch-effective evidence. Astra effort must not exceed medium; if effective settings violate that boundary, stop before implementation and ask the coordinator.
- No schema, dependency, env, API, authorization or production changes. No message keys expected; escalate actual need before touching dictionaries.
- Runtime verification remains one worker on main checkout; do not integrate/build while QA owns its dev server.

## Batches and ownership

| Batch | Items | Owned source / tests | Dependencies | Gate | State |
|---|---|---|---|---|---|
| A | #1 | translations/workspace/workspace.tsx; compact-pane helper only if needed; translation-workspace compact tests | none | TDD scenario then pnpm gate --base dev | dispatched |
| B | #2 #3 #4 | shell/sidebar.tsx, shell/shell-panels.tsx, narrow-handoff only if needed; logs/event-row.tsx and row-layout; home loading; focused tests | none | TDD behavior/CSS contracts then pnpm gate --base dev | dispatched |
| C | #5 #6 | public-doc-toc.tsx; TOC tests, pure TOC helper only if necessary | none | TDD geometry/focus scenarios then pnpm gate --base dev | dispatched |
| D | #7 and final freshness | PRODUCT; DESIGN/ARCHITECTURE/DIRECTORY as required; POSTMORTEM after implementation | implementation conclusions | doc-specific commits + integrated gate | planned |
| R | independent review A/B/C | report only | each implementation | inspect commits, claims and regression gaps | planned |
| Q | runtime regression | no product-code edits; main checkout only | all integrated and gate complete | ego-browser actual geometry/focus, single worker | planned |

Source intersections A∩B, A∩C, B∩C: none. Shared docs are coordinator-owned. Dictionaries, package/lockfiles and UI primitives are excluded unless explicitly reassigned. Review fixes reuse owner with a new Dispatch; no waiting inside worker tasks.

## Validation scheduling change

- A/B/C parallel full suites produced API contract scanner 5-second timeouts under shared machine load. Test limits/config remain unchanged. Workers finish current runs and report failures honestly; C fixes its own test typing error with focused verification. Full branch gates will run sequentially after worker settlement, before integration. This is scheduling only, not a gate waiver.

## Acceptance and regressions

- No remount/draft loss, no extra server calls, no URL/history changes for local panes.
- Hidden focus fixup must be exercised; merely retaining jsdom activeElement is insufficient.
- Geometry assertions must model TOC before article with changing offsets; fixed heading fixtures cannot prove #5.
- CSS conditions must preserve 1280/1440/1890 desktop layout; narrow checks include 375, 768 and boundaries (lg and reading 960), en/ko/es, light/dark, legal 200-character names and warning-bearing logs.
- Preserve intentional iOS keyboard limitation; do not reopen known unrelated CSP/loading defect.
- Workers provide RED evidence, GREEN evidence, exact gate outcome, commits, changed files, deferred items and only genuinely browser-dependent runtime checks in `.scratch/handoff-<batch>.md`.

## Execution evidence

- Run: `run_fb68836a43f9`.
- A Task `task_15b451b33a95`, Dispatch `ctx_096747b61a28`, branch `SinhyeokKang/responsive-132-a`.
- B Task `task_1f81624ba6c9`, Dispatch `ctx_1b700a48a7ed`, branch `SinhyeokKang/responsive-132-b`.
- C Task `task_2b9d22cf29b0`, Dispatch `ctx_e3764da9f819`, branch `SinhyeokKang/responsive-132-c`.
- All launch receipts: ready/input_accepted, turnStart observed. Codex default inherited; projections A/C confirm gpt-6-astra, managed CODEX_HOME config confirms gpt-6-astra / medium with no launch override; workers notified.
- D/#7: PRODUCT correction committed `59603c0c`; validation included in final gate.
- Remote dev fetched before implementation: baseline unchanged, no concurrent remote commits.


## Review round 1

- Frozen A `9e4c3336`, B `787ea5ae`, C `a003c9d4`; independent reviewer Dispatch `ctx_fb9b57822eef`, Task `task_c2f88418ce01`, verified gpt-6-astra / medium. Report `.scratch/review-responsive-132.md`.
- Reviewer found pending same-key external navigation misclassified by A ownSelection. Route to A fix1 with behavioral RED, preserving original late-response case.
- Original implementation workers settled and released. Their failed outcomes record full-suite timeouts; B additionally had a missing Revert button failure requiring sequential recheck. No validation failure was waived.

- A fix1 Dispatch `ctx_2f6d23d79d31`, Task `task_903cd67a4432`, verified gpt-6-astra. Coordinator approved extending A ownership to `components/translations/workspace/use-leave-guard.ts` and directly relevant tests: the existing approved-navigation boundary must distinguish external intent from delayed local response. Dirty cancellation and modifier/history behavior remain guarded. B/C source intersections remain empty.
- Frozen A original gate `9e4c3336`: sequential `pnpm gate --base dev` exit 0, `gate: ok`; fix1 will need fresh validation. B sequential gate now running.

- Independent review round 1: P2 A only; B/C/PRODUCT zero additional findings. Report archived in root `.scratch/review-responsive-132.md`. Reviewer released.
- B `787ea5ae` sequential gate exit 0: 819 passed / 1 skipped files, 13,491 passed / 2 skipped tests, build and mirror passed. The earlier Revert failure did not recur. Integrated as `cc4d1fce` + `c7a3f3fc`. Evidence copied to root `.scratch/responsive-132-B/`; B has no pending issues/tasks and can be collected after clean/cherry checks.
- A/C original transcript archives copied to root `.scratch/transcript-{A,C}-initial.json`; Orca labels these bounded/clipped, so do not claim complete independent RED log verification.

## Added batch M

- User explicitly requested one additional worker for mobile landing mockup chrome (toolbar and left dots removed; equal bezel thickness; desktop/tablet unchanged).
- Coordinator interpretation: existing M (<640), outer 393x776 canvas retained, top inset 8 like other sides, more inner screen height. No new product mechanism.
- Ownership M: `components/landing/stage.tsx`, related landing tests, `lib/landing/stage.ts` only if needed. A/B/C intersections empty; shared docs coordinator. Isolated child from current dev, inherited verified Codex Astra medium. Focused TDD first; full gate serialized. Add M scenarios to the single final QA.

- C sequential gate exit 0: 820 passed / 1 skipped files, 13,488 passed / 2 skipped tests, build/mirror passed. Integrated all three commits; evidence copied to root `.scratch/responsive-132-C/`. C has no pending tasks/issues.
- M Task `task_e4bbe6f71fb2`, Dispatch `ctx_02b5363c8efc`, branch `SinhyeokKang/responsive-132-mobile`: launch ready/input_accepted, projection working, gpt-6-astra inherited medium.

- A fix1 `6c7e8985`: independent followup review `ctx_f3262b6a4c6b` zero findings, reviewer released. New sequential full gate exit 0, build/mirror passed. Integrated original two commits and fix1 two commits; preserved logs/handoffs in root `.scratch/responsive-132-A/`. No pending A issues/tasks.
