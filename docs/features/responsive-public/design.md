# responsive-public — 기술 설계

[스펙](spec.md) · [태스크](tasks.md) · [브리프](design-brief.md). 측정 숫자는 코드 선언값이며 브라우저 검증은 미실행이다.

## 1. 영향 흐름과 변경 소유권

공개 읽기·Auth UI를 바꾼다. push·pull 서버 코어는 변경하지 않는다. 검색·Inbox·계정·언어 변경은 기존 Action을 그대로 사용한다.

"P2~P5"는 태스크 번호이고, 묶음 전체는 **공개 단계**라고 부른다.

| 소유 | 파일/영역 | 경계 |
|---|---|---|
| P2 공개 셸·공유 오버레이 | `components/public-shell/`·`components/shell/header-bar.tsx`·`components/search/`·`components/shell/attention-inbox.tsx`·`components/ui/dialog.tsx`·`components/ui/large-modal.tsx` | 공유 프리미티브는 현 소비자 모두 검사. 앱 셸 하한과 레이아웃은 풀지 않음. `HeaderBar`의 세 번째 소비자 `components/landing/mockup/app-frame.tsx:6,53`도 회귀 대상 |
| P3 공개 읽기 | `app/docs/`·`components/docs/`·`components/public-doc-toc.tsx`·`components/public-doc-table.tsx`·`app/privacy/page.tsx`·`components/privacy/privacy-doc.tsx`·`app/changelog/page.tsx` | 본문·원고·SEO·검색 색인 내용 불변 |
| P4 Auth | `components/signin/`·`app/signin/`·`app/invite/`·`app/oauth/authorize/` | 레이아웃과 상태 표현만; 토큰·인가·OAuth 계약 불변 |
| P5 랜딩 1차 | `app/page.tsx`·`components/landing/stage.tsx`·`lib/landing/stage.ts` | 1440×900·5씬 유지, 캡션 높이 반영 |
| A2e 후속 | `components/landing/mockup/`와 위 stage 둘 | 앱 설계 확정 후 같은 파일을 순차 수정. 공개 단계에서 선구현하지 않음 |

`app/globals.css`의 `--spacing-shell-min`(1280) 전역 값을 375로 바꾸지 않는다. 공개/Auth 셸에서만 `min-w-shell-min` 사용을 제거한다.

**큰 모달 규칙 — `lg` 미만은 전체 화면 시트**(2026-10-10 사용자: "public의 큰 모달 규칙이 app 작업할 때도 공통 반영"). LargeModal 계열 — `LargeModal` 소비자 전부(`publish-button.tsx`·`event-dialog.tsx`·`add-sources-modal.tsx`·`source-detail-modal.tsx`·`ci-card.tsx`·`invite-modal.tsx`·`token-modal.tsx`·`onboarding/new-project.tsx`)와 `CommandDialog` — 는 `lg` 미만에서 §2의 전체 화면 시트 형이 된다. **규칙은 `large-modal.tsx`의 그릇 상수(`LARGE_MODAL_OVERLAY`·`LARGE_MODAL_PANEL`·`LARGE_MODAL_HEIGHT`) 한 곳에 두고 소비자는 다시 지정하지 않는다** — 그래서 P2가 넣으면 앱 모달은 코드 변경 없이 같은 규칙을 받고, responsive-app은 소비자별 내부 배치와 실측만 맡는다. 시트에서는 radius·선·그림자·scrim이 없고 높이는 `100dvh`, 머리 고정·몸통 하나만 스크롤, footer는 몸통 밖 바닥에 붙고 safe-area 하단을 더한다. 안쪽 여백 `px-8`(`large-modal.tsx:159,193,201`)은 시트에서 머리 좌 16과 같은 16으로 줄인다 — 375에서 본문 343이라 초대 행(이메일+역할168)이 든다.
- **`--spacing-modal-gutter`(96)는 재정의하지 않는다**(처음 설계의 미디어 쿼리 재정의를 이 규칙이 대체). `lg` 이상에서는 1024×768에서도 폭 928·높이 672로 모달이 담긴다. DESIGN §6.54의 "gutter 96 유지"는 `lg` 이상의 사실로 남고, "알려진 한계"만 "`lg` 미만은 시트"로 갱신한다(P6).
- ⚠️ **랜딩 목업 `components/landing/mockup/publish.tsx`도 같은 상수를 쓴다** — 목업은 1440 데스크톱 캔버스의 축소 복제본이라 뷰포트 `lg` 미만에서 시트로 바뀌면 안 된다. 시트 클래스는 상수에 바로 섞지 않고 실제 모달 그릇(`LargeModal`·`CommandDialog`)만 받게 나누거나 목업이 데스크톱 상수를 쓰게 한다. `landing-mockup.test.tsx`가 회귀 대상이다.
- 작은 확인 대화(`DialogContent` 440)는 이 규칙 밖이다.

## 2. 셸·서랍·포커스

**1024 판정은 뷰포트 `lg`(64rem) 하나다**(2026-10-07 사용자). 서랍·모달은 body 포털이라 컨테이너 밖에 있으므로 셸 컨테이너 쿼리로는 판정이 둘로 갈린다. 랜딩 목업만 정적 복제본이라 컨테이너 변형을 갖는다(app design §5).

- CSS가 배치를 정한다: `lg:` 미만 서랍 트리거, 이상 고정 내비.
- JS가 필요한 곳은 둘이다 — **넓어질 때 열린 서랍·시트를 닫고 포커스를 옮기는 것**, 그리고 **Inbox를 열 때 그릇을 고르는 것**(아래 "전체 화면 시트"). 서랍·시트가 열려 있는 동안에만 `matchMedia('(min-width: 64rem)')` change 리스너를 단다. 렌더 상태·`useSyncExternalStore`를 쓰지 않으니 SSR/하이드레이션 불일치가 없다. JS가 `1024px`·`innerWidth`로 판정하면 사용자 글꼴 설정에 따라 rem 경계와 어긋나므로 금지하고, 쿼리 문자열이 Tailwind `lg`와 같은지는 소스 스캔 테스트로 고정한다.
- 하이드레이션 전 인라인 스크립트는 금지다 — CSP가 `'nonce' 'strict-dynamic'`이라 막히고 현재 0건이다(`app/layout.tsx:61-65`). UA 분기도 하지 않는다.

**서랍 조립**: `DialogContent`는 가운데 440 하나뿐이다(`dialog.tsx:172`). 호출부가 위치·높이·애니메이션을 덮는 것은 DESIGN §8 위반이고 소비자가 공개 내비·앱 LNB 둘이라 사본이 생긴다. `CommandDialog` 선례처럼 **`dialog.tsx`에 측면 변형 형제 export 하나**를 두고 P2에서 공개 내비 소비자와 함께 넣는다(앱 LNB는 A2가 소비). `closeDisabled`·initial focus·복귀 포커스는 그대로 재사용한다. radius 규칙(`visual-system.test.ts:612`)과 충돌하지 않게 측면 서랍의 radius를 DESIGN에 등재한다.

**공유 헤더 배치표**(두 셸 공통, P2 소유 — 앱 A01은 이것을 소비하고 LNB 서랍·프로젝트 전환만 더한다):

| 폭 | 헤더에 남는 것 | 서랍으로 가는 것 |
|---|---|---|
| `lg` 이상 | 지금 그대로 | — |
| `lg` 미만 | 로고 · 서랍 트리거 · 검색(아이콘, 접근 이름 유지) · Inbox(로그인) · 계정 메뉴 | Docs · Changelog · GitHub · 언어·테마 스위처(서랍 바닥 고정 — 공개 푸터는 왼쪽 링크 묶음만 남는다) · (앱) New project · LNB |

**검색·Inbox는 헤더에 한 벌만 둔다.** `SearchTrigger`는 인스턴스마다 document keydown 리스너를 등록하고(`search-trigger.tsx:25-36`) `AttentionInbox`는 마운트 effect에서 배지 Action을 부른다(`attention-inbox.tsx:47-52`, `public-shell.test.tsx:396-399`가 1회 고정). 좁은 폭은 CSS로 아이콘만 보이게 하고(FieldButton에 아이콘 전용 반응 클래스) 서랍에는 내비 링크와 스위처만 넣는다.

**헤더 메뉴는 늘 글로벌 서랍이다**(2026-10-10 사용자 — 처음 설계의 "Docs 서랍 하나에 두 구역"을 대체). 좁은 `/docs`의 장 내비는 본문 위 **하단 캡슐**(가운데 · 푸터 위 16 · 44 · radius full · shadow-medium · 현재 페이지 제목)이 여는 **전체 화면 시트**다. 트리거와 내용이 일대일이라 메뉴 내용이 페이지마다 달라지지 않는다. 캡슐은 `lg` 미만 `/docs`에서만 서고, 본문 아래 여백 120이 마지막 줄을 캡슐 위로 올린다. 인덱스·404에서 캡슐 라벨이 무엇인지는 P3에서 정한다. TOC는 문서 본문 안의 펼침 목록이며 내비와 합치지 않는다.

**전체 화면 시트**(2026-10-10 사용자): `lg` 미만에서 검색·Inbox·Docs 장 내비, 그리고 LargeModal 계열 전부(§1 큰 모달 규칙)는 inset 0의 시트다 — radius·선·그림자·scrim 없음, 면 `--background`, 머리 56(제목 18/500 또는 입력) + 아래 divider + 닫기 32, **머리 고정·몸통 하나만 스크롤**, 위아래 safe-area inset. `lg` 이상은 지금 형(모달·팝오버) 그대로다.
- 검색: `CommandDialog`에 `lg` 미만 전체 화면 클래스만 더한다(CSS). 전체 화면에는 scrim이 없어 머리에 Cancel(ghost sm)을 둔다.
- Docs 장 내비: 측면 서랍과 같은 Dialog 기반, 행 최소 40. 링크로 닫히면 `onCloseAutoFocus`를 막는다.
- **Inbox는 그릇이 바뀐다** — `lg` 이상 DropdownMenu, 미만 Dialog 시트. 내용은 열 때만 마운트되므로 판정은 **열기 핸들러에서 `matchMedia` 한 번**이고 렌더 상태를 두지 않는다(SSR·하이드레이션 불일치 없음). 트리거는 `DropdownMenuTrigger` 하나이고 좁은 폭에서는 메뉴 열림을 막고 시트를 연다. 열린 동안 `lg`를 넘나들면 닫는다. 목록 본문(그룹·행·상태)은 두 그릇이 같은 컴포넌트를 쓰고, 열기=읽음 기록은 트리거 쪽 한 번이다. 메뉴의 sr-only 제목은 시트에서 보이는 제목(Inbox + 수)이 된다.

**포커스 계약**
- 열기 → 서랍 안 **현재 페이지 항목**(`aria-current`)에 포커스, 없으면 첫 항목. Tab 순환·배경 비활성.
- Esc/배경/닫기 → 트리거 복귀.
- 링크로 닫힘 → `onCloseAutoFocus`를 막는다(검색 착지 DESIGN §6.54와 같다). 도착 화면의 포커스가 이긴다.
- 넓어지며 트리거가 사라짐 → 서랍을 닫고 고정 내비의 대응 링크, 없으면 본문 제목.
- **좁아지며 고정 내비가 숨음** → 포커스가 숨는 링크 안에 있었으면 서랍 트리거로 옮긴다(`body`로 빠지면 POSTMORTEM 2026-09-24 「포커스가 body로 빠지는 자리」 재발).
- resize 때문에 본문/스크롤러/검색/Inbox를 다시 마운트하지 않는다. 읽음 Action은 실제 Inbox 열기 이벤트 한 번에만 실행한다.

서랍 닫힘 때 진행중 Action 제한을 우회하지 않는다. 검색·Dialog는 기존 IME guard를 유지한다. 공개 스크롤러의 body 포커스 회수와 Dialog focus trap이 경쟁하지 않도록 오버레이 열림 상태에서도 실물 검증한다.

**터치 히트 영역**(2026-10-07 사용자): 보이는 크기는 그대로 두고 `pointer: coarse`일 때 `::after`로 누르는 영역만 44까지 넓힌다(버튼 `sm`28·`icon-md`32 대상). 리사이저(8px)는 `touch-action: none`. DESIGN §7에 등재한다(P6).

**꺼진 컨트롤의 사유**: DESIGN §7은 보이는 글자 자리가 없으면 `title`+sr-only로 사유를 준다. 터치에는 `title`이 뜨지 않으므로 `lg` 미만에서는 사유를 보이는 `text-xs` 줄로 세운다. 잘린 식별자의 전문도 `title`에만 기대지 않고 줄바꿈 또는 기존 복사 동작으로 닿게 한다.

## 3. 공개 문서·Auth 레이아웃

Docs는 기존264px 내비를 넓은 셸에 유지하고 좁으면 하단 캡슐이 여는 전체 화면 시트로 옮긴다(§2). `app/docs/layout.tsx`의 내비는 경로 이동 동안 유지되며 `PublicScroller`는 기존 페이지별 재마운트 규칙을 보존한다. 해시 헤딩에 착지하고 키보드 Space/PageDown이 본문을 움직여야 한다.

Docs/Privacy 읽기 프레임의 **외부 컨테이너 content box**960 미만은 TOC를 본문 앞 펼침 목록으로 옮긴다. 컨테이너 선언과 이를 질의하는 grid는 부모/자식으로 분리한다. **TOC DOM은 하나**이고 컨테이너 쿼리로 grid 영역만 옮긴다 — 두 벌을 그려 하나만 켜면 인스턴스마다 scroll 리스너와 ResizeObserver가 붙는다(`public-doc-toc.tsx:76-81`). 코드·표 내부 overflow, 이미지 max-width, 긴 URL 줄바꿈을 다룬다. 좁은 형의 TOC는 카드 안 disclosure(머리 44가 `aria-expanded` 버튼, 기본 접힘, 항목을 눌러도 열린 채)다. 빈 TOC에서 좁은 화면에 빈 열을 남기지 않는다. 본문 좌우 여백 40→20은 뷰포트 `sm`이 아니라 같은 컨테이너 폭으로 판정한다. 가로 스크롤 표는 `<table>` 자체에 접근 이름을 준다(POSTMORTEM 2026-09-19).

**표시급 타이포**(2026-10-10 사용자 — 브리프의 타이포 재정의 금지에 대한 유일한 예외): `lg` 미만에서 히어로 h1 48/1.1→30/1.2·본문 18→16·위 여백 120→64, 문서 h1 36→30·h2 24→20·위 여백 64→40. 기존 스케일 안의 한 단계이고 본문 16·UI 13/14·굵기·자간은 그대로다.

Signin 장식은 `lg` 미만 숨기고 폼을 우선한다. AuthColumn320·OAuth480은 `width:100%`와 기존 max-width로 바꾼다. footer는 줄바꿈 높이를 허용하고 본문 최소 높이가 폼/동작을 밀어내지 않도록 한다. 폼 값·pending·에러는 폭 전환으로 초기화하지 않는다.

**소프트 키보드**: `svh` 기반 높이는 키보드가 열려도 줄지 않아 footer가 키보드 밑에 갇힌다. 모달·Auth 폼의 한정 높이는 `dvh`로 바꾸고 footer는 스크롤 영역 밖 sticky로 둔다(Invite·OAuth·온보딩 공통). 대표 프레임은 PT3b다. ⚠️ 공개 Auth 표면에는 텍스트 입력이 0건이라 이 계약을 실제로 밟는 첫 소비자는 LargeModal 폼이다 — 공개 단계에 두는 것은 2026-10-10 사용자 판정이다.

## 4. 랜딩 캡션과 순수 함수

현재 `lib/landing/stage.ts`는 `fitScale({W,H})`에 고정 CHROME_H(16+28)를 빼고 `frame`이 이를 호출한다. 캡션 높이가 변하면 이 전제가 틀린다.

변경할 인터페이스(새 제안): `fitScale` 및 `frame` 입력에 실제 캡션/진행 영역 높이 `chromeHeight: number`를 추가한다. W/H는 기존 공개 scroller 치수다. P5에서 테스트를 먼저 red로 만든 뒤 함수·전체 소비자·테스트를 같은 커밋에서 갱신하며 예전 고정 높이 default로 누락을 숨기지 않는다. gap16은 `chromeHeight`에 포함한다.

- **별도 측정층을 만들지 않는다.** 다섯 캡션을 같은 grid 셀에 겹쳐 두고 활성 캡션만 보이게 하면 셀 높이가 자연히 가장 긴 캡션이 된다. 캡션 묶음은 이미 `aria-hidden`이고 낭독용 sr-only `<ol>`이 따로 있다(`stage.tsx:177-181`). 기존 ResizeObserver로 `chromeRef` 높이를 재 `chromeHeight`로 넘기면 font ready·언어 전환·폭 변경이 같은 관측으로 처리된다. 지금의 `whitespace-nowrap`과 `textContent` 교체(`stage.tsx:104, 240`)는 함께 바꾼다.
- 같은 크기/스크롤 위치에서 같은 프레임이어야 한다. 가장 긴 캡션 기준이라 씬마다 예산이 출렁이지 않는다.
- 미측정 시 캡션은 정상 흐름에 둬 겹침을 막고, 측정 후 고정 스테이지를 활성화한다. 높이가 목업 최소 표시조차 못 담으면 고정 재생 대신 동일5씬 정적 흐름을 보여준다. 씬 정보/CTA를 제거하지 않는다.
- 순수 함수 테스트: 여러 줄 높이·0/비정상 치수·작은 H·scale 0..1·동일 입력 동일 출력·정/역 스크럽·reduced-motion. DOM 측정은 얇은 껍데기다. jsdom은 높이가 0이므로 소비자 테스트는 ResizeObserver stub이 넘긴 값만 검증한다.

서랍은 Dialog가 동작을 들고 CSS가 배치를 정하므로 별도 범용 상태 머신을 만들지 않는다. 공유 breakpoint helper는 위 `matchMedia` 쿼리 문자열 상수 하나뿐이며 잎 모듈에 두고 `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재한다.

## 5. 서버·불변식·성능

스키마/마이그레이션/환경변수/외부 호스트/쿠키 추가 없음. 인증은 기존 페이지/Action 판정이며 좁은 조건부 렌더가 인가를 대신하지 않는다. export 결정성·blob SHA·strict push·보호 토큰·Project 잠금 영향 없음. 새로운 Route Handler 없음.

SSR의 데이터 조회를 클라이언트로 옮기지 않는다. 별도 데스크톱/모바일 데이터 소유자를 중복 마운트하지 않고 client-graph 검사를 유지한다. 기존 메시지와 en/ko/es 사전 재사용, 새 키는 세 언어 동시 추가. `dark:`·raw 색·신규 테마 없음. global-error 등 기존 테마 예외 유지.

## 6. 과거 함정과 검증

- POSTMORTEM 2026-09-15 「자기 자신을 컨테이너로 물은 쿼리」: 선언 조상과 소비자 분리, 960 경계 양쪽 computed grid 실측. 이름 없는 `@container` 중첩(`ui/card.tsx`·`source-detail-modal.tsx`)이 쿼리를 가로채지 않는지 확인한다.
- POSTMORTEM 2026-09-19 「스크롤 래퍼에 준 접근 이름」: 표 자체 이름과 스크롤 영역 이름을 각각 검사.
- POSTMORTEM 2026-09-20 「포커스 복귀가 브라우저에서만 깨졌다」: 새 포커스 DOM 테스트마다 focus fixup observer를 달고, 일부러 깨뜨려 red가 나는지 확인한다. 새 서랍을 기존 `focus-return`·`primitive-focus` 그물에 등재한다.
- POSTMORTEM 2026-09-24 「초대 모달의 포커스·입력 규칙」 및 「포커스가 body로 빠지는 자리」: effect로 초기 포커스 경쟁 금지, 기존 initialFocusRef/busy/fallback 계약 유지. 좁아지는 방향 포함 브라우저 activeElement 확인.
- POSTMORTEM 2026-09-08 「조상 provider」: 서랍이 열린 상태를 직접 렌더하는 DOM 테스트를 둔다(좁은 폭에서만 렌더되는 경로).
- `large-modal.tsx` 머리/높이 주석: min-height가 max-height를 이김, footer 도달·첫 입력 focus ring을 실제 높이에서 확인.

## 7. 연계·대안·정본 갱신

앱을 함께375로 풀거나 모든 화면을 비율 축소하는 방법은 앱 편집 기능·가독성을 만족하지 못한다. 전역768 분기 추가 대신 `lg` 셸 및 내부 컨테이너 질의를 쓴다. 상호작용을 갖는 Drawer 라이브러리를 추가하지 않고 기존 Dialog를 조립한다.

공개 단계 검증 완료본(P7 인계)을 A2의 선행 기준으로 삼는다. 앱 단계는 공유 오버레이/검색/Inbox/측면 서랍을 재구현하지 않고 소비한다. A2e는 P5 완료본 위에서 캔버스와 frame 입력을 확장하며 동시 수정하지 않는다.

정본 갱신은 P6의 독립 태스크다(문서별 커밋). 이번 문서 작업에서는 정본을 수정하지 않는다.
