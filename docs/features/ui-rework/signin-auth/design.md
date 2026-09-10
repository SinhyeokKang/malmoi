# 8-1 signin + 인증 화면 — design

## 1. 영향 받는 흐름

**셋 중 어디도 아니다** — push·편집 UI·pull의 값 경로를 만지지 않는다. 건드리는 것은 **인증 경계와
라우팅**이고, 그래서 위험은 "값이 틀린다"가 아니라 **"막혀야 할 것이 안 막힌다"** 쪽이다.

## 2. `/signin` 분리 — 배선이 **아홉** 자리다

`app/page.tsx`의 로그인 화면을 `app/signin/page.tsx`로 옮기고, `/`는 redirect 껍데기만 남긴다.

```
app/page.tsx        세션 ok → /projects, 아니면 → /signin  (나중에 랜딩이 이 자리를 가져간다)
app/signin/page.tsx 로그인 화면 (?error= · ?sessions= 슬롯을 여기가 받는다)
```

⚠️ **초안이 일곱이라고 적었고 실측은 아홉이다** (2026-09-10 리뷰 — CPO·CTO·QA가 각자 셋을 찾았다).
전수는 `tasks.md` T3의 표가 든다. 그중 하나가 이 배송을 조용히 깨뜨린다:

> **`lib/session-revocation/policy.ts:55`의 `"/?sessions=revoked"`** — `?sessions=revoked`의 **유일한
> 생산자**다(소비자는 `lib/session-revocation/http.ts:25,58`). 안 옮기면 `/` 껍데기가 **쿼리를 버린 채**
> `/signin`으로 보내 **회수 완료 토스트가 원리적으로 안 뜬다.** POSTMORTEM 2026-09-06("보내는 쪽과
> 받는 쪽이 함께 안 움직였다")의 정확한 재현이고, 아이러니하게 이 문서의 초안이 그 회고를
> 인용하면서 이 자리를 빠뜨렸다.

⚠️ **`signOut({ redirectTo: "/" })` 둘은 옮기지 않는다** — **로그아웃은 랜딩으로 간다**(2026-09-10
사용자). 지금은 `/`가 `/signin`으로 한 홉 더 가고 랜딩이 서면 거기 착지한다. **주석으로 그 의도를
남긴다** — 안 적으면 다음 사람이 "이관 누락"으로 읽는다.

⚠️ **`middleware.ts`가 `lib/routes.ts`를 import해도 안전하다** — 그 모듈은 **import 0인 잎**이라
미들웨어 번들에 아무것도 끌고 오지 않는다(실물 확인).

⚠️ **`auth.ts`의 `pages.signIn`·`pages.error`가 서로 다른 갈래를 받는다.** `@auth/core`가
`AuthError.kind`로 가른다 — `OAuthAccountNotLinked` → `pages.signIn` / `AccessDenied`·`Configuration`
→ `pages.error` / `Unavailable`(우리 문자열 반환) → `callbacks.redirect`. 지금은 둘 다 `"/"`라
**이 분기가 보이지 않는다.** 검증할 때 두 키를 각각 밟아야 한다(`tasks.md` T7의 유발 표).

⚠️ **`matcher`는 그대로다.** `/signin`·`/privacy`·`/docs` 셋 다 **비로그인으로 열려야 하므로**
넣지 않는다. 실물 확인: `shouldRedirectToLogin`과 `middleware()` **둘 다 경로를 한 번도 보지 않는다** —
목적지 제외 규칙이 한 줄도 없으므로 `/signin`을 matcher에 넣으면 진짜 `ERR_TOO_MANY_REDIRECTS`다.
그런데 **반대 방향의 압력이 문서 두 곳에 규칙으로 박혀 있다**(`middleware.ts:42` *"새 보호 라우트를
추가하면 여기도 추가한다"* · POSTMORTEM 2026-08-31). **부정 단언을 테스트에 더한다.**

### 2.1 ⚠️ 안전망이 **없다** — 초안의 이 자리가 가장 위험한 문장이었다

초안은 이렇게 적었다: *"`entry-points.test.ts`의 쿼리 수신자 검사가 경로별로 대조하므로, `/signin`이
`searchParams`를 읽지 않으면 red다. **그것이 이 이관의 안전망이다.**"* — **셋 다 거짓이다**
(2026-09-10 CTO·QA 실물 확인):

1. `EMITTED`는 `ENTRY_POINTS`에서만 만든다 = `app/` 아래 **`page.tsx|route.ts|actions.ts`뿐**이다.
   레이아웃도 `auth.ts`도 `lib/**`도 안 본다 → **생산자 넷 중 셋이 원리적 사각지대**
2. 리터럴 정규식이 `/` 뒤에 **소문자를 요구**해 오늘의 `"/?error="`를 **한 건도 못 잡는다**.
   이 검사는 지금 `/`에 대해 0건이고 이관 후에도 저절로 켜지지 않는다
3. 생성기 정규식은 템플릿 리터럴의 `}`를 요구하는데, 초안이 지시한 `routes.signIn() + "?error=…"`
   (문자열 연결)은 **둘 다 회피한다**

**조치: 쿼리를 `lib/routes.ts`가 만들게 한다.**

```ts
signIn: (q: { error?: string; sessions?: string } = {}): string => withQuery("/signin", q),
```

그러면 ③의 형태가 되어 검사에 걸리고, "앱 내부 링크의 단일 출처" 규칙도 지킨다.

**그리고 "안전망이 있다"고 믿지 않는다** — 이 이관의 실제 그물은 **예상 red 여섯**(`session-revocation`
넷 · `credentials/sign-in` · `onboarding`)과 **`normal-login.test.tsx`**이고, 그것이 `tasks.md` T3의
검증이 grep 0건이 아닌 이유다.

## 3. 순수 함수로 분리 가능한 부분

**축이 둘이라는 것을 먼저 정한다.** 초안은 *"셋이 같은 세 갈래를 각자 적고 있다"*고 썼는데
실물은 다르다 (2026-09-10 CTO 확인) — `lib/auth/session.ts:26-27`과 `app/(edit)/layout.tsx:29-30`은
**바이트 단위로 같은 2갈래**(`unavailable`·`none`)이고 **`ok` 갈래가 아예 없다.** `app/page.tsx`만
`ok → /projects`를 든다. `ok`를 반환하는 함수를 `requireUser` 자리에 꽂으면 의미가 안 맞는다.

| 함수 | 위치 | 무엇을 판정하나 |
|---|---|---|
| `rejectTarget(status)` | `lib/auth/landing.ts` | **거부·장애를 어디로 튕기나** — 2갈래. `session.ts`·`(edit)/layout.tsx`가 쓴다 |
| `landingTarget(status)` | 같은 파일 | **루트의 착지** — `ok → /projects`, 나머지는 `rejectTarget` 위임 |
| `dotGrid(width, height, gap)` | `lib/signin/dot-field.ts` | 캔버스 크기 → 도트 좌표. **잎, import 0** |
| `dotScale(distance, radius, base, max)` | 같은 파일 | 커서 거리 → 반지름 보간 |

⚠️ **타입은 `SessionRead["status"]`다** — `SessionStatus`라는 타입은 리포에 없다.
`lib/auth/read-session.ts`가 내보내는 것은 객체 union `SessionRead`다.

⚠️ **Canvas 렌더 자체는 순수 함수가 아니다** — `ctx.arc()` 호출이라 I/O다. 테스트가 잡는 것은
**좌표와 반지름 계산**까지이고 그리기는 실물 확인의 몫이다.

## 4. 도트 필드 — Canvas 2D인 이유

시안의 도트는 **`#006BFF` @5% · 지름 4px · 간격 16px**이고, 요구는 **커서 주변 도트가 스케일**하는 것이다.

| 방식 | 판정 |
|---|---|
| CSS `background-image: radial-gradient` (지금 코드) | ❌ **개별 도트가 요소가 아니다.** 스케일 대상이 없다 |
| DOM 노드 개별 | ❌ 948×1064 / 16px ≈ **4,000개 요소.** 리페인트로 죽는다 |
| **Canvas 2D + rAF** | ✅ 4,000개 `arc()`가 프레임당 1~3ms |
| WebGL | ❌ 로그인 장식에 셰이더는 과하다 |

**배선**: `components/signin/dot-field.tsx` (`"use client"`)

- ⚠️ **잎이어야 한다** — `components/__tests__/client-graph.test.ts`가 `"use client"` 파일의 **값
  import 그래프**를 따라간다. 판정 함수를 `lib/signin/dot-field.ts`(import 0)에 두고 그것만 읽는다
- ⚠️ **`prefers-reduced-motion`이면 rAF를 아예 시작하지 않고 1회만 그린다.** 로그인은 첫 진입점이라
  여기서 배터리를 태우지 않는다. `matchMedia`는 **effect 안**에서 읽는다(SSR에 없다)
- ⚠️ **DPR을 반영한다** — `canvas.width = cssWidth * devicePixelRatio` + `ctx.scale`. 안 하면
  레티나에서 4px 도트가 뭉개진다
- ⚠️ **커서가 패널을 벗어나면 기본 상태로 되돌린다.** `mouseleave`에서 목표를 0으로 두고 보간이
  수렴하면 rAF를 멈춘다 — 정지 화면에서 루프가 계속 도는 것을 막는다
- ⚠️ **`ResizeObserver`로 다시 그린다.** 1280px 고정이라 리사이즈가 드물지만, 안 하면 창을 줄인 뒤
  도트가 늘어난 채로 남는다

## 5. 토큰 · 프리미티브 변경

### 5.1 치수 — **새 토큰을 만들지 않는다**

**2026-09-10 사용자 판정: 기존 스케일에서 가장 가까운 값을 쓴다.** 초안은 `--text-28` 신설이었는데,
그 토큰 하나에 **twMerge 등록 + DESIGN §4 등재**가 딸려오고 소비자는 **장식 문구 두 줄**뿐이었다.

| 시안 | 쓰는 값 | 차이 |
|---|---|---|
| 28px 문구 | `text-3xl` (30px) | +2 |
| radius 12px | `rounded-xl` (**14px**) | +2 |
| 버튼 높이 38px | `h-10` (40px) | +2 |
| 아이콘 20px | 16px | −4 |

⚠️ **`rounded-xl`은 12px가 아니라 14px다** — `--radius: 0.625rem`(10px) + 4px. 초안이 "`rounded-xl`
(12px)"이라고 적었고 그대로 실행하면 **시안보다 2px 둥근 버튼이 나오는데 아무도 눈치채지 못한다.**
12px에 대응하는 토큰은 **없다**(8·10·14).

⚠️ **커스텀 `text-*`를 만들면 `lib/utils.ts`의 twMerge `classGroups` 등록이 함께 간다** — 안 하면
twMerge가 그것을 **text-color로 오분류**해 `cn("text-28", "text-foreground")`에서 조용히 사라지고
`text-2xl`과도 dedupe되지 않는다. DESIGN §4.2가 `text-mono`를 그 이유로 등록해 뒀고 bugshot-2가
실제로 밟았다. **토큰 하나의 진짜 비용이 그것이다.**

⚠️ **아이콘 20px는 §6.8 위반이다** — *"크기는 **셋뿐이다**: 16 · 12(`ExternalLink`만) ·
24(`EmptyState` 하나). 그 밖의 크기를 만들지 않는다."*

### 5.2 `Button` — 베이스를 바꾸지 않고 `size="lg"`를 더한다

| | 지금 | 이번에 |
|---|---|---|
| 높이 | `h-8` (32px) | `size="lg"` = `h-10` (40px) |
| radius | base의 `rounded-md` (8px) | T11 목측 — `rounded-xl`(14px)로 덮을지 |

⚠️ **`Button` 소비자가 26파일이다**(초안이 21이라 적었다) — 여기서 베이스를 바꾸면 그 전부가 따라
움직이는데 **이번 배송이 검증하는 화면은 셋뿐이다**(signin·invite·placeholder 둘). 다른 화면의
배송이 각자 시안을 보고 옮겨오고, **마지막 화면이 옮겨온 뒤에 기본값을 바꾼다.**

⚠️ **`lg`는 셸 밖 카드 전용이라고 §6.4에 등재한다** — 안 적으면 8-3에서 셸 안 화면이 "signin이
lg를 쓰니 우리도"로 번진다. (두 치수가 공존해도 시각적으로 안전한 이유는 **signin·invite가 셸 밖이고
로그인 전/후로 갈려** 사용자가 한 세션에서 나란히 볼 일이 없어서다 — 그 근거도 함께 적는다.)

⚠️ **`rounded-md`가 cva의 base에 있고 size 변형에 없다.** `size="lg"`가 radius를 덮으려면 base와
충돌하는 클래스를 내야 하고, 그게 먹는 이유는 `Button`이 `cn()`을 지나기 때문뿐이다(cva 자체는
dedupe하지 않는다). **형이 우연에 기대지 않게 base에서 radius를 빼 size로 내리는 편이 낫다.**

⚠️ **포커스 링 셋을 여는 태그에 리터럴로 유지한다** — cva 베이스로 옮기면 `focus-ring.test.ts`가
그 파일을 통째로 못 본다 (DESIGN §7, 2026-09-06·07에 두 번 샜다).

### 5.3 카드 — **셋 중 하나를 T6에서 정한다**

시안의 좌측 패널은 `bg-card` · radius · border · **shadow**다. 실물 `Card`는 `variant`·`padding`·
`shadow` prop이 **없고** 헤더가 `title !== undefined`로만 붙는다 — signin 카드는 헤더 없음 + shadow +
radius라 **세 축이 다르다.**

⚠️ **"필요하면 변형을 더한다"로 두지 않는다** (2026-09-10 CDO) — 형의 단일 출처를 다루는 배송에서
미결로 두면 T9 구현 중에 즉흥으로 정해진다. 셋 중 하나:

(a) `Card`에 shadow 변형을 더하고 §6.4에 등재 / (b) signin·invite는 `Card`가 아니라 지역 `div`이고
그 이유를 적는다 / (c) 시안의 shadow를 버린다

⚠️ **초대 수락 화면도 같은 카드다** — 두 화면이 셸 **밖**의 유일한 카드라(DESIGN §4의 `text-lg`
설명이 그 둘을 지목한다) 형이 갈리면 눈에 띈다.

### 5.35 피드백은 **토스트**다 — `sonner` 재도입 (2026-09-10 사용자 결정)

⚠️ **2026-09-08의 결정을 뒤집는다.** 그때 `sonner`를 **사용 0**으로 확인해 제거했고 근거가 이렇게
적혀 있었다 — *"피드백은 셀 인라인(저장)과 `Alert`(Publish)이고 **토스트는 그것을 둘로 가른다**"*.
사용자가 8단계에서 인라인 에러를 피하고 토스트로 통일하기로 정했다(**2026-09-10 두 번 재확인**).
**그래서 이 절은 "무엇을 지불하는가"를 적는다.**

⚠️ **이 결정을 다시 묻지 않는다.** `/feature-review`의 지적도 이 축에서는 기각됐다 — **인라인 에러가
필요해지면 그때 더한다**는 것이 사용자의 방침이고, 지금 Alert와 병행하는 절충안을 만들지 않는다.

| 딸려오는 것 | 조치 |
|---|---|
| `components/__tests__/client-graph.test.ts` | ⚠️ **금지 목록이 아니라 허용 목록이다** — 아래 |
| 서버 컴포넌트는 토스트를 띄울 수 없다 | `?error=`·`?sessions=`를 읽어 `toast()`를 부르는 **클라이언트 조각**이 하나 필요하다(`components/signin/auth-toast.tsx`) |
| `Toaster` 배선 | `app/layout.tsx`(루트)에 둔다 — 8단계 전체가 토스트를 쓸 것이므로 화면마다 두면 사본이 늘어난다 |
| `sonner`가 테마를 감지한다 | **`theme="light"`로 고정한다.** 안 하면 OS 다크에서 토스트만 어두워져 DESIGN §3(라이트 단일)이 그 컴포넌트에서만 깨진다 |

#### ⚠️ `client-graph.test.ts`에는 "금지 목록"이 없다 — 편집이 **셋** 필요하다

**초안이 틀렸고 원인은 CLAUDE.md의 오기다** (2026-09-10 CPO·CDO·CTO 공통, 실물 확인). 그 파일은
`ALLOWED` 7개 + `next`/`next/*` 특례의 **허용 목록**이고, 주석이 *"금지 목록이 아니라 허용 목록이다
(2026-09-07 리뷰 🟡5) … 목록에 없는 `yaml`·`zod`가 통과했다"*로 그 전환을 명시한다. `sonner`가 나오는
유일한 자리는 **메타 테스트**(`for (const bad of ["sonner", …]) expect(allowed(bad)).toBe(false)`)이고
그것은 "재유입 방지 등재"가 아니라 *"목록 밖은 아무거나 걸린다"*의 **표본**이다.

1. **`ALLOWED`에 `"sonner"`를 더한다** — 안 하면 `auth-toast.tsx`가 최종 판정에서 red
2. **메타 배열에서 `"sonner"`를 뺀다** — 안 빼면 한 파일 안에서 모순돼 red
3. **주석에 근거를 적는다** — 그 파일이 *"목록을 넓히는 것은 의도된 결정이고 그 결정을 이 파일에서
   한 번 하게 만드는 것이 요지"*라고 요구한다

⚠️ **`<Toaster/>`를 `app/layout.tsx`에 두는 것은 스캐너 밖이다** — `CLIENT_ENTRIES`가 `"use client"`로
시작하는 파일만 모으므로 서버 레이아웃은 안 본다. 잡히는 것은 `auth-toast.tsx`이고 결론은 위와 같다.

**⚠️ 토스트가 잃는 것과 그 완화책** — 이것이 2026-09-08 결정의 근거였으므로 그냥 넘기지 않는다:

1. **사라진다.** 인증 거부 사유는 *조치가 필요한 정보*다("이메일이 검증되지 않았다"). → **거부·장애는
   `duration: Infinity` + 닫기**로 띄운다. 성공(`?sessions=revoked`)만 기본 duration이다.
2. **`?error=`를 URL에서 지우지 않는다.** 지우면(`router.replace`) 새로고침으로 다시 볼 길이 사라진다.
   남겨두면 새로고침이 곧 "다시 보기"다.
3. **effect가 두 번 돌면 토스트가 둘이다** (React StrictMode). → **`id`를 고정한다**
   (`toast.error(msg, { id: "signin-error" })`) — 같은 id는 갱신되고 쌓이지 않는다.
4. **스크린리더**: ⚠️ **`role="alert"`(assertive)에서 `aria-live="polite"`로 강등된다.** 지금
   `Alert variant="danger"`는 `role="alert"`을 달아 **끼어들어** 읽히고 `sonner`는 큐에 들어간다.
   이 리포는 그 축을 판단한 전례가 있다 — `lib/pull/message.ts`가 *"`danger`는 `role="alert"`라
   스크린리더가 읽던 것을 끊는다"*를 이유로 "already sending"을 `info`로 내렸다. **그런데 거부는
   끊어야 하는 쪽이다.** T11에서 스크린리더로 확인하고, 안 읽히면 되돌린다.
5. **`?sessions=revoked`도 기본 duration이 아니다** — 되돌릴 수 없는 보안 조치(전 기기 로그아웃)의
   **유일한 완료 증거**이고 사용자는 방금 로그아웃돼 도착한 참이다. 긴 duration + 닫기.
6. **형을 아무 프리미티브도 소유하지 않는다** — `sonner`가 자기 스타일(배경·테두리·radius·shadow)을
   주입하므로 규약 5 밖의 **두 번째 CSS 출처**이자 `Alert`와 같은 뜻을 다른 형으로 말하는 표면이 된다.
   `toastOptions.classNames`로 우리 토큰에 묶고 §6.4에 행을, §6.2에 tone↔variant 대응을 등재한다.

⚠️ **DESIGN §6.2의 `Alert success` 항목이 "로그인 화면의 전체 로그아웃 완료"를 이름으로 지목한다** —
그 줄이 거짓이 되므로 같은 배송에서 고친다(T11).

### 5.4 브랜드 아이콘 — 인라인 SVG, **`components/signin/`에 둔다**

`GithubIcon`(단색 `currentColor`) · `GoogleIcon`(4색).

⚠️ **`components/ui/`가 아니다** (2026-09-10 CDO) — 그 디렉터리는 "프리미티브 16개"의 집이고 브랜드
글리프는 프리미티브가 아니다. §6.8이 이미 *"provider 로고가 필요하면 인라인 SVG를 **그 컴포넌트
안에** 둔다"*로 답해 뒀다. `ui/`에 두면 §6.4 표에 행을 늘려야 한다.

⚠️ **시안의 Google 아이콘은 더미다**(`CommonIcon / color-chart-donut`) — 공식 G 로고를 넣는다.
⚠️ **`lucide-react`에는 브랜드 아이콘이 없다** — 그 라이브러리가 브랜드 글리프를 제외한다.
⚠️ **DESIGN §6.2의 "새 raw 색을 늘리지 않는다"의 예외다** — 브랜드 색은 우리가 고르는 값이 아니다.
**§6.8의 *"색은 상속(`currentColor`) — 예외는 Alert 4종과 `EmptyState`뿐"*도 함께 거짓이 된다.**

## 6. 에셋 — 수령 완료 (2026-09-10)

`public/brand/`에 있다. **커밋된 원본**이다 — `public/fonts/`는 `scripts/copy-fonts.mjs`가 만드는
생성물이라 gitignore인데, 이쪽은 사람이 준 파일이라 트리에 들어간다(`.gitignore`는 `public/fonts/`
하나만 무시하므로 별도 조치가 필요 없다).

| 파일 | 크기 | 구성 | 쓰는 곳 |
|---|---|---|---|
| `malmoi-icon-black.svg` | 120×120 | 검은 라운드 사각(`#090B0C`) + **흰 심볼** | 로그인 카드 로고 48×48 · **favicon** |
| `malmoi-icon-white.svg` | 120×120 | 흰 사각 + 검은 심볼 | 아직 없음 (어두운 표면용) |
| `malmoi-symbol-black.svg` | 54×76 | 심볼 단독(검정), 배경 없음 | 아직 없음 (8-2 셸 후보) |
| `malmoi-symbol-white.svg` | 54×76 | 심볼 단독(흰색), 배경 없음 | 아직 없음 |
| `malmoi-signin-kv.png` | 2172×996 | 투명 배경 키비주얼 | 우측 패널 |

⚠️ **시안 프레임 이름과 파일명이 어긋난다.** 시안에서 로고 자리의 프레임 이름은 `malmoi-symbol-white`
인데, 실제로 그 자리에 들어가는 파일은 **`malmoi-icon-black.svg`**다. 파일명의 색은 **주 색** 기준이라
`icon-black`은 배경이 검정(심볼은 흰색)이고 `symbol-black`은 심볼이 검정이다. 시안 이름으로 파일을
찾으면 없는 것을 찾게 된다.

### 6.1 favicon — `app/icon.svg`

**`malmoi-icon-black.svg`를 `app/icon.svg`로 복사한다.** Next App Router가 그 파일명을 보고
`<link rel="icon">`을 자동으로 넣으므로 `layout.tsx`에 배선이 없다. **리포에 favicon이 아예 없었다.**

⚠️ **`symbol-*`을 favicon으로 쓰지 않는다** — 이유가 둘이다: 배경이 투명해 `symbol-black`이 다크
탭에서 사라지고, **54×76이라 정사각이 아니라** 찌그러지거나 여백이 생긴다. 배경을 입힌 정사각이
필요하고 그것이 곧 `icon-black`이다.

⚠️ **복사본이지 참조가 아니다** — `app/icon.svg`와 `public/brand/malmoi-icon-black.svg`가 같은
바이트로 둘 존재한다. Next의 파일 규약이 `app/` 아래를 요구해서이고, **로고를 바꾸면 둘 다 바꾼다.**

### 6.2 키비주얼 — `next/image`이고 배치는 **패딩이 잡는다**

**정적 폭으로 두지 않는다** (2026-09-10 사용자). 우측 패널이 컨테이너이고 이미지는 그 안에서 줄어든다.

| | 값 |
|---|---|
| 우측 패널 패딩 | **좌우 80 · 상하 64** (상하는 `text-3xl` 문구 두 줄의 자리다) |
| KV 최대 폭 | **768** |
| 1280px에서 | 우측 컬럼 640 − 160 = **480px** → 넘치지 않는다 |
| 1920px에서 | 948 − 160 = 788 → **768이 상한으로 걸린다** |

⚠️ **KV가 위로 치우친다** — PNG가 2172×996으로 3x(2088×936)보다 **84×60 크고** 그 여백이 아래쪽
그림자 몫이다. 그대로 중앙 정렬하면 **시각 중심이 위로 어긋난다.** 음수 margin이나 `translateY`로
보정하고 값은 T11 목측이 정한다.

⚠️ **`next/image` + `priority`를 쓴다.** 초안은 §6.2에서 *"`next/image`가 WebP로 변환한다"*를 PNG
하나만 커밋하는 **근거**로 삼아 놓고 T7에서는 `<img>`를 지시했다 — 그러면 **372KB PNG가 그대로
나가고 그 근거가 무너진다.** 로그인은 첫 진입점이고 `regions: ["hnd1"]`로 서버 시간이 짧아진 뒤라
**이 화면의 비용은 이제 거의 전부 이 이미지**다. `priority`가 없으면 발견도 늦다.

⚠️ **`alt=""`로 두는 판정의 성립 조건** — 우측의 `text-3xl` 문구 두 줄("Connect your projects" ·
"Translate & ship together")이 **같은 메시지를 이미 말하고 있을 때**만이다. 그렇지 않으면 제품이
무엇을 하는지 보여주는 유일한 조각이 스크린리더·이미지 차단에서 통째로 사라진다. (래스터에 구운
텍스트는 200% 확대에서 혼자 뭉개지고 — WCAG 1.4.4 — 이미지 안 텍스트는 장식이 아닌 한 1.4.5 AA에
걸린다. **장식으로 두는 근거가 그 두 줄이다.**)

⚠️ **WebP를 커밋하지 않는다** — `next/image`가 요청 시 변환한다. 변환본을 커밋하면 원본과 어긋날
자리가 하나 생긴다.

### 6.3 랜드마크

`<main>`은 **좌측 카드**가 든다 / `<canvas aria-hidden="true">` (포커스 불가) / KV `alt=""` /
`text-3xl` 문구 두 줄은 읽히게 둔다.

## 7. 스키마 변경

**없다.** 이 배송은 DB를 만지지 않는다.

## 8. 새 환경변수

**없다.**

⚠️ 푸터의 GitHub 링크는 외부 URL(`https://github.com/SinhyeokKang/malmoi`)이고, **`lib/routes.ts`가
아니라 상수로 둔다** — 그 파일은 **앱 내부 링크**의 단일 출처이고 외부 URL을 섞으면
`entry-points.test.ts`의 죽은 라우트 대조가 그것을 앱 경로로 읽는다.

## 9. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (ARCHITECTURE §1) | 없음 |
| blob SHA 비교 (§2) | 없음 |
| **인증 경계 (§6.1)** | ⚠️ **있다** — 아래 |
| 테넌트 좁힘 (SAAS 불변식 5) | 없음 (프로젝트 쿼리를 안 만진다) |

### 9.1 인증 경계 — 무엇을 보존해야 하나

**차단은 두 층이고 이 배송은 두 층 모두를 건드린다.**

1. **1차 `middleware.ts`** — 렌더 요청(GET·HEAD)에 쿠키 이름만 본다. redirect 목적지가 `/signin`으로
   바뀐다. ⚠️ **Server Action POST는 계속 통과시킨다** — 307로 돌리면 `fetch`가 POST를 재전송해
   action id를 못 찾는다
2. **본판정은 진입점** — `requireUser`·`requireProjectAccess`의 목적지가 바뀐다

⚠️ **새 라우트 셋은 인가를 지나지 않는다.** `entry-points.test.ts`의 `EXEMPT`에 이름으로 더하고,
**왜 지나지 않는지를 함께 적는다**(그 파일의 규칙이다):

- `signin/page.tsx` — 로그인 화면. 세션이 없는 사람이 보는 화면이다 (기존 `page.tsx`의 사유가 옮겨온다)
- `privacy/page.tsx`·`docs/page.tsx` — 공개 문서. 로그인 없이 읽혀야 한다
- `page.tsx`(루트) — 목록에 **남는다**. redirect 껍데기가 되지만 여전히 비로그인 진입점이다

### 9.2 `revalidatePath` — 이 배송에는 없다

POSTMORTEM 2026-09-09("화면을 라우트 밖으로 옮겼는데 무효화 경로가 안 따라갔다")의 부류를 확인했다:
**로그인·초대 화면의 상태를 쓰는 Action이 없다**(세션 상태는 매 요청 읽는다).

⚠️ **초안이 "`/` 또는 `/invite`를 겨누는 것은 0건"이라고 적었는데 틀렸다** — 실제로는
`app/(edit)/projects/actions.ts`의 `disconnectGithub`·`archiveProject`·`unarchiveProject` **3건**이
`revalidatePath("/", "layout")`이다. **결론은 그대로 맞다**: 루트 레이아웃 무효화라 경로 이관과
무관하게 계속 맞고, **그것이 접두를 안 쓴 이유이기도 하다.** 문장만 고친다 — 안 고치면 다음 사람이
그 grep을 믿는다.

## 9.3 확정된 라우팅·문구 결정 (2026-09-10 사용자)

| 결정 | 근거 / 지금의 대가 |
|---|---|
| **로고 → `/`(랜딩)** | 랜딩이 들어올 자리를 미리 가리킨다. ⚠️ **지금은 `/`가 redirect 껍데기라 비로그인 사용자가 누르면 `/signin`으로 되돌아온다** — "아무 일도 안 일어난다"로 보이고, 랜딩이 서면 정상이 된다 |
| **로그아웃 → `/`(랜딩)** | `signOut({ redirectTo: "/" })` 둘을 **그대로 둔다**(2026-09-10 사용자). 지금은 `/signin`으로 한 홉 더 가고 랜딩이 서면 거기 착지한다. ⚠️ **이관 누락이 아니라는 주석을 남긴다** |
| **tagline을 지운다 — 시안 그대로** | 제품 설명은 **랜딩이 맡는다**(2026-09-10 사용자). ⚠️ **그때까지 비개발자가 이 제품이 뭔지 알 수 있는 자리가 앱에 0곳이다** — 받아들인 대가다 |
| **푸터 링크 넷을 유지한다** | GitHub은 리포 public 전환 전까지 로그아웃 방문자에게 **404**, Privacy Policy는 **"준비 중"**이다. 출시 전에 채운다 |
| **`/`에 로그인 상태로 오면 `/projects`** | *"로그인 이후 랜딩 못 가게"*가 의도다. **랜딩이 생긴 뒤에도 유지한다** — 이 줄이 없으면 다음 배송이 "로그인해도 랜딩을 볼 수 있어야 한다"로 뒤집는다 |
| **Terms of Service를 만들지 않는다** | 돈을 받고 파는 서비스가 아니라 **Privacy Policy 하나로 퉁친다**. `/terms`는 따지 않는다 |
| **푸터 GitHub 링크는 리포를 가리킨다** | 출시 전 리포를 **public으로 전환할 예정**이다. ⚠️ **그때까지 그 링크는 로그인 안 한 사람에게 404다** — 알고 두는 것이고 T10에서 그 상태를 확인한다 |

## 10. 과거 함정 — 이 영역에서 소환한 것

| 회고 | 무엇을 조심하나 |
|---|---|
| 2026-09-05 죽은 라우트 링크 | 경로 문자열은 타입이 아니다. **이관은 `lib/routes.ts`로 모으고 `entry-points`가 대조한다** |
| 2026-09-06 거부가 무음 | `?e=`를 **보내는 쪽과 받는 쪽**이 함께 움직인다. `/signin`이 `searchParams`를 읽어야 한다 |
| 2026-09-06 장애를 정상으로 읽음 | **거부와 장애가 같은 관측값**을 낸다. `readSession`의 `unavailable`이 `/signin?error=Unavailable`로 가는 갈래를 유지한다 |
| 2026-09-07 클라이언트 번들 7.2MB | 도트 컴포넌트를 **잎**으로. `client-graph.test.ts`가 그것을 센다 |
| 2026-09-08 툴팁 provider | 조건부로만 렌더되는 Radix 조합은 **실제로 열어 봐야** 밟는다 |
| 2026-09-09 Slot 형제 | `asChild`가 닿는 프리미티브에 형제를 붙이면 던진다. 새 프리미티브에 `asChild`를 두면 `Slot.Slottable` |
| 2026-09-09 무효화 범위 | 화면을 옮기면 **그 화면을 보이는 상태를 쓰는 Action**의 무효화를 함께 본다 (§9.2에서 확인 완료) |
| **2026-09-10 재인증 callback** | ⚠️ **`lib/session-revocation/__tests__/normal-login.test.tsx`가 그 회고의 유일한 방어선이고 `@/app/page`를 직접 import한다.** 껍데기가 되면 red인데, **느슨하게 고쳐 통과시키면 회고가 그대로 재발한다.** 그 테스트가 고정하는 것은 `clearRevocationCookies()`가 `signIn()`보다 먼저 불린다는 것이다 — `ProviderButton` 함수 이름과 `redirectTo: "/projects"`를 유지한다 |

⚠️ **이 배송의 공통 원인은 하나다** (2026-09-10 QA 종합): 🔴 일곱 중 여섯이 *"경로 문자열이 한쪽에서
만들어지고 다른 쪽에서 안 읽히는 것이 정상적인 코드"*라 **컴파일러도 테스트도 안 보는 부류**다.
POSTMORTEM 2026-09-05 · 09-06(둘) · 09-09가 전부 같은 계보이고, **이 배송은 그런 경계를 다섯 개
동시에 만든다** — 로그인 경로 · `?error=` · `?sessions=` · `callbackUrl` · signOut 목적지.
