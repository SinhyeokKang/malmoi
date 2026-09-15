# Sync repository — design

`spec.md` §7·§8·§12의 사용자 결정을 구현하는 계약이다. 이 문서는 설계이며 코드 변경은 아직 없다.

## 1. 영향 받는 흐름

| 흐름 | 변경 |
|---|---|
| CI push | 적용 트랜잭션 시작부터 공통 행 잠금을 잡고 적재 revision을 증가시킨다. Sync 실행권 때문에 CI를 거부하지 않는다 |
| 수동 Sync | 프로젝트 실행권 → 리포 읽기 → 표면별 경쟁 판정·적용 → 원결과 반환 |
| 첫 적재 | 리포 읽기·준비를 공용 헬퍼로 추출한다. 첫 적재의 0키 실패·인가·readiness 계약은 유지한다 |
| 사용처 | Sync는 기존 `KeyRef`를 보존한다. CI가 다음 적재에서 전체 교체한다 |
| 편집 UI | Action·컴포넌트 연결 계약을 준비한다. Home 배선·실제 UI 검증은 project-home에서 함께 한다 |
| Publish | `SyncRun`·`lastPulledAt`의 의미와 처리 경로는 유지한다 |

## 2. 재사용과 변경 경계

기존 `runFirstIngest`의 `templatePaths` → `readFiles` → `planConfirmedFormat` →
`ingestTargets` → `prepareFirstSnapshot` 경로를 재사용한다. Action에 다운로드·페이로드 조립을 복제하지 않는다.

| 축 | 첫 적재 | 재적재 |
|---|---|---|
| readiness | `awaiting_first_sync` | `ready` |
| 대상 | default surface 하나 | 활성 표면 전부, 실패도 결과에 포함 |
| 이전 base | `null` | 저장된 `surface.baseLocale` |
| 실행권 | 기존 표면 진행 표시 | 프로젝트 실행권 + 표면 진행 표시 |
| 적용 경쟁 | 기존 첫 적재 계약 | 실행 토큰·revision·설정 재검사 |
| 사용처 | 기존 경로의 교체 | 보존 |
| 0키 | 실패 | 정상 빈 카탈로그임을 확인한 경우 성공 |

추출할 때 다음 세 동작과 이유 주석을 유지한다.

1. `attempted`는 성공한 blob 목록이 아니라 스냅샷의 `templatePaths`로 만든다.
2. `attempted ∪ ingestTargets`를 실패 집계의 대상으로 삼는다.
3. 이미 받은 blob은 다시 받지 않고 실패한 대상만 한 번 더 받는다.

## 3. 리포 준비와 저장 경계

### 3.1 공용 입력과 헬퍼

`lib/import/read.ts`로 모듈 사설 `readFiles`·`snapshotError`를 이동한다. `readFiles`에는 성공한
`RepoSnapshot` 전체를 전달한다. `snapshot.files`의 `path`·`sha`·`size`가 다운로드·예산 판정에 필요하며,
경로 목록은 `snapshot.files.map(f => f.path)`로 만든다.

```ts
export type SurfaceImportInput = {
  projectId: string;
  projectSlug: string;
  surface: StoredSurfaceImport; // id, slug, adapter, template, base, nested/nestedByPath
  snapshot: Extract<RepoSnapshot, { status: "ok" }>;
  mode: "first" | "repository";
};
```

`StoredSurfaceImport`는 저장 포맷을 검증한 값이며 정의와 테스트를 T2에서 먼저 추가한다.
`lib/import/surface.ts`(`server-only`)는 reader와 입력을 받아 다운로드·준비 결과를 반환한다.
**GitHub I/O를 DB 트랜잭션 안에서 실행하지 않는다.** 준비 결과와 적용을 나누므로 첫 적재는 기존
`applyPush`를, Sync는 §3.3의 경쟁 검사 뒤 `applyPushInTransaction`을 호출할 수 있다.

준비 결과는 `payload`(기존 비어 있지 않은 push payload), `empty`(§3.5의 증거를 가진 정상 0키),
`failed`를 구분한다. `count === 0`으로 성공 여부를 추측하지 않는다. `first`에서는 `empty`를 기존 실패로
돌리며 새 빈 결과는 서버 내부 계약이다. `buildPushPayload`는 기존 생산자를 재사용한다.

`lib/onboarding/`은 GitHub을 모르는 경계로 유지한다. 새 I/O 모듈을 그 디렉터리에 넣지 않는다.

### 3.2 base 로케일

`previousBaseLocale`은 첫 적재 `null`, 재적재는 저장값을 필수 전달한다.
현재 `planConfirmedFormat`은 입력 base를 그대로 반환하고 없으면 거부한다. 따라서 Sync가 리포에서
새 base를 자동 선택한다고 설명하지 않는다. 선언된 base의 전환은 기존 CI·`checkFormat` 계약을 따른다.
정상 빈 카탈로그도 저장된 base와 포맷이 확인되어야 한다.

### 3.3 프로젝트 실행권과 CI 우선

**실행권과 데이터 적용 잠금을 구분한다.** 프로젝트 실행권은 네트워크를 포함한 전체 Sync 동안
유지하고, DB 행 잠금은 선점·표면 적용·종료의 짧은 트랜잭션에서만 잡는다.

추가 필드는 §7에 있다. `IMPORT_STALE_AFTER_SECONDS = 300`이며 정각은 아직 stale이 아니다.
시작 시각은 서버 시각, 토큰은 매 실행마다 새 UUID다. 같은 밀리초의 두 실행도 다른 토큰을 갖는다.

1. 인가·readiness → 연결·GitHub 정체성 확인 후 짧은 tx에서 Project 행을 `FOR UPDATE`로 잠근다.
   권한·보관·readiness·리포 설정과 활성 표면을 다시 확인한다. 유효한 프로젝트 실행권이나
   활성 표면의 유효한 진행 표시가 있으면 `already-running`; 활성 표면 0이면 `no-surfaces`다.
2. 같은 tx에서 실행 토큰·시작 시각을 저장하고 활성 표면의 `importRevision` 및 설정을 캡처한다.
   오래된 실행권은 교체한다. 포맷이 빠진 표면도 이름·사유를 보고하기 위해 목록에 남긴다.
3. tx 밖에서 reader·snapshot을 각각 한 번 열고 표면별로 준비한다. 표면 진행 표시는
   자기 실행권·revision을 확인한 짧은 tx에서 시작하며, CI의 새 진행 표시를 무조건 덮지 않는다.
4. 각 표면 적용 tx의 **첫 단계**에서 Project → TranslationSurface 순서로 행을 잠근다.
   현재 토큰·유효기간·인가·보관·설정·revision을 재검사한 뒤 준비 결과를 적용한다.
   기존 키 조회와 계획 생성도 이 잠금 뒤이며 같은 tx다.
5. `importRevision !== capturedRevision`이면 **CI 우선**으로 `superseded`를 반환한다. 표면 데이터,
   commit 기준, refs, CI 결과 기록을 수정하지 않는다. 해당 표면만 미적용이며 다른 표면은 계속한다.
6. 토큰이 바뀌거나 stale이면 이전 실행은 이후 쓰기를 하지 못한다. 아직 처리하지 않은 대상도
   `lease-lost` 사유와 함께 반환한다. 종료 시 토큰이 자기 것인 경우에만 실행권을 비운다.

**CI도 같은 적용 잠금에 참여한다.** `applyPush`의 기존 배열형 tx를 짧은 interactive tx로 바꾸고,
`applyPushInTransaction`의 공용 적용 경계가 Project → Surface 잠금을 기존 키 조회보다 먼저 잡도록 한다.
이후 쓰기와 `importRevision` 증가는 같은 tx다. 이미 열린 tx를 받은 경로는 그 tx를 그대로 쓰며
런타임 속성으로 PrismaClient/TransactionClient를 구별하거나 중첩 tx를 열지 않는다.
기존 Add surface·프로젝트 생성 소비자의 잠금 순서와 rollback도 회귀 검사한다.

CI는 프로젝트 실행 토큰을 거부 조건으로 사용하지 않는다. Sync의 네트워크 작업을 기다리지 않고
짧은 데이터 적용 잠금만 공유한다. **revision을 마지막 UPDATE에서 증가시키는 것만으로는 부족하다.**
CI가 먼저 커밋했으면 Sync는 미적용, Sync가 먼저 적용 tx를 완료했으면 이후 CI가 최종 값을 쓴다.
동일 커밋 CI 재실행도 revision이 바뀌므로 commit SHA 비교만으로 대체하지 않는다.

적용 시점에는 캡처한 repo ID·installation·owner/name·base branch·표면 포맷이 같은지도 검사한다.
Project와 Surface 행 잠금을 함께 잡으므로 설정 쓰기와 검사·적용 사이에 빈틈이 없다. 설정 변경이나
보관은 덮지 않고 해당 실행을 거부한다. 오류 매핑은 기존 AccessError/OnboardError를 재사용한다.

**force-push 수용은 유지한다.** Sync 시작 전에 리포가 과거 커밋으로 돌아간 것은 현재 base로 적재한다.
`checkCommitOrder`의 시각 비교로 이 동작을 막지 않는다. 실행 중 CI 적재는 별도의 revision 검사로 보호한다.
CI의 기존 커밋 순서·포맷·보관 판정도 적용 tx에서 최신 행으로 재확인한다.

### 3.4 사용처 보존

`ApplyOptions.refsMode: "replace" | "preserve"`를 필수로 두고 모든 호출부를 명시한다.
기존 CI·첫 적재·Add surface는 `replace`, Sync는 `preserve`다. 공용 적용 함수에서 preserve면
`KeyRef` DELETE·INSERT를 모두 생략한다. DB refs를 조회해 payload로 되쓰는 방식은 쓰지 않는다.
키가 orphaned가 돼도 refs 행은 남는다. 다음 CI는 기존 전체 교체 경로로 갱신한다.
이는 번역 값 병합이 아니며, 수집하지 않은 사용처를 변경하지 않는 것이다.
결과 보조 문구는 기존 사용처가 보존됐으며 다음 CI가 갱신한다는 사실을 알린다.

### 3.5 정상 0키와 실패 구분

현재 `prepareFirstSnapshot`은 0키에 payload를 만들지 않고, 외부 `PushPayload.keys`도 `.min(1)`이다.
**외부 push 스키마는 유지한다.** 서버 내부 준비 결과에만 `empty`를 추가한다.

정상 0키의 필요조건은 다음 모두다.

- 저장된 어댑터·템플릿·base에 해당하는 대상 파일이 스냅샷에 존재한다.
- 대상 다운로드가 모두 성공하고 예산 안에 든다.
- 각 파일을 해당 어댑터가 유효한 카탈로그 컨테이너로 인식하며 파싱 오류가 없다.
- base를 포함해 해당 표면에서 정상적으로 읽힌 소스 키가 0개다.

재탐지기가 빈 컨테이너를 후보에서 빼더라도 무조건 실패하거나 무조건 빈 성공으로 접지 않는다.
저장 포맷을 입력으로 받는 **순수 빈 카탈로그 검증**을 두고 다섯 어댑터의 유효 빈 컨테이너와
잘못된 파일을 대조한다. 파서가 빈 entries를 반환했다는 사실만으로 인식 성공으로 취급하지 않는다.
파일 미발견·읽기 실패·포맷 불일치·base 부재는 `failed`이며 기존 키를 orphan 처리하지 않는다.
로케일 파일 자체를 전부 삭제한 경우도 “정상적으로 읽은 빈 카탈로그”로 추정하지 않는다.

검증된 `empty`는 §3.3의 경쟁 검사 뒤 전용 내부 적용 분기로 **해당 표면 키 전부를 orphaned**로 표시한다.
번역·KeyRef·Locale·저장 포맷을 삭제하거나 임의 재생성하지 않는다. commit 기준·revision·성공 상태는
같은 tx에서 갱신한다. 이 분기는 외부 0키 payload를 허용하거나 `as PushPayload`로 검증을 우회하지 않는다.
기존 비어 있지 않은 payload의 조립·적용 경로는 그대로 재사용한다.

## 4. 순수 판정

### 4.1 `planRepositoryImport` — `lib/import/plan.ts`

입력: `now`, readiness, 확인한 identity, 프로젝트 실행 토큰·시작 시각, 활성·보관 표면과 포맷·진행 시각.
출력: `ok`(실행 대상과 포맷 오류 표면) 또는 `not-ready` / `not-connected` / `repo-replaced` /
`already-running` / `no-surfaces`.

순서는 readiness → identity → running → 대상이다. 포맷 누락 표면을 `invalid-format` 결과로 남기며,
활성 표면 전부가 잘못됐어도 `no-surfaces`로 바꾸지 않고 전부 실패 결과를 반환한다.
이 함수는 원자적 선점을 대신하지 않는다. 저장 경계가 잠금 뒤 다시 판정한다.

### 4.2 `planImportConfirmation` — `lib/import/confirm.ts`

입력: `unsent`, `openPr: { number; url } | null | undefined`.
출력: 같은 위험 신호 + `recommendSend: unsent > 0`, `atRisk: unsent > 0 || openPr !== null`.
`undefined`는 조회 시작과 실패 모두 미확인이다. **성공 응답이 null일 때만** PR 경고를 없앤다.
`atRisk: false`여도 확인 Dialog와 danger 버튼은 유지한다. 수치는 조회 시점의 신호이며,
Dialog가 열린 동안 저장된 편집까지 보호하거나 정확한 덮어쓰기 수를 보장하지 않는다.

### 4.3 `summarizeImport` — `lib/import/result.ts`

`spec.md` §9의 `SurfaceImportResult[]`를 받아 아래 요약을 만든다.

```ts
export type ImportSummary = {
  tone: "success" | "warning" | "danger";
  keys: number;
  imported: number;
  partial: number;
  unreadable: readonly string[];
  superseded: readonly string[];
};
```

`imported`는 정상 0키도 포함한다. tone은 다음 순서로 판정한다.

1. 모든 표면이 imported이면 success.
2. 그 외 imported/partial이 하나라도 있으면 warning (전부 partial인 경우 포함).
3. 적용된 표면 없이 failed가 하나라도 있으면 danger (failed + superseded 포함).
4. CI 우선·실행권 상실로 미적용인 표면만 남으면 warning.

입력 0개는 성공으로 접지 않는다. 활성 표면 0은 게이트에서 no-surfaces로 반환한다.
키 수가 0이라는 이유로 실패로 바꾸지 않는다. 목록 순서는 입력의 안정된 표면 순서(코드 유닛 slug 순)를 유지한다.
오류 표면이 빠져 전체 성공이 되는 갈래는 없다. **원결과를 UI에 함께 전달**하고 reason/errors를 버리지 않는다.

## 5. Server Action 둘

### 5.1 `runRepositoryImport` — `app/(edit)/projects/actions.ts`

```
입력 검증 → 세션 → project:settings → readiness
  → 로컬 연결 확인 → checkRepoAccess (GitHub 정체성 조회)
  → 짧은 tx: 재검사·원자적 실행권 획득·표면 revision 캡처
  → try: reader/snapshot 각 한 번 → 표면별 준비 → 짧은 tx: 경쟁 검사·적용
  → finally: 자기 실행권 해제 · revalidatePath(project layout, projects)
```

공용 reader/snapshot 실패는 기존 OnboardError로 반환하고 자기 진행 표시·실행권을 정리한다.
표면 실패는 개별 결과로 모아 계속한다. 포맷 누락·부분 파싱 실패·CI 우선 미적용의 사유는 구분한다.
실패 기록도 토큰·revision·startedAt을 확인한 저장 경계에서 쓰며, 오래된 실행이 CI 결과를 덮지 않는다.
DB 오류가 나면 일반 실패 값으로 반환하고 내부 오류만 로깅한다. `finally`의 해제 실패가 원래 오류를
가리지 않게 처리하며 프로세스 강제 종료는 stale 회수로 복구한다.

### 5.2 `checkOpenPullRequest`

Dialog가 열릴 때만 호출하며 `project:settings`로 인가한다. `loadOpenPrUrl`을
`lib/projects/open-pr.ts`로 옮겨 설정 화면과 재사용한다. 기존 반환값은 URL 삼상태이므로 Action은
성공 URL에서 검증된 PR 번호를 얻어 `{number,url}`로 변환하고 파싱 실패도 undefined로 반환한다.
기존 설정 화면에는 URL 삼상태를 유지한다. 반환: 객체 / null(조회 성공, 없음) / undefined(미확인).

## 6. 컴포넌트 연결 계약

`sync-button.tsx`는 `ArchiveCard`의 Dialog 패턴을 사용한다. 프리미티브 자체는 고치지 않는다.

- OWNER만 렌더한다. Action 둘도 같은 permission을 검사한다.
- 열릴 때마다 PR 상태를 undefined로 초기화해 즉시 경고한다. 요청 식별자로 이전 응답을 무시한다.
- 실행 중 `loading={pending}`으로 연타를 막는다. 서버 동시성 보장은 §3.3이 맡는다.
- `Send changes first`는 `routes.translations(slug)` 링크다. 발송만으로 편집이 보호됐다고 말하지 않는다.
- 경고 갱신은 `aria-live="polite"`, 성공·warning 결과는 `role="status"`, danger는 `role="alert"`로 알린다.
- 취소·완료 후 Dialog를 닫으면 Sync 트리거로 포커스를 돌린다. 트리거가 사라진 경우 머리의 적절한
  포커스 대상으로 복귀한다. 닫은 뒤 도착한 PR 응답으로 Dialog가 다시 열리지 않는다.
- 결과 상태는 Home 머리가 원결과로 소유한다. `sync-result.tsx`는 요약 tone과 표면별 reason/errors를
  받아 이름·사유를 표시하며 refresh 뒤에도 유지된다.
- 클라이언트는 Action 참조와 타입만 가져온다. 서버 준비·적용 모듈은 번들 그래프에 들어가지 않는다.

**이 기능의 준비 완료와 실제 UI 검증은 다르다.** 시안 확정 후 컴포넌트를 준비하고 project-home T6에서
Home·재시도 버튼에 연결한다. 실제 Dialog·결과·접근성·시안 검증은 project-home에서 함께 완료한다.

## 7. 스키마 — additive 변경

| 새 필드 | 용도 |
|---|---|
| `Project.repositoryImportToken String?` | Sync 실행 소유권. 다른 실행과 stale 실행을 구분 |
| `Project.repositoryImportStartedAt DateTime?` | 실행권 stale 판정. 표면별 진행 표시와 별개 |
| `TranslationSurface.importRevision Int @default(0)` | 성공한 데이터 적재마다 같은 tx에서 증가. CI와 Sync 경쟁 감지 |

기존 행은 token/start null, revision 0으로 시작한다. 신규 테이블·실행 이력·환경변수는 없다.
표면 실패 시각은 project-home의 별도 작업이며 이 기능의 선행조건은 아니다.

마이그레이션 SQL을 검토하고 dev에 적용한 뒤 preview 코드를 배포한다. prod는 `/merge` 전에
`db:deploy`로 넓힌다. **prod 반영을 dev push 시점으로 당기지 않는다.** Codex는 문서·로컬 커밋까지이며
원격 push/merge는 Claude Code가 맡는다. 이번 feature-review는 마이그레이션을 만들거나 적용하지 않는다.

## 8. 불변식·과거 회귀

- **병합 없음**: CI 경쟁 판정은 실행 수락 여부만 고른다. 번역 값을 비교·병합하지 않는다.
- **키 삭제 없음**: 정상 0키도 orphan 표시이며 번역·사용처는 남는다.
- **테넌트·인가**: 모든 저장·실행권·표면 쿼리는 인가된 projectId로 좁힌다.
- **정체성**: installation reader로 blob을 읽기 전에 `checkRepoAccess`로 대조한다.
- **readiness**: 재적재 실패·정상 0키 이후도 기존 commit 기준이 있어 ready다.
- **버린 값 보고**: 포맷 누락·부분 실패·CI 우선 미적용은 전체 성공으로 숨기지 않는다.
- **export 결정성**: export 경로는 변경하지 않는다. 결과 표면 순서도 안정되게 정렬한다.
- **POSTMORTEM 2026-09-07**: attempted 목록·재시도 합집합·결과 Alert 생존을 회귀 검사한다.
- **POSTMORTEM 2026-09-13**: 성공·실패 모두 자기 실행만 종료하고 캐시는 finally에서 무효화한다.
- **POSTMORTEM 2026-09-14**: Dialog 문구는 동작 코드와 대응시킨다. 기존 열린 tx를 받아 같은 tx에서
  실행하고 Prisma 런타임 속성으로 client 종류를 추측하지 않는다. 실제 PG로 교착·rollback을 검사한다.
- **POSTMORTEM 2026-09-02**: 이전 base를 필수 전달하며 첫 적재와 재적재의 의미를 구분한다.

## 9. 검증·완료 의존성

세부 테스트는 `tasks.md` T2~T8에 있다. 순수 테스트·Action/DOM 테스트·실제 PG 검사를 구현보다 먼저
작성하고 red를 확인한다. 원자성은 가짜 DB의 호출 기록이 아니라 PG의 통제된 동시 실행으로 검증한다.

`project-home T6 → T11(UI·시안·접근성) → T12(폐기용 리포 실물 왕복) → T13(정본 반영·정리)`가
기능 완료 경로다. 서버·컴포넌트 준비가 끝나도 이 단계를 건너뛰어 전체 완료로 기록하지 않는다.
