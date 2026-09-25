# privacy-shell — `/privacy`를 공개 셸 안으로

## 사용자

**초대받은 번역 편집자(비개발자)**가 1차다 — 초대 메일 → 동의 문서로 `/privacy`를 읽는다. 둘째가 랜딩을 보고 온 **처음 오는 방문자**(개발자 쪽)다.
둘이 갈리는 자리는 폭이다: 편집자는 폰에서도 열 수 있는데, 셸은 `min-width: 1280`이다 → 아래 결정 1.

## 문제

- 랜딩(`/`)은 공개 셸(헤더 · 패널 · 푸터, DESIGN §6.615) 안에 서 있는데, 그 푸터의 `Privacy Policy`를 누르면 **셸 밖 1열**(`components/public-doc.tsx`, DESIGN §6.61)로 떨어진다 —
  헤더·로고가 사라지고 나가는 길이 본문 아래 복귀 링크 한 줄뿐이다(긴 문서 끝까지 내려가야 한다).
- 본문이 14px · `max-w-2xl`이라 법적 장문을 읽기 좁고 작다. 절이 일곱인데 문서 안 이동 수단이 없다.
- 시안이 있다: Claude Design `Landing.dc.html` 1e + `Landing Prototype.dc.html`의 `isPrivacy` 분기(2026-09-26 동결). 구현만 없다.

## 범위

1. **`/privacy`가 공개 셸을 렌더한다.** 랜딩의 `LandingShell`을 공용 `PublicShell`로 옮기고(소비자가 둘이 된다) 두 화면이 쓴다.
   - 헤더 primary가 **세션으로 갈린다**: 로그인(`ok`)이면 `Open Malmoi` → `/projects`, 아니면(`none`·`unavailable`) `Get started` → `/signin`. 랜딩은 늘 `Get started`(로그인 상태의 `/`는 redirect).
   - 헤더 `Home`의 `aria-current`는 랜딩에서만 선다. `/privacy`에서는 헤더 링크 어느 것도 current가 아니다.
2. **문서 그릇(시안 1e)**: 컨테이너 1120 · 본문 720 · 오른쪽 **sticky TOC 200**(`On this page`) · 간격 64 · 상하 120.
   - 타이포: h1 36/1.3/500 · 시행일 14 muted · 도입 16/1.75 · 구분선 · h2 24/1.4/500(첫 절 48, 이후 56) · 본문·목록 16/1.75 · 표 14 · 표 머리 13/500 muted.
   - TOC: 스크롤에 따라 **현재 절을 강조**하고(선 + 글자 foreground), 누르면 그 절이 스크롤러 상단 48 아래에 온다(모션 감소면 즉시). 링크는 실제 `href="#id"`다.
   - 복귀 링크를 없앤다 — 헤더가 그 일을 한다.
3. `/docs`는 **그대로다**(셸 밖 1열 · 복귀 링크 · 14px). `PublicDoc`은 `/docs` 전용으로 남는다.

## 완료 조건

판정 수단 — `[unit]` 순수 함수 · `[jsdom]` DOM 테스트 · `[src]` 소스 텍스트 · `[browser]` `pnpm dev` + ego-browser **수동** · `[sync]` `/design-sync`.

- [ ] `/privacy`가 공개 셸 안에 선다 — `<main>` 1개, 헤더(로고 · Home · Docs · GitHub · primary) · 푸터(`GitHub · Privacy Policy · Docs`). `[jsdom]`
- [ ] 헤더 primary: `ok` → `Open Malmoi` · `/projects`, `none`·`unavailable` → `Get started` · `/signin`. 랜딩은 세 갈래 모두 `Get started`(랜딩은 `ok`에서 안 그려진다). `[unit]` `[jsdom]`
- [ ] `Home`의 `aria-current="page"`는 랜딩에만 있다. `[jsdom]`
- [ ] 폭 1280 이상에서 `document.scrollingElement.scrollHeight === innerHeight`, 스크롤되는 요소가 패널 스크롤러 하나. `[browser]` (자동 대용 `[src]`: 셸 루트 클래스는 랜딩과 같은 컴포넌트)
- [ ] 문서 그릇 수치가 시안 1e와 같다(1440×900 · 2560×1440 — 컨테이너 1120 · 본문 720 · TOC 200 sticky top 48 · 타이포). `[sync]`
- [ ] TOC가 스크롤 위치의 절을 강조한다 — 절 윗변이 `scrollTop + 96`을 넘지 않은 마지막 절. 첫 절 위는 첫 절, 끝까지 내리면 마지막 절. `[unit]` `[browser]`
- [ ] TOC를 누르면 그 절이 스크롤러 상단 48 아래에 오고, 모션 감소면 smooth가 아니다. JS 없이도 `href="#id"`로 이동한다. `[jsdom]` `[browser]`
- [ ] `/privacy#cookies` 하드 진입(주소창)이 그 절로 스크롤된다 · 없는 해시는 scrollTop 0 · 에러 0. `[browser]`
- [ ] 키보드만으로(Space/PageDown) 끝까지 읽을 수 있다 — 스크롤러가 마운트 때 포커스를 받는다(랜딩과 같은 셸). `[browser]`
- [ ] 표가 자기 컨테이너 안에서만 가로 스크롤한다(`role="region"` · `tabIndex=0` · 이름) — POSTMORTEM 2026-09-19. `[jsdom]`
- [ ] 방침 **본문은 바뀌지 않는다** — `policy-gate.test.tsx`(본문 해시 · 시행일)가 개정 이력을 요구하지 않는다. `[unit]`
- [ ] `/docs`는 전과 같다 — `public-doc.test.tsx`·`docs-content.test.tsx` green, 복귀 링크 그대로. `[jsdom]`
- [ ] 랜딩은 전과 같다 — `landing-*` 테스트 green, 스테이지가 스크롤러를 여전히 찾는다. `[jsdom]`
- [ ] `/design-sync` 일치(1e — computed style + 접근성 트리). `[sync]`
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm build` green.

## 비목표

- `/docs`의 셸 이관 · 왼쪽 내비 · 다중 페이지 IA(시안 1h) — 후속.
- 방침 본문 문구 변경 — 이번엔 그릇만. TOC 라벨은 절 `heading`을 그대로 쓴다(시안의 `Deleting your data` 축약은 안 받는다 — 받으려면 사전에 필드가 늘고 본문 해시가 바뀐다).
- 좁은 폭 레이아웃 — 1280 아래는 가로 스크롤(결정 1).
- 뒤로가기 시 스크롤러 스크롤 복원.

## 결정

1. **폭 — `/privacy`도 `min-width: 1280`** (2026-09-26 `/feature-review` landing에서 사용자가 "시안 따름 — min-width 1280, 폰에서 `/privacy` 가로 스크롤 수용"으로 정했다. 그 뒤 `/privacy`가 범위에서 빠져 적용되지 않았던 것을 이번에 적용한다). DESIGN §6.61의 "320px에서 표만 가로 스크롤" 규칙은 **`/docs`에만 남는다.**
2. **`/docs`는 제외** (2026-09-26 사용자) — `PublicDoc`은 `/docs` 전용이 된다.
3. **시안 1e의 타이포·열 폭 + TOC까지** (2026-09-26 사용자).
