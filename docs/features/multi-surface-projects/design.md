# Multi-surface projects — Design

## 1. 설계 결정

### 1.1 소유권

`Project`는 리포 정체성, GitHub 설치, base branch, 멤버십, push token, Publish 브랜치·PR과 `SyncRun`을
소유한다. 새 `TranslationSurface`는 번역 파일 묶음과 push 현실을 소유한다.

push token은 표면별로 나누지 않는다. 이 토큰이 증명하는 것은 **어느 Project의 리포에서 온 요청인가**이고,
표면별 권한 차이가 없으므로 token을 나눠도 인가 범위가 좁아지지 않는다. 인증된 Project 안에서 필수
`surfaceSlug`가 적재 대상을 정한다. 표면별 token은 secret 발급·회전·workflow 관리만 표면 수만큼 늘린다.

| Project에 남음 | TranslationSurface로 이동 |
|---|---|
| slug, name, defaultSurfaceId | slug, archivedAt |
| repoOwner, repoName, repositoryId, installationId, baseBranch | adapterName, pathTemplate, nested, nestedByPath |
| pushTokenHash, archivedAt | baseLocale, declaredBaseLocale |
| lastPulledAt, lastPublishedAt, lastPrUrl | lastCommitSha, lastCommitAt |
| SyncRun, ProjectMember | lastImportStartedAt, lastImportError |

프로젝트의 `lastPulledAt`은 모든 표면 Translation의 캡처된 최대 `updatedAt`이다. Publish가 tree 전체를 한 번에
만드므로 진행 기준도 프로젝트 하나다. 표면별 Publish 시각이나 PR 상태는 만들지 않는다.

### 1.2 표면 정체성

`TranslationSurface`는 `id`, `projectId`, `slug`, `archivedAt`을 가지며 `@@unique([projectId, slug])`다. slug는 URL,
workflow input, 결정적 정렬의 안정 식별자다. 별도 이름은 저장하지 않고 UI 라벨은 `pathTemplate`을 쓴다. slug는
path template에서 `{locale}`을 제거한 뒤 마지막 의미 있는 경로 조각으로 만들고, 충돌하면 `-2`, `-3`을 붙인다.
slug 변경은 이번 비목표다.

기존 프로젝트의 첫 표면 slug는 adapter나 경로에서 추론하지 않고 `default`로 backfill한다. 추론은 리포를
재포맷하면 바뀌고 URL·workflow 계약을 흔든다. 새 프로젝트는 키가 가장 많은 후보를 `defaultSurfaceId`로 저장하고
동률이면 slug 알파벳순을 쓴다. 키 수가 바뀌어도 기본값은 움직이지 않는다.

### 1.3 파일 소유권

표면끼리 출력 경로가 겹치면 우선순위를 두지 않고 거부한다. 경로 템플릿 문자열만 비교하면 glob과 실제 파일의
교차를 놓치므로 두 층에서 검사한다.

1. 표면 추가: base tree를 읽고 각 표면의 `resolveLocalePaths` 결과를 만든 뒤 교집합을 검사한다.
2. Publish: 실제 pull target을 모두 해석한 뒤 `path -> surfaceId` 소유 맵을 만들고 중복이면 GitHub write 전에 실패한다.

새 파일 경로는 추가 시점에 없을 수 있으므로 Publish 검사가 최종 방어선이다. 충돌을 자동 병합하거나 마지막
표면 우선으로 처리하지 않는다.

## 2. 스키마

### 2.1 새 모델

```prisma
model TranslationSurface {
  id        String @id @default(cuid())
  projectId String
  slug      String
  archivedAt DateTime?

  adapterName       String?
  pathTemplate      String?
  nested            Boolean?
  nestedByPath      Json?
  baseLocale        String?
  declaredBaseLocale String?
  lastCommitSha     String?
  lastCommitAt      DateTime?
  lastImportStartedAt DateTime?
  lastImportError   String?

  project Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@unique([projectId, slug])
  @@unique([projectId, id])
}
```

정확한 relation 이름과 index는 Prisma 검증 과정에서 기존 쿼리에 맞춰 확정하되, `projectId`를 자식 행에서
제거하지 않는다. RLS가 없으므로 프로젝트 조건은 계속 모든 쿼리의 1차 경계다.

### 2.2 자식 모델

`Locale`, `StringKey`, `Translation`에 `surfaceId`를 추가한다.

- `Locale`: PK를 `[projectId, surfaceId, code]`로 변경
- `StringKey`: unique를 `[projectId, surfaceId, key]`, 참조용 unique를 `[projectId, surfaceId, id]`로 변경
- `KeyRef`: 전역 유일한 `keyId` FK를 유지한다. 소속은 부모 StringKey가 결정하며 조회·삭제 후보를
  `[projectId, surfaceId]`로 좁힌다. `projectId`·`surfaceId`를 중복 저장하지 않는다.
- `Translation`: `StringKey`와 `Locale` 양쪽에 `[projectId, surfaceId, ...]`로 연결
- 모든 목록·집계·저장 쿼리는 인가된 `projectId`와 route가 정한 `surfaceId`를 함께 요구

`Translation`의 `[keyId, localeCode]` unique는 key id가 전역 유일하므로 논리상 유지할 수 있지만, 스키마에서
표면 경계를 드러내고 검증하기 위해 `[surfaceId, keyId, localeCode]`로 바꾼다.

### 2.3 스키마 전환 순서

운영 데이터와 사용자가 아직 없으므로 기능을 두 번 배포하지 않는다. 단, 같은 배포 안에서도 DB를 먼저 넓히고
backfill을 검증한 뒤 기존 제약을 교체하며, 그 뒤에만 다중 Surface 생성 코드를 연다.

#### 단계 A — additive + backfill

1. `TranslationSurface`와 nullable `surfaceId` 컬럼을 추가한다.
2. 모든 기존 Project에 `slug = "default"` 표면을 만들고 Project의 포맷·push 상태를 복사한다.
3. 기존 자식 행을 그 표면으로 backfill한다.
4. nullable 상태에서 가능한 새 복합 unique/index/FK와 프로젝트 전체·Surface별 조회 인덱스를 추가한다.
5. null 행 0건, 모든 Project의 default Surface 1건, 권한·drift를 검증한다.

#### 단계 B — 생성 개방 전 제약 교체

1. `surfaceId`를 NOT NULL로 바꾼다.
2. 복수 Surface의 같은 locale code·key가 공존하도록 옛 Locale PK와 StringKey unique/FK를 제거하고 새 제약을
   정본으로 만든다.
3. 실제 PostgreSQL에서 같은 key·locale 공존과 교차 Surface FK 거부를 확인한다.
4. Project의 이동 대상 컬럼과 dual-write를 제거하고 다중 Surface 생성을 연다.

마이그레이션은 코드 배포 전에 dev와 prod에 적용하고 `db:status:prod`, null/고아 0건, 테이블·시퀀스 권한을
확인한다. `Translation(projectId, updatedAt)`의 프로젝트 전체 인덱스는 1층 skip·Home 집계를 위해 유지하고,
Surface별 목록·미발송 쿼리에는 `(projectId, surfaceId, ...)` 인덱스를 둔다. 실제 쿼리는 `EXPLAIN`으로 확인한다.

## 3. push 흐름

### 3.1 외부 계약

`PushPayload`에 필수 `surfaceSlug`를 추가한다. composite action에는 `surface`와 등록 때 확정한 정확한
`pathTemplate` input을 추가하고 action → CLI → 탐지·조립까지 전달한다. 같은 adapter의 후보가 둘이어도 각 step이
다른 파일 묶음을 읽어야 한다. 기존 workflow 호환 창에서는 `surface` 생략을 `default`로 해석하고, 모든 대상
workflow가 `surface: default`를 보내는 것이 확인된 뒤 별도 변경으로 폴백을 제거한다. 서버가 adapter/path에서
표면을 추측하지 않는다.

인증 순서:

1. Bearer hash로 Project를 정한다.
2. payload project slug를 대조한다.
3. `(projectId, surfaceSlug)`로 활성 표면을 조회한다.
4. 표면이 없거나 비활성이거나 다른 프로젝트 소속이면 같은 외부 거부 응답을 낸다.
5. `checkFormat`과 `checkCommitOrder`는 그 표면 행만 대조한다.

### 3.2 적용

`applyPush(prisma, { projectId, surfaceId }, payload, options)`로 경계를 명시한다. 기존 SQL의 모든 Locale,
StringKey, Translation, KeyRef upsert/orphan 조건에 두 ID가 함께 들어간다. 다른 표면의 행은 후보 집합에도
들지 않아야 한다.

`lastCommit*`, base 변경 선언 소비, import 진행/오류는 표면 행에 기록한다. 한 표면의 실패가 다른 표면의
최근 성공 상태를 덮지 않는다.

## 4. 편집 UI

### 4.1 인가와 라우팅

`requireProjectAccess(projectSlug, permission)`으로 프로젝트를 먼저 인가한 뒤 `requireSurface(projectId,
surfaceSlug)`로 좁힌다. 비활성·다른 테넌트·존재하지 않는 slug는 모두 `notFound()`로 접는다.
Server Action은 클라이언트가 보낸 surface id를 신뢰하지 않고 project slug + surface slug에서 다시 구한다.

번역·로케일 경로만 `/surfaces/:surfaceSlug` 아래로 이동한다. Home, Members, Logs, Settings와 Publish는
프로젝트 단위로 남는다. 기존 경로와 프로젝트 단위 nav 링크는 `Project.defaultSurfaceId`의 활성 표면으로
redirect한다. 이 규칙은 순수 함수 하나가 소유한다.

### 4.2 표면 관리

Settings에 활성 표면 목록과 [Add surface]를 둔다. 추가 플로우는 새 프로젝트와 같은 다중 후보 선택 UI 및 기존
탐지·샘플·확정·첫 적재 코드를 재사용하되 리포 선택과 Project 생성 단계를 건너뛴다. slug는 자동 생성하며 같은
프로젝트에서 unique다.

OWNER는 마지막 하나가 아닌 Surface를 확인 Dialog 뒤 비활성화할 수 있다. `archivedAt`을 기록해 데이터는
보존하지만 일반 UI·push·Publish에서는 제외하고 재활성화 UI는 만들지 않는다. Dialog는 workflow step을 사용자가
직접 제거해야 한다고 알린다. 기본 Surface를 비활성화하면 남은 활성 표면 중 키가 가장 많은 항목, 동률이면 slug
알파벳순 항목으로 `defaultSurfaceId`를 같은 트랜잭션에서 바꾼다.

## 5. pull과 Publish

### 5.1 로드

`loadPullState`는 Project와 Surface 목록을 한 번 읽고, 표면별 키·로케일·번역을 `surfaceId`로 분리한다.
표면은 slug 코드포인트 순으로 정렬한다. 각 표면은 기존 `formatFromProject`, `resolveLocalePaths`, writer 계약을
그대로 적용하되 입력 타입을 `formatFromSurface`로 바꾼다.

1층 스킵은 프로젝트 전체 Translation 최대 `updatedAt`과 `Project.lastPulledAt`을 비교한다. 하나라도 바뀌면
GitHub base snapshot을 한 번 읽고 모든 표면을 렌더한다. 표면별 GitHub snapshot이나 commit을 만들지 않는다.

### 5.2 계획과 write

순수 계획 함수가 다음을 만든다.

```text
ordered surfaces
  -> resolved paths per surface
  -> reject duplicate path ownership
  -> render each surface from the same base snapshot
  -> flatten changes by path in codepoint order
  -> blob SHA compare
  -> one tree / one commit / one force update / one PR
```

표면 A가 만든 content를 표면 B의 original로 넘기지 않는다. 그렇게 하면 두 표면의 값을 병합하는 셈이다.
충돌은 렌더 전에 거부한다. `base_tree`, UTF-8 blob SHA, base head parent, `[skip-l10n]`, force update와 열린 PR
재사용 규칙은 그대로다. 모든 렌더 결과의 blob SHA가 base와 같으면 stale sync branch를 base head로
force-update한 뒤 기존 2층 판정대로 `skipped`이며 새 commit과 PR 갱신을 하지 않는다. 이 성공 뒤에만 캡처한
`lastPulledAt`을 전진시킨다. 즉시 다시 실행하면 1층에서 GitHub API 0회로 끝나고, 값 불변 push가 `updatedAt`을
움직인 경우에만 2층 blob 비교까지 간다.

### 5.3 SyncRun과 결과

`SyncRun`은 프로젝트 단위로 유지한다. 성공·실패·warning은 전체 Publish 결과다. 어느 표면에서 난 경고인지
표시할 수 있도록 warning에 `surfaceSlug`를 붙이되 DB에 별도 경고 이력을 만들지 않는다. 한 표면 렌더가 실패하면
tree를 만들지 않고 전체 Publish를 실패 처리한다.

## 6. 온보딩과 workflow

새 프로젝트와 Settings의 Add surface는 같은 다중 선택 플로우를 쓴다. 후보는 키 수 내림차순·path template
알파벳순으로 정렬하고 전부 체크하며 첫 행을 상세 대상으로 고른다. 기존 Radio 위치에 공용 Radix Checkbox를
넣고 행의 치수·칩·텍스트·선택 배경은 유지한다. Checkbox 클릭은 포함 상태만, 나머지 행 클릭은 상세 대상만
바꾼다. 체크하지 않은 행도 상세를 볼 수 있고 우측 키 테이블은 상세 대상 하나만 lazy load한다.

체크된 후보들은 기존 글로벌 탐지·적재 예산 하나를 공유한다. 생성 직전 전 후보를 서버에서 다시 확인하며 예산
초과·경로 충돌·부분 파일 실패 중 하나라도 있으면 전체 생성 트랜잭션을 롤백한다. 목록은 후보별 비용과 체크된
합계를 보여주며 예산 초과 시 Next를 막는다. 현재 화면에서는 입력과 오류를
유지하지만 새로고침 뒤에는 서버 draft 없이 다시 탐지한다. 결과는 최초 생성이면 전체 workflow, Add surface면
기존 token을 다시 노출하지 않고 추가할 action step들을 보여준다. `renderWorkflowYaml`은 최초 전체 파일과 추가
surface step을 별도 순수 함수로 만든다. 모든 step의 concurrency group은 프로젝트 slug 하나를 공유한다.

Translations·Locales에만 Surface 선택기를 보인다. 목록은 path template 알파벳순이고, 전환 시 query filter는
초기화한다. 저장 중·실패 셀이 있으면 이동을 막고 현재 Retry 흐름을 유지한다. Publish 버튼은 활성 Surface 전체의
미발송 합계를 `Publish all`로 표시한다.

## 7. 순수 함수 — `/tdd interface` 대상

- `planSurfaceSlug(pathTemplate, existingSlugs)` — 마지막 경로 조각 기반 URL/ref-safe slug와 suffix 판정
- `selectDefaultSurface(surfaces)` — 키 수 내림차순·slug 동률 규칙으로 저장할 기본 표면 판정
- `orderCandidateSurfaces(surfaces)` — 키 수 내림차순, path template 동률 정렬
- `orderSurfaceNavigation(surfaces)` — path template 알파벳순 탐색 정렬
- `planSurfaceArchive(surfaces, targetId, defaultSurfaceId)` — 마지막 활성 표면 차단과 새 기본값 판정
- `surfaceOwnership(resolvedTargets)` — 출력 경로 중복 탐지와 오류 모델
- `orderSurfaces(surfaces)` — 코드포인트 순서
- `checkSurfaceRoute(projectId, surface)` — 프로젝트 소속 판정
- `checkSurfaceFormat(payloadFormat, surface)` — 기존 `checkFormat`의 표면 입력 버전
- `planMultiSurfacePull(surfacePlans)` — 충돌 없는 단일 tree 입력으로 평탄화
- `renderSurfaceWorkflowStep(input)` — 기존 workflow에 붙일 결정적 YAML 조각

## 8. 불변식 영향

### 번역 값과 키 소유권

소유자는 바뀌지 않고 범위만 Project에서 Surface로 좁아진다. push는 표면 안에서 strict overwrite하며 표면 간
값 비교·병합은 없다. 키와 로케일은 표면 안에서 삭제하지 않고 orphan으로 보존한다.

### 결정성

표면 순서와 최종 path 순서를 `compareKeys`로 고정한다. 모든 표면은 같은 base snapshot을 원본으로 읽는다.
출력 경로 충돌은 우선순위가 아니라 실패다. 기존 blob SHA·tree·commit 규칙을 그대로 재사용한다.

### 인증·테넌시

ProjectMember가 계속 권한을 결정한다. 모든 자식 DB 쿼리는 `projectId`와 `surfaceId`를 함께 요구하고 복합 FK가
서로 다른 프로젝트·표면의 key/locale 조합을 막는다. push token은 Project를 정한 뒤에만 surface slug를 읽는다.

### readiness와 실패 표시

첫 적재가 성공한 표면만 Project에 들어오므로 별도 surface readiness 상태를 만들지 않는다. Publish는 모든
표면을 렌더하며 전체 diff가 0이면 `skipped`다. 렌더 오류나 버린 값은 기존 규칙대로 실패·warning으로 드러내고
성공으로 숨기지 않는다.

## 9. 과거 함정

- POSTMORTEM 2026-08-31: 외부 payload 생산자가 둘로 갈려 필드 추가가 한 경로에서 누락됐다. `surfaceSlug`는
  `lib/push/payload.ts` 한 생산자와 타입 계약을 통해서만 만든다.
- ARCHITECTURE §5.5.5: 다른 표면 push가 기존 프로젝트를 덮고 전 키를 orphan하는 실물이 이미 있었다.
  표면 식별 실패는 추측하지 않고 거부한다.
- POSTMORTEM 2026-09-02/03: 필드가 네 홉 중 하나에서 사라져도 단위 테스트가 green이었다. surfaceId의
  action → API → plan → SQL → pull 전달을 홉별 계약 테스트로 고정한다.
- POSTMORTEM 2026-09-04: 결정성·원본 표현·UTF-8 blob SHA·base_tree 누락은 조용한 전면 diff나 삭제를 만든다.
  multi-surface plan은 기존 writer와 GitHub payload 함수를 우회하지 않는다.
- POSTMORTEM 2026-09-09: projectId 없는 쿼리와 DB 외부 경로는 테넌트 격리를 무력화한다. 새 복합 FK와
  모든 raw SQL의 projectId + surfaceId 조건을 PostgreSQL 통합 테스트로 검증한다.
- POSTMORTEM 2026-09-13: 모달/딥링크의 지역 상태와 URL이 갈려 복귀가 깨졌다. Add surface는 고유 URL을
  가지고 OAuth·새로고침·직접 진입에서 같은 서버 상태를 복원한다.

## 10. 새 환경변수

없음. 기존 프로젝트별 `PUSH_TOKEN`과 GitHub App 자격증명을 재사용한다.
