# Sources — 구현 순서

상태: 2026-09-21 계획. 갱신: 2026-09-22(`/feature-review` 4인 검수 반영 — 순서·검증문·범위 교정).
이번 feature 단계에서는 구현·테스트 실행·빌드·커밋하지 않는다.
검증 표기: **`[auto]`** = `pnpm test`/`typecheck`가 판정 / **`[pg]`** = `pnpm test:projects:postgres` /
**`[manual]`** = C2의 실제 브라우저에서만 관측 가능.

⚠️ **`[manual]`을 `[auto]`처럼 쓰지 않는다.** 이 리포엔 e2e가 없고, jsdom에는
`history`·`pushState`·`location`을 만지는 테스트가 **0건**이며 `vitest.setup.ts:25`가
`scrollIntoView`를 **no-op으로 채운다**(같은 파일 14-16행이 "회귀가 red가 아니라 무반응으로 나온다"고 경고).
POSTMORTEM 2026-09-20(`docs/POSTMORTEM.md:2278`)이 *"그것을 재는 테스트는 아무것도 안 재고 있었다"*다.

## 커밋 A — Sources 데이터·상태 계약

- [ ] **A0. 착수 차단 게이트.** 아래 둘이 닫히기 전에는 A1을 시작하지 않는다.
  - (a) **디자인 핸드오프 `design_handoff_sources`를 이 체크아웃에서 읽을 수 있게 한다.**
    현재 `spec §2`가 적은 경로는 홈 이름이 달라 존재하지 않고, 디스크·DesignSync 어디에도 없다.
    확보 후 spec의 경로를 이 머신 기준으로 고치고 수정본과 대조한다.
  - (b) **spec §10의 남은 제안 둘을 확정/보류로 기록한다**(Settings 링크 위치 → B10 / 사라진 언어 경로 → B7).
  - 검증: **열거 가능한 수로 판정한다** — ① spec §10에 미확정 제안이 **0개**다. ② 보류로 남긴 항목이 있으면
    그것을 소비하는 태스크(B7·B10)가 "이 값은 보류다"를 본문에 적었다. ③ A0에서 확인할 것으로 design §6이
    남긴 둘(본문 좌우 48의 정체 · 목록 상태의 배지 사용 여부)이 각각 값으로 적혔다.
  - ⚠️ 목록 순서(slug 오름차순)와 상세 URL 없음은 **확정이므로 재논의하지 않는다.**

- [ ] A1. 행 행동/폼 상태의 인터페이스·회귀 테스트를 먼저 작성한다.
  - 대상은 둘이다 — `planSourceActions`, `planBaseLanguageForm`. **`planSourceExit`는 만들지 않는다**
    (이탈 확인창이 없어졌다, spec §7).
  - 검증: `[auto]` EDITOR 재시도 불가, 설치 없음, first/after 구분, pending+refresh+실패 교차,
    대기값 재선택으로 취소가 각각 red로 선다.

- [ ] A2. `lib/sources` 잎 함수를 구현하고 기존 상태·기준 언어 판정을 재사용한다.
  - `canEdit`는 `canPerform(role, "project:settings")`를 지난다(design §5).
  - 검증: `[auto]` A1 green, 기존 base-locale/base-pending/import-status 테스트 green.
    **"서버 모듈 import 없음"을 직접 센다** — `lib/sources/` 잎 파일에 `@/lib/db`·`server-only`·
    `@/lib/adapters` import가 **0**임을 소스 검사로 단언한다.
    ⚠️ `components/__tests__/client-graph.test.ts:241-243`은 `"use client"` 진입점을 스캔하므로
    **커밋 A 시점엔 `lib/sources/`를 보지 않는다** — 그 검사에 기대면 아무것도 안 잰다.

- [ ] A2a. `localeProgress`에 clamp를 더한다(design §3).
  - `untranslated`는 0 미만이 되지 않고 `percent`는 0..100을 벗어나지 않는다.
  - 검증: `[auto]` `total < translated + needsReview`인 입력에서 음수·100% 초과가 안 나오고,
    기존 `localeProgress` 테스트가 전부 green이다. **새 helper를 만들지 않았다**(기존 함수에 경계 보정만).

- [ ] A3. Sources reader 테스트를 먼저 작성한 뒤 목록+선택 상세 조회를 구현한다.
  - `Locale` 조회는 **orphaned를 포함한 목록**이고 카운트는 `NOT orphaned`다 — 두 술어를 통일하지 않는다(design §3).
  - `getSurfaceAccess`의 `surface`를 스프레드하지 않고 reader의 명시 projection만 싣는다(design §3).
  - 검증: `[auto]` 프로젝트 A/B 격리, 보관 소스·고아 키/언어, **소스 1개와 5개에서 `findMany` 호출 수가
    같다(= k회)**, 상세 미선택 시 셀 조회 0, 원본 번역·`lastImportToken`·`nestedByPath` 미전달,
    실패를 빈 목록으로 바꾸지 않음, EDITOR 응답에 `pathTemplate`·`adapterName`·`repo*`가 **없음**.

- [ ] A4. 집계 일관성을 실제 PostgreSQL에서 검증한다.
  - **파일 경로: `lib/keys/__tests__/sources-progress.integration.ts`.**
    ⚠️ **`lib/sources/__tests__/`에 두지 않는다** — `vitest.projects.config.ts:9`의 include가
    `lib/keys/__tests__/*.integration.ts`와 `lib/events/__tests__/*.integration.ts` **두 디렉터리
    하드코딩**이고, `vitest.config.ts:36`은 `*.test.{ts,tsx}`만 모아 `.integration.ts`가 확장자에서 탈락한다.
    다른 곳에 쓰면 `pnpm test`·`test:projects:postgres`·PR CI **셋 다 그 파일을 한 번도 실행하지 않는다**
    (POSTMORTEM 2026-09-10, `docs/POSTMORTEM.md:1053`이 정확히 이 구조였다).
  - [ ] A4a. 위 경로로 두지 못할 사정이 생기면 `vitest.projects.config.ts`의 include를 넓히고,
        **수집 파일 수가 실제로 늘었는지** 확인한다(넓히기만 하고 안 걸리는 경우를 배제한다).
  - 검증: `[pg]` `210/12/26 → 완료율 84%`이고 **막대의 채워진 길이는 `(210+12)/248 ≈ 89.5%`로 다른 값이다**,
    전체 0 → `0%`, 같은 언어 코드의 다른 소스, 고아 키 제외 분모.
    **동시 적재 읽기에서 음수·100% 초과가 생기지 않는다**(A2a의 clamp가 그것을 진다 — 트랜잭션이 아니다).
    **대량 적재 직후 ANALYZE 전 상세 열기**의 쿼리 시간을 기록한다(POSTMORTEM `:2124`의 후보 밴드).

## 커밋 B — 목록·모달·이전 경로 전환

⚠️ **순서가 바뀌었다.** 모달 껍데기(B3)가 화면 소유자(B2)의 닫기·포커스 검증과 상세 연결(B4)보다
**먼저** 선다 — 렌더된 모달이 없으면 그 둘의 검증이 관측 대상을 못 가진다.

- [ ] B1. `routes.sources`/쿼리 수신자/인가/레거시 redirect 테스트를 먼저 작성한다.
  - `sources`는 **`routes` 객체 안에** 추가한다 — 문자열 연결이면 `entry-points.test.ts:466`의
    쿼리 수신자 검사를 통째로 회피한다(design §2).
  - 검증: `[auto]` 옛 두 Locales URL, add-surface, Settings add, OAuth `e` 복귀, 없는 소스,
    반복 add/e, `source` 쿼리 무시, EDITOR add 직접 진입이 기대 화면에 도달한다.
    **보관 프로젝트는 역할별로 갈라 단언한다** — OWNER는 Settings 복원 링크, EDITOR는 소유자 요청 안내
    (spec §4가 그 둘을 다른 문구로 정했다). 새 page/action이 `entry-points.test.ts`의 `callsGuard`에
    실제로 걸리는지 확인한다(POSTMORTEM `:2132` — 이름이 아니라 호출을 센다).

- [ ] B2. `locale-meter`를 공유 위치로 옮긴다.
  - `components/projects/locale-meter.tsx`를 값 변경 없이 이동하고 Projects 목록의 import를 갱신한다.
  - 검증: `[auto]` 기존 Projects 목록 테스트 green, 이동 전후 클래스 문자열이 **바이트 동일**,
    `aria-hidden`이 유지된다. 두 번째 구현을 만들지 않았다(grep으로 막대 구현이 하나임을 센다).

- [ ] B3. SourceDetailModal 껍데기를 구현한다. **`components/ui/modal.tsx`는 건드리지 않는다.**
  - 바닥 행동은 `Open translations` + `Close`. 헤더 보조 행동 없음. `headerAction` 슬롯을 만들지 않는다.
  - 높이 세 갈래(본체·로딩·오류)를 `panelClassName`으로 각각 준다(design §6) —
    ⚠️ 안 주면 `min-h`가 하한으로 이겨 로딩·오류가 800px 빈 판이 된다.
  - 로딩은 스켈레톤이고 1·2·3 블록은 제목+값 한 줄, 4번은 언어 행 **셋**만 세운다(design §6).
  - 검증: `[auto]` 기존 onboarding-modal DOM 테스트 green(슬롯을 안 더했으므로 **소비자 다섯의 헤더 DOM이
    불변**임이 자동으로 따라온다), 바닥 버튼 둘의 접근 이름, 로딩 골격의 행 수가 3, 오류 갈래에
    `failed`일 때만 [Retry]가 있다. `[manual]` 낮은 창 높이에서 세 갈래 모두 바닥 버튼이 화면 안에 있다.

- [ ] B4. Sources 페이지와 안정적인 클라이언트 화면 소유자를 구현한다.
  - 검증: `[auto]` **결과 state가 선택 변경·`router.refresh`로 재마운트되지 않는다**(마운트 카운터로 센다).
    선택 상태를 `searchParams`에서 **읽지 않는다**(소스 검사 — "전체 새로고침은 목록"의 실제 판정 가능한 형태다).
    `[manual]` 상세 열기/닫기에 주소·브라우저 이력이 불변, 전체 새로고침이 목록으로 착지,
    닫은 뒤 목록 **스크롤 위치** 복구.
    ⚠️ 주소·이력·스크롤은 `[auto]`로 쓰지 않는다 — `router.push`가 소스에 없음을 세는 검사가 되면
    POSTMORTEM `:2132`의 형이다.

- [ ] B5. 상세 읽기 Server Action과 클라이언트 로딩·재시도를 연결한다.
  - 결과는 `ok`/`rejected`/`failed` **세 갈래**이고 [Retry]는 `failed`에만 붙는다(design §3).
  - 검증: `[auto]` 매 호출 인가, A/B 소스 격리·보관·권한 회수, 읽기 중 revalidate/쓰기 **없음**,
    늦게 도착한 이전 소스 응답 무시, 저장/적재 후 열린 상세 재조회, 재조회 실패가 쓰기 성공을 실패로
    뒤집지 않음, `rejected`에 [Retry]가 **없음**.

- [ ] B6. 기존 기준 언어 Action/폼을 Sources로 이동하고 상태·오류 UI를 연결한다.
  - `revalidateAfterCommit`을 지난다. **사본 둘을 한 곳에서 export하고 세 번째 사본을 만들지 않는다**(design §4).
  - [ ] B6a. **`base-language-form`의 DOM 테스트를 신규 작성한다.**
        ⚠️ `BaseLocaleForm`을 렌더하는 DOM 테스트가 지금 **0건**이고,
        `components/__tests__/base-locale-screens.test.ts`는 `readFileSync` + 정규식 **소스 스캔**이다.
        reducer가 green인 것과 폼이 그 reducer를 그렇게 부르는 것은 다른 사실이다 —
        POSTMORTEM `:1137`을 잡은 것은 순수 함수가 아니라 `translation-interactions.test.tsx`의 DOM 회귀였다.
  - 검증: `[auto]` 선언만 저장, 기존 잠금 순서·이벤트(`surface.baseLocaleDeclared`/`…Cleared`)·
    `revalidatePath` 유지, **`revalidatePath` 예외를 주입해도 결과가 `{ ok: true }`**,
    거부 넷 구분(`unknown-locale`·`orphaned-locale`·인가 실패·통신 실패),
    현재 적용값 재선택으로 대기 취소, **pending 중 새 서버값 수신 + 그 뒤 실패에서 입력이 보존되고
    기준값이 최신 서버값**, 늦게 도착한 성공 전 props가 제출값을 되돌리지 않음.
    `[manual]` 저장 거부 뒤 포커스가 Save로 돌아온다(`useEffect`여야 한다 — 커밋 `9890bf9`).

- [ ] B7. 적재 상태·언어 표·시각 문구를 연결한다.
  - 검증: `[auto]` First/Last 실패 구분, EDITOR 재시도 버튼 **부재**, 설치 없음 안내(+ **EDITOR에게는
    Settings를 가리키지 않음** — spec §4), `Source commit` 라벨, **null 시각 생략**,
    **`partial-import`가 경고를 유지하고 최초 실패로 바뀌지 않음**(상태 블록의 계약 — B8의 추가 결과와 다른 자리),
    **`adapterName`/`pathTemplate` null → "Not configured"**, 알 수 없는 adapterName → 미확정 라벨,
    다국어 파일의 고아 언어 안내, 절대 시각이 `<time dateTime>` + UTC `aria-label`이고 상대 표기는
    `importing` 하나뿐, 완료율은 `done`(84%)이고 막대 채움은 `(done+review)`로 **둘이 다른 값**,
    세 막대 폭의 합이 트랙을 넘지 않음.
  - 비활성 `Select`는 `onPointerDown`·`onClick`·`onKeyDown` **셋을 다 막는다**(POSTMORTEM `:2227`).
    꺼진 형은 `aria-disabled`이고 `loading`과 겸용하지 않는다.

- [ ] B8. 저장 중 이탈 잠금을 연결한다.
  - ⚠️ **대폭 축소됐다** — 확인창이 없으므로 18칸 매트릭스가 사라지고 `closeDisabled` 하나다.
    `components/ui/modal.tsx:129`의 `onOpenChange`가 이미 그것을 보므로 새 배선이 거의 없다.
  - 검증: `[auto]` 저장 중 X·Close·바닥 `Open translations`·언어 행 `Open`이 **비활성**,
    저장 중이 아니면 여섯 경로가 확인창 없이 즉시 실행. `[manual]` 저장 중 **Esc·배경 클릭**이 닫지 않음
    (⚠️ Dialog를 Escape로 닫는 jsdom 선례가 리포에 **0건**이다 — `[auto]`로 쓰면 harness를 신설해야 한다).

- [ ] B9. AddSourcesModal을 이동하고 결과 안내를 목록의 고정 영역에 연결한다.
  - 검증: `[auto]` 요청 원자 실패 / 성공 + 부분 적재 경고 / 응답 불명을 **셋으로 구별**,
    소스명별 결과·워크플로 안내, `router.refresh` 후 결과 존속, 성공 뒤 가짜 `importing` 없음,
    `failed`가 "소스 생성 실패"로 읽히지 않음.

- [ ] B10. Settings의 소스 카드·LocaleSurfaceSelector를 제거하고 내비게이션을 전환한다.
  - **여기서 함께 손대는 기존 테스트 넷** (design §7):
    - `app/__tests__/screens.test.ts:23·37-48`(`<SourcesCard` 비조건부 렌더 단언)과
      **`:307-323`(`components/settings/sources-card.tsx`를 경로로 직접 읽는다 — 옮기면 ENOENT로 죽는다)**
    - `app/(edit)/__tests__/add-surface-page-log.test.tsx:9-13`(착지 URL 문자열 하드코딩)
    - `lib/__tests__/routes.test.ts:53-57`(`routes.locales` 고정 — `routes.sources` describe 신설)
    - `lib/shell/__tests__/nav.test.ts:78-97·105-114·131-135`(`"locales"` 키를 리터럴로 세 곳)
  - 경로 셀을 옮길 때 **`text-mono`를 단독으로 쓴다** — 현재 `sources-card.tsx:49`가
    같은 font-size 그룹을 한 정적 문자열에 두 번 써 `text-xs`가 이기고 13px sans가 된다(DESIGN §4.2).
  - 검증: `[auto]` Sources 단일 관리 진입, **Settings 카드가 넷**, 번역 화면의 `SurfaceSelector`와
    Settings CI YAML 유지, 새 링크 생성기만 내부 사용, 옛 URL은 호환 redirect,
    연결 복귀의 `e` 안내 보존, 경로 셀에 `text-mono`와 `text-xs`가 같은 문자열에 함께 없음.

- [ ] B11. 변경 때문에 생긴 무사용 컴포넌트·문구만 정리한다.
  - 검증: `[auto]` `base-locale-screens`·`settings-sources`·`add-surface`·
    `lib/shell/__tests__/nav.test.ts`·`entry-points`·`screens`·`add-surface-page-log`·`routes`
    **여덟**이 새 경로를 검사한다. 기존 unrelated dead code는 제거하지 않는다.

## 커밋 C — 검증·문서 신선도

- [ ] C1. 영향 테스트를 실행한다.
  - `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres` green.
    ⚠️ `pnpm test:projects:postgres`가 필수인 이유: design §3이 `loadLocaleCounts`/`loadSurfaceCounts`를
    쓰고 그 둘은 `lib/keys/query.ts:423·617`에 산다 — CLAUDE.md의 "`lib/keys/**`를 건드렸으면 손으로 돌린다"가
    실제로 발동하는 배송이다. `pnpm test:credentials:postgres`는 **해당 없다**(그 스위트가 단언하는
    앱 전역 값 여섯을 이 기능이 건드리지 않는다).
  - 새 DOM 테스트에 필요한 둘을 빠뜨리지 않는다:
    - ⚠️ **포커스 shim** — jsdom에는 "`disabled`가 되는 요소에서 포커스를 body로 옮기는" 브라우저 규칙이 없다.
      이 리포에서 그것을 실제로 잰 유일한 선례 `components/__tests__/members-focus.test.tsx:49-61`이
      `MutationObserver`로 그 규칙을 직접 흉내 낸다. **그 shim 없이 포커스 단언을 쓰면 POSTMORTEM `:2278`과
      같은 "재는 척하는 테스트"가 된다.**
    - ⚠️ **`vi.setConfig({ testTimeout: 20_000 })`** — `user-event`를 쓰는 기존 17파일 중 그것을 가진 것은
      **3개뿐**이고, POSTMORTEM 2026-09-13(`docs/POSTMORTEM.md:1237`)의 재발 방지가 "그 파일 머리에만 둔다"다.
      이 기능의 새 DOM 테스트는 Select + 모달 + 이탈 경로로 무거워진다.
  - ⚠️ **`pnpm build`는 여기서 돌리지 않는다**(`/push` 1단계의 게이트다). 따라서 **이 태스크는
    "required gate 통과"를 선언하지 않는다** — `/push`에 넘기는 잔여 위험을 명시한다:
    신규 클라이언트 컴포넌트 넷 이상(`sources-screen`·`source-detail-modal`·`base-language-form`·
    `add-sources-modal`)의 **RSC 경계**(`"use client"` 누락 · 서버 컴포넌트의 클라이언트 훅 ·
    Server Action 직렬화 위반)는 `next build`만 잡는다.
  - `lib/sources/` 잎을 클라이언트가 import하면 `client-graph.test.ts`의 `CLIENT_LIB_FILES` 55항목
    **완전일치 핀**에 등재한다(design §3). Codex 미러 드리프트 테스트도 포함한다.

- [ ] C2. 실제 브라우저에서 시안과 동작을 대조한다. **`[manual]` 항목 전부가 여기로 모인다.**
  - **`/bugshot-qa`(동작하나) 와 `/design-sync`(시안과 같은가) 를 둘 다 돈다** — A0에서 핸드오프를
    확보했으므로 후자가 성립한다. 전자는 로컬, 후자는 computed style + CDP 접근성 트리다.
  - 체크리스트: OWNER/EDITOR 두 역할(EDITOR에게 경로·형식·저장소/브랜치와 상세 1번 블록이 **없음**) ·
    최초·이후 실패 · 대기 변경 · 언어 `Open`의 착지가 **0건이 아님** · OAuth 복귀 ·
    1440×900 및 창 960/모달 864 · 낮은 창 높이에서 Save/Close 도달 ·
    **닫은 뒤 스크롤 위치와 진입 행 포커스 복구**(진입 행이 없어진 경우 헤더) ·
    저장 중 Esc·배경 클릭이 닫지 않음 · 저장 거부 뒤 포커스가 Save로 · 소스 0개 화면 두 역할 ·
    상세 로딩·오류 세 갈래의 높이 · 두 폭 모두 같은 적재 카드·ja 행·고아 복구 안내가 보이고 클리핑이 없음.
  - ⚠️ **못 밟은 갈래는 "검증했다"고 적지 않는다.** 소스 0개는 dev DB에 그 상태의 프로젝트가 필요하고,
    `bugshot-i18n-test-qa`는 **지우지 않는다**(CLAUDE.md).

- [ ] C3. 문서 신선도. **문서별 전용 커밋으로 쪼갠다**(`docs(PRODUCT): …` / `docs(DESIGN): …` 꼴).
  - 대상과 판정 방법:
    - **PRODUCT** — §3(EDITOR 노출 제한: 이번 기능이 **제한을 유지**했음을 확인만 한다, 갱신 불필요) ·
      **§7.1:341 "설정은 다섯 카드다" → 넷** · §7.7 IA 표의 세 줄(`/locales` ·
      `/surfaces/:surface/locales` · `/surfaces/new`)과 **`/projects/:slug/sources` 신규 행** · §7.7 결정.
    - **DESIGN** — **§6.5**(사이드바 프로젝트 축의 `Locales`(`Globe`) 항목과 *"순서가 시안이다 —
      Locales가 Translations 앞이다"* 근거 문장) · **§6.6**(소스 카드 계약 — 2026-09-20 확정) ·
      **§6.66**(언어 화면 절 **전체**) · **§7 접근성**(*"표면 선택기는 Translations·Locales의 패널 머리에만 둔다"*) ·
      §6.63(막대 소비자가 둘이 됐다는 사실) · Sources 화면 절 신설.
      ⚠️ **§6.66의 *"코드는 `text-mono`"*는 이미 거짓이다** — 실제 코드는 sans이고 파일에 근거 주석이 있다
      (`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx:106`, §4.1이 2026-09-11에
      로케일 코드를 mono에서 걷었다). **절을 지우기 전에 이 한 줄을 고쳐 둔다** — 안 그러면 정본을 읽고
      구현하는 사람이 mono를 되살린다.
    - **DIRECTORY** — `components/sources/`·`lib/sources/` 신설, `components/locales/` 제거,
      `locale-meter` 이동.
    - **ARCHITECTURE** — 이 기능이 불변식을 바꾸지 않으므로 §0은 손대지 않는다. 화면 목록만 갱신.
    - **README** — CLAUDE.md 요약 미러이고 **LNB 항목이 바뀐다**.
  - **Logs 필터 라벨은 의도적으로 유지한다** — `messages/en.tsx:725`의 `"Sources & locales"`는
    이벤트 종류의 이름이고 화면 이름이 아니다. **그 근거를 문서에 남긴다**(안 남기면 다음 사람이 버그로 읽는다).
  - 검증: 위 각 문서에서 Settings/Locales 소유권을 단언하는 문장을 grep해 **몇 개를 찾아 각각 수정/유지로
    판정했는지 목록으로 남긴다.** "일치한다"로 끝내지 않는다. POSTMORTEM은 이번에 수정하지 않는다.

- [ ] C4. 완료 조건을 점검한다.
  - 검증: **spec §9의 체크박스 열셋을 하나씩 근거와 짝지어 표로 남긴다** — 근거는 테스트 파일명 또는
    C2의 관측 항목이다. 미확정 사용자 제안 **0개**, 환경변수·마이그레이션 추가 **없음**,
    `components/ui/modal.tsx` diff **0줄**. 디자인 변경으로 구현 범위가 늘었으면 별도 승격 없이 사용자에게 남긴다.

커밋 경계는 후속 실행을 위한 계획이다.
⚠️ **커밋 A는 UI 소비자가 0인 reader를 남긴다** — typecheck·`pnpm test`는 통과하지만(미사용 export를 잡는
린터가 없다) 커밋 A 단독의 관측 가능한 동작은 A4의 `[pg]` 검증뿐이다. 그것이 의도이며, A를 dev에 먼저
보내지 않고 **A와 B를 같은 푸시에 담는다.**
Codex 커밋에는 Codex 트레일러를 붙이고 원격 push는 Claude Code가 담당한다.
