# Audit remediation orchestration — 2026-10-07

## Scope and baseline

Source: [report.md](report.md), execution checklist: [tasks.md](tasks.md). Audit run: `run_4911271f3763`. Baseline dev: `bc8b204f18fa1aa88a0423e28f0789876f1fbf54` (origin/dev after user-authorized hard reset, no backup). Preserve audit reports as the pre-fix snapshot.

## Decisions

- User requested completed reports under this directory, regenerated orch, refactoring, and actual runtime regression testing.
- Coordinator decision: fix all 17 red/yellow findings; leave advisory 18/19. Regression tests decide whether each hypothesis is confirmed, corrected, or rejected with evidence.
- Scope follows refactor rather than ship: local code changes, targeted RED/GREEN, independent review, full test/typecheck, isolated PostgreSQL checks, actual local browser regression and relevant disposable-repository roundtrip. No production or push/build/code commits. Commit only this initial reviewable audit/plan before implementation as orchestrate requires.
- Coordinator writes plans/reports only; workers own code. Shared current worktree is safe only for disjoint ownership. No staging/reverting other workers' changes.
- No schema/public-contract change without concrete coordinator assessment. Preserve display semantics and single-writer/no-merge invariants.
- Runtime uses source-command-runtime-test and ego-browser. Local dev only, restore temporary dev state, no production writes. Observe failures rather than claiming static reasoning as runtime evidence. BugShot drafts for discovered regressions; submission follows the runtime skill's explicit submission gate. Fix/retest is already authorized and does not wait on issue submission.
- Models: Codex Astra medium for complex domain fixes and independent review; Codex Sol high for mechanical tooling/docs. Repository orchestrate specifies model selection; no cross-family delegation.

## Batches and ownership

| Batch | Findings | Owned paths | Predecessor | Model/effort | Gate | Status |
|---|---|---|---|---|---|---|
| A | 1,4,5 | pull except client/payload; push; sync; nightly; import/run; api/push; sync-edit-protection integration | none | Astra/medium | race regression + targeted tests | pending |
| B | 7–10 | scan; survey | none | Astra/medium | lexical/measurement regressions | pending |
| C | 16,17 | onboarding-run; import/read; onboarding.test | none | Astra/medium | error/budget regressions | pending |
| D | 3,11,12 | cli/push-response; gate-plan; keys/translation-list and tests | available slot | Sol/high | response/gate/Unicode regressions | pending |
| F | 2,6 | ts-dict; github; pull client/payload and related files | A | Astra/medium | shorthand/symlink no-write regressions | pending |
| R | all code changes | report only | A,B,C,D,F | Astra/medium | independent review; owner correction | pending |
| E | 13–15 + code documentation freshness | CLAUDE, commands/push, ARCHITECTURE,PRODUCT,ACTIONS,DIRECTORY,POSTMORTEM + mirrors | code and review | Sol/high | canonical/mirror checks | pending |
| V | all | verification only | fixes,E | Sol/high | full tests,typecheck,isolated PG,mirror | pending |
| Q | affected live flows + app smoke | local browser + dev fixtures only, report | V | Astra/medium | actual observed scenarios; retest any failures | pending |

## Overlap and scheduling

A/B/C first independent wave. D uses the first free slot. F follows A because pull files and tests overlap. B scan/survey and C onboarding are disjoint from A/D/F. D cannot edit A's sync-edit-protection integration test. E owns all canonical docs, after code stabilizes. R/V/Q are report-only and serial after code waves; runtime server starts after checks, no build or integration while browser QA runs. Any ownership expansion requires coordinator routing before writing.

## Completion evidence

Pending: per-batch handoffs, Task/Dispatch IDs, independent review findings, final automated/runtime results, and cleanup. A passed unit suite alone never closes runtime QA.
