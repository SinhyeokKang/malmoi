# sync-lock — design

## 1. 영향 받는 흐름

편집 UI(번역 화면 저장·Revert, Home·번역 화면 Sync Dialog)와 MCP 쓰기 도구(`set_translations`·`revert_to_last_sent`)가 영향을 받는다.
push(`/api/push`)·pull(Publish)·export는 판정만 공유하고 동작은 바뀌지 않는다(§7 C2). Publish·export는 lease를 읽지 않으므로 결정성에도 영향이 없다.

## 2. 순수 함수 — `/tdd` 진입점

- **`planWriteLock({ now, repositoryImportToken, repositoryImportStartedAt })`** → `null | { reason: "sync-running"; startedAt; reopensBy }`
  - **`lib/sync/plan.ts` 안에 둔다** — 새 파일을 만들지 않는다.
    - ⚠️ 그 파일은 잎 모듈이 **아니다**: `plan.ts:1` → `lib/failure.ts:3` → `node:crypto`로 이어진다. 그래서 **화면은 이 판정을 import하지 않는다.**
    - 페이지(서버)가 판정해 `{ startedAt, reopensBy } | null`만 prop으로 넘긴다. `repositoryImportToken`(실행권 토큰)은 클라이언트로 가지 않는다.
    - `lib/import/plan.ts`에 두지 않는 이유: 그쪽은 ts-morph를 물고, 의존 방향 경고도 있다(`lib/sync/plan.ts:37`).
  - lease 술어는 `isRunActive`(`lib/sync/plan.ts:39` — 경계 정각은 활성) 하나다.
  - `reopensBy`는 **표시용 시각**이다. `startedAt + STALE_AFTER_SECONDS`를 **다음 분으로 올린다**(초·ms가 0이 아니면 다음 분, 정각 `.000`이면 그대로 +1분).
    - 이유: `isRunActive`가 `<=`라 정각에도 아직 활성이다. 그리고 `utcMinute`은 초를 버린다(`lib/utc-time.ts:21`). 둘이 겹치면 표시가 실제보다 최대 59초 이르다.
    - 올림을 판정 함수 안에서 하므로 화면·MCP·Revert가 같은 값을 받는다.
- **Revert.** 지금은 `busy: running > 0 || (token != null && hasActiveImport(...))`다(`lib/keys/revert.ts:78`). 이것을 둘로 가른다.
  - lease 갈래: `planWriteLock(...) !== null` → 새 차단 사유 `sync-running`(+`reopensBy`).
  - Publish RUNNING 갈래: `running > 0` → `busy` 그대로.
  - 바뀌는 것은 술어의 사본을 지우는 것이 아니라 **경로**다. lease 판정의 입구가 `hasActiveImport`에서 `planWriteLock`으로 옮긴다.
  - `REVERT_BLOCKED`(`lib/mcp/tools/translations.ts:54`)에 `satisfies Record<RevertBlockReason, …>`를 건다.
- **저장 거부 판정.** `applyKeySave`/`applyKeySaveBatch`가 `lockProjectAccess` 직후, 같은 트랜잭션에서 `tx.project.findUnique({ where: { id: projectId }, select: { repositoryImportToken, repositoryImportStartedAt } })`로 lease를 읽어 `planWriteLock`에 넘긴다.
  - `lockProjectAccess`의 select(`lib/auth/lock.ts:43`)는 넓히지 않는다 — 공유 계약이기 때문이다. 키 수와 무관한 상수 왕복 하나다.
  - **잠금 안에서 읽는다.** 적재의 `acquire`(`lib/import/run.ts:68` 잠금 · `:125` lease 기록)가 같은 `Project FOR UPDATE` 안에서 lease를 세운다. 그래서 둘은 직렬이다.
    - 저장이 먼저 커밋되면, 적재 쪽 READ COMMITTED 재읽기가 지문 재확인(USER는 `reconfirm`, AUTOMATION은 `deferred`)으로 잡는다.
    - 적재가 먼저면, 저장이 거부된다.
    - 창이 없다. 잠금 순서는 전 경로가 Project → Surface라 교착도 없다.
  - **수동 Sync·야간 적재는 `applyPushInTransaction`을 지나므로 자기 lease에 막히지 않는다.**
  - **판정에 넣지 않는 것**: `TranslationSurface.lastImportStartedAt`(CI·첫 적재의 표면 표시). 넣으면 CI(C2)와 첫 적재(C5)까지 막는다. 그래서 `hasLiveInternalImport`(`lib/import/plan.ts:32-36`)를 쓰지 않는다.
- **결과 타입.**
  - 단건: `KeySaveResult`에 `{ ok: false; error: "sync-running"; startedAt; reopensBy }`를 더한다.
  - 배치: `KeyBatchSaveResult`(`lib/keys/save-key.ts:48-50`)의 **배치 단위 `ok:false`**에 같은 갈래를 더한다.
  - `KeyEntryResult`(`:33`)에서는 이 갈래를 **뺀다**. lease는 배치 전체의 판정이라 키별 거부가 되면 안 된다(C4).
  - 초안은 클라이언트가 들고 있으므로 거부가 초안을 지우지 않는다.
- **조용한 접힘 방지.** 새 코드는 지금 다른 오류로 조용히 접힐 수 있는 자리가 넷이다. 넷 모두에 명시적으로 등재한다.
  - `lib/keys/save-translation.ts:17`의 `error: string` 갈래 때문에 컴파일이 통과한다.
  - 화면 3항 연쇄(`workspace.tsx:418-424`)가 마지막에 `save-failed`로 떨어진다.
  - MCP `rejectionMessage`는 모르는 코드를 `unavailable`로 접는다(`lib/mcp/result.ts:89-91`).
  - `REVERT_BLOCKED`가 `Record<string,string>`이다.
  - 등재 자리: 화면 분기 + `ALERTS` 표, MCP `ToolRejection`·`MESSAGE`(`satisfies`)·`result.test.ts`의 `EXPECTED_MESSAGE`.
  - MCP 결과는 `retryable: true`와 `detail { startedAt, reopensBy }`를 싣는다. 지금 `retryable`은 `unavailable` 전용이므로 `toToolResult`에 `sync-running` 갈래를 더한다.

## 3. 스키마 · 환경변수 · 불변식

- **스키마 변경 없음** — lease는 기존 `Project.repositoryImportToken`·`repositoryImportStartedAt`(`prisma/schema.prisma:42-43`)다.
- **새 환경변수 없음.**
- **불변식 2(병합 없음)** — 잠금은 쓰기를 거부할 뿐 값을 고르지 않는다. `pendingEditToken`·보류 게이트를 건드리지 않는다. 거부된 저장은 아무것도 쓰지 않으므로 `ProjectEvent`도 없다.
- **불변식 9(부분 결과를 성공으로 접지 않는다)** — Dialog 결과는 지금 `sync-result.tsx`의 형을 그대로 옮긴다.
- **잠금 뒤 인가 재확인**(POSTMORTEM 2026-09-23)은 저장 경로가 이미 `lockProjectAccess`로 든다.
- 적재 lease 획득은 OWNER 전용·기존 `acquire` 그대로다. 새 잠금 표를 만들지 않는다.
- 시계: lease 기록과 판정 모두 앱 `new Date()`다. 기존과 일관되므로 DB `now()`로 바꾸지 않는다.

## 4. 화면

| 자리 | 형 | 근거 |
|---|---|---|
| Sync Dialog(Home·번역 화면 공용 `SyncButton`) — **진행** | 확정해도 Dialog가 닫히지 않는다. DESIGN §6.4 Dialog 행의 **(b) 절차**를 따른다: 확정 버튼 `loading`(라벨 그대로, `aria-disabled`라 포커스 유지) · Cancel 끔 · 8초 뒤 `SlowNotice`는 Dialog 안. 닫기는 **`closeDisabled`**로 막는다. 이 옵션은 `OnboardingModal`(`components/ui/modal.tsx:46,143,206`)과 같은 이름·같은 동작(X를 숨기지 않고 끈다 · Esc·배경 무시)으로 `DialogContent`에 올린다. 본문을 갈아끼우지 않으므로 누른 버튼이 언마운트되지 않는다 | S0 · POSTMORTEM 2026-09-20·24(포커스가 컨테이너·`body`로 빠짐) |
| Sync Dialog — **결과** | 본문이 `SyncResult` 형(한 줄·두 줄, live 규칙: danger면 `alert`, 그 밖은 `status`)으로 바뀌고 푸터는 [Close] **`primary`** 하나다(결과를 받고 닫는 자리 — §6.4 Modal 행 규칙). 포커스는 [Close]로 간다. 갈래는 아래 표 | C3 |
| Sync Dialog — **응답 없음 70초** | 진행 본문 아래 한 줄 "The result will be in Logs." + [Close] 복귀. 판정을 실패로 바꾸지 않는다 | R3 |
| Sync Dialog — **닫힌 뒤** | 포커스는 Sync 트리거로 간다. 트리거가 없거나 `aria-disabled`면 기존 `fallbackFocusRef`(번역 화면 `titleRef`)로 간다 | POSTMORTEM 2026-09-24 |
| 저장 거부(다른 편집자) | 440 Dialog. 제목 **"Syncing…"**, 본문 **"You can't save edits until the sync finishes — by ‹reopensBy› at the latest."**(‹reopensBy›는 `<time dateTime>` 안의 `utcMinute`), 버튼 [OK]. 초안을 유지한다. 닫히면 포커스는 **연 자리로** 간다 — [Save] 클릭이면 Save, 단축키 저장(`locale-panel.tsx:219-226`)이면 그 입력 | S0. 번역 화면의 저장 실패는 전부 푸터 위 인라인 `Alert`(`workspace.tsx:864-890`)인데 이것만 Dialog다 — **화면 밖 사건이 끼어드는 유일한 거부**라서다. DESIGN §7에 예외로 등재한다 |
| 번역 화면 착지 중 lease 활성 | 헤더 배너 스택(`workspace.tsx:696-707`)에 neutral 한 줄 **"Syncing…"**(+ ‹reopensBy›). **Save는 끄지 않는다.** 착지 Dialog는 없다 | R1 — 막는 것은 서버 거부다. 끄면 다시 켤 장치(폴링)가 없다 |
| lease 중 다른 OWNER의 [Sync] | 착지에서 lease를 읽었으면 트리거를 `aria-disabled` + 사유(머리 Sync의 기존 `paused`/`pausedReason` 형)로 둔다. 누르면 결과는 여전히 `already-running`이다 | 일관성 |

**결과 갈래** (지금 `SyncResult`가 드는 것을 그대로 Dialog로 옮긴다)

| 갈래 | Dialog 결과 |
|---|---|
| 성공 · 부분 · `remainingEdits` | 지금 문장·톤 그대로 |
| `reconfirm`(승인 뒤 새 편집) | 지금 문장. **[Try again]은 같은 Dialog를 확인 단계로 되돌리고**, 폐기 승인 지문을 다시 발급받는다 |
| `already-running` · `unavailable` · 실패 | 지금 문장. [Try again]은 위와 같다 |
| `unauthorized` | 지금 문장 + 새 탭 [Sign in](DESIGN §6.644) |
| `unconfirmed`(응답 확인 실패 · Action reject · 함수 60초 타임아웃 504) | 지금 문장. ⚠️ 이 갈래는 `router.refresh()`를 부른다(`sync-button.tsx:133-140`). MPA 폴백(5xx·세션 만료·배포 스큐)으로 전체 리로드되면 결과가 Dialog째 사라진다 — 그때의 기록은 Logs다 |

- ⚠️ **진행 Dialog의 종료 조건은 Action 응답(resolve·reject)과 70초 출구뿐이다.** lease가 아니다 — POSTMORTEM 2026-09-15(서버 표면 표시가 남아 진행이 300초 지속).
- ⚠️ `runRepositoryImport`를 transition으로 감싸지 않는 현행 규칙(`sync-button.tsx` 주석)을 유지한다. Publish 잠금(`syncCommit.wait()`, `actions.tsx:92` — malmoi#103)은 지금 `setOutcome`에 붙어 있다. 이것을 Dialog 결과 콜백으로 옮긴다.
- ⚠️ **잠금 표시를 행까지 내리지 않는다.** lease 상태가 `KeyRow` props나 `onSelect`에 닿으면 5,000행 `memo`가 한꺼번에 깨진다(POSTMORTEM 2026-10-01). 표시는 헤더 배너·저장 거부 Dialog에만 둔다.
- ⚠️ 번역 화면의 live region 수는 고정돼 있다(`components/__tests__/translations-screen.test.ts:108-112`). 저장 거부 Dialog·배너는 별도 컴포넌트로 두고, 그 테스트의 기대를 의도적으로 갱신한다.

## 5. 과거 함정 (POSTMORTEM)

| 회고 | 걸리는 곳 |
|---|---|
| 2026-09-13 잠금 전에 읽은 값으로 판정 | 저장 거부는 잠금 안에서 lease를 읽는다 |
| 2026-09-15 설정 변경으로 Sync 적용을 거부한 뒤 **서버 표면 표시**가 남아 진행이 300초 지속 | 진행 Dialog의 종료 조건은 Action 응답이지 lease가 아니다 |
| 2026-09-23 Revert가 잠금 대기 중 회수된 권한으로 실행 | 저장도 잠금 뒤 인가를 다시 본다(이미 `lockProjectAccess`가 든다) |
| 2026-09-07 클라이언트 번들 7.2MB | `lib/sync/plan.ts`는 잎이 아니다 — 화면은 판정을 import하지 않고 prop만 받는다 |
| 2026-09-14 select 누락은 typecheck가 못 본다 | 페이지 lease 읽기는 시나리오 테스트(진입점 → 격리 DB → 뷰 모델)로 잰다 |
| 2026-09-20·24 포커스 복귀 · `body`로 빠짐 · jsdom만 참 | (b) 절차로 버튼 언마운트 없음 · 거부 Dialog 닫힘 두 경로 · 브라우저 확인 |
| 2026-09-12 저장 중 수신 처리 뒤 실패 시 취소 기준이 옛 값 | 거부 뒤 초안·취소 기준이 어긋나지 않는다 |
| 2026-09-18 영원히 안 끝나는 async transition | DOM 테스트의 pending mock은 테스트 끝에서 푼다 |
| 2026-10-01 행 memo | 잠금 표시를 행으로 내리지 않는다 |

## 6. 문서

- **ARCHITECTURE**
  - §5.6.1 Project 행 잠금 표에 두 행을 더한다: "번역 쓰기 ↔ 적재 lease"와 "Publish는 잠금 대상이 아니다(전달 CAS)". 해제 실패의 대가(편집자 전원 최대 300초)도 함께 적는다.
  - §5.5.2에 보류와 잠금의 차이를 한 줄 적는다.
  - §6.45.6에 `sync-running`(`retryable`·`detail`)을 등재한다. `:3509`의 "MCP 출력은 넓히지 않는다"가 이번의 의도된 확장과 모순되지 않게 고친다.
- **DESIGN**
  - §6.644를 다시 쓴다(Dialog가 진행·결과를 든다, 띠 제거). `:1167,1272,1283,1286`을 함께 고친다.
  - §6.4 Dialog 행의 "Sync는 §6.644(pending 동안 Dialog를 숨긴다)"와 "Esc·배경·X·Cancel 넷으로 닫힌다"에 `closeDisabled` 예외를 적는다.
  - §7 `SyncButton` 포커스 문장을 고치고, 저장 거부 Dialog 예외를 등재한다.
  - `sync-result.tsx:43-45` 주석을 뒤집는다(근거 spec "정본 뒤집기 근거").
- **DIRECTORY**: `:312`.
- **PRODUCT**: 편집자가 보는 동작이 바뀐다 — 한 줄.
- **가이드**
  - `guide/sync/*`: Sync 중 저장이 막힌다, 결과는 Dialog.
  - `guide/translate/edit.md`: 편집자 쪽 — 거부 Dialog·배너.
  - `guide/ai-agents/permissions.md:32,36`: MCP `sync-running`.
  - `sync-discard.webp`(`sync-button.tsx` 매핑)이 `guide:check`에서 stale로 잡힌다 → `/guide-shots` 재촬영.

## 7. 확인 필요 → 전부 결정됨 (spec "사용자 결정")

| # | 질문 | 결정 |
|---|---|---|
| C1 | 야간 적재(같은 lease)도 쓰기를 막나 | **막는다** — 같은 lease라 규칙이 하나이고, 적재 하나가 60초 안에 끝난다(다른 시간대의 업무 시간과 겹치는 대가는 spec "대가") |
| C2 | CI push(`/api/push`)도 막나 | **안 막는다** — 프로젝트 lease가 없고, 미전달 편집이 있으면 이미 통째로 보류(`deferred`)되며, 막으면 CI마다 편집자를 막게 된다 |
| C3 | Sync 결과를 Dialog에만 두나 | **Dialog에만** — Home·번역 화면 두 자리의 띠와 `SlowNotice`를 걷는다. 닫은 뒤엔 Logs가 기록한다 |
| C4 | MCP 쓰기 도구의 거부 코드 | 새 코드 `sync-running`. `set_translations`는 호출 전체 거부 + `retryable: true` + `detail { startedAt, reopensBy }` |
| C5 | 소스 추가·base locale 선언도 막나 | **안 막는다** — 새 소스의 첫 적재는 Translation을 쓰지만 편집자가 아직 쓰지 않는 표면이고, base 선언은 번역 값을 쓰지 않는다 |
| R1 | 착지 시 lease 활성 | 배너만 — Save 유지, 착지 Dialog 없음 |
| R2 | Revert 거부 코드 | lease → `sync-running`, Publish RUNNING → `busy` |
| R3 | 진행 Dialog 출구 | 응답 없이 70초 → [Close] + "The result will be in Logs." |
