# Sources — 기술 설계

상태: 2026-09-21 초안. 사용자 계약은 [spec.md](./spec.md). 상세 URL 없음은 사용자 확정이다.

## 1. 영향과 불변식

영향은 편집 UI의 Sources·Settings·내비게이션과 기존 Actions의 import 위치다.
push/pull/export·보호 토큰·GitHub 자격증명·어댑터 파싱·권한 종류는 바꾸지 않는다.
스키마 변경·마이그레이션·신규 환경변수·의존성 변경 없음.

ARCHITECTURE §0의 소유권/병합 없음/결정성은 기존 함수를 재사용해 보존한다.
프로젝트 조회는 인가된 `projectId`, 상세 조회·저장은 그 프로젝트의 `surfaceId`로 제한한다.
페이지와 Action은 각각 인가한다. 레이아웃이나 모달 숨김은 인가가 아니다.
최초 적재 재시도와 기준 언어 변경의 기존 이벤트 기록(최근 logs 구현 포함)도 유지한다.

## 2. URL·진입점

정본은 `routes.sources(slug, { add?, e? })`이며 기존 `withQuery`를 사용한다. 상세 선택용 쿼리는 없다.
페이지는 `app/(edit)/projects/[slug]/sources/page.tsx` 하나다. 상세용 Route Handler는 만들지 않는다.

| URL | 동작 |
|---|---|
| `/projects/:slug/sources` | 목록 |
| `.../sources?add=sources` | OWNER의 기존 추가 모달 |
| `.../sources?add=sources&e=reauthorize` | 추가 흐름 복귀 + 기존 연결 오류 문구 |
| 기존 `/projects/:slug/locales` | 인가 후 Sources 목록으로 redirect |
| 기존 `/projects/:slug/surfaces/:surfaceSlug/locales` | 기존 소스 인가 후 Sources 목록으로 redirect |
| 기존 `/projects/:slug/surfaces/new` | 기존 OWNER/보관 검증 후 Sources 추가 모달로 redirect, `e` 보존 |
| 기존 `/projects/:slug/settings?add=sources` | OWNER 인가 후 Sources 추가 모달로 redirect, `e` 보존 |

`firstQueryValues`로 기존 추가 복귀용 add/e를 정규화한다. 알려지지 않은 `source` 쿼리는 무시하며 모달을 열지 않는다.
EDITOR가 추가 URL을 직접 열면 추가 모달·탐지 I/O 없이 권한 안내와 목록만 표시한다.
프로젝트 보관 안내는 쿼리 처리보다 우선한다.

### 모달 선택과 이력

상세 모달은 `selectedSurfaceSlug` 클라이언트 상태로 열고 닫는다. 주소/이력 조작을 하지 않는다.
공유·전체 새로고침·페이지 재진입은 Sources 목록으로 착지하며 상세 선택을 복원하지 않는다.
브라우저 Back은 이전 페이지로 가는 기존 동작이고 모달 전용 Close로 재정의하지 않는다.
커스텀 popstate 차단·전역 navigation guard는 이번 기능을 위해 만들지 않는다.

선택 변경에도 목록의 클라이언트 소유자를 동일한 위치·key로 유지한다. 열 때 읽기 전용 Server Action으로
상세를 조회하고 대기 중에는 모달 로딩 상태를 표시한다. 다른 소스의 내용을 임시로 재사용하지 않는다.
개별 모달 폼은 소스 id로 구별한다. 전체 화면을 선택 소스로 keying하여 결과 안내를 날리지 않는다.
요청 순번과 선택 소스를 대조해 닫힌 모달·이전 소스로 늦게 도착한 응답을 폐기한다.

## 3. 읽기 경로와 데이터

기존 Settings는 이미 활성 소스 전체와 `loadSurfaceCounts`를 읽는다. 새 모델/API가 필요한 것이 아니다.

| 기존 | 재사용/변경 |
|---|---|
| `requireProjectAccess` | Sources 페이지에서 `translation:write`, 인가 직후 보관 조기 반환 |
| `loadSurfaceCounts` | 목록 키·언어 수. 한 raw SQL로 전 소스 집계, 고아 제외 |
| Settings의 project/surfaces 조회 | Sources용 서버 reader로 필요한 컬럼만 선택하여 이동 |
| `loadLocaleCounts` + `localeProgress` | 선택한 소스 하나의 언어 진행률 |
| `planSurfaceImportStatus` | 다섯 상태·실패 시각·첫 적재 경계 |
| `planSurfaceReadiness` | 설치 연결 + SHA로 재시도/번역 진입 조건 |
| `formatLabel` / `m.newProject.formats` | 기존 지원 형식 라벨. 서버에서 문자열로 전달 |
| `basePending` / `baseLocaleFieldValue` | 요청/적용/필드 기준 판정 |
| `baseLocaleLine` | 복사 한 줄. 표면 식별은 UI 텍스트로 표시 |

새 `lib/sources/query.ts`는 server-only 읽기 조립만 맡는다.
페이지는 목록만 조회한다. 상세는 Sources `actions.ts`의 읽기 전용 `loadSourceDetail({ slug, surfaceSlug })`가
`getSurfaceAccess(..., permission: "translation:write")`로 매번 인가하고 비보관을 확인한 뒤 reader를 호출한다.
없는/보관된/타 프로젝트 소스는 일반 접근 오류로 반환하고 전역 slug 조회를 하지 않는다.
성공은 `{ ok: true, detail }`, 거부는 `{ ok: false, error }`다. 상세 로딩 오류는 모달 안에서 재시도/닫기를 제공한다.
읽기 전용 Action은 이벤트·revalidate·쓰기 I/O를 실행하지 않는다. 공개 Route Handler는 추가하지 않는다.
목록: 프로젝트의 `repoOwner/repoName/baseBranch/installationId`, 활성 소스들의
`id/slug/adapterName/pathTemplate/baseLocale/declaredBaseLocale/lastCommitSha/lastCommitAt/lastImportStartedAt/lastImportError/lastImportFailedAt`.
`lastImportToken`, 토큰/자격증명, 포맷 내부 `nestedByPath`, 번역 원문, 멤버 PII는 클라이언트에 보내지 않는다.
설치 여부는 클라이언트에 boolean 또는 이미 계산한 UI 상태로 전달해도 된다.

소스 수에 따른 N+1 금지: 프로젝트+활성 소스 메타 조회 1회 호출, `loadSurfaceCounts` 1회 호출.
Prisma의 관계 로딩에 따라 SQL이 나뉠 수 있지만 소스 수만큼 호출하지 않는다.
상세가 열릴 때만 선택 소스의 Locale 조회와 기존 `loadLocaleCounts`(count + 셀 상태 조회)를 더한다.
다른 소스의 번역 셀 상태까지 eager load하지 않는다. 조회 실패를 빈 목록으로 접지 않는다.

각 reader 내부의 DB 읽기는 같은 상태를 반영해야 한다. 소스 메타·Locale 목록·집계와
`loadLocaleCounts`의 분모·셀 조회까지 reader의 읽기 전용 repeatable-read 트랜잭션으로 묶어
동시 적재 중 서로 다른 기준 언어·언어 목록이나 음수 미번역/100% 초과를 피한다.
필요하면 해당 helper의 인수 타입만 PrismaClient/TransactionClient가 공유하는 읽기 메서드로 좁힌다.
쓰기 트랜잭션·행 잠금·UI 폴링을 새로 추가하는 것과 구별한다.

### 형식/시각

실제 형식 라벨은 `Chrome extension messages`, `JSON catalog`, `YAML catalog`,
`Code dictionary (one file per language)`, `Code dictionary (all languages in one file)`다.
시안의 짧은 JSON/TypeScript 라벨을 새로운 어댑터처럼 추가하지 않는다.
`formatLabel`을 클라이언트에서 직접 import하면 탐지기 그래프가 따라올 수 있으므로 서버에서 매핑한다.
null 형식/경로는 “Not configured”로 표시하고 추론하지 않는다. 알 수 없는 adapterName도 안전한 미확정 라벨로 처리한다.

`lastCommitAt` 쓰기 근거: `lib/push/apply.ts`의 `new Date(payload.commitAt)`,
`lib/import/run.ts`의 `new Date(snapshot.headCommittedAt)`.
새 화면에서는 원본 커밋 시각으로만 라벨링한다. `planSurfaceImportStatus.at`을 모든 state에서
동일한 “적재 시각”으로 표시하지 않는다. 기존 다른 화면의 시각 문구 교정은 이번 범위 밖이다.

## 4. 쓰기와 이벤트·캐시

### 기준 언어

`updateBaseLocale`를 Sources의 `actions.ts`로 이동하고 기존 폼 import를 갱신한다.
입력 `{ slug, surfaceSlug, baseLocale }`, 결과 `BaseLocaleResult`는 보존한다.
`unknown-locale`·`orphaned-locale`·인가 실패·통신 실패를 필드 근처 문구로 구분한다.

프로젝트 → 소스 순서 잠금, 선언만 갱신, 실제 변경 때만 `surface.baseLocaleDeclared` /
`surface.baseLocaleDeclarationCleared` 기록, `revalidatePath(/projects/<slug>, "layout")`를 유지한다.
이 무효화는 Sources 목록·Translations·Settings 워크플로·Logs를 함께 덮는다.
상세는 클라이언트가 받은 응답이므로 revalidate만으로 갱신되지 않는다. 저장/재시도 성공 후 열린 상세를
`loadSourceDetail`로 다시 읽는다. 목록 refresh는 기존 무효화에 맡기며 결과 안내는 유지한다.
재조회 실패는 쓰기 실패로 뒤집지 않고 “저장/적재는 완료, 최신 상태를 불러오지 못함”으로 표시한다.
UI 보관 잠금 때문에 서버의 기존 메타데이터 허용 정책을 임의로 바꾸지 않는다.

### 첫 적재 재시도와 추가

`runFirstIngest({slug,surfaceSlug})`와 `addSurfaces`의 입력·결과·인가·이벤트·트랜잭션은 유지한다.
클라이언트의 버튼 판정은 서버 인가를 대체하지 않는다.
재시도 결과는 버튼이 사라져도 남는 고정 결과 영역에서 표시하고 선택한 surfaceSlug와 결합한다.

AddSourcesModal 성공 응답의 `results`는 이미 소스별 결과다. `summarizeAddResults` 합계 아래에
원래 항목의 `surfaceSlug/count/failed`를 각각 표시한다. `failed`는 소스 실패 개수가 아니다.
기존 callback이 버리는 `yaml`을 복원할 필요 없이, 이번 UI는 CI 반영 안내와 Settings 링크를 사용한다.
새 소스는 트랜잭션 커밋 뒤 성공 결과로 나타난다. 상태 `failed-after`(partial-import)를
“이 소스 생성 실패”로 읽지 않게 결과 문구와 상태 문구를 구분한다.

소스 목록의 결과 state는 추가 모달·조건부 행·readiness 분기 바깥이다.
`router.refresh` 후에도 유지되며 소스 추가 모달 닫기만으로 초기화하지 않는다.
최근 결과 하나를 보관하며 다음 결과가 대체한다. 페이지 재진입까지 영속 저장하지 않는다.

## 5. 상태·순수 함수 대상

`lib/sources/` 아래 잎 모듈에 추가한다. 네트워크/Prisma/어댑터 구현을 import하지 않는다.
일반 프레임워크나 범용 모달 상태 머신으로 확장하지 않는다.

| 함수/모듈 제안 | 입력 → 출력 | 검증할 경계 |
|---|---|---|
| 기존 `firstQueryValues` | Raw add/e → 추가 복귀 의도 | 반복·빈 값·알 수 없는 add, source 쿼리 무시. 별도 파서 추가 없음 |
| `planSourceActions` | role/archived/설치 여부 + 기존 상태/readiness → canEdit/canRetry/canOpen | OWNER·EDITOR·설치 없음·첫 적재 전후·pending |
| `baseLanguageForm` reducer | 서버 기준값/draft/submitted + 변경·refresh·성공·실패 → draft/baseline/pending/result | 성공/refresh 순서, pending 중 새 서버값+실패, 대기값 취소 |
| `planSourceExit` | dirty/pending/목적지(close 또는 번역 URL) → leave/confirm/block | 언어 목적지 보존, dirty 해제, 실패 뒤 이탈 |

집계·상태·기준 언어 대기를 새 함수에 재구현하지 않는다. 기존 결과를 조합한다.
새 progress 계산 helper는 불필요하다. 막대는 `localeProgress`의 세 카운트/total로 그린다.

폼은 server baseline·draft·submitted를 분리한다. props 수신 시 baseline은 갱신하고 수정 중 draft는 보존한다.
성공이면 제출값을 저장된 필드값으로 수용하되, 이미 더 최신 서버값을 수신한 경우 덮지 않는다.
늦게 도착한 성공 전 props가 제출값을 되돌리는 문제를 DOM 테스트로 고정한다.
이 화면에는 동시 편집 충돌 해결 기능을 추가하지 않고 기존 서버의 마지막 선언 쓰기 정책을 유지한다.

## 6. 컴포넌트와 디자인 대응

- `components/sources/sources-screen.tsx`: 목록·선택·결과 안내의 지속 소유자.
- `source-detail-modal.tsx`: 읽기·상태 카드·언어 표·이탈 보호. 기존 OnboardingModal + Dialog 재사용.
- `base-language-form.tsx`: 기존 BaseLocaleForm 이동/확장. 저장 경로를 하나로 유지.
- `add-sources-modal.tsx`: 기존 Settings 모달 이동, 내부 탐지 흐름은 유지.
- `components/ui/modal.tsx`: 필요한 `headerAction?: ReactNode` 슬롯만 추가. 기존 actions/footer/closeDisabled/포커스 API 재사용.

현재 코드의 이름은 `OnboardingModal`이며 `Modal` export가 아니다. `Card` 대신 `PanelCard`가 실제 프리미티브다.
`components/onboarding/add-surface.tsx`는 없고 `components/settings/add-sources-modal.tsx`가 현 구현이다.
핸드오프의 import 경로를 그대로 새 파일로 복제하지 않는다.

실제 모달 상한은 `min(800px, 100svh - 96px)`이다. 시안의 804/820px 참조 높이를 이유로
공통 상한을 바꾸지 않는다. 폭 1024, 좌우 48, 제목 20/500, 기존 버튼·Dialog·Alert 토큰을 따른다.
언어 진행 막대는 현재 독립 Meter 프리미티브가 없으므로 이 화면의 표시로 구현한다.
별도 기능 컴포넌트가 전역 디자인 토큰을 바꾸지 않는다. 최종 수정본의 값 충돌은 구현 전 기록한다.
좁은 화면에서 적재 카드·일본어 행·고아 언어 안내를 숨겨 맞추지 않는다.
재시도/Save 성공·실패는 접근성 live 영역에 전달하며 행 버튼을 클릭 가능한 버튼 안에 중첩하지 않는다.

## 7. 제거/이전과 호환성

| 대상 | 작업 |
|---|---|
| `.../surfaces/[surfaceSlug]/locales/page.tsx` | 기존 화면 제거, 인가 후 Sources 목록 redirect만 유지 |
| `.../[slug]/locales/page.tsx` | default surface 우회 대신 Sources 목록으로 redirect |
| `.../locales/actions.ts` | Sources로 이동. 참조 갱신 후 옛 모듈 제거 |
| `components/locales/base-locale-form.tsx` | Sources로 이동, 기존 계약 유지 |
| `components/settings/sources-card.tsx` | Sources 목록으로 대체 후 무사용이면 제거 |
| Settings page | SourcesCard/목록 전용 counts·ADAPTERS import 제거. CI용 surfaces 조회는 남김 |
| AddSourcesModal | `components/sources/`로 이동, 복귀 URL 변경 |
| LocaleSurfaceSelector | Locales용 export와 호출만 제거. 번역 화면의 SurfaceSelector 유지 |
| `lib/shell/nav.ts` | key/label/icon/href 변경. Sources는 surfaceSlug에 따라 href를 바꾸지 않음 |
| `lib/routes.ts` | sources helper 추가. 옛 생성기는 내부 소비자 제거 후 정리하되 URL 수신 라우트는 유지 |
| OAuth callback + add-surface 목적지 | 기존 `returnTo: add-surface` 유지, 호환 진입점이 새 추가 화면으로 연결 |

새 사용자 문구는 `m.sources.*`에 모으고 `m.common.nav.sources`를 사용한다.
기존 상태·오류·보관·지원 형식 문구를 재사용하고 무사용이 된 locales/settings.sources 키만 정리한다.
용어 교체는 해당 화면/내비게이션에 한정한다. 내부 surface/locale 식별자와 타 화면을 기계 치환하지 않는다.
README/PRODUCT/ARCHITECTURE/DIRECTORY/DESIGN의 이전 정보는 구현 후 신선도 태스크로 갱신한다.

## 8. 과거 함정과 검증

- POSTMORTEM 2026-09-05, “라우트를 옮겼는데 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다”: 링크 생성기·이전 URL 수신자까지 함께 검증.
- POSTMORTEM 2026-09-07, “revalidatePath가 방금 받은 적재 결과 문구를 씻어냈다”: 결과 소유자는 상태 분기 밖.
- POSTMORTEM 2026-09-07, “클라이언트 번들에 7.2MB”: formatLabel/워크플로 생성기/DB를 client import하지 않음.
- POSTMORTEM 2026-09-09, 일회용 허가 및 malmoi#20: 초기 필드는 선언값. 현재값으로 재초기화하여 대기를 취소하지 않음.
- POSTMORTEM 2026-09-09, “화면을 라우트 밖으로 옮겼는데 … 무효화”: 기존 project layout 무효화와 이벤트 유지.
- POSTMORTEM 2026-09-12, “저장 중 서버 값을 수신 처리했지만 실패 후 취소 기준은 옛 값”: pending 중 refresh + 실패 교차를 DOM 검증.

문서 참조의 정본은 [POSTMORTEM.md](../../POSTMORTEM.md)이며 위 제목으로 찾는다.
최종 검증은 [tasks.md](./tasks.md). 실제 브라우저에서 좁은 높이·포커스·스크롤·중첩 확인창·언어 Open 이탈을 확인한다.
