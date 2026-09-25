# DIRECTORY — 어디에 무엇이 있고 왜 그렇게 생겼나

**구조를 바꾸기 전에 읽는다.** 여기 있는 ⚠️는 전부 실제로 밟은 지뢰이고, 대부분 그 자리를 지키는
테스트가 짝으로 있다. 불변식의 정본은 [ARCHITECTURE.md](./ARCHITECTURE.md), 제품 판정은
[PRODUCT.md](./PRODUCT.md)다.

## app/ — 라우트

```
app/
  page.tsx              랜딩(`/`). rootView가 세션이 있으면 /projects로 redirect, 없거나 못 읽으면 PublicShell(cta = publicCta("none"), current = home) + 히어로 + Stage + 마무리 CTA.
                        ⚠️ 로그인 상태면 /projects다 — 랜딩이 선 뒤에도 그렇다. 쿼리를 읽지 않는다
  signin/page.tsx       로그인(GitHub·Google). Auth.js의 pages.signIn·pages.error가 여기다.
                        ⚠️ middleware matcher에 넣으면 로그인이 통째로 죽는다 — 경로를 안 보므로
                        쿠키 없는 모든 요청이 자기 자신으로 307을 돈다(entry-points가 부정 단언으로 고정)
                        ⚠️ ?error= 없이도 세션이 unavailable이면 문구를 띄운다
                        ⚠️ 초대에서 온 왕복이 여기서 끝나면 돌아가는 링크를 든다 — 자리를 아는 것은
                        authjs.callback-url 쿠키뿐이고, 갈래가 invite일 때만 세운다(open redirect)
  signin/link/[challenge]/   계정 병합 안내. 인가가 없고 challenge가 대신한다 → matcher 밖.
                        ⚠️ 만료를 이 화면으로 말하지 않는다 — /signin으로 되돌린다
  privacy/ · docs/      공개 문서. privacy는 공개 셸 안의 components/privacy/(DESIGN §6.616), docs는 셸 밖
                        components/public-doc.tsx(장문 그릇 — §6.61). privacy 본문은 messages/en.tsx의 publicDocs.privacy이고,
                        docs 본문만 아직 placeholder(L2.3). ⚠️ 세션을 읽는 이유는 차단이 아니다 — privacy는 헤더 primary
                        (publicCta: 로그인이면 Open Malmoi → /projects, 아니면 Get started → /signin), docs는 복귀 링크 하나다.
                        그래서 둘 다 동적이다
  layout.tsx            루트 레이아웃(Pretendard <link>). ⚠️ lang="en" — screens.test.ts가 고정한다
  not-found.tsx · error.tsx · global-error.tsx  셸 밖(/invite·/signin·오타 URL)의 경계. 앞 둘은 components/root-fallback.tsx를
                        쓰고, global-error는 루트 레이아웃을 대신하므로 html·body를 스스로 든 맨 HTML이다(전역 CSS 없음)
  globals.css           Tailwind 4 @theme. ⚠️ @custom-variant dark 한 줄이 라이트를 고정한다
  __tests__/            entry-points(진입점 소스 스캔 — 모든 page·route·actions가 인가를 지나는지 fs로
                        센다. 예외 열을 이름으로 고정(2026-09-13에 api/push/failure가 붙어 하나 늘었다)
                        + routes.ts↔라우트 대조 + 쿼리 생성기/수신자 대조)
                        · screens(lang·revalidate 안전·보관 갈래 다섯) · security-headers(next.config를 불러서)
                        · api/__tests__/pull-budget(야간 cron 시간 예산 — 가짜 시계로 넘긴 수가 unprocessed에 실리는지)
                        · locked-access(잠금 재판정 16자리를 AST로 센다 — `$transaction` 콜백 안의 호출만, 주석 제외)
  (edit)/               인증 필요. 1차 차단은 middleware, 본판정은 각 진입점
    layout.tsx          셸. ⚠️ {children}을 흰 패널로 감싸지 않는다 — 감싸면 흰 패널이 겹쳐 padding이 두 배다.
                        ContentPanel은 각 갈래의 레이아웃이 든다(shell-layout.test.ts가 라우트마다
                        정확히 하나인지 센다)
    error.tsx           오류 경계. ⚠️ 예외 메시지를 그대로 뿌리지 않는다
    actions.ts          saveTranslationKey · previewTranslationRevert · revertTranslationKey · triggerPullAction.
                        ⚠️ 무효화는 /projects/<slug> 서브트리 + 목록 둘이다 — 그 행을 읽는 화면이 넷이라
                        경로를 나열하면 다섯째가 조용히 빠진다
    publish-actions.ts  loadPublishPreview 하나. ⚠️ actions.ts와 갈라 둔다 — 모달이 열릴 때만 부르는
                        **읽기**라 쓰기 Action과 무효화 규칙이 다르다
    projects/           actions.ts
      (list)/           목록 전용 route group(URL 불변) — page.tsx(?q=) · loading.tsx 스켈레톤 · new/(온보딩 딥링크).
                        ⚠️ projects/에 바로 두면 목록 행·온보딩 ④에서 프로젝트로 가는 동안 목록 골격이 떴다가 바뀐다
                        (audit-ux #21 — malmoi#95와 같은 결함). ⚠️ new/도 여기다 — GitHub callback이 /projects/new로
                        전체 로드 착지하고 그 페이지가 목록(원격 신호 최대 8초)을 기다리므로, 경계 밖이면 그동안 빈 화면이다
      layout.tsx        children·modal을 마크업 없이 나란히 렌더 — [slug] 하위 패널을 중첩하지 않는다
      new-project-modal.tsx  두 생성 진입점의 서버 공통 모달. 리포 조회는 Suspense 뒤이고 목록은 읽지 않는다
      @modal/(.)new/    클라이언트 네비게이션용 모달. requireUser 후 모달만, 닫기는 router.back()
      @modal/default.tsx · @modal/page.tsx · @modal/[...rest]/page.tsx
                        기본 복원·목록 복귀·다른 프로젝트 경로에서 null. 활성 슬롯이 이동 후 남는 것을 막는다
                        ⚠️ actions.ts의 인가가 export마다 따로다 — 공용 헬퍼로 빼면 entry-points가 못 센다
                        ⚠️ 온보딩 다섯은 requireUser뿐이다(인가할 프로젝트가 없다)
    account/            사용자 축의 유일한 화면. requireUser만 지난다 · layout.tsx · loading.tsx 스켈레톤 ·
                        actions.ts(프로필 이름·사진 둘 · 전체 세션 회수 · 로그인 수단 연결/해제 — 여섯 다
                        requireUser만 지난다. 인가할 프로젝트가 없는 축이다)
                        (⚠️ ContentPanel을 안 든다 — 이 라우트는 layout.tsx가 든다. /projects만
                        페이지가 들어서 그쪽 loading.tsx가 패널을 드는 것이고, 여기서 또 들면 두 겹이다)
    projects/[slug]/    프로젝트 축. layout.tsx가 ContentPanel 하나를 든다 (우측 패널은 2026-09-16 제거 — DESIGN §6.55)
                        ⚠️ 레이아웃은 인가의 차단 지점이 될 수 없다(페이지와 병렬 렌더) — 서버 데이터를 안 읽는다
      (home)/           Home 전용 route group(URL 불변). ⚠️ loading.tsx를 [slug]/에 바로 두면
                        형제 화면으로 가는 동안에도 Home 골격이 뜬다(malmoi#95) — 그래서 page·loading을 여기 가둔다
        page.tsx        Home(착지점). ⚠️ 툴바 지표를 복제하지 않는다 · 착지 클릭 하나를 링크로 갚는다
        loading.tsx     Home 골격(⚠️ 여기도 ContentPanel을 안 든다 — 레이아웃이 이미 들어 둘이 된다)
      translations/    저장된 defaultSurfaceId로 보내는 legacy redirect
      locales/         Sources 목록으로 보내는 legacy redirect
      sources/         소스 목록·상세 모달. actions.ts(updateBaseLocale + 읽기 전용 loadSourceDetail) · loading.tsx 골격
      surfaces/[surfaceSlug]/translations/  번역 작업 화면(트리·키 목록·로케일 세 패널 — translation-rework C4).
                        URL 계약은 lib/translations/query.ts 하나다. 선택 키의 permalink는 서버가 조립한다
                        loading.tsx 골격 — ⚠️ PanelHeader·PanelBody를 안 쓴다(작업 화면처럼 폭 등급 없이 세 패널)
                        ⚠️ maxDuration=60이 여기 있어야 한다 — 없으면 기본 300이 STALE_AFTER_SECONDS와
                        같아져 정상 실행이 스스로를 stale로 본다
                        ⚠️ 헤더를 무조건 렌더한다 — Publish 결과 Alert가 그 안이라 조건부 분기에 두면
                        router.refresh()가 방금 받은 결과를 언마운트한다
      surfaces/[surfaceSlug]/locales/  requireSurfaceAccess 뒤 Sources 목록으로 redirect
      surfaces/new/    옛 링크 호환용. OWNER 검사 뒤 sources?add=sources redirect(보관도 — Sources가 보관 화면을 그린다).
                        ⚠️ 앱 안에서 여기로 보내는 곳이 0이다 — GitHub callback도 Sources로 바로 간다(audit-ux #31)
      surfaces/[surfaceSlug]/not-found.tsx  없는 표면의 제품 안내(requireSurfaceAccess의 notFound). translations/not-found.tsx가 다시 내보낸다
      not-found.tsx    프로젝트 세그먼트 경계 — ⚠️ 무엇을 잃었는지 단정하지 않는다(그 아래 notFound()가 여럿이다). Projects 복귀
      members/ logs/ settings/   (settings/actions.ts — GitHub 연결 시작 · 리포 (재)연결 · 리포 설정 갱신 · 프로젝트 이름/이미지)
                        셋 다 loading.tsx 골격을 든다(audit-ux #5 — [slug]/에 하나로 두지 않는다, malmoi#95)
                        ⚠️ 넷 다 게이트가 translation:write다(settings만 project:settings) — EDITOR도
                        목록을 보고 컨트롤만 role로 갈린다. 판정은 Action이 한다
                        ⚠️ logs에 try가 없다 — 조회 실패는 던져야 "없음"과 다른 화면이 된다
    __tests__/          harness(메모리 DB) + 테스트 스물다섯 — harness 자기검사 · 흐름 · 인가 · 멤버십 ·
                        연결 · 게시실패 · 게시미리보기 · 온보딩 · 조회 · 목록질의 · 셸레이아웃 · 오류경계 둘(화면 · 재시도) · 형제골격 ·
                        모달 · 보관 · 리포설정 · sync · 활동사건 · 표면추가로그 · 프로젝트메타데이터 ·
                        소스Action · 소스페이지 · 초대메일 · 없는화면
  invite/[token]/       ⚠️ (edit) 밖이고 matcher 밖이다 — 비로그인으로 열려야 토큰이 보존된다.
                        갈래는 planInviteView가 고른다(화면이 조건을 다시 적지 않는다)
  invite/actions.ts     acceptInvitation 하나. ⚠️ **인가 예외** — 지날 프로젝트 인가가 없고 토큰이 대신한다.
                        entry-points의 면제가 파일이 아니라 **export 단위**(EXEMPT_ACTIONS)다 — 파일 단위면
                        여기 붙는 둘째 export가 조용히 무인가로 열린다
  api/push/             CI → DB. Bearer가 그 프로젝트의 토큰 원문이다(서버 env가 아니다)
  api/push/failure/     CI가 **적재에 실패했다는 사실**만 남긴다(2026-09-13). 파싱이 깨지면 /api/push는
                        아예 안 불려서 그 실패가 대상 리포 로그에만 있었다. 같은 토큰 · 코드 넷 ·
                        본문 4 KiB · 키/번역/커밋 기준점을 건드리지 않는다
  api/pull/             DB → PR. cron 전용(CRON_SECRET)
  api/auth/[...nextauth]/  Auth.js 핸들러(auth.ts의 handlers를 그대로 내보낸다). 인가를 지나지 않는 것이
                        당연해서 entry-points의 면제 목록에 이름으로 든다
  api/github/callback/  ⚠️ matcher에 넣지 않는다 — 로그인 화면으로 302되면 code가 사라진다.
                        설치·인가·리포 선택 변경이 전부 여기로 온다(state 없는 설치 계열 복귀는 착지만)
middleware.ts           인증 차단의 유일한 1차 지점. matcher 둘(/projects/:path* · /account).
                        렌더 요청(GET·HEAD)만 막고 Action POST는 통과시킨다
```

## components/

```
components/
  ui/                   ⚠️ 이 리포가 소유하는 프리미티브 25개 + tone.ts·focus.ts 헬퍼 (focus.ts는 2026-09-24 audit B5 —
                        포커스 착지 셋 landFocus·neighbourFocus·useLandAfter, DESIGN §7) (skeleton이 2026-09-13에
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
                        ⚠️ resizable(21번째)만 radix-ui가 아니라 react-resizable-panels를 쓴다 —
                        포인터 히트 판정·전역 커서가 document 레벨이라 CSS로 대신할 수 없다
                        ⚠️ modal(22번째)은 2026-09-16에 components/onboarding/에서 올라왔다 — 소비자가
                        둘이 되는 순간(온보딩 · Publish) 껍데기가 한쪽 디렉터리에 살면 안 된다.
                        옛 경로는 재수출로 남아 온보딩 호출부가 한 줄도 안 바뀌었다. 2026-09-19에
                        초대 모달이 셋째 소비자가 됐다
                        ⚠️ row-card(23번째)는 행 목록 카드다(RowCard/RowCardList/RowCardItem/
                        BannerLine/EmptyRowCard) — /projects의 그룹 카드와 멤버 화면 둘이 공유한다.
                        복사하면 선의 급 둘·divide-y 금지·shrink-0·@container 위치·ring-inset,
                        주석으로만 지켜지던 함정 다섯이 두 벌로 갈린다 (DESIGN §6.4)
  ui/image-tile.tsx     프로젝트 타일의 이미지 + 깨진 URL 폴백. useImageFallback은 Avatar와 한 벌이고
                        마크업만 다르다 — 소비자 셋(목록·Home / 초대 / 설정)은 서버 컴포넌트로 남는다
  ui/panel-card.tsx     PanelCard/Rows/Row/Facts. 계정 구역에서 승격, 제목 없는 카드도 지원.
                        옛 ui/card.tsx와 account/account-section.tsx는 마지막 소비자 전환과 함께 삭제
  ui/checkbox.tsx       Radix Checkbox. ②의 Include 접근 이름을 받고 Preview 버튼과 형제로 선다
  ui/modal.tsx          모달 껍데기. ⚠️ 소비자가 여섯이다 — 새 프로젝트 온보딩(네 단계) · Publish 모달
                        (갈래 열하나) · 초대 모달(폼→링크 두 얼굴) · Sources 추가/상세 · 설정 Workflow. ⚠️ components/ui/dialog.tsx를 쓰지도 고치지도 않고 Radix
                        Dialog.*를 직접 조립한다 — 그 프리미티브는 Overlay·padding·바닥 배치가
                        고정이라 1024 껍데기가 안 나오고, 고치면 초대·확인·아카이브·로그인수단 모달
                        넷이 함께 움직인다. [Back]·[Next]와 "Step n of 4"를 껍데기가 소유하되
                        actions 슬롯을 주면 그 자리를 호출부가 가져간다(Publish가 갈래별 버튼을 넣는다)
  shell/                앱 셸. ⚠️ 루트가 h-svh overflow-hidden이고 min-h-svh가 아니다 — min-이면
                        aside가 문서 높이만큼 늘어 Sign out이 화면 밖으로 나간다(malmoi#13)
                        ⚠️ min-w-[1280px]과 CONTENT_MAX(max-w-7xl)가 같은 숫자다 — 최소폭에서 상한까지
                        한 칸이라 그 사이에 중간 리플로가 필요 없다. 한쪽만 움직이면 패널이 떠거나 잘린다
                        ⚠️ 스크롤이 패널이 아니라 PanelBody에 있다 — 제목·툴바가 함께 올라가면
                        "지금 보고 있는 것"을 말할 것이 사라진다
                        ⚠️ 본문 랜드마크를 ContentPanel이 든다 — 화면은 자기 <main>을 안 든다
                        ⚠️ 사이드바 항목 노출은 편의이고 차단이 아니다(방어는 페이지) — 판정은 lib/shell/nav.ts
                        shell-panels.tsx  LNB ↔ 콘텐츠 리사이저. 서버 레이아웃과 PanelGroup 사이의
                        "use client" 경계이고 sidebar·children을 prop으로 통과시킨다
                        ⚠️ 사이드바 폭이 aside가 아니라 여기 Panel에 있다(200/240/320) — 둘 다 들면
                        고정 폭이 드래그를 덮어 "핸들만 움직인다"가 된다
                        ⚠️ 행의 gap-2가 핸들 폭(w-2)으로 옮겨 갔다 — gap 안에 핸들을 끼우면 8+8+8이다
  translations/workspace/  **번역 작업 화면** (2026-09-23, translation-rework C4 — DESIGN §6.1a). workspace(draft·이동·폭의
                        **한 소유자** — 저장·Revert·Publish 확인이 전부 여기서 갈린다) · tree-panel · key-list · locale-panel ·
                        filter-menu · use-leave-guard(뒤로가기는 capture 단계 popstate에서 되돌리고 새로고침·닫기는
                        beforeunload다). ⚠️ 카드 사이 핸들은 react-resizable-panels가 아니다 — px 하한 셋(420·336·208)을
                        % 환산 없이 지키려고 lib/translations/layout.ts가 폭을 계획한다
  translations/         작업 화면 밖에 남은 조각 셋 — edit-loss-banner · base-pending-banner(⚠️ 둘은 sync-edit-protection의
                        화면 쪽 산출물이고 **판정을 다시 쓰지 않는다** — 앞은 미전달 편집 수를 값으로 받아
                        "손실"이 아니라 "리포 갱신 보류"를 말하고, 뒤는 lib/onboarding/base-pending을
                        불러 설정 화면의 Alert와 같은 조건 하나를 공유한다. 둘 다 닫기가 없다) · locale-badge
                        (⚠️ 국기는 CSS background-image다 — 로케일 200개 행에서 <img>면 요소가 그만큼 는다).
                        옛 번역 표 조각(header·filters·filter-chips·key-group·announcer)과 셀 편집
                        translation-input은 translation-rework T16에서 지웠다
  sources/ settings/ onboarding/ projects/ signin/ account/ invite/
                        각 화면의 클라이언트 조각. ⚠️ 판정은 전부 lib/의 순수 함수가 하고 여기는
                        입력 상태만 든다
  public-shell/         공개 셸(`/` · `/privacy`) — PublicShell({ cta, current }) · header · footer · scroller. 헤더 40 · 패널 ·
                        푸터 40, 루트 h-svh min-w-[1280px] overflow-hidden. ⚠️ "use client"는 scroller 하나이고 lib/를 물지
                        않는다 — 문서가 스크롤되지 않으므로 스크롤러가 마운트 때 포커스를 받아야 Space/PageDown이 먹는다.
                        data-public-scroller가 랜딩 스테이지·privacy 목차의 스크롤 대상 표식이다. ⚠️ 헤더는 세션을 읽지
                        않는다 — primary는 페이지가 publicCta로 정해 넘긴다. route group 레이아웃으로 묶지 않는다(이동 때 스크롤러 재마운트)
  privacy/              `/privacy` 읽기 그릇 — privacy-doc(서버 — 1120 · 본문 720 + 목차 200, 본문은 사전 그대로) ·
                        toc(클라이언트 잎 — [data-public-scroller] 구독 → rAF → lib/public-doc/toc의 currentSection,
                        클릭은 scrollTo(top − 48) + 절 h2로 포커스)
  public-doc.tsx · public-doc-table.tsx
                        `/docs` 전용 셸 밖 1열 그릇(DESIGN §6.61) · 두 공개 문서가 공유하는 표 DocTable(role=region 스크롤
                        래퍼 + scrollable={false} — POSTMORTEM 2026-09-19). 문단·목록은 그릇마다 급이 달라 각자 든다
  landing/              랜딩(`/`) 화면. 셸은 components/public-shell/다.
                        stage.tsx(클라이언트 — 스크롤 → rAF → lib/landing/stage의 frame() → ref로 transform·opacity·data-*·
                        텍스트를 직접 쓴다. ⚠️ 프레임마다 setState하지 않는다) · mockup/(서버 컴포넌트 — 1280×720 씬 다섯의
                        정적 DOM. app-frame(앱 셸 복제) · translations(번역 화면 복제, phase로 ①②③) · publish(④ 미리보기 · ⑤ 결과).
                        ⚠️ 인터랙티브 태그 0 — 버튼 모양은 buttonClass를 span에. 앱 라벨은 실제 사전 키, 가상 데이터는 m.landing.mockup)
  members/              멤버 화면 조각 다섯 (2026-09-19 리워크). members-panel-header(좌석 라벨 +
                        [Invite] + 모달 소유) · invite-modal(다중 초대 폼 — 행 = 사람 하나, 성공이면 닫힘) ·
                        member-list · pending-invitations(Revoke · Resend — Resend 결과는 행이 아니라 카드 Alert) ·
                        member-row (두 카드가 공유하는 행 껍데기 + 사유 띠) · role-chip
                        ⚠️ **행 껍데기가 aria-describedby 배선을 든다** — controls가 띠의 id를 받는
                        함수다. 소비자가 그 id를 직접 알면 띠 없는 갈래에서 빈 문자열을 남긴다
                        ⚠️ **꺼진 컨트롤은 aria-disabled다** — 진짜 disabled는 포커스를 못 받아
                        사유의 전달 경로가 없다. Radix Select는 여는 이벤트가 셋이라 셋 다 막는다
                        (POSTMORTEM 2026-09-19)
                        ⚠️ **maskEmail 금지선이 이 디렉터리를 전수로 훑는다** — 마스킹은 서버의 일이고,
                        파일 목록을 손으로 적던 검사가 파일이 넷이 되자 신설분을 놓쳤다
  account/              계정 화면 — 공유 ui/panel-card(구역·항목 규격 하나)를 사용하는 머리 하나 + 리스트 셋.
                        login-methods · github-section · sessions-section · profile-name-form ·
                        profile-picture · dismissible-alert
                        ⚠️ **구역이 자기 리스트와 Alert를 함께 든다** — 구역 Alert 자리가 헤더 아래·
                        래퍼 위라, 화면이 조립하면 그 자리가 두 컴포넌트에 걸친다
                        ⚠️ **항목의 우측 클러스터가 shrink-0이다** — 실패 Alert를 그 안에 두면 좌측
                        본문이 truncate로 사라진 뒤 행이 패널 밖으로 밀린다. 그래서 연결/해제 버튼이
                        결과를 콜백으로 바깥에 넘긴다(onResult · onFailure)
  logs/                 **활동 스트림의 화면 조각** (2026-09-20, logs-rework — DESIGN §6.68)
                        glyph(칩 28 · 팔레트 일곱) · event-row(행 다섯 칸) · log-filters(`"use client"` —
                        드롭다운 다섯 + 검색 + [Refresh]) · event-detail(640 본문) · event-dialog(껍데기)
                        ⚠️ **Home의 Recent logs가 `event-row`를 그대로 쓴다** — 같은 사건이 두 화면에서
                        같은 모양이어야 한다. 그래서 파랑 한 자리도 이 파일에 있다(home-vocabulary가 센다)
                        ⚠️ **상세 본문은 서버가 그린다** — 클라이언트는 열림·닫힘·포커스만 든다
  home/                 Home 화면의 블록 넷 + 클라이언트 호스트. count-cards · attention-card ·
                        logs-card · meta-column은 **순수 서버 컴포넌트**다(`+n more`가 <details>라
                        클라이언트 상태가 0이다) · actions.tsx만 "use client"
                        ⚠️ **actions.tsx가 컨텍스트 Provider다** — [Sync]는 머리에 있고 그 결과·배너는
                        본문에 있어서, 한쪽이 상태를 소유하면 배너의 [Try again]이 같은 Dialog를 못 연다.
                        Provider는 DOM을 안 만들어 PanelHeader·PanelBody 형제 구조가 그대로 남는다
                        ⚠️ **sync-button·sync-result는 sync-repository의 산출물이다** — 같은 디렉터리에
                        살지만 자기 핸드오프(아트보드 4a~4f)를 따르고, Home의 "파랑 다섯 자리" 규칙 밖이다
  onboarding/modal.tsx  components/ui/modal.tsx를 그대로 재수출한다 — 호출부를 안 건드리려는 한 줄이다
  sources/              sources-screen · source-detail-modal · source-status · base-language-form · add-sources-modal ·
                        sources-archived · github-mark 일곱.
                        목록 소유자가 선택·쓰기 결과를 유지. 로딩/거부/장애를 구별하고 쓰기는 기존 Action 경계를 따른다.
                        sources-archived는 보관 프로젝트의 안내 한 장이고 목록·상세를 아예 열지 않는다
                        (판정이 조회 **전에** 선다). ⚠️ github-mark는 **이 리포의 유일한 브랜드 마크다** —
                        `lucide-react` 1.37이 브랜드 아이콘을 통째로 빼서 0.462의 path를 손으로 들고 있다.
                        늘리지 말고 다른 자리가 생기면 여기서 가져다 쓴다
  settings/             general-card · repository-card/repository-form ·
                        ci-card · archive-card · push-token-panel. 독립 add-surface.tsx는 모달 전환 뒤
                        삭제했고, push-token-panel은 소비자가 ci-card 하나뿐이라 onboarding/에서 옮겼다.
  onboarding/steps/     단계 넷(repo · files · naming · result). ⚠️ new-project.tsx가 상태를 전부 들고
                        단계는 본문만 그린다 — 모달이 단계 간 상태를 공유하므로 무효화 경계가 코드에
                        명시돼 있어야 한다(브랜치·리포·재탐지). 체크·상세·표면별 기준 언어를 독립 보존한다
  projects/project-thumbnail.tsx
                        프로젝트를 가리키는 28 타일. 소비자가 **둘**이다 — 목록 행과 Home 머리.
                        ⚠️ **2026-09-17까지 화면마다 따로 구현돼 있었고 Home만 고정 bg-foreground였다**
                        (POSTMORTEM 2026-09-17). ⚠️ radius가 rounded-sm(8)이고 캔버스의 4가 아니다
                        — 초대 카드(components/invite/project-card.tsx)까지 세 화면을 한 값으로
                        모은 판정이다 (DESIGN §6.63의 이탈 줄이 정본)
                        ⚠️ optional src는 아직 소비자가 없다 — 프로젝트 이미지가 생길 자리다
  projects/new-project-button.tsx
                        [New project] 전용 client 버튼. 소비자가 **둘**이다 — 목록 머리와 EmptyProjects.
                        Link.onNavigate를 가로채 useTransition + router.push로 옮기고 그동안 Plus를
                        Loader2로 **교체**한다(더하지 않는다 — 라벨 폭이 흔들린다)
                        ⚠️ **Next는 같은탭 클릭에만 onNavigate를 부른다** — 수정키·새 탭은 네이티브로
                        떨어진다. 그 전제를 테스트가 mock으로 정의하므로 new-project-button.test.tsx가
                        설치된 next 소스에 따로 고정한다
                        ⚠️ ButtonLink가 아니라 buttonClass를 빌려 쓴다 — onNavigate가 필요해서다
                        (publish-button·github-section과 같은 관용구)
  locale-meter.tsx
                        Projects·Sources 공유 로케일 Meter. 치수가 캔버스 리터럴 그대로이고 폭만 인라인 스타일이다
                        (퍼센트가 데이터라서 — 나머지를 스타일로 만들면 소스 검사 밖으로 나간다)
  projects/empty-projects.tsx
                        본문이 빌 때의 **카드 둘** — 프로젝트 0건(`EmptyProjects`)과 검색 0건
                        (`NoProjectsMatch`). ⚠️ 부품이 같고 다른 것은 아이콘과 **출구의 무게**뿐이다
                        (만들기=채운 버튼 / 되돌리기=링크). ⚠️ 2026-09-15에 장식(그라데이션·점 필드·KV)
                        을 걷어냈다 — 본문이 전부 카드가 되면서 빈 상태가 화면 중 가장 화려해졌다.
                        DESIGN 원칙 5의 "유일한 예외"가 그때 닫혔다. ⚠️ EmptyState 프리미티브를 쓰지
                        않는다 — 그쪽은 칩 48·py-12이고 여기는 카드 규격(칩 36·padding 48/24)이다
  projects/project-list.tsx
                        목록 본문. ⚠️ <ContentPanel>을 여기서 안 든다 — /projects와 /projects/new가
                        둘 다 그리므로 공유 컴포넌트가 들면 shell-layout이 두 라우트에서 0을 센다
                        ⚠️ routes.projects({filter,q})를 부르는 자리라 entry-points의 "쿼리 수신자"
                        검사가 app/ 밖인 이 파일도 읽는다
                        ⚠️ 본문의 갈래 넷은 lib/projects/list.ts의 listBody가 정한다 — 전엔
                        hasProjects·질의·건수가 JSX 안에서 섞여 판정됐다. 그릇은 카드이고 그룹
                        헤더가 그 안에 산다(DESIGN §6.63)
  commit-wait.ts        useCommitWait — Action이 풀린 뒤 재검증 트리가 커밋될 때까지 교차 잠금을 잇는다(malmoi#103,
                        ARCHITECTURE §3). ⚠️ 서버 prop의 **식별자**를 본다 — 값은 재검증 뒤에도 같을 수 있다
                        ⚠️ 상한 10 s. 소비자는 Home Sync · 번역 화면 Sync · usePublish · Revert 넷
  publish-button.tsx    Publish 버튼 + 모달 갈래 열하나(DESIGN §6.646). ⚠️ router.refresh()를 부르지 않는다 —
                        Action의 revalidatePath가 새 트리를 싣고 온다 ⚠️ **usePublish를 무조건 렌더되는 호스트가 든다** — 번역 화면은
                        TranslationWorkspace, Home은 HomeNotices다. 조건부 자리에 두면 재검증이 방금
                        받은 결과를 언마운트한다 ⚠️ **리포 이름·base·sync 브랜치를 서버가 넘긴다** —
                        syncBranchFor가 사는 모듈(lib/pull/sync-branch — 2026-09-24에 trigger에서 뺐다)은
                        lib/failure(node:crypto)를 물어 클라이언트 그래프에 오면 안 된다
  search-input.tsx      ⚠️ IME 조합 확정 Enter를 거른다(isComposing과 keyCode 229를 둘 다 본다 —
                        번역 입력의 keyEditCommand(lib/translations/draft.ts)가 같은 판정을 쓴다)
                        ⚠️ <form> 암시적 submit을 안 쓴다 — 제출 버튼 없는 폼은 Enter로 submit되지 않는다
                        ⚠️ **이름이 같은 파일이 components/projects/에도 있다** — 그쪽(ProjectSearch)은
                        이것을 감싸 useRouter로 ?q=를 미는 배선 래퍼이고, 여기는 라우터를 모르는 프리미티브다
  surface-selector.tsx · github-account.tsx · reconnect-button.tsx · submit-button.tsx ·
  project-archived.tsx · project-not-ready.tsx · root-fallback.tsx
                        화면에 걸치는 조각들. surface-selector는 **소비자가 0인 dead code**다(테스트 둘만 import — 소스 전환은 번역 트리가 든다, audit-ux #34). 지우지 않고 남겨 둔다
                        (표면이 둘 미만이면 스스로 null을 낸다 — 축이 안 보이는 프로젝트에 컨트롤을 세우지 않는다).
                        ⚠️ project-archived·project-not-ready는 **화면 대신 서는 안내 한 쌍**이고 정책과
                        문구를 각자 한 곳이 든다 — 같은 갈래를 만나는 화면이 다섯·둘이라 사본이 생기면
                        그중 하나가 낡는다. github-account(연결/해제 Dialog)·reconnect-button은 결과를
                        인라인 Alert로 내고 redirect하지 않는다. submit-button은 useFormStatus 하나를
                        감싸 로그인·초대 폼이 같은 pending을 쓰게 한다
  __tests__/            focus-ring(소스 스캔 — 탭으로 지나가야 보이는 결함이라 눈으로 두 번 놓쳤다) ·
                        docs-content(`/docs`의 상한·포맷·action 넷·마커를 정본 상수와 실제 `uses:`에 대조) ·
                        disabled-pairing(⚠️ buttonClass의 disabled: 유틸리티마다 aria-disabled: 짝이
                        있는지 + 그 스타일을 ui/button.tsx 밖에서 쓰지 않는지. <a>와 Radix 트리거는
                        disabled 속성을 못 써서 각자 철자를 발명했고 같은 pending이 세 화면에서
                        달라 보였다 — POSTMORTEM 2026-09-17. hover: 축만 양방향 예외다) ·
                        client-graph(⚠️ "use client" 값 import 그래프에 ts-morph·octokit·prisma·node:fs가
                        없는지. 없으면 7.2MB 청크가 조용히 나간다 — 실제로 나갔다) ·
                        slottable-item · translations-screen · home-screen · logs-screen · members-screen ·
                        projects-screen · signin-screen · segmented-control(jsdom 렌더) · auth-toast ·
                        settings-screen(워크플로 YAML이 활성 표면 전부를 드는지 — 비기본 표면의
                        step을 다시 볼 자리가 그 화면뿐이다) ·
                        multiline-detail · base-locale-screens · table-presets · manual-format-hint ·
                        new-project(모달 상태 전이·응답 역전·수동 검증·세션 만료의 DOM 회귀) ·
                        resizable · shell-panels · files-step-panels(패널 구분선 — 핸들이 옛 gap을
                        흡수하는지, 재기 전 px 폴백, Panel의 인라인 overflow 되돌리기)
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
                        safe-adapter(linkAccount 거부. ⚠️ 만료 세션 조회의 근거도 여기 있고 구현은 credentials/adapter다) ·
                        read-session · outage · public-session · permission · access · invitation ·
                        invite-view · membership · email · cookie(sessionCookieName — 세션 쿠키 이름의 유일한 출처) ·
                        member-identity(행의 두 줄 배치 + 아바타 씨앗. ⚠️ 씨앗이 1행과 갈라져 있다 —
                        1행이 마스킹 주소면 이니셜이 셸 아바타와 다른 글자가 된다) ·
                        seat-notice(좌석 라벨 갈래 + EDITOR 우선순위. ⚠️ 서버 전용 — invitation이
                        node:crypto를 문다. 화면은 값만 받는다) ·
                        lock(lockUser — 인증 왕복 셋의 User 행 잠금 · lockProjectAccess — Project→Surface 잠금 뒤 멤버십·역할·보관 재판정, 순수 판정은 access의 planLockedAccess) · message · landing · invite-label ·
                        profile(⚠️ GitHub provider의 기본 userinfo를 대체한다 — @auth/core는 /user/emails에서
                        주소만 뽑고 verified를 버려, 검증한 주소와 저장되는 주소가 갈린다. /user 조회 실패는
                        던지고 검증 실패는 email을 비워 signIn이 막게 한다) ·
                        roundtrip(잎. 인증 왕복 셋이 사본으로 들던 원시 판정 — OAuth callback 경로 ·
                        nonce 검사 · 쿠키 두 변형 만료. ⚠️ 흐름은 공유하지 않는다 — 가로채기 본체는 셋이 각자 든다) ·
                        roundtrip-cookies(server-only. 새 왕복이 시작될 때 병합·회수·연결의 **버려진 쿠키를
                        전부 선점 해제**한다 — 목적이 셋이라 남은 쿠키가 다음 왕복의 갈래를 바꾼다)
                        ⚠️ 판정은 순수 함수, 조회·세션은 얇은 껍데기라는 규칙이 이 디렉터리의 형이다
  upload/               프로필·프로젝트 이미지. image(형식·크기·키·삭제 allowlist 판정 +
                        planImagePick — 클라이언트 선검사) · normalize(server-only. sharp로 EXIF 방향
                        적용 → 192px 이내 축소 → WebP 재인코딩) · store(server-only Vercel Blob I/O) ·
                        message(거부 → 문구). 실 저장소 검증·고아 후보 조회는 pnpm smoke:blob
                        ⚠️ **normalize는 인증·사용자·Blob·DB에 닿지 않는다** — bytes → bytes라
                        프로젝트 이미지도 그대로 재사용한다. avatars/projects 키·삭제 판정은 분리한다
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
                        plan · run · render · load · client · targets · trigger · sync-branch · branch-name · ref-slug ·
                        message · payload /
                        run(진입점 둘이 지나는 유일한 껍데기 — ⚠️ 던지지 않는다) · plan
                        ⚠️ **payload가 두 축에 각각 있다**(push/payload = `/api/push` 본문, pull/payload =
                        Git Data API 요청 본문). 둘 다 **외부 계약이라 반환 타입을 명시하는 것이 요지**이고
                        — 리터럴로 조립하면 필수 필드가 늘어도 컴파일러가 침묵한다(POSTMORTEM 2026-08-31).
                        pull 쪽에서 그 침묵이 내는 결과는 base_tree 누락, 즉 나머지 파일이 전부 삭제된 커밋이다
                        ⚠️ pull/message는 PullOutcome 유니온의 주인이다 — 화면과 Action이 **값으로** 받는
                        타입이라 run의 결과에 실패 갈래를 더해 한 자리에서 닫는다
  import/               리포 재적재(화면 이름 `Sync`) — approval(폐기 승인 지문의 발급·재계산이 같은 함수) · read(파일 읽기·스냅샷 오류) · surface(읽기·준비
                        추출) · empty(정상 빈 카탈로그와 깨진 파싱을 가른다) · plan(거부 순서·실행권) ·
                        apply-plan(revision·실행 토큰 대조) · run(진입점 껍데기) · confirm·result·refusal
                        ⚠️ **뒤의 셋은 화면이 값으로 부르는 잎이다**(client-graph) — confirm은 어느 경고
                        줄이 서는지, result는 결과 요약, refusal은 거부의 tone·닫기·액션을 정한다.
                        판정을 컴포넌트에 두면 "형이 둘"(성공 한 줄 · 사고 두 줄)이 테스트 밖으로 나간다
  events/               **프로젝트 활동 스트림** (2026-09-20, logs-rework) — payload(어휘·종류별 맥락·
                        `runToken` 조립·`readPayload`) · view(결과 열·값 상태·UTC 날짜 카드·수집 경계선) ·
                        filter(URL 판정·커서·UTC 구간) · search(검색 문자열의 **유일한 관문**) /
                        query(`server-only` 조회) · record(사건 기록) · ci(CI 적재 사건) · member-label
                        ⚠️ **앞의 넷은 잎이다** — 클라이언트가 값으로 읽고, 조회를 물면 그 순간 Prisma가
                        번들에 온다(POSTMORTEM 2026-09-07의 7.2MB). `client-graph.test.ts`가 파일 집합을
                        정확 일치로 고정한다
                        ⚠️ **record와 query를 섞지 않는다** — 상태 변경은 `recordEvent`로 **변경과 같은
                        트랜잭션**, 외부 실행은 `recordRun`/`finishRun`으로 **관측된 종료**다(ARCHITECTURE §5.7)
                        ⚠️ **`buildSearchText`를 안 지나면 그 종류가 조용히 검색에서 빠진다**
                        `__tests__/locked-access.integration.ts` — 잠금 재판정의 경합 재현(`pg_stat_activity`로 실제 잠금 대기를 관측)
  keys/                 view(집계·배지·행 축 다섯·localeProgress) · query(server-only 조회 —
                        loadProjectList는 집계 다섯을 Promise.all로 보내고 원격 조회와 함께 기다린다) ·
                        save(planSave·planKeySave·KeySaveInput — 셀 판정의 정본은 planSave 하나다) ·
                        flag(국기 253 — ⚠️ 매핑이 원리적으로 실패하고,
                        계약은 실패했을 때 코드만 그리는 것이다)
                        · translation-rework 서버 경로 넷(2026-09-23 — 화면은 C4에서 붙는다): translation-list(트리·요약 목록·상세
                        조회, oracle은 `lib/translations/summary.ts`) · save-key(키 단위 저장 + 복원 기준 기록) · revert(Revert
                        미리보기·실행) · delivery(전달 확인 상태 — 저장과 Revert가 같은 판정을 쓴다). 넷 다 `server-only`가 없다(격리 PG가 직접 부른다)
  translations/         **번역 화면 리워크의 순수 계약** (2026-09-23, translation-rework C1 — 소비자는 C3/C4에서 붙었다).
                        query(URL 계약 — 요청값을 들고 옛 `state=untranslated`·`locales`를 받는다, `sort` 없음) ·
                        summary(키 집계 oracle · Incomplete first 안정 분할 · effectiveCompletion) · selection ·
                        draft(saved/draft/inFlight 세 층 reducer + 세션 복구 사본) · saved-rows · navigation ·
                        baseline(미전달 셀 delta 기준 — ARCHITECTURE §5.8) · layout(세 패널 폭 계약 — 로케일 ≥420을 마지막까지 지킨다) · context(전달 확인의 context 지문 — ⚠️ **이것만 잎이 아니다**:
                        `node:crypto`를 물어 서버 전용이고 `lib/pull/load.ts`·Save가 쓴다). 나머지는 잎이다 — import는 서로와
                        잎인 `lib/routes.ts`뿐이다. 키 단위 저장 계획(`planKeySave`)은 `planSave` 옆 `keys/save.ts`에 있다
  sources/             query(server-only 목록/선택 상세, 역할별 명시 projection) ·
                        actions(planSourceActions) · base-language(폼 상태 판정) · add-block(Add sources가 꺼진 갈래별 사유 —
                        malmoi#93). 세 잎은 서버 import가 없다.
  revalidate-after-commit.ts  커밋 뒤 재검증 실패를 저장 실패로 뒤집지 않는 공유 helper(account/settings/sources).
  surfaces/            plan(정렬·slug·경로 라벨·소유권, client-safe) · access(프로젝트 인가 뒤 표면 좁힘)
                        push·편집 조회는 projectId + surfaceId. Publish는 프로젝트 단위 단일 PR
  surfaces/create.ts   Project 잠금 후 인가·리포·출력 경로 재검사, 다중 생성+첫 적재 한 tx 확정
  surfaces/plan-add.ts  기존 소스 잠금·중복 템플릿·추가 결과/부분 적재 경고·집계 문구 순수 판정
  keys/query.ts         loadSurfaceCounts — 활성 표면의 non-orphan 키/언어 수를 SQL 하나로 집계
  import/surface-status.ts  소스 적재 상태 다섯 갈래와 최초 적재 재시도 가능 여부
  publish/              Publish 모달이 읽는 순수 판정 다섯. diff(셀 단위 조립·키 병합·상한) ·
                        plan(결과 8갈래 planPublishView + 버튼 planPublishButton, 둘 다 never 검사) ·
                        warnings(파일별 묶기 — 파서 원문의 개행을 보존한다) · words(낱말 diff) ·
                        preview(모달 상태 다섯의 계약). ⚠️ read.ts만 server-only다 — base 트리를
                        읽어 "무엇을 덮는가"를 만든다. **이전 값은 표시 전용이고 어떤 판정의
                        입력도 아니다**(ARCHITECTURE §0 불변식 2)
  protection/           미전달 편집 보호(sync-edit-protection) — plan(보류·폐기·Publish·화면 판정 넷, 잎) ·
                        fingerprint(폐기 승인 sha256 — ⚠️ node:crypto라 plan과 갈라 뒀다, client-graph가
                        파일 목록으로 고정) · where(토큰 술어 pendingWhere — **미전달 술어의 주인**. countPending·
                        loadPendingEdits는 토큰 컬럼만 보는 count가 0이면 관계 조인을 건너뛴다, POSTMORTEM 2026-09-18) ·
                        backfill(옛 술어 ∧ 활성 ∧ 토큰 없음 SQL 한 문장 — 배포 B precondition 마이그레이션이 같은 조건을 복제한다)
  privacy/              개인정보처리방침의 등재부 — collected(모델 전수 분류 + personal 모델의 스칼라
                        전수 → 방침의 절 id). ⚠️ **로직 0의 데이터 파일이고 게이트는 pnpm typecheck이다** —
                        모델·필드가 늘면 이름을 지목하며 red. import type 하나뿐이라 server-only가 아니다
                        · disclosure(sectionGaps — 등재 ↔ 본문의 절) · doc-text(docText·docDigest — 본문 텍스트·해시,
                        node:crypto라 테스트 전용). 실물 대조는 __tests__/policy-gate.test.tsx(ARCHITECTURE §6.035)
  invitation-email/     초대 메일(PRODUCT §4.1 · ARCHITECTURE §6.02). 순수 판정 — recipients(다중 입력·행별 역할·정규화 중복 거부) ·
                        plan(좌석 → 행 오류 → 60초/시간당 20건, 요청 전체 통과 또는 전체 차단) · message(text URL 한 줄 + html — 템플릿은 template.ts, Claude Design `email/invite.html`이 정본, 로고는 public/email/logo@2x.png 고정 URL) ·
                        config(env 맵 → ready/unavailable, origin을 VERCEL_ENV와 대조) · result(batch 응답 → 요청 단위
                        accepted/rejected/unknown) · limits(상수, 잎). 껍데기(server-only) — issue(Project 잠금 안 발급·재발급,
                        메일을 안 보낸다 — 재발급은 옛 링크의 조건부 닫기 count=1이 선행조건) · send(commit 뒤 Resend batch 한 번,
                        재시도 0·10초 timeout, 로그에 상태 코드만). 호출부는 createInvitations·resendInvitation이고
                        화면은 초대 모달과 Pending의 Resend다 · retry-at(retryAt → UTC 분 올림, 잎). ⚠️ recipients는 클라이언트 폼도 부르므로
                        zod·node:crypto를 물지 않는다 — 한도를 plan이 아니라 limits에서 읽고 zod의 이메일 정규식을
                        옮겨 뒀다(client-safe.test가 그래프, recipients.test가 zod와의 판정 일치를 고정한다).
                        PostgreSQL 경합은 invitation.integration.ts(`pnpm test:projects:postgres`)가 잰다
  pull/surfaces.ts      planMultiSurfacePull — 중복 경로 거부와 path 순 평탄화
  pull/undeliverable.ts 전달 불가 셀의 좌표 보류(잎) — writer 오류를 보류(비-base 파일 부재 · 키 자리 없음)와 거부로
                        가르고 캡처 편집을 실린 것/보류된 것으로 나눈다. 미리보기(publish/read)는 같은 판정을 행 단위로 따로 든다
  import/locales.ts     localesToKeep — 다운로드 실패 로케일을 재탐지 목록에 되살린다(경로 → 로케일은 onboarding/confirm의
                        localeOfTemplatePath가 templatePaths와 같은 패턴으로 든다)
  github.ts             Git Data API 래퍼(App installation 토큰). openRepoReader가 토큰을 한 번만 발급한다
  github-wait.ts        GitHub 대기 마감(GITHUB_WAIT_MS 8초) 하나 — 목록 원격 신호·probe·열린 PR·계정 조회가 같은 값을
                        읽는다(ARCHITECTURE §6.5.2). octokit을 물지 않는 잎이라 lib/github를 mock한 테스트에서도 실물이 돈다
  github-connect/       사용자 토큰 전담 — App 개인키를 모른다. origin · state · account-link ·
                        account-view · connect-plan · health · token · token-store · user · repository-id ·
                        installed-repos · installation-url · callback-plan(callback 갈래 판정 — 쓰기는
                        route에 남는다) · pending(설치 요청 대기·승인 판정) · log(접힌 실패를 **서버 로그에만** 남기는
                        logFailure — 응답 본문에는 안 싣는다) · message(거부 → 문구. ⚠️ 던지지 않는다 —
                        ?e=가 주소창 값이라 단언을 걸면 설정 화면이 통째로 죽는다)
                        ⚠️ installed-repos는 /account의 "Installed on {n} repositories."다. 판정
                        (countInstalledRepos)이 순수 함수이고 껍데기는 실패를 logFailure로 남기고
                        던지지 않는다. null("못 읽었다")과 0("고른 것이 없다")이 다른 값이다 —
                        실패한 조회를 0으로 읽으면 사용자가 멀쩡한 설치를 다시 만든다
                        ⚠️ installation-url은 apps/<slug>/installations/new 하나를 만든다. 기존 세
                        자리(new-project-modal · 프로젝트 설정 · 온보딩 ②)는 아직 각자 조립한다 —
                        중복 넷을 헬퍼로 모으는 것은 후속이다
  credentials/ session-revocation/ login-link/ account-connect/
                        저장 시 암호화 / 전체 세션 회수 / 계정 병합 / 로그인 수단 추가.
                        credentials/log는 삼킨 실패의 한 줄(`[credentials]`) — 원인이 CredentialError로
                        바뀌는 자리에서만 찍고 바깥 경계(signIn)는 항상 찍는다. 원문 금지
                        ⚠️ session-revocation의 message는 주소창 값(?sessionRevocation=)을 받으므로
                        인자가 union이 아니라 string | undefined다 — 단언을 걸면 "모르는 값에 문구를
                        내지 않는다"가 검사에서 지워진다
                        ⚠️ 뒤의 셋은 같은 형이고 목적이 다르다(회수는 왕복을 멈추고, 병합은
                        진행시키고, 추가는 살아 있는 세션 위에서 Account만 쓴다) — 합치지 않는다.
                        ⚠️ account-connect는 VerificationToken의 **세 번째 접두**이고 plan(판정) ·
                        policy(쿠키) · http(가로채기) · store(challenge·Account 쓰기)로 갈린다
  onboarding/ survey/ scan/ projects/ shell/ settings/ signin/ i18n/ cli/
                        (cli/push-response — `/api/push` 응답을 CI 로그·exit로 옮긴다. deferred면 exit 0 + ::warning 한 줄)
                        각 기능의 순수 판정층
  home/                 Home의 순수 판정 다섯 (2026-09-15 재편). state(여섯 아트보드 → 값 하나 —
                        ⚠️ 로딩은 갈래가 아니다: 라우트의 loading.tsx이고 union에 넣으면 생산자 없는
                        갈래가 남는다) · cards(보조 줄과 0 갈래 — ⚠️ 상태의 보조 줄이 0 갈래를 이긴다) ·
                        attention(세 종을 한 시간축에 · 상한 5 · ⚠️ 폴백은 actors 맵의 키 존재로 판정한다,
                        actorLabel의 null이 아니다) · meta(행이 상태에 따라 사라지거나 는다) ·
                        overview(recentActivity — ⚠️ 상한이 건수가 아니라 7일 창이다)
                        ⚠️ **전부 I/O가 없고 server-only를 안 붙인다** — 테스트가 직접 import한다
  shell/panel-size.ts   px 치수 → 리사이즈 패널의 % 제약. ⚠️ 분모가 그룹 폭이 아니라 "핸들을 뺀 폭"이다
                        — 라이브러리가 패널에 flex-basis:0 + flex-grow를 걸고 핸들은 별도 flex 항목이다
                        ⚠️ 못 잰 폭은 0이 아니라 null이다 — 0이면 셋이 전부 100%가 된다
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
  projects/open-pr.ts   server-only. installation 토큰으로 sync 브랜치의 **열린 PR 하나**를 찾는다 —
                        Publish·Sync 화면이 "이미 열려 있다"를 말할 근거다
  projects/pr-url.ts    parseGithubPrUrl(순수). ⚠️ 저장된 URL을 **그 프로젝트의 owner/name으로 다시 검증**한다
                        — DB 문자열을 그대로 링크로 내면 남의 리포를 가리키는 값이 화면에 선다
  projects/import-failure.ts
                        ⚠️ **CI가 보고할 수 있는 실패 넷**만 드는 client-safe 어휘다. 검증(닫힌 보고
                        스키마)은 import-status.ts에 남는다 — 갈라 두지 않으면 서버만 아는 판정
                        (partial-import)이 외부 계약으로 새어 나가 아무것도 안 들어간 프로젝트가
                        부분 성공으로 보인다
  onboarding/branch.ts  ⚠️ planBranchChoice — 목록/자유 입력/읽기 전용 셋을 가른다. 조회 실패를
                        "브랜치가 없다"로 읽지 않는 것이 요지다(POSTMORTEM 2026-09-03)
  onboarding/select-surfaces.ts
                        체크 후보를 탐지 순서로 제출하고 slug·출력 충돌을 계산하는 클라이언트 잎
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
  landing/              랜딩(`/`) 스테이지의 수학 — stage(fitScale · growProgress · sceneAt · typedPrefix · frame).
                        ⚠️ 잎(import 0) — 스테이지 클라이언트가 값으로 읽는다. 같은 스크롤 위치 → 같은 프레임이
                        역방향 스크럽의 조건이라 이전 프레임을 입력으로 받지 않는다. `/`에 무엇을 그릴지는
                        여기가 아니라 lib/auth/landing.ts(rootView)다 — 이름이 겹치지만 축이 다르다. 공개 셸 헤더의
                        primary(publicCta — 라벨을 사전 키로 준다, 그 모듈이 잎이라서)도 그 파일이다
  public-doc/           `/privacy` 목차의 현재 절 판정 — toc(currentSection). ⚠️ 잎(import 0) — 목차 클라이언트가 값으로 읽는다
  links.ts              외부 링크(GitHub 리포 URL)와 푸터 링크 목록 — 랜딩·/signin 푸터가 같은 목록·순서를 읽는다.
                        ⚠️ 외부 URL을 routes.ts에 넣지 않는 이유가 이 파일이다(죽은 라우트 검사가 앱 경로로 읽는다)
  routes.ts             앱 내부 링크의 단일 출처(잎, import 0). ⚠️ 쿼리는 withQuery를 지나야
                        entry-points의 "쿼리 수신자" 검사에 걸린다 — 문자열 연결은 그 검사를 회피한다
  search-params.ts      ⚠️ 잎. Next의 searchParams는 반복 파라미터를 배열로 주므로 화면 여덟이 전부
                        이것을 지난다. Object.create(null)로 만든다(키를 주소창이 정한다)
  locale-code.ts        ⚠️ 잎. 로케일 코드와 pathTemplate이 리포 경로 조각이라 값이 아니라 경로로 검증한다
  failure.ts            500 본문 판정 — 우리 메시지는 그대로, 남의 라이브러리 메시지는 ref만.
                        응답이 대상 리포 Actions 로그로 흘러가고 그 리포가 public일 수 있다.
                        logCaught — 삼켜서 갈래 하나로 접는 자리의 서버 로그 한 줄(원문 금지).
                        httpStatus · isUniqueViolation — 흩어진 사본이 셋·넷이던 판정
  compare.ts            ⚠️ 잎. compareCodeUnits — 결정적 정렬 전부의 `<` 비교(localeCompare 금지)
  security-headers.ts   ⚠️ 잎(import 0 — next.config가 읽는다). 보안 응답 헤더 값 + 환경별 enforce CSP
                        (프로덕션 · preview=Vercel Toolbar 호스트 · next dev=eval·HMR). CSP 헤더는 하나다
  bounded-body.ts       ⚠️ 잎. 외부 진입점 본문을 상한 안에서만 읽는다(`/api/push`·`/api/push/failure`) —
                        선언된 길이는 읽기 전에, chunked는 읽는 도중에 끊는다. json()·text()를 먼저 부르면 다 읽은 뒤다
  cause.ts              ⚠️ 잎. causeMessage — 잡은 값의 메시지. `(cause as Error).message`는 Error 아닌 throw에서 undefined다
  utc-time.ts           ⚠️ 잎. 절대 시각의 UTC 표기 하나(`2026-09-10 12:00 UTC`) — Logs·Publish가 같이 쓴다
  url-token.ts          ⚠️ 잎. 키셋 커서의 문자열 ↔ base64url 하나 — Logs(클라이언트)와 번역 목록(서버)이 같이 쓴다.
                        Buffer 대신 btoa + 퍼센트 인코딩이라 번들에 실린다. 디코드는 던지지 않는다(주소창 값)
  env.ts db.ts githash.ts utils.ts relative-time.ts tone.ts
```

⚠️ **잎 모듈이 잎인 데는 이유가 있다** — `relative-time`·`utc-time`·`compare`·`ref-slug`·`flag`는
클라이언트가 값으로 읽는 판정이라 무거운 그래프를 물면 그대로 번들이 된다. **재수출도 하지 않는다.**
`vitest.setup.ts`가 `server-only`를 전역 mock하므로 "테스트가 죽는다"는 더 이상 그 압력이 아니고,
**남은 방어선은 `components/__tests__/client-graph.test.ts` 하나**다.

## 그 밖

```
messages/en.tsx         ⚠️ UI 문자열의 단일 출처. 값은 문자열 또는 함수다(헬퍼 셋을 만들지 않는다).
                        갈래 누락은 소비자가 거는 satisfies Record<Union, string>이 잡는다. ⚠️ 잎이다
prisma/schema.prisma    16테이블 + enum 다섯(TranslationSurface가 2026-09-14에 들어와 표면 축이 생겼고,
                        ProjectEvent·EventKind·ActorKind가 2026-09-20 활동 스트림에서, DeliveryConfirmation·
                        TranslationBaseline이 2026-09-23 translation-rework에서 붙었다).
                        ⚠️ Auth.js 4테이블의 모양은 어댑터가 정한다 — 컬럼 하나만
                        빠져도 linkAccount가 런타임에 던지고 타입 검사는 못 본다
prisma/migrations/      ⚠️ dev는 /push 전, prod는 /merge 전에 넓힌다(additive-first)
prisma/credential-cutover/  ⚠️ 마이그레이션이 아니라 스테이징 자리다 — Prisma가 이 디렉터리를 안 본다
prisma/__tests__/       schema-contract · push-token-column · declared-base-locale-column. ⚠️ **스키마
                        파일을 텍스트로 읽어 센다** — tsc는 `schema.prisma`를 안 보고 마이그레이션이
                        빠진 컬럼은 런타임에야 드러난다
prisma/maintenance/     backfill-surfaces.sql. ⚠️ 마이그레이션이 아니라 **손으로 한 번만 도는 SQL**이다 —
                        옛 writer를 멈춘 배포 1 창에서만 유효하고, 표면 편집이 시작된 뒤에는 돌리면 안 된다.
                        credential-cutover와 같은 함정(Prisma가 이 디렉터리를 안 봐서 상태 조회에 안 잡힌다)
scripts/                adapter-survey · sync-agents · copy-fonts · scan · ingest · push-local ·
                        smoke-github · smoke-blob(⚠️ pnpm smoke:blob에 NODE_OPTIONS=--conditions=react-server가
                        붙는다 — PII 복호 모듈이 server-only라 그 조건 없이는 import에서 죽는다) ·
                        credentials · finalize-credentials · backfill-pending-edit-token ·
                        local(loadLocalEnv · scriptPrisma — ⚠️ log: []. lib/db.ts는 server-only라 못 쓴다) ·
                        format(fileProbe · requestedFormat — ingest·push-local의 probe·`--adapter`·탐지 갈래 하나.
                        ⚠️ lib/가 아닌 이유는 문구가 한국어 CLI 출력이라서다 — lib은 no-korean-ui 범위다)
                        (⚠️ DATABASE_URL을 친다 — prod는 명령 한 줄에서 그 변수를 넘긴다, 0행 두 번이 수렴)
                        __tests__/workflow-pins가 .github/ 아래 uses:가 40자 SHA로 핀됐는지 센다.
                        __tests__/prisma-select-columns는 이 디렉터리의 select 키를 schema.prisma와
                        대조한다 — ⚠️ tsc가 Prisma select 키를 안 보고 scripts/는 pnpm test 밖이다
app/icon.svg            파비콘. ⚠️ 라우트가 아니라 **Next의 파일 규약**이라 app/ 트리에 섞여 산다
types/next-auth.d.ts    session.user.id를 싣는 모듈 확장. ⚠️ `login`(GitHub 핸들)이 사라진 자리다 —
                        DB 세션의 session 콜백에는 token이 아니라 user가 와서 실을 곳이 없다
.github/actions/malmoi-i18n-push/action.yml
                        **대상 리포가 참조하는 composite action**(외부 계약, 정본은 ACTIONS.md).
                        ⚠️ 참조는 불변 태그 @malmoi-i18n-push-v1이다 — 태그를 옮기는 것이 릴리스다
public/brand/ flags/    ⚠️ 커밋된 원본이다(fonts/는 반대로 생성물). flags 253개는 lib/keys/flag.ts의
                        FLAG_INVENTORY와 정확히 같아야 한다(flag-assets.test.ts가 양방향으로 센다)
generated/prisma/ public/fonts/   ⚠️ 생성물(gitignore)
vercel.json             Cron(야간 1회) + ⚠️ regions: ["hnd1"] — 함수를 DB 옆에 붙인다. 기본 iad1에서는
                        홉당 ~375ms였고 이 앱의 비용은 페이로드가 아니라 홉 개수다(요청당 일곱)
next.config.ts          ⚠️ 보안 응답 헤더를 여기서 낸다 — 값은 lib/security-headers.ts(환경별 enforce CSP).
                        ⚠️ agentRules: false — Next가 AGENTS.md에 자기 블록을 덧붙이는 동작을 끈다
vitest.setup.ts         ⚠️ server-only를 전역 mock하고 테스트용 암호화 키 셋을 세운다.
                        ⚠️ 셋째가 있다 — 리사이즈 핸들의 getBoundingClientRect를 화면 밖으로 민다.
                        jsdom은 모든 rect가 0×0@(0,0)이라 react-resizable-panels의 히트 판정이
                        **화면의 모든 클릭**을 핸들로 보고 삼켰다(폼 입력이 빈 값으로 남는다)
vitest.projects.config.ts
                        목록 집계의 **격리 PostgreSQL** 검증(`pnpm test:projects:postgres`).
                        ⚠️ `pnpm test`에 없다 — 실제 클러스터를 띄우고, 미전달 술어가 공유 조각(pendingWhere)
                        + 손 사본 셋(번역 목록 bool_or · 상세 셀 투영 · 프로젝트 목록 raw SQL)이라 "같은 행을 세나"를 재는 유일한 자리다. `lib/keys/**`의 raw 집계를
                        건드렸으면 손으로 돌린다. 편집 토큰의 조건부 쓰기(적재 정리·Publish CAS·backfill)와
                        동시 CI push의 결과 표시(concurrent-import — barrier로 두 요청을 교차시킨다)와 전달 층 불변식
                        (delivery-invariants — 승인 Sync의 orphan 토큰 해제 · orphan 셀 적재 제외 · 로케일 재시도 · 보류 뒤 Revert)도
                        여기서만 잰다 — include가 `lib/keys`·`lib/events`·`lib/invitation-email`의 `__tests__/*.integration.ts`로
                        박혀 있어 그 밖에 만든 통합 테스트는 조용히 0건 수집된다
vitest.credentials.config.ts
                        같은 형의 둘째다 — 자격증명 암·복호의 **격리 PostgreSQL** 검증
                        (`pnpm test:credentials:postgres`, include는 `lib/credentials/__tests__/*.integration.ts`).
                        ⚠️ 이쪽도 `pnpm test` 밖이라 `lib/credentials/**`를 건드렸으면 손으로 돌린다
auth.ts                 Auth.js v5. 어댑터가 credentialAdapter(그 아래가 safePrismaAdapter)이고
                        세션 토큰은 우리가 만든다(DB엔 digest만). handlers는 withRevocation으로 감싼다
```
