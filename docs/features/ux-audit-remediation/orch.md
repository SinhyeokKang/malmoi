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
| Q | Runtime QA | Read-only browser verification on main checkout; evidence and BugShot issues only | gpt-6.1-sol / high | All batches integrated + gate | Yes for observed regressions | Initial pass complete; follow-up blocked on browser control |

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

- All seven findings implemented, independently reviewed, integrated, gated and pushed at 02ec5754. Initial runtime QA completed; the observed Logs follow-up and later landing request are integrated below, with browser recheck pending.
- [x] A implemented, independently reviewed, integrated
- [x] C implemented, independently reviewed, integrated
- [x] D implemented, independently reviewed, integrated
- [x] B implemented, independently reviewed, integrated
- [x] Original batch documentation freshness and final gate (02ec5754)
- [x] Original batch dev push and exact-head CI (02ec5754)
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
- Consolidated gate at `02ec5754`: 12,260 unit/DOM passed / 2 skipped; 617 isolated PostgreSQL passed; build/mirror green. Pushed dev `bea38f3c..02ec5754`; exact-head CI [37675992145](https://github.com/SinhyeokKang/malmoi/actions/runs/37675992145) succeeded. Guide stale warning now 13 images / 20 mappings.
- Q dispatch `ctx_32fe959fbc93` (Sol high) runs the main dev server; application source, cherry-picks and builds remain frozen during QA. Read-only runtime measurements found a pre-existing Logs header mismatch: at1280/es the real five filters plus search wrap while four skeleton rectangles do not, moving the first row45px. The original U4 horizontal slots measure112/172px correctly.
- C-fix1 is a bounded follow-up for this observed Logs surface, Sol high (responsive geometry across locales). Owned files: Logs loading, log-filters or minimal same-area shared structure, related DOM tests; coordinator keeps documentation ownership. A fresh isolated child may implement while Q continues; integration waits for Q cleanup, independent review and worker gate. BugShot issue number will be recorded when Q submits it; commits use Refs, not Closes. Only this orchestration tracking document changes in the main checkout during Q.

### User addition — landing action placement

- User explicitly requested Hero `GitHub → Get Started`, footer CTA `Docs → Get Started`; preserve destinations, external-link behavior, icons, variants and localization.
- E: Sol medium, isolated child from dev; owns `app/page.tsx` and existing landing assertions only. No overlap with C-fix1 Logs or its read-only review. Worker gate serial; no migration. Coordinator owns DESIGN/plan freshness.
- C-fix1 source37989242/fe99c1a7 completed worker gate (12,263 passed /2 skipped). Independent Astra medium review dispatchctx_ae45707e8f0f active. QA completed and cleaned server/cookies/preferences/generated files; #201 remains open pending fix verification. TaskSpace4 entered user control; resumption permission requested, no takeover or replacement space.

### Follow-up integration and remaining checks

- BugShot issue [#201](https://github.com/SinhyeokKang/malmoi/issues/201) remains open for browser verification. C-fix1 Sol high worker gate passed (12,263 tests /2 skipped); independent Astra medium review ctx_ae45707e8f0f PASS, red0/yellow0. Integrated4cb6f6d6 and247cfc10. DESIGN/POSTMORTEM updated. Raw evidence copied before clean fully integrated child removal; both terminals released.
- E Sol medium worker gate passed (12,260 tests /2 skipped); independent Astra medium review ctx_41f92bb1b848 PASS, red0/yellow0. Integrated0f6da477 andde446be1; DESIGN action placement updated. Existing B number-locale propagation preserved. Evidence copied, terminals released and clean fully integrated child removed.
- Q runtime evidence: .scratch/ux-audit-2026-10-08/runtime-QA.md. Existing es Home/Logs/detail matrix at1280/1440/1890 in both themes, representative guide/landing/single-source search observed. Original copy skeleton radius8 and Logs112/172 slots measured correctly. Server stopped, account preferences/cookies/data and generated next-env restored; tracked tree clean.
- Browser boundary: TaskSpace4 explicitly reported user takeover; no retry, replacement space or takeover attempted. Coordinator asked permission to resume and has no answer yet. Logs fix matrix and E layout/navigation therefore remain unverified, as do >=10000 real counts, PR-check failure paint and actual screen-reader speech. Original guide screenshot stale warning13 images/20 mappings remains outside image-recapture scope.
- Source/doc snapshot is ready for coordinator pnpm gate and dev push; final exact-head gate/CI evidence belongs to the completion report. No migration, production deployment or remaining worker/worktree; retained TaskSpace4 is user-controlled. Runtime completion remains unchecked until control is returned and #201 is remeasured.

### CI follow-up F — sync-lock dialog readiness

- Coordinator final gate at3f6c611c passed12,263/2 skipped, build/mirror; dev push02ec5754..3f6c611c succeeded. Exact-head CI37680629621 failed one existing translation-workspace-sync-lock test atline75: user-event sees pointer-events:none on OK. Other12,262 passed/2 skipped. Raw failed CI output retained in coordinator scratch. No further push before diagnosis/fix.
- F assigned to Codex Astra medium (A-owned workspace semantics and modal timing). Fresh isolated child from dev; owns failing sync-lock test and minimal directly implicated helpers/app source only with causal evidence. No timeout increases, pointer-check bypass, skips or blind rerun-as-fix. Independent review follows. Browser remains user-controlled and unavailable; deterministic CI reproduction is independent.

- F completed: worker ctx_01686a46296e and independent review ctx_7d374e63360e (both Astra medium). Controlled actual Radix layer notification reproduced native pointer failure; new regression was red while original seven stayed green. Fixed waits require explicit and computed pointer readiness, no pointer-check bypass/timeouts/app changes. Exact historical CI interleaving remains uninstrumented. Worker gate12,264 passed/2 skipped, exit0; reviewer directly reran targeted8 green, red0/yellow0. Integrated83f246db and89c51ea0; POSTMORTEM updated. Handoff/raw logs preserved; clean fully integrated child and both terminals released. Final coordinator gate and new exact-head CI remain required before reporting success; browser control boundary remains unchanged.

### Runtime resume authorized

- User clarified they never took browser control and explicitly requested resumption. Current browser space4 ownership was agentDelegatedToUser, not proof of a user action. Coordinator corrected the prior attribution and takeOverTaskSpace(4) successfully restored ownership agent. No new space created.
- Q2: Sol high, current checkout, same space4, source application24b60489 (CI37683042898 succeeded). Recheck #201 en/ko/es default filters at1280/1440/1890 light/dark and requested landing Hero/CTA links. Restore data/preferences/cookies, stop server and clean generated files; close #201 only after real observed pass. Coordinator freezes source/build during Q2.

- Q2 observed all18 Logs combinations: filter/header/content baseline deltas0, original#201 fixed. Separate new title-decoration defect: es1280 dark title wrapper x273 width81.984375, bar x354.984375 width64, outside reserved title origin. Actual Skeleton size wrapper stays in flex flow while absolute applies only to inner bar. Q2 files BugShot and continues landing; keep same space agent-owned for known recheck, no handOff/finish until goal verification is done.
- C-fix2: Sol medium, isolated child from dev, owns Logs loading title positioning and directly relevant existing test only; no shared Skeleton/API/row/filter changes. Independent Astra medium review, worker gate, coordinator integration after Q2 server cleanup, then same-space title recheck.

- Q2 completed: Logs18 and landing18 combinations plus actual navigation/focus passed; #201 closed with measured verification. New BugShot #202 independently routed. Preferences/cookies/data and generated files restored, owned server stopped, tracked tree clean, space4 remains agent-owned for recheck. Q2 terminal released.
- C-fix2 source8f9a8e39 integrated ase08d9bb8: title decoration left inset only. Existing13 targeted and worker gate12,264 passed/2 skipped; independent Astra medium reviewctx_8504ac745529 red0/yellow0. Review and implementation terminals released. Coordinator gate then Q3 same-space title-origin verification remain.
