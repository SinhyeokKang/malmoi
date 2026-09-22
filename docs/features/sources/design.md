# Sources — 기술 설계

상태: 2026-09-21 초안. 갱신: 2026-09-22(`/feature-review` 4인 검수 반영).
사용자 계약은 [spec.md](./spec.md). 상세 URL 없음·이탈 확인창 없음·바닥 행동은 사용자 확정이다.

## 1. 영향과 불변식

영향은 편집 UI의 Sources·Settings·내비게이션과 기존 Actions의 import 위치다.
push/pull/export·보호 토큰·GitHub 자격증명·어댑터 파싱·권한 종류는 바꾸지 않는다.
스키마 변경·마이그레이션·신규 환경변수·의존성 변경 없음 — spec §5·§6이 요구하는 여섯 컬럼이 전부 실재한다
(`prisma/schema.prisma` — `baseLocale:120` · `declaredBaseLocale:123` · `lastCommitSha:124` ·
`lastCommitAt:125` · `lastImportStartedAt:126` · `lastImportError:129` · `lastImportFailedAt:137`).

**`components/ui/modal.tsx`도 바꾸지 않는다** — 헤더 보조 행동을 바닥으로 내렸으므로 슬롯 추가가 없다.

⚠️ **`middleware.ts`는 손댈 필요가 없다.** matcher가 `["/projects/:path*", "/account"]`(`middleware.ts:58`)로
와일드카드라 `/projects/:slug/sources`가 **이미 덮인다.** CLAUDE.md의 "새 보호 라우트는 `matcher`에 추가한다"를
읽고 의심할 자리이므로 적어 둔다. middleware는 경로 의미를 보지 않고 쿠키 이름만 보며, 본판정은 페이지·Action이다.

ARCHITECTURE §0의 소유권/병합 없음/결정성은 기존 함수를 재사용해 보존한다.
**리포 값과 DB 값을 견줘 승자를 고르는 코드가 한 줄도 요구되지 않는다**(불변식 2).
키·로케일 삭제도 없고(불변식 3), export·blob SHA·결정성 경로를 건드리지 않는다(불변식 4).
프로젝트 조회는 인가된 `projectId`, 상세 조회·저장은 그 프로젝트의 `surfaceId`로 제한한다.
페이지와 Action은 각각 인가한다. 레이아웃이나 모달 숨김은 인가가 아니다(불변식 5·7).
최초 적재 재시도와 기준 언어 변경의 기존 이벤트 기록(최근 logs 구현 포함)도 유지한다.

## 2. URL·진입점

정본은 `routes.sources(slug, { add?, e? })`다. 상세 선택용 쿼리는 없다.
페이지는 `app/(edit)/projects/[slug]/sources/page.tsx` 하나다. 상세용 Route Handler는 만들지 않는다.

⚠️ **`withQuery`는 `lib/routes.ts:76`의 module-private 함수다(export가 아니다).** 그래서
"기존 `withQuery`를 사용한다"는 **`routes` 객체 안에 `sources`를 추가할 때만** 성립한다.
문자열 연결로 URL을 만들면 `app/__tests__/entry-points.test.ts:466`이 생성기를
`routes.foo(...)}?key=` 모양으로 파싱하므로 **쿼리 수신자 검사를 통째로 회피한다**(`lib/routes.ts:95-99`가 그 근거를 든다).

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

### 번역 화면으로 좁히는 링크 — `ns: ALL_NAMESPACES`가 필수다

⚠️ **`?ns=`가 없으면 "지정 안 함"이 아니라 기본 착지다.** `resolveNamespace`(`lib/keys/view.ts:294-304`)가
`defaultNamespace`로 떨어지고 그것은 "남은 일이 있는 첫 네임스페이스, 없으면 키가 있는 첫 네임스페이스"
(`lib/keys/view.ts:273-279`)다. 게다가
`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx:131-133`이 그 값을 **redirect로
URL에 고정**한다. 그래서 `{ locales: "ja" }`만 실으면 "이 소스의 ja 전체"가 아니라 **한 네임스페이스의 ja**에 착지한다.

- 언어 행 `Open` = `routes.surfaceTranslations(slug, surfaceSlug, { ns: ALL_NAMESPACES, locales: code })`
- 바닥 `Open translations` = `routes.surfaceTranslations(slug, surfaceSlug, { ns: ALL_NAMESPACES })`

기존 좁힘 링크가 전부 그 형태다(`components/home/attention-card.tsx:112-114`,
`components/home/count-cards.tsx:68`). 근거는 POSTMORTEM 2026-09-15(`docs/POSTMORTEM.md:1827`).

### 모달 선택과 이력

상세 모달은 `selectedSurfaceSlug` 클라이언트 상태로 열고 닫는다. 주소/이력 조작을 하지 않는다.
공유·전체 새로고침·페이지 재진입은 Sources 목록으로 착지하며 상세 선택을 복원하지 않는다.
브라우저 Back은 이전 페이지로 가는 기존 동작이고 모달 전용 Close로 재정의하지 않는다.
커스텀 popstate 차단·전역 navigation guard는 이번 기능을 위해 만들지 않는다.

선택 변경에도 목록의 클라이언트 소유자를 동일한 위치·key로 유지한다. 열 때 읽기 전용 Server Action으로
상세를 조회하고 대기 중에는 모달 로딩 상태를 표시한다. 다른 소스의 내용을 임시로 재사용하지 않는다.
개별 모달 폼은 소스 id로 구별한다. 전체 화면을 선택 소스로 keying하여 결과 안내를 날리지 않는다.
요청 순번과 선택 소스를 대조해 닫힌 모달·이전 소스로 늦게 도착한 응답을 폐기한다 —
**기존 관용구다**(`components/publish-button.tsx:41-62`, `components/home/sync-button.tsx:55-73`).

## 3. 읽기 경로와 데이터

기존 Settings는 이미 활성 소스 전체와 `loadSurfaceCounts`를 읽는다. 새 모델/API가 필요한 것이 아니다.

| 기존 | 재사용/변경 |
|---|---|
| `requireProjectAccess` | Sources 페이지에서 `translation:write`, 인가 직후 보관 조기 반환 |
| `loadSurfaceCounts` | 목록 키·언어 수. 한 raw SQL로 전 소스 집계, 고아 제외, `ORDER BY s.slug ASC` |
| Settings의 project/surfaces 조회 | Sources용 서버 reader로 필요한 컬럼만 선택하여 이동 |
| `loadLocaleCounts` + `localeProgress` | 선택한 소스 하나의 언어 진행률. **서버에서 계산해 카운트만 내린다** |
| `planSurfaceImportStatus` | 다섯 상태·실패 시각·첫 적재 경계 |
| `planSurfaceReadiness` | 설치 연결 + SHA로 재시도/번역 진입 조건 |
| `formatLabel` / `m.newProject.formats` | 기존 지원 형식 라벨. **서버에서** 문자열로 전달 |
| `basePending` / `baseLocaleFieldValue` | 요청/적용/필드 기준 판정 |
| `baseLocaleLine` | 복사 한 줄. 표면 식별은 UI 텍스트로 표시 |
| `canPerform` | 기준 언어 폼의 그리기 판정 (§5) |

새 `lib/sources/query.ts`는 server-only 읽기 조립만 맡는다.
페이지는 목록만 조회한다. 상세는 Sources `actions.ts`의 읽기 전용 `loadSourceDetail({ slug, surfaceSlug })`가
`getSurfaceAccess(..., permission: "translation:write")`로 **매번** 인가한 뒤 reader를 호출한다.
읽기 전용 Server Action은 이 리포의 관용구다 — 선례 일곱 건이 있고 `loadPublishPreview`
(`app/(edit)/publish-actions.ts:14-26`)가 그 모양이다. 공개 Route Handler는 추가하지 않는다.
읽기 전용 Action은 이벤트·revalidate·쓰기 I/O를 실행하지 않는다.

⚠️ **`getSurfaceAccess`가 이미 `archivedAt: null`로 거르고 없으면 `not-found`를 준다**
(`lib/surfaces/access.ts:31-35`). 그래서 "비보관을 확인한 뒤"라는 별 단계는 **중복이다.**
그리고 `TranslationSurface.archivedAt`은 **쓰는 곳이 0이라 항상 null이다**
(`prisma/schema.prisma:112-114`) — 프로젝트 보관(`archivedPolicy`)과 혼동되지 않게 문장을 갈라 둔다.

⚠️ **`getSurfaceAccess`의 `surface`를 응답에 스프레드하지 않는다.** 그 `findFirst`에 `select`가 없어
반환 객체가 `lastImportToken`·`nestedByPath`를 들고 있다(`lib/surfaces/access.ts:31-34`).
**reader의 명시 projection만 싣는다.** 전례가 `app/(edit)/layout.tsx:80`이다(sec-audit 발견 23 —
`installationId`·`lastCommitSha`가 `(edit)` 아래 전 페이지의 RSC 페이로드에 실렸다).

### `loadSourceDetail`의 결과는 세 갈래다

`{ ok: true, detail }` / `{ rejected: ... }` / `{ failed: ... }`.
**재시도 버튼은 `failed`에만 붙는다** — `forbidden`·`not-found`에 재시도를 주면 거부를 장애로 보이게 만든다.
`readSession()`의 `unavailable`(세션 저장소 장애)은 거부가 아니라 `failed`다.
선례를 그대로 따른다: `PublishPreviewResult`(`lib/publish/preview.ts:13-16`)와
`loadPublishPreview`(`app/(edit)/publish-actions.ts:14-26`)의 3갈래.
없는/보관된/타 프로젝트 소스는 `rejected`의 일반 접근 오류로 반환하고 전역 slug 조회를 하지 않는다.

목록: 프로젝트의 `repoOwner/repoName/baseBranch/installationId`, 활성 소스들의
`id/slug/adapterName/pathTemplate/baseLocale/declaredBaseLocale/lastCommitSha/lastCommitAt/lastImportStartedAt/lastImportError/lastImportFailedAt`.
`lastImportToken`, 토큰/자격증명, 포맷 내부 `nestedByPath`, 번역 원문, 멤버 PII는 클라이언트에 보내지 않는다.
**설치 여부는 boolean으로만 내린다** — 이 결정은 **현재 실재하는 유출을 함께 닫는다**
(`components/settings/sources-card.tsx:25`가 raw `installationId`를 받고 있고, 그 카드가 사라진다).
**EDITOR에게는 `pathTemplate`·`adapterName`·`repoOwner/repoName/baseBranch`를 내리지 않는다**(spec §4 표).

### `Locale` 조회 술어가 카운트와 다르다

spec §6은 "사라진 언어는 **표에는 남기되** 활성 언어 수에서는 제외"다. 같은 테이블을 **두 술어로 읽는다**:

- `loadSurfaceCounts`는 `NOT orphaned`로 센다(`lib/keys/query.ts:621`).
- 표를 그리는 `localeProgress`는 **orphaned를 포함한 목록**을 받아 맨 뒤로 정렬한다(`lib/keys/view.ts:508`).

⚠️ **통일하면 둘 중 하나가 깨진다** — `orphaned: false`로 통일하면 사라진 언어 행이 없어지고,
통일 없이 세면 활성 언어 수가 틀린다. 기존 조립이
`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx:50-58`에 있으니 **그것을 reader로 옮긴다.**

### 집계 정합성 — 트랜잭션이 아니라 clamp다

소스 수에 따른 N+1 금지: 프로젝트+활성 소스 메타 조회 1회 호출, `loadSurfaceCounts` 1회 호출.
Prisma의 관계 로딩에 따라 SQL이 나뉠 수 있지만 소스 수만큼 호출하지 않는다.
상세가 열릴 때만 선택 소스의 Locale 조회와 기존 `loadLocaleCounts`(count + 셀 상태 조회)를 더한다.
다른 소스의 번역 셀 상태까지 eager load하지 않는다. 조회 실패를 빈 목록으로 접지 않는다.

⚠️ **읽기 전용 repeatable-read 트랜잭션으로 묶지 않는다** (2026-09-22 판정 — 초안은 그렇게 적었다).
이유가 둘이다:

1. **측정된 병렬성을 되돌린다.** `loadLocaleCounts`(`lib/keys/query.ts:423-431`)는 `stringKey.count`와
   `translation.findMany`를 **의도적으로 `Promise.all`로** 보내고 그 근거가 주석에 있다
   (`lib/keys/query.ts:414-415` — "순차로 보내면 도쿄 리전 왕복이 하나 더 붙고, 그 고정 비용이 이미 실측돼 있다").
   interactive `$transaction`은 연결 하나에 문장을 직렬화하므로 감싸는 순간 그 왕복이 되살아난다.
2. **기본 timeout이 함정이다.** `app/(edit)/actions.ts:65-68`이 "상한이 Prisma 기본값(5초)이면 안 된다 —
   같은 `Project` 행을 30초 트랜잭션이 쥔다"를 근거와 함께 적어 뒀다. **Sources 상세는 온보딩 첫 적재
   직후에 처음 열리는 화면**이라 정확히 그 창에 선다.

**막으려는 실제 결함은 한 줄이다**: `localeProgress`(`lib/keys/view.ts:496-499`)의
`untranslated: input.total - translated - needsReview`와 `percent`에 clamp가 없다.
**기존 순수 함수에 경계 보정을 더한다** — 새 helper를 만드는 것이 아니므로 §5의 "새 progress helper 불필요"와
모순되지 않는다. 대가: 동시 적재 중 분모·분자가 수 밀리초 어긋날 수 있으나 **음수·100% 초과는 나오지 않는다.**

⚠️ **대량 적재 직후(ANALYZE 전) 첫 열기가 느릴 수 있다.** POSTMORTEM 2026-09-18(`docs/POSTMORTEM.md:2124`)이
남긴 후보 밴드에 `loadLocaleCounts`의 `surface: { archivedAt: null }` + `stringKey: { orphaned: false }`
(`lib/keys/query.ts:424-427`)가 들어 있다. A4 검증에 그 조건을 넣는다.

### 형식/시각

실제 형식 라벨은 `Chrome extension messages`, `JSON catalog`, `YAML catalog`,
`Code dictionary (one file per language)`, `Code dictionary (all languages in one file)`다.
시안의 짧은 JSON/TypeScript 라벨을 새로운 어댑터처럼 추가하지 않는다.
null 형식/경로는 "Not configured"로 표시하고 추론하지 않는다. 알 수 없는 adapterName도 안전한 미확정 라벨로 처리한다.

⚠️ **클라이언트가 직접 import하지 않는 것이 둘이다 — `formatLabel`과 `localeProgress`.**
`formatLabel`이 더 위험하다(`lib/onboarding/detect.ts:1-2`가 `@/lib/adapters` + `ts-dict`를 직접 물어
`ts-morph`가 따라온다). 그러나 `localeProgress`도 같은 부류다 — `lib/keys/view.ts:1`이
`@/lib/adapters/shared`를 물고, **`components/__tests__/client-graph.test.ts:391-396`이 바로 그 모듈을
네거티브 컨트롤로 쓴다**("`lib/keys/view.ts`의 그래프는 목록을 벗어나고 `lib/adapters/`에 닿는다").
**한쪽만 경고하면 다른 쪽이 "안전하다"로 읽힌다** — POSTMORTEM 2026-09-07(`docs/POSTMORTEM.md:525`)이
기록한 실패 모양이 정확히 그것이다. 둘 다 서버에서 계산해 문자열·카운트만 내린다.

⚠️ **새 `lib/sources/*.ts` 잎을 클라이언트가 import하면 `CLIENT_LIB_FILES`에 등재한다.**
`components/__tests__/client-graph.test.ts:91-150`이 55항목 **완전일치 핀**이고 단언이 `:384-388`이다 —
패키지 허용 목록이 아니라 파일 목록이므로 등재 없이는 red다. 그 등재는 "의도된 결정"으로 설계돼 있다.

`lastCommitAt` 쓰기 근거: `lib/push/apply.ts:402`의 `new Date(payload.commitAt)`,
`lib/import/run.ts:148`의 `new Date(snapshot.headCommittedAt)`.
새 화면에서는 원본 커밋 시각으로만 라벨링한다. `planSurfaceImportStatus.at`을 모든 state에서
동일한 "적재 시각"으로 표시하지 않는다. 기존 다른 화면의 시각 문구 교정은 이번 범위 밖이다.

⚠️ **`lastImportFailedAt`에는 backfill이 없다**(`prisma/schema.prisma:129-136`) —
POSTMORTEM 2026-09-13(`docs/POSTMORTEM.md:1253`). 낡은 실패 행의 빈 시각은 버그가 아니므로
spec §5의 "null이면 시각을 생략하고 추정하지 않는다"가 그 근거 위에 선다.

## 4. 쓰기와 이벤트·캐시

### 기준 언어

`updateBaseLocale`를 Sources의 `actions.ts`로 이동하고 기존 폼 import를 갱신한다.
입력 `{ slug, surfaceSlug, baseLocale }`, 결과 `BaseLocaleResult`는 보존한다.
`unknown-locale`·`orphaned-locale`·인가 실패·통신 실패를 필드 근처 문구로 구분한다.

프로젝트 → 소스 순서 잠금, 선언만 갱신, 실제 변경 때만 `surface.baseLocaleDeclared` /
`surface.baseLocaleDeclarationCleared` 기록, `revalidatePath(/projects/<slug>, "layout")`를 유지한다.
이 무효화는 Sources 목록·Translations·Settings 워크플로·Logs를 함께 덮는다.

⚠️ **이동하면서 `revalidateAfterCommit`을 지나게 한다.** 현재 `revalidatePath`가 트랜잭션 커밋 **뒤**
try 밖에 있어(`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/actions.ts:96`) 그것이 던지면
Action이 reject되고 클라이언트가 **저장된 선언을 "실패"로 말한다.** POSTMORTEM 2026-09-20
(`docs/POSTMORTEM.md:2318`)의 🔁 항목이 이 부류를 "파일이 아니라 **커밋 뒤에 무언가를 더 하는
Server Action**"으로 규정하고 조치가 `revalidateAfterCommit`이었다.
⚠️ **현재 그 헬퍼가 사본 둘로 존재하고 둘 다 비export다**
(`app/(edit)/projects/[slug]/settings/actions.ts:325`, `app/(edit)/account/actions.ts:57`).
**세 번째 사본을 만들지 않는다 — 한 곳에서 export하고 셋이 그것을 쓴다.**

상세는 클라이언트가 받은 응답이므로 revalidate만으로 갱신되지 않는다. 저장/재시도 성공 후 열린 상세를
`loadSourceDetail`로 다시 읽는다. 목록 refresh는 기존 무효화에 맡기며 결과 안내는 유지한다.
재조회 실패는 쓰기 실패로 뒤집지 않고 "저장/적재는 완료, 최신 상태를 불러오지 못함"으로 표시한다.
UI 보관 잠금 때문에 서버의 기존 메타데이터 허용 정책을 임의로 바꾸지 않는다.

`surface.baseLocale*` 이벤트는 타입 enum이 아니다 — `recordEvent`의 `subtype`은 `string`이고
`lib/events/view.ts:197·273·457`이 `subtype.startsWith("surface.baseLocale")`로 분기한다.
이번 설계는 새 subtype을 만들지 않으므로 기존 아이콘·문장을 그대로 쓴다.

### 첫 적재 재시도와 추가

`runFirstIngest({slug,surfaceSlug})`와 `addSurfaces`의 입력·결과·인가·이벤트·트랜잭션은 유지한다.
클라이언트의 버튼 판정은 서버 인가를 대체하지 않는다.
재시도 결과는 버튼이 사라져도 남는 고정 결과 영역에서 표시하고 선택한 surfaceSlug와 결합한다.

AddSourcesModal 성공 응답의 `results`는 이미 소스별 결과다. `summarizeAddResults` 합계 아래에
원래 항목의 `surfaceSlug/count/failed`를 각각 표시한다. `failed`는 소스 실패 개수가 아니다.
기존 callback이 버리는 `yaml`을 복원할 필요 없이, 이번 UI는 CI 반영 안내와 Settings 링크를 사용한다.
새 소스는 트랜잭션 커밋 뒤 성공 결과로 나타난다. 상태 `failed-after`(partial-import)를
"이 소스 생성 실패"로 읽지 않게 결과 문구와 상태 문구를 구분한다.

소스 목록의 결과 state는 추가 모달·조건부 행·readiness 분기 바깥이다.
`router.refresh` 후에도 유지되며 소스 추가 모달 닫기만으로 초기화하지 않는다.
최근 결과 하나를 보관하며 다음 결과가 대체한다. 페이지 재진입까지 영속 저장하지 않는다.

## 5. 상태·순수 함수 대상

`lib/sources/` 아래 잎 모듈에 추가한다. 네트워크/Prisma/어댑터 구현을 import하지 않는다.
일반 프레임워크나 범용 모달 상태 머신으로 확장하지 않는다.

⚠️ **`useReducer`는 이 리포에 0건이다**(`components/`·`app/`·`lib/` 전수). house style은
`plan*(state, input) → nextState | 판정` 순수 함수 + `useState`다(`planSave`·`planProjectAccess`·
`planSurfaceSelection`·`planImportConfirmation` …). 그래서 이름과 모양을 그쪽에 맞춘다.

| 함수/모듈 | 입력 → 출력 | 검증할 경계 |
|---|---|---|
| 기존 `firstQueryValues` | Raw add/e → 추가 복귀 의도 | 반복·빈 값·알 수 없는 add, source 쿼리 무시. 별도 파서 추가 없음 |
| `planSourceActions` | role/archived/설치 여부 + 기존 상태/readiness → canEdit/canRetry/canOpen | OWNER·EDITOR·설치 없음·첫 적재 전후·pending |
| `planBaseLanguageForm` | 서버 기준값/draft/submitted + 변경·refresh·성공·실패 → draft/baseline/pending/result | 성공/refresh 순서, pending 중 새 서버값+실패, 대기값 취소 |

**`planSourceExit`는 만들지 않는다** — 이탈 확인창이 없어졌으므로(spec §7) 판정할 것이 `closeDisabled` 하나다.

⚠️ **`canEdit`를 role 리터럴로 판정하지 않는다.** 기준 언어 쓰기 인가는 `project:settings`이고
(`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/actions.ts:57`), 기존 화면은
`canPerform(role, "project:settings")`로 그린다(`.../locales/page.tsx:64`).
`canPerform`(`lib/auth/permission.ts:34`)을 지나게 한다 — 그렇지 않으면 §4의 "클라이언트 버튼 판정은
서버 인가를 대체하지 않는다"가 지켜져도 **둘이 다른 답을 내는** 상태가 남는다.

집계·상태·기준 언어 대기를 새 함수에 재구현하지 않는다. 기존 결과를 조합한다.
새 progress 계산 helper는 불필요하다. 막대는 `localeProgress`의 세 카운트/total로 그린다(§3의 clamp는 별건이다).

### 3상태 재조정은 이미 구현된 관용구를 따른다

폼은 server baseline·draft·submitted를 분리한다. props 수신 시 baseline은 갱신하고 수정 중 draft는 보존한다.
성공이면 제출값을 저장된 필드값으로 수용하되, 이미 더 최신 서버값을 수신한 경우 덮지 않는다.

⚠️ **`components/translation-input.tsx:54-69`가 그 셋을 이미 구현한다**(`serverValue`/`saved`/`value` +
렌더 단계 재조정). 그 파일 주석이 "저장 중에도 취소 기준은 갱신한다. 성공하면 응답이 확정하고,
실패하면 최신 기준이 남아야 한다"까지 적어 뒀다. **§8이 인용한 POSTMORTEM 2026-09-12가 바로 그 파일의 사고다.**
새 모양을 발명하지 않고 그것을 따른다.

늦게 도착한 성공 전 props가 제출값을 되돌리는 문제를 **DOM 테스트로 고정한다** —
⚠️ **그 테스트는 지금 리포에 없다.** `BaseLocaleForm`을 렌더하는 DOM 테스트가 0건이고,
`components/__tests__/base-locale-screens.test.ts`는 `readFileSync` + 정규식 **소스 스캔**이다.
tasks B6a가 그것을 **신규 작성**한다.
이 화면에는 동시 편집 충돌 해결 기능을 추가하지 않고 기존 서버의 마지막 선언 쓰기 정책을 유지한다.

## 6. 컴포넌트와 디자인 대응

- `components/sources/sources-screen.tsx`: 목록·선택·결과 안내의 지속 소유자.
- `source-detail-modal.tsx`: 읽기·상태 카드·언어 표. 기존 `OnboardingModal` 재사용.
- `base-language-form.tsx`: 기존 BaseLocaleForm 이동/확장. 저장 경로를 하나로 유지.
- `add-sources-modal.tsx`: 기존 Settings 모달 이동, 내부 탐지 흐름은 유지.
- **`components/ui/modal.tsx`는 바꾸지 않는다** — `headerAction` 슬롯을 만들지 않는다(§1).

현재 코드의 이름은 `OnboardingModal`이며 `Modal` export가 아니다. `Card` 대신 `PanelCard`가 실제 프리미티브다.
`components/onboarding/add-surface.tsx`는 없고 `components/settings/add-sources-modal.tsx`가 현 구현이다.
핸드오프의 import 경로를 그대로 새 파일로 복제하지 않는다.

### 껍데기 — 1024를 고르고 640을 기각한다

⚠️ **리포에 껍데기가 셋이다.** `Dialog`(`max-w-110` = 440) · `OnboardingModal`(1024) ·
**`components/logs/event-dialog.tsx:48`(640 — 목록 위 상세 전용, 소비자 1)**.
셋째 것의 독스트링이 *"1024는 라우트를 대신하는 온보딩 껍데기라 Back/Next 푸터를 든다"*를 이유로
**1024를 명시적으로 기각**하고 DESIGN §6.68이 같은 판정을 적는다.

**이 화면은 1024를 쓴다**(사용자 확정). 따르는 경계 문장은 DESIGN §6.646의
*"답만 받는 확인은 440 · 읽어야 하는 목록이 있으면 1024"*다.
**640을 기각하는 이유**: 언어 표가 7열(코드·기준·완료/전체·완료율·검토 필요·사라짐 안내·`Open`)이라
640에서 접히고, 그 접힘을 spec §9의 완료 조건이 금지했다.
⚠️ **넷째 껍데기를 세우지 않는다** — `event-dialog.tsx:48`이 `100vh`를 쓰고 `shadow-medium`을 임의값으로
복제한 것이 "프리미티브 밖에 껍데기를 세우면 규칙 밖으로 나간다"의 실례다.

### 높이 — `min-h`가 하한으로 박혀 있다

⚠️ **상한만 보면 틀린다.** `components/ui/modal.tsx:161`에
`min-h-[min(80svh,800px,calc(100svh-96px))] max-h-[min(800px,calc(100svh-96px))]`가 함께 있고,
`modal.tsx:144-149`가 *"CSS는 `min-height`가 `max-height`를 이기므로"*를 근거로 적었다.
그래서 **기존 1024 소비자 전부가 `panelClassName`으로 높이를 내린다** —
`settings/add-sources-modal.tsx:67`(680) · `settings/ci-card.tsx:23`(640) ·
`publish-button.tsx:107-115`(갈래 9개). §6.646이 이유를 적는다:
*"한 값으로 묶으면 단계가 짧은 갈래에서 바닥 버튼이 허공에 뜬다."*

**세 갈래의 높이를 각각 정한다.**

| 갈래 | 높이 |
|---|---|
| 상세 본체(네 블록) | `min-h-[560px] max-h-[min(800px,calc(100svh-96px))]` — 본문만 스크롤 |
| 로딩 | 본체와 **같은 값**(도착 순간 껍데기가 안 튄다) |
| 오류(`failed`·`rejected`) | `min-h-0` — 문구 + 행동 둘이라 빈 판을 만들지 않는다 |

### 로딩·오류 — 라우트 층을 못 쓴다

⚠️ **DESIGN §6.68이 방금 걷어낸 것이 되살아난다.** 그 절의 *"의도된 이탈 1"*이
*"캔버스 `1i`는 **클라이언트 fetch를 전제**해 상세 전용 로딩·오류를 그렸는데, 상세를 **RSC가 그리기로**
하면서 그 둘이 `loading.tsx`·`error.tsx`가 됐다"*고 적는다.
상세 URL을 없애고 Server Action으로 조회하므로 **라우트 층을 못 쓰고 캔버스 `1i`가 돌아온다.**

스켈레톤 골격은 `components/ui/skeleton.tsx`를 쓰고 DESIGN §6.7·§6.63의 규칙을 따른다:
**행의 형이 실물과 같고, 개수는 실제보다 적게**(§6.7 — 골격이 실물보다 길면 도착하는 순간 밀려 올라온다),
**전역 스피너·진행률 숫자를 쓰지 않는다.** 네 블록 중 1·2·3은 제목 한 줄 + 값 한 줄, 4번은 언어 행 **셋**만 세운다.
오류는 문구 + [Retry](`failed`만) + [Close].

### 포커스 복구 — 이미 있는 관용구를 쓴다

⚠️ **두 층이 이미 있다.**

1. **프리미티브**: `components/ui/modal.tsx:153-155`의 `returnFocusRef` + `:disabled` 검사 +
   `fallbackFocusRef`. spec §4의 "진입 행이 없어졌으면 헤더로"가 곧 `fallbackFocusRef`다.
2. **선례**: `components/logs/event-dialog.tsx:49-53`의 `onCloseAutoFocus` +
   `getElementById(returnFocusId) ?? querySelector("h1")`. 착지점은 행 래퍼가 **`id` + `tabIndex={-1}`을
   쌍으로** 든다(`app/(edit)/projects/[slug]/logs/page.tsx:135`, `components/home/logs-card.tsx:46`).

⚠️ **`tabIndex={-1}`을 빠뜨리면 `getElementById`는 찾는데 `focus()`가 무시되고 `?.`에 삼켜져 조용하다.**
DESIGN §6.65가 그 문장을 적었고 `components/ui/row-card.tsx:72-83`이 프리미티브 층에서 짝을 강제한다.
⚠️ **`PanelHeader`는 포커스 가능한 `h1`을 주지 않는다** — 필요한 화면이 손으로 붙인다
(`components/home/actions.tsx:102`, `components/translations/header.tsx:87`).
⚠️ **저장 거부 뒤 포커스 복귀는 커밋 콜백이 아니라 `useEffect`여야 한다**
(`components/members/member-list.tsx:74-82`, `components/members/pending-invitations.tsx:52-60`,
커밋 `9890bf9` — `useTransition`의 `isPending`이 아직 true라 `disabled` 버튼에서 `focus()`가 무시된다).

### 진행 막대 — 기존 구현을 공유한다

⚠️ **독립 Meter 프리미티브는 없지만 구현은 있다.** `components/projects/locale-meter.tsx:43-45`가
트랙 `bg-foreground/[0.08]` · `h-1` · `rounded-full` · 완료 `bg-foreground/85` · 검토 `bg-amber-500` ·
폭만 인라인 style · **`aria-hidden`**(라벨 줄이 같은 사실을 글자로 말한다)로 서 있고
DESIGN §6.63의 치수표가 그 정본이다.

**그것을 값 변경 없이 공유한다** — `components/projects/`에서 공유 위치로 옮기는 것이 태스크 하나다.
다시 그리면 치수·색·radius·aria 여섯이 갈릴 자리가 생긴다 — POSTMORTEM 2026-09-20
(`docs/POSTMORTEM.md:2329`)의 근본 원인이 *"새 소비자가 생기는 순간 규칙은 남고 검사는 안 따라온다"*다.
**퍼센트 열은 `done`만** 쓴다(spec §6에 근거). 막대와 퍼센트가 다른 술어라는 사실을 주석에 남긴다.

### Alert가 서는 자리 넷

⚠️ **배치는 prop이 아니다** — `components/ui/alert.tsx:46`의 배치 관련 prop은 `inset` 불리언 하나이고
global·page-level·in-block은 호출부 컨벤션이다.

| 자리 | variant | 배치 | role |
|---|---|---|---|
| 목록의 고정 결과(추가·재시도) | `success` / `warning` | `inset`(DESIGN §6.6이 등재) | `status` |
| 상세의 적재 상태 블록 | `warning` / `danger` | in-block | `status` |
| 기준 언어 필드 오류 | `danger` | in-block(`components/locales/base-locale-form.tsx:98` 선례) | `alert` |
| 적용 대기 안내 | `info` | in-block | 없음 |

⚠️ **live 영역이 겹친다.** DESIGN §6.646이 *"알림은 한 곳이다. danger 갈래는 `Alert`의 `role="alert"`
하나이고 그때 껍데기의 live는 `off`다"*로 정했는데, 이 모달에는 상세 로딩·Save 결과·재시도 결과 셋이
동시에 live를 다툰다. **필드 오류가 떠 있는 동안 껍데기 live는 `off`다.**

### 좁은 폭 — `@container`이고 뷰포트 브레이크포인트가 아니다

⚠️ **셸이 `min-w-[1280px]`이라 리포는 뷰포트 분기를 만들지 않는다**(DESIGN §6.6 —
*"뷰포트 분기는 추가하지 않는다"*, `components/settings/sources-card.tsx:47-52`가 이미 `@max-[640px]:`로
이 카드의 좁은 폭을 다룬다). 모달만 `w-[calc(100%-96px)]`로 줄어 셸과 다른 규칙을 따른다.
**모달 본문에 `@container`를 걸고 접힘 경계는 640으로 둔다**(§6.6이 선례).
언어 표 7열은 640 아래에서 `사라짐 안내`를 행 아래 줄로 내린다 — **숨기지 않는다.**
tasks C2의 "창 960 / 모달 864"는 DESIGN §5가 **비대응으로 선언한 폭**이므로, 그 검증은
"1280 아래에서 가로 스크롤이 나는 것이 정상"과 충돌하지 않는 범위에서만 읽는다.

### 이관하는 카드가 등재된 결함을 들고 있다

⚠️ **`components/settings/sources-card.tsx:49`가 `"text-mono text-muted-foreground break-all text-xs"`로
같은 font-size 그룹을 한 정적 문자열에 두 번 쓴다.** DESIGN §4.2: *"정적 문자열 `"text-mono text-xs"`는
dedupe되지 않고 `text-xs`가 이긴다 → **13px sans**"*, 그리고 §4.1이 *"이제 글꼴만 바뀌어 눈으로는 안 보인다"*를 적는다.
**경로 셀을 옮길 때 `text-mono`를 단독으로 쓴다.**

기타: 폭 1024, 제목 20/500(`text-xl font-medium` — 껍데기 값과 일치), 기존 버튼·Alert 토큰을 따른다.
A0 로컬 대조(2026-09-22): `Modal.dc.html`의 머리·본문·바닥 좌우 여백은 **32px**이다.
48px는 모달 바깥 dim 여백이며 본문 여백이 아니다. 목록의 적재 상태는 **배지가 없는 평문**이다
(`Sources.dc.html` 1a). 소스 개수·사라진 언어 표시는 상태 배지와 별개다.
사용자 승인에 따라 구판 핸드오프의 확인창·headerAction은 적용하지 않고 최신 spec의 동작을 따른다.

별도 기능 컴포넌트가 전역 디자인 토큰을 바꾸지 않는다.
좁은 화면에서 적재 카드·일본어 행·고아 언어 안내를 숨겨 맞추지 않는다.
재시도/Save 성공·실패는 접근성 live 영역에 전달하며 행 버튼을 클릭 가능한 버튼 안에 중첩하지 않는다.

## 7. 제거/이전과 호환성

| 대상 | 작업 |
|---|---|
| `.../surfaces/[surfaceSlug]/locales/page.tsx` | 기존 화면 제거, 인가 후 Sources 목록 redirect만 유지 |
| `.../[slug]/locales/page.tsx` | default surface 우회 대신 Sources 목록으로 redirect |
| `.../locales/actions.ts` | Sources로 이동. 참조 갱신 후 옛 모듈 제거 |
| `components/locales/base-locale-form.tsx` | Sources로 이동, 기존 계약 유지 |
| `components/projects/locale-meter.tsx` | **공유 위치로 이동** (§6) — Projects 목록과 Sources 둘이 쓴다 |
| `components/settings/sources-card.tsx` | Sources 목록으로 대체 후 무사용이면 제거 |
| Settings page | SourcesCard/목록 전용 counts·ADAPTERS import 제거. CI용 surfaces 조회는 남김. **카드 다섯 → 넷** |
| AddSourcesModal | `components/sources/`로 이동, 복귀 URL 변경 |
| LocaleSurfaceSelector | Locales용 export와 호출만 제거. 번역 화면의 SurfaceSelector 유지 |
| `lib/shell/nav.ts` | key/label/icon/href 변경. Sources는 surfaceSlug에 따라 href를 바꾸지 않음 |
| `lib/routes.ts` | `sources` helper 추가(**`routes` 객체 안에** — §2). 옛 생성기는 내부 소비자 제거 후 정리하되 URL 수신 라우트는 유지 |
| `revalidateAfterCommit` | 사본 둘을 한 곳에서 export하고 Sources가 그것을 쓴다 (§4) |
| OAuth callback + add-surface 목적지 | 기존 `returnTo: add-surface` 유지, 호환 진입점이 새 추가 화면으로 연결 |

**함께 깨지는 테스트 넷을 이 단계에서 손댄다** (tasks B10):

- `app/__tests__/screens.test.ts:23·37-48`이 settings/page.tsx 소스에서 `<SourcesCard`의 **비조건부 렌더**를
  단언하고, `:307-323`은 `components/settings/sources-card.tsx`를 **경로로 직접 읽어**
  `lastImportError`·`importRetry`·`m.settings.sources.rerun` 존재를 단언한다. 카드를 옮기면 후자는 **ENOENT로 죽는다.**
- `app/(edit)/__tests__/add-surface-page-log.test.tsx:9-13`이 착지 URL
  `"/projects/alpha/settings?add=sources&e=reauthorize"`를 **문자열로 하드코딩**한다. §2가 그 착지를 바꾼다.
- `lib/__tests__/routes.test.ts:53-57`이 `routes.locales`를 고정하며 `routes.sources` describe가 없다.
- `lib/shell/__tests__/nav.test.ts:78-97·105-114·131-135`가 `"locales"` 키를 **리터럴로 세 곳** 고정한다.

새 사용자 문구는 `m.sources.*`에 모으고 `m.common.nav.sources`를 사용한다.
기존 상태·오류·보관·지원 형식 문구를 재사용하고 무사용이 된 locales/settings.sources 키만 정리한다.
용어 교체는 해당 화면/내비게이션에 한정한다. 내부 surface/locale 식별자와 타 화면을 기계 치환하지 않는다.

⚠️ **Logs 필터 라벨은 의도적으로 유지한다.** `messages/en.tsx:725`의
`m.logs.kinds.sources = "Sources & locales"`는 **이벤트 종류의 이름이고 화면 이름이 아니다** —
그 필터가 덮는 이벤트에 로케일 선언 변경이 들어 있어 낱말 둘이 다 필요하다.
tasks C3이 이 근거를 문서에 남긴다(그러지 않으면 다음 사람이 버그로 읽는다).

README/PRODUCT/ARCHITECTURE/DIRECTORY/DESIGN의 이전 정보는 구현 후 신선도 태스크로 갱신한다(C3).

## 8. 과거 함정과 검증

- POSTMORTEM 2026-09-05(`:425`), "라우트를 옮겼는데 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다":
  링크 생성기·이전 URL 수신자까지 함께 검증.
- POSTMORTEM 2026-09-07(`:525`), "클라이언트 번들에 7.2MB": `formatLabel`·`localeProgress`·워크플로 생성기·DB를
  client import하지 않음. **한쪽만 경고하지 않는다**(§3).
- POSTMORTEM 2026-09-07(`:575`), "`revalidatePath`가 방금 받은 적재 결과 문구를 씻어냈다": 결과 소유자는 상태 분기 밖.
- POSTMORTEM 2026-09-09(`:792` + 🔁 malmoi#20 `:807`), 일회용 허가: 초기 필드는 선언값.
  현재값으로 재초기화하여 대기를 취소하지 않음.
- POSTMORTEM 2026-09-09(`:833`), "화면을 라우트 밖으로 옮겼는데 … 무효화": 기존 project layout 무효화와 이벤트 유지.
- POSTMORTEM 2026-09-12(`:1137`), "저장 중 서버 값을 수신 처리했지만 실패 후 취소 기준은 옛 값":
  pending 중 refresh + 실패 교차를 DOM 검증. **그 사고의 파일이 `translation-input.tsx`이고 §5가 그것을 따른다.**
- **POSTMORTEM 2026-09-13(`:1253`)**, "임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다":
  `lastImportFailedAt`에 backfill이 없다는 사실이 §3 "형식/시각"의 근거다.
- **POSTMORTEM 2026-09-14(`:1565`)**, "TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다":
  공개 helper 시그니처를 tx로 넓히지 않는다(`applyPush`/`applyPushInTransaction`을 나눈 근거).
  **이번 설계는 트랜잭션을 아예 열지 않으므로 이 함정을 회피한다**(§3).
- **POSTMORTEM 2026-09-15(`:1827`)**, "상태로 좁힌 링크가 네임스페이스로도 좁혀져 0건에 착지했다":
  두 `Open` 링크에 `ns: ALL_NAMESPACES`(§2).
- **POSTMORTEM 2026-09-18(`:2124`)**, "관계 필터 count가 대량 적재 직후 5.5초였다":
  `loadLocaleCounts`가 그 후보 밴드다. A4가 ANALYZE 전 첫 열기를 잰다(§3).
- **POSTMORTEM 2026-09-20(`:2318`)**, "소스 추가 커밋 뒤 캐시 오류가 전체 롤백으로 보고될 수 있었다":
  `updateBaseLocale` 이동이 그 재발 단위다. `revalidateAfterCommit`을 지난다(§4).
- **POSTMORTEM 2026-09-20(`:2329`)**, "화면 하나에 세운 규칙 셋을 새 화면이 다시 어겼다":
  `locale-meter`를 다시 그리지 않고 공유한다(§6).

문서 참조의 정본은 [POSTMORTEM.md](../../POSTMORTEM.md)이며 위 제목으로 찾는다.
최종 검증은 [tasks.md](./tasks.md). 실제 브라우저에서 좁은 높이·포커스·스크롤·언어 Open 이탈을 확인한다.
