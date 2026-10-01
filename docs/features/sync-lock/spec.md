# sync-lock — spec

> **착수 조건: `ux-drift-unify` 종료 뒤.** 2026-10-01 사용자 결정 — "아싸리 강하게 잠금, 서버에서도 차단. 싱크 로딩과 싱크 결과 및 번역값 수정 차단은 작은 다이얼로그로 확실하게 보여준다."

## 사용자

**번역 편집자(주)와 Sync를 누른 OWNER.**
편집자는 지금 Sync가 도는 줄 모른 채 저장한다. 저장은 성공하지만, 그 셀만 리포 값을 받지 못한 unsent 셀로 남는다("싱크했는데 이 셀만 안 바뀌었다").
**그 이유를 못 보는 것은 편집자다.** OWNER는 결과의 `remainingEdits` 경고("N unsent edits were kept", `lib/import/run.ts:247` · DESIGN §6.644)로 본다.
OWNER 쪽 문제는 따로 있다. 확인 Dialog가 닫힌 뒤 결과가 화면의 띠 Alert로 따로 서서, 진행 중에 무엇이 막혔는지 한 자리에서 볼 수 없다.

## 문제 (관측 — 2026-10-01 코드 추적, 2026-10-01 feature-review로 정정)

1. **저장 경로가 실행 중인 적재를 보지 않는다.**
   - 저장 경로는 `saveTranslationKey`·MCP `set_translations` → `applyKeySave(Batch)`(`lib/keys/save-key.ts:41`)다. 이 경로는 `lockProjectAccess`만 잡고 `repositoryImportToken`을 읽지 않는다.
   - 적재가 잠그는 것은 짧은 트랜잭션 넷(획득·표면 표시·적용·해제)뿐이다. 스냅샷 다운로드·파싱은 잠금 밖이라, 그 사이에 저장이 끼어든다.
   - **값이 조용히 사라지지는 않는다.** 새 `pendingEditToken`은 적용 SQL(`lib/push/apply.ts:488`)을 통과하지 못해 남는다. 승인 전에 들어온 저장은 지문 재확인(`reconfirm`)으로 Sync를 멈춘다.
   - 문제는 결과가 편집자가 예상한 것과 다르고, 편집자는 그 이유를 볼 수 없다는 것이다.
2. **화면이 적재 상태를 모른다.** `app/`·`components/`에서 `repositoryImportStartedAt`을 읽는 곳이 0이다. Revert만 서버가 `busy`로 막는다(`lib/keys/revert.ts:78` — `hasActiveImport` 경유).
3. **Sync 결과가 확인 Dialog 밖에 따로 선다.**
   - 확정하면 Dialog가 즉시 닫힌다(`components/home/sync-button.tsx:113,172`).
   - 결과는 **누른 화면의 띠 Alert**로 온다. Home은 `components/home/actions.tsx:306`, 번역 화면은 `workspace.tsx:703`이고, 두 화면이 같은 `SyncResult`를 쓴다(DESIGN §6.644 끝).
   - 진행 상태는 트리거 `busy`와 띠 자리의 `SlowNotice`가 따로 든다.
   - 결과적으로 "누른 → 도는 중 → 결과"가 Dialog → 버튼 → 띠, 세 자리에 흩어진다.

## 정본 뒤집기 근거 (DESIGN §6.644 · §6.4 Dialog 행)

2026-09-16 실측 정본은 두 가지를 정했다. "확정 즉시 Dialog를 닫고 진행은 트리거가 든다"와 "결과는 띠 Alert"다.
`sync-result.tsx:43-45`의 "진행 Alert를 세웠다가 결과로 바꾸면 같은 자리에서 뜻이 두 번 바뀐다"가 그 근거였다.

이번에 뒤집는 이유는 다음과 같다.
- **(1) 잠금이 생겼다.** Sync가 도는 동안 같은 프로젝트의 번역 쓰기가 서버에서 거부된다. 그러니 누른 사람이 "지금 돌고 있다"를 놓치지 않는 자리가 필요하다(S0 사용자 결정).
- **(2) 근거가 Dialog에는 해당하지 않는다.** 그 근거는 같은 띠 자리에서 뜻이 두 번 바뀌는 것을 경계한 것이다. Dialog는 "확인 → 진행 → 결과"가 한 동작의 단계라서, Publish 모달(§6.646)과 같은 형이다.
- **(3) 결과 자리가 하나가 된다.** 두 화면의 띠가 사라지고, 결과는 Dialog 한 자리에만 선다. 닫은 뒤의 기록은 Logs다.

## 완료 조건

1. **적재 lease가 살아 있는 동안 그 프로젝트의 번역 쓰기가 서버에서 거부된다.**
   - 대상: 저장(화면·MCP 단건·배치)과 Revert.
   - 거부는 쓰기 트랜잭션의 Project 잠금 **안에서** lease를 읽고 판정한다(POSTMORTEM 2026-09-13 — 잠금 전에 읽은 값으로 판정하지 않는다).
   - 거부는 아무 행도 바꾸지 않는다. Translation 값·`pendingEditToken`·`updatedBy`, TranslationBaseline, `ProjectEvent` 0건.
2. **판정은 순수 함수 하나(`planWriteLock`)다.** Publish 시작 게이트(`planSyncStart`)·Revert·저장이 같은 lease 술어(`isRunActive` — stale 300초 경계, 정각 포함)를 쓴다.
3. **Sync를 누른 사람**에게는 같은 작은 Dialog가 확인 → 진행 → 결과로 바뀐다.
   - 진행 중에는 닫을 수 없다(Escape·바깥 클릭·X·Cancel 모두 막힘).
   - 결과는 지금 `SyncResult`의 문장·톤·동작을 그대로 든다. 결과 갈래는 design §4의 표가 정본이다(성공·부분·`remainingEdits`·`reconfirm`·`already-running`·`unauthorized`·`unconfirmed`·실패).
   - Action이 reject(타임아웃·네트워크)되면 `unconfirmed` 결과로 바뀌고 닫기가 돌아온다.
   - 응답 없이 **70초**가 지나면 "결과는 Logs에 남는다"는 한 줄과 함께 [Close]가 돌아온다. 판정을 바꾸는 타이머가 아니다.
   - **Home·번역 화면의 결과 띠와 `SlowNotice`는 사라진다.**
4. **다른 편집자**: 저장이 `sync-running`으로 거부되면 작은 Dialog가 뜬다.
   - 제목 "Syncing…", 본문 "You can't save edits until the sync finishes — by ‹reopensBy› at the latest.", 버튼 [OK].
   - **입력한 초안은 그대로 남는다.**
   - `sync-running`은 일반 저장 실패 문장(`save-failed`)으로 보이지 않는다.
5. **번역 화면에 들어왔을 때 lease가 살아 있으면** 헤더 배너 스택에 neutral 한 줄 "Syncing…"이 선다.
   - **Save는 끄지 않는다** — 막는 것은 서버 거부(조건 4)다. 그래서 lease가 끝나면 새로고침 없이 바로 저장이 된다.
   - 들어올 때 Dialog는 띄우지 않는다.
6. **죽은 적재**(프로세스 중단·해제 실패)는 기존 stale 경계(300초) 뒤 자동으로 풀린다.
   - 문장의 ‹reopensBy›는 `startedAt + 300초`를 **다음 분으로 올린** 값을 `utcMinute` 형(`Oct 1, 2026 16:35 UTC`)으로 낸다.
   - 그래서 표시된 시각에는 반드시 풀려 있다.
7. **MCP 쓰기 도구가 같은 거부를 받는다.**
   - `set_translations`는 **호출 전체**를 한 번 거부한다. 응답은 `code: "sync-running"`, `retryable: true`, `detail { startedAt, reopensBy }`이고, 키별 결과는 없다.
   - `revert_to_last_sent`도 lease 갈래에서 같은 코드를 받는다. Publish RUNNING 갈래는 `busy`로 남는다.
8. `pnpm gate` green. 격리 postgres 스위트에 다음 행들이 있다.
   - lease 활성 중 저장 → 거부 · 행 불변
   - lease 만료(300_001ms) 뒤 저장 → 성공
   - 잠금 경합 두 순서
   - CI 표면 표시만 있을 때 저장 → 성공
   - Publish RUNNING 중 저장 → 성공

## 대가

- **죽은 적재 하나가 그 프로젝트의 편집자 전원을 최대 300초 막는다.** 300초는 `maxDuration` 60의 5배다. 해제 트랜잭션 실패는 로그만 남긴다(`lib/import/run.ts:416-426`). OWNER가 수동으로 풀 수단은 없다(비목표).
- **Sync를 누른 사람은 최대 60초(응답이 매달리면 70초) 동안 Dialog를 닫고 다른 화면으로 갈 수 없다.** 그 사람에게는 사실상 화면 차단이다. 다른 사람·다른 프로젝트는 영향받지 않는다.
- **야간 적재(C1)가 다른 시간대의 업무 시간과 겹친다.** cron은 `0 18 * * *` UTC로, 한국 03시 · 유럽 저녁 · 미국 서부 11시다. 겹치는 시간은 적재 하나의 길이(보통 60초 이내)다.
- **"저장은 됐지만 반영이 미뤄진다"가 "저장이 안 된다"로 바뀐다.** 거부된 편집은 클라이언트 초안(sessionStorage 복구 사본은 한 키)에만 남는다. S0 결정이 받아들인 대가다.

## 비목표

- **앱 전체 차단 오버레이** — 막는 것은 같은 프로젝트의 번역 쓰기다. 다른 프로젝트·Logs·읽기는 그대로다.
- **동시 편집·실시간 공동 편집**(PRODUCT §4.2) — 이것은 잠금이지 병합이 아니다. 불변식 2(병합 없음)를 그대로 지킨다.
- **lease 종료를 화면에 실시간으로 밀어 주기**(폴링·SSE) — 서버 거부가 판정하고, 배너는 착지 시점의 사실이다.
- **OWNER의 수동 lease 해제.**
- **stale 경계(300초) 변경** — ARCHITECTURE §5.6.2의 근거(`maxDuration` 60보다 넉넉해야 한다)를 그대로 둔다.
- **설정 쓰기(base locale 선언·멤버)의 잠금** — 번역 값·pending 상태를 쓰지 않는다(§7 C5).
- **소스 추가 뒤 첫 적재**(`runFirstIngest` → `lib/onboarding/ingest.ts:85`)의 잠금 — Translation을 쓰지만, 새 소스는 편집자가 아직 쓸 수 없는 표면이다(§7 C5).
- **Publish(pull→PR) 중 저장의 잠금** — 지금처럼 허용한다. 전달 CAS가 처리한다.
- **CI push(`/api/push`)·표면 표시(`TranslationSurface.lastImportStartedAt`)를 판정에 넣기**(§7 C2).
- **MCP `sync_repository`의 결과 모양** — Dialog는 편집 UI만이다.

## 사용자 결정 (2026-10-01)

| # | 결정 |
|---|---|
| S0 | 강하게 잠근다 — 서버가 거부하고, 싱크 로딩·결과·편집 차단은 작은 Dialog로 확실하게 보인다 |
| C1 | 야간 적재(같은 lease)도 쓰기를 막는다 — 근거: 같은 lease라 규칙이 하나이고, 적재 하나가 60초 안에 끝난다 |
| C2 | CI push(`/api/push`)는 막지 않는다 |
| C3 | Sync 결과는 Dialog에만 — **Home·번역 화면 두 자리의 결과 띠와 `SlowNotice`를 걷고**, 거부 갈래(`already-running`·`unauthorized`·`unconfirmed`)도 Dialog 결과 상태로 모은다 (feature-review) |
| C4 | MCP 쓰기 도구는 새 거부 코드 `sync-running` — `set_translations`는 **호출 전체 거부 + `retryable: true` + `detail { startedAt, reopensBy }`**. MCP 출력 계약을 한 값 넓힌다(ARCHITECTURE §6.45.6 갱신) (feature-review) |
| C5 | 소스 추가(첫 적재 포함)·base locale 선언은 막지 않는다 — 새 소스는 편집자가 아직 쓰지 않고, base 선언은 번역 값을 쓰지 않는다 |
| R1 | 착지 시 lease가 살아 있으면 **배너만** — Save를 끄지 않고, 착지 Dialog도 없다 (feature-review) |
| R2 | Revert의 lease 갈래는 `sync-running`(+`reopensBy`), Publish RUNNING 갈래는 `busy`로 남는다 (feature-review) |
| R3 | 진행 Dialog는 응답 없이 70초가 지나면 [Close]를 돌려준다(결과는 Logs) (feature-review) |
| R4 | 번역 화면 Revert가 `sync-running`으로 거부되면(미리보기·확정 두 경로) **저장 거부와 같은 "Syncing…" Dialog**를 띄운다 — 원인이 같으니 형도 같다. `unavailable`로 접지 않는다 (orchestrate 인테이크) |
| R5 | **Home [Sync]도** 착지 시 lease가 살아 있으면 `paused` + 사유로 멈춘다 — 같은 `SyncButton`이 화면마다 다르게 멈추면 드리프트다 (U 리뷰) |
| R6 | Sync Dialog **결과 단계는 결과별 제목**을 단다 — Publish 모달(DESIGN §6.646)과 같은 형. 본문 Alert 헤드라인과 같은 문장이 두 번 서지 않게 정리한다 (U 리뷰) |
