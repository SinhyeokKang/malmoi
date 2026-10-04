# color-scheme — 설계

## 0. 이름

| 무엇 | 식별자 |
|---|---|
| 지원 집합 | `COLOR_SCHEMES = ["system", "light", "dark"] as const`, `type ColorScheme` |
| DB 컬럼 | `User.colorScheme String?` |
| 쿠키 | `malmoi-color-scheme` |
| `<html>` 속성 | `data-theme="system" \| "light" \| "dark"` — 클래스가 아니라 속성이다(§3.1 — `.dark` 클래스는 `@custom-variant`가 쥐고 있다) |
| 모듈 | `lib/color-scheme/scheme.ts`(잎, 순수) · `lib/color-scheme/server.ts`(`server-only`) |
| 화면 라벨 | Preferences의 `Theme` 카드 — 옵션 `System` · `Light` · `Dark` |

`theme`라는 낱말은 Tailwind `@theme`과 겹쳐 grep이 섞인다 — 식별자는 `colorScheme`, 화면 라벨만 `Theme`이다.
`data-theme`은 HTML 관용 속성명이라 예외로 둔다.

## 1. 영향 받는 흐름

- **push / pull / export: 영향 없다.** 색은 화면에만 있다.
- **편집 UI 전체 + 공개 셸 + 셸 밖 골격(로그인·초대·OAuth 동의)**: 같은 토큰이 칠한다. 컴포넌트는 테마를 분기하지 않는다.
- **Phase 1**: 클래스 이름만 바뀐다(raw → 의미 토큰). 값은 그대로다.
- **Phase 2**: `app/globals.css` 값 · 루트 레이아웃 `<html>` 속성 · `/preferences`의 Theme 카드 · 새 Server Action 1 · 스키마 1 · 방침.

## 2. Phase 1 — 의미 토큰 정의 + 이관

### 2.1 원칙

- **토큰 하나 = 다크에서 값이 따로 필요할 수 있는 의미 하나.** 라이트 값이 같아도 의미가 다르면 나눈다(`info-surface`와 Logs `kind-blue-surface`는 둘 다 `blue-50`이다).
- **라이트 값은 옮겨 온 raw 값을 그대로 참조한다** — `:root`에서 `var(--color-amber-800)`처럼 Tailwind 팔레트 변수를 가리키고,
  알파가 박혀 있던 값은 `color-mix(in oklab, var(--color-amber-100) 80%, transparent)`로 같은 색을 만든다. 손으로 hex를 옮기지 않는다 —
  Tailwind v4 팔레트는 oklch라 hex 사본은 반올림만큼 어긋난다(완료 조건 4가 "같은 색"이다).
- **`@theme inline`은 `--color-<name>: var(--<name>)` 등록만 든다.** 지금의 팔레트 별칭 넷(`link`·`gray-light/dim/strong`)은 `:root` 변수로 내려간다 — `@theme`에 값이 있으면 Phase 2에서 다크 값을 걸 자리가 없다.
- ⚠️ **`:root`에서 Tailwind 팔레트 변수를 참조할 때 그 변수가 출력되는지** 먼저 확인한다(tasks P1-0 스파이크). Tailwind v4는 쓰인 테마 변수만 내보낸다 — 지금의 `--color-link: var(--color-blue-600)`이 동작하는 근거와 같은지 빌드 CSS로 본다. 안 나오면 `@theme`에 `static`을 쓰는 대신 그 값만 `@theme inline reference` 등 공식 경로로 고정하고, 그 판정을 이 절에 적는다.

### 2.2 토큰 표 (Phase 1 산출물 · Phase 2 시안 입력)

"다크 후보"는 시안 브리프의 출발점일 뿐이다 — 확정은 Phase 2 시안이 한다(spec 결정).

| 새 토큰 | 의미 | 옮겨 온 raw 값 (라이트) | 소비 자리 (2026-10-04) | 다크 후보 |
|---|---|---|---|---|
| `success-surface` | 성공 Alert 면 | `green-50` | `ui/alert.tsx` | 초록 알파 면 |
| `success-soft` | 성공 알약·칸 면 | `green-100/80` | `ui/badge.tsx` `soft-green` · `ui/icon-tile.tsx` | 초록 알파 면 |
| `success-foreground` | 성공 면 위 글자·글리프 · diff `+` | `green-800` | badge · icon-tile · alert 글리프 · `publish-button.tsx` · 랜딩 `mockup/publish.tsx` | 밝은 초록(green-300·400 대) |
| `warning-surface` | 경고 Alert 면 | `amber-50` | `ui/alert.tsx` | 호박 알파 면 |
| `warning-soft` | 경고 알약·칸 면 | `amber-100/80` | badge `soft-amber` · icon-tile | 호박 알파 면 |
| `warning-soft-foreground` | 경고 면 위 글자 | `amber-800` | badge · icon-tile · `ui/row-card.tsx` | 밝은 호박 |
| `warning-foreground` | 흰 표면 위 경고 글자·글리프 (`Needs review`·`Not saved`·미저장 수) | `amber-700` | `home/count-cards.tsx` · 번역 `key-list`·`locale-panel`·`workspace` · `publish-button.tsx` · alert 글리프 · 랜딩 `mockup/translations.tsx` | 밝은 호박 |
| `warning-emphasis` | 경고 막대 · 대기 테두리(`/50`) | `amber-500` | `ui/meter.tsx` · `sources/base-language-form.tsx`(`border-warning-emphasis/50`) | 호박 그대로 또는 한 단계 |
| `danger-surface` | 실패 Alert 면 | `red-50` | `ui/alert.tsx` | 빨강 알파 면 |
| `info-surface` | 정보 Alert 면 | `blue-50` | `ui/alert.tsx` | 파랑 알파 면 |
| `diff-removed` | diff 삭제 글자 · 삭제 낱말 면(`/[0.14]`) | `red-700` | `publish-button.tsx` · 랜딩 `mockup/publish.tsx` | 밝은 빨강 |
| `diff-added` | diff 추가 낱말 면(`/[0.16]`) | `green-800` | 같은 둘 | 밝은 초록 |
| `kind-blue-surface` · `kind-blue` | Logs 종류 칩 면·글자 | `blue-50` · `blue-700` | `logs/glyph.tsx` | 알파 면 · 밝은 글자 |
| `kind-teal-surface` · `kind-teal` | 〃 | `teal-50` · `teal-700` | `logs/glyph.tsx` | 〃 |
| `kind-violet-surface` · `kind-violet` | 〃 | `violet-50` · `violet-700` | `logs/glyph.tsx` | 〃 |
| `subtle` | 흰 카드 안 한 단계 꺼진 면(Logs 상세의 비어 있는 값 상자) | `neutral-50` | `logs/event-detail.tsx` 둘 | `--background`보다 한 단계 밝은 면 |
| `hue-rose` … `hue-fuchsia` (8) | 프로젝트·사람 **식별색**(이름 해시) | `rose-600` … `fuchsia-600` | `ui/tone.ts` | 같은 hue — 다크 표면 위 대비만 확인 |
| `on-hue` | 식별색 위 글자·글리프 | `white` | `ui/avatar.tsx` · `ui/project-thumbnail.tsx` | `white` |
| `scrim` | 오버레이(어둡게 덮기) — `/32`·`/40`으로 쓴다 | `--foreground` 값 | `ui/dialog.tsx` · `ui/large-modal.tsx` 둘 · 랜딩 `mockup/app-frame.tsx` | 검정 그대로(다크에서도 어둡게 덮는다) |
| `shadow-color` | elevation 둘의 그림자 색 | `rgb(22 24 27)` (`--shadow-low/medium` 리터럴) | `@theme`의 그림자 둘 | 검정 · 알파 상향 |
| `link` · `gray-light` · `gray-dim` · `gray-strong` | (기존 별칭 — `@theme` → `:root`로 이동) | `blue-600` · `neutral-300/400/600` | 기존 그대로 | 밝은 파랑 · 무채 계단 반전 |

**옮기지 않고 접는 것**: `bg-white`(`signin/auth-layout.tsx`의 로그인 패널) → `bg-background`(같은 `#fff` — 그 패널은 "배경 위 흰 카드"라는 의미가 `background`다).

**그대로 두는 남의 자산**(완료 조건 2): Google 로고 4색(`signin/brand-icons.tsx`) · 초대 메일 hex(`lib/invitation-email/` — 라이트 고정, 다크 비목표).

**`--foreground` 알파 관용구는 옮기지 않는다** — `bg-foreground/[0.03]`(hover) · `/[0.07]`(선택) · `text-foreground/60` 등 약 60곳은
"표면 위에 글자색을 얇게 깐다"는 뜻이라 다크에서 밝게 까는 것이 맞다. 의미가 "어둡게 덮기"인 넷만 `scrim`으로 간다(위 표).
`bg-background/20`·`/50`(목업·Publish·내비게이션 dim)은 "표면색으로 흐리기"라 그대로다. 판정이 갈리는 자리가 Phase 2 시안에서 나오면 그때 토큰을 늘린다.

### 2.3 Tailwind 철자

`@theme inline`에 `--color-success-soft: var(--success-soft)` 꼴로 등록하면 `bg-success-soft`·`text-success-foreground`·`border-warning-emphasis/50`이 생긴다.
⚠️ **등록을 빠뜨리면 유틸이 조용히 생성되지 않는다**(globals.css 머리 주석 — 8-1b가 실제로 그렇게 나갔다). 그래서 테스트가 `:root`의 색 변수마다 `@theme` 등록을 센다(tasks P1-1).

### 2.4 테스트 — `REGISTERED`가 0을 세는 검사로 바뀐다

- `components/__tests__/visual-system.test.ts`의 `REGISTERED`는 표가 비면 지운다. 대신 **"raw 팔레트 클래스 0"** 검사가 같은 `hits(RAW_COLOR)`로 생산 소스 전수를 센다. 카나리아(`found.length > 50`)는 픽스처 문자열에 대한 카나리아로 바꾼다 — 실제 소스에서 0이 정답이므로.
- **색 리터럴 허용 목록**(완료 조건 2): `brand-icons.tsx`·`lib/invitation-email/**` 둘. 그 밖의 hex·`rgb(`·`hsl(`·`oklch(`는 생산 소스에서 0 — 주석을 벗기고 센다(`globals-css.test.ts`의 `consumingSource`와 같은 방식).
- **토큰 표 대조**(완료 조건 4): 표의 "옮겨 온 값"을 테스트 상수(`[token, "var(--color-amber-800)"]` 꼴)로 두고 `globals.css`의 라이트 값과 문자열 대조한다. 이 상수가 Phase 2에서 라이트 쪽 값 회귀를 막는다.
- `status-badge.test.tsx`·`badge`·`icon-tile`·`alert`의 클래스 리터럴 기대값을 새 철자로 고친다 — 클래스 이름만 바뀌므로 DOM 구조 기대는 그대로다.

## 3. Phase 2 — 컬러 스킴

### 3.1 CSS 메커니즘 — `light-dark()` + `color-scheme`

```css
:root                     { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }
:root[data-theme="system"]{ color-scheme: light dark; }

:root {
  --background: light-dark(hsl(0 0% 100%), <다크>);
  --warning-soft: light-dark(color-mix(in oklab, var(--color-amber-100) 80%, transparent), <다크>);
  /* … 모든 색 변수가 한 줄씩 */
}
```

- **색 변수 하나가 한 줄이다** — `[data-theme=dark]` 블록과 `@media (prefers-color-scheme: dark)` 안의 System 블록에 다크 값을 두 벌 적는 형을 기각한다(한 벌만 고치면 System 다크와 명시 다크가 조용히 갈린다).
- `color-scheme`이 `<html>`에서 상속되므로 네이티브 컨트롤·스크롤바·자동완성 면도 함께 바뀐다(완료 조건 13). System은 `light dark`라 OS 변경을 **CSS만으로** 따라간다(완료 조건 8 — JS 없음).
- **인라인 스크립트가 없다** — 서버가 `data-theme`을 정해 첫 HTML에 싣는다. 쿠키를 읽어 서버가 렌더하므로 깜빡임이 없고, CSP nonce에 새 스크립트를 들이지 않는다(완료 조건 9).
- ⚠️ **`light-dark()`는 색만 받는다.** 색이 아닌 테마 값(로고 `filter` 등 — §3.5)은 `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark) { :root[data-theme="system"] }` 두 블록에 둔다. 그런 값이 셋을 넘으면 설계를 다시 본다.
- ⚠️ **스파이크로 먼저 확인한다**(tasks P2-0): ① Tailwind v4의 알파 수정자(`bg-success-soft/50` → `color-mix(in oklab, var(--…) 50%, transparent)`)가 `light-dark()` 값을 받는가 ② `color-mix()` 안 `var(--color-amber-100)`가 든 `light-dark()`가 지원 브라우저에서 계산되는가 ③ `getComputedStyle`이 사용자 정의 속성에서 무엇을 돌려주는가(아래 Canvas). 하나라도 깨지면 두 벌 블록 형으로 내려가고, 두 벌이 같은 토큰 집합인지를 테스트가 센다.
- 지원 하한: `light-dark()`는 Chrome 123 · Safari 17.5 · Firefox 120(2024 Baseline). 이 앱의 대상(데스크톱 최신 브라우저)에서 문제가 없다고 보고, 옛 브라우저에서는 선언이 무효가 되어 **변수가 비고 색이 사라진다** — 그래서 하한을 DESIGN §3에 적는다.

### 3.2 `@custom-variant dark` — 남긴다, `dark:` 금지도 남긴다

테마는 **토큰이 든다.** 컴포넌트가 `dark:`로 분기하기 시작하면 다크 값의 집이 `globals.css`와 수십 개 컴포넌트로 갈린다.
그래서 DESIGN §3의 규칙은 "라이트 단일"에서 **"다크는 토큰 값이 든다 — `dark:` 유틸 금지"**로 바뀌고, 강제 장치는 그대로다:

- `@custom-variant dark (&:is(.dark *));` 줄은 남는다 — `.dark` 클래스를 DOM 어디에도 붙이지 않으므로(`data-theme` 속성을 쓴다) `dark:`는 계속 무효다.
- `globals-css.test.ts`의 리터럴 고정은 그대로 두고, **`dark:` 0곳 소스 검사**를 더한다(지금은 문서 주장뿐이다 — 완료 조건 15).
- CLAUDE.md 스택 절 경고의 문장("그 줄을 지우면 OS 다크에서 살아난다")은 여전히 참이다 — 근거만 "라이트 고정"에서 "토큰 단일 출처"로 바뀐다.

### 3.3 판정 — 순수 함수 (`/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `parseColorScheme(raw: unknown): ColorScheme \| null` | `lib/color-scheme/scheme.ts` (잎) | 지원 집합 안의 문자열만 통과. **`Object.hasOwn`으로 판정**(`__proto__`·`constructor`·`toString` 불통과 — 쿠키는 남이 정한 값이다). 정규화 없음 |
| `resolveColorScheme({ account, cookie }): ColorScheme` | 같은 파일 | `parseColorScheme(account) ?? parseColorScheme(cookie) ?? "light"`. **OS 설정은 입력에 없다** — 서버는 모르고, System의 해석은 CSS가 한다 |
| `planColorSchemeWrite({ signedIn }): { cookie: true; account: boolean }` | 같은 파일 | ui-locales `planUiLocaleWrite`와 같은 규칙 — 쿠키는 항상, 계정은 로그인 시. 로그아웃 뒤 공개 페이지가 같은 테마를 보게 하려고 로그인 중에도 쿠키를 쓴다 |

ui-locales의 `parseUiLocale`·`resolveUiLocale`·`planUiLocaleWrite`, user-timezone의 같은 꼴과 **모양이 같지만 합치지 않는다** — 값 집합·기본값·검증(타임존은 IANA)이 다르고, 공통 "설정 저장소" 추상화는 ui-locales spec이 금지한 선반영이다. 착수 시점에 세 벌이 실제로 같은 코드라면 그때 `/refactor` 후보로 적는다.

테스트 전용 순수 헬퍼(`lib/color-scheme/__tests__/helpers/`) — 완료 조건 12의 대비 검사용:

| 헬퍼 | 계약 |
|---|---|
| `readThemeTokens(css, tailwindTheme): { light: Record<string, Rgba>; dark: Record<string, Rgba> }` | `:root`의 `light-dark(a, b)`를 두 값으로 가르고, `var(--color-…)`를 Tailwind `theme.css`의 oklch에서, `color-mix(in oklab, X p%, transparent)`를 알파로 푼다 |
| `oklchToSrgb(l, c, h): Rgb` | CSS Color 4 변환. 기대값은 Tailwind 문서의 hex(예: `amber-800` = `#92400e`)로 고정한다 |
| `contrastRatio(fg: Rgba, bg: Rgb): number` | WCAG 2.x 상대 휘도. 알파가 있는 전경·면은 바닥 면 위에 합성한 뒤 잰다 |

대비 쌍 목록(§4.4)은 테스트 상수다. 지금 리포에 대비 계산 코드가 없어 DESIGN의 대비 수치(§2.2 4.75:1 · §2.3 4.83:1 · 링 2.54:1)가 손으로 잰 값이다 — 이 헬퍼가 그 수치를 라이트에서 먼저 재현하는지로 헬퍼를 검증한다.

### 3.4 서버 — 요청당 한 번

- `getColorScheme()`(`lib/color-scheme/server.ts`, `server-only`, React `cache`): 입력은 `readSession()`의 `colorScheme` + `cookies()`의 `malmoi-color-scheme`, 판정은 `resolveColorScheme`. ui-locales `getUiLocale()`과 같은 형.
- 루트 레이아웃(`app/layout.tsx`)이 `<html data-theme={await getColorScheme()}>`를 단다. 루트 레이아웃은 이미 CSP nonce·`lang` 때문에 동적이라 새로 동적이 되는 페이지가 없다.
- ⚠️ **소비자는 루트 레이아웃 하나다.** ui-locales가 "레이아웃이 흘려보내지 않고 소비자마다 묻는다"(POSTMORTEM 2026-08-31)를 택한 것은 페이지가 문구를 직접 읽어야 해서였다. 테마는 CSS가 `<html>` 속성 하나로 읽으므로 컴포넌트가 물을 일이 없다 — 클라이언트 훅·provider를 만들지 않는다(선반영 금지). 예외는 §3.5의 Canvas 하나이고 그것도 DOM에서 읽는다.
- `global-error.tsx`는 루트 레이아웃 밖이라 `data-theme`이 없다 → `:root` 기본 `color-scheme: light`로 라이트다(완료 조건 17).

### 3.5 화면 밖 자산

| 자산 | 다크에서 | 근거 |
|---|---|---|
| 로고 `malmoi-icon-black.svg`(7곳 import + JSON-LD) | **화면은 `-white` 판으로 바꾼다** — 이미 `public/brand/malmoi-icon-white.svg`가 있다(같은 도형, 면·마크 반전). 바꾸는 법: 두 `<Image>`를 함께 두고 `globals.css`의 테마 선택자(§3.1의 비색 값 블록)가 하나를 숨긴다. 7곳이 같은 형이면 `components/ui/`에 `BrandLogo`로 모은다(실재하는 사본 이관 — UI primitives first). JSON-LD의 `logo`는 크롤러용이라 그대로 | 검정 면(`#090B0C`)이 다크 캔버스에 묻힌다 |
| 에이전트 로고 `openai.svg`(검정 마크) | **공식 배포본의 흰 판을 추가한다**(변형이 아니라 두 번째 공식 파일 — `lib/mcp/brand.ts` 머리 주석의 무변형 규정을 지킨다). Claude 로고(`#D97757`)는 그대로 | 검정 마크가 다크 면에서 사라진다 |
| 로그인 키비주얼 PNG 넷(`malmoi-kv-1..4`) | **그대로**. 라이트 카드 그림이 다크 패널 위에 놓인다 — 시안이 판정한다(바꾸면 다크 PNG 네 장 제작) | 사진 같은 자산이라 토큰으로 못 바꾼다 |
| 로그인 Canvas 점(`--signin-dot`) | ⚠️ `dot-field.tsx:66`이 `getComputedStyle(canvas).getPropertyValue("--signin-dot")`를 읽는다 — 사용자 정의 속성은 **선언 문자열**(`light-dark(…)`)이 그대로 오고 Canvas `fillStyle`은 그것을 모른다. **`color: var(--signin-dot)`을 단 요소의 계산된 `color`를 읽도록** 바꾼다(브라우저가 `light-dark`를 풀어 준다). System이면 `matchMedia("(prefers-color-scheme: dark)")`의 `change`에서 다시 읽는다(완료 조건 8). 로그인 화면엔 Preferences가 없어 `data-theme`이 그 화면에서 바뀌는 경로는 없다 | |
| 국기 SVG(`public/flags/`) | 그대로 | 국기는 국기다 |
| 가이드 스크린샷(`public/guide/`) | 그대로(라이트) — spec 비목표 | |
| 초대 메일 | 그대로(`color-scheme: light` 메타) — spec 비목표 | |
| OG `og.png`·파비콘 `app/icon.svg` | 그대로 — spec 비목표 | |
| 랜딩 목업(`components/landing/mockup/*`) | 토큰으로 칠해지므로 **자동으로 다크**다. 목업 안의 diff·경고 색도 Phase 1에서 토큰이 된다 | 실제 제품 화면을 흉내 내므로 제품과 같이 바뀌는 것이 맞다 |

### 3.6 바꾸기 — `setColorScheme` Server Action

- 위치: **`app/(edit)/preferences/actions.ts`** — 부르는 곳이 `/preferences` 하나뿐이다(공개 스위처 없음, spec 결정). ui-locales의 `app/ui-locale/`과 다른 이유가 이것이다.
- 입력 `colorScheme` 하나 → `parseColorScheme` 불통과면 `invalid`.
- 처리 순서(ui-locales §4와 같다): ①`requireUser`/`readSession()` ok → **세션의 `userId`로** `User.colorScheme` 갱신(입력 userId 없음) → ②쿠키 `malmoi-color-scheme`(`httpOnly` · `SameSite=Lax` · `Secure` · `Path=/` · 1년) → ③`revalidateAfterCommit("/", "layout")`.
  ①이 실패하면 아무것도 쓰지 않고 `failed`(쿠키만 쓰면 다음 렌더에서 계정의 옛 값이 이겨 조용히 되돌아간다).
- 결과는 코드(`ok`·`invalid`·`failed`)다. `ProjectEvent`를 남기지 않는다.

### 3.7 화면 — Preferences의 Theme 카드

- 위치: Language 카드(ui-locales) · Time zone 카드(user-timezone) **뒤**. 형은 Language 카드와 같다 — `Card` + `Select` 하나(옵션 셋) · 라벨 열 없음 · `aria-labelledby` 카드 제목 · 폭 320 · **고르는 즉시 적용**(DESIGN §6.4에 ui-locales가 등재하는 즉시 적용 예외에 이 카드를 더한다) · 닫힌 트리거 typeahead 차단 · `RoleSelect` 가드(busy) · 낙관적 표시 · 실패는 `Card notice`의 `Alert danger inset`.
- 옵션 앞 글리프: `Monitor` · `Sun` · `Moon`(lucide 16). 도움말 한 줄: System은 "기기 설정을 따른다".
- 문구는 `messages/{en,ko,es}.tsx`에 같은 커밋으로 넣는다(ui-locales 사전 정합 테스트가 빠진 키를 typecheck로 잡는다). 용어: en `Theme`·`System`·`Light`·`Dark` / ko `테마`·`시스템`·`라이트`·`다크` / es `Tema`·`Sistema`·`Claro`·`Oscuro` — DESIGN §10.1 ko·es 열에 등재.
- 시안: Phase 2 다크 시안에 Theme 카드를 포함한다(S 단계).

## 4. 스키마 · 환경변수 · 방침

### 4.1 스키마 — additive

```prisma
model User {
  /// 화면 테마(color-scheme). null = 정하지 않음 → 쿠키 → light. **읽을 때 `parseColorScheme`을 지난다** —
  /// enum으로 두지 않는다(값 하나를 빼는 것이 destructive 마이그레이션이 된다 — `uiLocale`과 같은 이유).
  colorScheme String?
}
```

- `ALTER TABLE "User" ADD COLUMN "colorScheme" TEXT` 1개. dev는 `/push` 전, prod는 `/merge` 1단계. 뒤에 dev·prod `has_schema_privilege` false 확인(`/db` 5단계).
- 봉투를 지나지 않는다(식별 정보가 아니다). `lib/auth/public-session.ts` 허용 목록 · `AdapterUser` · `types/next-auth.d.ts` · `SessionRead` ok 갈래에 `colorScheme`을 더한다 — **추가 쿼리 0**(ui-locales §7과 같은 자리, 같은 네 타입).

### 4.2 새 환경변수

없다.

### 4.3 개인정보 방침

- `lib/privacy/collected.ts`: `User.colorScheme` → `collected`. 쿠키 표에 `malmoi-color-scheme` 한 줄.
- 방침 본문 en·ko 두 벌(ui-locales가 만든 동형 게이트)에 같은 내용 + 개정 이력 한 줄 + 시행일. 새 **목적**(화면 테마 기억)·새 **쿠키** — `/push` 4단계 개인정보 점검 항목이다.
- ui-locales가 고친 "모든 쿠키는 로그인·왕복에 필요하다" 문장이 기능 쿠키를 이미 말하고 있는지 착수 때 본다.

### 4.4 대비 쌍 (완료 조건 12의 입력)

본문 AA(4.5)를 두 테마에서 잰다: `foreground`/`background`·`popover`·`canvas`·`muted` · `muted-foreground`/`background`(⚠️ `muted` 위는 §2.2가 이미 미달로 등재 — 다크에서도 같은 자리만 예외) · `primary-foreground`/`primary` · `destructive`/`background` · `link`/`background` · `success-foreground`/`success-soft`·`success-surface` · `warning-soft-foreground`/`warning-soft` · `warning-foreground`/`background` · `diff-removed`/`background` · `kind-*`/`kind-*-surface` · `on-hue`/`hue-*`.
비텍스트 3:1: `border`/`background`(정보용 경계만) · `ring`/`background`(⚠️ 라이트 2.54 수용 — 다크에서도 수용이면 DESIGN에 다크 수치를 함께 적는다).
수용 예외는 테스트 상수에 **수치와 DESIGN 절**을 같이 적는다 — 근거 없는 예외가 늘지 않게.

## 5. 불변식 영향

- **export 결정성·blob SHA(ARCHITECTURE §1·2)**: 없다.
- **인증 경계(§6·§8)**: `setColorScheme`은 보호 경로 아래 Action이고 쓰는 대상은 세션이 정한다. 쿠키 값은 서버에서만 읽고 `parseColorScheme`을 지난다.
- **CSP**: 인라인 스크립트를 더하지 않는다(§3.1) — 테마 깜빡임 방지 관용구(`<script>`로 `localStorage` 읽기)를 쓰지 않는 것이 이 설계의 요지다.
- **MCP**: 쿠키를 읽지 않는 것은 그대로다(색과 무관).
- **Analytics**: 무관.

## 6. 소환한 과거 함정 (POSTMORTEM · 정본 주석)

| 일자 | 무엇 | 이 설계에서 |
|---|---|---|
| 2026-08-31 | 레이아웃·페이지 병렬 렌더 | 테마는 CSS가 `<html>` 속성에서 읽어 이 문제에 걸리지 않는다 — 컴포넌트가 묻지 않는다(§3.4) |
| 2026-09-10 (`globals.css` 머리 주석, 8-1b) | `:root`에만 변수를 만들고 `@theme` 등록을 빠뜨려 유틸이 생성되지 않았다 | 색 변수마다 `@theme` 등록을 세는 검사(§2.3) |
| 2026-09-11 (`--ring` 주석) | 검사는 green인데 포커스 링이 화면에 안 보였다(1.19:1) | 대비를 계산하는 검사를 두 테마에 건다(§3.3·§4.4) — 이름·존재가 아니라 값을 잰다 |
| 2026-09-17 | 같은 프로젝트 썸네일 색이 화면마다 달랐다 | 식별색은 `hue-*` 토큰 하나 — `tone.ts`만 소비한다 |
| 2026-09-07 | 클라이언트 번들이 grep 패턴 오류로 "안전"으로 읽혔다 | Phase 1의 "raw 0" 검사는 카나리아 픽스처로 검사 자체가 찾는지부터 본다(§2.4) |
| 2026-09-19 · 09-24 (ui-locales §5.2 인용) | 닫힌 Radix Select typeahead · 포커스가 `body`로 빠짐 | Theme 카드는 Language 카드의 가드를 그대로 쓴다(§3.7) |
| 2026-09-20 | 커밋 뒤 캐시 오류가 전체 실패로 보고됐다 | `revalidateAfterCommit`(§3.6) |

## 7. 다른 기능과의 겹침

- **ui-locales**: `app/globals.css`(`:lang(ko)` 규칙) · `/preferences` 페이지·`Card` 형 · `lib/auth/public-session.ts` 허용 목록 · 방침 두 본 · 사전 셋 · 화면 파일 대량 이관(E 배치). Phase 1의 이관 파일(위 표)이 E 배치 파일과 거의 전부 겹친다 → **ui-locales 통합 뒤** 착수.
- **user-timezone**: `/preferences`에 카드를 더하고 `User`에 컬럼을 더한다(같은 허용 목록·같은 방침 절). → **user-timezone 통합 뒤** Phase 2 착수. Phase 1은 user-timezone과 파일이 거의 안 겹치지만 사용자 고정 순서를 따라 그 뒤에 둔다.
