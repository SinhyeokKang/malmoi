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
    projects/           목록(?filter=·?q=) · loading.tsx 스켈레톤 · new/(온보딩) · actions.ts
                        ⚠️ actions.ts의 인가가 export마다 따로다 — 공용 헬퍼로 빼면 entry-points가 못 센다
                        ⚠️ 온보딩 다섯은 requireUser뿐이다(인가할 프로젝트가 없다)
    account/            사용자 축의 유일한 화면. requireUser만 지난다
    projects/[slug]/    프로젝트 축. layout.tsx가 ContentPanel + ProjectPanel을 든다
                        ⚠️ 레이아웃은 인가의 차단 지점이 될 수 없다(페이지와 병렬 렌더) — 서버 데이터를 안 읽는다
      page.tsx          Home(착지점). ⚠️ 툴바 지표를 복제하지 않는다 · 착지 클릭 하나를 링크로 갚는다
      translations/     번역 표(로케일 = 행). URL 계약은 ns·locales·q
                        ⚠️ maxDuration=60이 여기 있어야 한다 — 없으면 기본 300이 STALE_AFTER_SECONDS와
                        같아져 정상 실행이 스스로를 stale로 본다
                        ⚠️ 헤더를 무조건 렌더한다 — Publish 결과 Alert가 그 안이라 조건부 분기에 두면
                        router.refresh()가 방금 받은 결과를 언마운트한다
      locales/ members/ logs/ settings/
                        ⚠️ 넷 다 게이트가 translation:write다(settings만 project:settings) — EDITOR도
                        목록을 보고 컨트롤만 role로 갈린다. 판정은 Action이 한다
                        ⚠️ logs에 try가 없다 — 조회 실패는 던져야 "없음"과 다른 화면이 된다
    __tests__/          harness(메모리 DB) + harness 자기검사 + 흐름·인가·멤버십·연결·게시실패·온보딩·
                        조회·셸레이아웃·보관·리포설정·sync 열둘
  invite/[token]/       ⚠️ (edit) 밖이고 matcher 밖이다 — 비로그인으로 열려야 토큰이 보존된다.
                        갈래는 planInviteView가 고른다(화면이 조건을 다시 적지 않는다)
  api/push/             CI → DB. Bearer가 그 프로젝트의 토큰 원문이다(서버 env가 아니다)
  api/pull/             DB → PR. cron 전용(CRON_SECRET)
  api/github/callback/  ⚠️ matcher에 넣지 않는다 — 로그인 화면으로 302되면 code가 사라진다
middleware.ts           인증 차단의 유일한 1차 지점. matcher 둘(/projects/:path* · /account).
                        렌더 요청(GET·HEAD)만 막고 Action POST는 통과시킨다
```

## components/

```
components/
  ui/                   ⚠️ 이 리포가 소유하는 프리미티브 18개 + tone.ts 헬퍼 (skeleton이 2026-09-13에
                        붙었다 — 회색 블록 값이 두 벌로 갈리지 않게 bg-foreground/5 하나를 든다). CLI로 신규 추가는
                        허용하되 기존 파일을 덮어쓰지 않는다. 라이트 단일, dark: 0곳
                        ⚠️ 포커스 링 셋을 여는 태그에 리터럴로 적는다 — cva 베이스나 공유 상수에
                        모으면 focus-ring 스캐너가 그 파일을 통째로 못 본다(Button에 asChild가 없는 것도 같은 이유)
                        ⚠️ asChild가 닿는 프리미티브는 {children}을 Slot.Slottable로 감싼다 — 형제를
                        렌더하면 Radix Slot이 던지고 그 트리가 죽는다(프로덕션에 있었다)
                        ⚠️ Table은 프리셋 둘·구현 하나다(Th/Td/Tr이 TableHead/Cell/Row를 감싼다)
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
  onboarding/modal.tsx  새 프로젝트 모달의 껍데기. ⚠️ components/ui/dialog.tsx를 쓰지도 고치지도 않고
                        Radix Dialog.*를 직접 조립한다 — 그 프리미티브는 Overlay·padding·바닥 배치가
                        고정이라 960 껍데기가 안 나오고, 고치면 초대·확인·아카이브·로그인수단 모달
                        넷이 함께 움직인다. [Back]·[Next]와 "Step n of 4"를 껍데기가 소유한다
  onboarding/steps/     단계 넷(repo · files · naming · result). ⚠️ new-project.tsx가 상태를 전부 들고
                        단계는 본문만 그린다 — 모달이 단계 간 상태를 공유하므로 무효화 경계가 코드에
                        명시돼 있어야 한다(브랜치·리포·후보 변경)
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
                        chrome-locales · json-catalog · yaml-catalog · code-dict · ts-dict(자동 탐지 제외)
                        __tests__/contract.ts가 ADAPTERS를 순회하며 매트릭스를 검사한다
  auth/                 인증·인가. query(getProjectAccess — ⚠️ 원문 이메일을 안 낸다) ·
                        session(requireUser/requireProjectAccess — ⚠️ 보관만 redirect하지 않고 값으로 온다) ·
                        safe-adapter(⚠️ Auth.js는 세션 만료를 OAuth callback 앞에서 안 본다) ·
                        read-session · outage · public-session · permission · access · invitation ·
                        invite-view · membership · email · cookie · message · landing · invite-label
                        ⚠️ 판정은 순수 함수, 조회·세션은 얇은 껍데기라는 규칙이 이 디렉터리의 형이다
  push/ pull/ sync/     payload(생산자 하나) · assemble · plan · apply · auth · guard · token /
                        plan · run · render · load · client · targets · trigger · branch-name · ref-slug /
                        run(진입점 둘이 지나는 유일한 껍데기 — ⚠️ 던지지 않는다) · query · view · plan
  keys/                 view(집계·배지·행 축 다섯·localeProgress) · query(server-only 조회) ·
                        save · refocus · filters · flag(국기 253 — ⚠️ 매핑이 원리적으로 실패하고,
                        계약은 실패했을 때 코드만 그리는 것이다)
  github.ts             Git Data API 래퍼(App installation 토큰). openRepoReader가 토큰을 한 번만 발급한다
  github-connect/       사용자 토큰 전담 — App 개인키를 모른다. origin · state · account-link ·
                        account-view · connect-plan · health · token · token-store · user · repository-id
  credentials/ session-revocation/ login-link/
                        저장 시 암호화 / 전체 세션 회수 / 계정 병합. ⚠️ 뒤의 둘은 같은 형이고 목적이
                        반대다(하나는 왕복을 멈추고 하나는 진행시킨다) — 합치지 않는다
  onboarding/ survey/ scan/ projects/ shell/ home/ settings/ signin/ i18n/ cli/
                        각 기능의 순수 판정층
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
auth.ts                 Auth.js v5. 어댑터가 credentialAdapter(그 아래가 safePrismaAdapter)이고
                        세션 토큰은 우리가 만든다(DB엔 digest만). handlers는 withRevocation으로 감싼다
```
