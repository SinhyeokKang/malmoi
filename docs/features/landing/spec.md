# landing — 랜딩(`/`)

## 사용자

**처음 오는 방문자**(개발자 쪽 — 리포에 붙일지 판단하는 사람)다. 번역 편집자(비개발자)는 초대 링크로 `/invite`에 바로
착지하므로 랜딩을 거의 안 본다. 로그인 사용자는 `/`에서 `/projects`로 가므로(2026-09-10 결정) **랜딩을 보는 사람은 늘 비로그인이다.**

## 문제

출시 전이라 방문자 행동은 관측할 수 없다 — 아래는 코드 상태로 확인한 사실이다.

- `/`는 세션만 보고 `/projects`·`/signin`으로 보내는 껍데기다(`app/page.tsx`, PRODUCT §7.7 — "랜딩이 들어올 자리").
  비로그인 방문자가 제품이 무엇인지 볼 화면이 없고, 첫 화면이 곧 로그인 폼이다.

## 범위

**시안이 정본이다** — Claude Design `Landing.dc.html`·`Landing Prototype.dc.html`(design.md 선행 조건)의 **`/` 부분**. 아래는 그 요약이고,
어긋나면 시안이 이긴다(단 이 문서의 "결정"이 시안에 대한 피드백으로 넘어간 항목은 예외).

1. **랜딩 셸** — 헤더 40 · 패널 · 푸터 40이 뷰포트 높이를 정확히 채우고, **패널 안 스크롤러 하나만** 세로로 흐른다(문서는 스크롤되지 않는다).
   루트 `min-width: 1280` — 그 아래는 가로 스크롤이 정상이다(DESIGN §5, 앱 셸과 같다).
   - 헤더: 로고 + `Home · Docs · GitHub`(선택 상태를 그리지 않는다, `aria-current`만) / 우측 primary `Get started`(→ `/signin`).
   - 푸터: `© 2026 Malmoi · GitHub · Privacy Policy · Docs` — **`/signin` 푸터와 같은 목록·순서**이고 둘이 한 곳에서 낸다(2026-09-26 사용자 — 시안의 `Docs · Privacy Policy` 순서는 피드백으로 넘긴다).
2. **랜딩 본문** — 히어로(`Docs` + `Get started`) + 스크롤 구동 목업 + 마무리 CTA(`Get started` 하나).
   - 목업은 **CSS로 직접 그린 DOM**이다(이미지·영상 없음). 고정 논리 캔버스 **1280×720**을 transform 하나로 패널에 맞춘다.
   - 대기 상태에서 목업은 베젤을 두른 "물건"(맞춤의 0.8배)이고, 스크롤하면 맞춤 배율까지 커지며 고정(sticky)되고 "화면"이 된다.
     고정 뒤 씬 다섯이 스크롤 진행률에 따라 재생된다(역방향 스크럽 가능):
     ① 번역 화면 ② 빠진 언어 채우기(타이핑, `fr`) ③ 저장 → Publish 배지 증가 ④ Publish 미리보기(diff) ⑤ PR 열림.
     **스크롤 구동 5씬은 사용자 요구다**(2026-09-26 `/feature-review` — 정적 1장 축소안 기각). 카메라(줌·팬)는 두지 않는다.
   - 프레임 아래 한 줄에 진행 5칸 + 씬 캡션. 시퀀스가 끝나면 고정이 풀리고 마무리 CTA가 온다.

## 완료 조건

판정 수단을 줄 끝에 적는다 — `[unit]` 순수 함수 · `[jsdom]` DOM 테스트 · `[src]` 소스 텍스트 테스트 ·
`[browser]` `pnpm dev` + ego-browser **수동** · `[sync]` `/design-sync`. e2e 프레임워크는 없다.

- [ ] `/`의 세 갈래: `ok` → **여전히 `/projects`로 redirect**(2026-09-10 결정 유지 — 시안 1c의 로그인 랜딩은 도달하지 않는다) · `none` → 랜딩 ·
      `unavailable` → **랜딩**(옛: `/signin?error=Unavailable`. 공개 화면이 세션 장애로 안 열리는 것이 더 나쁘다 — DESIGN §6.61과 같은 쪽.
      장애 신호는 `/signin`·보호 라우트가 계속 든다). `lib/auth/__tests__/landing.test.ts`의 `landingTarget` 계약이 이 셋으로 교체된다. `[unit]` `[jsdom]`
- [ ] 로그아웃(`signOut({ redirectTo: "/" })` 두 곳)이 **로그인 폼이 아니라 랜딩에 착지**한다. `[browser]`
- [ ] 폭 1280 이상에서 `document.scrollingElement.scrollHeight === innerHeight`이고, `overflow-y`가 auto/scroll이면서
      `scrollHeight > clientHeight`인 요소가 패널 안 스크롤러 하나다. `[browser]` (자동 대용: 루트 `h-svh overflow-hidden min-w-[1280px]`·스크롤러 `overflow-y-auto` `[src]`)
- [ ] 1280×800 · 1440×900 · 1920×1080 · 2560×1440에서 고정 상태 목업 루트의 computed `transform` 배율이 시안 수치표와 같다 —
      0.836 · 0.964 · 1.194 · 1.5(상한). 식은 `fit = min((W−2m)/1280, (H−2m−44)/720, 1.5)`, `m = clamp(24, 0.04·H, 48)`. `[unit]` `[browser]`
- [ ] 스크롤을 내리면 씬 ①→⑤가 순서대로, 올리면 역순으로 재생되고 타이핑 글자 수가 스크롤 위치의 함수다(같은 위치 → 같은 프레임). `[unit]` `[jsdom]` `[browser]`
- [ ] `prefers-reduced-motion: reduce`에서 배율 트윈이 없고(`s = fit` 고정) 씬이 전환 구간 한가운데에서 단절 전환된다 — 스크롤 길이는 같고, 런타임 토글도 반영된다. `[unit]` `[jsdom]` `[browser]`
- [ ] JS 전·JS 없음: 스테이지가 패널을 넘치지 않고 빈 세로 구간이 남지 않는다(준비 전엔 스테이지 높이가 패널 1개). `[browser]`
- [ ] 목업 프레임은 `aria-hidden`이고 안에 인터랙티브 태그(`button`·`a`·`input`·`textarea`·`select`·`[tabindex]`)가 0개다 `[jsdom]`,
      접근성 트리에서 빠진다 `[sync]`. 보이는 캡션도 `aria-hidden`이고, 섹션 첫머리의 visually-hidden `<ol>`이 다섯 문장을 늘 담는다(시안 1c). `[jsdom]`
- [ ] 키보드만으로(Space/PageDown) 랜딩을 끝까지 내릴 수 있다 — 스크롤러가 스크롤을 받는다. `[browser]`
- [ ] Claude Design 핸드오프와 `/design-sync`가 일치를 보고한다(computed style + 접근성 트리). `[sync]`
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm build` green, `pnpm test:credentials:postgres` green(POSTMORTEM 2026-09-10 — 로그인 착지 단언.
      `location` 값은 `/` 그대로이고 그 뜻은 세션이 있으므로 `ok → /projects` 유지).

## 비목표

- **`/docs`·`/privacy`** — 이번 과업에서 뺀다(2026-09-26 사용자). 셸 밖 1열(`components/public-doc.tsx`, DESIGN §6.61)·복귀 링크·320px 규칙이 그대로다.
  시안의 문서 그릇(1e — 타이포·TOC·docs 내비·다중 페이지)은 후속 과업의 입력으로 남는다.
- **모바일·좁은 폭 레이아웃** — 설계하지 않는다(2026-09-26 사용자). 1280 아래는 가로 스크롤이다.
- 목업 내 실제 앱 컴포넌트 재사용 — Server Action·DB에 묶여 있어 정적 복제로 그린다(`components/ui`의 **클래스**는 쓰되 인터랙티브 태그는 안 쓴다).
- 로그인 사용자의 랜딩 열람 — 2026-09-10 결정 그대로 막는다(시안 열린 결정 1은 기각). 그래서 **로그인 변형(`Open Malmoi`)을 만들지 않는다.**
- `/signin`·`/invite`의 셸 이관 — 자기 레이아웃을 유지한다(푸터 링크 목록만 공유).
- OG 이미지·SEO 메타 확장·분석 도구 — 이번에 안 한다(분석 도구는 방침(`/privacy`)의 새 전송처가 된다).
- 랜딩 ko 번역 — UI는 en 단일(PRODUCT §10).
- 씬 추가(설치·연결·push 흐름) — 1차는 "편집 → Publish" 하나의 이야기다.

## 결정 (2026-09-26 `/feature-review`)

1. **폭** — 루트 `min-width: 1280`(시안). 좁은 폭 분기는 두지 않는다.
2. **타이핑되는 번역 언어 `fr`** — 라틴이라 `no-korean-ui` 게이트·폰트 둘 다 걸리지 않는다(한글은 허용 목록을 하나 더 열어야 하고,
   일본어는 Pretendard에 가나가 없어 시스템 폰트로 떨어진다).
3. **히어로 문구** — 서브의 `locale files` → `translation files`(`terminology.test.ts` 금지어 · §10.1), h1 둘째 줄은 Sentence case(`translate & ship together`). 시안 열린 결정 2·3.
4. **배율 상한 1.5** — 2560에서만 걸린다. 시안 열린 결정 5.
5. **1280×800의 목업 11.7px를 받아들인다** — 읽혀야 할 문장은 캡션이 든다. 시안 열린 결정 4.
6. **h1·CTA h2 weight 600** — DESIGN §4("600 이상은 쓰지 않는다")가 예고한 첫 소비자다. §4를 함께 고친다.
7. **CTA는 `Get started` 하나** — 랜딩을 보는 사람은 늘 비로그인이라(`ok`는 redirect) 세션으로 갈리는 CTA 판정이 필요 없다.
