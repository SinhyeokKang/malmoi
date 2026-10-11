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

