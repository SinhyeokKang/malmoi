# Multi-surface projects — Tasks

각 단계는 앞 단계의 검증이 끝난 뒤 진행한다. 스키마 변경은 `/db`, 순수 인터페이스는 `/tdd interface`, 구현은
`/implement`가 받는다. 운영 데이터와 사용자가 없으므로 한 기능 라운드로 배포하되 DB는 additive → backfill 검증
→ 기존 제약 교체 순으로 코드보다 먼저 적용한다.

## Commit 1 — 제품·인터페이스 계약

### T1. 정본 변경 준비

- `docs/PRODUCT.md` §7.1을 Project 1리포 + N 비중첩 표면 정책으로 갱신한다.
- 완료 조건·비목표·프로젝트 단위 권한과 PR 정책을 PRODUCT/ARCHITECTURE에 올린다.
- `docs/DESIGN.md`에 Checkbox 프리미티브와 다중 후보 행·상세 선택·Surface 선택기 규칙을 올린다.
- `docs/DIRECTORY.md`에 새 surface 모듈과 route 소유권을 등록한다.
- 검증: 옛 정책 0건과 함께 PRODUCT/ARCHITECTURE/DESIGN/DIRECTORY 각각에 소유권·비중첩·프로젝트 단위
  Publish·다중 후보 UI의 필수 단언이 존재한다.

### T2. 순수 인터페이스 테스트

- path template 기반 surface slug·suffix, 키 수 기반 기본 표면, 비활성화 판정 테스트를 먼저 작성한다.
- 후보 키 수 내림차순·path 동률 정렬과 생성 뒤 nav path 알파벳순 판정 테스트를 먼저 작성한다.
- 표면 순서와 출력 경로 충돌, multi-surface pull 평탄화 테스트를 먼저 작성한다.
- surface format/route 소속 판정과 pathTemplate을 포함한 workflow step 렌더 테스트를 먼저 작성한다.
- 검증: 새 테스트가 구현 부재로 red이고 각 실패가 목표 인터페이스 하나를 가리킨다.

**커밋 경계:** 문서 + red interface tests. 구현 코드 없음.

## Commit 2 — 스키마 전환

### T3. TranslationSurface와 nullable FK 추가·backfill

- `TranslationSurface` 모델과 Project relation, `Project.defaultSurfaceId`, Surface `archivedAt`을 추가한다.
- Locale, StringKey, Translation에 nullable `surfaceId`를 추가한다. KeyRef는 기존 전역 unique `keyId` FK를 유지한다.
- 기존 Project마다 `default` 표면을 만들고 포맷·push 상태와 자식 행을 backfill하는 SQL을 작성한다.
- nullable 상태에서 가능한 새 복합 unique/index/FK를 추가하고 프로젝트 전체 `Translation(projectId, updatedAt)`
  인덱스는 유지한다. Surface별 목록·미발송 쿼리 인덱스를 추가한다.
- dev 마이그레이션 SQL에서 테이블·시퀀스 기본 권한과 lock 범위를 검토한다.
- 검증: `/db`의 dev 적용·drift·권한 검사 통과, backfill 뒤 surfaceId null 행 0건.

### T4. 제약 교체와 스키마 계약 테스트

- backfill의 null/고아 0건과 모든 Project의 `default` 표면·`defaultSurfaceId`를 확인한 뒤 `surfaceId`를 NOT NULL로
  만들고 옛 Locale PK·StringKey unique/FK를 새 복합 제약으로 교체한다.
- 기존 1프로젝트 데이터가 정확히 한 `default` 표면으로 이관되는 fixture를 고정한다.
- 다른 project/surface의 key와 locale을 조합한 Translation이 FK에서 거부되는 PostgreSQL 테스트를 추가한다.
- 같은 키·locale code가 다른 표면에는 공존하는지 검증한다.
- `vitest.surfaces.config.ts`와 `pnpm test:surfaces:postgres`를 만들고 T4·T9·T14가 같은 실제 DB 스위트를 쓴다.
- dev와 prod에 마이그레이션을 코드보다 먼저 적용하고 status·drift·null/고아·테이블/시퀀스 권한을 확인한다.
- 검증: `pnpm test`, `pnpm test:surfaces:postgres`, `EXPLAIN`, `pnpm db:status:prod` green.

**커밋 경계:** schema + migration + schema tests만. `/db` 판정에 따라 dev·prod DB를 코드 배포 전에 적용.

## Commit 3 — surface 도메인과 인가

### T5. 순수 surface 모듈 구현

- T2의 slug/default/정렬/archive/소속 판정을 구현한다.
- 클라이언트가 읽는 판정은 server I/O를 import하지 않는 잎 모듈로 둔다.
- 검증: T2의 해당 red tests green, client graph 검사 green.

### T6. 프로젝트 인가 뒤 surface 좁힘

- 페이지용 `requireSurfaceAccess`와 Action용 `getSurfaceAccess`를 만든다.
- 모든 결과가 인가된 `projectId`와 `surfaceId`를 함께 반환하게 한다.
- 다른 프로젝트 표면 slug와 없는 slug를 같은 not-found/fail-closed 결과로 접는다.
- 검증: OWNER/EDITOR/비멤버/타 프로젝트/없는 표면 인가 매트릭스 green.

**커밋 경계:** surface 순수 모듈 + 인가 껍데기 + tests.

## Commit 4 — push 격리

### T7. payload와 workflow 계약 확장

- `PushPayload`와 composite action에 `surfaceSlug`/`surface` 및 정확한 `pathTemplate` 입력을 추가한다.
- 모든 payload 생산자를 `lib/push/payload.ts`로 통과시킨다.
- 호환 창 동안 surface 생략은 `default`로 해석하고 모든 대상 workflow의 `surface: default` 이관 확인 뒤 별도
  변경으로 제거한다.
- 첫 workflow와 추가 surface step renderer를 분리한다.
- 검증: CLI·action·첫 적재·수동 workflow fixture 모두 surface slug와 path template을 전달하고, 같은 adapter의
  서로 다른 path 두 Surface가 각자 정확한 후보를 push하며 기존 핀·줄 대조 검사 green.

### T8. push 인증·가드

- 토큰으로 Project를 정한 뒤 `(projectId, surfaceSlug)`를 조회한다.
- `checkFormat`, commit order, base 선언, import 상태를 Surface 기준으로 옮긴다.
- 없는 표면·비활성 표면·타 프로젝트 표면을 같은 응답으로 fail-closed 거부한다.
- base 선언은 실제 소비한 push에서만 해당 Surface 값을 비우고, 미소비 push와 다른 Surface 선언은 유지한다.
- 검증: 오배송·표면 교체·역행·누락·비활성 surface route tests가 상태와 비누설 본문을 고정하고, A/B Surface의
  선언 소비/유지와 pending UI를 함께 고정한다.

### T9. applyPush surface 격리

- 모든 ORM/raw SQL 조건, unnest 열과 FK 입력에 `projectId` + `surfaceId`를 넣는다.
- orphan/unorphan, strict Translation overwrite, KeyRef 교체가 대상 표면만 바꾸게 한다.
- Project 옛 포맷·push 컬럼과 dual-write를 제거하고 생성 진입점은 T17까지 닫아 둔다.
- 검증: A/B 표면 fixture에서 A push 전후 B의 네 모델과 상태 snapshot이 완전히 같다.
- 검증: `pnpm test:surfaces:postgres`에서 A/B snapshot과 실제 제약을 함께 확인한다.

**커밋 경계:** 외부 계약 + push route/plan/apply + action + tests. 대상 리포 workflow는 아직 바꾸지 않는다.

## Commit 5 — pull과 단일 PR

### T10. 다중 표면 load/plan

- 표면을 slug 코드포인트 순으로 읽고 각 행을 surfaceId로 분리한다.
- 프로젝트 전체 Translation 최대 updatedAt으로 1층 skip을 유지한다.
- 활성 Surface만 읽되 프로젝트 전체 `(projectId, updatedAt)` 인덱스와 Surface별 목록 인덱스를 각각 사용한다.
- resolved path 소유 맵과 충돌 오류를 구현한다.
- 검증: 등록·DB 반환 순서를 섞은 property fixture에서 같은 plan과 충돌 결과가 나온다.

### T11. 단일 snapshot·tree·commit

- GitHub base snapshot을 한 번 읽어 각 표면 writer에 같은 원본을 제공한다.
- 충돌을 렌더 전에 거부하고, 변경을 path 코드포인트 순으로 평탄화한다.
- 기존 blob SHA, `base_tree`, parent, `[skip-l10n]`, force branch, 열린 PR 재사용 함수를 그대로 쓴다.
- warning에 surface slug를 붙인다.
- 검증: 두 표면 변경이 tree 하나·commit 하나·PR 하나를 만들고 PR 머지 전 재실행은 같은 tree SHA를 만든다.
- 검증: 모든 표면의 blob이 base와 같으면 stale sync branch를 base head로 되돌린 뒤 commit·PR 갱신 없이
  `skipped`이고, 성공 뒤에만 `lastPulledAt`이 전진한다.
- 검증: 즉시 재실행은 1층 GitHub API 0회 skip, 값 불변 push 뒤 재실행은 2층 blob skip이다.
- 검증: `git hash-object`와 비ASCII fixture SHA가 일치하고 기존 adapter contract matrix green.

### T12. SyncRun과 cron

- SyncRun은 프로젝트 단위로 유지하고 실패한 표면이 있으면 전체 run을 FAILED로 닫는다.
- cron target 수가 표면 수가 아니라 프로젝트 수를 계속 세는지 고정한다.
- 검증: 2표면 프로젝트 하나가 cron 결과 한 항목과 SyncRun 한 행만 만든다.

**커밋 경계:** pull load/plan/render/run + GitHub orchestration + tests.

## Commit 6 — 편집 화면 이관

### T13. route와 legacy redirect

- translations/locales를 `/surfaces/:surfaceSlug` 아래로 옮긴다.
- 기존 URL과 프로젝트 단위 nav 링크는 저장된 `defaultSurfaceId`로 redirect한다.
- route 생성기는 `lib/routes.ts` 한 곳만 수정하고 수신자·생성자 대조를 갱신한다.
- 검증: 직접 진입·새로고침·뒤로가기와 유효한 default/비활성·없는 surface route tests green.

### T14. 쿼리·저장 범위

- 번역, 로케일, 진행률을 projectId + surfaceId로 좁히되 Publish 버튼의 미발송 수는 활성 Surface 전체를
  프로젝트 단위로 합산한다.
- `saveTranslation`은 key·locale·surface의 소속을 같은 프로젝트 안에서도 다시 검증한다.
- ProjectMember 권한은 재사용하고 표면별 역할은 만들지 않는다.
- 검증: 같은 key/locale 이름을 가진 두 표면에서 한쪽 저장이 다른 쪽 값을 바꾸지 않고,
  `pnpm test:surfaces:postgres`가 저장·미발송·recent edits 범위를 실제 DB에서 확인한다.

### T15. 표면 선택기

- Translations·Locales의 프로젝트 구역에만 현재 path template과 이동 목록을 추가한다.
- 목록은 path template 알파벳순이며 하나뿐이면 현재 값만 보이고 선택 동작은 숨긴다.
- 전환 시 query filter를 초기화하고 저장 중·실패 셀이 있으면 이동을 막아 Retry 흐름을 유지한다.
- Publish 버튼은 활성 Surface 전체 합계를 `Publish all · N`으로 표시한다.
- 검증: 프로젝트 단위 화면에는 selector가 없고 1개/2개 Surface DOM, 필터 초기화, pending/failed 저장 차단,
  키보드 접근성 검사가 green.

**커밋 경계:** routes + queries/actions + selector UI + tests.

## Commit 7 — 다중 후보 UI 계약

### T16. Checkbox와 후보 선택 모델

- Radix 기반 `components/ui/checkbox.tsx`를 추가한다. 16px 정사각형이며 기존 Radio의 테두리·포커스 토큰을 쓴다.
- 기존 후보 행의 치수·칩·텍스트·선택 배경은 유지하고 Radio 자리만 Checkbox로 바꾼다.
- `checkedCandidateIds`와 `activeCandidateId`를 분리한다. 전체 후보를 처음 체크하고 키 수 내림차순·path 동률
  알파벳순 첫 행을 상세 대상으로 둔다.
- Checkbox는 포함만 토글하고 행은 상세만 전환한다. 체크 해제된 행도 상세를 보며 현재 상세 하나만 lazy load한다.
- 후보별 비용과 체크된 합계를 표시하고, 체크된 후보가 1개 이상이며 합산 글로벌 예산·경로 충돌 검사가
  통과할 때만 Next를 연다.
- 검증: 0/1/N 후보, 전체 초기 체크, 체크/상세 독립, 체크 해제 상세, lazy load, 정렬, 충돌 행 오류,
  Tab·Space·Enter·focus ring DOM tests green.

**커밋 경계:** Checkbox + 순수 선택 상태 + 기존 onboarding UI tests.

## Commit 8 — 다중 Surface 생성·관리

### T17. 원자적 다중 생성 서버 흐름

- 새 Project 생성과 기존 Project Add surface가 같은 다중 후보 입력·검증 함수를 사용한다.
- Add surface는 기존 repository snapshot과 detect/sample/confirm을 재사용하고 리포 선택·Project 생성·token 발급은
  호출하지 않는다.
- path template의 마지막 의미 있는 조각으로 slug를 만들고 충돌 시 `-2`, `-3` suffix를 붙인다.
- 확정 직전 repository identity, 체크된 후보 합산 글로벌 예산, 기존/신규 resolved path 충돌을 다시 검사한다.
- 다운로드 전·중, 재검증 후, locale/key/translation/ref 쓰기 중 하나라도 실패하면 Project·Surface·네 자식 모델을
  모두 롤백한다. 부분 적재를 성공으로 받지 않는다.
- 동시 동일 slug 추가와 동시 경로 충돌도 fail-closed로 처리한다.
- 검증: 후보/수동/0후보/예산/충돌/repo-replaced/부분 파일 실패/쓰기 단계별 실패/동시 요청 매트릭스 green이며
  각 실패 뒤 관련 행이 0건임을 `pnpm test:surfaces:postgres`에서 확인한다.

### T18. 생성·비활성화 UI

- 새 Project와 Settings Add surface가 T16의 다중 선택 UI를 재사용한다. Settings에는 활성 Surface 목록과 고유 Add
  surface URL을 만들고 결과에는 새 token 대신 기존 workflow에 붙일 action step들을 보인다.
- 오류 뒤 현재 화면의 입력은 유지하되 새로고침하면 draft 없이 다시 탐지한다.
- 마지막 하나가 아닌 Surface에 비활성화 Dialog를 제공한다. 데이터 보존과 workflow step 수동 제거를 알리고,
  `archivedAt` 기록 뒤 일반 UI·push·Publish에서 숨긴다. 재활성화 UI는 만들지 않는다.
- 기본 Surface 비활성화 시 남은 활성 Surface 중 키 수 내림차순·slug 동률 첫 항목으로 `defaultSurfaceId`를 같은
  트랜잭션에서 바꾼다.
- 검증: 자동 DOM/route tests와 수동 브라우저 검증을 구분한다. DOM은 선택·오류·Dialog·마지막 Surface 차단을,
  수동 검증은 직접 진입·새로고침·취소·재시도와 실제 GitHub snapshot 흐름을 확인한다.

**커밋 경계:** multi-surface onboarding/settings actions + UI + tests.

## Commit 9 — 전체 검증

### T19. 전체 게이트와 실물 왕복

- `pnpm typecheck`, `pnpm test`, `pnpm build`를 통과한다.
- 다섯 adapter 계약을 모두 재검한다.
- `/l10n-roundtrip`과 로컬 push 검증 입력에 surface/pathTemplate을 추가한다.
- 폐기용 다중 표면 리포에서 두 Surface push → 각 편집 → 단일 Publish → PR 확인·merge → checkout 갱신 → 두
  Surface 재push → 값 유지 → re-pull no-edits 순서로 왕복한다.
- 기존 단일 표면 프로젝트의 legacy URL·workflow·Publish 회귀를 확인한다.
- dev DB에서 surfaceId null, orphan 교차 변경, duplicate path ownership을 점검한다.
- 검증: `/l10n-roundtrip` 결과가 값·구조·표현·merge 뒤 1층 skip과 값 불변 push 뒤 2층 skip을 모두 통과한다.

### T20. 문서 신선도

- PRODUCT, ARCHITECTURE, DESIGN, DIRECTORY, ACTIONS, README와 workflow 예시를 실제 구현에 맞춘다.
- 프로젝트/표면 용어와 Publish 소유권이 문서마다 같은지 대조한다.
- 검증: `pnpm sync:agents:check`와 변경 문서 신선도 검사 통과.

**커밋 경계:** 검증에서 드러난 기능 범위 수정 + 정본 문서. dev push는 Claude Code `/push` 대기.

호환용 `surface = default` 폴백 제거와 Publish diff UI는 별도 후속이다. diff의 데이터 위계는
Surface → Namespace → Key → Locale이며 namespace 없는 키는 `Ungrouped`로 묶는다.
