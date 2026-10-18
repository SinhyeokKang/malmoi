# landing-kv-background — tasks

> 순서: 시안(`lg` 미만) → 순수 판정 → `DotField` 배선 → 랜딩 구조 → 대조·실측 → 정본. 커밋 경계는 `──`. **커밋 경계마다 `pnpm gate`가 green이어야 한다.**
> 자동 검증(`pnpm test` · `typecheck`)과 **수동 확인**(브라우저 실측 — e2e 없음, 캔버스 픽셀·sticky·스크롤은 jsdom이 재지 못한다)을 줄마다 구분한다.

## 0. 시안
- [x] **T0 — Claude Design 시안 수령(`lg` 미만).** 2026-10-18 `Landing KV Background Narrow.dc.html`을 수령·검토했다. 시안이 더한 결정(랜딩 패널 보더·그림자 제거)은 사용자가 채택했고 spec 11 · design R13에 반영했다. `design-brief.md`를 넘긴다. 기존 `Landing KV Background.dc.html`(1280 이상)과 가이드는 그대로 정본이고, 브리프는 768·375 프레임만 더 받는다.
  - 검증(수동): `DesignSync list_files`에 새 프레임이 있고 브리프 프레임 표의 번호마다 그려져 있다. 시안이 design.md와 다르면 **코드 전에** 어느 쪽을 고칠지 사용자에게 묻는다(터치 기기는 자동 순회 상시 — 2026-10-18 사용자 확정).

──

## 1. 순수 판정
- [ ] **T1 — `dotGrid` 오프셋 · `partitionDots`** (`lib/signin/dot-field.ts`, 잎 그대로).
  - 검증(자동): `lib/signin/__tests__/dot-field.test.ts` 단위 테스트 — `offsetY = 0`이면 지금 `dotGrid` 출력과 같다 · `offsetY = s % gap`이면 첫 행 y = `-offsetY`, 마지막 행 ≥ `height` · `offsetY`가 gap 배수면 원위치 · `partitionDots`의 `near ∪ far = dots`, 교집합 0, `far` 전부 `dotScale` 기본값, `spot = null` → `near = []`. `client-graph.test.ts` green(잎 import 0 유지).

──

## 2. `DotField` 배선
- [ ] **T2 — `follow` prop** (`components/signin/dot-field.tsx`). 기본 `"canvas"`는 지금 동작. `"scroller"`는 R6 스크롤 오프셋 · R7 스크롤러 포인터 · R8 묶음 그리기(design §3). 모션 감소에서 rAF 0, 스크롤마다 한 번 그린다.
  - 검증(자동, DOM): `components/__tests__/dot-field.test.tsx` 기존 사례 green(로그인 불변) + 새 사례 — `follow="scroller"`에서 스크롤러 `scroll` 이벤트가 다시 그리기를 부르고, 포인터 리스너가 캔버스가 아니라 스크롤러에 붙고, 모션 감소면 `requestAnimationFrame` 호출 0 · 스크롤 1회당 그리기 1회. unmount에서 리스너가 모두 떨어진다.

──

## 3. 랜딩 구조
- [ ] **T3 — 래퍼 · 그라디언트 · 캔버스 · 랜딩 셸 갈래** (`app/page.tsx` · `components/landing/stage.tsx`의 `--landing-stage-h` 쓰는 자리 · `components/public-shell/public-shell.tsx`의 `kv` prop — design R13).
  - 검증(자동, DOM·소스): `[data-landing-kv]`가 `app/page.tsx`에 하나 · 그 첫 자식이 `absolute inset-0 bg-gradient-to-b from-auth-hero-from to-auth-hero-to` · `DotField follow="scroller"`가 `pointer-events-none sticky top-0` · 히어로 `section`이 `relative` · 다른 공개 라우트(`app/docs`·`app/privacy`·`app/changelog`·`app/signin`)에 `data-landing-kv` 0 · tsx hex 0(`visual-system.test.ts`). 기존 `landing-stage.test.tsx`·`landing-mockup.test.tsx`·`focus-landing.test.tsx` green.
  - 검증(자동, 셸 갈래 — `components/__tests__/public-shell.test.tsx`에 추가): `kv` 없이 렌더한 `<main>`의 `className`이 지금 문자열과 정확히 같다(고정 단언) · `kv`면 `border`·`border-border-subtle`·`shadow-low`·`bg-background` 토큰이 0이고 나머지 토큰은 기본과 같다 · 소스에서 `<PublicShell`에 `kv`를 넘기는 곳은 `app/page.tsx` 하나다.

──

## 4. 대조 · 실측
- [ ] **T4 — `/design-sync`**: `Landing KV Background.dc.html`(3a–3h · 2a–2c)과 T0의 `lg` 미만 프레임을 computed style·접근성 트리로 대조한다.
  - 검증(수동): 실측 일치 · 리뷰 지적 0.
- [ ] **T5 — 실측** (`/runtime-test`, 로컬, Light·Dark).
  - 검증(수동): 그라디언트 층 높이 = 래퍼 `scrollHeight` · 캔버스 CSS 높이 = 스크롤러 `clientHeight`(버퍼 = × DPR) · `scrollTop`을 16씩 바꾸면 격자가 원위치 · 버튼·링크 hover·클릭 정상 · h1·버튼이 점 위.
- [ ] **T6 — 레이아웃 회귀** (`/runtime-test`).
  - 검증(수동): 1280·768·375에서 `document.scrollingElement.scrollHeight === innerHeight`(POSTMORTEM 2026-10-13 #260) · 가로 스크롤 0 · 래퍼 도입 전후 스크롤러 `scrollHeight`가 같다(캔버스가 흐름에서 자리를 차지하지 않는다 — POSTMORTEM 2026-10-12) · 정적 흐름(`data-static`, 세로 짧은 창)에서도 적용 · `/signin` KV가 이전과 같다 · `/docs`·`/privacy`·`/changelog`의 `<main>` computed style(border·radius·shadow·배경)이 변경 전과 같다 · `/` 패널에 보더·그림자·바탕색이 없다(computed `border-width` 0 · `box-shadow: none` · `background-color` 투명) · Safari 고무줄 스크롤에서 위쪽에 흰 띠가 없다.

──

## 5. 정본
- [ ] **T7 — 정본 갱신**(문서별 커밋): DESIGN §6.615(랜딩 배경 — 구조 R1–R5 · `lg` 미만 적용 · CTA 끝 · `/docs` 등 제외 · R13 랜딩 패널 보더·그림자 없음) · 공개 셸 절(`PublicShell` `kv` 갈래 — 다른 공개 화면 불변) · §6.62(`DotField`의 두 번째 소비자 · `follow` prop) · 토큰 표 `auth-hero-from`/`-to`·`--signin-dot` 소비자에 랜딩 추가 · DIRECTORY(`dot-field.tsx`·`lib/signin/dot-field.ts` 소비자 서술). 그 뒤 이 디렉터리를 지운다.
  - 검증: `/push` 4단계 문서 신선도 통과.
- [ ] **T8 — 가이드 영향**: 랜딩을 찍은 가이드 컷·README 이미지(`docs/assets/readme/` · `public/guide/`)가 있으면 다시 찍는다.
  - 검증: `pnpm guide:check --json`에 이 기능이 바꾼 경로(`app/page.tsx`·`components/landing/**`·`components/signin/dot-field.tsx`)로 걸린 컷의 stale 0.
