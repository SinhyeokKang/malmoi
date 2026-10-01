# sync-lock — tasks

**순서**: 순수 판정 → 서버 거부 → MCP → 저장 거부 UI → Sync Dialog → 문서.
**게이트**: `[commit]`마다 `pnpm gate` green이어야 한다. 출력을 파이프로 거르지 않는다(POSTMORTEM 2026-09-30).

## S1 — `planWriteLock` + Revert 경로

- `lib/sync/plan.ts` 안에 `planWriteLock`을 둔다. 새 파일은 만들지 않고, 화면은 import하지 않는다(design §2).
- Revert의 lease 갈래를 `sync-running`(+`reopensBy`)으로 분리한다. Publish RUNNING 갈래는 `busy`로 남긴다.
  - `RevertBlockReason`에 갈래를 더한다.
  - `REVERT_BLOCKED`에 `satisfies`를 건다.

**테스트(순수)**
- lease 없음, 토큰 없음 + 시각 있음
- 활성
- 경계 정각(활성)
- `300_001ms`(만료) — `plan.test.ts:293` 관례
- `reopensBy` 올림: 초≠0이면 다음 분, 정각 `.000`이면 +1분

**검증 [자동]**
- `pnpm gate`
- `revert-key.integration.ts:116-133,208-214`(RUNNING·lease busy · 실행 시점 busy면 쓰기 0건)는 `vitest run lib/keys`에 들지 않는다. 그래서 gate의 postgres 스위트로 돈다. lease 갈래 기대값을 `sync-running`으로 갱신한다.
- "Publish RUNNING 중 Revert → `busy`" 짝은 유지한다.

## S2 — 저장 거부 (`applyKeySave` / `applyKeySaveBatch`)

- 잠금 안에서 lease를 읽어 거부한다(`sync-running`, 행 불변).
- 배치는 **`KeyBatchSaveResult` 최상위** 거부다. `KeyEntryResult`에서는 그 갈래를 뺀다.

**격리 postgres 행** (`test:projects:postgres` — `scripts/gate-plan.ts:28`의 `lib/keys/` 트리거)
1. lease 활성(100초 전) 중 단건·배치 저장 → 거부.
   - 불변 단언: Translation 값·`pendingEditToken`·`updatedBy`, TranslationBaseline, `ProjectEvent` 0건.
2. lease 만료(`Date.now()-301_000`, `repository-import.integration.ts:216` 관례) 뒤 저장 → 성공.
3. **잠금 경합 두 순서** — 순차 호출이 아니라 별도 PG 연결로 만든다.
   - (a) 저장 tx가 Project 잠금을 쥔 동안 `acquire`가 대기하다가 진행 → 결과 `reconfirm`
   - (b) `acquire`가 잠금을 쥔 동안 저장이 대기(대기 관측)하다가 진행 → 거부
   - 형: `tools.integration.ts`·`revert-key.integration.ts`의 잠금 대기 관측 형
4. CI 표면 표시만 있음(`TranslationSurface.lastImportStartedAt` 있음, Project 토큰 없음) → 저장 성공(C2 고정).
5. Publish RUNNING 중 저장 → 성공(현행 유지).
6. 야간 적재 lease(`runAutomationImport` 경로가 세운 lease) 중 저장 → 거부(C1). 행 하나면 된다(같은 `acquire`).

경계 정각은 순수 테스트에만 둔다 — 코어가 `new Date()`를 직접 쓴다.

**검증 [자동]**: `pnpm gate`

## S3 — MCP 거부 매핑 (C4)

- `ToolRejection`·`MESSAGE`(`satisfies`)·`result.test.ts`의 `EXPECTED_MESSAGE`에 `sync-running`을 등재한다.
- `toToolResult`에 `retryable: true` 갈래를 더한다.
- `set_translations`는 호출 전체 거부 + `detail { startedAt, reopensBy }`이고, 키별 결과는 없다.
- `revert_to_last_sent`의 lease 갈래도 `sync-running`이다.

**테스트**
- `write-tools.test.ts`에 배치 거부 행을 더한다.
- "lease 활성 → MCP 출력 `code: "sync-running"` · `retryable: true`"로 고정한다. 모르는 코드가 `unavailable`로 접히는 경로를 막는다.

**검증 [자동]**: `pnpm gate`

`[commit] feat(keys): refuse translation writes while a sync holds the project` (S1–S3 한 커밋. S2만 단독이면 화면이 `save-failed`, MCP가 `unavailable`로 접혀서다.)

## S4 — 번역 화면: 저장 거부 + 착지 배너

**저장 거부**
- 저장 거부는 Dialog로 낸다(design §4): 제목 "Syncing…", 본문은 `utcMinute` ‹reopensBy›, 초안은 유지한다.
- `workspace.tsx:418-424` 매핑과 `ALERTS`에 `sync-running`을 명시한다. `save-failed`로 떨어지지 않게 한다.

**착지 배너**
- 페이지가 서버에서 `planWriteLock`을 계산해 `{ startedAt, reopensBy } | null`만 넘긴다. 토큰은 넘기지 않는다.
- lease 활성이면 헤더 배너 "Syncing…"을 띄운다. **Save는 끄지 않는다.**
- lease 중 OWNER의 [Sync] 트리거는 `aria-disabled` + 사유.

**시나리오 테스트 [자동]**
- lease 행 → `loadProject`(`lib/keys/query.ts:75`) → 뷰 모델의 `lock`이 non-null이고 토큰이 없다.
- lease 없음 → null.
- PG 트리거 안이다(POSTMORTEM 2026-09-14 — typecheck는 select를 못 본다).

**DOM 테스트 [자동]** (`translation-workspace-lock.test.tsx:128` 형 확장 · `// @vitest-environment jsdom`)
- 거부 → Dialog. 일반 저장 실패 문장이 없다. 초안이 그대로다. 취소 기준이 어긋나지 않는다(POSTMORTEM 2026-09-12).
- 닫힘 포커스 두 경로: [Save] 클릭 → Save, 단축키 저장 → 그 입력. fixup observer를 쓴다(POSTMORTEM 2026-09-20).
- 착지 lease → 배너가 보이고 Save는 활성이다.
- 행 memo를 깨지 않는다 — lease prop이 `KeyRow`에 닿지 않는다.
- live region 수 테스트(`translations-screen.test.ts:108-112`)를 의도적으로 갱신한다.

**검증 [수동]**: 브라우저(ego-browser, 로컬)로 거부 Dialog 닫힘 포커스 두 경로를 본다 — jsdom만 참이었던 전례(POSTMORTEM 2026-09-24).

## S5 — Sync Dialog 진행 → 결과 (Home·번역 화면 공용)

- `DialogContent`에 `closeDisabled`를 더한다(`OnboardingModal`과 같은 이름·동작).
  - 소비자를 세는 명령: `grep -rln "import .*DialogContent" components app | grep -v __tests__ | grep -v ui/dialog`
- 확정 → (b) 절차 진행 → 결과 `SyncResult` 형 + [Close] `primary` → 닫힘 포커스 트리거.
- 70초 출구.
- 두 화면의 결과 띠·`SlowNotice`를 제거한다.
- `syncCommit.wait()`(malmoi#103)를 결과 콜백으로 옮긴다.

**DOM 테스트 [자동]**
- 확정 → 진행(확정 `aria-disabled`, 포커스 유지)
- Escape·바깥 클릭·X 무시
- 결과 갈래 표 각 행: 성공 · `remainingEdits` · `reconfirm` → [Try again]이 확인 단계로 · `already-running` · `unauthorized` [Sign in] · Action throw → `unconfirmed` + 닫기 복귀
- 70초 출구(fake timer)
- 닫힘 → 트리거 포커스
- pending mock은 테스트 끝에서 푼다(POSTMORTEM 2026-09-18). `userEvent` 파일 머리에는 `testTimeout: 20_000`을 둔다(POSTMORTEM 2026-09-13).

**고칠 기존 테스트**
- `sync-result.test.tsx`
- `a11y-reasons.test.tsx:116`
- `unmanaged-entries.test.tsx`
- `sync-button.test.tsx:175-277`
- `home-screen.test.ts:166`
- `home-actions.test.tsx:67-91`(#103 Publish 잠금)

**검증 [수동]**: 브라우저로 진행 → 결과 → 닫힘 포커스(Home·번역 화면 각각)를 본다.

`[commit] feat(sync): the sync dialog carries progress and result`

## S6 — 문서

- design §6 목록 전부를 고친다.
- `/privacy` 영향 없음을 확인한다 — 새 수집·전송처·쿠키가 없다.
- 커밋은 문서별 `docs(<DOC>): …`로 나눈다.

**검증 [자동]**: `pnpm gate`(미러 포함) · `pnpm guide:check`가 `sync-discard.webp`를 stale로 낸다.
**검증 [수동]**: `/guide-shots`로 재촬영한다.

## S7 — 기능 종료

- 결론을 정본(PRODUCT·ARCHITECTURE·DESIGN)으로 올린다.
- `docs/features/sync-lock/`을 삭제한다.

**검증 [자동]**: `grep -rn "features/sync-lock" docs CLAUDE.md .claude` 0건 · `pnpm gate` green.
