# design — Sync 편집 보호와 PR 인계

상태: 3차 검수로 범위를 **토큰 축 + 거친 보류**로 축소했다. 리포 기준본·CI 트리 조회·빈값 셀 보완·운영 drain은 제외다(spec "범위에서 제외 확정된 것").
아래 계약을 구현 인터페이스와 검증의 기준으로 삼는다.

## 1. 현재 배선과 변경 지점

| 흐름 | 현재 위치 | 변경 |
|---|---|---|
| CI 적재 | `app/api/push/route.ts`, `lib/push/apply.ts` | 잠금 안에서 프로젝트 전체 pending 확인 → 있으면 `deferred`, 없으면 기존 strict 그대로 |
| 수동 Sync | `lib/import/run.ts`, `surface.ts`, `confirm.ts`, 관련 Action/UI | 폐기 승인 HMAC과 실행권, 표면별 결과 |
| 편집 | `app/(edit)/actions.ts` (`saveTranslation`) | 저장마다 편집 토큰 발급, Project 잠금과 인가 재검사. **`lib/keys/save.ts`는 I/O 0인 순수 함수 + Zod라 바꾸지 않는다** — 토큰·잠금·인가는 Action에만 들어간다 |
| Publish 1층 | `lib/pull/plan.ts` (`shouldSkipPull`), `lib/pull/run.ts` | 시각 대신 pending 토큰으로 스킵 판정. **GitHub 호출 0회를 지키는 유일한 자리다** |
| Publish 실행 | `lib/sync/run.ts`, `lib/pull/load.ts`, `run.ts` | 실행권 상호 배제, 정확한 편집 전달 처리 |
| 미리보기 | `lib/publish/read.ts`, `lib/publish/diff.ts`, Publish 모달 | 열린 PR 대비 파일 diff, 실행 전 재검사 |
| 집계 | 아래 사본 다섯 | 시각 대신 동일한 pending 토큰 술어 |

**디렉터리 이름 주의**: `lib/sync/**`는 **Publish 실행 껍데기**(앱→리포)다. 리포→앱 Sync는 `lib/import/**`·`lib/push/**`다.

기존 어댑터의 렌더링과 결정성 계약은 바꾸지 않는다. 내부 변경은 Server Action, 외부 CI만 Route Handler다.
**`/api/push`는 이번에도 GitHub을 부르지 않는다.**

### 미전달 술어의 사본 다섯

| # | 위치 | 비고 |
|---|---|---|
| ① | `lib/keys/view.ts` `isUnpublished` | 셀 배지. `surfaceArchivedAt`이 optional이라 호출부가 안 실으면 보관 표면 셀도 센다 — 전환 때 required로 좁힌다 |
| ② | `lib/keys/query.ts` `countUnpublished` | Publish 버튼 배지·표면 선택기 |
| ③ | `lib/keys/query.ts` 목록 raw SQL ⑤ | "활성 로케일 필터를 덧붙이지 않는다"는 기존 주석이 **의도로 명시**돼 있다 — 이번에 뒤집으므로 같은 커밋에서 그 주석을 갱신한다 |
| ④ | `lib/publish/read.ts`의 `where` | **무엇이 PR로 나가는가를 정하는 사본이다.** 기존 동등성 테스트(`lib/keys/__tests__/list-aggregates.integration.ts`)가 대조하지 않는다 |
| ⑤ | `app/(edit)/__tests__/harness.ts` | 메모리 하네스 |

전환 후 동등성 단언은 **다섯 전부**를 대조한다.

### `lastPulledAt`의 소비자 (전수)

pending 판정이 시각에서 토큰으로 옮겨가면 `lastPulledAt`을 읽는 자리가 아래로 갈린다.

| 소비자 | 위치 | 전환 후 |
|---|---|---|
| 미전달 술어 ①②③④ | 위 표 | **토큰으로 교체** |
| Publish 1층 스킵 | `lib/pull/plan.ts` `shouldSkipPull` | **토큰으로 교체** (pending 0 → 스킵) |
| 신규 키 `?state=new` | `lib/keys/view.ts` `filterByState`, `lib/keys/query.ts` ④ | **유지** — "마지막 pull 이후 들어온 키"라는 의미는 그대로다 |
| 편집손실 배너 닫기 키 | `translations/page.tsx`의 `dismissKey` | **교체** — §4.3 |

"최근 활동"은 소비자가 **아니다**(`TranslationSurface.lastCommitAt`과 `SyncRun`이다). `lastPulledAt` 자체의 쓰기(`lib/pull/load.ts`)는 유지한다.

## 2. 미전달 편집의 식별

추가: `Translation.pendingEditToken String?`. 저장 값이 실제로 바뀔 때 서버가 UUID를 새로 발급하고 값과 함께 쓴다.
no-op 저장은 토큰을 바꾸지 않는다. 저자는 계속 `updatedBy`, 시각은 계속 `updatedAt`이 담당한다.
**타임스탬프로 대체하지 않는다** — 완료 조건 7의 동일 밀리초 저장을 `DateTime`으로는 구별할 수 없다.

- pending 술어: 활성 표면, `StringKey.orphaned = false`, `Locale.orphaned = false`, `pendingEditToken IS NOT NULL`.
  키·로케일 관계는 같은 projectId·surfaceId로 제한한다. §1의 사본 다섯·Sync 승인 건수·Publish 대상이 같은 술어를 쓴다.
- Publish는 이 범위의 값과 `(translationId, pendingEditToken)`을 같은 RepeatableRead 스냅샷에서 읽는다.
  전체 export 스냅샷과 전달 확인할 편집 집합은 구분한다.
- 전달 성공 후 캡처 집합에 포함되고 현재도 활성 셀이며 토큰이 같은 행만 null로 만든다(조건부 UPDATE).
  새 저장은 다른 토큰이므로 남는다. orphan 셀은 writer 경고 여부와 무관하게 전달 확인에서 제외하며
  값·저자·남아 있는 토큰을 이 경로에서 바꾸지 않는다.
- strict 적재는 실제 덮인 해당 표면 셀의 토큰을 정리한다. 실패/미적용 파일의 토큰은 보존한다.
  pending이 있으면 자동 적재는 금지되므로, 정리가 일어나는 것은 수동 폐기 승인 또는 pending 0일 때뿐이다.
- writer 경고가 있으면 GitHub 쓰기 전에 전체 중단한다. 셀별 부분 전달 추적은 만들지 않는다.
  ⚠️ **이것은 `lib/pull/trigger.ts`가 기각한 정책의 반전이다** — 그 주석은 "`missingOriginal` 같은 **지속 상태** 경고에서
  매일 밤 트리·blob 전량 읽기가 영구화된다"를 근거로 들었다. 이번에는 1층 스킵이 토큰으로 옮겨가 pending 0이면 GitHub을 안 부르고,
  pending이 있는 채 경고로 멈춘 프로젝트는 사람이 Publish 모달에서 경고를 보고 해소할 때까지 매 밤 읽기가 반복된다.
  **그 반복을 대가로 수용하고, T14에서 `trigger.ts` 주석을 갱신한다.**
- 결과가 base와 동일하면 동등 확인으로 캡처 편집을 해제할 수 있다. 열린 PR의 반대 변경 제거가 필요한 경우에는
  승인된 수동 실행에서 실제 branch 갱신 성공 후에만 해제한다.
  ⚠️ 이것은 ARCHITECTURE §5.6.35("이 조회가 돌려준 이전 값은 **어떤 판정의 입력도 아니다**")를 넓힌다 —
  리포 바이트가 토큰 해제라는 상태 변경의 입력이 된다. **값을 고르는 데는 쓰지 않으므로 병합은 아니다.** T14에서 §5.6.35를 갱신한다.

토큰은 동시 공동 편집 기능이 아니다. 전송 응답이 늦게 도착해 새 저장까지 전달 처리하는 경합을 막는 식별자다.
**DB 조건부 UPDATE가 토큰 판정의 실제 방어선이다.** 순수 함수 결과를 선조회한 뒤 무조건 UPDATE하는 구현은 금지한다.

### 인덱스

새 술어는 기존 `updatedAt > lastPulledAt` 범위 조건이 사라져, `Translation`의 기존 인덱스 넷
(`[projectId, surfaceId, localeCode, needsReview]` · `[projectId, surfaceId, updatedAt]` · `[projectId, localeCode, needsReview]` · `[projectId, updatedAt]`)
어느 것도 토큰 축을 덮지 않는다. 목록 raw SQL ③과 1층 스킵이 프로젝트 파티션 전체를 스캔하게 된다.

- 실제 pending 행은 프로젝트당 수십~수백이므로 적합한 것은 **partial index**(`WHERE "pendingEditToken" IS NOT NULL`)다.
- Prisma schema로 표현할 수 없으면 마이그레이션 SQL에 수기로 넣는다. 그러면 ARCHITECTURE §5.6.1이 부분 유니크 인덱스를
  거부한 이유("스키마와 실제 DB가 갈리는 자리가 하나 는다")를 이번에는 감수해야 하므로, **감수 근거와 EXPLAIN 결과를 T14에서 ARCHITECTURE에 남긴다.**
- 판정은 T3의 EXPLAIN으로 한다. 일반 복합 인덱스로 Seq Scan이 사라지면 partial index를 쓰지 않는다.

## 3. 프로젝트 전체 자동 적재 판정

순서: 인증 scope → 기존 archived/format/stale-commit 검증 → 실행권 → **프로젝트 전체 pending 확인** → mutation.
Project → Surface 잠금 순서를 지키고 최종 판정과 적용을 같은 tx에 둔다. **원격 I/O가 없으므로 잠금을 풀었다 다시 잡는 구간이 없다.**
모든 저장·적재·표면 설정 변경이 Project 잠금에 참여해야 한다. 일부 writer만 참여하면 전체 보류를 보장할 수 없다.

- `apply`: pending 0. 기존 strict SQL을 그대로 실행하고 적용된 셀의 토큰을 정리한다.
- `defer`: pending > 0. 키·번역·저자·refs·`declaredBaseLocale`·`Project`·`TranslationSurface` 전부 불변. **어떤 컬럼도 쓰지 않는다.**
- `fail`: 기존 실패 계약 그대로.

**보류 상태를 저장하지 않는다.** "보류 중"은 pending > 0에서 파생된다 — pending이 있으면 다음 CI 요청은 반드시 보류되므로
컬럼이 줄 정보가 없다. 관측 commit·확인 시각 컬럼도 두지 않는다(리포를 보지 않으므로 관측이 없다).
역행 검사는 기존 `TranslationSurface.lastCommitAt` 기준을 유지한다. 보류된 요청은 그 값을 전진시키지 않는다.

API: HTTP 200의 닫힌 union `status: applied | deferred`와 deferred의 `reason: "pending-edits"`, `pendingCount`.
deferred는 큐에 넣었다는 의미가 아니므로 202를 쓰지 않는다. 기존 실제 오류는 4xx/5xx 유지.
기존 부분 적재(일부 파일 파싱 실패) 응답 형식은 바꾸지 않는다 — pending 0 경로는 오늘과 같은 계약이다.

CLI(`scripts/push-local.ts`)는 이미 응답 본문을 그대로 출력하고 `res.ok`로 exit한다.
**구 action 태그(`@malmoi-i18n-push-v1`)도 deferred에서 exit 0 + 본문에 `"status":"deferred"`가 찍히므로 안전하다.**
Actions `::warning` 주석과 "imported" 오인 방지 문구는 새 CLI가 필요하며, 그 태그 릴리스는 배포 B와 순서 의존이 없다(T16).
실패 보고 endpoint가 늦게 와도 더 최신 적용 상태를 덮지 않도록 기존 실행 토큰 검사를 유지한다.

## 4. 수동 Sync와 경합

### 4.1 승인

확인 정보는 사용자·projectId·활성 표면/설정·현재 pending 셀의 id/token 정렬 지문에 묶는다.
클라이언트의 `discard: true`만 믿지 않는다.

- `lib/onboarding/sample-confirmation.ts`의 HMAC 패턴(목적 라벨·상수 시간 대조·길이 제한·scope 바인딩)을 따른다.
  **그 모듈은 `secret: string`을 인자로 받아 순수하다** — 새 모듈도 `AUTH_SECRET`을 직접 읽지 않고 인자로 받는다.
- ⚠️ **만료는 재사용이 아니라 신규 요소다.** 그 모듈 페이로드에는 `exp`/`iat`가 없고 검증에 시간 검사가 없다.
  이번 페이로드에 `exp`를 넣고 검증에서 대조한다. 유효기간은 발급 후 5분.
- 목적 라벨은 `malmoi:discard-sync:v1`과 `malmoi:publish-preview:v1`로 분리한다. 새 환경변수는 없다.
- 토큰은 승인된 편집 집합을 증명할 뿐, 이후 저장을 버릴 포괄 권한이 아니다.

실행권 획득 tx에서 **Project 잠금 → OWNER 재인가 → 승인 지문 재검사** → 기존 `repositoryImportToken` 획득 순서다.
승인 재검사를 잠금 **뒤**에 두는 이유는 POSTMORTEM 2026-09-13("일회용 연결 요청을 락 전에 읽어 재사용 결과가 달라졌다")이다.

### 4.2 경합

- 수동 Sync 실행 중 `saveTranslation`은 Project 잠금 뒤 활성 import를 확인해 재시도 가능한 거부를 반환한다.
  UI는 미저장 입력을 남기며 저장 성공처럼 표시하지 않는다.
- CI도 활성 수동 import/Publish와 겹치면 보류한다.
- Publish 시작도 활성 수동/CI 적재와 상호 배제한다. GitHub I/O 동안 DB 잠금을 유지하지 않는다.
- **실행권 판정의 주인은 하나다.** 현재 `planSyncStart`(`lib/sync/plan.ts`)는 `SyncRun`만, `planRepositoryImport`(`lib/import/plan.ts`)는
  import 토큰/표면 마커만 보고 CI push는 `FOR UPDATE` 직렬화뿐이다. 셋을 교차시키려면 둘 다에 상대 입력을 넣지 말고
  **`planExecutionLease` 하나를 세워 `planProtectedImport`·`planProtectedPublish`가 같은 입력 타입으로 부른다**(ARCHITECTURE §5.6.3 "판정 자리는 하나").
- 승인 재사용은 실행권·설정/importRevision·현재 pending 지문을 함께 대조한다. 성공/부분 적용/새 편집 뒤에는 거부한다.
  아무 데이터도 바뀌지 않은 일시 실패 뒤 같은 상태로 재시도하는 것은 유효기간 내 허용한다. 일회용 소비 저장소를 별도로 만들지 않는다.
- 기존 수동 Sync의 표면별 적용/부분 성공은 유지한다. 각 표면의 적용 tx에서 실행권·revision·설정을 다시 확인한다.
- 실패/보류/승인 불일치 모두 자기 실행 표시만 정리하고 캐시를 무효화한다. 다른 실행의 상태를 지우지 않는다.
- Publish 중 저장은 허용한다. 적재와 설정 변경은 실행권으로 차단하며 추가 저장은 편집 토큰으로 보존한다.
- stale 실행권의 종료는 기존 제한을 유지하되 외부 쓰기 직전 소유권을 재검사한다. 네트워크 쓰기와 DB를 하나의 원자 트랜잭션으로 보장하지 않는다.
- **같은 요청 안에서 조건부 쓰기 둘을 `Promise.all`로 겹치지 않는다** — POSTMORTEM 2026-09-16의 형이고, "DB 조건부 UPDATE가 실제 방어선"이 그 전제 위에 선다.

**저장 지연**: `lib/push/apply.ts` 주석에 잠금+revision 도입의 실측이 있다(cold 743→1716ms, warm 240→~600ms).
push는 CI 경로라 감수했지만 `saveTranslation`은 사람이 타이핑하는 경로다. **T5에서 잠금 전후 저장 왕복을 실측하고,
warm p50 증가가 +150ms를 넘으면 잠금 범위를 다시 설계한다.**

### 4.3 화면 문구

- `lib/import/confirm.ts`의 **`planImportConfirmation({ unsent, openPr })`에 `canPublish` 입력을 더한다.**
  반환 필드 `recommendSend`는 `unsent > 0 && canPublish`가 된다(현재는 `unsent > 0`).
  Publish가 막힌 상태(열린 PR 조회 실패 등)에서는 `Send changes first`를 숨기고 보존 중인 편집과 승인 시 폐기 범위를 설명한다.
- 막힌 상태의 안내는 **긍정형 출구를 필수로 든다.** `planSyncProtectionView`의 출력에 출구 문구 필드가 있어야 하고,
  "하지 말라"만 말하는 출력은 테스트가 red를 낸다. 출구는 ① Publish(두 역할 모두 가능) ② OWNER의 폐기 승인 순서다.
- **EDITOR의 1차 렌더 자리는 번역 화면과 Publish 모달이다.** EDITOR에게는 Sync UI가 통째로 없다(`components/home/sync-button.tsx`가
  `role !== "OWNER"`면 `null`). 따라서 §4의 Sync Dialog 안내는 OWNER 전용이고, EDITOR용 문구를 거기 두지 않는다.
- **`EditLossBanner`를 교체한다.** 현재 문구(`messages/en.tsx`의 `…can be lost when repository changes are imported automatically or with Sync.`)는
  보호가 켜지면 절반이 거짓이 되고, 남은 절반은 안전한 상태에 amber 경고를 띄운다(DESIGN §6.1 "가장 흔한 상태가 가장 조용하다" 위반).
  - 문구: pending > 0이면 `Repository updates are paused until N unsent changes are sent.` + Publish 액션. `automatically`를 뺀다.
  - variant: `info`로 내린다.
  - **닫기 키**: `lastPulledAt`이 아니라 **pending 셀 `max(updatedAt)`**이다. T8의 1층 스킵이 pending 0에서 `lastPulledAt` 갱신을 멈추므로,
    그대로 두면 한 번 닫은 배너가 다시는 안 열린다. 새 저장이 `updatedAt`을 올리므로 새 편집 뒤 다시 열린다.
  - ⚠️ POSTMORTEM 2026-09-14("확인 Dialog의 유일한 논거가 반대 방향으로 거짓")의 재발 방지 grep은 `won't be able|will stop|stops |no longer|until you`이고
    **이 문장(`can be lost`)은 거기 안 걸린다.** T14에서 그 grep 패턴에 `can be lost|automatically`를 더한다.
- Sync Dialog의 새 설명이 늘리는 줄은 `components/ui/dialog.tsx`의 360px(`max-w-90`, `overflow-*`·`max-h-*` 없음) 안에서
  **스크롤 없이 서는 것이 조건**이다. 넘으면 Dialog 프리미티브에 `max-h` + 본문 스크롤을 넣는 별도 변경이 필요하다(T12에서 판정).
  새 문장과 기존 설명문이 같은 동사(`replace`)로 같은 사실을 두 번 말하지 않게 새 문장 쪽을 폐기 범위 서술로 쓴다.
- 배포 B에서 미전달 카운트가 orphan 제외분만큼 **설명 없이 한 번 줄어든다**(Publish 배지·표면 선택기·Home `To send`·목록 띠·셀 배지).
  값이 줄기만 하므로 기능 결함은 아니지만 "내 편집이 사라졌나"로 읽힐 수 있어 배포 B 노트에 한 줄 남긴다.

## 5. Publish 검사와 PR 인계

pending 0이면 모든 트리거에서 즉시 no-edits. `maxUpdatedAt`만으로 실행 여부를 정하지 않는다.
검사한 base snapshot에 대한 보장만 한다. 쓰기 중 base에 새 commit이 생기는 것은 GitHub PR 검토 영역이다.

미리보기는 실행 허가의 정본이 아니다. 실행 시 조건을 다시 검사한다. 미리보기 이후 pending/열린 PR head/base SHA/표면 설정이 달라지면
쓰기 전에 `preview-stale`로 돌려주고 새 미리보기를 요구한다. HMAC은 이 네 요소의 서버 발급 snapshot 지문·사용자·project·유효기간에 묶는다.
일반 코드만 바뀌어도 PR head 대비 제안 결과가 바뀔 수 있으므로 base SHA를 생략하지 않는다.
⚠️ 이 게이트는 ARCHITECTURE §5.6.35("Publish 미리보기는 표시 전용이다")를 뒤집는다. T14에서 갱신한다.

### 5.1 PR 파일 diff (열린 PR이 있을 때만)

미리보기의 기존 base 대비 목록에 더해 **기존 PR head → 제안된 결과**의 파일 diff를 제공한다.
기존 PR의 사람 수정까지 빠뜨리지 않도록 키 목록만으로 대신하지 않는다. 열린 PR이 없으면 이 구역과 전수 열람 게이트를 생략한다.

**⚠️ 현재 모달 규격으로는 앉지 않는다 (CDO 실측).** 이 절의 시각 계약은 **Claude Design 핸드오프가 정한다**(T12).
구현은 핸드오프 없이 시작하지 않는다.

- `preview` 패널 높이가 620~680px 고정이고 `calc(100svh-96px)`와 `min()`이라 화면이 커져도 안 커진다(`components/publish-button.tsx`의 `PANEL`).
- 셸 머리·본문 패딩·푸터를 빼면 본문 가용 ~455px, PR Notice와 gap을 빼면 ~359px이다. 오늘은 그 전부가 `TableShell` 하나이고 약 5행이 보인다.
- 구역을 하나 더 넣고 제목 둘·gap·페이지 컨트롤을 얹으면 **구역당 ~128px** — 셀 표 1.5행, hunk 6~7줄이다.
- 페이지당 200셀이면 12,400px를 128px 창으로 훑는다. **페이지네이션이 스크롤을 줄여주지 못한다.**
- 안쪽 스크롤러가 둘이 되면 DESIGN §6.646의 `bodyScroll` 규칙("안쪽 스크롤러가 있는 갈래만 `hidden`")과 "승인 버튼까지 스크롤로 도달"이 동시에 성립하는지가 불명이다.

**핸드오프가 반드시 정해야 하는 것** (T12의 수용 조건):

1. 새 갈래의 패널 높이 리터럴(현재 620~680으로는 불가).
2. 두 구역의 분할 방식 — 동시 표시 / 세그먼트 전환(`components/onboarding/steps/files.tsx`에 모달 안 `SegmentedControl` 선례) / 접기 중 하나.
3. **페이지네이션이 하나인가 둘인가** — 두 구역이 한 페이지 인덱스를 공유 / 구역별 독립 / 셀 목록만 페이지.
4. 페이지 컨트롤의 치수·위치·접근 이름. `components/ui/`에 pagination 프리미티브가 없고, 리포의 유일한 페이징 관용구는 서버 `?cursor=` + 단방향 `Older` 링크다(`logs/page.tsx`, DESIGN §6의 "클라이언트 상태 0" 근거). 모달 안 클라이언트 상태 페이징은 그 근거를 잃는다. 새 프리미티브를 만들면 `focus-ring.test.ts`·`disabled-pairing.test.ts` 계약에 들어간다.
5. hunk 줄 칠 방식. **DESIGN §6.2는 `red-700/[0.14]`·`green-800/[0.16]`을 "줄 전체가 아니라 바뀐 낱말만 칠한다"를 근거로 등재했고, "초록·빨강을 이 두 자리 밖으로 넓히지 않는다"고 못박았다.** 텍스트 hunk는 본질적으로 줄 단위다. 줄 단위를 택하면 **§6.2 그 문장을 먼저 고치는 것이 핸드오프 반영의 선행 조건이다.** 또 hunk를 `<pre className="text-mono bg-muted">`로 그리면 DESIGN이 이미 지목한 AA 위험 조합(`bg-muted` 위 `--muted-foreground` 4.34:1)을 하나 더 만든다.
6. 아래 결과 상태 표의 각 갈래 높이.

**승인 버튼 활성 조건**: 서버가 전체 변경 목록과 페이지 완전성을 확인하고 **클라이언트가 전 페이지를 받은 뒤** 활성화한다.
이 게이트는 **열린 PR이 있어 교체가 발생할 때만** 걸린다 — 신규 PR이면 1페이지에서 즉시 활성이다
(오늘 903키×3로케일 프로젝트가 잘림 문구 한 줄만 보고 1클릭으로 보내는 흐름을 유지한다). 사람의 실제 독해 여부를 증명한다고 주장하지 않는다.

**데이터**:
- `lib/publish/read.ts`의 `take: PREVIEW_LIMIT`는 **커서 없는 단순 절단**이다. 페이지로 바꾸려면 커서를 새로 만들어야 하고,
  그 커서는 같은 DB 편집 snapshot·base SHA·PR head에 묶인다. 페이지 사이 snapshot이 바뀌면 전체 미리보기를 새로 받는다.
- 페이지네이션은 **I/O를 줄이지 못한다** — 완전성 확인이 1페이지에서 base와 PR head blob 전부를 요구한다.
  `lib/publish/read.ts`가 8개씩 배치로 blob을 받는 지금 구조에서 왕복이 두 배가 된다. 원격 읽기의 기존 자원 예산은 유지하며,
  실제 예산 초과는 부분 diff 승인으로 우회하지 않는다. 재조회로도 해소되지 않으면 기존 PR을 GitHub에서 검토·처리한 뒤 새 미리보기를 여는 경로를 안내한다.

**접근성**: 두 구역은 `Repository base → App translations` / `Current pull request → Proposed result`로 제목·접근 이름을 구분한다
(DESIGN §6.646의 `−`/`+` `aria-hidden` + `sr-only` 선례를 두 구역 각각에). 페이지 이동은 키보드로 가능하고 제목으로 포커스를 옮기며,
현재/전체 페이지 수 알림은 셸의 sr-only live 영역 하나(`components/ui/modal.tsx`, `announce` prop)를 통과한다 — danger 갈래의 `quiet`와 충돌 여부를 T13에서 확인한다.

### 5.2 결과 상태

현재 모달은 `PublishModalState` 5종(`lib/publish/preview.ts`) × `result` 8갈래(`lib/publish/plan.ts`) = 12갈래이고 각 갈래가 `PANEL`의 자기 높이 리터럴을 든다.
이번에 새로 요구되는 갈래는 아래 일곱이며, 사용자가 할 일이 같은 것은 한 갈래 + 사유 줄로 접는다.

| 새 갈래 | 사용자가 할 일 | 접힘 |
|---|---|---|
| `preview-stale` | 새 미리보기 | 단독 |
| PR diff 읽기 실패 | 재조회 | "재조회" 한 갈래 + 사유 |
| 페이지 미준비 | 재조회 | ↑ |
| 원격 예산 초과 | GitHub에서 PR 처리 후 재조회 | 단독 |
| 열린 PR 조회 실패 (자동은 보류, 수동은 재조회) | 재조회 | "재조회" 갈래 + 사유 |
| writer 경고 사전 중단 | 경고 해소 | 기존 `Warnings` 갈래 확장 |
| delivery unknown 재시도 | 기존 안내 유지 | 기존 갈래 |

리포 기준본 관련 갈래(repo-changed / unknown / baseline-unavailable)는 범위에서 빠졌으므로 없다.

### 5.3 실행과 전달 확인

D2 확정: cron은 pending이 있어도 열린 PR이 있거나 조회 불가면 쓰지 않는다. 열린 PR을 갱신하려면 사용자 미리보기 승인이 필요하다.
Publish 결과의 reason으로 표현한다.
수동 Publish의 재사용 branch 강제 갱신 자체는 유지한다. 사용자가 승인한 교체이며 이전 PR 값을 DB로 합치지 않는다.
새 편집 없는 cron은 PR 조회/force update/되돌림도 하지 않는다.

GitHub write 후 DB 전달 기록 실패는 unknown + pending 유지. 재시도는 실제 PR head/내용을 확인하고,
같은 결과가 이미 전달됐으면 확인 후 해제한다. '보냈을 수도 있음'을 '아직 보내지 않음'으로 단정하지 않는다.

## 6. 스키마·배포

**additive**, 컬럼 삭제 없음.

| 대상 | 추가 | 의미 |
|---|---|---|
| Translation | `pendingEditToken String?` | 아직 전달 확인되지 않은 마지막 편집 |
| Translation | 인덱스 (§2 판정에 따라 일반 또는 partial) | pending 술어 |

### 6.1 배포 — 운영 차단 없이 두 번

**drain 절차가 없다.** drain의 유일한 목적은 "옛 writer가 토큰 없이 저장하는 창"을 닫는 것인데,
배포 A가 dual-write하므로 **A의 롤아웃이 끝나면 그 창은 스스로 닫힌다.** 남는 것은 A 이전에 쓰인 편집에 토큰을 채우는 backfill의 멱등성뿐이다.

1. **배포 A (호환):** additive migration + 저장 토큰 dual-write + 기존 Sync 적용 셀 토큰 정리 + 기존 Publish 성공의 캡처 토큰 CAS.
   사용자 흐름·미전달 판정은 **기존 계약 그대로**다. 저장 경로의 Project 잠금·재시도 거부는 **넣지 않는다**(사용자에게 보이는 변화이고 설명 UI가 B에 있다).
2. **롤아웃 완료 조건:** 프로덕션 alias 전환 + 가장 긴 `maxDuration`(현재 `/api/push` 60초, Server Action은 플랫폼 기본값) 경과.
   Preview는 **로그인이 `dev.mal-moi.com`에서만 되므로** 배포별 URL의 옛 코드는 저장 Action에 도달하지 못한다(CLAUDE.md "로그인은 이 URL에서만 된다").
3. **backfill:** `scripts/backfill-pending-edit-token.ts`. 기존 술어(`updatedBy IS NOT NULL AND (lastPulledAt IS NULL OR updatedAt > lastPulledAt)`) + §2의 활성 셀 조건에 맞고
   `pendingEditToken IS NULL`인 행에만 토큰을 채운다. **멱등이다.** 0행이 두 번 연속 나올 때까지 반복한다.
   orphan 값·저자는 보존하고 토큰을 새로 만들지 않는다. 이미 dual-write한 토큰은 재발급하지 않는다.
   술어는 순수 모듈로 분리해 스크립트와 테스트가 같은 것을 부른다.
4. **배포 B (보호):** B 커밋에 **precondition 전용 마이그레이션**을 하나 둔다 — 스키마 변경 없이
   `DO $$ … IF EXISTS (기존 술어 ∧ 활성 셀 ∧ token IS NULL) THEN RAISE EXCEPTION 'precondition failed' … $$`.
   선례는 `prisma/migrations/20260914070000_finalize_translation_surfaces/migration.sql`이다.
   `pnpm db:deploy`가 이 조건을 **DB에서 강제**하므로 backfill을 빠뜨리면 `/merge` 1단계에서 멈춘다. 사람의 체크리스트에 기대지 않는다.
   B는 §3 보류 게이트·§2 새 술어·§4 승인 UI·§5 PR diff를 함께 배포한다.

A→B 사이에는 A가 계속 돌며 새 저장에 토큰을 쓴다. B 직전 precondition이 실패하면 backfill을 다시 돌리고 재시도한다 — **편집을 버리거나 pending을 비우지 않는다.**
B 실패로 A로 복귀해도 A는 기존 정책이고 토큰 dual-write는 계속되므로 재전환 시 precondition만 다시 통과하면 된다.

브랜치 흐름(`main`/`dev` 두 개, `/merge`가 squash 후 `/sync`로 dev를 main에 맞춘다)상 A와 B는 **별도의 `/merge`**다:
A `/push` → dev backfill → A `/merge`(prod `db:deploy`) → prod backfill → B `/push`(dev precondition 통과 확인) → B `/merge`(prod precondition이 게이트).

### 6.2 `AUTH_SECRET` 회전 영향

HMAC 목적이 둘 늘어난다. ARCHITECTURE와 `.env.example`의 "`AUTH_SECRET`을 회전하면 …" 영향 목록에
**"진행 중인 Sync 폐기 승인과 Publish 미리보기 승인이 무효화된다(5분 유효라 실질 영향은 재확인 한 번)"**를 더한다(T14).

`.env.local`은 읽거나 편집하지 않는다.

## 7. 순수 함수 — `/tdd interface` 대상

이름은 제안이며 client-safe 판정과 crypto/I/O 모듈은 분리한다.

| 함수 | 입력 → 출력 | 필수 반례 |
|---|---|---|
| `planExecutionLease` | 활성 SyncRun / import 토큰·표면 마커 / 요청 종류 → proceed/busy | CI와 수동 import 동시, Publish 중 import, stale 실행권 |
| `planProtectedImport` | pending 수/mode/승인 결과/실행권 → apply/defer/reject | pending 1 + 자동 → defer (apply 금지), 수동 승인 없음 → reject, 승인 있음 → apply |
| `planProtectedPublish` | pending/trigger/PR 상태/writer 경고 → proceed/skip/reject | pending 0 → skip(GitHub 0회), 열린 PR unknown + cron → skip, 경고 → reject |
| `shouldSkipPull` (시그니처 변경) | pending 수 → boolean | pending 0 → true, 1 → false. `maxUpdatedAt`이 커져도 pending 0이면 true |
| `pendingEditIdsToAcknowledge` | 캡처 집합/현재 활성 여부·토큰 → 해제 대상 | 같은 ms의 새 저장, orphan 키/로케일, 삭제/다른 project |
| `planDiscardConfirmation` | 승인 snapshot/현재 snapshot/인가/`now`·`exp` → proceed/reconfirm/reject | 같은 건수 다른 편집, 설정 변경, 만료, 재사용 |
| `planImportConfirmation` (입력 추가) | unsent/openPr/**canPublish** → recommendSend/atRisk | unsent>0 ∧ ¬canPublish → recommendSend false |
| `planSyncProtectionView` | pending 수/역할/Publish 가능 여부 → 문구·액션·**출구** | EDITOR에 Sync CTA 없음, 막힌 Publish를 다시 권하지 않음, **출구 필드가 비면 red** |
| `backfillPredicate` | 행 필드/`lastPulledAt`/활성 여부/토큰 → boolean | orphan 제외, 토큰 있으면 false, `lastPulledAt` null |

**`planProtectedImport`와 `planProtectedPublish`는 `planExecutionLease`의 출력 타입을 입력으로 받는다.** 실행권 규칙을 두 벌로 만들지 않는다.
DB 조건부 UPDATE가 토큰 판정의 실제 방어선이다. 순수 함수 결과를 선조회한 뒤 무조건 UPDATE하는 구현은 금지한다.

## 8. 불변식 영향과 회고 근거

- 값 소유권/병합: **리포를 보지 않는다.** DB 값과 리포 값의 승자를 고르는 코드가 없다. 적용 허용 시 strict 유지.
- 결정성/blob SHA: writer 불변. 어댑터 코드를 건드리지 않는다.
- 키 보존: 보류 중 키를 갱신하지 않으며 적용 시 기존 orphan 정책 유지.
- 인가: projectId → surfaceId, OWNER 폐기, EDITOR Publish 유지. installation 토큰만 GitHub 쓰기에 사용. `/api/push`는 GitHub 자격증명을 새로 쓰지 않는다.
- 결과 전달: 보류는 성공으로 접지 않고, 화면에서 적재 시각과 보류를 혼동하지 않는다.
- 표시 전용 미리보기(§5.6.35): 이번에 실행 게이트와 토큰 해제 입력으로 **넓어진다.** 값을 고르는 데는 쓰지 않는다.

| POSTMORTEM 항목 | 이번 방어선 |
|---|---|
| 2026-08-31 외부 계약 페이로드 필수 필드 누락 | 페이로드 스키마 무변경. 응답 union만 확장 |
| 2026-09-07 revalidatePath가 결과를 씻음 | 결과 호스트 유지, refresh 뒤 유지를 `/bugshot-qa`로 실물 확인 |
| 2026-09-09 일회용 허가의 조기 소비 | 동일 확인 경로가 base 선언/폐기 허가를 임의 소비하지 않음 |
| 2026-09-09 되돌린 편집이 PR에 남음 | 사용자 승인 재Publish의 no-change branch 정리는 유지; 자동 무편집 정리만 금지. **남는 노출은 §9** |
| 2026-09-13 일회용 연결 요청을 락 전에 읽음 | 승인 재검사를 Project 잠금 뒤에 둠 (§4.1) |
| 2026-09-13 임포트 종료 소유권 누락 | 적용·결과·표시 정리의 토큰 조건과 캐시 검증 |
| 2026-09-14 확인 Dialog의 논거가 반대로 거짓 | `EditLossBanner` 교체 + 재발 방지 grep 패턴 확장 (§4.3) |
| 2026-09-14 방어선 셋 다 지워도 green | 모든 "0회" 단언에 같은 픽스처의 N>0 양성 대조 + 조건부 UPDATE 뮤테이션 (T15) |
| 2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셈 | 토큰을 쓰는 자리 전수: 저장·Sync 적용·Publish CAS·backfill. §1의 사본 다섯과 `lastPulledAt` 소비자 표 |
| 2026-09-15 정상 빈 카탈로그 오판 | 적재 경로 무변경(pending 0이면 기존 그대로) |
| 2026-09-15 설정 변경 뒤 진행 표시 잔류 | 거부 경로에도 자기 실행권 정리 |
| 2026-09-15 시안 없이 만든 화면이 네 곳에서 어긋남 | PR diff 구역은 핸드오프 선행, `/design-sync`로 대조 (T12·T13) |
| 2026-09-16 부분 실패를 미완료로 표현 | 표면별 applied/deferred/failed를 분리해 표시 |
| 2026-09-16 같은 요청의 `Promise.all`이 조건부 쓰기 전제를 깸 | 조건부 쓰기 직렬화 (§4.2) |

## 9. 남는 한계

- **거친 보류의 대가**: 미전달 편집이 남아 있는 동안 리포의 새 키·삭제·로케일 추가가 앱에 안 들어온다. 편집자가 Publish하거나 OWNER가 폐기해야 풀린다.
- **2026-09-09 방어선의 자동 경로 상실**: `lib/pull/run.ts`는 변경 0건이어도 sync ref가 base보다 앞서 있으면 base head로 되돌린다 —
  "되돌린 편집이 PR에 남음"의 상시 방어선이다. D2(열린 PR이면 cron이 안 씀)와 "무편집 cron은 되돌림 안 함"을 합치면
  **자동 경로에서 이 방어선이 전부 사라진다.** 사람이 Publish 모달을 열어 승인할 때까지 되돌린 편집이 PR에 남는다. 이 창은 사람의 행동에만 닫힌다.
- **writer 경고 지속 상태**: pending이 있고 경고로 멈춘 프로젝트는 해소될 때까지 매 밤 트리·blob을 읽는다(§2).
- 리포와 앱이 같은 번역을 수정했을 때 자동 해소는 없다. 보류 요청은 저장해 재생하지 않는다.
- 권한 있는 push 토큰의 악용, 외부 GitHub/DB 간 exactly-once, 사람의 PR 수정 보호는 보장 범위가 아니다.
- 미리보기 이후 외부 PR head 경합은 쓰기 직전 재확인해 줄이되 GitHub의 원자 CAS 보장이 없는 한 완전 제거를 주장하지 않는다.
- 빈값·누락 셀의 strict 보완은 별도 spec이다. 그 전까지 수동 폐기 승인은 "리포에 있는 값으로 교체"이며, 리포에 없는 셀의 앱 값은 남는다.
