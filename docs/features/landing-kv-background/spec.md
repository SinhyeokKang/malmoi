# landing-kv-background — spec

> 2026-10-18 착수. Claude Design 탐색 결과 `Landing KV Background Guide.dc.html`(구현 가이드, 기준 dev `9f173902`) · `Landing KV Background.dc.html`(시안 3a–3h 테마 × 뷰포트, 2a–2c 스크롤 위치)를 같은 날 사용자가 채택했다. 가이드 §7의 열린 결정 셋 중 둘을 사용자가 정했다 — **`lg` 미만에도 적용**, **CTA 아래 끝은 가이드대로**(그라디언트가 CTA 아랫변 = 패널 바닥에서 끝난다). 같은 날 `lg` 미만 시안(`Landing KV Background Narrow.dc.html`)이 결정 하나를 더했고 사용자가 채택했다 — **랜딩 패널은 로그인 KV 패널과 같은 그릇이라 보더·그림자(elevation)·바탕색이 없다.** 셸 분기는 랜딩에만 있고, 다른 공개 화면은 지금과 완전히 같다.

## 사용자

**방문자** — 비로그인으로 `/`에 온 사람(로그인 상태는 `/projects`로 간다, `lib/auth/landing.ts` `rootView`). 개발자·번역 편집자 둘 다 처음엔 여기서 제품을 본다. 운영 화면이 아니라 두 사용자의 요구가 충돌하지 않는다.

## 문제 (관측된 사실)

- 랜딩(`app/page.tsx`)의 콘텐츠 면은 흰 패널(`PublicShell`의 `bg-background`) 그대로다. 로그인 화면(`/signin`) 우측은 브랜드 KV — 세로 그라디언트(`--auth-hero-from` → `--auth-hero-to`)와 커서를 따라 밝아지는 점 격자(`DotField`, `components/signin/dot-field.tsx`) — 를 갖는데, 제품의 첫 화면인 랜딩에는 그 시각 언어가 없다. 두 공개 화면이 다른 제품처럼 보인다.
- 로그인 KV는 `lg` 미만에서 숨는다(`components/signin/auth-layout.tsx:90` `hidden lg:flex`). 그래서 좁은 폭에서는 KV가 어디에도 없다.

## 완료 조건 (검증 가능한 문장)

1. **한 장의 배경** — `app/page.tsx`에 `[data-landing-kv]` 래퍼가 하나 있고, 그 안에 그라디언트 층 하나·캔버스 하나가 있다. `/docs`·`/privacy`·`/changelog`·`/signin`에는 0이다. DOM·소스 테스트로 센다.
2. **그라디언트 길이 = 콘텐츠** — 그라디언트 층이 래퍼 전체(히어로 윗변 ~ 마무리 CTA 아랫변)를 덮는다(`absolute inset-0`). 그라디언트를 패널·스크롤러에 칠하지 않는다(랜딩 패널의 `bg-background` 제거는 11의 바운스 대응이고 그라디언트 자리와 무관하다). 소스 단언 + 수동 실측(층 높이 = 래퍼 `scrollHeight`).
3. **캔버스는 한 화면** — 캔버스 CSS 높이 = 스크롤러 `clientHeight`, 버퍼 = 그 × DPR. 콘텐츠 높이로 커지지 않는다. 수동 실측.
4. **격자가 콘텐츠에 붙어 올라간다** — 스크롤 16px마다 격자가 한 칸 올라가 원위치와 같아진다(`scrollTop % 16`). 순수 함수 단위 테스트(격자 오프셋) + 수동 확인.
5. **조작은 그대로** — 캔버스는 `pointer-events: none`이고, 스크롤러 위에서 커서를 움직이면 점이 따라온다. 버튼·링크 hover와 클릭은 그대로다. 히어로 h1·본문·버튼이 점 위에 그려진다. DOM 테스트(클래스·`relative`) + 수동 확인.
6. **모션 감소** — `prefers-reduced-motion`이면 rAF 루프가 0이고, 스크롤할 때마다 한 번씩만 다시 그린다. DOM 테스트(rAF 호출 수).
7. **테마** — Light·Dark·System 전환에서 점 색을 다시 읽는다. 기존 `components/__tests__/dot-field.test.tsx`가 계속 green이다.
8. **로그인은 그대로** — `DotField`의 새 동작은 opt-in prop이고 기본값은 지금 동작이다. 로그인 KV(`auth-layout.tsx`)의 렌더·동작이 바뀌지 않는다(기존 테스트 green + 수동 비교).
9. **`lg` 미만에도 선다** — 768·375에서 그라디언트와 점 격자가 보인다. 정적 흐름(`Stage`의 `data-static`)에서도 같은 래퍼라 그대로 적용된다. 수동 실측 + Claude Design 시안 대조(`/design-sync`).
10. **새 raw 색 0** — tsx에 hex·rgb 리터럴이 없다. 토큰 클래스(`from-auth-hero-from` · `to-auth-hero-to`)와 `var(--signin-dot)`만 쓴다. 기존 `visual-system.test.ts`가 센다.
11. **랜딩 패널만 보더·그림자·바탕색이 없다** — `PublicShell`의 `kv` prop(기본 `false`)은 `app/page.tsx`만 넘긴다. 켜면 `<main>`에서 `border`·`border-border-subtle`·`shadow-low`·`bg-background`가 빠지고 radius 16은 그대로다. 바탕색을 빼는 이유는 Safari·iOS 고무줄 스크롤이다 — 그라디언트는 스크롤러 안에 있어서 바운스 때 패널 바탕색(Light 흰색 / Dark `#171717`)이 위·아래 띠로 드러난다. 빼면 그 자리에 캔버스 색이 보이고, 위 끝은 그라디언트 시작 색과 같아 이음매가 없다(사용자 2026-10-18). 그래서 로그인 KV 패널(`auth-layout.tsx` `Decoration`)과 같은 그릇이 된다. `/docs`·`/privacy`·`/changelog`는 prop을 넘기지 않으므로 `<main>`의 클래스 문자열이 **지금과 바이트 단위로 같다**. DOM 테스트(기본 클래스 문자열 고정 + `kv`에서 보더·그림자·바탕색 토큰 0) + 소스 테스트(`kv`를 넘기는 곳은 `app/page.tsx` 하나) + 수동 실측(세 화면의 `<main>` computed style이 변경 전과 같다).

## 비목표

- **로그인 KV의 `lg` 미만 표시** — `/signin`은 지금처럼 `lg` 미만에서 장식을 숨긴다. 이 기능은 랜딩만 바꾼다.
- **다른 공개 라우트** — `/docs`·`/privacy`·`/changelog`에는 깔지 않는다(읽는 문서 위의 움직이는 장식은 본문 대비를 깎는다 — 가이드 R12).
- **CTA 아래 끝 처리 변경** — 그라디언트는 CTA 아랫변(패널 바닥)에서 끝나 푸터 바로 위가 가장 파랗다. 패널 radius 16 안에서 끝나고, 랜딩 패널엔 보더·그림자가 없으므로 경계는 radius와 면 색(끝 색 대 캔버스)만 만든다. 로그인 KV 패널도 같은 모습이다(사용자 2026-10-18 — 가이드 §7 그대로).
- **다른 공개 화면의 셸 변경** — `/docs`·`/privacy`·`/changelog`의 패널 보더·그림자·클래스·레이아웃·배경은 한 글자도 바뀌지 않는다. 셸의 기본 클래스 문자열은 고치지 않고 랜딩 갈래만 더한다(사용자 2026-10-18).
- **목업 프레임 변경** — 베젤 면(`bg-background`)·캡션 줄에 투명도·블러를 주지 않는다. 배경은 프레임 둘레로만 보인다(가이드 R5).
- **`DotField` 상수 조정** — 간격 16 · 반지름 2→3.5 · 알파 0.08→0.3 · 커서 반경 180 · 자동 순회 320px/s · 5줄은 로그인과 같다. 랜딩용으로 따로 조정하지 않는다.
- **새 색·토큰** — 없다.
- **대비 보정** — 그라디언트 위에서 Light 대비가 AA(4.5)에 못 미치는 세 줄(CTA muted 3.68 · CTA 링크 4.01 · 히어로 사실 줄 4.38)과, 면 대비가 1.01이라 모양이 사라지는 히어로 `Latest changelog` 알약을 이번 기능에서 고치지 않는다. 시안 그대로 둔다(사용자 2026-10-18).
