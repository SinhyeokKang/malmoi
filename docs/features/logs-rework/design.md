# logs-rework — 기술 설계

## 0. 영향 받는 흐름

**셋 다 닿는다** — 이 기능의 크기가 여기서 나온다.

| 흐름 | 무엇이 바뀌나 |
|---|---|
| **push**(CI 적재) | `/api/push`·`/api/push/failure`가 적재 실행 사건을 **관측 기반으로** 남긴다. 적재 자체의 계약(strict 적재 · 보류)은 **건드리지 않는다** |
| **편집 UI** | 번역 저장·멤버·설정·소스 Action이 자기 트랜잭션 안에서 사건을 남긴다. Logs 화면이 통째로 바뀌고 Home 카드가 데이터 원천을 바꾼다 |
| **pull**(Publish·야간) | `runSync`의 종료 지점이 실행 사건을 남긴다. `SyncRun`의 쓰기 경로는 **그대로 둔다** |

⚠️ **코어 설계 원칙과 충돌하지 않는다.** 상태 변경 이벤트는 추가만 되고 실행 이벤트는 종료 시 갱신된다. 번역 값·소스 키의
소유자를 바꾸지 않는다. 머지 로직·충돌 해소·양방향 동기화를 도입하지 않는다.

## 1. 불변식 영향 (ARCHITECTURE §0)

| 불변식 | 영향 | 보존 방법 |
|---|---|---|
| 3 (삭제하지 않는다) | 확장된다 — 사건도 지우지 않는다 | `onDelete: Restrict`(`SyncRun`과 같은 근거). 사용자 삭제는 `SetNull`로 저자만 빈다 |
| 4 (결정성) | **간접 영향** — 같은 DB 상태가 같은 목록을 내야 한다 | 정렬 tie-breaker를 `(occurredAt desc, id desc)`로 고정하고 커서 둘과 **같은 키**로 맞춘다. `localeCompare` 금지(§1.1과 같은 축) |
| 5 (`projectId` 좁힘) | **직접 영향** — 새 테이블·새 조회 | 조회 함수가 `projectId`를 **인자로** 받고 인덱스를 `[projectId, occurredAt, id]` 선두로 둔다. 소스 필터는 그 뒤 사건 당시 `surfaceIds`의 포함 여부 |
| 7 (`ProjectMember`가 권한) | 불변 | 보관 읽기 허용은 **역할이 아니라 상태**의 축이다 |
| 9 (버린 값을 숨기지 않는다) | **강화된다** | `N dropped`가 성공 행에도 붙고, `Deferred`가 보류를 사건으로 남긴다 |
| 10 (경로는 서버가 정한다) | 해당 없음 | 이벤트는 리포에 쓰지 않는다 |
| 판정은 잎 모듈 | **직접 영향** | 결과 어휘·필터 파싱·날짜 그룹은 `lib/events/view.ts`(잎)에, 조회는 `lib/events/query.ts`(`server-only`)에 둔다. POSTMORTEM 2026-09-07의 7.2MB 청크가 이 경계를 안 지켜서 났다 |

## 2. 스키마 — additive 하나

**`/db`가 판정하지만 지금 보이는 것은 전부 additive다**(새 테이블 + 새 enum + nullable 수집 개시 컬럼).
파괴적 스키마 전환은 없다. `SyncRun`의 기존 결과 쓰기는 유지하며 새 이벤트는 이를 참조한다.
스키마 호환성과 별개로 **배포 후 보충 백필과 CI 생산자 전환 순서**는 필요하다.

```prisma
model ProjectEvent {
  id         String    @id @default(cuid())
  /// 공개 참조(`?event=`·[Copy reference]). 형식은 /tdd에서 고정한다.
  ref        String    @unique
  projectId  String
  kind       EventKind
  /// 하위 종류. **앱 층 어휘라 enum이 아니다** — `SyncRun.errorCode`와 같은 근거(코드가 늘 때마다
  /// 마이그레이션을 요구하면 "던지는 자리가 코드를 든다"는 규칙이 배포에 묶인다). 읽는 쪽이 폴백을 든다.
  subtype    String
  occurredAt DateTime  @default(now())
  /// Import 실행만. Publish의 종료·결과는 SyncRun에서 읽고 비실행 사건은 이 컬럼을 안 쓴다.
  finishedAt DateTime?
  /// Import 및 선행 거부의 결과. SyncRun에 연결된 Publish와 비실행 사건은 null이다.
  result     String?
  actorKind  ActorKind
  /// FK(SetNull) — 사용자가 지워져도 사건은 남고 저자만 빈다. **번역 사건도 세션의 User.id를 쓴다**:
  /// malmoi#3의 핸들 혼입은 `Translation.updatedBy`에만 남기고 이 컬럼으로 번지지 않게 한다.
  actorUserId String?
  /// 사건 당시 대상 소스. 단일 소스도 배열 한 벌로 표현하고 실행 행을 소스별로 복제하지 않는다.
  surfaceIds String[]  @default([])
  /// sources / project-wide / not-recorded. 백필의 미수집 소스를 프로젝트 전역으로 오인하지 않는다.
  surfaceScope String
  /// 기존 Publish 실행과의 연결 — **복제가 아니라 참조**(결정 1).
  syncRunId  String?
  /// 종류별 맥락. ⚠️ **남이 정한 키로 조회하면 `Object.hasOwn`** (CLAUDE.md) — 번역 키가 payload에 들어간다.
  /// 전후 값은 **전문 그대로** 들어간다 — 상한은 이미 양쪽 10,000자다.
  payload    Json
  /// 검색 대상(키·경로·대상 이름·참조)을 이어 붙인 값. **조립은 `buildSearchText` 하나가 독점한다** —
  /// payload 형태가 바뀌어도 검색이 조용히 안 깨지게 하는 것이 요지다.
  searchText String?
  /// 멱등 키. 내부 실행 식별자 또는 CI executionId에 서버가 실행 종류·소스 범위를 붙인다(§3.3).
  runToken   String?
  ...
  @@unique([projectId, runToken])
  @@unique([projectId, syncRunId])
  @@index([projectId, occurredAt, id])
}
```

**기존 `SyncRun`은 백필하되 값을 복제하지 않는다**(결정 1) — 마이그레이션이 실행마다 `ProjectEvent`
행 하나(`kind: PUBLISH`, `syncRunId` FK)를 만들고, 결과·파일 수·PR·warnings는 **조회가 조인해서 읽는다.**
`SyncRun`이 계속 그 값들의 정본이라 `RUNNING` 행이 나중에 닫혀도 두 곳이 갈릴 수 없다.

백필은 `occurredAt = SyncRun.startedAt`, 동일 실행의 결정적 참조와 `runToken`을 사용한다.
`syncRunId`는 같은 프로젝트의 실행만 참조하도록 복합 FK로 묶고 필요한 참조측 복합 unique도 추가한다.
재실행 시 이미 있는 이벤트를 덮지 않는다. 마이그레이션 이후 구버전 앱이 만든 실행을 놓치지 않도록
**새 writer 배포·구 writer 종료 확인 뒤 보충 백필**을 실행한다. 단순 건수 비교가 아니라 프로젝트별
실행→이벤트 누락 0건·중복 0건·잘못된 연결 0건을 확인한다. 백필은 실행 결과를 갱신하지 않는다.

`Project.activityCoverageStartedAt DateTime?`를 추가한다. 기존 프로젝트는 구 writer가 더 쓰지 않는
시점이 확인된 뒤 실제 전환 시각을 한 번 기록하고 보충 백필을 완료한다. 신규 프로젝트는 생성 tx에서
기록한다. 전환 시각을 입증할 수 없으면 null을 유지해 경계선을 숨긴다. 재백필로 이 시각을 바꾸지 않는다.

**보존 기간에 따른 이벤트 행 삭제 경로는 만들지 않는다**(결정 6). 계정 삭제에 따른 개인정보 정리는
별도 계약이며, 화면도 이벤트 보존 기간을 약속하지 않는다.
남은 것은 `payload`의 종류별 형태 하나이고, `/tdd`가 순수 함수의 입력 타입으로 고정한다.

**소스 필터는 사건 당시 대상 집합을 본다**(리뷰 결정 14).

- 번역·단일 소스 변경·CI는 `surfaceIds` 한 개, 다중 소스 Sync·Publish·최초 적재는 실행이 잡은
  대상 소스 전부를 저장한다. 정렬·중복 제거한 ID 집합이며 쓰기 전에 모두 같은 `projectId`에 속하는지
  확인한다. 이후 새 소스를 추가해도 과거 실행의 집합은 바뀌지 않는다.
- `surfaceScope: sources`는 비어 있지 않은 집합, 멤버·프로젝트 설정 같은 `project-wide`는 빈 집합이다.
  백필 Publish는 과거 대상 소스를 알 수 없으므로 `not-recorded`와 빈 집합을 쓴다. 현재 프로젝트의
  소스 목록으로 과거를 채우지 않고, 전체 목록에 남기되 특정 소스·Project-wide 필터에는 넣지 않는다.
- 조회는 인가된 `projectId` 아래 `surfaceIds: { has: selectedSurfaceId }`로 좁힌다. A·B를 처리한
  실행은 A 필터와 B 필터에 각각 한 번 나오고 C 필터에는 없다. 배열은 소스별 이벤트 복제를 대신하는
  검색용 대상 집합이며, 실제 결과는 종류별 payload 또는 정본 `SyncRun`에서 읽는다.
- 상세는 **기록된** 소스별 결과만 표시한다. Publish의 파일 수·PR·warnings는 기존처럼 실행 전체 값으로
  조인하며 소스별로 나누어 추정하지 않는다. Publish 실행에서 관측할 수 있는 소스별 결과는 payload에
  별도로 명시하고, 수집하지 못한 결과는 `Not recorded`로 표시한다.

⚠️ **`prisma/__tests__/schema-contract.test.ts`가 enum 값 목록을 고정한다** — 새 enum 둘도 같은 형으로 건다.

## 3. 적재 지점 — 이 설계의 핵심 산출물

**두 부류를 섞지 않는다**: 상태 변경은 **원자적**(같은 트랜잭션), 외부 실행은 **관측 기반**(서버가 본 사실만).

### 3.1 상태 변경 — 변경과 같은 트랜잭션

| 종류 | 파일·함수 | 언제 | 필요한 맥락 |
|---|---|---|---|
| Translations | `app/(edit)/actions.ts` `saveTranslation`(쓰기) · `lib/keys/save.ts` `planSave`(순수 판정) | **잠금 뒤 읽은 현재 값과 저장 값이 달라 실제로 갱신했을 때만** | surfaceId · key · locale · before/after · 행위자 |
| Members | `app/(edit)/projects/actions.ts` `createInvitation`·`revokeInvitation`·`changeMember` · `app/invite/actions.ts` `acceptInvitation` | 각 Action의 쓰기와 함께 | 대상(마스킹 라벨) · 역할 전후 · 효과 |
| Project settings | `settings/actions.ts` `updateProjectName`·`updateRepositorySettings`·`uploadProjectImage`·`deleteProjectImage`·`connectRepository` · `projects/actions.ts` `rotatePushToken`·`archiveProject`·`unarchiveProject` | 같은 트랜잭션 | 이름 전후 · 이미지는 사실만 · **토큰은 발급/교체 사실만(값·해시 금지)** |
| Sources & locales | `projects/actions.ts` `addSurfaces` → `lib/surfaces/create.ts` `addSurfacesFromSnapshot` · `createProject` · `projects/[slug]/surfaces/[surfaceSlug]/locales/actions.ts` `updateBaseLocale` | 실제 쓰기 트랜잭션 | 소스 slug · 어댑터 · base 전후 |

⚠️ **프로젝트 생성은 사건 셋이다**(결정 13) — 생성 1 + **소스당** 1 + 최초 적재 실행 1. 한 줄로 접으면
나중에 추가한 소스가 **같은 일인데 다른 모양**으로 남고, 소스 필터가 그 한 줄을 어디에 넣을지 애매해진다.
로케일·키는 독립 행을 만들지 않고 **적재 실행의 집계**로만 남는다.

- ⚠️ **`acceptInvitation`과 가입을 중복 사건으로 만들지 않는다.**
- ⚠️ **no-op과 검증 오류는 사건이 아니다** — 값이 그대로면 쓰지 않는다.
- ⚠️ **실패 시 롤백 범위가 변경과 같다** — 이벤트만 남고 변경이 없는 조합이 생기면 이력이 거짓이 된다.

**번역 저장의 원자성 보완 (2026-09-20 리뷰 반영)**

현재 `saveTranslation`은 트랜잭션 밖에서 조회한 뒤 무조건 `upsert`한다. 기존 CAS에 사건을 붙이는
구조가 아니다. `pendingEditToken`의 전달 확인 CAS와 번역 저장을 혼동하지 않는다.

- 인가된 `projectId`의 **Project 행 → TranslationSurface 행** 순서로 잠근다. CI 적재·수동 Sync의
  잠금 순서와 맞추며, 번역 행이 아직 없어도 같은 셀의 최초 저장을 직렬화한다.
- 같은 트랜잭션에서 키·로케일의 소속과 활성 여부를 확인하고 현재 번역을 읽은 뒤 `planSave`를
  호출한다. no-op이면 번역·편집 토큰·이벤트를 쓰지 않는다.
- 변경이면 번역 저장과 새 `pendingEditToken` 발급, 잠금 뒤 읽은 값의 before/after 이벤트를 함께
  확정한다. 어느 쓰기가 실패해도 모두 롤백한다. 캐시 무효화는 커밋 뒤에만 수행한다.
- 나중 저장이 최종 값이 되는 현재 동작을 유지한다. 클라이언트 버전 비교나 충돌 거부 UI를 추가하지
  않는다. 같은 프로젝트의 저장이 짧게 직렬화되는 대가가 있으며, 잠금 안에서 외부 API를 호출하지 않는다.
- Postgres에서 `A→B`와 `B→C`의 연속성, 같은 값 동시 저장의 사건 한 건, 최초 저장 경합,
  이벤트 INSERT 실패 시 값·편집 토큰·사건의 전체 롤백을 검증한다. 상태 변경의 다른 계열도
  이벤트 기록 실패를 주입해 실제 변경이 함께 롤백되는지 확인한다.

### 3.2 외부 실행 — 관측된 종료 지점

| 종류 | 파일·함수 | 확정 지점 | 결과 |
|---|---|---|---|
| Imports (CI) | `app/api/push/route.ts` → `lib/push/apply.ts` `applyProtectedPush` | 응답을 내기 직전 | `Imported` / `Deferred` / `Not started`(가드 거부) |
| Imports (수동 Sync) | `projects/actions.ts` `runRepositoryImport` → `lib/import/run.ts` `runRepositoryImportFromReader` | `acquire`의 lease 획득과 시작 기록, `finishSurface` 결과를 모아 종료 | `Imported` / `Partially completed` / `Superseded` / `Failed` |
| Imports (최초 적재) | `projects/actions.ts` `runFirstIngest` | 같은 형 | 같은 어휘 |
| Imports (보고된 실패) | `app/api/push/failure/route.ts` → `recordReportedFailure` | 보고 수신 | `Failed`. ⚠️ **적재 상태는 그대로 둔다**(`lastCommitSha`를 전진시키지 않는 기존 계약) |
| Publish | `lib/sync/run.ts` `runSync` | `startRun`의 SyncRun 생성 tx에서 이벤트 참조 생성. 결과는 SyncRun 조인 | 기존 넷 |
| Publish 선행 거부 | `app/(edit)/actions.ts` `triggerPullAction` | 인가된 `archived`·`not-ready` 반환 지점. 세션·멤버십 거부는 기록하지 않음 | `Not started` |

- ⚠️ **서버가 보지 못한 실패를 사건으로 만들지 않는다.** 네트워크가 끊겨 응답이 안 닿은 것은 관측이 아니다.
- ⚠️ **실행은 행 하나다**(결정 12) — 내부 Import는 시작에 `INSERT`(`result: null`), 종료에 같은 행을 갱신한다.
  Publish는 시작에 참조만 만들고 결과는 SyncRun 조인으로 읽는다. CI·실패 보고·선행 거부는 종료 행을 기록한다.
  내부 실행은 `SyncRun.id`·import lease token을 쓰고, CI는 §3.3의 생산자 식별자를 쓴다.
  서버가 범위를 붙인 `runToken`과 `@@unique([projectId, runToken])`이 이벤트 중복을 DB 층에서 막는다.
- ⚠️ **`Not started`는 여섯뿐이다**(결정 7 — spec §6.1): `archived` · `not-ready` · `stale-commit` ·
  `format-mismatch` · `repo-replaced` · `not-installed`. `already-running`·`too-soon`·400 검증 오류·no-op은
  **쓰지 않는다** — `SyncRun`이 그 거부를 행으로 만들지 않는 기존 판정과 같은 근거다.
- ⚠️ **401 요청은 이벤트를 쓰지 않는다.** 최초 인증 실패뿐 아니라 토큰 회전 경합으로 적용 tx가
  `unauthorized`를 반환하는 경로도 있다. 따라서 CI 시작 이벤트를 인증 선조회 직후 넣지 않는다.
  성공 기록은 최종 토큰 확인·적재와 같은 tx에, Deferred·거부·실패 보고는 현재 인증을 재확인하는
  짧은 tx에 둔다. 기존 진행 표시 정리와 이벤트 기록은 별개이며, 401이면 이벤트 0건이다.
- 내부 Import의 모든 반환·예외 경로를 실행 소유 모듈에서 닫는다. `finishImportRun`은 기존 표면 실패
  표시 도구이며 수동 Sync의 집계 종료 함수가 아니다. lease 만료 뒤 다음 실행을 얻을 때 이전 미종료
  이벤트를 `Failed/stale`로 닫는 처리를 같은 잠금 아래 추가한다. 늦은 종료는 자기 runToken과
  미종료 조건을 함께 대조해 이미 닫힌 결과나 다른 실행을 덮지 않는다. 신규 타이머·조회 쓰기는 없다.
- `Superseded`는 관측된 `superseded`·`lease-lost` 사유만 기록한다. 대체 실행 참조를 찾거나 저장하지 않는다.

### 3.3 CI 실행 식별자 — HTTP 재전달까지 중복 방지 (리뷰 확정)

- 정상 push와 `ImportFailureReport`에 UUID 형식의 `executionId`를 추가한다. 생산자
  `scripts/push-local.ts`가 소스별 실행 시작, 즉 파싱·페이로드 조립 **이전**에 한 번 발급한다.
  HTTP 재전달은 같은 값을 유지하고, 새 CLI 호출·워크플로 재실행은 새 값을 발급한다.
  커밋 SHA는 실행 식별자가 아니다 — 같은 커밋을 다시 처리하는 별도 실행을 합치지 않는다.
- `buildPushPayload`는 전달받은 식별자를 싣고 직접 발급하지 않는다. 실패 보고에도 같은 값을
  사용한다. Deferred·가드 거부는 서버 lease 발급 전이어도 이 식별자로 기록할 수 있다.
- 서버는 **인가된 projectId와 확인된 surfaceId** 아래에서 CI 식별자를 사용한다. `runToken`은
  실행 종류와 소스 범위를 구분해 조립한다. 외부 식별자는 인증 증거가 아니며 내부 Publish·수동 Sync의
  식별자와 충돌할 수 없다. 중복 삽입은 unique 충돌로 500을 내지 않고 기존 이벤트로 귀결된다.
- 같은 식별자의 재전달은 사건 시각·행위자·완료된 결과를 덮지 않는다. 동시 요청에서도 사건 한 건과
  일관된 종료만 남는지 검증한다. 이것은 **이벤트 중복 방지** 계약이며 적재 자체의 재실행·응답 캐시를
  새로 구현하는 계약은 아니다. 인증·적재 가드는 매 요청 기존 경계를 유지한다.
- 전환은 **서버가 선택적 필드를 먼저 수용 → 새 생산자 배포** 순서다. 식별자 없는 구 생산자는
  기존 요청을 계속 처리하되 요청별 식별자를 사용하며, HTTP 재전달 중복 방지는 보장하지 않는다.
  외부 불변 Action 태그의 새 릴리스·사용 리포 전환과 함께 이 제한을 `docs/ACTIONS.md`에 명시한다.
  새 생산자를 구 서버에 먼저 연결하지 않는다 — 실패 보고는 `strictObject`라 새 필드를 거부한다.
- 정상·실패·Deferred·가드 거부의 순차/동시 재전달, 같은 커밋의 새 실행, 다른 소스·프로젝트,
  내부 식별자와 같은 UUID, 구 생산자 누락 필드, 잘못된 식별자 입력을 계약 테스트로 고정한다.

## 4. 인가 — 보관 읽기 허용

**판정은 지금처럼 `planProjectAccess` 한 곳에 둔다**(불변식이 아니라 함정 회피다 — 페이지마다
`archivedAt`을 보면 새 화면 하나가 조용히 빠진다).

**추천**: `planProjectAccess`에 `archivedPolicy: "block" | "read"`를 더하고 Logs 페이지만 `"read"`를 준다.
반환은 `{ status: "ok", archived: true }` 형으로 **읽기 허용과 보관 사실을 함께** 싣는다 — 화면이 배너를
그려야 하기 때문이다. 라우트 목록(allowlist)을 access 모듈 안에 두는 안은 **고르지 않는다**: 경로 문자열이
판정 모듈에 들어오면 `lib/routes.ts` 하나라는 생성기 규칙이 깨진다.

- **쓰기의 보관 정책은 바꾸지 않는다** — Server Action은 계속 `getProjectAccess` 기본값(`block`)을 쓴다.
  `requireProjectAccess` → `getProjectAccess` → `planProjectAccess`로 정책을 전달하고 Logs만 `read`를 준다.
  실제 페이지·Action의 전달값도 검증한다. 순수 판정 테스트만으로 호출부 배선을 증명하지 않는다.
- `middleware.ts` matcher는 그대로다(쿠키 이름만 보는 1차 층이라 보관을 모른다).
- ⚠️ **판정 순서를 유지한다** — 권한 부족이 보관보다 앞이다. EDITOR가 보관된 프로젝트의 설정을 열 때
  답은 "권한 없음"이고, 그래야 보관 여부가 권한 없는 사람에게 새지 않는다.

## 5. 조회 — Route Handler를 새로 만들지 않는다

**목록도 상세도 RSC가 그린다**(결정 2). `?event=`가 있으면 **같은 페이지 렌더**가 상세를 함께 낸다.

- 근거: CLAUDE.md의 "내부 쓰기에 Route Handler를 새로 만들지 않는다"의 읽기 쪽 대응물이다. 클라이언트
  fetch를 붙이면 스키마가 두 벌이 되고 로딩·오류 갈래를 손으로 배선해야 한다.
- 대가: 상세를 열 때 페이지 네비게이션이 한 번 돈다. 필터·검색·커서는 URL로 보존하며,
  목록 스크롤은 상세를 여닫는 클라이언트 셸에서 별도로 보존한다. URL이 스크롤까지 저장하지는 않는다.
- **상세 조회는 목록 필터와 독립적이다**(리뷰 결정 15). `loadEvents`는 현재 필터·커서를 그대로,
  `loadEvent`는 인가된 `projectId`와 `ref`만 받는다. 다른 페이지·필터 밖의 사건도 상세로 열되
  배경 목록에 끼워 넣거나 필터를 해제하지 않는다. 필터 결과 0건이어도 상세는 열 수 있다.
- 열기는 현재 경로·쿼리에 `event`만 더하고 닫기는 그것만 뺀다. 직접 URL 진입에서도 임의의
  이전 사이트로 돌아가는 `history.back()`에 의존하지 않는다. 없는 참조·다른 프로젝트의 참조는
  같은 상세 대상 없음 상태이며, 배경 목록과 쿼리를 보존한다.
- Home도 `routes.project(slug, { event })` 생성기와 페이지 수신자를 추가한다. 동일 상세를 Home 위에
  렌더하고 닫으면 Home을 유지한다. Logs로 우회하지 않는다.
- 행에서 열었으면 제목으로 포커스를 옮기고 Dialog 안에 가둔다. 닫을 때 원래 행이 남아 있으면
  그 행으로 복귀한다. 직접 진입·행 부재이면 Logs 제목 또는 Home Recent logs 제목으로 복귀한다.
  상세를 여닫아도 배경 스크롤을 초기화하지 않으며, 뒤로/앞으로 탐색도 브라우저에서 검증한다.
- ⚠️ **의도된 이탈 둘을 문서에 남긴다.** ① 캔버스 `1i`의 "상세 로딩·상세 오류"는 클라이언트 fetch를
  전제하는데, RSC로 가면 그 둘이 라우트 층(Suspense·`error.tsx`)으로 내려간다. ② 기간 필터의
  `Custom range (UTC)`는 **네이티브 `<input type="date">` 둘**이라 피커 모양을 브라우저가 정한다
  (결정 9 — date picker 라이브러리를 넣지 않는다). **근거가 문서에 없으면 `/design-sync`가 이탈로 센다.**

**조회 계약**(`lib/events/query.ts` — `server-only`):

```
loadEvents(prisma, projectId, filter, { limit = 20 }): { rows, nextCursor }
loadEvent(prisma, projectId, ref): EventRow | null
```

- 키셋 페이지네이션 20건, `take: N + 1`로 "다음 페이지가 있나"를 조회 하나로 답한다(기존 관용구).
- 검색은 `projectId`로 좁힌 뒤 `searchText: { contains: q }` **하나**다(결정 3) — 종류가 늘어도 술어가 한 벌이다.
- 행위자 필터의 목록은 **이벤트에 등장한 행위자 distinct**다(결정 8). 계정이 삭제된 행은 `actorUserId`가
  `null`이고 `actorKind = USER`인 경우만 `Removed user`로 접힌다. AUTOMATION·UNKNOWN은 별도 항목이다.
- **원문 이메일을 돌려주지 않는다** — `maskedEmailLabels`를 **목록 전체를 보고** 만든다(행마다 만들면
  같은 도메인의 두 주소가 같은 라벨이 된다). `loadSyncRuns`와 같은 규칙.
- **조회 실패는 all-or-nothing이다**(리뷰 결정 16). 목록·상세 조회를 `try`로 감싸 빈 배열이나
  부분 성공으로 반환하지 않는다. 최초 조회·Refresh·Older·상세 열기 중 어느 조회가 실패해도
  해당 페이지 전체가 공통 오류 경계로 전환된다. 마지막 성공 목록 캐시나 상세 전용 오류 경계는
  만들지 않는다. Home 상세도 같은 원칙으로 Home 페이지 전체 오류가 된다.
- 실패해도 현재 URL의 필터·검색·커서·`event`는 유지하고, 재시도는 그 URL의 조회 전체를 다시 수행한다.
  성공한 조회의 빈 목록·`loadEvent`의 `null`은 오류가 아니며 기존 빈 상태·상세 대상 없음으로 표시한다.
  인증·인가 거부는 기존 차단 경로를 유지하며 조회 재시도로 우회하지 않는다.
- Home은 **같은 함수**를 `limit: 6`으로 부른다. 별도 집계 경로를 만들지 않는다(PRODUCT §7.7 결정 2의
  "같은 수를 두 번 세지 않는다"와 같은 축).

## 6. 순수 함수로 분리 — `/tdd` 진입점

**전부 I/O가 없고, 앞의 다섯은 잎 모듈이라 클라이언트가 읽어도 된다.**

| 함수 | 하는 일 | 왜 순수여야 하나 |
|---|---|---|
| `parseLogFilter(searchParams)` | URL → 필터 객체. 모르는 값·해독 불가는 **던지지 않고** 기본값 | 주소창 값이라 500이 되면 안 된다 |
| `filterChanged(prev, next)` | **커서를 버릴지** 판정 | 조합이 바뀌었는데 커서를 재사용하면 첫 페이지가 비거나 중간부터 시작한다 |
| `eventView(row)` | 행 → 톤·결과 라벨·글리프·문장 조각 | `syncRunView`와 같은 형. `Badge` variant 이름을 그대로 쓴다 |
| `groupByDay(rows, now)` | 날짜 카드 — `Today`/`Yesterday`는 **UTC 기준** | 서버가 만든 `now` 하나를 내린다(행마다 만들면 기준이 흔들린다) |
| `valueState(value)` | `Empty` / `Spaces only (n)` / `Not recorded` / `Unavailable` / `—` | 빈 칸을 만들지 않는 규칙의 유일한 관문 |
| `encodeCursor`/`decodeCursor` | 기존 `lib/sync/view.ts`의 형을 재사용하거나 옮긴다 | 무엇을 받아도 `null` |
| `summarizeImportEvent(results)` | 소스별 결과 → `Imported`/`Partially completed`/`Superseded`/`Failed` | 기존 `summarizeImport`의 결과 어휘 대응물 |
| `planArchivedReason(reasonKey, archived)` | 보관 시 "The next nightly run tries again." 절 제거 | 야간이 보관을 건너뛰므로 그 문장이 거짓이 된다 |
| `buildSearchText(kind, payload)` | 검색 문자열 조립 — **유일한 관문** | 적재 지점마다 다시 짜면 종류 하나가 조용히 검색에서 빠진다 |
| `coverageBoundaryIndex(rows, coverageStart, cursor)` | 수집 공백 경계선이 **몇 번째 행 위**에 서는지 | 현재 필터의 첫 과거 행 위에만 표시. 커서가 이미 수집 이전이면 후속 페이지에 반복하지 않는다 |
| `parseDateRange(from, to)` | 네이티브 date 입력 둘 → UTC 구간. 뒤집힌 범위·잘못된 값은 폴백 | 주소창 값이다 |

## 7. 제거 명세

**지울 것**(내 변경이 만든 고아만 제거한다는 규칙 안이다 — 이 기능이 소비자를 통째로 대체한다):

| 대상 | 무엇 |
|---|---|
| `lib/home/overview.ts` | `RecentEdit` · `ActivityItem` · `RANK` · `ACTIVITY_WINDOW_DAYS` · `ACTIVITY_LIMIT` · `recentActivity` · `compareSame`. **`activeLocaleProgress`는 남는다** |
| `app/(edit)/projects/[slug]/page.tsx` | 활동 조합 쿼리 넷(편집·CI push·마지막 Publish·적재 실패) |
| `components/home/logs-card.tsx` | 타임라인 점 · 첫 항목 파랑. 글리프 28로 **Logs와 같은 모양** |
| `logs/page.tsx` | 표 다섯 열 · `Table`/`Th`/`Td` 소비 · 행마다의 `utcMinute` + 상대 시각 두 줄 · `archived`의 `ProjectArchived` 분기 |
| `messages/en.tsx` | `logs.empty`의 `No syncs yet` · `logs.columns.*` |

**남기는 것**: `syncRunView`·`lib/sync/plan.ts`는 Publish 표현·실행의 소비자가 있으므로 유지한다.
`loadSyncRuns`는 이벤트 조회가 소비자를 대체한 뒤 참조를 확인하고, 이 변경으로 생긴 고아일 때만 제거한다.

## 8. 과거 함정 (POSTMORTEM grep)

| 날짜 | 함정 | 이 기능에서 어디 |
|---|---|---|
| 2026-09-03 | **실패한 조회를 "없음"으로 읽었다** | 조회 오류를 빈 상태로 접지 않는다. 목록·상세 중 하나라도 실패하면 페이지 전체 오류로 전환한다 |
| 2026-09-07 | `revalidatePath`가 **결과 Alert를 언마운트**했다(불변식 9의 "화면에 닿는 것까지") | Home의 이벤트 카드가 Action 결과에 따라 조건부로 사라지지 않는지 본다 |
| 2026-09-07 | 잎 아닌 판정 모듈이 **7.2MB 청크**를 끌고 왔다 | `lib/events/view.ts`를 잎으로 유지. `client-graph.test.ts`가 상시 방어선 |
| 2026-09-09 (sec-audit 4) | 원문 이메일이 RSC 페이로드에 실렸다 | 이벤트 행위자도 **마스킹 라벨만** 돌려준다 |
| 2026-09-09 (sec-audit 1·17) | 남이 정한 키 → 프로토타입 오염 | payload의 번역 키 조회는 `Object.hasOwn`, 대입은 `Object.create(null)` |
| 2026-09-16 | **소비자 수를 세는 테스트**를 스스로 늘리면서 안 고쳤다 | `shell-layout.test.ts`·`table-presets.test.tsx`가 이번에 움직인다 |
| 2026-09-15 | 조건부 렌더가 차단 층이 아니다 | 보관 읽기 허용은 **`planProjectAccess`에서** 갈린다, 화면에서가 아니다 |

## 9. 새 환경변수

**없다.** 수집 시작일은 `Project.activityCoverageStartedAt`에서 읽는다(§2). 가장 이른 이벤트나
마이그레이션 시각으로 추정하지 않으며, null이면 경계선을 그리지 않는다.

## 10. 테스트 영향

| 파일 | 무엇 |
|---|---|
| `lib/events/__tests__/*` **(신규)** | §6의 순수 함수 전부 — `/tdd`의 대상 |
| `app/(edit)/projects/[slug]/logs/**` | 표 → 목록, 필터·검색 파라미터, 커서 무효화, 보관 읽기 |
| `lib/sync/__tests__/view.test.ts` | 기존 Publish 넷·warnings 회귀 유지. 신규 이벤트 라벨은 events 테스트가 검증 |
| `lib/home/__tests__/overview.test.ts` | 활동 조합 제거 |
| `lib/auth/__tests__/access.test.ts` | `archivedPolicy` 갈래 — **읽기 허용이 쓰기 허용이 아님**을 갈래마다 |
| `components/__tests__/client-graph.test.ts` | 새 조회 모듈이 클라이언트 그래프에 안 닿는지 |
| `components/__tests__/table-presets.test.tsx` · `app/(edit)/__tests__/shell-layout.test.ts` | 소비자 수 변화 |
| `app/__tests__/entry-points.test.ts` | `routes.logs(slug, { kind, from, to, actor, source, result, q, cursor, event })` 생성기↔수신자 |
| `lib/i18n/__tests__/no-korean-ui.test.ts` · `brand-spelling.test.ts` | 새 문구 전부 |
| `pnpm test:projects:postgres` **(수동)** | 원자성 · 종류 혼합 정렬 · `projectId` 격리. ⚠️ **`pnpm test` 밖이라 손으로 돌린다** |
| `vitest.projects.config.ts` | 신규 `lib/events/__tests__/*.integration.ts`를 include에 추가. 기존 lib/keys만 실행하는 설정으로는 신규 테스트가 돌지 않는다 |
| `lib/privacy/collected.ts` · 개인정보 등재 테스트 | ProjectEvent 모델·필드 분류와 Project 수집 개시 시각 등재 검토. Prisma 생성 후 typecheck로 누락 확인 |

## 11. 문서 갱신 (구현 시)

- **PRODUCT §7.7 결정 3이 거짓이 된다** — *"`logs`의 데이터 원천은 7단계의 `SyncRun`이다 · Home은 그
  부분집합"*. 결정을 **뒤집은 기록으로** 고쳐 쓴다(지우지 않는다). IA 표의 `/logs` 행 설명도 함께.
- **PRODUCT §3 권한 표**에 "보관된 프로젝트의 Logs 읽기"를 더한다.
- **ARCHITECTURE** — 새 테이블의 계약(원자성 경계 · 관측 기반 · 삭제 없음)과 §5.6.4(보관) 갱신.
- **DESIGN §6.68**(logs)를 새 형으로. 새 raw 색을 늘렸으면 §6.2 등재 — **글리프 칩 색 여덟이 그 대상이다.**
- **DIRECTORY.md** — `lib/events/` 신설.
- **개인정보 등재·방침·OPERATIONS** — 새 행위자·멤버 대상·시각의 수집/보존 설명과 계정 삭제 절차를
  대조한다. `actorUserId SetNull`만으로 payload·searchText의 식별 정보가 지워진다고 가정하지 않는다.
  사람 이름·원문 이메일을 검색 문자열에 복제하지 않고, 저장하는 마스킹 라벨도 분류 대상에 포함한다.
  기존 개인정보 처리 계약에 맞춰 필요한 정리·검색 문자열 재생성 경로를 태스크로 둔다. 이벤트 행의
  자동 삭제나 보존 기간을 새로 정하는 작업은 아니다. 이 검수에서는 정본을 직접 수정하지 않는다.
