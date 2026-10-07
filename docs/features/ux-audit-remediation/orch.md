# UX audit remediation orchestration

## Scope and source

- Source: `/Users/sinhyeok/code/malmoi/.scratch/ux-audit-2026-10-08/REPORT.md` and its seven dimension inventories. Original findings remain untracked.
- User authorized `orch`: fix all seven findings with suitable workers, including review, integration, dev preview push and runtime QA. Production merge is excluded.
- Starting dev: `bea38f3cd4b72a67ce7027643dce9e4338d0d125`; clean tracked tree, one checkout, no other active worker.
- No schema, permission, data ownership, adapter, version, or dependency changes.

## Decision record

- D1 — Coordinator judgment: use the explicit UI locale for user-facing counts. Existing Spanish dictionaries and localized dates establish the convention; explicit locale preserves deterministic output. Fixed-English code/fixtures/technical contracts remain fixed.
- D2 — Coordinator judgment: response lost / result unconfirmed is warning across mutations, including Publish. It is not a confirmed failure. Update the existing Publish documentation exception; retain recovery actions and safety semantics. Confirmed errors remain danger.
- D3 — Coordinator judgment: retain the shared muted ErrorState. Explicit ErrorState/EmptyState geometry takes precedence; document the exception in DESIGN §2.4.
- Models verified in this session's installed model catalog: gpt-6.1-sol and gpt-6-astra. Astra effort capped at medium.
- Workers use isolated child worktrees based on local dev: concurrent ship commits share a Git index, and pnpm gate writes generated/.next artifacts, so sharing a checkout would mix verification and commits. A/B remain serial because their actual source ownership overlaps.

## Batches and ownership

| Batch | Findings | Owned implementation | Model / effort | Dependencies | Release blocking | State |
|---|---|---|---|---|---|---|
| A | U1, U2 | Mutation-result tone consumers (account, settings, members, translations/workspace/workspace.tsx, publish-button.tsx), home/meta-column.tsx PR state, status canon, messages en/ko/es, associated tests | gpt-6-astra / medium — cross-surface result semantics and regression tests | None | Yes | Reviewed and integrated |
| B | U3 | All user-facing numeric consumers incl CountBadge, tree-panel, home counts/meta, workspace, locale panel as required; minimal numeric formatting helper and tests; dictionary numeric consistency | gpt-6.1-sol / high — broad but mechanical locale propagation | A integrated; C integrated before editing locale-panel | Yes | Reviewed and integrated |
| C | U4, U6 | Logs loading.tsx, translations/workspace/locale-panel.tsx skeleton only; loading-parity and targeted skeleton tests | gpt-6.1-sol / medium — constrained geometry fixes | None | Yes | Reviewed and integrated |
| D | U5, U7 | guide/es image alt/title (26), guide/en/ko/es/translate/edit.md scope prose, lib/guide/__tests__/locales.test.ts or targeted guide regression | gpt-6.1-sol / medium — translation and guide contracts | None | Yes | Reviewed, one wording correction, integrated |
| R | Independent review | Read-only batch diffs, evidence, test classification and document proposals | gpt-6-astra / medium | Completed committed implementation | Yes | All four PASS |
| Q | Runtime QA | Read-only browser verification on main checkout; evidence and BugShot issues only | gpt-6.1-sol / high | All batches integrated + gate | Yes for observed regressions | Planned |

## Overlap and ordering

A/C/D form the first wave with disjoint source and test ownership. A and B overlap home/meta-column.tsx, workspace.tsx, dictionaries and potentially related tests. C and B can overlap locale-panel.tsx. Start B only after A and C integration. D owns guide originals and guide tests exclusively. All repository documentation (DESIGN, ARCHITECTURE, DIRECTORY, POSTMORTEM, this plan) belongs to the coordinator; workers provide exact documentation proposals in handoffs and never edit those shared files. No other batch may edit a listed owner file without coordination.

Full test suites and final gates run serially: C → A → D → B. Concurrent first-wave suites timed out in api-contract source scans at the existing 5000ms limit; C's earlier full suite passed. Preserve initial failures and rerun unchanged in isolation before deciding whether contention explains them. No timeout or assertion changes are authorized to make this pass.

## Acceptance gates

1. Each worker reads repository rules and source-command-ship, follows ship bypass up to but not including step 11. Branch is dev-equivalent. Tests first with observed red, then implementation, full test/typecheck, self review; final worker gate is `pnpm gate --base dev` without output filtering. No .env.local copy, push, merge, sync, production deploy or schema edits.
2. Handoff `.scratch/handoff-<batch>.md`: commits, red/green evidence, exact gate result, ownership changes, documentation proposals, unresolved work, only runtime-only checks with reasons. Send the live dispatch worker_done exactly once.
3. Independent review checks every batch and audit item, test claims, known POSTMORTEM and deterministic-versus-runtime classification. Fixes route back to owner. No unresolved red/yellow regressions.
4. Coordinator cherry-picks clean branches, updates docs in per-document commits, runs `pnpm gate`, `pnpm guide:check`, mirror check, pushes only dev and waits for exact-head CI.
5. Runtime QA serially verifies changes and layout at 1280/1440/1890, light/dark and relevant locales. QA never overlaps cherry-pick/build/dev-server state mutation. Deterministic counts/tones/conditions belong in tests; computed layout and real interactions remain runtime.
6. Copy handoffs before cleanup. Release settled workers; remove worktrees only with clean tracked changes and `git cherry dev <branch>` showing no plus entries. Record remaining manual checks honestly.

## Evidence and progress

- All seven findings implemented, independently reviewed and integrated; coordinator final gate and runtime QA remain.
- [x] A implemented, independently reviewed, integrated
- [x] C implemented, independently reviewed, integrated
- [x] D implemented, independently reviewed, integrated
- [x] B implemented, independently reviewed, integrated
- [ ] Documentation freshness and final gate
- [ ] dev push and exact-head CI
- [ ] Runtime QA and corrections
- [ ] Resource cleanup and final report

### Orca first wave

- Run `run_db9bcfb9acba`; coordinator `term_8c00dc42-7f12-487e-9203-62237cec01c9`.
- A task `task_bd26fa0dad25`, dispatch `ctx_da9fa15818e8`, branch `SinhyeokKang/ux-audit-state`.
- C task `task_830d41f6fe0a`, dispatch `ctx_789618a6dc82`, branch `SinhyeokKang/ux-audit-skeleton`.
- D task `task_3c9d89fb9ac2`, dispatch `ctx_095f5b042ab5`, branch `SinhyeokKang/ux-audit-guide`.
- B queued task `task_36497f830e44`; coordinator holds dispatch until A/C integration.
- Effective launches match planned models/efforts; first-wave turns observed.
- A scope clarification: include MemberList changeUnconfirmed, the same unknown-result danger branch; no new product behavior.
- C: red 4 → targeted green 10; isolated final gate green, 12,126 passed / 2 skipped. First concurrent gate timed out twice in source scans; unchanged isolated run passed. Independent Astra review `ctx_2709f2e9b42d` PASS (no red/yellow); raw targeted red/green logs unavailable, claims distinguished from inspected final gate log. Integrated `a6b0251f`, `73b59d70`. Handoff and gate logs copied to coordinator scratch. Both terminals released; clean fully integrated child removed. Browser geometry remains Q scope.
- A: isolated full suite 12,138 passed / 2 skipped; final gate green reported by worker, observed in live transcript. Independent Astra review `ctx_5b765fc10ccc` PASS; full-suite logs inspected, targeted/gate raw logs unavailable to reviewer. Coordinator final gate remains required. Integrated `6453da95`, `022c9e41`; handoff and full-suite logs copied, terminals released and clean integrated child removed. DESIGN D2/D3 and PR wording updated. A/C dependencies for B are fulfilled.
- D: final isolated gate green (12,129 passed / 2 skipped); independent review `ctx_ffb8efa6fc7c` in progress. Full-test slot is now free for B.
- D review completed PASS; minor D-R1 changed Spanish alt `Nuevas de GitHub` to actual `Nuevas desde GitHub`. Sol medium fix dispatch `ctx_ba1e7628eb9c`, commit `03cd94ae`, guide checks and full gate green with raw logs preserved. Coordinator inspected the one-line diff against the dictionary. Integrated `fe4cc8b4`, `c5ff7a40`, `d6127302`; handoff/logs copied, all D terminals and clean integrated child removed. AUTHORING verification description updated. Existing 7 stale screenshots remain warning-only, not D source changes.
- B dispatch `ctx_13e3540b83b0`, branch `SinhyeokKang/ux-audit-numbers`, effective Sol high verified. D-fix gate ended; B owns full-test slot. Independent review follows completion.
- B source commits are finalized (`8f0fb33d`, `58c33a26`, `b537039c`), full unit/DOM suite green (12,253 passed / 2 skipped). Final gate additionally triggers isolated PostgreSQL because of the new `lib/__tests__/` file. Read-only independent source review may overlap this unchanged committed gate run; gate completion remains mandatory before integration. Any subsequent code correction requires review again.
- B final gate: `gate: ok`, 12,253 unit/DOM tests passed / 2 skipped plus all 617 isolated PostgreSQL tests (37 files, 283.96s), build and mirror green. No timeout/skip changes. Independent Astra review `ctx_0c839c9e6255` PASS; coordinator inspected final raw gate completion after review. Integrated `62b2a38a`, `8bb44513`, `b9d5dab6`. Handoff/raw logs copied, implementation/review terminals released, clean fully integrated child removed.
- Documentation freshness: DESIGN now covers D1/D2/D3 and fixed skeleton slots; ARCHITECTURE and DIRECTORY describe the pure numeric leaf; guide AUTHORING describes image-description checks; POSTMORTEM records four drift patterns. No schema/migration changes. Final consolidated gate is next.
