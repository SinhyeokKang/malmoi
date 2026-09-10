# 8-1 signin + 인증 화면 — tasks

⚠️ **배송이 둘로 갈렸다** (2026-09-10 리뷰 — CPO 🟡4 · CTO · QA 공통 지적). 성격이 다른 축 넷을
한 PR로 묶으면 red일 때 원인 축을 특정하는 비용이 커지고 롤백 면적이 전부가 된다. 6a가 같은 이유로
배송을 넷으로 쪼갰다(`translation-ui/tasks.md`).

| 배송 | 무엇 | 시안 |
|---|---|---|
| **8-1a** | 라우트 이관(`/signin` 신설) + placeholder 둘 | **없다** — 기능 동치 |
| **8-1b** | 토큰·프리미티브·토스트·도트·화면 재작성·에셋·문서 | 있다 |

**8-1a는 그 자체로 프로덕션이 성립한다** — 화면은 옛 디자인 그대로이고 경로만 바뀐다. red가 나면
원인 축이 하나(인증 경계)다.

**순서 원칙**: 순수 함수 → 라우트 배선 → 프리미티브 → 화면 → 문서.
**커밋 경계는 `—— commit ——`로 표시한다.**

---

# 8-1a — 라우트 이관 (시안 없음)

## T1. 순수 함수 — 착지 판정

- [ ] `lib/auth/landing.ts` 신설
      - ⚠️ **축이 둘이라는 것을 먼저 정한다** (CTO 질문 2 — 실물 확인 결과 design §3의 서술이 부정확했다):
        `app/page.tsx`만 `ok → /projects`를 들고, `lib/auth/session.ts:26-27`·`app/(edit)/layout.tsx:29-30`은
        **`unavailable`·`none` 2갈래뿐**이다. `ok`를 반환하는 함수를 `requireUser` 자리에 꽂으면 의미가 안 맞는다
      - **`rejectTarget(status: SessionRead["status"])`** — 거부·장애를 어디로 튕기나. 2갈래.
        `unavailable` → `routes.signIn({ error: "Unavailable" })` / `none` → `routes.signIn()`.
        `lib/auth/session.ts`·`app/(edit)/layout.tsx`가 쓴다
      - **`landingTarget(status)`** — 루트(`/`)의 착지. `ok` → `routes.projects()` / 나머지는 `rejectTarget`
      - ⚠️ **타입은 `SessionRead["status"]`다** — `SessionStatus`라는 타입은 리포에 없다 (CTO ⚪13)
      - ⚠️ **잎이어야 한다** — `lib/routes.ts`만 읽는다
- **검증**: `pnpm test` — 두 함수의 갈래별 반환값이 고정된다

## T2. `lib/routes.ts` — 쿼리를 생성기가 만든다

- [ ] `signIn(q: { error?: string; sessions?: string } = {})` → `withQuery("/signin", q)`
      - ⚠️ **이것이 이 배송에서 가장 중요한 한 줄이다** (CTO 🔴3 · QA 🔴4). design §2.1이 "안전망"이라
        불렀던 `entry-points.test.ts`의 쿼리 수신자 검사는 **이 이관을 원리적으로 못 본다**:
        ① `app/` 아래 `page/route/actions`만 읽어 생산자 넷 중 셋이 사각지대 ② 리터럴 정규식이 `/` 뒤
        소문자를 요구해 `"/?error="`를 한 건도 못 잡는다 ③ 생성기 정규식은 템플릿 리터럴의 `}`를
        요구해 문자열 연결(`routes.signIn() + "?error="`)을 회피한다.
        **쿼리를 `withQuery`로 만들면 ③의 형태가 되어 검사에 걸린다**
- [ ] `privacy()` · `docs()` 추가 (T4의 페이지와 **같은 커밋**)
- **검증**: `pnpm test` green

—— commit —— `feat(routes): add signin/privacy/docs with query generator`

---

## T3. 라우트 이관 — `/signin` 신설

- [ ] `app/signin/page.tsx` 신설 — 현재 `app/page.tsx`의 로그인 화면을 **기능 그대로** 옮긴다
      (시안 적용은 8-1b). `searchParams`의 `error`·`sessions`를 여기가 받는다
      - ⚠️ **`?error=` 없이도 `session.status === "unavailable"`이면 문구를 띄우는 갈래를 유지한다**
        (QA 🔴3) — 현재 `app/page.tsx:27`이 그것이고 주석이 이유를 적어 뒀다(*"로그인 버튼만 보이면
        사용자가 헛로그인한다"*). **미들웨어 redirect로 `/signin`에 직접 오는 경로가 정확히 그 경우다**
- [ ] `app/page.tsx`를 redirect 껍데기로 — `landingTarget(await readSession())`

### 하드코딩 **아홉** 자리를 `routes.signIn()`으로

⚠️ **문서 초안이 여섯이라고 적었고 실측은 아홉이다** (CPO 🔴2 · CTO 🔴1 · QA 🟡21).

| # | 자리 | 지금 | 비고 |
|---|---|---|---|
| 1 | `auth.ts:93` `pages.signIn` | `"/"` | 놓치면 거부가 Auth.js 기본 무스타일 페이지에서 보인다 |
| 2 | `auth.ts:93` `pages.error` | `"/"` | ⚠️ **`kind`가 갈린다** — `OAuthAccountNotLinked`는 `signIn`, `AccessDenied`는 `error`로 간다 (QA 🟡22) |
| 3 | `auth.ts:155` | `"/?error=Unavailable"` | |
| 4 | `middleware.ts:34` | `new URL("/", …)` | |
| 5 | `lib/auth/session.ts:26` | `"/?error=Unavailable"` | `rejectTarget`으로 |
| 6 | `lib/auth/session.ts:27` | `"/"` | 〃 |
| 7 | `app/(edit)/layout.tsx:29` | `"/?error=Unavailable"` | 〃 |
| 8 | `app/(edit)/layout.tsx:30` | `"/"` | 〃 |
| **9** | **`lib/session-revocation/policy.ts:55`** | **`"/?sessions=revoked"`** | 🔴 **아래** |

⚠️ **9번을 놓치면 회수 완료 토스트가 원리적으로 안 뜬다** (CPO·CTO 🔴 · QA 🔴2). 그것이
`?sessions=revoked`의 **유일한 생산자**인데(소비자는 `lib/session-revocation/http.ts:25,58`),
`/`가 redirect 껍데기가 되면 **쿼리를 버린 채 `/signin`으로 보낸다.** POSTMORTEM 2026-09-06
("보내는 쪽과 받는 쪽이 함께 안 움직였다")의 정확한 재현이다.

⚠️ **`signOut({ redirectTo: "/" })` 둘은 그대로 둔다** (`app/(edit)/layout.tsx:44` ·
`app/(edit)/account/page.tsx:58`) — **로그아웃은 랜딩으로 간다**가 결정이다(2026-09-10 사용자).
지금은 `/`가 `/signin`으로 한 홉 더 가고, 랜딩이 서면 거기 착지한다. **그 의도를 주석으로 남긴다** —
안 적으면 다음 사람이 "이관 누락"으로 읽고 `routes.signIn()`으로 바꾼다.

### 함께 고쳐야 red를 벗는 것

- [ ] `app/__tests__/entry-points.test.ts` `EXEMPT`에 `signin/page.tsx` (사유 주석 포함)
- [ ] ⚠️ **`matcher` 부정 단언을 더한다** (QA 🟡23):
      ```ts
      expect(PATTERNS.some((p) => covers(p, "/signin"))).toBe(false);
      ```
      `middleware.ts:42`가 *"새 보호 라우트를 추가하면 여기도 추가한다"*를 규칙으로 박고 있어
      **다음 사람이 그 규칙을 따르면 쿠키 없는 모든 `GET /signin`이 자기 자신으로 307을 돈다.**
      `middleware.ts`에 `/invite/:path*`와 같은 형의 주석도 남긴다
- [ ] **예상 red 다섯을 미리 안다** (CTO 🟡5 · QA 🔴19) — 목록에 없으면 구현자가 "왜 관계없는
      스위트가 깨지지" 상태로 시작한다:
      1. `lib/session-revocation/__tests__/policy.test.ts:34`
      2. `lib/session-revocation/__tests__/http.test.ts` (7곳)
      3. `lib/session-revocation/__tests__/action.test.ts:34`
      4. `lib/credentials/__tests__/sign-in.test.ts:11`
      5. `app/(edit)/__tests__/onboarding.test.ts:182`
- [ ] 🔴 **`lib/session-revocation/__tests__/normal-login.test.tsx`를 `@/app/signin/page`로 다시 겨눈다**
      (QA 🔴19) — 그 테스트가 `@/app/page`를 직접 import하고 `providers(page)`가 2개인지 센다.
      껍데기가 되는 순간 0개라 red다.
      ⚠️ **느슨하게 고쳐 통과시키면 POSTMORTEM 2026-09-10이 그대로 재발한다.** 그 테스트가 고정하는
      것은 **`clearRevocationCookies()`가 `signIn()`보다 먼저 불린다**이고 그게 그 회고의 수정
      자체다. **`ProviderButton`이라는 함수 이름과 `redirectTo: "/projects"`를 유지한다.**
      `it.each(["root","invite"])`의 라벨도 함께 본다
- [ ] 🔴 **`pnpm test:credentials:postgres`를 손으로 돌린다** (QA 🔴20) —
      `lib/credentials/__tests__/postgres.integration.ts:428,450,476`이 `"http://localhost/?sessions=revoked"`를
      단언하는데 **그 스위트는 `pnpm test`의 include 밖이다.** CLAUDE.md의 트리거는 *"`lib/credentials/**`를
      건드렸으면"*인데 이 배송이 건드리는 것은 `lib/session-revocation/`·`auth.ts`라
      **트리거가 안 걸리고 그 단언이 조용히 거짓이 된다.** `/push` 게이트도 PR CI도 못 본다

### 검증 — grep 0건은 통과를 증명하지 못한다

⚠️ **초안의 `grep -rn 'redirect("/")\|"/?error'`는 아홉 중 최소 여섯을 구조적으로 못 본다**
(CPO 🔴2 · CTO 🟡4 · QA 🔴1): `pages: { signIn: "/" }` · `new URL("/", …)` · `redirectTo: "/"` 둘 ·
`"/?sessions="`. **T3이 스스로 ⚠️로 경고한 `pages.error`를 T3의 게이트가 못 잡았다.**

- **검증**:
  1. `grep -rn '"/"' app lib auth.ts middleware.ts --include='*.ts' --include='*.tsx' | grep -v __tests__`
     의 잔여가 **전부 `signOut redirectTo` 둘 + 경로 조작(`split("/")` 류)뿐**임을 눈으로 확인
  2. **`routes.signIn(` 호출자가 7 이상**
  3. **예상 red 다섯 + `normal-login`이 전부 났다가 green이 됐다**
  4. `pnpm test` green · `pnpm test:credentials:postgres` green · `pnpm build` green

—— commit —— `refactor(auth): move sign-in to its own route`

---

## T4. 빈 라우트 — `/privacy` · `/docs`

- [ ] `app/privacy/page.tsx` · `app/docs/page.tsx` — 제목 + 한 줄
      - ⚠️ **문구는 `messages/en.tsx`를 지난다** (CTO 🟡8 · CDO 🟡14) — 한글 리터럴을 박으면
        `no-korean-ui.test.ts`가 red다(허용 목록은 `lib/push/apply.ts` 하나뿐이다)
      - ⚠️ **되돌아올 길을 준다** (CDO 🟡14) — 셸 밖이고 푸터도 없어 **뒤로가기 말고 길이 없다.**
        "Back to sign in" 하나를 넣는다
- [ ] `EXEMPT`에 둘 추가 (사유: 공개 문서, 로그인 없이 읽힌다)
- **검증**: `pnpm test` green (`no-korean-ui` 포함) · 두 경로가 200 · 되돌아오는 링크가 동작

—— commit —— `feat(routes): add privacy and docs placeholders`

---

# 8-1b — 시안 적용

## T5. 에셋 커밋 (**T7보다 앞이다**)

⚠️ **초안은 이것을 T9로 뒤에 뒀다** (CTO 🟡11). `public/brand/`·`app/icon.svg`가 지금 **untracked**라,
화면 태스크가 먼저 커밋되면 **그 커밋의 체크아웃에 이미지와 favicon이 없다.**

- [x] `public/brand/`에 SVG 4개 + 키비주얼 PNG (2026-09-10 복사 완료)
- [x] `app/icon.svg` — `malmoi-icon-black.svg` 복사. **리포에 favicon이 없었다**
- [ ] `git add` — `.gitignore`가 `public/fonts/` 하나만 무시하므로 그대로 들어간다
- ⚠️ **미사용 셋이 남는다**(`icon-white`·`symbol-black`·`symbol-white`) — 8-2 셸에서 쓸 후보다
- **검증**: 브라우저 탭에 아이콘이 뜬다 · `git status`에 untracked가 없다

—— commit —— `feat(brand): add logo, key visual and favicon`

---

## T6. 프리미티브 — **기존 스케일에 맞춘다**

⚠️ **치수 기준이 "기존 스케일 우선"으로 정해졌다** (2026-09-10 사용자). 시안과 2px씩 어긋나지만
**새 토큰·예외·twMerge 등록이 전부 사라진다.** 차이는 T11 목측에서 본다.

| 시안 | 쓰는 값 | 왜 |
|---|---|---|
| radius 12px | **`rounded-xl`(14px)** | ⚠️ 초안이 "`rounded-xl`(12px)"이라 적었는데 **실제로는 14px다**(`--radius` 10px + 4px). 12px 토큰이 없다 (CDO 🔴3 · CTO 🟡6) |
| 버튼 높이 38px | **`h-10`(40px)** | 리포에 임의 치수가 `ring-[3px]` 하나뿐이다 (CDO 🟡8) |
| 아이콘 20px | **16px** | §6.8이 *"크기는 셋뿐(16·12·24), 그 밖을 만들지 않는다"* (CDO 🔴2) |
| 28px 문구 | **`text-3xl`(30px)** | 24→30 사이가 없다. ⚠️ **`--text-28`을 만들지 않는다** — 만들면 `lib/utils.ts`의 twMerge `classGroups` 등록이 딸려오고(안 하면 text-color로 오분류돼 조용히 사라진다, DESIGN §4.2) 소비자는 장식 문구 두 줄뿐이다 (CDO 🔴1·Q5 · CTO 🟡7) |

- [ ] `components/ui/button.tsx`에 `size: "lg"` — `h-10` (radius는 base의 `rounded-md`를 그대로 둘지
      `rounded-xl`로 덮을지 T11 목측)
      - ⚠️ **베이스를 바꾸지 않는다** — `Button` 소비자가 **26파일**이고(초안이 21이라 적었다, CTO ⚪15)
        이 배송이 검증하는 화면은 셋이다. 마지막 화면이 옮겨온 뒤 기본값을 바꾼다
      - ⚠️ **`lg`는 셸 밖 카드 전용이다** — §6.4에 그렇게 등재한다. 안 적으면 8-3에서 셸 안 화면이
        "signin이 lg를 쓰니 우리도"로 번진다 (CDO ⚪21)
      - ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 유지**
- [ ] 브랜드 아이콘 — ⚠️ **`components/signin/`에 둔다** (CDO ⚪19): §6.8이 이미
      *"provider 로고가 필요하면 인라인 SVG를 **그 컴포넌트 안에** 둔다"*로 답해 뒀고, `ui/`는
      프리미티브의 집이라 브랜드 글리프가 거기 있으면 §6.4 표에 행을 늘려야 한다
- [ ] **카드**: `Card`가 지금 `variant`·`shadow`·`padding` prop이 없고 헤더가 `title`로만 붙는다.
      signin 카드는 헤더 없음 + shadow + radius라 **세 축이 다르다.** 셋 중 하나를 **여기서 정한다**
      (CDO 🟡7 — "필요하면"으로 두면 T8 구현 중에 즉흥으로 정해진다):
      (a) `Card`에 shadow 변형 추가 + §6.4 등재 / (b) signin·invite는 지역 `div`이고 그 이유를 적는다 /
      (c) 시안의 shadow를 버린다
- **검증**: `pnpm test` green (특히 `focus-ring`) · `pnpm build` green

—— commit —— `feat(ui): add lg button size and brand icons`

---

## T7. 토스트 배선 — `sonner` 재도입

- [ ] `pnpm add sonner` — ⚠️ `minimumReleaseAge: 1440`이 24시간 안에 publish된 버전을 제외한다
- [ ] 🔴 **`components/__tests__/client-graph.test.ts`는 금지 목록이 아니라 허용 목록이다**
      (CPO 🟡11 · CDO 🟡15 · CTO 🔴2). 초안의 *"금지 목록에서 sonner를 뺀다"*는 **실행 불가능하고
      편집이 셋 필요하다**:
      1. **`ALLOWED`(L37-51)에 `"sonner"`를 더한다** — 안 하면 `auth-toast.tsx`가 L224 최종 판정에서 red
      2. **L196의 메타 배열 `["sonner", "@tanstack/react-virtual", "lodash"]`에서 뺀다** — 안 빼면
         `expect(allowed("sonner")).toBe(false)`가 한 파일 안에서 모순돼 red
      3. **주석에 근거를 적는다** — L31-35·L42-47이 *"목록을 넓히는 것은 의도된 결정이고 그 결정을
         이 파일에서 한 번 하게 만드는 것이 요지"*라고 요구한다
- [ ] `app/layout.tsx`에 `<Toaster theme="light" />`
      - ⚠️ **`theme="light"` 고정** — 안 하면 OS 다크에서 토스트만 어두워져 DESIGN §3이 그 컴포넌트에서만 깨진다
      - ⚠️ **`toastOptions.classNames`로 우리 토큰에 묶는다** (CDO 🟡16) — `sonner`는 자기 스타일을
        주입하므로 그대로 두면 규약 5("CSS는 Tailwind로") 밖의 두 번째 CSS 출처가 되고
        `Alert`와 같은 뜻을 다른 형으로 말한다
- [ ] `components/signin/auth-toast.tsx` (`"use client"`)
      - 거부·장애: `duration: Infinity` + 닫기 / `?sessions=revoked`: **긴 duration + 닫기**
        (⚠️ 초안은 기본 4초였다 — **되돌릴 수 없는 보안 조치의 유일한 완료 증거**다, CDO 🟡17)
      - ⚠️ **`id`를 고정한다** — StrictMode에서 effect가 두 번 돌아 토스트가 둘이 된다
      - ⚠️ **`?error=`를 URL에서 지우지 않는다** — 새로고침이 곧 "다시 보기"다
      - ⚠️ **`pages.signIn` 경로는 Auth.js가 `?callbackUrl=…&error=…`로 붙인다** (QA 🟡22) —
        `searchParams`로 읽으면 무해하지만 **직접 파싱하지 않는다**
- **검증**: `pnpm test` green (`client-graph` 포함) · 아래 표대로 **실물에서 두 갈래를 유발**해
  토스트가 하나만 뜨고 닫기 전까지 남는지 · OS 다크에서 밝은지

⚠️ **거부 유발 절차** (QA 🟡22 — 초안에 "어떻게 유발하는가"가 없었다):

| 갈래 | 유발 | 어느 config 키 |
|---|---|---|
| `OAuthAccountNotLinked` | GitHub 가입 → 로그아웃 → **같은 이메일의 Google로 로그인** | `pages.signIn` |
| `Unavailable` | `.env.local`의 `DATABASE_URL` 포트를 틀리게 | `callbacks.redirect` |
| `fallback` | `/signin?error=Whatever` 직접 진입 | — |

—— commit —— `feat(ui): reintroduce sonner for auth feedback`

---

## T8. 도트 필드 — Canvas 2D

**Canvas를 유지한다** (2026-09-10 사용자 — CTO의 CSS mask 대안은 2단 계조라 기각).

- [ ] `lib/signin/dot-field.ts` (**import 0인 잎**): `dotGrid(w, h, gap)` · `dotScale(distance, radius, base, max)`
- [ ] `components/signin/dot-field.tsx` (`"use client"`) — rAF
      - `prefers-reduced-motion` → rAF 없이 1회 렌더 (`matchMedia`는 **effect 안**에서)
      - DPR 반영 · `ResizeObserver`
      - ⚠️ **`pointerenter`로 시작하고 수렴하면 멈춘다** (CDO 🟡11) — 초안은 `mouseleave` 정지만
        있어서, 사용자가 우측 패널에 **한 번도 안 가는 기본 경로**(좌측 버튼 둘만 누른다)에서
        루프가 계속 돈다
      - ⚠️ **`aria-hidden="true"` + 포커스 불가**
      - ⚠️ **도트 색을 tsx에 hex로 박지 않는다** (CDO 🔴4) — 리포에 tsx 내 hex 리터럴이 0건이다.
        CSS 커스텀 프로퍼티에서 읽어 값의 집을 하나로 두고, 그 색이 `blue-600` 계열이 아니면
        §6.2 등재가 T11에 들어간다
- **검증**: `pnpm test` (`dotGrid`·`dotScale` + `client-graph`) · 커서 스케일 목측 ·
  OS "동작 줄이기"에서 정적 · **패널에 커서를 안 넣었을 때 rAF가 안 도는지**(DevTools Performance)

—— commit —— `feat(signin): add cursor-reactive dot field`

---

## T9. `/signin` 화면 — 시안 적용

- [ ] **좌측**: 카드 안에 320px 폼 블록 — 로고 48 → 제목 `text-2xl` SemiBold → provider 버튼 둘
      (`size="lg"`, 아이콘 16 + gap 8) → 약관 + Privacy Policy 링크
      - ⚠️ **`primary`는 GitHub 하나다** — §2가 *"primary는 화면당 하나"*를 못박는다. Google은 `default`
      - ⚠️ **pending 상태를 준다** (CDO 🟡12) — §6.4의 `Button loading`(라벨 교체)이 형이고,
        OAuth 왕복은 눈에 보이는 지연이 있다. 지금 두 `<form>`에 상태가 0이다
      - ⚠️ **tagline은 지운다** (시안 그대로 — 2026-09-10 사용자. 제품 설명은 랜딩이 맡는다).
        ⚠️ **죽는 문구가 넷이다** — `signIn.tagline` + `sample.file`·`sample.branch`·`sample.sent`
        (`Decoration()`이 통째로 교체된다). **죽은 문구를 잡는 검사가 없으므로 여기서 지운다** (CPO ⚪13 · CTO 🟡9)
- [ ] **푸터**: `© 2026 malmoi` · GitHub(외부 상수) · Privacy Policy · Docs
      - ⚠️ **넷 다 유지한다** (2026-09-10 사용자). GitHub 링크는 리포 public 전환 전까지 로그아웃
        방문자에게 404이고, Privacy Policy는 "준비 중"이다 — **알고 두는 것**이고 출시 전에 채운다
- [ ] **우측**: 도트 필드 + 상하단 문구(`text-3xl` SemiBold) + 키비주얼
      - ⚠️ **패딩으로 잡는다, 정적 폭이 아니다** (2026-09-10 사용자): **좌우 패딩 80 · 상하 패딩 64**
        (상하는 문구 자리). KV는 **max-width 768**이고 컨테이너에 맞춰 줄어든다.
        → 1280px에서 우측 컬럼 640 − 160 = **480px**이라 넘치지 않는다 (CDO 🔴 Q4 해소).
        1920에서는 948 − 160 = 788이라 **768이 상한으로 걸린다** — 그 상한이 실제로 작동하는 것은
        뷰포트 1856px 이상이고, 그 아래에서는 컨테이너 폭이 정한다
      - ⚠️ **KV가 위로 치우친다** — PNG에 그림자 여백이 아래쪽에 더 있어(2172×996은 3x인 2088×936보다
        84×60 크다) 시각 중심이 어긋난다. **보정한다**(음수 margin 또는 translate) — 값은 T11 목측
      - ⚠️ **`next/image` + `priority`** (CTO 🟡12 · Q3) — `<img>`면 372KB PNG가 그대로 나가고
        LCP 요소가 된다. design §6.2가 "WebP 변환"을 PNG 하나만 두는 근거로 삼았으므로 `<img>`를
        쓰면 그 근거가 무너진다. `alt=""`
- [ ] `?error=` · `?sessions=` → **토스트**(T7의 `auth-toast`를 마운트)
      - ⚠️ **인라인 Alert를 병행하지 않는다** — 경로가 둘이면 하나가 낡는다
      - ⚠️ **`signInErrorMessage` 갈래 넷이 전부 사용자에게 닿아야 한다**
        (`OAuthAccountNotLinked`·`AccessDenied`·`Unavailable`·fallback). ⚠️ 그 함수는
        `satisfies`가 없어 **갈래가 늘어도 red가 안 난다** (CPO 🟡7)
- [ ] ⚠️ **`min-w-[1280px]`를 레이아웃 루트에 준다** (CDO 🟡9) — 없으면 규약 3의 "1280 미만에서
      가로 스크롤"이 **실제로 안 일어나고** grid가 압축돼 우측만 잘린다. `lg:` 분기는 걷어낸다
- [ ] 랜드마크 정리 (CDO 🟡11): `<main>`은 좌측 카드 / 캔버스 `aria-hidden` / KV `alt=""` /
      `text-3xl` 문구는 읽히게 둔다
- [ ] `messages/en.tsx`에 새 문구
- **검증**: `pnpm test` green · **1280px에서 가로 스크롤 없음** · 시안과 나란히 목측 ·
  스크린리더로 진입 시 무엇이 읽히는지 확인

—— commit —— `feat(signin): apply new design`

---

## T10. `/invite/[token]` 화면

- [ ] signin과 같은 2열 골격. **실패 분기를 그대로 유지**
- [ ] ⚠️ **토스트 경계를 여기서 처음 적용한다** (2026-09-10 사용자 — 규약 8에 박았다):
      - **Layer A**(`not-found`·`expired`·`already-accepted`·`unavailable`) = **인라인 유지**.
        그것이 **페이지 콘텐츠 전부**라 토스트로 옮기면 빈 카드 + 우하단 토스트가 된다
      - **Layer B**(`?e=` — 버튼을 눌러서 나는 거부) = **토스트**
      - ⚠️ **`email-mismatch`의 "다른 계정으로 로그인"은 반드시 남는다** — 없으면 사용자가 갇힌다
        (POSTMORTEM 2026-09-06이 **이 화면의 사고**다)
      - ⚠️ 우측 패널의 KV에는 환영 문구가 **구워져** 있어 분기별로 못 바꾼다 — 좌측이 "expired"인데
        우측이 환영 화면인 상태가 생긴다. 그대로 둘지 우측을 비울지 목측에서 판단 (CDO Q6)
- **검증**: `pnpm test` green · 실물에서 **분기 다섯을 각각** 유발해 확인
      (`planInvitationAccept`의 5분기 — `lib/auth/invitation.ts`)

—— commit —— `feat(invite): apply new design`

---

## T11. 런타임 목측 조정

시안과 리포 팔레트의 계열이 달라 **값을 브라우저에서 보고 정한다.**

- [x] 버튼 배경 — **팔레트를 neutral로 교체**해 해결했다(`rgb(23,23,23)`). 색 하나가 아니라 틴트 문제였다
- [x] 보조 텍스트 — neutral 교체로 `rgb(115,115,115)`
- [x] 링크 — `blue-600` 유지 + **밑줄 제거**(전역 규칙이 됐다)
      - ⚠️ **`blue-500`은 리포 전수 0건의 미등재 색이다** (CDO 🔴4) — 쓰면 §6.2 등재가 필요하다
- [x] 도트 색 — `blue-600` 기반, 알파는 커서 거리로 보간(기본 0.08 · 중심 0.3)
- [ ] 우측 배경 그라데이션 — 시안 값 미확보
- [ ] **KV 세로 보정값** — 그림자 여백 때문에 위로 치우친다
- [x] **버튼 radius** — `--radius`를 한 단계 올려 base `rounded-lg`가 **12px**이 됐다(시안 값)
- [x] **패널 border** — `--border-subtle`(`#f4f6f8`) 신설해 적용했다. ⚠️ **이미지 패널엔 border가 없다**
      (시안 — 그라데이션이 면을 만든다). 실측 확인
- [x] **바깥 배경·hero 그라데이션** — 실측: 배경 `rgb(246,247,248)` · 그라데이션
      `#eff4ff → #cddbfe`. ⚠️ **한 번 통째로 사라졌다** — `:root`에 변수만 만들고 `@theme inline`
      등록을 빠뜨려 `bg-auth-canvas`·`from-auth-hero-from`이 **존재하지 않는 클래스**였다
- [x] **`body` 배경** — `AuthLayout`이 인라인 `<style>`로 `body`를 칠한다. ⚠️ **전역 CSS가 아닌 이유**:
      셸 안 화면까지 회색이 된다. ⚠️ **`useEffect`가 아닌 이유**: 첫 페인트를 놓쳐 흰색이 한 번 보인다.
      실측: `/signin`의 body `rgb(245,246,247)` / `/privacy`는 흰색 유지(그 화면은 `AuthLayout`이 아니다)
- [x] **자동 순회 속도** — 90 → 160 → 230 → **320px/s**(640px 폭 기준 한 줄 약 2초). 세 번 올렸다.
      ⚠️ **ego-browser로는 원리적으로 못 잰다**(그 브라우저의 rAF가 초당 1프레임으로 스로틀된다, 실측) —
      순수 함수는 테스트 17건이 고정하고 **움직임 자체는 사람이 봤다**
- [x] **도트 알파** — 실측: 커서 지점 평균 알파 **63** vs 먼 곳 **17**(약 3.7배), 픽셀 540 → 884.
      크기·투명도가 함께 보간된다
- [ ] **토스트 위치·지속** — 거부가 닫기 전까지 남는가, 진입 즉시 눈에 들어오는가
      - ⚠️ **`role="alert"`에서 polite로 강등된다** (CDO 🔴5) — 지금 `Alert danger`는 끼어들어 읽히고
        `sonner`는 큐에 들어간다. 리포에 그 축을 판단한 전례가 있다(`lib/pull/message.ts`가
        *"`danger`는 `role="alert"`라 읽던 것을 끊는다"*를 이유로 "already sending"을 `info`로 내렸다).
        **거부는 끊어야 하는 쪽이다** — 스크린리더로 확인하고, 안 읽히면 되돌린다
      - ⚠️ **sonner의 닫기 버튼은 `focus-ring.test.ts` 밖이다** (CTO ⚪16) — 패키지 내부라 스캐너가
        조용하다. **탭으로 도달했을 때 링이 보이는지** 눈으로 본다
- [ ] **CSP** — `next.config.ts`의 `form-action 'self' https://github.com`에 `accounts.google.com`이
      없다 (CTO ⚪17). Report-Only라 지금은 안 깨지지만 **그 위반이 나타나는 유일한 화면이 여기다**
- [ ] 푸터 GitHub 링크가 로그아웃 상태에서 404인 것을 확인(의도된 상태)
- **검증**: 사용자 확인

---

## T12. 문서

- [ ] `docs/SAAS.md` §7.7 라우트 표에 `/signin`·`/privacy`·`/docs` + §8에 8-1a·8-1b 완료 표시
      - ⚠️ **`/docs`가 §8의 🔒 "Help 항목의 목적지"와 같은 축이다** (CPO 🟡8) — 답하는 것이면
        명시하고 그 🔒를 닫는다. 아니면 "`/docs`는 Help 목적지가 아니다"를 적는다
- [ ] `docs/DESIGN.md` — ⚠️ **초안이 지목한 §3.12는 이 문서에 없다** (CDO 🟡6 · CTO 🟡10).
      실제로 거짓이 되는 자리는 넷이다:
      - **§9.2** *"일러스트(빈 상태 SVG) — 로그인 우측 장식은 CSS dot-grid + **토큰만 쓴 정적 모형
        카드** 하나뿐이다"* → **래스터 일러스트 + Canvas를 들여오므로 예외 등재**가 필요하다
      - **§9.1** "로그인 2열 — 폼 좌 · 장식 우"
      - **§4** *"`text-lg` = 셸 밖 카드의 제목 전용(로그인·초대 수락 둘뿐이다)"* → 제목이 `text-2xl`이
        되면 **그 규칙이 소비자를 둘 다 잃는다**
      - **§5.1** *"셸 밖 카드(로그인 2열 · 초대 수락 `mx-auto max-w-sm`)"* → 초대가 2열이 된다
      - 그리고 **§6.2의 `Alert success`가 "로그인 화면의 전체 로그아웃 완료"를 이름으로 지목한다** —
        토스트로 옮겼으므로 거짓이 된다
      - 추가 등재: `public/brand/`(커밋된 원본 vs 생성물) · Google 4색 브랜드 예외 · §6.8의
        *"색은 상속(currentColor) — 예외는 Alert 4종과 EmptyState뿐"*도 거짓이 된다 (CDO 🔴2) ·
        §6.4에 `Button size="lg"`(셸 밖 카드 전용) · 토스트 형·tone↔variant 대응 · 1280px 최소 너비
- [ ] `CLAUDE.md`:
      - 디렉터리 구조 — `app/signin`·`app/privacy`·`app/docs`·`components/signin`·`lib/signin`·`public/brand`
      - ⚠️ **"`sonner`를 `client-graph.test.ts`가 금지 목록으로 들고 있다"가 오기다** (CTO 🔴2) —
        그 파일은 **허용 목록**이고, 이 오기가 이 배송 문서의 오류를 낳은 원인이다. 함께 고친다
- [ ] `docs/features/README.md` 표에 `ui-rework/` 한 줄
- **검증**: `/doc-check` 또는 `/push` 4단계

—— commit —— `docs(...): ...` (문서별 별도 커밋)

---

## 남은 불확실

**T11이 닫혔으므로 목측 항목은 없다.** 남은 것은 성격이 다르다.

| 항목 | 지금 |
|---|---|
| ~~KV 세로 보정값~~ | **보정하지 않기로 했다** (2026-09-10 사용자) — 폭이 컨테이너를 따라 변해서 고정 보정값이 뷰포트마다 틀린다 |
| ~~우측 그라데이션~~ | 닫혔다 — 위쪽이 페이지 배경색에서 시작해 아래로 파랑(`--auth-hero-from/to`) |
| 초대 화면의 우측 패널 | KV에 환영 문구가 **구워져 있어** 실패 분기(만료·없음)와 어긋난다. 분기별로 못 바꾸므로 **그대로 두기로 했고**, 거슬리면 그때 우측을 비운다 |
| `Button` 기본 치수 교체 시점 | **마지막 화면이 옮겨온 뒤.** 지금 `size="lg"`는 셸 밖 전용이라 셸 안팎의 버튼 높이가 다르다 |
| **토스트가 진입 시점 상태에 맞나** | ⚠️ **스크린리더 확인이 아직 없다.** `role="alert"`(끼어듦) → `aria-live="polite"`(큐) 강등이 딸려 있고, 거부는 끊어야 하는 쪽이다. **눈으로는 문제없었고** 그 축만 미검증이다 |
