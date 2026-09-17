# design — Sync 편집 보호와 PR 인계

상태: 4차 검수. 범위는 **토큰 축 + 거친 보류**다. 리포 기준본·CI 트리 조회·빈값 셀 보완·운영 drain(3차)에 더해
열린 PR 대비 파일 diff·미리보기 승인 지문·D2·저장 경로 잠금·승인 HMAC·`planExecutionLease`(4차)를 제외했다(spec "범위에서 제외 확정된 것"·"비목표").
아래 계약을 구현 인터페이스와 검증의 기준으로 삼는다.

## 1. 현재 배선과 변경 지점

| 흐름 | 현재 위치 | 변경 |
|---|---|---|
| CI 적재 | `app/api/push/route.ts`, `lib/push/apply.ts` | apply tx 안에서 프로젝트 전체 pending 확인 → 있으면 `deferred`(쓰기 0), 없으면 strict upsert에 토큰 가드 + 적용 뒤 재집계. **`markImportStarted`를 그 판정 뒤로 옮긴다**(§3) |
| 수동 Sync | `lib/import/run.ts`, `surface.ts`, `confirm.ts`, 관련 Action/UI | 폐기 승인 지문 재계산, 승인 집합 토큰 조건부 upsert, 표면별 결과 |
| 편집 | `app/(edit)/actions.ts` (`saveTranslation`) | 저장마다 편집 토큰 발급(값이 실제로 바뀔 때만). **잠금·거부는 넣지 않는다.** `lib/keys/save.ts`는 I/O 0인 순수 함수 + Zod라 바꾸지 않는다 |
| 미전달 술어 | `lib/keys/unpublished.ts` `unpublishedWhere` | 시각 조건 → 토큰 조건. **`countUnpublished`와 pull 1층(`lib/pull/load.ts`)이 이 조각을 공유하므로 여기 한 곳이 바뀌면 둘이 따라온다** |
| Publish 1층 | `lib/pull/plan.ts` `shouldSkipPull(unpublished: number)` | **변경 없음** — T0로 이미 건수 기반이다. 입력이 토큰 술어 건수로 바뀔 뿐이다. GitHub 호출 0회를 지키는 유일한 자리 |
| Publish 실행 | `lib/sync/run.ts`, `lib/pull/load.ts`, `lib/pull/run.ts` | 캡처 `(id, token)`, 성공·동등 시 조건부 UPDATE, Sync↔Publish 상호 배제 입력 |
| 집계 | 아래 사본 넷 + 공유 조각 | 같은 토큰 술어 |
| 화면 | 배너·Sync Dialog·Home 카드 | §4.3 |

**디렉터리 이름 주의**: `lib/sync/**`는 **Publish 실행 껍데기**(앱→리포)다. 리포→앱 Sync는 `lib/import/**`·`lib/push/**`다.

기존 어댑터의 렌더링과 결정성 계약은 바꾸지 않는다. 내부 변경은 Server Action, 외부 CI만 Route Handler다.
**`/api/push`는 이번에도 GitHub을 부르지 않는다.**

### 미전달 술어 — 손 사본 넷 + 공유 조각 하나

| # | 위치 | 비고 |
|---|---|---|
| ① | `lib/keys/view.ts` `isUnpublished` | 셀 배지. `surfaceArchivedAt`이 optional이라 호출부가 안 실으면 보관 표면 셀도 센다 — 전환 때 required로 좁힌다. **셀 객체는 RSC 페이로드로 화면에 간다**(`Cell` 타입) — 토큰 원문이 아니라 `pending: boolean` 투영만 싣는다 |
| ② | `lib/keys/unpublished.ts` `unpublishedWhere` | **공유 조각.** `countUnpublished`(`lib/keys/query.ts`)와 1층(`lib/pull/load.ts:72`)이 쓴다. `lib/keys/unpublished.ts:6` 주석의 "사본 넷"이 이것을 센다 |
| ③ | `lib/keys/query.ts` 목록 raw SQL ⑤ | "활성 로케일 필터를 덧붙이지 않는다"는 기존 주석(`:563`)이 **의도로 명시**돼 있다 — 이번에 뒤집으므로 같은 커밋에서 그 주석을 갱신한다 |
| ④ | `lib/publish/read.ts`의 `where`(`:19-20`) | **무엇이 PR로 나가는가를 정하는 사본이다.** 기존 동등성 테스트(`lib/keys/__tests__/list-aggregates.integration.ts`)가 대조하지 않는다 |
| ⑤ | `app/(edit)/__tests__/harness.ts` | 메모리 하네스(`translation.count`, `:1102-1123`) |

전환 후 동등성 단언은 **다섯 전부**를 대조한다(launch-readiness L3.10·L7.2가 이 spec으로 옮겨 왔다 — L7.2의 `countUnpublishedBySurface`도 ②를 지나게 한다).

### `lastPulledAt`의 소비자 (전수)

| 소비자 | 위치 | 전환 후 |
|---|---|---|
| 미전달 술어 ①②③④ | 위 표 | **토큰으로 교체** — `lastPulledAt`을 읽지 않는다 |
| 신규 키 `?state=new` | `lib/keys/view.ts` `filterByState`, `lib/keys/query.ts` ④ | **유지** — "마지막 pull 이후 들어온 키"라는 의미는 그대로다 |
| 편집손실 배너 닫기 키 | `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx:214` `dismissKey`(+`components/translations/header.tsx:64`) | **삭제** — 배너에 닫기가 없어진다(§4.3) |

"최근 활동"은 소비자가 **아니다**(`TranslationSurface.lastCommitAt`과 `SyncRun`이다). `lastPulledAt` 자체의 쓰기(`lib/pull/load.ts`)는 유지한다.
1층 스킵이 pending 0에서 `lastPulledAt`을 갱신하지 않게 되지만 남는 소비자(`?state=new`)에는 "마지막으로 실제 판정한 시각"이 맞는 의미다.

## 2. 미전달 편집의 식별

추가: `Translation.pendingEditToken String?`. 저장 값이 실제로 바뀔 때 서버가 UUID를 새로 발급하고 값과 함께 쓴다.
no-op 저장(값 동일)은 토큰을 바꾸지 않는다 — `needsReview`만 바뀌는 저장도 no-op이다(리포에 나갈 값이 같다). 저자는 계속 `updatedBy`, 시각은 계속 `updatedAt`이 담당한다.
**타임스탬프로 대체하지 않는다** — 완료 조건 7의 동일 밀리초 저장을 `DateTime`으로는 구별할 수 없다.

- pending 술어: 활성 표면, `StringKey.orphaned = false`, `Locale.orphaned = false`, `pendingEditToken IS NOT NULL`.
  `Translation`↔`StringKey`/`Locale`은 3열 복합 FK(`prisma/schema.prisma:280-281`)라 Prisma where로 표현되고 `projectId`·`surfaceId` 제한이 FK에서 자동이다.
  §1의 사본·Sync 승인 건수·Publish 대상이 같은 술어를 쓴다.
- **토큰 원문은 서버 밖으로 나가지 않는다.** 조회는 `pending: boolean` 투영만 내리고, 승인 지문은 목록이 아니라 digest 하나다(§4.1).
  토큰을 모르면 지문을 위조할 수 없다는 §4.1의 전제가 여기서 선다.
- Publish는 이 범위의 값과 `(translationId, pendingEditToken)`을 같은 RepeatableRead 스냅샷에서 읽는다(`loadPullState`, `lib/pull/load.ts:17`).
  전체 export 스냅샷과 전달 확인할 편집 집합은 구분한다.
- 전달 확인은 raw SQL 한 문장이다 — `UPDATE "Translation" t SET "pendingEditToken" = NULL FROM (VALUES (id, token), …) v WHERE t.id = v.id AND t."pendingEditToken" = v.token AND <활성 조인>`.
  Prisma `updateMany`로는 `(id, token)` 쌍 조건이 안 된다. 새 저장은 다른 토큰이므로 남는다. orphan 셀은 writer 경고 여부와 무관하게 전달 확인에서 제외하며
  값·저자·남아 있는 토큰을 이 경로에서 바꾸지 않는다. **선조회한 해제 대상을 순수 함수로 고른 뒤 무조건 UPDATE하는 구현은 금지한다** — 조건부 UPDATE가 방어선이다.
- strict 적재는 실제 덮인 해당 표면 셀의 토큰을 정리한다. 실패/미적용 파일의 토큰은 보존한다.
  pending이 있으면 자동 적재는 금지되므로, 정리가 일어나는 것은 수동 폐기 승인 또는 pending 0일 때뿐이다.
- writer 경고가 있으면 GitHub 쓰기 전에 전체 중단한다. 셀별 부분 전달 추적은 만들지 않는다.
  ⚠️ **이것은 `lib/pull/trigger.ts:58-62`가 물리친 정책의 반전이다** — 그 주석은 "`missingOriginal` 같은 **지속 상태** 경고에서
  매일 밤 트리·blob 전량 읽기가 영구화된다"를 근거로 들었다. 이번에는 1층 스킵이 토큰으로 옮겨가 pending 0이면 GitHub을 안 부르고,
  pending이 있는 채 경고로 멈춘 프로젝트는 사람이 Publish 모달에서 경고를 보고 해소할 때까지 매 밤 읽기가 반복된다.
  **그 반복을 대가로 수용하고, T14에서 `trigger.ts` 주석을 갱신한다.**
- 렌더 결과가 base와 동일하면(`skipped/no-changes`) 캡처 편집을 전달 확인한다. **이것은 §5.6.35(미리보기 조회 값)의 확장이 아니라 기존 2층의 토큰판이다** —
  오늘도 2층의 blob SHA 동일은 `saveLastPulledAt`을 전진시킨다(`lib/pull/run.ts:193`, ARCHITECTURE §3 "변경 없는 스킵에도 전진"). 값을 고르지 않고 no-op을 탐지할 뿐이다.
  이 경로를 없애면 원복한 편집이 영영 pending이라 CI가 영구 보류된다 — 없애지 않는다.

토큰은 동시 공동 편집 기능이 아니다. 전송 응답이 늦게 도착해 새 저장까지 전달 처리하는 경합을 막는 식별자다.
**DB 조건부 UPDATE가 토큰 판정의 실제 방어선이다.**

### 인덱스

새 술어는 기존 `updatedAt > lastPulledAt` 범위 조건이 사라져, `Translation`의 기존 인덱스 넷
(`[projectId, surfaceId, localeCode, needsReview]` · `[projectId, surfaceId, updatedAt]` · `[projectId, localeCode, needsReview]` · `[projectId, updatedAt]`)
어느 것도 토큰 축을 덮지 않는다.

- **1순위 후보는 일반 복합 `@@index([projectId, pendingEditToken])`이다.** btree는 `IS NOT NULL`을 스캔 조건으로 쓰므로 프로젝트 파티션의 non-null 구간만 읽는다.
  Prisma schema로 표현되고 스키마↔DB 드리프트가 없다. 리포에 `WHERE` 인덱스 선례는 0건이고 §5.6.1이 명시 거부했다(`docs/ARCHITECTURE.md:1121-1122`).
- partial index(`WHERE "pendingEditToken" IS NOT NULL`)는 1순위가 Seq Scan을 남길 때만 고려한다. 그때는 마이그레이션 SQL 수기이고 §5.6.1의 거부 이유를 감수해야 하므로
  **감수 근거와 EXPLAIN 결과를 T14에서 ARCHITECTURE에 남긴다.**
- 판정은 T3의 EXPLAIN(수동)으로 한다. `[projectId, updatedAt]`은 주석(`schema.prisma:290-294`)이 "pull 1층 전용"인데 전환 뒤 소비자가 backfill 술어뿐이다 — 거취를 같은 EXPLAIN에서 정한다.

## 3. 프로젝트 전체 자동 적재 판정

순서: 인증 scope → 기존 archived/format/stale-commit 검증 → apply tx(Project `FOR UPDATE`) 안에서 **프로젝트 전체 pending 확인** → `markImportStarted` → 기존 실행권·revision → mutation → **재집계**.
Project → Surface 잠금 순서를 지키고 판정과 적용을 같은 tx에 둔다. **원격 I/O가 없으므로 잠금을 풀었다 다시 잡는 구간이 없다.**

- ⚠️ **`markImportStarted`를 apply tx 안, pending 판정 뒤로 옮긴다.** 지금은 가드 뒤·`applyPush` 앞에서 `lastImportToken`·`lastImportStartedAt`을 쓴다(`app/api/push/route.ts:170-174`).
  그대로 두면 deferred 시점에 표시가 이미 서 있어 안 지우면 300초 "진행 중"이 남고(POSTMORTEM 2026-09-15 1719행의 형), 지우면 컬럼을 쓴다.
  옮기면 §5.5.7이 L3.7로 지목한 "잠금 밖 마커" 결함도 같은 이동으로 닫힌다.
- `apply`: pending 0. strict upsert의 `DO UPDATE`에 `WHERE "pendingEditToken" IS NULL`을 건다(토큰 있는 셀은 건드리지 않는다 — 값을 견주지 않고 "내가 본 상태가 아직 그 상태인가"만 본다, §5.5.7의 `importRevision`과 같은 종류).
  적용 뒤 같은 tx에서 pending을 재집계해 **> 0이면 예외로 롤백 → `deferred`**. 판정과 upsert 사이 밀리초에 커밋된 저장이 여기 걸린다. 적용된 셀의 토큰은 upsert가 NULL로 정리한다.
- `defer`: pending > 0. 키·번역·저자·refs·`declaredBaseLocale`·`Project`·`TranslationSurface` 전부 불변. **어떤 컬럼도 쓰지 않는다** — 진행 표시도 안 선다.
- `fail`: 기존 실패 계약 그대로.
- 보관 프로젝트는 pending과 무관하게 기존 409다 — 가드가 판정보다 먼저다(`route.ts:94`).

**저장 경로에는 잠금이 없다.** `saveTranslation`은 지금처럼 트랜잭션·잠금 없는 순차 쿼리다(`app/(edit)/actions.ts:28-84`) — 토큰 발급 한 컬럼만 는다.
저장이 upsert의 행 잠금을 기다리면 커밋 뒤 자기 값·토큰을 다시 쓰므로 편집은 산다. 대가는 "CI가 0을 센 밀리초 뒤에 들어온 저장"이 재집계로 적재를 되돌리는 것뿐이다.
2026-09-14 "조건 불일치는 0행 갱신"의 무음이 여기서도 서므로 **재집계 예외가 그 무음을 깨는 장치**다 — 재집계 없이 가드만 두는 구현은 금지한다.

**보류 상태를 저장하지 않는다.** "보류 중"은 pending > 0에서 파생된다 — pending이 있으면 다음 CI 요청은 반드시 보류되므로
컬럼이 줄 정보가 없다. 관측 commit·확인 시각·`lastDeferredAt` 컬럼도 두지 않는다. 실제 발생은 Actions 로그가 든다.
역행 검사는 기존 `TranslationSurface.lastCommitAt` 기준을 유지한다. 보류된 요청은 그 값을 전진시키지 않는다.

API: HTTP 200의 닫힌 union `status: "applied" | "deferred"`와 deferred의 `reason: "pending-edits"`, `pendingCount`.
**`PushResponse` 판별 union 타입을 `lib/push/payload.ts`에 세우고 라우트가 그 타입으로 반환한다** — 성공 본문이 지금 인라인 리터럴이라(`route.ts:201-212`) 산문에만 있는 union은 `applied`가 빠져도 컴파일러가 모른다.
deferred는 큐에 넣었다는 의미가 아니므로 202를 쓰지 않는다. 기존 실제 오류는 4xx/5xx 유지.
기존 부분 적재(일부 파일 파싱 실패) 응답 형식은 바꾸지 않는다 — pending 0 경로는 오늘과 같은 계약이다.

CLI(`scripts/push-local.ts:228-236`)는 이미 응답 본문(800자)을 그대로 출력하고 `process.exitCode = res.ok ? 0 : 1`이다. action.yml도 본문을 파싱하지 않는다.
**구 action 태그(`@malmoi-i18n-push-v1`)도 deferred에서 exit 0 + 본문에 `"status":"deferred"`가 찍히므로 안전하다.**
Actions `::warning` 주석과 "imported" 오인 방지 문구는 새 CLI가 필요하며, 그 태그 릴리스는 배포 B와 순서 의존이 없다(T16).
실패 보고 endpoint가 늦게 와도 더 최신 적용 상태를 덮지 않도록 기존 실행 토큰 검사를 유지한다.

## 4. 수동 Sync와 경합

### 4.1 승인 지문

확인 정보는 **서버가 발급한 불투명 지문**이다 — 사용자 id·projectId·`importRevision`·활성 표면/설정·현재 pending 셀의 `(id, token)` 정렬 목록의 sha256 하나.
클라이언트는 그 digest를 되돌려줄 뿐이고 `discard: true`만 믿지 않는다. **HMAC·만료·목적 라벨·`AUTH_SECRET`이 없다** —
서버가 잠금 뒤 같은 지문을 재계산해 `timingSafeEqual`로 대조하는 순간 HMAC이 더해 주는 것은 "이 지문이 서버에서 나왔다"뿐인데, 토큰이 클라이언트에 안 가므로(§2) 지문을 위조할 수 없어 이미 성립한다.
만료는 §4.2의 재사용 규칙(성공·부분 적용·새 편집·설정 변경 뒤 거부)을 하나도 더 막지 못한다 — 그 넷은 전부 지문 변화로 걸린다.
페이로드 크기는 pending 수와 무관하게 상수다.

실행권 획득 tx에서 **Project 잠금 → OWNER 재인가 → 지문 재계산·대조** → 기존 `repositoryImportToken` 획득 순서다.
재검사를 잠금 **뒤**에 두는 이유는 POSTMORTEM 2026-09-13("일회용 연결 요청을 락 전에 읽어 재사용 결과가 달라졌다")이다.

지문은 승인된 편집 집합을 증명할 뿐, 이후 저장을 버릴 포괄 권한이 아니다. **폐기 upsert는 `WHERE t."pendingEditToken" IS NULL OR t."pendingEditToken" = ANY($approved)`다** —
지문 대조와 upsert 사이에 커밋된 저장은 새 토큰이라 살아남는다. 적용 뒤 재집계로 "승인 뒤 남은 편집 N건"을 결과에 싣는다.

### 4.2 경합

- **저장은 어느 실행 중에도 허용한다.** 거부·재시도 UI가 없다. 적재와의 경합은 §3의 가드+재집계(CI)와 승인 집합 조건부 upsert(수동)가 흡수하고, Publish와의 경합은 편집 토큰이 보존한다.
- CI ↔ 수동 Sync: 기존 `importRevision`이 막는다(`lib/import/run.ts:66`). CI ↔ Publish: 토큰이 막는다 — Publish 진행 중이면 pending > 0이라 CI는 `deferred`다.
- **Sync ↔ Publish가 새로 필요한 유일한 교차다.** `planSyncStart`(`lib/sync/plan.ts`)에 `activeImport: { startedAt } | null`, `planRepositoryImport`(`lib/import/plan.ts`)에 `runningSync: { startedAt } | null`
  한 입력씩 더한다. 둘 다 같은 Project `FOR UPDATE` 안에서 읽으므로 일관된다(`lib/sync/run.ts:93`, `lib/import/run.ts:34`). **stale 판정을 하나로 모은다** —
  지금 두 벌이 경계가 다르다(`hasActiveImport`는 `<=`, `planSyncStart`는 `<`: `lib/import/plan.ts:6-8`·`lib/sync/plan.ts:104-106`). 새 통합 함수(`planExecutionLease`)는 만들지 않는다.
- 승인 재사용은 지문 재계산이 전부다. 성공/부분 적용/새 편집/설정 변경 뒤에는 지문이 달라 거부된다.
  아무 데이터도 바뀌지 않은 일시 실패 뒤 같은 상태로 재시도하는 것은 허용된다(같은 지문). 일회용 소비 저장소를 별도로 만들지 않는다.
- 기존 수동 Sync의 표면별 적용/부분 성공은 유지한다. 각 표면의 적용 tx에서 실행권·revision·설정·지문을 다시 확인한다.
- 실패/보류/승인 불일치 모두 자기 실행 표시만 정리하고 캐시를 무효화한다. 다른 실행의 상태를 지우지 않는다.
- Publish는 GitHub I/O 동안 DB 잠금을 유지하지 않는다. stale 실행권의 종료는 기존 제한을 유지하되 외부 쓰기 직전 소유권을 재검사한다. 네트워크 쓰기와 DB를 하나의 원자 트랜잭션으로 보장하지 않는다.
- **같은 요청 안에서 조건부 쓰기 둘을 `Promise.all`로 겹치지 않는다** — POSTMORTEM 2026-09-16의 형이고, "DB 조건부 UPDATE가 실제 방어선"이 그 전제 위에 선다.

**저장 지연**: 저장 경로에 잠금이 없으므로 실측 항목이 없다. (참고: `lib/push/apply.ts:15-18`의 잠금+revision 실측은 cold 743→1716ms, warm 240/242/243→689/677/543ms — CI 경로라 감수한 수치이고 사람 경로에는 들이지 않는다.)

### 4.3 화면

- **`planImportConfirmation({ unsent, openPr })`는 바꾸지 않는다.** `Send changes first`는 Publish 실행이 아니라 번역 화면 링크(`components/home/sync-button.tsx:191-194`)라 숨길 조건이 없고,
  PR 조회 실패는 이미 `openPr === undefined` 삼상태(`prUnknown`)가 든다.
- **Sync Dialog는 문장을 추가하지 않고 교체한다.** `repositorySync.unsent`(`messages/en.tsx:54-56`, `sync-button.tsx:179`)의 `{N edits} that haven't been sent yet will be replaced.`를
  `Sync will discard N unsent translation changes and replace them with repository values.`로 바꾼다. Dialog 설명문(`en.tsx:43-45`)이 이미 `replace`를 쓰므로 같은 사실을 두 번 말하지 않게 이 한 문장만 둔다.
  확정 라벨은 N=0 `Sync from repository` / N>0 `Discard changes and sync`(§6.646 트리거≠확정 접근 이름 유지). 줄 수가 안 늘어 360px Dialog 판정이 없다.
- **EDITOR의 1차 렌더 자리는 번역 화면과 Publish 모달이다.** EDITOR에게는 Sync UI가 통째로 없다(`sync-button.tsx:101`이 `role !== "OWNER"`면 `null`).
- **`EditLossBanner`를 교체한다.** 현재 문구(`en.tsx:1361` `…can be lost when repository changes are imported automatically or with Sync.`)는
  보호가 켜지면 절반이 거짓이 되고, 남은 절반은 안전한 상태에 amber 경고를 띄운다(DESIGN §6.1 "가장 흔한 상태가 가장 조용하다" 위반).
  - 문구: pending > 0이면 `Repository updates are paused until N unsent changes are sent.` `automatically`·`can be lost`를 뺀다. pending 0이면 렌더하지 않는다.
  - variant: `info`. 이 전환은 셋을 같은 커밋에서 뒤집는다 — `components/__tests__/translations-screen.test.ts:160-161`이 `variant="warning"`을 소스로 고정하고,
    DESIGN §6.2 Alert 표가 `info` 소비자 0·`warning` 소비자에 이 배너를 들며, DESIGN §7(1260행)이 "배너 tone이 warning인지"를 규칙으로 적는다. `info`가 0→1로 부활하는 사실을 §6.2에 등재한다(T14).
    색·토큰은 새로 늘지 않는다(`border-border bg-muted/40`, 본문 foreground).
  - **닫기(Dismiss)를 없앤다.** 상시 조건이고 출구가 헤더 20px 위에 있다. 닫기 키를 pending `max(updatedAt)`로 두면 저장마다 키가 바뀌어(`edit-loss-banner.tsx:29,44`의 `sessionStorage === dismissKey` 비교)
    Dismiss가 자기 자신을 무효화한다. DESIGN §6.67 "숨길 수 있는 지역 상태가 없어져 2026-09-14가 원리적으로 안 생긴다"와 같은 형이다. `dismissKey` prop과 `lastPulledAt` 소비가 사라진다.
  - **액션은 둘째 트리거를 만들지 않는다.** Publish 모달의 트리거는 헤더 `PublishButton` 하나이고 `returnFocusRef`·`publishPending` 잠금이 그 자리에 묶여 있다(`components/translations/header.tsx:119-121,144`; `publish-button.tsx:522-525`).
    배너의 액션은 헤더 버튼으로 **포커스 이동**(`Send with Publish ↑`)으로 한정한다.
  - ⚠️ POSTMORTEM 2026-09-14("확인 Dialog의 유일한 논거가 반대 방향으로 거짓")의 재발 방지 grep은 `won't be able|will stop|stops |no longer|until you`이고
    **이 문장(`can be lost`)은 거기 안 걸린다.** T14에서 그 grep 패턴에 `can be lost|automatically`를 더하는 것을 `/postmortem`에 제안한다.
- **Home `To send` 카드의 보조 줄에 갈래 하나를 더한다** — `CardSubline`(`lib/home/cards.ts:34-46`)에 `{ kind: "repositoryUpdatesPaused" }`. pending > 0이면 이 갈래, 문구는 `messages/en.tsx`(`repository updates paused`).
  기존 `pausedCannotSend`·`neverSent`와 같은 형이라 새 패턴이 아니다. 넷째 전폭 배너(`import_failed`·`not_connected`·`archived` 옆)는 두지 않는다 — 상시 상태에 배너를 두면 §6.64 "가장 흔한 화면"의 배너 0개 전제가 깨진다.
  이것이 OWNER가 보류를 아는 화면 자리다. 실제 발생 시각은 화면에 없다(§3).
- 저장 거부 UI는 없다(§4.2). 기존 `SaveResult.error` + `[Retry]` 형(`components/translation-input.tsx:86,153-166`)에 새 갈래를 더하지 않는다.
- 배포 B에서 미전달 카운트가 orphan 제외분만큼 **설명 없이 한 번 줄어든다**(Publish 배지·표면 선택기·Home `To send`·목록 띠·셀 배지).
  실체는 **키가 orphan된 뒤 남은 편집 셀과 로케일이 orphan된 셀**뿐이다 — `unpublishedWhere`는 이미 `surface.archivedAt: null`을 걸고(`lib/keys/unpublished.ts:22`) `archivedAt`은 쓰는 곳이 0이라 항상 null이다.
  값이 줄기만 하는 것은 §6.1의 A 기간 CAS가 `no-changes`까지 덮어야 참이다. "내 편집이 사라졌나"로 읽힐 수 있어 배포 B 노트에 한 줄 남긴다.

## 5. Publish 실행과 전달 확인

pending 0이면 모든 트리거에서 즉시 no-edits. `maxUpdatedAt`만으로 실행 여부를 정하지 않는다.
검사한 base snapshot에 대한 보장만 한다. 쓰기 중 base에 새 commit이 생기는 것은 GitHub PR 검토 영역이다.

- 미리보기는 오늘처럼 base 대비 목록이고 **표시 전용이다**(ARCHITECTURE §5.6.35 유지). 실행 게이트·승인 지문·PR diff는 `publish-pr-handoff` spec이다.
- cron은 새 편집이 있으면 열린 PR도 오늘처럼 갱신한다(D2 철회). 열린 PR 조회 실패의 처리도 오늘 그대로다.
- 수동 Publish의 재사용 branch 강제 갱신은 유지한다. 사용자가 승인한 교체이며 이전 PR 값을 DB로 합치지 않는다.
- 새 편집 없는 cron은 PR 조회/force update/되돌림도 하지 않는다(1층).
- 성공(`committed`) 또는 동등(`skipped/no-changes`) 확인 뒤 캡처 집합을 §2의 조건부 UPDATE로 해제한다.
  **2026-09-09 방어선(변경 0건이어도 sync ref가 base보다 앞서 있으면 base head로 되돌림, `lib/pull/run.ts:174-187`)은 자동 경로에서 그대로 산다** —
  원복한 편집은 pending > 0이라 cron이 1층을 지나 2층에 닿고, 거기서 되돌림과 해제가 함께 일어난다.
- GitHub write 후 DB 전달 기록 실패는 unknown + pending 유지. 재시도는 실제 PR head/내용을 확인하고(`findOpenPr`, `lib/pull/run.ts:213` — 온보딩 Action `checkOpenPullRequest`가 아니다),
  같은 결과가 이미 전달됐으면 확인 후 해제한다. '보냈을 수도 있음'을 '아직 보내지 않음'으로 단정하지 않는다.
- writer 경고 사전 중단은 §2. 기존 `Warnings` 갈래에 "보내지 않았다"를 더한다 — 새 모달 갈래는 없다.

## 6. 스키마·배포

**additive**, 컬럼 삭제 없음.

| 대상 | 추가 | 의미 |
|---|---|---|
| Translation | `pendingEditToken String?` | 아직 전달 확인되지 않은 마지막 편집 |
| Translation | `@@index([projectId, pendingEditToken])`(§2 EXPLAIN 판정에 따라 partial로 대체 가능) | pending 술어 |

### 6.1 배포 — 운영 차단 없이 두 번

**drain 절차가 없다.** drain의 유일한 목적은 "옛 writer가 토큰 없이 저장하는 창"을 닫는 것인데,
배포 A가 dual-write하므로 **A의 롤아웃이 끝나면 그 창은 스스로 닫힌다.** 남는 것은 A 이전에 쓰인 편집에 토큰을 채우는 backfill의 멱등성뿐이다.

1. **배포 A (호환):** additive migration + 저장 토큰 dual-write + 기존 Sync 적용 셀 토큰 정리 + **Publish 캡처·CAS 전부**(캡처 `(id, token)` 적재, `committed`·**`skipped/no-changes` 둘 다**에서 조건부 UPDATE).
   사용자 흐름·미전달 판정은 **기존 계약 그대로**다.
   ⚠️ **`no-changes` 경로를 빠뜨리면 B에서 유령 pending이 생긴다** — A 기간 cron은 옛 술어로 돌고, 편집을 원복한 셀은 2층에서 `no-changes`로 끝나며 `lastPulledAt`만 전진한다(`lib/pull/run.ts:159-194`).
   옛 술어는 0인데 dual-write 토큰은 남고, backfill은 토큰을 **더하기만** 하므로 못 지운다. B 전환 순간 그 셀이 pending이 되어 CI가 영구 보류된다. precondition(토큰 IS NULL 검사)에도 안 걸리는 부류라 DB 게이트가 못 잡는다 — T5의 양방향 동등성 단언이 유일한 그물이다.
2. **롤아웃 완료 조건:** 프로덕션 alias 전환 + 가장 긴 `maxDuration`(60초 — `/api/push`와 저장 Action을 부르는 번역 페이지 둘 다 `maxDuration = 60`) 경과.
   Preview는 **로그인이 `dev.mal-moi.com`에서만 되므로** 배포별 URL의 옛 코드는 저장 Action에 도달하지 못한다(CLAUDE.md "로그인은 이 URL에서만 된다").
3. **backfill:** `scripts/backfill-pending-edit-token.ts`. SQL 한 문장이다 — `UPDATE "Translation" SET "pendingEditToken" = gen_random_uuid()::text WHERE <옛 술어 ∧ 활성 셀> AND "pendingEditToken" IS NULL`.
   옛 술어는 `updatedBy IS NOT NULL AND (lastPulledAt IS NULL OR updatedAt > lastPulledAt)`, 활성 셀은 §2 조건이다. **멱등이다.** 0행이 두 번 연속 나올 때까지 반복한다.
   orphan 값·저자는 보존하고 토큰을 새로 만들지 않는다. 이미 dual-write한 토큰은 재발급하지 않는다.
   where 조각은 `lib/protection/`의 빌더 하나로 두어 스크립트·테스트·precondition SQL이 같은 조건을 쓴다(행 단위 boolean 순수 함수가 아니다 — JS로 행을 끌어오지 않는다).
   **prod 실행**: `scripts/`는 `DATABASE_URL`(런타임 pooler)을 읽고 `PRISMA_TARGET`은 `prisma.config.ts`에만 작용한다. prod는 **명령 한 줄에서 `DATABASE_URL`을 prod pooler로 넘긴다** — 값은 사람이 붙이고 `.env.local`은 편집하지 않는다. 절차는 OPERATIONS(T14).
4. **배포 B (보호):** B 커밋에 **precondition 전용 마이그레이션**을 하나 둔다 — 스키마 변경 없이
   `DO $$ … IF EXISTS (옛 술어 ∧ 활성 셀 ∧ token IS NULL) THEN RAISE EXCEPTION 'precondition failed' … $$`.
   선례는 `prisma/migrations/20260914070000_finalize_translation_surfaces/migration.sql`이다.
   `pnpm db:deploy`가 이 조건을 **DB에서 강제**하므로 backfill을 빠뜨리면 `/merge` 1단계에서 멈춘다. 사람의 체크리스트에 기대지 않는다.
   ⚠️ **실패한 마이그레이션은 `_prisma_migrations`에 미완료로 남아 다음 `db:deploy`가 P3009로 막힌다.** 복구는 `PRISMA_TARGET=prod prisma migrate resolve --rolled-back <name>` → backfill 재실행 → `db:deploy` 재시도다
   (OPERATIONS §3이 같은 절차를 적어 뒀다: 전부 롤백된 것을 확인한 경우에만, 체크섬 수정·무조건 applied·DB reset 금지). dev도 같다 — `migrate dev`가 리셋을 제안하면 거부하고 `resolve`로 간다.
   B는 §3 보류 게이트·§2 새 술어·§4 승인 UI·§4.3 화면을 함께 배포한다.

A→B 사이에는 A가 계속 돌며 새 저장에 토큰을 쓴다. B 직전 precondition이 실패하면 위 복구 절차로 backfill을 다시 돌리고 재시도한다 — **편집을 버리거나 pending을 비우지 않는다.**
B 실패로 A로 복귀해도 A는 기존 정책이고 토큰 dual-write는 계속되므로 재전환 시 precondition만 다시 통과하면 된다.

브랜치 흐름(`main`/`dev` 두 개, `/merge`가 squash 후 `/sync`로 dev를 main에 맞춘다)상 A와 B는 **별도의 `/merge`**다:
A `/push` → dev backfill → A `/merge`(prod `db:deploy`) → prod backfill → B `/push`(dev precondition 통과 확인) → B `/merge`(prod precondition이 게이트).

새 환경변수·`AUTH_SECRET` 영향은 없다. `.env.local`은 읽거나 편집하지 않는다.

## 7. 순수 함수 — `/tdd interface` 대상

**위치는 새 잎 디렉터리 `lib/protection/`이다**(`server-only` 없음). 소비자가 `lib/import`·`lib/sync`·`lib/pull`·`components/`·`scripts/`로 갈려 한 소유자가 필요하고, `client-graph.test.ts`·T15 뮤테이션 파일 목록이 한 곳에서 닫힌다.
기존 함수의 입력 확장은 제자리다.

| 함수 | 위치 | 입력 → 출력 | 필수 반례 |
|---|---|---|---|
| `planProtectedImport` | `lib/protection/` | pending 수/mode(auto·manual)/승인 대조 결과 → apply/defer/reject | pending 1 + 자동 → defer (apply 금지), 수동 승인 불일치 → reject, 승인 일치 → apply |
| `planProtectedPublish` | `lib/protection/` | pending/trigger/writer 경고 → proceed/skip/reject | pending 0 → skip(GitHub 0회), 경고 → reject |
| `planDiscardConfirmation` | `lib/protection/` | 승인 지문/현재 지문/인가 → proceed/reconfirm/reject | 같은 건수 다른 편집(지문 불일치) → reconfirm, EDITOR → reject, 설정 변경 → reconfirm |
| `planSyncProtectionView` | `lib/protection/` | pending 수/역할 → 문구·액션·**출구** | EDITOR에 Sync CTA 없음, **출구 필드가 비면 red**, pending 0 → 배너 없음 |
| `pendingWhere` | `lib/protection/` | projectId(·surfaceId) → where 조각(토큰 술어) | orphan 키/로케일·보관 표면 제외 — ①③④⑤와 ②가 같은 행 |
| `backfillWhere` | `lib/protection/` | projectId/`lastPulledAt` → where 조각(옛 술어 ∧ 활성 ∧ token IS NULL) | orphan 제외, `lastPulledAt` null, 토큰 있으면 제외 |
| `planSyncStart` (입력 추가) | `lib/sync/plan.ts` | 기존 + `activeImport` → 기존 union | 활성 import → busy, stale import → proceed |
| `planRepositoryImport` (입력 추가) | `lib/import/plan.ts` | 기존 + `runningSync` → 기존 union | 진행 중 Publish → busy, stale → proceed; stale 경계가 `planSyncStart`와 같음 |

`shouldSkipPull(unpublished: number)`은 그대로다. 전달 확인 대상을 고르는 순수 함수(`pendingEditIdsToAcknowledge`)는 두지 않는다 — 결과를 믿지 않을 함수는 테스트용 장식이고, 해제는 §2의 조건부 UPDATE 한 문장이다.
지문 계산(sha256)은 `lib/protection/fingerprint.ts`로 분리해 crypto가 client-safe 판정 모듈에 섞이지 않게 한다.
**DB 조건부 UPDATE가 토큰 판정의 실제 방어선이다.**

## 8. 불변식 영향과 회고 근거

- 값 소유권/병합: **자동 Sync 판정은 리포를 보지 않는다.** DB 값과 리포 값의 승자를 고르는 코드가 없다. 적용 허용 시 strict 유지. 2층 동등 확인은 기존 no-op 탐지의 토큰판이다.
- 결정성/blob SHA: writer 불변. 어댑터 코드를 건드리지 않는다.
- 키 보존: 보류 중 키를 갱신하지 않으며 적용 시 기존 orphan 정책 유지. **§0 불변식 1("소스 키 존재 여부는 리포가 정본")은 보류 중 유예된다** — T14에서 그 문장에 단서를 단다.
- 인가: projectId → surfaceId, OWNER 폐기, EDITOR Publish 유지. installation 토큰만 GitHub 쓰기에 사용. `/api/push`는 GitHub 자격증명을 새로 쓰지 않는다.
- 결과 전달: 보류는 성공으로 접지 않고, 화면에서 적재 시각과 보류를 혼동하지 않는다.
- 표시 전용 미리보기(§5.6.35): **유지.** 넓히지 않는다.

| POSTMORTEM 항목 | 이번 방어선 |
|---|---|
| 2026-08-31 외부 계약 페이로드 필수 필드 누락 | 페이로드 스키마 무변경. 응답은 이름 있는 `PushResponse` union |
| 2026-09-07 revalidatePath가 결과를 씻음 | 결과 호스트 유지, refresh 뒤 유지를 `/bugshot-qa`로 실물 확인 |
| 2026-09-09 일회용 허가의 조기 소비 | 동일 확인 경로가 base 선언/폐기 허가를 임의 소비하지 않음 |
| 2026-09-09 되돌린 편집이 PR에 남음 | 자동 경로 방어선 유지(§5) + 사용자 승인 재Publish의 no-change 정리 유지 |
| 2026-09-13 일회용 연결 요청을 락 전에 읽음 | 지문 재계산을 Project 잠금 뒤에 둠 (§4.1) |
| 2026-09-13 임포트 종료 소유권 누락 | 적용·결과·표시 정리의 토큰 조건과 캐시 검증 |
| 2026-09-14 확인 Dialog의 논거가 반대로 거짓 | `EditLossBanner` 교체 + 재발 방지 grep 패턴 확장 제안 (§4.3) |
| 2026-09-14 방어선 셋 다 지워도 green | 모든 "0회" 단언에 같은 픽스처의 N>0 양성 대조 + 조건부 UPDATE·재집계 뮤테이션 (T15) |
| 2026-09-14 조건 불일치는 0행 갱신(무음) | CI 재집계 예외 (§3) |
| 2026-09-15 설정 변경 뒤 진행 표시 잔류 | `markImportStarted`를 판정 뒤로 (§3); 거부 경로에도 자기 실행권 정리 |
| 2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셈 | 토큰을 쓰는 자리 전수: 저장·Sync 적용·Publish CAS(committed·no-changes)·backfill. §1의 사본·`lastPulledAt` 소비자 표 |
| 2026-09-15 정상 빈 카탈로그 오판 | 적재 경로 무변경(pending 0이면 기존 그대로) |
| 2026-09-15 시안 없이 만든 화면이 네 곳에서 어긋남 | 새 화면 없음 — 배너·카드 갈래·Dialog 문구는 기존 프리미티브의 갈래 |
| 2026-09-16 부분 실패를 미완료로 표현 | 수동 Sync 결과에 "승인 뒤 남은 편집 N건" 분리 표시 |
| 2026-09-16 같은 요청의 `Promise.all`이 조건부 쓰기 전제를 깸 | 조건부 쓰기 직렬화 (§4.2) |
| 2026-09-17 merge commit 루프 마커 | strict 창 자체를 보류로 닫음; T17이 `--merge` 머지를 밟음 |

## 9. 남는 한계

- **거친 보류의 대가**: 미전달 편집이 남아 있는 동안 리포의 새 키·삭제·로케일 추가가 앱에 안 들어온다. 편집자가 Publish하거나 OWNER가 폐기해야 풀린다.
- **writer 경고 지속 상태**: pending이 있고 경고로 멈춘 프로젝트는 해소될 때까지 매 밤 트리·blob을 읽는다(§2).
- **orphan 셀의 잔존 토큰 부활**: 폐기 승인 Sync가 키를 orphan시키면 그 셀 토큰은 남고(payload에 없어 안 덮인다) 술어가 제외한다. 나중 push가 키를 되살리되 그 로케일 값을 `""`로 보내면(`applyPush`의 빈값 필터) 셀은 안 덮이고 옛 토큰이 pending으로 부활한다. 드물고 손실이 아니다(보류만 생긴다) — unorphan 시 토큰 정리는 빈값 셀 spec과 함께 본다.
- 리포와 앱이 같은 번역을 수정했을 때 자동 해소는 없다. 보류 요청은 저장해 재생하지 않는다.
- 권한 있는 push 토큰의 악용, 외부 GitHub/DB 간 exactly-once, 사람의 PR 수정 보호는 보장 범위가 아니다.
- PR 전달 → Sync → 새 편집 → 재Publish가 이전 PR 내용을 교체하는 것을 사람이 검토하는 화면은 없다(`publish-pr-handoff`).
- 빈값·누락 셀의 strict 보완은 별도 spec이다. 그 전까지 수동 폐기 승인은 "리포에 있는 값으로 교체"이며, 리포에 없는 셀의 앱 값은 남는다.
