# color-scheme — 색 토큰 정리 + 라이트/다크 컬러 스킴

## 사용자

**둘 다다 — 요구가 충돌하지 않는다.** 개발자(나)는 다크 에디터 옆에 Malmoi를 띄워 두고, 번역 편집자(비개발자 동료)는
번역 화면을 오래 본다. 기본값은 지금과 같은 라이트라서, 고르지 않은 사람에게는 아무것도 바뀌지 않는다.

**지금 여는 근거는 사용자 판단이다**(2026-10-04) — 관측된 요청 이슈는 없다. ui-locales가 만드는 `/preferences`에 이어 붙이는
개인 설정 셋째다(ui-locales spec 비목표 "타임존·테마 — … 각각 따로 `/feature`가 필요하다").

**구현 순서는 고정이다**(2026-10-04 사용자): **ui-locales → user-timezone → color-scheme.** 앞 두 기능의 파일·구조가 dev에 들어간 뒤 착수한다.
**착수 게이트**(2026-10-04 리뷰 시점엔 셋 다 없다): dev에 ① `app/(edit)/preferences/`(Language·Time zone 카드) ② `messages/es.tsx` · ko `/privacy` 본(`messages/ko-privacy.tsx`) ③ user-timezone의 `User` 컬럼이 있다 — `git ls-tree origin/dev`로 판정한다.

## 범위 게이트

- PRODUCT §4.2(비범위)·§4.3에 다크 모드·테마는 **없다** — 비범위 승격이 아니다.
- **뒤집는 것은 DESIGN·CLAUDE.md의 규칙이다**: DESIGN §3 "라이트 단일 — `dark:`를 쓰지 않는다. 다크 모드는 비범위다" ·
  §3.2 "`.dark` 토큰 블록이 없다" · CLAUDE.md 스택 표 "라이트 단일" · "린터·다크모드·…는 없다" · `@custom-variant dark` 경고.
  갱신은 tasks의 정본 갱신 태스크가 든다(이 스킬은 정본을 직접 고치지 않는다).
- 코어 설계 원칙(ARCHITECTURE §0)과 무관하다 — push·pull·export에 닿지 않는다.

## 문제 (관측된 사실 — 2026-10-04 재측정)

- 화면이 라이트 하나다. `app/globals.css`의 `:root` 하나에 값이 있고, `.dark` 블록도 테마 선택도 없다.
- 토큰(`--…` 선언)은 **73개**다. 그중 색은 `:root`의 18개 + `@theme inline`의 별칭(`--color-link` → `blue-600`, `gray-light/dim/strong` →
  `neutral-300/400/600`)과 리터럴 그림자 둘(`--shadow-low/medium`의 `rgb(22 24 27 / …)`)이다.
- **화면 소스의 raw 팔레트 클래스는 22종 · 41곳 · 18파일**(`.tsx`, 테스트·주석 제외, 수식어 벗김 — `visual-system.test.ts`의 `hits(RAW_COLOR)` 그대로) + `components/ui/tone.ts`의 hue 8종이다.
  전부 DESIGN §6.2에 등재돼 `visual-system.test.ts`의 `REGISTERED`가 자리까지 고정한 값이다 — 미등재 raw는 0이다.
- **화면 소스의 hex 리터럴은 코드에 4곳뿐**이다 — `components/signin/brand-icons.tsx`의 Google 로고 4색(남의 자산, §6.2 "규칙 밖").
  나머지 hex는 전부 주석·이슈 번호(`#103`)다. 임의값 안 hex·rgba는 이미 0으로 고정돼 있다(`visual-system.test.ts`).
- raw 색은 **값이 아니라 의미로 쓰인다** — amber = 경고, green = 성공, red-700 = diff 삭제, blue/teal/violet = Logs 종류 칩,
  hue 8 = 프로젝트·사람 식별색. 그런데 이름이 값(`amber-800`)이라 다크 값을 걸 자리가 없다.
- `--foreground` 알파 관용구(`bg-/text-/border-/ring-foreground/…` 약 53곳)는 테마를 따라 자연히 뒤집히지만, **그중 셋은 의미가 "어둡게 덮기"**다
  (`dialog.tsx:160` `/40` · `large-modal.tsx:13` 상수 `/32`(렌더 자리는 large-modal·dialog·`logs/event-dialog`) · 랜딩 `mockup/app-frame.tsx:123`) — 다크에서 뒤집히면 화면이 밝게 덮인다.
- 화면 밖 자산: 로고 `malmoi-icon-black.svg`(7곳 import, `#090B0C` 면 — 반전판 `malmoi-icon-white.svg`가 이미 `public/brand/`에 있다) · 에이전트 로고(`openai.svg`는 검정 마크 — 공식 배포본 무변형 규정) ·
  로그인 키비주얼 PNG 넷 · 국기 SVG · 가이드 스크린샷(`public/guide/`, 라이트 촬영) · 초대 메일 HTML(`color-scheme: light` 메타 고정) ·
  사용자가 올린 프로젝트 썸네일(`lib/upload/normalize.ts`가 알파를 보존하고 `ui/image-tile.tsx`에 바탕면이 없다).
- 토스트(sonner)는 `app/layout.tsx`가 `theme="light"`로 고정한다. sonner CSS는 레이어 없이 주입돼 `@layer utilities`의 `classNames`(`bg-background` 등)를 이긴다 —
  DESIGN §6.25의 "토큰에 묶는다"는 라이트에서 값이 우연히 같아 드러나지 않았을 뿐이다.

## 결정 (2026-10-04 사용자 확정)

| 항목 | 결정 |
|---|---|
| 기능 분할 | **한 기능, 단계 둘** — Phase 1 의미 토큰 정의 + 이관(라이트 화면 변화 0, 단독으로 dev 배포) · Phase 2 다크 값 + 선택 UI. 토큰 이름이 "다크 값이 필요한 의미 단위"로 정해져야 하므로 설계를 한 곳에 둔다 |
| 선택지 | **System · Light · Dark** |
| 기본값 | **Light** — 고르기 전에는 지금 화면 그대로다. ui-locales의 "처음 온 사용자는 항상 영어(자동 감지 없음)"와 같은 결이다. System을 고른 사람만 OS를 따른다 |
| Phase 1 단독 가치 | **있다** — Phase 2가 늦어지거나 취소돼도 `REGISTERED` 수동 표가 사라지고, 새 화면의 색 선택이 "의미 토큰 고르기"로 단순해진다. 그래서 Phase 1은 단독으로 dev에 나간다 |
| 폴백 순서 | **계정(`User.colorScheme`) > 기기 쿠키(`malmoi-color-scheme`) > `light`** — ui-locales와 같은 층. ⚠️ user-timezone은 쿠키 층 없이 계정 하나다 — 여기 쿠키 층이 있는 근거는 **완료 조건 10(로그아웃 뒤 공개 페이지·로그인 화면에 같은 테마)** 하나다 |
| 적용 범위 | **앱 + 공개 페이지 전부**(랜딩·`/docs`·`/privacy`·`/changelog`·`/signin`·초대·OAuth 동의). 같은 토큰이 모든 화면을 칠한다 |
| 전환 자리 | **`/preferences`만**. 공개 푸터에 스위처를 두지 않는다 — 비로그인 방문자는 이전에 로그인해 고른 기기 쿠키가 있을 때만 다크를 본다 |
| 토스트 | **sonner 변수(`--normal-bg/border/text`)를 우리 토큰에 묶고 `theme`에 고른 값을 넘긴다** — sonner 내장 다크(`#000` 면)를 쓰지 않는다. 라이트의 "우연히 같은 값"도 같이 바로잡는다 |
| 식별색 대비 | **아바타 이니셜(13px 글자)은 수용 예외**로 수치와 함께 DESIGN에 등재 · 썸네일 글리프는 비텍스트 3:1 쌍. 값은 바꾸지 않는다(라이트 변화 0) — 흰 글자/hue-600이 8개 중 5개 4.5 미만(amber 3.19 · orange 3.56 · teal 3.74 · emerald 3.77 · sky 4.10) |
| 다크 값의 출처 | **Claude Design 다크 시안 → `/design-sync`**. spec의 토큰 표(의미 · 라이트 값 · 다크 후보)를 시안 입력으로 주고, 시안이 값을 확정한다. 기존 화면이라 design-sync의 "신규 페이지 초기 구현만" 규칙의 **사용자 승인 예외**다 |

## 완료 조건 (검증 가능한 문장)

`[자동]`은 `pnpm test`·`pnpm typecheck`가, `[수동]`은 `/runtime-test`·`/design-sync`가 판정한다.

### Phase 1 — 의미 토큰 (라이트 화면 변화 0)

1. `app/`·`components/`·`lib/`·`messages/`의 생산 소스(`.tsx`·`.ts`)에 **Tailwind raw 팔레트 클래스가 0곳**이다(`REGISTERED`가 빈 표가 되어 지워지고, 0을 세는 검사가 그 자리를 잇는다). `[자동]`
2. 생산 소스의 색 리터럴(hex·`rgb()`·`hsl()`)은 **등재된 남의 자산만** 남는다 — Google 로고 4색(`brand-icons.tsx`) · 초대 메일(`lib/invitation-email/`, 라이트 고정) · Phase 2부터 OpenAI 로고 흰 판(design §3.5 — 2026-10-05 시안 확정). `[자동]`
3. `app/globals.css`의 `@theme inline`이 팔레트(`--color-<hue>-<n>`)를 별칭으로 들지 않는다 — 모든 색 유틸의 값은 `:root` 변수에서 온다. 그림자 둘도 변수를 지난다. `[자동]`
4. 이관 전후 **라이트의 계산된 색이 같다** — 새 토큰의 라이트 값은 옮겨 온 raw 값과 같은 색이다(알파 포함). `[자동]`은 **토큰 값**만 본다(토큰 표의 "옮겨 온 값" 열을 테스트가 `globals.css`와 대조). **자리별 정합**(예: `amber-700` 자리에 `amber-800` 토큰을 붙인 오매핑)은 `[수동]` — 이관 전에 캡처한 대표 화면 computed style 표본과 대조한다
5. 오버레이(어둡게 덮기) 자리는 `--foreground` 알파가 아니라 전용 토큰(`scrim`)을 쓴다. `[자동]`

### Phase 2 — 컬러 스킴

6. 쿠키도 계정 값도 없는 방문자는 지금과 같은 라이트를 본다 — OS가 다크여도 같다. `<html data-theme="light">`. `[자동]` 판정 · `[수동]`
7. 로그인한 사용자가 `/preferences`에서 Dark를 고르면 **새로고침 없이** 앱 전체가 다크로 다시 그려지고, 다른 기기에서 로그인해도 다크다(계정이 쿠키를 이긴다). `[자동]` 판정·쓰기 계획 · `[수동]`
8. System을 고르면 OS 설정을 따르고, **OS 설정을 바꾸면 새로고침 없이 따라간다**(CSS만으로 — 단 로그인 Canvas 점은 `matchMedia` `change` 구독으로 다시 읽는다). `[수동]`
9. 첫 페인트부터 고른 테마다 — 라이트가 잠깐 보였다가 다크로 바뀌지 않는다(서버가 `<html>` 속성을 지정하고, 인라인 스크립트를 쓰지 않는다). `[수동]`
10. 로그아웃한 뒤에는 그 기기의 쿠키 값이 공개 페이지·로그인 화면에 적용된다. `[자동]` 판정 · `[수동]`
11. 쿠키·DB에 지원하지 않는 값(`blue`, `__proto__`, 빈 문자열)이 있으면 다음 층으로 넘어가고 화면이 깨지지 않는다. `[자동]`
12. **두 테마 모두에서** 본문 글자 토큰이 그것을 받는 표면 위에서 AA(4.5:1)를 넘는다 — 쌍 목록(design §4.4)을 테스트가 계산한다. 예외는 DESIGN에 등재된 수용 결정 다섯뿐이다 — 포커스 링 2.54:1 · 붉은 면 위 버튼 글자 약 4.3:1 · `muted` 면 위 `muted-foreground` 4.34:1 · 식별색 위 아바타 이니셜(라이트 최저 3.19:1) · `gray-dim` 보조 글자(흰 면 2.58:1 · canvas 2.39:1 — DESIGN §6.2, 본문에 쓰지 않는 자리. 2026-10-05 사용자가 다섯째로 확정). 다크에서도 같은 자리만 예외이고, 예외 상수는 수치와 DESIGN 절을 같이 든다. `[자동]`
13. 네이티브 컨트롤(스크롤바·체크박스·`<select>` 목록·자동완성 배경)이 테마를 따른다 — `color-scheme` 속성이 `<html>`에 걸린다. `[수동]`
14. 로고·에이전트 로고가 다크 표면 위에서 보인다(검정 마크가 검정 면에 묻히지 않는다). `[수동]`
15. `dark:` 유틸은 여전히 0곳이다 — 테마는 토큰이 들고 컴포넌트는 테마를 분기하지 않는다. `@custom-variant dark` 줄도 남는다. `[자동]`
16. `/privacy`가 새 쿠키와 `User.colorScheme`을 말하고 개정 이력이 붙는다(en·ko 두 본 — ui-locales의 동형 게이트). `[자동]`
17. 라이트로 고정되는 표면은 바뀌지 않는다. `[자동]` 소스 검사 셋: 초대 메일의 `color-scheme: light` 메타 · `lib/invitation-email/`의 hex 그대로 · `app/global-error.tsx`가 `globals.css`를 import하지 않고 `data-theme`이 없다(브라우저 기본 라이트). OG `public/og.png`·가이드 스크린샷은 파일을 건드리지 않는 것이라 검사 대상이 아니다.
18. 전 화면 × **Light · Dark · System(OS 다크)** 셋을 `/runtime-test`가 보고, 다크 시안 대상 화면은 `/design-sync`가 computed style로 대조한다. `[수동]`
19. 토스트가 고른 테마의 토큰 면·테두리·글자로 그려진다(sonner 내장 팔레트가 아니다). `[수동]` computed style

## 비목표

- **공개 푸터 스위처** — 사용자 결정. 비로그인 방문자에게 테마를 고르게 하지 않는다.
- **System이 기본값** — 사용자 결정. OS 다크 방문자의 첫인상을 바꾸지 않는다.
- **세 번째 이상의 테마**(고대비·세피아·브랜드 테마)·**사용자 정의 색**.
- **다크 가이드 스크린샷** — 가이드 이미지는 라이트 한 벌이다. 다크 화면에서 가이드를 읽으면 그림만 라이트다 — **수용한 대가다**(ui-locales의 en 공유 스크린샷과 같은 결). **이번엔 안 하고, 후속 이슈로도 올리지 않는다**(2026-10-05 사용자 — 나중에 할지는 열려 있다).
  테두리도 지금 처리(`border-border-subtle` 1px · radius 8 · `shadow-low`)를 그대로 쓴다 — 다크에서 흰 그림이 스스로 경계를 만든다(2026-10-05 사용자, design §3.5).
- **새 래스터 자산 제작** — 다크 키비주얼 PNG 네 장. 라이트 그림이 다크 패널 위에 놓이는 것을 수용한다. **이번엔 안 하고, 후속 이슈로도 올리지 않는다**(2026-10-05 사용자 — 나중에 할지는 열려 있다. 시안 A13이 "카드 안 회색 선이 다크 패널과 안 맞는다"고 짚었어도 같다).
- **투명 프로젝트 썸네일의 다크 처리** — 사용자가 올린 투명 PNG(검정 로고 등)는 다크 면에서 묻힐 수 있다. 수용한 대가다(2026-10-04 리뷰).
- **초대 메일 다크** — 받는 사람의 테마를 모르고, 메일 클라이언트의 강제 반전은 막지 못한다(DESIGN §6.625). `color-scheme: light` 메타 그대로.
- **OG 이미지·파비콘 테마 분기** — 크롤러·브라우저 크롬이 보는 자산이다.
- **로그인할 때 쿠키 값을 계정으로 옮기기** — ui-locales와 같은 판정(계정이 비면 쿠키가 폴백이라 결과가 같다).
- **다른 탭의 테마 동기화** — 다음 내비게이션·새로고침에서 풀린다(ui-locales와 같은 수용).
- **`<meta name="theme-color">`** — 모바일 브라우저 크롬 색. 앱이 데스크톱 전제(`min-w-shell-min` 1280)라 소비자가 없다.
- **Phase 1에서 화면 모양 바꾸기** — 정리는 이름만 바꾼다. 값·톤의 재판정은 Phase 2 시안이 한다.
