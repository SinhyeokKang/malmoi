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
- **Phase 2**: `app/globals.css` 값 · 루트 레이아웃 `<html>` 속성과 `<Toaster theme>` · `/preferences`의 Theme 카드 · 새 Server Action 1 · 스키마 1 · 방침.

## 2. Phase 1 — 의미 토큰 정의 + 이관

### 2.1 원칙

- **토큰 하나 = 다크에서 값이 따로 필요할 수 있는 의미 하나.** 라이트 값이 같아도 의미가 다르면 나눈다(`info-surface`와 Logs `kind-blue-surface`는 둘 다 `blue-50`이다).
- **라이트 값은 옮겨 온 raw 값을 그대로 참조한다** — `:root`에서 `var(--color-amber-800)`처럼 Tailwind 팔레트 변수를 가리키고,
  알파가 박혀 있던 값은 `color-mix(in oklab, var(--color-amber-100) 80%, transparent)`로 같은 색을 만든다. 손으로 hex를 옮기지 않는다 —
  Tailwind v4 팔레트는 oklch라 hex 사본은 반올림만큼 어긋난다(완료 조건 4가 "같은 색"이다).
- **`@theme inline`은 `--color-<name>: var(--<name>)` 등록만 든다.** 지금의 팔레트 별칭 넷(`link`·`gray-light/dim/strong`)은 `:root` 변수로 내려간다 — `@theme`에 값이 있으면 Phase 2에서 다크 값을 걸 자리가 없다.
- ⚠️ **`:root`에서 Tailwind 팔레트 변수를 참조할 때 그 변수가 출력되는지** 먼저 확인한다(tasks P1-0 스파이크). Tailwind 4.3.3은 테마 밖 선언 값의 `var(`를 `trackUsedVariables`로 "사용됨" 표시하므로 출력될 것으로 보지만(소스 확인, 실측 전), **어느 유틸도 쓰지 않는 팔레트 변수**(예: `--color-lime-300`)를 `:root`에서만 참조해 빌드 CSS로 잰다 — raw 클래스가 살아 있는 상태에서 쓰이는 변수로 재면 유틸 덕분에 나온 것과 구별이 안 돼 거짓 green이다. 안 나오면 폴백은 **`@theme static`**(쓰임과 무관하게 출력)이다 — `@theme reference`는 출력하지 *않는* 옵션이라 폴백이 아니다. 판정을 이 절에 적는다.
  - **판정(2026-10-05, P1-0 스파이크): 출력된다 — `@theme static` 폴백 불필요.** `:root`에 `--x: var(--color-lime-300)` · `color-mix(in oklab, var(--color-lime-200) 80%, transparent)`만 넣고 `pnpm build` → 산출 CSS(`.next/static/chunks/*.css` — 이 리포는 `static/css`가 아니다)에 `--color-lime-300`·`--color-lime-200` 정의가 있었다(hex + `lab()` 두 벌). `color-mix` 값에는 Tailwind가 폴백 + `@supports` 재선언을 붙인다.

### 2.2 토큰 표 (Phase 1 산출물 · Phase 2 시안 입력)

"다크 후보"는 시안 브리프의 출발점일 뿐이다 — 확정은 Phase 2 시안이 한다(spec 결정).

| 새 토큰 | 의미 | 옮겨 온 raw 값 (라이트) | 소비 자리 (2026-10-04) | 다크 후보 |
|---|---|---|---|---|
| `success-surface` | 성공 Alert 면 | `green-50` | `ui/alert.tsx` | 초록 알파 면 |
| `success-soft` | 성공 알약·칸 면 | `green-100/80` | `ui/badge.tsx` `soft-green` · `ui/icon-tile.tsx` | 초록 알파 면 |
| `success-foreground` | 성공 면 위 글자·글리프(**상태 전용**) | `green-800` | badge · icon-tile · alert 글리프 | 밝은 초록(green-300·400 대) |
| `warning-surface` | 경고 Alert 면 | `amber-50` | `ui/alert.tsx` | 호박 알파 면 |
| `warning-soft` | 경고 알약·칸 면 | `amber-100/80` | badge `soft-amber` · icon-tile | 호박 알파 면 |
| `warning-soft-foreground` | 경고 면 위 글자 | `amber-800` | badge · icon-tile · `ui/row-card.tsx` | 밝은 호박 |
| `warning-foreground` | 흰 표면 위 경고 글자·글리프 (`Needs review`·`Not saved`·미저장 수) | `amber-700` | `home/count-cards.tsx` · 번역 `key-list`·`locale-panel`·`workspace` · `publish-button.tsx` · alert 글리프 · 랜딩 `mockup/translations.tsx` | 밝은 호박 |
| `warning-emphasis` | 경고 막대 · 대기 테두리(`/50`) | `amber-500` | `ui/meter.tsx` · `sources/base-language-form.tsx`(`border-warning-emphasis/50`) | 호박 그대로 또는 한 단계 |
| `danger-surface` | 실패 Alert 면 | `red-50` | `ui/alert.tsx` | 빨강 알파 면 |
| `info-surface` | 정보 Alert 면 | `blue-50` | `ui/alert.tsx` | 파랑 알파 면 |
| `diff-removed` | diff 삭제 글자 · 삭제 낱말 면(`/[0.14]`) | `red-700` | `publish-button.tsx` · 랜딩 `mockup/publish.tsx` | 밝은 빨강 |
| `diff-added` | diff `+` 기호 · 추가 낱말 면(`/[0.16]`) — `-` 기호·삭제 면이 `diff-removed` 하나인 것과 짝 | `green-800` | `publish-button.tsx:258` · 랜딩 `mockup/publish.tsx:52` | 밝은 초록 |
| `kind-blue-surface` · `kind-blue` | Logs 종류 칩 면·글자 | `blue-50` · `blue-700` | `logs/glyph.tsx` | 알파 면 · 밝은 글자 |
| `kind-teal-surface` · `kind-teal` | 〃 | `teal-50` · `teal-700` | `logs/glyph.tsx` | 〃 |
| `kind-violet-surface` · `kind-violet` | 〃 | `violet-50` · `violet-700` | `logs/glyph.tsx` | 〃 |
| `surface-subtle` | 흰 카드 안 한 단계 꺼진 면(Logs 상세의 비어 있는 값 상자) | `neutral-50` | `logs/event-detail.tsx` 둘 | `#121212` — `--background`보다 한 단계 **어두운** 면(§3.8. 밝게 두면 빈 상자가 채워진 상자보다 떠 보인다) |
| `hue-rose` … `hue-fuchsia` (8) | 프로젝트·사람 **식별색**(이름 해시) | `rose-600` … `fuchsia-600` | `ui/tone.ts` | 같은 hue — 다크 표면 위 대비만 확인 |
| `on-hue` | 식별색 위 글자·글리프 | `white` | `ui/avatar.tsx`(이니셜 — 대비 수용 예외, §4.4) · `ui/project-thumbnail.tsx`(글리프 — 비텍스트 3:1) | `white` |
| `scrim` | 오버레이(어둡게 덮기) — `/32`·`/40`으로 쓴다 | `--foreground` 값 | `ui/dialog.tsx:160` · `ui/large-modal.tsx:13` 상수(렌더 자리: large-modal · dialog · `logs/event-dialog`) · 랜딩 `mockup/app-frame.tsx:123` — **리터럴 셋** | 검정 그대로(다크에서도 어둡게 덮는다) |
| `shadow-color` | elevation 둘의 그림자 색 | `rgb(22 24 27)` (`--shadow-low/medium` 리터럴) | `@theme`의 그림자 둘 — **유틸 재료가 아니므로 `@theme`에 등록하지 않고 `globals-css.test.ts` `UNREGISTERED`(:164)에 이유와 함께 넣는다** | 검정 · 알파 그대로(§3.8 — 다크의 층은 면 단계와 윤곽이 만든다) |
| `link` · `gray-light` · `gray-dim` · `gray-strong` | (기존 별칭 — `@theme` → `:root`로 이동) | `blue-600` · `neutral-300/400/600` | 기존 그대로 | 밝은 파랑 · 무채 계단 반전 |

**옮기지 않고 접는 것**: `bg-white`(`signin/auth-layout.tsx`의 로그인 패널) → `bg-background`(같은 `#fff` — 그 패널은 "배경 위 흰 카드"라는 의미가 `background`다).

**그대로 두는 남의 자산**(완료 조건 2): Google 로고 4색(`signin/brand-icons.tsx`) · 초대 메일 hex(`lib/invitation-email/` — 라이트 고정, 다크 비목표).

**`--foreground` 알파 관용구는 옮기지 않는다** — `bg-foreground/[0.03]`(hover) · `/[0.07]`(선택) · `text-foreground/60` 등 약 60곳은
"표면 위에 글자색을 얇게 깐다"는 뜻이라 다크에서 밝게 까는 것이 맞다. 의미가 "어둡게 덮기"인 넷만 `scrim`으로 간다(위 표).
`bg-background/50`(목업·내비게이션 dim)은 "표면색으로 흐리기"라 그대로다. `publish-button.tsx:139`의 `bg-background/20`은 흐리기가 아니라 **primary 버튼 안 개수 배지의 면**(의미로는 `primary-foreground/20`)이다 — 두 테마에서 같은 색이라 옮기지 않는다. 판정이 갈리는 자리가 Phase 2 시안에서 나오면 그때 토큰을 늘린다.

**팝오버 계열 그림자**: `ui/popover.tsx:25`·`ui/select.tsx:60`·`ui/dropdown-menu.tsx:41`의 `shadow-md`(Tailwind 검정, DESIGN §4.5 등재 예외)는 **그대로 둔다**. 다크에서는 검정 그림자가 거의 안 보이므로 층은 **`popover` 면 단계 + `border`가 만든다** — 시안 브리프 §3.1의 `popover` 방향을 이 판정으로 확정한다(2026-10-04 리뷰).

**모달 윤곽**(2026-10-05 시안 확정, §3.8): `LARGE_MODAL_PANEL`(`ui/large-modal.tsx:14`)에 `border border-border`를 더한다. 다크에서 scrim @40%가 덮은 배경(약 `#0e0e0e`)과 모달 면 `#171717`이 약 1.07:1이고 `shadow-medium`은 보이지 않는다. `Dialog`(`ui/dialog.tsx:172-173`)는 이미 `border`가 있다 — 이 변경은 LargeModal을 Dialog에 맞추는 것이다. 라이트에서는 scrim 위 `#e5e5e5` 선이 거의 보이지 않아 사실상 그대로다. scrim 알파(`/40`·`/32`)는 코드 리터럴이라 올리면 라이트도 짙어져 택하지 않았다.

### 2.3 Tailwind 철자

`@theme inline`에 `--color-success-soft: var(--success-soft)` 꼴로 등록하면 `bg-success-soft`·`text-success-foreground`·`border-warning-emphasis/50`이 생긴다.
⚠️ **등록을 빠뜨리면 유틸이 조용히 생성되지 않는다**(globals.css 머리 주석 — 8-1b가 실제로 그렇게 나갔다). 그 검사는 **이미 있다**(`globals-css.test.ts:164` — `:root` 색 변수마다 `@theme` 등록, 예외는 `UNREGISTERED`). 새로 만들지 않고 재사용한다.
⚠️ 역방향 검사도 이미 있다 — `globals-css.test.ts:110-121`이 `@theme`의 custom 색마다 **소비자**를 요구한다. 그래서 토큰은 **소비자를 이관하는 커밋에서 같이 더한다**(소비자 없는 토큰만 먼저 더하면 red — tasks P1-1·P1-2 경계).

### 2.4 테스트 — `REGISTERED`가 0을 세는 검사로 바뀐다

- `components/__tests__/visual-system.test.ts`의 `REGISTERED`는 표가 비면 지운다. 대신 **"raw 팔레트 클래스 0"** 검사가 같은 `hits(RAW_COLOR)`를 **`ALL_SOURCES`**(app·components·lib·messages — 완료 조건 1. 기본 `SOURCES`는 app·components뿐이다)로 돌린다. 카나리아(`found.length > 50`, :146)는 픽스처 문자열에 대한 카나리아로 바꾼다 — 실제 소스에서 0이 정답이므로. ⚠️ 지금 적중이 52곳이라 프리미티브 이관(26곳 감소)만으로 카나리아가 red가 된다 — 교체는 **첫 이관 커밋**에서 한다.
- 같은 파일의 다른 raw 리터럴 가드 셋을 새 철자로 옮긴다 — 안 옮기면 red가 되거나 조용히 죽는다: :246-248 아이콘 색 허용 목록(`text-green-800`·`text-amber-700` → `text-success-foreground`·`text-warning-foreground`) · :288 "Alert 배경 넷이 그 파일 밖에 서지 않는다"(`bg-(amber|red|green|blue)-50` → `bg-*-surface`) · :632-649 IconTile 덮어쓰기 금지 리터럴.
- **scrim 검사**(완료 조건 5): 생산 소스에서 `bg-foreground/(32|40)` 0 — raw 0 검사의 `RAW_COLOR`에 foreground가 없어 따로 센다.
- **색 리터럴 허용 목록**(완료 조건 2): `brand-icons.tsx`·`lib/invitation-email/**` · OpenAI 로고 흰 판 자리(§3.5 — P2-4에서 생긴다) 셋. 그 밖의 hex·`rgb(`·`hsl(`·`oklch(`는 생산 소스에서 0 — 주석을 벗기고 센다(`globals-css.test.ts`의 `consumingSource`와 같은 방식).
- **토큰 표 대조**(완료 조건 4): 표의 "옮겨 온 값"을 테스트 상수(`[token, "var(--color-amber-800)"]` 꼴)로 두고 `globals.css`의 라이트 값과 문자열 대조한다. 이 상수가 Phase 2에서 라이트 쪽 값 회귀를 막는다. ⚠️ 이것은 **토큰 값**만 지킨다 — 자리별 오매핑은 이관 전 캡처 표본(tasks P1-0)과의 `[수동]` 대조 몫이다.
- 클래스 리터럴을 단언하는 기존 테스트 약 20개를 새 철자로 고친다 — 목록은 tasks P1-1·P1-2. 클래스 이름만 바뀌므로 DOM 구조 기대는 그대로다(`status-badge.test.tsx:129`는 픽스처 문자열이라 고치지 않는다).
- `link`를 `:root`로 내리면 `app/__tests__/screens.test.ts:300`의 `--color-link:\s*var\(--color-blue-600\)` 리터럴이 깨진다 — 새 형으로 고친다. `components/__tests__/spelling-equivalence.test.ts`(Tailwind `compile`로 `text-blue-600` ≡ `text-link`)가 한 겹 더 감싼 뒤에도 같은 값으로 판정하는지 같이 본다. 새 유틸 생성 여부도 이 `compile()`로 자동 검사한다.

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
- ⚠️ **`light-dark()`는 색만 받는다.** 색이 아닌 테마 값은 **지금 0개다**(OpenAI 로고는 두 테마 같은 흰 판이 되어 전환이 사라졌다 — §3.5. Malmoi 로고는 토큰 인라인 SVG라 필요 없다). 생기면 `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark) { :root[data-theme="system"] }` 두 블록에 둔다. 그런 값이 셋을 넘으면 설계를 다시 본다.
- ⚠️ **스파이크로 먼저 확인한다**(tasks P2-0). 판정은 Tailwind 출력이 아니라 **`next build` 산출 CSS**(`.next/static/css`)로 한다 — `@tailwindcss/node`는 lightningcss에서 `light-dark()`를 낮추지 않지만(소스 확인), Next CSS 처리가 기본 대상(Safari 16.4, 리포에 browserslist 없음)에 맞춰 `--lightningcss-light/dark` 폴리필로 바꾸는지는 미확인이고, 바뀌면 ③과 `color-scheme` 동작이 달라진다. ① Tailwind v4의 알파 수정자(`bg-success-soft/50` → `color-mix(in oklab, var(--…) 50%, transparent)`)가 `light-dark()` 값을 받는가 ② `color-mix()` 안 `var(--color-amber-100)`가 든 `light-dark()`가 지원 브라우저에서 계산되는가 ③ `getComputedStyle`이 사용자 정의 속성에서 무엇을 돌려주는가(아래 Canvas) ④ 토스트의 계산된 `background`·`border-color`·`color`가 토큰 값인가(§3.5 Toaster). ①–③ 중 하나라도 깨지면 두 벌 블록 형으로 내려가고, 두 벌이 같은 토큰 집합인지를 테스트가 센다.
  - **판정(2026-10-05, P2-0 스파이크 — C): `light-dark()` 형 유지.** ①–③ Chromium 통과. 산출 CSS(`.next/static/chunks/*.css`)에서 **`light-dark()`는 남지 않는다** — Next의 lightningcss가 `--lightningcss-light/dark` 토글 폴리필로 낮추고(54쌍), 본문 뒤 `color-scheme` 세 블록도 토글로 바꾼다(System은 `@media (prefers-color-scheme: dark) { :root[data-theme=system] }` 토글까지 생성). 폴리필이라 실제 하한은 `light-dark()` 지원(Chrome 123 등)이 아니라 사용자 정의 속성 + `color-mix()`다. 정적 HTML + 빌드 CSS를 ego-browser(Chromium 152)로 연 실측: ① `bg-success-soft/50`이 라이트 `oklab(… / 0.4)`·다크 `oklab(… / 0.08)`(= 16% × 50%) — 알파 수정자가 테마 값을 받는다 · `bg-scrim/40`·`border-warning-emphasis/50` 정상. ② `data-theme` light·dark·system(OS 라이트·다크 에뮬레이션) 넷에서 `background`·`color`가 기대 테마 값. ③ 폴리필 산출에서 `getPropertyValue("--signin-dot")`은 풀린 값(`#2563eb` / `lab(65.04% …)`)을 주지만, 폴리필 없는 `light-dark()`를 단 변수는 **선언 문자열 그대로**(`light-dark(red, blue)`)를 줬다 → §3.5대로 계산된 `color`를 읽는다. 그 `color`는 다크에서 **rgb가 아니라 `lab()`**이고(팔레트가 `@supports` 아래 lab으로 재선언된다) Canvas `fillStyle`이 그대로 받아 blue-400 픽셀(80,162,255)을 칠했다. **Safari·Firefox는 도구가 없어 미검증**(orch D4).
- ⚠️ **`color-scheme` 블록은 본문 `:root {` 블록 뒤에 둔다** — `globals-css.test.ts:107`의 `/:root\s*\{([\s\S]*?)\n\}/`는 **첫** `:root {`를 본문으로 잡으므로, 한 줄 블록이 앞에 서면 본문 자리를 가로챈다.
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

**쓰기 계획 함수는 두지 않는다**(2026-10-04 리뷰). 부르는 곳이 보호 경로 Action 하나라 "로그인 여부"가 항상 참이다 — ui-locales `planUiLocaleWrite`(`lib/i18n/locales.ts:41`)의 `signedIn` 분기는 공개 스위처가 있어서 필요했고 여기엔 소비자가 없다. Action이 계정과 쿠키를 **무조건 둘 다** 쓴다(§3.6). 쿠키를 로그인 중에도 쓰는 이유는 로그아웃 뒤 공개 페이지가 같은 테마를 보게 하려는 것이다(spec 완료 조건 10).

ui-locales의 `parseUiLocale`·`resolveUiLocale`(`lib/i18n/locales.ts`)와 **모양이 같지만 합치지 않는다** — 값 집합·기본값이 다르고, 공통 "설정 저장소" 추상화는 ui-locales spec이 금지한 선반영이다. user-timezone은 쿠키 층이 없는 계정 하나라 **같은 꼴이 아니다**. 착수 시점에 두 벌이 실제로 같은 코드라면 그때 `/refactor` 후보로 적는다.

테스트 전용 순수 헬퍼(`lib/color-scheme/__tests__/helpers/`) — 완료 조건 12의 대비 검사용:

| 헬퍼 | 계약 |
|---|---|
| `readThemeTokens(css, tailwindTheme): { light: Record<string, Rgba>; dark: Record<string, Rgba> }` | `:root`의 `light-dark(a, b)`를 두 값으로 가르고, `var(--color-…)`를 Tailwind `theme.css`의 oklch에서, `color-mix(in oklab, X p%, transparent)`를 알파로 푼다. **리터럴 `hsl()`·`rgb()`도 푼다**(`--muted-foreground`·`--destructive`·`--ring`이 그 형이다). `theme.css`는 `globals-css.test.ts:147`처럼 `require.resolve("tailwindcss/theme.css")`로 읽는다 |
| `oklchToSrgb(l, c, h): Rgb` | CSS Color 4 변환. 색역 밖 채널은 **sRGB 클립**(0–255로 자름 — gamut mapping 아님). 기대값은 **v4 oklch의 변환값**으로 고정한다(예: `amber-800` = `oklch(47.3% 0.137 46.201)` ≈ `#973c00`). ⚠️ v3 hex(`#92400e`)·리포 주석의 `#2563eb`(blue-600 v3)를 기대값으로 쓰지 않는다 |
| `contrastRatio(fg: Rgba, bg: Rgb): number` | WCAG 2.x 상대 휘도. 알파가 있는 전경·면은 바닥 면 위에 합성한 뒤 잰다 |

대비 쌍 목록(§4.4)은 테스트 상수다. 지금 리포에 대비 계산 코드가 없어 DESIGN의 대비 수치(:108 4.75·4.34 · :118 4.83 · :2064 링 2.54)가 손으로 잰 값이다 — 이 헬퍼가 그 수치를 라이트에서 먼저 재현하는지로 헬퍼를 검증한다. 재현 검증은 **리터럴 토큰 쌍**(`--ring`·`--muted-foreground`·`--destructive` 등)으로 한정한다 — 팔레트 파생 쌍은 손 측정이 v3 hex 기준이었을 수 있어 어긋나도 헬퍼 결함이 아니다.

### 3.4 서버 — 요청당 한 번

- `getColorScheme()`(`lib/color-scheme/server.ts`, `server-only`, React `cache`): 입력은 `readSession()`의 `colorScheme` + `cookies()`의 `malmoi-color-scheme`, 판정은 `resolveColorScheme`. ui-locales `getUiLocale()`(`lib/i18n/server.ts:31`)과 같은 형.
- 루트 레이아웃(`app/layout.tsx`)이 `<html data-theme={await getColorScheme()}>`를 달고, 같은 값을 `<Toaster theme>`에 넘긴다(sonner의 값 집합 `system|light|dark`가 `COLOR_SCHEMES`와 같다 — §3.5). 루트 레이아웃은 이미 `await connection()`(CSP nonce)·`getUiLocale()`로 `readSession()`(React `cache`)·`cookies()`를 부르므로 새로 동적이 되는 페이지도, 추가 쿼리도 없다(`force-static`은 sitemap·llms·search-index Route Handler뿐).
- ⚠️ **서버 소비자는 둘이다 — 루트 레이아웃(`<html data-theme>`·`<Toaster theme>`)과 `/preferences` page(Theme 카드의 초기값 prop, §3.7).** 둘 다 같은 `getColorScheme`(요청 캐시)이라 값이 갈리지 않는다. ui-locales가 "레이아웃이 흘려보내지 않고 소비자마다 묻는다"(POSTMORTEM 2026-08-31)를 택한 것은 페이지가 문구를 직접 읽어야 해서였다. 테마는 CSS가 `<html>` 속성 하나로 읽으므로 컴포넌트가 물을 일이 없다 — 클라이언트 훅·provider를 만들지 않는다(선반영 금지). 예외는 §3.5의 Canvas 하나이고 그것도 DOM에서 읽는다.
- `global-error.tsx`는 루트 레이아웃 밖이고 `globals.css`도 import하지 않는다(그 파일 머리 주석) → `data-theme`도 토큰도 없이 **브라우저 기본값으로** 라이트다(완료 조건 17 — 검사는 "import 없음 · `data-theme` 없음").

### 3.5 화면 밖 자산

| 자산 | 다크에서 | 근거 |
|---|---|---|
| 로고 `malmoi-icon-black.svg`(7곳 import + JSON-LD) | **토큰으로 칠하는 인라인 SVG 컴포넌트 `MalmoiMark`(`components/ui/malmoi-mark.tsx`) 하나로 7곳을 모은다**(2026-10-04 리뷰 — 실재하는 사본 이관). 두 path의 fill을 면 = `foreground`(`#0a0a0a`, 원본 `#090B0C`와 1단위 차이), 마크 = `background`로 칠하면 다크에서 자동으로 `-white` 판과 같은 그림이 된다 — 두 번째 `<Image>`도, §3.1의 비색 테마 블록도 필요 없다. 7곳 모두 장식(`alt=""`)이라 `aria-hidden`. `priority` preload는 사라진다(인라인이라 요청이 없다). JSON-LD `logo`·`public/brand/*.svg` 파일은 크롤러·외부용이라 그대로. ⚠️ `BrandLogo`라는 이름은 `components/mcp/brand-logo.tsx`(에이전트 로고)가 이미 쓴다 | 검정 면(`#090B0C`)이 다크 캔버스에 묻힌다 |
| 에이전트 로고 `openai.svg`(검정 마크) | **원본 검정 마크를 두 테마 모두 흰 판(`#ffffff`) 위에 놓는다**(2026-10-05 시안 확정, §3.8). 파일은 그대로라 `lib/mcp/brand.ts`의 무변형 규정을 지키고, 두 테마가 같은 판이라 테마 분기·두 번째 자산·비색 값 블록이 없다(옛 안 "공식 흰 마크 파일 추가 + CSS 전환"은 그 파일이 배포되는지부터 가정이었다). 자리는 `mcp/connected-apps-card.tsx`의 로고 칸 둘(`IconTile size="lg"` — 연결 행 · 끊기 확인). 흰 판은 브랜드 자산 규칙이라 토큰이 아니라 리터럴이다 → 색 리터럴 허용 목록에 이 자리를 더한다(§2.4 · spec 완료 조건 2). ⚠️ `IconTile` 덮어쓰기 금지 가드(`visual-system.test.ts` :632-649)와 raw 팔레트 0 검사(`bg-white`도 잡힌다)에 걸리지 않는 길을 P2-4에서 고른다 — 흰 판은 OpenAI 칸만이고 Claude 칸은 `foreground` @5% 그대로다. 대가: 라이트의 OpenAI 칸이 옅은 회색에서 흰 판으로 바뀐다 | 검정 마크가 다크 면에서 사라진다 |
| 로그인 키비주얼 PNG 넷(`malmoi-kv-1..4`) | **그대로**. 라이트 카드 그림이 다크 패널 위에 놓인다. 다크 PNG 제작은 spec 비목표 — 후속 이슈로도 올리지 않는다(2026-10-05 사용자) | 사진 같은 자산이라 토큰으로 못 바꾼다 |
| 로그인 Canvas 점(`--signin-dot`) | ⚠️ `dot-field.tsx:66`이 `getComputedStyle(canvas).getPropertyValue("--signin-dot")`를 effect에서 한 번 읽는다 — 사용자 정의 속성은 **선언 문자열**(`light-dark(…)`)이 그대로 오고 Canvas `fillStyle`은 그것을 모른다. **`style={{ color: "var(--signin-dot)" }}`을 단 요소의 계산된 `color`를 읽도록** 바꾼다(브라우저가 `light-dark`를 풀어 준다). 유틸로 등록하지 않는다 — `globals-css.test.ts:119-120`의 "직접 소비자"(`var(--signin-dot)` 문자열) 검사와 `UNREGISTERED`(:163)가 그대로 성립한다. System이면 `matchMedia("(prefers-color-scheme: dark)")`의 `change`에서 다시 읽는다(완료 조건 8). 로그인 화면엔 Preferences가 없어 `data-theme`이 그 화면에서 바뀌는 경로는 없다 | |
| 토스트(sonner `Toaster`, `app/layout.tsx:87`) | **`theme={colorScheme}`을 넘기고, sonner 변수(`--normal-bg`·`--normal-border`·`--normal-text`)를 `popover`·`border`·`foreground` 토큰에 묶는다**(spec 결정). sonner CSS는 `<head>` 끝에 레이어 없이 주입되고 `[data-sonner-toast][data-styled=true]`(특이도 0,2,0)가 `@layer utilities`의 `classNames`를 이기므로, 묶는 규칙은 `globals.css`에서 그보다 높은 특이도로 두거나 `Toaster`의 `style`로 넘긴다(P2-0 ④ 실측으로 고른다). `[data-description]{color:#3f3f3f}`도 같이 덮는다. 레이아웃 머리 주석("`theme="light"`가 필수다")을 고친다. **판정(2026-10-05 P2-0 ④ — C): `Toaster`의 `style`.** 그 `style`은 `<ol data-sonner-toaster>` 자체의 인라인이라 sonner의 `[data-sonner-toaster][data-sonner-theme=dark]` 변수 선언과 특이도를 겨루지 않는다. 실측(Chromium, 다크): `classNames`(`!`)만이면 껍데기는 토큰이지만 액션 버튼 `[data-button]`이 sonner `#fcfcfc`/`#000`, 설명 `[data-description]`이 `hsl(0 0% 91%)`(라이트 `#3f3f3f` — `!` 없는 유틸이 진다)였다. `style` 변수 + 설명 `text-muted-foreground!` 뒤 껍데기 `popover`(`#1f1f1f`) · 테두리 `border` · 글자 `foreground` · 버튼 `foreground`/`popover` · 설명 `muted-foreground`. 껍데기 면은 `bg-popover!`로 바꿨다(라이트는 `background`와 같은 값) | 라이트는 값이 우연히 같아 안 드러났을 뿐, 다크에서 토스트만 흰색으로 남는다 |
| 국기 SVG(`public/flags/`) | 그대로. 흰 국기(kr·jp)의 윤곽이 흰 면에 묻히는 것은 라이트의 문제라 이 기능과 무관하다 — 다크 면 위에서는 오히려 선다(시안 확인) | 국기는 국기다 |
| 가이드 스크린샷(`public/guide/`) | 이미지도 테두리도 **그대로 — 변경 없음**(2026-10-05 사용자). `docs/guide-markdown.tsx:112`의 `Figure`가 이미 `border-border-subtle rounded-lg border` + `shadow-low`라 라이트의 "흰 그림이 흰 본문과 섞임"은 막혀 있고, 다크에서는 흰 그림이 어두운 본문 위에서 스스로 경계를 만든다. 시안의 `border-subtle` → `border` 제안(A12)은 다크 `#1f1f1f` → `#262626` 차이뿐이라 받지 않았다. 다크 스크린샷 제작은 spec 비목표 | |
| 사용자 프로젝트 썸네일(`ui/image-tile.tsx`) | 그대로 — 투명 PNG가 다크 면에 묻히는 것은 spec 비목표(수용) | |
| 초대 메일 | 그대로(`color-scheme: light` 메타) — spec 비목표 | |
| OG `og.png`·파비콘 `app/icon.svg` | 그대로 — spec 비목표 | |
| 랜딩 목업(`components/landing/mockup/*`) | 토큰으로 칠해지므로 **자동으로 다크**다. 목업 안의 diff·경고 색도 Phase 1에서 토큰이 된다 | 실제 제품 화면을 흉내 내므로 제품과 같이 바뀌는 것이 맞다 |

### 3.6 바꾸기 — `setColorScheme` Server Action

- 위치: **`app/(edit)/preferences/actions.ts`** — 부르는 곳이 `/preferences` 하나뿐이다(공개 스위처 없음, spec 결정). ui-locales의 `app/ui-locale/`과 다른 이유가 이것이다.
- 입력 `colorScheme` 하나 → `parseColorScheme` 불통과면 `invalid`.
- 처리 순서(형제 `setTimeZone`과 같은 형 — 아래 대조): ①`readSession()`이 `ok`가 아니면 아무것도 쓰지 않고 `failed`(redirect하지 않는다 — 카드가 Alert로 말한다) → **세션의 `userId`로** `User.colorScheme` 갱신(입력 userId 없음) → ②쿠키 `malmoi-color-scheme`(`httpOnly` · `sameSite: "lax"` · `secure: x-forwarded-proto === "https"` — `setUiLocale`과 같은 판정, 로컬 http에서도 쿠키가 선다 · `path: "/"` · 1년)를 **무조건** 쓴다(§3.3 — 쓰기 계획 함수 없음) → ③`revalidateAfterCommit("color-scheme")`(`lib/revalidate-after-commit.ts:6`, 시그니처 `(scope, path = "/")` — 안에서 `revalidatePath(path, "layout")`. ⚠️ `("/", "layout")`으로 부르면 `revalidatePath("layout", "layout")`이 되어 `<html data-theme>`이 새로고침 전까지 안 바뀐다).
  ①의 DB 갱신이 실패하면 아무것도 쓰지 않고 `failed`(쿠키만 쓰면 다음 렌더에서 계정의 옛 값이 이겨 조용히 되돌아간다). ③의 오류는 커밋 뒤라 `ok`다(POSTMORTEM 2026-09-20).
- 결과는 코드(`ok`·`invalid`·`failed`)다. `ProjectEvent`를 남기지 않는다.
- 대조 2026-10-05: dev의 `setUiLocale`(`app/ui-locale/actions.ts`)·`setTimeZone`(`app/(edit)/preferences/actions.ts`)과 대조 — 둘 다 `readSession` + 세션 없음 `failed`(redirect 아님)이고 쿠키 `secure`가 프록시 프로토콜 판정이라, 옛 문안(`requireUser` redirect · 무조건 `Secure`)을 그 형으로 고쳤다. 계정 → 쿠키 → 무효화 순서 · DB 실패 시 무기록 `failed` · `revalidateAfterCommit(scope)` 호출형은 일치.

### 3.7 화면 — Preferences의 Theme 카드

- 위치: Language 카드(ui-locales) · Time zone 카드(user-timezone) **뒤**. **user-timezone이 둘째 소비자에서 뽑는 공용 Select 카드 조립을 그대로 쓴다**(2026-10-04 리뷰 — 가드를 여기서 다시 나열하면 셋째 손 사본이다). 그 조립이 typeahead 차단 · busy 가드 · 낙관적 표시 · 실패 `Alert danger inset` · 같은 값이면 요청 안 함을 든다. 이 카드가 더하는 것은 **옵션 글리프 슬롯이 필요한지**와 아래 DOM 선적용뿐이다. 조립이 착수 시점에 없으면(user-timezone이 뽑지 않았으면) 이 카드에서 뽑고 앞 두 카드를 같은 커밋에 이관한다.
- **화면은 서버 왕복을 기다리지 않는다**: Action을 부르기 전에 `document.documentElement.dataset.theme = next`로 먼저 바꾸고, `failed`면 이전 값으로 되돌린다. provider·훅이 아니라 한 줄 DOM 쓰기라 §3.4의 "훅·provider 금지"와 충돌하지 않는다. revalidate 뒤 서버가 같은 값을 다시 실어 맞물린다.
- **고르는 즉시 적용** — DESIGN §6.4(:709)는 "이 예외를 다른 설정으로 넓히지 않는다"고 쓴다. 그래서 예외의 범위를 **"`/preferences`의 개인 설정 카드"**로 다시 정의하는 문안으로 고친다(tasks P2-6. user-timezone이 먼저 고쳤으면 확인만).
- 옵션 앞 글리프: `Monitor` · `Sun` · `Moon`(lucide 16). 글리프가 `ItemText` 안에서 트리거로 복제되는지는 Language 카드의 국기와 같은 규칙을 따른다. 도움말 한 줄: System은 "기기 설정을 따른다".
- `preferences/loading.tsx` 골격에 셋째 카드 자리를 더한다.
- 문구는 `messages/{en,ko,es}.tsx`에 같은 커밋으로 넣는다(ui-locales 사전 정합 테스트가 빠진 키를 typecheck로 잡는다). 용어: en `Theme`·`System`·`Light`·`Dark` / ko `테마`·`시스템`·`라이트`·`다크` / es `Tema`·`Sistema`·`Claro`·`Oscuro` — DESIGN §10.1 ko·es 열에 등재.
- 시안: Phase 2 다크 시안에 Theme 카드를 포함한다(S 단계).
- 대조 2026-10-05: 공용 조립 `components/preferences/preference-select-card.tsx`(`PreferenceSelectCard`)가 dev에 있고 Language·Time zone이 쓴다 → "없으면 뽑는다" 갈래는 닫힘. **옵션 글리프 슬롯은 이미 있다** — `items[].label`이 `ReactNode`라 Language 카드가 `LocaleFlag`를 라벨 안에 넣고(`ItemText` 안 → 트리거로 복제), Theme도 `Monitor`·`Sun`·`Moon`을 같은 자리에 넣는다. **E는 카드에 슬롯을 더하지 않는다.** DOM 선적용·롤백은 카드가 아니라 Theme 카드가 넘기는 `apply` 클로저가 든다(카드는 `apply`가 던지면 잡아 실패로 그린다 — 클로저는 던짐에서도 `data-theme`을 되돌려야 하므로 `try/finally`·`catch`로 감싼다). DESIGN §6.4 문안은 user-timezone이 이미 "Preferences 밖의 설정으로 넓히지 않는다"로 고쳤다 — P2-6은 Select 목록에 Theme을 더하고 "둘만"을 "셋"으로 바꾼다. DESIGN `/preferences` 절의 "테마 자리는 만들지 않았다" 문장도 P2-6에서 고친다.

### 3.8 다크 값 — 시안 확정 (2026-10-05)

**다크 값의 정본은 Claude Design 핸드오프 `design_handoff_color_scheme`이다** — `README.md` §5 토큰 표(Tailwind 이름 또는 hex)와 `Color Scheme.dc.html` 머리의 `[data-theme="dark"]` 블록이 같은 값이다. P2-1은 그 표를 `globals.css`의 `light-dark()` 둘째 인자로 옮긴다. 토큰 수는 그대로다(합치거나 늘리지 않음).

시안이 이 문서·브리프와 다르게 정한 것(사용자 확정 — 위 각 절에 반영). ⚠️ **시안·핸드오프·`design-brief.md`의 `subtle` = 코드 `surface-subtle`**이다(2026-10-05 RA 🟡2 — `--color-subtle`이면 `border-subtle`이 `border-border-subtle`과 다른 색으로 살아난다):

| 항목 | 확정 | 절 |
|---|---|---|
| `surface-subtle` 다크 | `#121212`(background보다 어둡게 — 라이트의 "꺼진 면" 방향 유지) | §2.2 표 |
| 모달 윤곽 | `LARGE_MODAL_PANEL`에 `border border-border`(Dialog는 이미 있다) | §2.2 |
| OpenAI 로고 | 원본 검정 마크 + 두 테마 같은 흰 판 · 비색 값 블록 0 | §3.5 · §3.1 |
| 가이드 스크린샷 | 시안은 `border` 1px 제안 → **받지 않고 지금 처리 그대로**(핸드오프 README §4와 다르다 — 이 문서가 이긴다) | §3.5 |
| `border`/`background` 3:1 | 두 테마 약 1.2–1.26으로 미달 유지 — border·divider·border-subtle의 낮은 대비는 의도다. "정보를 나르는 경계"는 구현 판정 | §4.4 |

시안 열린 결정의 판정:

- **neutral Alert 면은 `muted` 그대로** — `foreground` @5%로 내리면 컴포넌트 변경이라 색 값만 바꾸는 이번 범위 밖이다. 무채라 "가장 조용하다"는 뜻은 다크에서도 선다.
- **primary hover가 다크에서 어두워지는 것을 받는다** — `primary` @85%가 다크에서 약 `#d4d4d4`로 내려가지만(글자 대비 약 11:1) 두 테마 모두 "면이 달라진다"는 신호는 선다. hover 전용 토큰은 두지 않는다.
- **로고(§5-3)는 기본안 그대로** — 다크 헤더에서 흰 사각 32.
- **시안의 후속 이슈 후보 둘은 이슈로 올리지 않는다** — 다크 키비주얼 PNG 넷(A13) · 다크 가이드 스크린샷(A12)은 이번 기능에서 하지 않고 따로 추적하지도 않는다(2026-10-05 사용자, spec 비목표). 나중에 할지는 열려 있다 — 영구 비범위로 고정하지 않는다.

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
- 대조 2026-10-05: 방침 en 쿠키 절(`messages/en.tsx` `id: "cookies"`)의 첫 문장은 "로그인 · GitHub/Google 왕복 · **고른 화면 언어 기억**"에 필요한 쿠키라고 쓴다 — 테마 기억은 그 목록에 없으므로 E가 그 문장과 쿠키 표에 한 줄을 더한다. "All of them are http-only"는 테마 쿠키도 `httpOnly`라 그대로 참이다(클라이언트는 쿠키를 읽지 않고 DOM `data-theme`만 쓴다). 보존 목록(`The language you choose…` · `The time zone you choose…`)에 테마 한 줄도 같이 — ko 본(`ko-privacy.tsx`)도 동형. **RB 리뷰 추가**: "수집하는 것" 표(`messages/en.tsx` 언어·시간대 행 옆 — 2026-10-05 기준 :699·:704)와 목적 목록(:741·:742)에도 테마 한 줄씩 — 새 수집 항목·새 목적은 `policy-gate`가 못 본다. ko 본 같은 자리.

### 4.4 대비 쌍 (완료 조건 12의 입력)

본문 AA(4.5)를 두 테마에서 잰다: `foreground`/`background`·`popover`·`canvas`·`muted` · `foreground` @60%/`muted`(DESIGN §2.2의 muted 면 처방) · `muted-foreground`/`background`·`canvas`·`popover` · `primary-foreground`/`primary` · `destructive`/`background` · `link`/`background` · `success-foreground`/`success-soft`·`success-surface`·`background` · `warning-soft-foreground`/`warning-soft`·`background`(`ui/row-card.tsx` BannerLine은 `bg-foreground/[0.02]`, 곧 사실상 `background` 위다 — RA 🟡3) · `warning-foreground`/`background` · `diff-removed`/`background` · `diff-added`/`background` · `foreground`/`diff-removed`@14%·`diff-added`@16%(낱말 면 위 글자) · `kind-*`/`kind-*-surface`.
비텍스트 3:1: `border`/`background`(정보용 경계만 — 구조 선은 두 테마 모두 의도적으로 미달, §3.8) · `ring`/`background` · `on-hue`/`hue-*`(**썸네일 글리프**).
`gray-dim` 글자(약 22곳)는 DESIGN §6.2에 수용 근거가 있다(P2-1 확인) → 아래 수용 예외 다섯째.
**수용 예외**(spec 완료 조건 12 — 여섯뿐, 2026-10-05 사용자가 gray-dim을 다섯째 · `muted-foreground`/`canvas` 라이트 4.38을 여섯째로 확정): `ring`/`background` 2.54(DESIGN :2064) · `destructive`/`destructive`@8% 약 4.3(DESIGN :116) · `muted-foreground`/`muted` 4.34(DESIGN :108) · `on-hue`/`hue-*` **아바타 이니셜**(라이트 최저 amber 3.19 — DESIGN 등재는 P2-6) · `gray-dim`/`background`·`canvas` 2.58 · 2.39(DESIGN §6.2 — 본문 아님, 옆 값이 뜻을 완성하는 자리만. B 실측, v4 `#a1a1a1`). 다크에서도 같은 자리만 예외이고, 테스트 상수에 **실측 수치와 DESIGN 절**을 같이 적는다 — 근거 없는 예외가 늘지 않게.

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
| 2026-09-20 | 커밋 뒤 캐시 오류가 전체 실패로 보고됐다 | `revalidateAfterCommit`(§3.6) — 시그니처 `(scope, path)`를 지킨다 |
| 2026-09-23 | 테마에 없는 `text-link` 클래스로 인라인 링크가 본문 글자로 섰다 | 새 토큰 유틸 생성을 `spelling-equivalence.test.ts`의 `compile()`로 확인(§2.4) |

## 7. 다른 기능과의 겹침

- **ui-locales**: `app/globals.css`(`:lang(ko)` 규칙) · `/preferences` 페이지·`Card` 형 · `lib/auth/public-session.ts` 허용 목록 · 방침 두 본 · 사전 셋 · 화면 파일 대량 이관(E 배치). Phase 1의 이관 파일(위 표)이 E 배치 파일과 거의 전부 겹친다 → **ui-locales 통합 뒤** 착수.
- **user-timezone**: `/preferences`에 카드를 더하고 `User`에 컬럼을 더한다(같은 허용 목록·같은 방침 절). 공용 Select 카드 조립을 뽑을 예정이다(§3.7이 그것을 쓴다). → **user-timezone 통합 뒤** Phase 2 착수. Phase 1은 user-timezone과 파일이 거의 안 겹치지만 사용자 고정 순서를 따라 그 뒤에 둔다.
- ⚠️ 2026-10-04 리뷰 시점에 `/preferences`·`setUiLocale`·`messages/es.tsx`·ko `/privacy`·user-timezone 코드가 모두 dev에 없다 — §3.6·§3.7·§4.3은 그 실물을 못 보고 쓴 것이라, 통합 뒤 다시 대조한다(tasks P2-pre).
