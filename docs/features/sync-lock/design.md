# sync-lock — design

## 1. 영향 받는 흐름

편집 UI(번역 화면 저장·Revert, Home·번역 화면 Sync Dialog)와 MCP 쓰기 도구. push(`/api/push`)·pull(Publish)·export는 판정만 공유하고 동작은 바뀌지 않는다(§7 C2).

## 2. 순수 함수 — `/tdd` 진입점

- **`planWriteLock({ now, repositoryImportToken, repositoryImportStartedAt })`** → `null | { reason: "sync-running"; startedAt; reopensBy }`
  - lease 술어는 `isRunActive`(`lib/sync/plan.ts:39` — 경계 정각은 활성) 하나. `reopensBy = startedAt + STALE_AFTER_SECONDS`.
  - ⚠️ **`lib/import/plan.ts`에 두지 않는다** — 그 파일이 `@/lib/adapters`(ts-morph)를 물어 화면이 import하면 클라이언트 그래프가 터진다(POSTMORTEM 2026-09-07,
    `lib/sync/plan.ts:35-36` 경고). `lib/sync/plan.ts` 옆 잎 모듈.
  - Revert의 `busy`(`lib/keys/revert.ts:78`)는 `running > 0 || planWriteLock(...) !== null`로 옮긴다(술어 사본 제거).
- 저장 거부 판정 — `applyKeySave`/`applyKeySaveBatch`가 `lockProjectAccess` 직후 Project 행의 lease 두 컬럼을 같은 트랜잭션에서 읽어 `planWriteLock`에 넘긴다.
  **잠금 안에서 읽는다** — 적재의 `acquire`(`lib/import/run.ts:68,121`)가 같은 Project 잠금 안에서 lease를 세우므로 둘은 직렬이다:
  저장이 먼저면 적재 쪽 지문 재확인(`reconfirm`)이 잡고, 적재가 먼저면 저장이 거부된다. 창이 없다.
- 결과 타입: `KeySaveResult`에 `{ ok: false; error: "sync-running"; startedAt; reopensBy }` 갈래. 초안은 클라이언트가 들고 있으므로 거부가 지우지 않는다.

## 3. 스키마 · 환경변수 · 불변식

- **스키마 변경 없음** — lease는 기존 `Project.repositoryImportToken`·`repositoryImportStartedAt`(`prisma/schema.prisma:42-43`).
- **새 환경변수 없음.**
- **불변식 2(병합 없음)** — 잠금은 쓰기를 거부할 뿐 값을 고르지 않는다. **불변식 9(부분 결과를 성공으로 접지 않는다)** — Dialog 결과는 지금 Home 결과 Alert의
  형(`sync-result.tsx`)을 그대로 옮긴다.
- 적재 lease 획득은 OWNER 전용·기존 `acquire` 그대로 — 새 잠금 표를 만들지 않는다.

## 4. 화면

| 자리 | 형 | 근거 |
|---|---|---|
| Sync 확인 Dialog(Home·번역 화면) | 확정 → **같은 Dialog가 진행 상태**(스피너 + "Syncing…" + 시작 시각)로 바뀐다. 진행 중 닫기 불가(Escape·바깥·X 없음 — `onEscapeKeyDown`·`onPointerDownOutside` preventDefault, 닫기 버튼 숨김). 끝나면 **같은 Dialog가 결과**(지금 `sync-result.tsx`의 문장·톤·`[Try again]`)를 들고 닫기가 돌아온다 | 사용자 결정 — 로딩·결과를 작은 Dialog로 확실히 |
| 저장 거부(다른 편집자) | 작은 Dialog(확인 Dialog 440 급): 제목 "Sync in progress" · 본문 "Edits are paused until the sync finishes — by HH:MM UTC at the latest." · [OK]. 초안 유지 | 사용자 결정 |
| 번역 화면 착지 중 lease 활성 | 같은 사실을 처음부터 — Save를 끄고(이유는 Dialog와 같은 문장) 착지 시 Dialog 한 번 | 저장을 눌러 보고서야 아는 것보다 먼저 말한다 |

⚠️ **진행 Dialog는 Server Action이 끝날 때까지 열려 있다** — 수동 Sync는 Home/번역 화면 Server Action이고 `maxDuration=60`이다. 탭을 닫아도 서버는 끝까지 돌고
결과는 Logs에 남는다. 사람이 다른 화면으로 가려고 하면(Dialog가 막으므로) 못 간다 — "진행 중 닫기 불가"가 그것을 뜻한다(§7 C3).
⚠️ 포커스: 진행 중 포커스는 Dialog 안(진행 문장 `role="status"`), 결과가 서면 닫기 버튼으로, 닫힌 뒤 Sync 트리거로(POSTMORTEM 2026-09-20·24).

## 5. 과거 함정 (POSTMORTEM)

| 회고 | 걸리는 곳 |
|---|---|
| 2026-09-13 잠금 전에 읽은 값으로 판정 | 저장 거부는 잠금 안에서 lease를 읽는다 |
| 2026-09-15 Sync 적용 거부 뒤 진행 표시가 300초 남음 | 진행 Dialog의 종료 조건은 Action 응답이지 lease가 아니다 |
| 2026-09-23 Revert가 잠금 대기 중 회수된 권한으로 실행 | 저장도 잠금 뒤 인가를 다시 본다(이미 `lockProjectAccess`가 든다 — 확인) |
| 2026-09-07 클라이언트 그래프 | `planWriteLock`은 잎 모듈 |
| 2026-09-20·24 포커스 복귀 | 진행 → 결과 → 닫힘 포커스 경로를 브라우저로 확인 |

## 6. 문서

ARCHITECTURE §5.6.1(Project 행 잠금 표에 "번역 쓰기 ↔ 적재 lease" 행) · §5.5.2(보류와 잠금의 차이 한 줄) · DESIGN §6.644(Sync Dialog가 진행·결과를 든다) ·
가이드 `guide/sync/*`(Sync 중 편집이 멈춘다) · PRODUCT(편집자가 보는 동작이 바뀐다 — 한 줄).

## 7. 확인 필요

| # | 질문 | 추천 |
|---|---|---|
| C1 | 야간 적재(같은 lease)도 쓰기를 막나 | **막는다** — 같은 lease라 규칙이 하나다. 야간은 사람이 없는 시간이고 60초 안에 끝난다 |
| C2 | CI push(`/api/push`)도 막나 | **안 막는다** — 프로젝트 lease가 없고, 미전달 편집이 있으면 이미 통째로 보류(`deferred`)되며, CI마다 편집자를 막게 된다 |
| C3 | Sync 결과를 Dialog에만 두나(Home 결과 Alert 제거) | **Dialog에만** — 결과가 한 자리. 닫은 뒤엔 Logs가 기록 |
| C4 | MCP 쓰기 도구의 거부 코드 | 새 코드 `sync-running`을 MCP 출력에 더한다(외부 계약 확장 — ARCHITECTURE §6.45 갱신) |
| C5 | 소스 추가·base locale 선언도 막나 | **안 막는다** — 번역 값·pending을 쓰지 않는다 |
