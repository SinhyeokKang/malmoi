# DIRECTORY — 어디에 무엇이 있고 왜 그렇게 생겼나

**구조를 바꾸기 전에 읽는다.** 여기 있는 ⚠️는 전부 실제로 밟은 지뢰이고, 대부분 그 자리를 지키는
테스트가 짝으로 있다. 불변식의 정본은 [ARCHITECTURE.md](./ARCHITECTURE.md), 제품 판정은
[PRODUCT.md](./PRODUCT.md)다.

## app/ — 라우트

```
app/
  page.tsx              랜딩 자리의 redirect 껍데기. 세션 상태만 보고 landingTarget이 정한 곳으로.
                        ⚠️ 로그인 상태면 /projects다 — 랜딩이 선 뒤에도 그렇다. 쿼리를 읽지 않는다
  signin/page.tsx       로그인(GitHub·Google). Auth.js의 pages.signIn·pages.error가 여기다.
                        ⚠️ middleware matcher에 넣으면 로그인이 통째로 죽는다 — 경로를 안 보므로
                        쿠키 없는 모든 요청이 자기 자신으로 307을 돈다(entry-points가 부정 단언으로 고정)
                        ⚠️ ?error= 없이도 세션이 unavailable이면 문구를 띄운다
                        ⚠️ 초대에서 온 왕복이 여기서 끝나면 돌아가는 링크를 든다 — 자리를 아는 것은
                        authjs.callback-url 쿠키뿐이고, 갈래가 invite일 때만 세운다(open redirect)
  signin/link/[challenge]/   계정 병합 안내. 인가가 없고 challenge가 대신한다 → matcher 밖.
                        ⚠️ 만료를 이 화면으로 말하지 않는다 — /signin으로 되돌린다
  privacy/ · docs/      공개 문서(placeholder). 둘 다 components/public-doc.tsx — 돌아가는 링크가 요지다
  layout.tsx            루트 레이아웃(Pretendard <link>). ⚠️ lang="en" — screens.test.ts가 고정한다
  globals.css           Tailwind 4 @theme. ⚠️ @custom-variant dark 한 줄이 라이트를 고정한다
  __tests__/            entry-points(진입점 소스 스캔 — 모든 page·route·actions가 인가를 지나는지 fs로
                        센다. 예외 아홉을 이름으로 고정 + routes.ts↔라우트 대조 + 쿼리 생성기/수신자 대조)
                        · screens(lang·revalidate 안전·보관 갈래 다섯) · security-headers(next.config를 불러서)
  (edit)/               인증 필요. 1차 차단은 middleware, 본판정은 각 진입점
    layout.tsx          셸. ⚠️ {children}을 흰 패널로 감싸지 않는다 — 감싸면 오른쪽 패널이 갇힌다.
                        ContentPanel은 각 갈래의 레이아웃이 든다(shell-layout.test.ts가 라우트마다
                        정확히 하나인지 센다)
    error.tsx           오류 경계. ⚠️ 예외 메시지를 그대로 뿌리지 않는다
    actions.ts          saveTranslation · triggerPullAction. ⚠️ 무효화는 /projects/<slug> 서브트리다 —
                        그 행을 읽는 화면이 셋이라 경로를 나열하면 넷째가 조용히 빠진다
    projects/           목록(?q=) · loading.tsx 스켈레톤 · new/(온보딩 딥링크) · actions.ts
      layout.tsx        children·modal을 마크업 없이 나란히 렌더 — [slug] 하위 패널을 중첩하지 않는다
      new-project-modal.tsx  두 생성 진입점의 서버 공통 모달. 리포 조회는 Suspense 뒤이고 목록은 읽지 않는다
      @modal/(.)new/    클라이언트 네비게이션용 모달. requireUser 후 모달만, 닫기는 router.back()
      @modal/default.tsx · @modal/page.tsx · @modal/[...rest]/page.tsx
                        기본 복원·목록 복귀·다른 프로젝트 경로에서 null. 활성 슬롯이 이동 후 남는 것을 막는다
                        ⚠️ actions.ts의 인가가 export마다 따로다 — 공용 헬퍼로 빼면 entry-points가 못 센다
                        ⚠️ 온보딩 다섯은 requireUser뿐이다(인가할 프로젝트가 없다)
    account/            사용자 축의 유일한 화면. requireUser만 지난다 · loading.tsx 스켈레톤
                        (⚠️ ContentPanel을 안 든다 — 이 라우트는 layout.tsx가 든다. /projects만
                        페이지가 들어서 그쪽 loading.tsx가 패널을 드는 것이고, 여기서 또 들면 두 겹이다)
    projects/[slug]/    프로젝트 축. layout.tsx가 ContentPanel + ProjectPanel을 든다
                        ⚠️ 레이아웃은 인가의 차단 지점이 될 수 없다(페이지와 병렬 렌더) — 서버 데이터를 안 읽는다
      page.tsx          Home(착지점). ⚠️ 툴바 지표를 복제하지 않는다 · 착지 클릭 하나를 링크로 갚는다
      translations/ locales/  저장된 defaultSurfaceId로 보내는 legacy redirect
      surfaces/[surfaceSlug]/translations/  번역 표(로케일 = 행). URL 계약은 ns·locales·q
                        ⚠️ maxDuration=60이 여기 있어야 한다 — 없으면 기본 300이 STALE_AFTER_SECONDS와
                        같아져 정상 실행이 스스로를 stale로 본다
                        ⚠️ 헤더를 무조건 렌더한다 — Publish 결과 Alert가 그 안이라 조건부 분기에 두면
                        router.refresh()가 방금 받은 결과를 언마운트한다
      surfaces/[surfaceSlug]/locales/  로케일·base 선언. requireSurfaceAccess 뒤 projectId + surfaceId로 조회
      surfaces/new/    OWNER 전용 Add surface. 기존 리포 재탐지·직접 URL·OAuth 복귀 (maxDuration 60)
      not-found.tsx    없는 표면의 제품 안내와 Projects 복귀
      members/ logs/ settings/
                        ⚠️ 넷 다 게이트가 translation:write다(settings만 project:settings) — EDITOR도
                        목록을 보고 컨트롤만 role로 갈린다. 판정은 Action이 한다
                        ⚠️ logs에 try가 없다 — 조회 실패는 던져야 "없음"과 다른 화면이 된다
    __tests__/          harness(메모리 DB) + harness 자기검사 + 흐름·인가·멤버십·연결·게시실패·온보딩·
                        조회·셸레이아웃·보관·리포설정·sync 열둘
  invite/[token]/       ⚠️ (edit) 밖이고 matcher 밖이다 — 비로그인으로 열려야 토큰이 보존된다.
                        갈래는 planInviteView가 고른다(화면이 조건을 다시 적지 않는다)
  api/push/             CI → DB. Bearer가 그 프로젝트의 토큰 원문이다(서버 env가 아니다)
  api/push/failure/     CI가 **적재에 실패했다는 사실**만 남긴다(2026-09-13). 파싱이 깨지면 /api/push는
                        아예 안 불려서 그 실패가 대상 리포 로그에만 있었다. 같은 토큰 · 코드 넷 ·
                        본문 4 KiB · 키/번역/커밋 기준점을 건드리지 않는다
  api/pull/             DB → PR. cron 전용(CRON_SECRET)
  api/github/callback/  ⚠️ matcher에 넣지 않는다 — 로그인 화면으로 302되면 code가 사라진다
middleware.ts           인증 차단의 유일한 1차 지점. matcher 둘(/projects/:path* · /account).
                        렌더 요청(GET·HEAD)만 막고 Action POST는 통과시킨다
```

## components/

```
components/
  ui/                   ⚠️ 이 리포가 소유하는 프리미티브 19개 + tone.ts 헬퍼 (skeleton이 2026-09-13에
                        붙었다 — 회색 블록 값이 두 벌로 갈리지 않게 bg-foreground/5 하나를 든다). CLI로 신규 추가는
                        허용하되 기존 파일을 덮어쓰지 않는다. 라이트 단일, dark: 0곳
                        ⚠️ 포커스 링 셋을 여는 태그에 리터럴로 적는다 — cva 베이스나 공유 상수에
                        모으면 focus-ring 스캐너가 그 파일을 통째로 못 본다(Button에 asChild가 없는 것도 같은 이유)
                        ⚠️ asChild가 닿는 프리미티브는 {children}을 Slot.Slottable로 감싼다 — 형제를
                        렌더하면 Radix Slot이 던지고 그 트리가 죽는다(프로덕션에 있었다)
                        ⚠️ Table은 프리셋 둘·구현 하나다(Th/Td/Tr이 TableHead/Cell/Row를 감싼다)
                        ⚠️ file-input(19번째)의 <input type="file">은 tabIndex={-1} + aria-hidden이다 —
                        type="hidden"이 될 수 없는 태그라 포커스 대상에서 빼고 보이는 컨트롤을 Button에
                        맡긴다. 링을 숨은 input에 붙이면 보이지도 않는 요소가 링을 들고 검사만 green이다
  shell/                앱 셸. ⚠️ 루트가 h-svh overflow-hidden이고 min-h-svh가 아니다 — min-이면
                        aside가 문서 높이만큼 늘어 Sign out이 화면 밖으로 나간다(malmoi#13)
                        ⚠️ min-w-[1280px]과 CONTENT_MAX(max-w-7xl)가 같은 숫자다 — 최소폭에서 상한까지
                        한 칸이라 그 사이에 중간 리플로가 필요 없다. 한쪽만 움직이면 패널이 떠거나 잘린다
                        ⚠️ 스크롤이 패널이 아니라 PanelBody에 있다 — 제목·툴바가 함께 올라가면
                        "지금 보고 있는 것"을 말할 것이 사라진다
                        ⚠️ 본문 랜드마크를 ContentPanel이 든다 — 화면은 자기 <main>을 안 든다
                        ⚠️ 사이드바 항목 노출은 편의이고 차단이 아니다(방어는 페이지) — 판정은 lib/shell/nav.ts
  translations/         번역 화면 조각. key-group(서버 컴포넌트 — 키별 TableBody + rowSpan 키 셀)
                        ⚠️ 행에 고정 폭이 로케일 칸 하나뿐이다 — 우측 w-40 슬롯에 메타를 두었더니
                        1280px에서 입력이 28px가 됐다(malmoi#33). 폭은 렌더 결과라 스캔이 못 보지만
                        원인은 소스의 상수이고 translations-screen.test.ts가 그 예산을 센다
                        ⚠️ 국기는 CSS background-image다 — ?ns=*에서 2,709개가 서므로 <img>면 요소가 그만큼 는다
                        ⚠️ live region은 표 하나다(셀마다 두면 2,700개)
  locales/ members/ settings/ onboarding/ projects/ signin/ account/ invite/
                        각 화면의 클라이언트 조각. ⚠️ 판정은 전부 lib/의 순수 함수가 하고 여기는
                        입력 상태만 든다
  account/              계정 화면 — 머리 하나 + 리스트 셋. account-section(구역·항목 규격 하나) ·
                        login-methods · github-section · sessions-section · profile-name-form ·
                        profile-picture · dismissible-alert
                        ⚠️ **구역이 자기 리스트와 Alert를 함께 든다** — 구역 Alert 자리가 헤더 아래·
                        래퍼 위라, 화면이 조립하면 그 자리가 두 컴포넌트에 걸친다
                        ⚠️ **항목의 우측 클러스터가 shrink-0이다** — 실패 Alert를 그 안에 두면 좌측
                        본문이 truncate로 사라진 뒤 행이 패널 밖으로 밀린다. 그래서 연결/해제 버튼이
                        결과를 콜백으로 바깥에 넘긴다(onResult · onFailure)
  onboarding/modal.tsx  새 프로젝트 모달의 껍데기. ⚠️ components/ui/dialog.tsx를 쓰지도 고치지도 않고
                        Radix Dialog.*를 직접 조립한다 — 그 프리미티브는 Overlay·padding·바닥 배치가
                        고정이라 960 껍데기가 안 나오고, 고치면 초대·확인·아카이브·로그인수단 모달
                        넷이 함께 움직인다. [Back]·[Next]와 "Step n of 4"를 껍데기가 소유한다
  onboarding/add-surface.tsx  FilesStep 재사용·수동 확인·추가 step 결과, 입력 실패 보존
  onboarding/steps/     단계 넷(repo · files · naming · result). ⚠️ new-project.tsx가 상태를 전부 들고
                        단계는 본문만 그린다 — 모달이 단계 간 상태를 공유하므로 무효화 경계가 코드에
                        명시돼 있어야 한다(브랜치·리포·후보 변경)
  projects/locale-meter.tsx
                        행의 로케일 Meter. 치수가 캔버스 리터럴 그대로이고 폭만 인라인 스타일이다
                        (퍼센트가 데이터라서 — 나머지를 스타일로 만들면 소스 검사 밖으로 나간다)
  projects/empty-projects.tsx
                        프로젝트 0건의 착지점. ⚠️ EmptyState가 아니라 KV 합성이다 — 장식이 패널
                        **안**으로 들어오는 유일한 경우다(DESIGN §6.4 예외 1). 로그인의 KeyVisual을
                        상한만 바꿔 재사용한다
  projects/project-list.tsx
                        목록 본문. ⚠️ <ContentPanel>을 여기서 안 든다 — /projects와 /projects/new가
                        둘 다 그리므로 공유 컴포넌트가 들면 shell-layout이 두 라우트에서 0을 센다
                        ⚠️ routes.projects({filter,q})를 부르는 자리라 entry-points의 "쿼리 수신자"
                        검사가 app/ 밖인 이 파일도 읽는다
  translation-input.tsx 셀 편집. 실패 시 포커스는 shouldRefocus가 정한다(다른 셀을 치고 있으면 안 뺏는다)
  publish-button.tsx    ⚠️ 실패에는 router.refresh()를 부르지 않는다
  search-input.tsx      ⚠️ IME 조합 확정 Enter를 거른다(isComposing과 keyCode 229를 둘 다 본다)
                        ⚠️ <form> 암시적 submit을 안 쓴다 — 제출 버튼 없는 폼은 Enter로 submit되지 않는다
  __tests__/            focus-ring(소스 스캔 — 탭으로 지나가야 보이는 결함이라 눈으로 두 번 놓쳤다) ·
                        client-graph(⚠️ "use client" 값 import 그래프에 ts-morph·octokit·prisma·node:fs가
                        없는지. 없으면 7.2MB 청크가 조용히 나간다 — 실제로 나갔다) ·
                        slottable-item · translations-screen · home-screen · logs-screen · members-screen ·
                        projects-screen · signin-screen · segmented-control(jsdom 렌더) · auth-toast ·
                        multiline-detail · base-locale-screens · table-presets · manual-format-hint ·
                        new-project(모달 상태 전이·응답 역전·수동 검증·세션 만료의 DOM 회귀)
```

## lib/ — 판정은 순수 함수, I/O는 얇은 껍데기

```
lib/
  adapters/             양방향 로케일 어댑터. ⚠️ layout(경로 모양)과 writeStrategy(write 기계)는 별개 축이다 —
                        yaml-catalog·code-dict가 per-locale인데 수술적이다. layout으로 가르는 코드가
                        남아 있으면 그 프로젝트의 PR이 조용히 비어 나간다
                        index(detect/detectFormatWith/ADAPTERS) · types(계약 + 오류 코드 22) ·
                        glob(역추적 없는 DP 매처) · shared(결정성 규칙) · quote-style · json-style ·
                        chrome-locales · json-catalog · yaml-catalog · code-dict · ts-dict(2026-09-14부터 자동 탐지 참여 — 씨앗은 tsDictProbePaths)
                        __tests__/contract.ts가 ADAPTERS를 순회하며 매트릭스를 검사한다
  auth/                 인증·인가. query(getProjectAccess — ⚠️ 원문 이메일을 안 낸다) ·
                        session(requireUser/requireProjectAccess — ⚠️ 보관만 redirect하지 않고 값으로 온다) ·
                        safe-adapter(⚠️ Auth.js는 세션 만료를 OAuth callback 앞에서 안 본다) ·
                        read-session · outage · public-session · permission · access · invitation ·
                        invite-view · membership · email · cookie · message · landing · invite-label
                        ⚠️ 판정은 순수 함수, 조회·세션은 얇은 껍데기라는 규칙이 이 디렉터리의 형이다
  upload/               사용자 프로필 사진 전용. image(형식·크기·키·삭제 allowlist 판정 +
                        planImagePick — 클라이언트 선검사) · store(server-only Vercel Blob I/O) ·
                        message(거부 → 문구). 실 저장소 검증·고아 후보 조회는 pnpm smoke:blob
                        ⚠️ **문구가 image.ts가 아니라 message.ts다** — 능력 쪽에 두면 no-korean-ui가
                        한글만 세므로 green인 채 사전을 통째로 우회한다
                        ⚠️ **클라이언트 선검사는 방어선이 아니다** — File.type이 확장자에서 오므로
                        이름만 .png로 바꾼 SVG는 통과한다. 그 거부는 서버 시그니처 판정이 낸다
  account/              사용자 축의 순수 판정. plan(planNameSave — 트림·빈 문자열·코드포인트 상한 /
                        displayName — 아바타 이름 폴백)
                        ⚠️ **displayName이 한 자리에 있는 이유**: 셸 32와 /account 56이 같은 얼굴이어야
                        하는데 폴백이 두 자리에 복제돼 연산자가 갈려 있었다(?? vs ||) — 빈 이름에서
                        toneOf가 다른 색을 냈다
                        ⚠️ **connection-usage는 2026-09-14에 삭제됐다** — GitHub 해제 Dialog의 근거로
                        `N projects use this connection.`을 그리던 조회인데, 세던 것이 내가 OWNER인
                        **모든** 프로젝트라 이 연결에 의존하지 않는 것까지 들어갔다. 해제가 실제로
                        막는 것은 리포 (재)연결뿐이고 야간 pull·PR은 설치 토큰이 낸다
  push/ pull/ sync/     payload(생산자 하나) · assemble · plan · apply · auth · guard · token /
                        plan · run · render · load · client · targets · trigger · branch-name · ref-slug /
                        run(진입점 둘이 지나는 유일한 껍데기 — ⚠️ 던지지 않는다) · query · view · plan
  keys/                 view(집계·배지·행 축 다섯·localeProgress) · query(server-only 조회 —
                        loadProjectList는 집계 다섯을 Promise.all로 보내고 원격 조회와 함께 기다린다) ·
                        save · refocus · filters · flag(국기 253 — ⚠️ 매핑이 원리적으로 실패하고,
                        계약은 실패했을 때 코드만 그리는 것이다)
  surfaces/            plan(정렬·slug·경로 라벨·소유권, client-safe) · access(프로젝트 인가 뒤 표면 좁힘)
                        push·편집 조회는 projectId + surfaceId. Publish는 프로젝트 단위 단일 PR
  surfaces/create.ts   Project 잠금 후 인가·리포·출력 경로 재검사, 생성+첫 적재 원자적 확정
  pull/surfaces.ts      planMultiSurfacePull — 중복 경로 거부와 path 순 평탄화
  github.ts             Git Data API 래퍼(App installation 토큰). openRepoReader가 토큰을 한 번만 발급한다
  github-connect/       사용자 토큰 전담 — App 개인키를 모른다. origin · state · account-link ·
                        account-view · connect-plan · health · token · token-store · user · repository-id
  credentials/ session-revocation/ login-link/ account-connect/
                        저장 시 암호화 / 전체 세션 회수 / 계정 병합 / 로그인 수단 추가.
                        ⚠️ session-revocation의 message는 주소창 값(?sessionRevocation=)을 받으므로
                        인자가 union이 아니라 string | undefined다 — 단언을 걸면 "모르는 값에 문구를
                        내지 않는다"가 검사에서 지워진다
                        ⚠️ 뒤의 셋은 같은 형이고 목적이 다르다(회수는 왕복을 멈추고, 병합은
                        진행시키고, 추가는 살아 있는 세션 위에서 Account만 쓴다) — 합치지 않는다.
                        ⚠️ account-connect는 VerificationToken의 **세 번째 접두**이고 plan(판정) ·
                        policy(쿠키) · http(가로채기) · store(challenge·Account 쓰기)로 갈린다
  onboarding/ survey/ scan/ projects/ shell/ home/ settings/ signin/ i18n/ cli/
                        각 기능의 순수 판정층
  projects/list.ts      ⚠️ **잎이어야 한다**(client-graph). 목록 판정 전부가 여기 산다 — 그룹·띠·
                        Meter 자리·진행률 접기·계정 합계·그룹 나누기·검색 강조. 오케스트레이션
                        파일에 두면 클라이언트 번들이 그 그래프를 따라온다
  projects/import-status.ts
                        임포트 결과의 순수 계약(닫힌 보고 스키마 · 대표 코드 · 화면 문장). ⚠️ 잎이라
                        @/lib/adapters/types를 **타입만** 가져온다
  projects/import-status-store.ts
                        Surface 결과의 쓰기 껍데기. ⚠️ 조건부 UPDATE가 방어선이고 선조회는 진단용이다
  projects/remote.ts    목록의 원격 신호 둘(열린 PR · base 드리프트). installation 토큰이고,
                        보관 제외 전부를 동시 3으로 돈다. ⚠️ 실패도 지연도 값으로 흐른다
  projects/remote-plan.ts
                        그 판정의 순수 부분(변경된 로케일 **파일 수** · PR 번호 파싱). ⚠️ 키 수가
                        아니다 — 서버는 그 커밋을 체크아웃하지 않아 셀 수가 없다
  onboarding/branch.ts  ⚠️ planBranchChoice — 목록/자유 입력/읽기 전용 셋을 가른다. 조회 실패를
                        "브랜치가 없다"로 읽지 않는 것이 요지다(POSTMORTEM 2026-09-03)
  onboarding/next-enabled.ts
                        design §4의 상태 표를 코드로. ⚠️ lib/ 아래 잎이다 — components/ 아래면
                        "use client" 그래프에 들어가 타입-온리 제약이 이 모듈까지 따라온다
  onboarding/key-gap.ts ⚠️ 잎이다. ③(클라이언트)이 값으로 부르는데 detect.ts에 두면 그 그래프
                        (lib/adapters → ts-morph)가 번들에 7.2MB로 들어온다. detect.ts가 재수출한다
  onboarding/sample-confirmation.ts
                        재검증한 샘플 포맷의 HMAC 발급·검증. 사용자·리포 id·설치 id·ref·head에 묶는다.
                        파일 내용과 서버 캐시는 없고, node:crypto를 쓰므로 클라이언트가 값으로 읽지 않는다.
  onboarding/language-name.ts
                        로케일 코드 → 영어 언어 이름(③의 기준 언어 행). ⚠️ 자국어가 아니다 —
                        Intl.DisplayNames([code])는 그 로케일 데이터가 없으면 보는 사람의 시스템
                        언어로 떨어져 Chrome(ko)에서 az-AZ가 "azərbaycan (아제르바이잔)"이었다
                        (Node는 "(Azərbaycan)"). ⚠️ 하위태그를 떼지 않는다 — zh-Hans/zh-Hant가
                        한 이름이 되면 되돌릴 수 없는 결정을 잘못 내린다
  onboarding/types.ts   RepoOption·AdapterChoice. 타입만 산다 — 같은 번들 이유
  routes.ts             앱 내부 링크의 단일 출처(잎, import 0). ⚠️ 쿼리는 withQuery를 지나야
                        entry-points의 "쿼리 수신자" 검사에 걸린다 — 문자열 연결은 그 검사를 회피한다
  search-params.ts      ⚠️ 잎. Next의 searchParams는 반복 파라미터를 배열로 주므로 화면 여덟이 전부
                        이것을 지난다. Object.create(null)로 만든다(키를 주소창이 정한다)
  locale-code.ts        ⚠️ 잎. 로케일 코드와 pathTemplate이 리포 경로 조각이라 값이 아니라 경로로 검증한다
  failure.ts            500 본문 판정 — 우리 메시지는 그대로, 남의 라이브러리 메시지는 ref만.
                        응답이 대상 리포 Actions 로그로 흘러가고 그 리포가 public일 수 있다
  env.ts db.ts githash.ts utils.ts relative-time.ts tone.ts
```

⚠️ **잎 모듈이 잎인 데는 이유가 있다** — `refocus`·`relative-time`·`ref-slug`·`flag`·`filters`는
클라이언트가 값으로 읽는 판정이라 무거운 그래프를 물면 그대로 번들이 된다. **재수출도 하지 않는다.**
`vitest.setup.ts`가 `server-only`를 전역 mock하므로 "테스트가 죽는다"는 더 이상 그 압력이 아니고,
**남은 방어선은 `components/__tests__/client-graph.test.ts` 하나**다.

## 그 밖

```
messages/en.tsx         ⚠️ UI 문자열의 단일 출처. 값은 문자열 또는 함수다(헬퍼 셋을 만들지 않는다).
                        갈래 누락은 소비자가 거는 satisfies Record<Union, string>이 잡는다. ⚠️ 잎이다
prisma/schema.prisma    12테이블 + enum 셋. ⚠️ Auth.js 4테이블의 모양은 어댑터가 정한다 — 컬럼 하나만
                        빠져도 linkAccount가 런타임에 던지고 타입 검사는 못 본다
prisma/migrations/      ⚠️ dev는 /push 전, prod는 /merge 전에 넓힌다(additive-first)
prisma/credential-cutover/  ⚠️ 마이그레이션이 아니라 스테이징 자리다 — Prisma가 이 디렉터리를 안 본다
scripts/                adapter-survey · sync-agents · copy-fonts · scan · ingest · push-local ·
                        smoke-github · credentials · finalize-credentials
                        __tests__/workflow-pins가 .github/ 아래 uses:가 40자 SHA로 핀됐는지 센다
public/brand/ flags/    ⚠️ 커밋된 원본이다(fonts/는 반대로 생성물). flags 253개는 lib/keys/flag.ts의
                        FLAG_INVENTORY와 정확히 같아야 한다(flag-assets.test.ts가 양방향으로 센다)
generated/prisma/ public/fonts/   ⚠️ 생성물(gitignore)
vercel.json             Cron(야간 1회) + ⚠️ regions: ["hnd1"] — 함수를 DB 옆에 붙인다. 기본 iad1에서는
                        홉당 ~375ms였고 이 앱의 비용은 페이로드가 아니라 홉 개수다(요청당 일곱)
next.config.ts          ⚠️ 보안 응답 헤더가 여기 있다(enforce 셋 + CSP 본체 Report-Only).
                        ⚠️ agentRules: false — Next가 AGENTS.md에 자기 블록을 덧붙이는 동작을 끈다
vitest.setup.ts         ⚠️ server-only를 전역 mock하고 테스트용 암호화 키 셋을 세운다
vitest.projects.config.ts
                        목록 집계의 **격리 PostgreSQL** 검증(`pnpm test:projects:postgres`).
                        ⚠️ `pnpm test`에 없다 — 실제 클러스터를 띄우고, 미발송 술어가 세 벌이 된 뒤로
                        "셋이 같은 행을 세나"를 재는 유일한 자리다. `lib/keys/**`의 raw 집계를
                        건드렸으면 손으로 돌린다
auth.ts                 Auth.js v5. 어댑터가 credentialAdapter(그 아래가 safePrismaAdapter)이고
                        세션 토큰은 우리가 만든다(DB엔 digest만). handlers는 withRevocation으로 감싼다
```
