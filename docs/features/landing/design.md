# landing — 설계

## 선행 조건 — 시안

**Claude Design 핸드오프가 SoT다**(2026-09-25 사용자 — 새로 작업하는 페이지는 시안이 정본). 위치:
`https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767` — `Landing.dc.html`(스펙 아트보드 1a–1g) +
`Landing Prototype.dc.html`(실제 동작 프로토타입 · Tweaks). 요청 프롬프트는 `~/Desktop/malmoi-landing-design-prompt.md`.
**Claude Design은 목업의 자리(스테이지)만 정한다** — 목업 내용(1280×720 안)은 구현이 그린다(시안의 줄무늬 플레이스홀더 자리).

**2026-09-26 기준 시안은 작업 중이다** — 이 문서의 수치는 그 시점 프로토타입에서 옮겼고, T0이 확정본으로 덮는다.
시안에 넘긴 피드백(푸터 순서 · 히어로 문구 · docs IA · `will-change` · 목업 입력 `(i, t)` 부족)이 반영됐는지가 T0의 판정이다.

## 영향 받는 흐름

push·pull·편집 UI 어디에도 붙지 않는다. **공개 라우트(`/`·`/docs`·`/docs/*`·`/privacy`)의 표현층**만 바뀐다.
인가 모델은 그대로다 — 셋 다 `entry-points.test.ts`의 `EXEMPT`이고 middleware matcher 밖이다. **docs 하위 페이지가 늘면
그 경로도 `EXEMPT`에 등재하고 matcher 밖에 둔다**(`PUBLIC` 음성 검사가 matcher 추가를 막는다).

## 구조

```
app/page.tsx                       rootView(status) → redirect | <PublicShell><Landing/></PublicShell>
app/docs/…/page.tsx · privacy/page.tsx   <PublicShell><DocsLayout|PrivacyLayout/></PublicShell>  (docs 페이지 구성은 T0)
components/public-shell/           header · footer · scroller (서버 컴포넌트 + 스크롤러 포커스/스크롤 리셋용 클라이언트 잎)
components/public-doc/             article · docs-nav · toc(클라이언트 잎 — 현재 절 추적)
components/landing/                hero · stage(클라이언트) · mockup/(씬 DOM, 서버·정적) · closing
lib/landing/stage.ts               순수 함수 (잎 — import는 타입뿐)
lib/public-doc/toc.ts              순수 함수 — 현재 절 판정
lib/auth/landing.ts                rootView · publicCta (기존 파일)
```

- ⚠️ **route group 레이아웃으로 만들지 않고 페이지마다 `<PublicShell>`을 렌더한다.** 공유 레이아웃이면 스크롤러 DOM이
  페이지 이동에서 **유지되어 스크롤 위치가 남는다**(Next의 스크롤 리셋은 window 기준이라 중첩 스크롤러를 안 본다).
  페이지 세그먼트가 바뀌면 트리가 다시 마운트되므로 컴포넌트 방식은 리셋이 공짜다. 기존 `EXEMPT` 경로(`page.tsx`·`docs/page.tsx`)도
  안 움직인다. → 그래도 T4 검증에 "이동 후 scrollTop 0"을 넣는다.
- **셸 좌표(시안 1a)**: 루트 `flex h-svh min-w-[1280px] flex-col overflow-hidden bg-canvas px-2 pt-2`(DESIGN §6.5 — `min-h-svh`가
  아니라 `h-svh`, malmoi#13) · 헤더 40 + 아래 8 · 패널 · 푸터 40. 패널 = `(vw − 16) × (vh − 96)` — 윗변 56이 앱 셸 `ContentPanel`
  윗변과 같다. `body` 배경을 `--canvas`로 주입한다(`components/signin/auth-layout.tsx:41`의 형 — 없으면 오버스크롤 때 흰 띠).
- **패널은 두 겹이다**(앱 셸 `content-panel.tsx:36,137`과 같은 형): 바깥 `<main>`이 표면(`overflow-hidden rounded-2xl border border-border-subtle
  bg-background shadow-low` — 시안 radius 16) · 안쪽 div가 스크롤러(`overflow-y-auto overflow-x-hidden overscroll-contain`, `scrollbar-width: thin` ·
  `scrollbar-color: rgba(10,10,10,.2) transparent`). 바깥이 모서리를 자르므로 스크롤바 트랙이 radius 밖으로 나가지 않는다.
  랜드마크는 `<main>` 하나 — 화면은 자기 `<main>`을 만들지 않는다.
- ⚠️ **키보드 스크롤**: 문서가 스크롤되지 않으면 body에 포커스가 있을 때 Space/PageDown이 **아무것도 안 움직인다**(브라우저는
  root scroller만 민다). 스크롤러에 `tabIndex={-1}` + 마운트 시 `focus({ preventScroll: true })`를 준다. 포커스 링은 그리지 않는다 —
  `focus:outline-none`(`components/ui/modal.tsx:232-234`의 `tabIndex={-1}` 스크롤 바디가 리포 유일의 같은 역할 선례).
  `preventScroll`은 해시 착지와 경합하지 않게 하는 조건이기도 하다.
- 헤더(시안 1a): 로고 32(`aria-label="Malmoi home"`) · `<nav aria-label="Main">` 링크 14/400(6/10 · radius 8) · hover `foreground` 알파 .03 ·
  **선택 상태를 그리지 않고 `aria-current="page"`만** · 우측 primary `md`(36). GitHub는 새 탭, 글리프 없음(§6.3).
- 푸터: 13 · muted · hover foreground. 링크 목록은 `/signin` 푸터와 **한 상수**에서 낸다(`GitHub · Privacy Policy · Docs`, `m.signIn.footer`의 값).
  GitHub URL 상수는 **`lib/routes.ts` 밖**에 둔다(`auth-layout.tsx:64-67` — `entry-points.test.ts`가 외부 URL을 죽은 라우트로 잡는다). 가안: `lib/links.ts`.
  클라이언트가 읽으면 `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재한다.
- 헤더 `Home`·로고는 `routes.home()`(신설 — POSTMORTEM 2026-09-05, 리터럴 `"/"` 금지). `signOut({ redirectTo: "/" })` 두 곳은 외과적 변경 원칙상 건드리지 않는다.
- 새 raw 색 0(시안 1g) — 쓰는 값은 전부 토큰(`--canvas` · `--primary` · `--foreground` 알파 · `--border` · `--border-subtle` · `--muted-foreground` · 그림자 둘) + 기존 링크 blue-600.
  새 파일에 raw 색 클래스가 들어가면 `visual-system.test.ts`의 파일별 allowlist를 갱신한다.

### 문서 그릇 (시안 1e · Prototype `isDocs`/`isPrivacy`)

- `PublicDoc`은 골격을 셸에 넘긴다: `min-h-svh` · 복귀 링크 제거(헤더가 그 일을 한다 — DESIGN §6.61의 "세션으로 갈리는 복귀 링크" 규칙이
  헤더로 옮겨 간다). `m.publicDocs.back.*`은 소비자 0이 되어 지운다. **루트 `<main>`(`components/public-doc.tsx:74`)은 `<article>`로 강등한다** — 셸의 `<main>`과 중첩된다.
- `/privacy`: `max-w-[1120px] mx-auto px-10 py-[120px]` · 그리드 `minmax(0,720px) 200px` 간격 64. TOC `<nav aria-label="On this page">` sticky top 48(스크롤러 기준).
- `/docs`: `max-w-[1360px]` · 그리드 `240px minmax(0,720px) 200px` 간격 48. 왼쪽 `<nav aria-label="Docs">` sticky, 그룹 라벨 13/500 + 좌측 선 목록, 현재 페이지 `aria-current="page"` + 선 foreground + 500.
- 타이포: 본문 16/1.75 · h1 36/1.3/500 · h2 24/1.4/500 · 절 간격 56 · 시행일 14 muted · 표 머리 `#fafafa`(`--primary-foreground`) + 13/500 muted. **본문 muted 금지는 유지**(§6.61).
  표 래퍼(`role=region tabindex=0 overflow:auto`)는 건드리지 않는다(POSTMORTEM 2026-09-19).
- **TOC 현재 절**: 스크롤러 `scroll`에서 `currentSection(offsets, scrollTop, 96)`(순수 — 윗변이 `scrollTop + 96`을 넘지 않은 마지막 절). 클릭은
  `scrollTo({ top: offsetTop − 48, behavior: reduced ? "auto" : "smooth" })` + `history.replaceState`로 해시 갱신. TOC 링크는 실제 `href="#id"`(JS 없이도 이동).
- **docs 페이지 구성·URL·기존 7절 매핑은 T0**(spec 확인 필요 ①). 옛 진입 `/docs#workflow`(`components/settings/ci-card.tsx:40` — 유일한 소비자)는 새 위치로 바꾼다.

## 목업 — 크기와 재생 (시안 1b·1c·1f·1g)

- **고정 논리 캔버스 1280×720**, 안쪽은 실제 앱 px(텍스트 13~15px). 상대 단위를 쓰지 않는다 — 뷰포트마다 줄바꿈이
  달라지면 타이핑 위치·모달 위치가 어긋나 재생이 결정적이지 않다.
- **맞춤**: `W·H` = 스크롤러 `clientWidth/Height`. `m = clamp(24, 0.04·H, 48)`, `CH = 44`(캡션 줄: 간격 16 + 줄 28),
  `fit = min((W − 2m)/1280, (H − 2m − CH)/720, cap)`, `cap = 1.5`(확정). `yPin = (H − 720·fit − CH)/2`.
  네 뷰포트: 1280×800 → 0.836 · 1440×900 → 0.964 · 1920×1080 → 1.194 · 2560×1440 → 1.5(fitH 1.669). 네 뷰포트 모두 세로가 제한 축이다.
- **대기 → 고정(트윈)**: `p = clamp(scrollTop / stageTop, 0, 1)`(`stageTop` = 트랙 섹션의 offsetTop), `e = easeInOut(p)`.
  배율 `0.8·fit → fit`, 프레임 y `0 → yPin`, x는 가운데. 베젤(radius 24 · `--canvas` · 선 `--border`) · 대기 그림자(`shadow-medium`) opacity `1 − e`,
  고정 그림자(`shadow-low`) opacity `e`, 씬 크롬 opacity `clamp((p − 0.7)/0.3, 0, 1)`. **radius·그림자 값은 트윈하지 않고 레이어 opacity 교차로** 모서리가
  24 → 12로 바뀌어 보이게 한다. p = 1인 위치가 곧 sticky 시작 — 이음매가 없다.
- **transform·opacity만** 움직인다(width/height 애니메이션은 매 프레임 레이아웃). ⚠️ **`will-change: transform`을 상시로 걸지 않는다** —
  Chrome이 레이어를 1× 래스터로 고정해 상한 1.5에서 글자가 번진다(시안 프로토타입은 상시로 걸었다 → 피드백). 트윈 구간에만 걸거나 안 건다.
- **트랙**: 섹션 높이 `6H`(H = 스크롤러 높이), 안쪽 `position: sticky; top: 0; height: H`. `q = clamp((scrollTop − stageTop)/H, 0, 5)`,
  `i = min(4, ⌊q⌋)`, `f = q − i`(q ≥ 5면 i = 4, f = 0). 씬당 **정지 0.6 / 전환 0.4** — `t = f > 0.6 && i < 4 ? (f − 0.6)/0.4 : 0`. 마지막 씬은 1.0H 정지(전환이 넷뿐).
  씬 레이어 opacity `k === i ? 1 − ease(t) : k === i + 1 ? ease(t) : 0`, 진행 칸 `scaleX`, 캡션 opacity `|1 − 2t|`(t = 0.5에서 문장 교체 — 두 문장이 겹쳐 보이지 않는다).
- **마무리 CTA**는 `margin-top: −yPin`으로 스테이지 아래 남는 yPin을 상쇄한다(캡션 줄 아래 → CTA 제목 120 고정).
- **reduced-motion**: `s = fit`, `y = yPin` 고정, 베젤 0 · 고정 그림자 · 크롬 항상 보임. 씬은 `t ≥ 0.5 ? 1 : 0`(f = 0.8에서 단절). 스크롤 길이는 같다. TOC 이동은 smooth 대신 즉시.
- **JS 전·JS 없음**: SSR은 `frame(0)`의 씬 ①을 **opacity 0**으로 둔다(배율이 없어 1280 캔버스가 패널을 넘치므로). 스테이지는 `data-ready`가 선 뒤에만 트랙 높이 `6H`를 갖고,
  그 전엔 패널 1개 높이로 접힌다. 첫 rAF가 배율을 쓰고 `data-ready`를 세운다.
- **렌더 경로**: 목업 DOM은 **서버 컴포넌트**(정적)이고, 클라이언트 `Stage`가 `children`으로 받는다. 타이핑 문자열만 prop으로 넘긴다
  (서버 → 클라이언트 문자열 prop 선례: `app/signin/page.tsx:62-63` → `provider-button.tsx`). 사전 전체를 클라이언트 청크에 싣지 않는다.
  스크롤 → rAF에서 `frame(input)`(순수) → ref로 CSS 변수·`data-scene`·텍스트 노드를 직접 쓴다. **프레임마다 setState하지 않는다**(수천 노드 재조정).
  스크롤 리스너는 `passive`. 크기는 `ResizeObserver`(스크롤러), reduced-motion은 `matchMedia` `change` — 둘 다 effect 안에서 읽는다(`components/signin/dot-field.tsx:88` 형).
  리사이즈 뒤엔 `frame`을 다시 계산할 뿐 scrollTop을 고치지 않는다 — 트랙 높이가 H에 비례하므로 q가 튀지 않게 **리사이즈 직전 q를 보존해 scrollTop을 재설정**한다.
- CSS scroll-driven animations(`animation-timeline`)는 쓰지 않는다 — 이산 상태(씬·배지 숫자·모달 열림)와 타이핑을 못 들고,
  Firefox stable에서 여전히 플래그 뒤다(2026-09).
- 목업 프레임 루트는 `aria-hidden` + `inert` — 단 **jsdom은 `inert`를 구현하지 않으므로** 안에 인터랙티브 태그를 두지 않는다:
  버튼 모양은 `buttonClass`(`components/ui/button.tsx` export)를 `<span>`/`<div>`에 입힌다(`repository-card.tsx:78` 선례). `inert`는 실 브라우저의 이중 방어다.
  이러면 focus-ring 테스트의 "ui/ 밖 raw `<button>` 0" 규칙과도 충돌하지 않는다.
- 캡션 접근성(시안 1c): 보이는 캡션 `<p>`는 `aria-hidden`, 트랙 섹션 첫머리에 다섯 문장을 담은 visually-hidden `<ol>`. `aria-live` 없음.
  섹션은 `aria-label="How Malmoi works"`, 히어로·CTA 섹션은 `aria-labelledby`(POSTMORTEM 2026-09-15).
- CSP: `style-src 'self' 'unsafe-inline'`(`lib/security-headers.ts:45`)라 CSSOM 쓰기·`style` 속성 둘 다 막히지 않는다.
- ⚠️ **목업 입력이 `(i, t)`만으로는 부족하다** — 시안의 교체 계약은 "정지 중인 씬 번호 + 다음 씬으로의 진행도"인데, ② 타이핑과 ③ 배지 증가는 **정지 구간 안에서** 일어난다.
  `frame()`은 정지 진행도 `h = min(f/0.6, 1)`도 낸다(→ 피드백).

### 목업 문구

- 앱 라벨은 **실제 사전 키를 그대로 읽는다** — 목업과 앱이 다른 말을 하기 시작하면 랜딩이 거짓이 된다. 확인한 위치:
  `Translations` = `m.common.nav.translations`(`messages/en.tsx:275`) · `Publish N changes` = `m.translations.publish.previewTitle(n)`(:2138) ·
  `In the repository`/`Your edit` = `…publish.beforeLabel`/`afterLabel`(:2178-2179).
- 가상 데이터(조직 `Acme`, 리포 `acme/web`, 키·값)는 `messages/en.tsx`의 `landing.mockup` 픽스처가 든다. 실명·실제 프로젝트명 금지. **작게 유지한다.**
- 랜딩 카피(히어로 · 캡션 다섯 · CTA)는 `m.landing.*`. 히어로 서브는 `translation files`(시안의 `locale files`는 `terminology.test.ts` 금지어 — spec 결정 4).
  ⚠️ **`terminology.test.ts:69-75`가 사전 전체에서 `push`·`pull`·`locale`·`import`·`surface`를 금지한다** — 마케팅 카피·픽스처가 쓰기 쉬운 낱말이다.
- ⚠️ **타이핑되는 번역 값은 `fr`** — 한글이면 `no-korean-ui.test.ts`가 red다(허용 목록은 `lib/push/apply.ts` 하나, 대상에 `messages` 포함).

## 순수 함수 (`/tdd` 대상)

| 함수 | 위치 | 입력 → 출력 |
|---|---|---|
| `fitScale` | `lib/landing/stage.ts` | `{ W, H, cap }` → `{ m, fit, yPin }` (`fit ≤ 0`이 되는 작은 패널은 0으로 clamp) |
| `growProgress` | 〃 | `scrollTop, stageTop` → `p` 0..1 (`stageTop ≤ 0`이면 1) |
| `sceneAt` | 〃 | `scrollTop, stageTop, H` → `{ i, f, t, h }` (0 나누기·NaN 방어, q ≥ 5에서 i = 4) |
| `typedPrefix` | 〃 | 문자열 · 0..1 → 앞 n 코드포인트(`Array.from` — 픽스처는 NFC `fr`이라 조합 문자가 없다. 결합 문자를 타이핑하게 되면 그때 `Intl.Segmenter`) |
| `frame` | 〃 | `{ scrollTop, stageTop, W, H, reducedMotion }` → `Frame` — 한 위치에 한 프레임 |
| `currentSection` | `lib/public-doc/toc.ts` | 절 offsetTop 배열 · scrollTop · 오프셋 → 현재 절 index |
| `rootView` | `lib/auth/landing.ts` | 세션 status → `{ redirect: "/projects" } \| { landing: true }` |
| `publicCta` | 〃 | 세션 status → `{ href, label }` (`ok`만 Open Malmoi) |

```ts
type Frame = {
  scale: number; x: number; y: number;          // 프레임 transform
  bezel: number; shadowIdle: number; shadowPin: number; chrome: number; // 레이어 opacity 0..1
  scene: { i: 0 | 1 | 2 | 3 | 4; t: number; h: number }; // t 전환 진행(eased 전), h 정지 진행
  layers: [number, number, number, number, number];     // 씬 레이어 opacity
  segments: [number, number, number, number, number];   // 진행 칸 scaleX
  caption: { index: number; opacity: number };
  typed: number;   // 씬 ② 타이핑 코드포인트 수
  badge: number;   // Publish 배지 숫자
  modal: boolean;  // ④ 미리보기 열림
};
```

- 상수: `CANVAS = 1280×720` · `IDLE = 0.8` · `CAP = 1.5` · `CH = 44` · `HOLD = 0.6` · `SCENES = 5` — 모듈 상수다(씬 추가는 비목표). `fitScale`만 `cap`을 인자로 받는다(테스트가 상한 걸림을 따로 검사).
- `rootView`가 `landingTarget`을 대체한다(**T7에서** — 커밋 1은 추가만 한다. 그 전에 교체하면 `app/page.tsx`가 컴파일 에러다).
  ⚠️ **`unavailable`은 랜딩을 그린다**(옛: `/signin?error=Unavailable`) — 공개 문서가 세션 장애로 안 열리는 것이 더 나쁘다는 §6.61의 판정과 같은 쪽이다.
  근거: 일반 로그인은 `redirectTo: "/projects"`(`app/signin/page.tsx:108`)라 `/`를 지나지 않는다 — "로그인 직후 세션을 못 읽어 조용히 랜딩"이 되는 흐름이 없다.
  장애 신호는 `/signin`·보호 라우트의 `rejectTarget`이 계속 든다(POSTMORTEM 2026-09-06의 "리다이렉트 100% = 정상" 오독은 그 자리에서 막힌다).
  맵 + `satisfies`를 **새로 적용한다**(지금 `landingTarget`은 삼항 — `lib/auth/landing.ts:49`. `REJECT`(:35-38)의 형): `ROOT = { ok, none, unavailable } satisfies Record<SessionRead["status"], …>`.
  `rejectTarget`과 그 export는 건드리지 않는다(소비자 `app/(edit)/layout.tsx:8`·`lib/auth/session.ts:7`).
- `lib/landing/stage.ts`·`lib/public-doc/toc.ts`는 클라이언트가 값으로 읽으므로 `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재하고 잎 검사를 붙인다(`lib/protection/plan.ts` 형).

## 스키마 · 환경변수

없음 · 없음.

## 불변식 영향

- ARCHITECTURE §0(결정성·blob SHA·병합 없음): 없음.
- 인증 경계: matcher 불변, `EXEMPT`는 docs 하위 페이지만큼 늘어난다. `/`의 `ok → /projects` 유지.
- 로그아웃(`signOut({ redirectTo: "/" })`)의 착지가 **로그인 화면에서 랜딩으로** 바뀐다 — PRODUCT §7.7이 이미 "로그아웃은 `/`(랜딩)로 간다"고 적었다. 의도된 변화.
- 로그인 성공 착지(`postgres.integration.ts:230,257,320`의 `"http://localhost"`)는 Auth.js 기본 callbackUrl이고 값이 바뀌지 않는다 — 세션이 있으므로
  `/` → `ok` → `/projects`, **뜻도 유지된다**(POSTMORTEM 2026-09-10이 요구한 재판정).
- 개인정보 방침: 새 목적·전송처·쿠키 0(폰트 자사 호스트, 외부 스크립트 없음). `policy-gate.test.tsx`는 `sections`·`effectiveDate`만 해시하므로
  셸 이관·`publicDocs.back` 삭제·타이포 변경은 개정 이력을 요구하지 않는다. `/push` 4단계에서 재확인만.

## POSTMORTEM 인용

- **2026-09-10 (`pnpm test` 밖 스위트)** — `postgres.integration.ts`가 로그인 성공 착지 `"http://localhost"` 셋을 단언하고
  *"랜딩이 `/`에 서면 그 착지의 뜻이 바뀐다 — 랜딩 배송이 이 파일을 다시 봐야 한다."* → 위 불변식 영향의 재판정 + T7에서 `pnpm test:credentials:postgres`.
- **2026-09-05 (경로 문자열은 타입이 못 본다)** — CTA·Home href는 `routes.*`로만 만든다(`routes.home()` 신설). GitHub 리포 URL은 지금
  `components/signin/auth-layout.tsx:72`에 리터럴로 있다 — 헤더·푸터가 둘을 더하면 사본 셋이라 상수 하나로 모은다(T3).
- **2026-09-15 (시안 없이 만든 화면이 어긋났다 · 이름 없는 `<section>`)** — 시안 선행, 섹션마다 `aria-labelledby`/`aria-label`.
- **2026-09-19 (`scrollable={false}` 표 컨테이너 · jsdom에 accname 없음)** — `PublicDoc`의 표 래퍼는 건드리지 않는다. 목업 `aria-hidden`의 실측은 T8 CDP.
- **2026-09-23 (스텁 없이는 그 분기가 안 돈다)** — 스테이지 jsdom 테스트는 `ResizeObserver`·`matchMedia`·rAF를 `vi.stubGlobal`로 세운다(`vitest.setup.ts`의 `ResizeObserver`는 콜백을 안 부르는 no-op).
- **build-while-dev(메모리)** — 브라우저 확인 전 `pnpm build`를 dev와 겹쳐 돌리지 않는다. build 뒤엔 dev를 재시작한다.

## 문서 갱신 (구현 시)

- DESIGN: §6.61을 "공개 셸 + 문서 그릇"으로 재편(타이포·TOC·docs 내비, **320px 규칙 철회**), 랜딩 절 신설(스테이지 규칙·배율 표·목업 문구 경계),
  **§4에 weight 600 도입**(h1·CTA h2 — 첫 소비자).
- PRODUCT §7.7: `/` 행을 ✅ 랜딩으로, "로그아웃 → 랜딩" 문장 현재형으로, **docs 하위 페이지 IA**. `PRODUCT.md:554-558`의 "지금 `/`는 … 껍데기" 문단.
- ARCHITECTURE: `:2071` 근처의 `/` 착지 판정 서술(`landingTarget` → `rootView`, `unavailable` → 랜딩).
- DIRECTORY: `components/public-shell/`·`components/public-doc/`·`components/landing/`·`lib/landing/`·`lib/public-doc/`·`lib/links.ts`, `:11`의 "landingTarget이 정한 곳".
  `lib/landing/`(랜딩 스테이지 수학)과 `lib/auth/landing.ts`(`/` 착지 판정)의 이름 겹침을 한 줄로 가른다.
- 코드와 같은 커밋에서 고칠 낡은 주석 넷: `app/page.tsx:6-17` · `lib/auth/landing.ts:44-47` · `app/signin/page.tsx:25` · `entry-points.test.ts:18`.
