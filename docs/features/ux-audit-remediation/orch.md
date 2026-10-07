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
| A | U1, U2 | Mutation-result tone consumers (account, settings, members, translations/workspace/workspace.tsx, publish-button.tsx), home/meta-column.tsx PR state, status canon, messages en/ko/es, associated tests | gpt-6-astra / medium — cross-surface result semantics and regression tests | None | Yes | Planned |
| B | U3 | All user-facing numeric consumers incl CountBadge, tree-panel, home counts/meta, workspace, locale panel as required; minimal numeric formatting helper and tests; dictionary numeric consistency | gpt-6.1-sol / high — broad but mechanical locale propagation | A integrated; C integrated before editing locale-panel | Yes | Planned |
| C | U4, U6 | Logs loading.tsx, translations/workspace/locale-panel.tsx skeleton only; loading-parity and targeted skeleton tests | gpt-6.1-sol / medium — constrained geometry fixes | None | Yes | Planned |
| D | U5, U7 | guide/es image alt/title (26), guide/en/ko/es/translate/edit.md scope prose, lib/guide/__tests__/locales.test.ts or targeted guide regression | gpt-6.1-sol / medium — translation and guide contracts | None | Yes | Planned |
| R | Independent review | Read-only batch diffs, evidence, test classification and document proposals | gpt-6-astra / medium | Completed batch | Yes | Planned |
| Q | Runtime QA | Read-only browser verification on main checkout; evidence and BugShot issues only | gpt-6.1-sol / high | All batches integrated + gate | Yes for observed regressions | Planned |

## Overlap and ordering

A/C/D form the first wave with disjoint source and test ownership. A and B overlap home/meta-column.tsx, workspace.tsx, dictionaries and potentially related tests. C and B can overlap locale-panel.tsx. Start B only after A and C integration. D owns guide originals and guide tests exclusively. All repository documentation (DESIGN, ARCHITECTURE, DIRECTORY, POSTMORTEM, this plan) belongs to the coordinator; workers provide exact documentation proposals in handoffs and never edit those shared files. No other batch may edit a listed owner file without coordination.

## Acceptance gates

1. Each worker reads repository rules and source-command-ship, follows ship bypass up to but not including step 11. Branch is dev-equivalent. Tests first with observed red, then implementation, full test/typecheck, self review; final worker gate is `pnpm gate --base dev` without output filtering. No .env.local copy, push, merge, sync, production deploy or schema edits.
2. Handoff `.scratch/handoff-<batch>.md`: commits, red/green evidence, exact gate result, ownership changes, documentation proposals, unresolved work, only runtime-only checks with reasons. Send the live dispatch worker_done exactly once.
3. Independent review checks every batch and audit item, test claims, known POSTMORTEM and deterministic-versus-runtime classification. Fixes route back to owner. No unresolved red/yellow regressions.
4. Coordinator cherry-picks clean branches, updates docs in per-document commits, runs `pnpm gate`, `pnpm guide:check`, mirror check, pushes only dev and waits for exact-head CI.
5. Runtime QA serially verifies changes and layout at 1280/1440/1890, light/dark and relevant locales. QA never overlaps cherry-pick/build/dev-server state mutation. Deterministic counts/tones/conditions belong in tests; computed layout and real interactions remain runtime.
6. Copy handoffs before cleanup. Release settled workers; remove worktrees only with clean tracked changes and `git cherry dev <branch>` showing no plus entries. Record remaining manual checks honestly.

## Evidence and progress

- Intake complete; implementation not started.
- [ ] A implemented, independently reviewed, integrated
- [ ] C implemented, independently reviewed, integrated
- [ ] D implemented, independently reviewed, integrated
- [ ] B implemented, independently reviewed, integrated
- [ ] Documentation freshness and final gate
- [ ] dev push and exact-head CI
- [ ] Runtime QA and corrections
- [ ] Resource cleanup and final report
