# DESIGN.md

편집 UI의 시각 규칙. **`~/code/bugshot-2`의 `docs/DESIGN.md`를 원본으로 이식했고**, 두 축이 다르다: Tailwind **v4**(그쪽은 v3)이고 **라이트 단일**(그쪽은 라이트/다크 양쪽)이다. 그 차이가 만드는 함정을 §1·§3에 적었다.

**2026-09-07 — 레퍼런스를 Supabase → GitLab으로 바꿨다** (SaaS 6단계 `features/translation-ui/`). 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**(§5·§6.5~§6.7·§9)이고, **색 토큰·타입 스케일·간격·radius는 기존 것 그대로다**(§2·§4·§5 앞부분) — GitLab Pajamas의 팔레트·폰트를 들이지 않는다. 같은 날 컨트롤이 hand-rolled에서 **프리미티브(`components/ui/`)** 로 바뀌었다(§6.4·§7).

무엇을 만드는지는 [SAAS.md](./SAAS.md)(현재)와 [MVP.md](./MVP.md)(PoC — 닫힘), 화면별 구성은 [features/translation-ui/user-stories.md](./features/translation-ui/user-stories.md), 불변식은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. 기반 스택

| | 값 | bugshot-2와의 차이 |
|---|---|---|
| Tailwind | **v4** — `tailwind.config.js`가 **없다**. 테마는 `app/globals.css`의 `@theme inline` | v3 + config 파일 |
| 프리미티브 | **`components/ui/`를 이 리포가 소유한다** (2026-09-07 — shadcn 생성물 4개는 삭제됐고 CLI를 다시 돌리지 않는다). Radix는 `radix-ui` 단일 패키지에서 DropdownMenu·Dialog·Tooltip 셋만 | shadcn 생성물을 그대로 씀 |
| 변형 | `class-variance-authority` — Button·Badge·Alert | 같음 |
| 아이콘 | `lucide-react` **16px** | 같음 |
| 애니메이션 | `tw-animate-css` (사용 0이면 6단계 마지막 chore에서 뺀다) | `tailwindcss-animate` |
| 폰트 | Pretendard Variable 동적 서브셋, 자사 호스트 | 같은 폰트, `@fontsource` |
| 테마 | **라이트 단일** | 라이트/다크 |

**v4에서 `@theme inline`의 의미**: 토큰 값은 `:root`에 CSS 변수로 두고, `@theme inline`이 그걸 Tailwind 유틸 이름에 연결한다. v3의 `tailwind.config.js` `colors: { border: "hsl(var(--border))" }`에 해당한다. **`inline`을 빼면** 변수가 한 겹 더 감싸져 `@apply`·임의값에서 다르게 해석되므로 지우지 않는다.

## 2. 색상 (디자인 토큰)

`components.json`의 `"baseColor"`는 **shadcn CLI 생성 시드일 뿐이다.** `cssVariables: true`라 생성 컴포넌트는 semantic 토큰만 참조하고, **실제 값의 진실은 `app/globals.css`다.**

**팔레트는 `slate`다** (푸른 틴트). bugshot-2가 라이트=slate / 다크=neutral로 갈랐던 이유는 "같은 채도가 저명도에서 배경을 남색으로 물들여 칙칙하게 읽힌다"는 것인데, **라이트 단일이라 그 비대칭이 필요 없다** — 고명도에서 slate의 틴트는 순백 배경 위에서 맑게 읽히는 쪽이다. **GitLab의 회색·파랑을 들이지 않는다** (§9.2) — 레퍼런스에서 가져오는 것은 배치이고 색이 아니다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 페이지 바탕 / 기본 텍스트 |
| `primary` (+`-foreground`) | 주요 CTA·강조 — **화면당 하나** |
| `secondary` (+`-foreground`) | 보조 버튼 |
| `muted` (+`-foreground`) | 보조 텍스트·비활성 배경·**사이드바 배경**(§6.5) |
| `accent` (+`-foreground`) | hover 강조 |
| `destructive` (+`-foreground`) | 위험·오류 — 글자색 전용(§2.3) |
| `card` / `popover` (+`-foreground`) | 카드·팝오버 표면 |
| `border` / `input` / `ring` | 테두리 · 입력 테두리 · 포커스 링 |

### 2.1 ⚠ `accent` == `secondary` == `muted`가 같은 값이다

세 토큰이 모두 `210 40% 96.1%`다. 위 표의 "용도"는 **의미 구분이지 시각 구분이 아니다.** 귀결:

- **`muted`·`secondary` 표면 위 컨트롤에 `hover:bg-accent`는 무효다** (hover 피드백 0). **사이드바가 `muted` 표면이므로 사이드바 항목의 hover는 배경이 아니라 글자색(`hover:text-foreground`)이고 선택은 `bg-background`(흰 알약)다** — §6.5.
- `outline` 형 버튼의 `bg-background → hover:bg-accent`는 **`background` 표면 위를 전제한 관용구**다. muted 표면으로 옮기면 방향이 뒤집힌다.
- 그런 자리의 hover는 배경이 아니라 **등장(opacity)·글자색·그림자**로 낸다.

### 2.2 ⚠ 글자 대비는 토큰 이름이 아니라 "무슨 표면 위냐"가 정한다

같은 `--muted-foreground`가 `--background`(흰색) 위에선 **4.75:1**로 AA를 넘지만 `--muted` 위에선 **4.34:1로 미달**한다.

**`muted` 표면 위 글자에 `--muted-foreground`를 반사적으로 쓰지 말 것.** 옅게 깐 `--foreground`(예: `text-foreground/60`)가 AA를 넘으면서도 본문보다 약하다.

이게 걸릴 자리: **표 헤더**(`bg-muted/50`), **사이드바의 비활성 항목**(§6.5 — 사이드바 전체가 muted다), **값 칩·코드 블록**(`bg-muted`), **`orphaned` 배지**.

### 2.3 `--destructive`는 글자색 전용이다

`text-destructive`(와 `border-destructive`)로만 쓴다. `bg-destructive`는 쓰지 않는다 — **danger 버튼도 배경이 아니라 `border-input text-destructive`다**(§6.4).

값은 **red-600 (`0 72.2% 50.6%`)** 이고 흰 배경에서 4.83:1로 AA를 넘는다. shadcn 기본값 red-500은 흰 배경에서 **3.76:1로 미달**이라 쓰지 않는다.

## 3. 라이트 단일 — `dark:`를 쓰지 않는다

**`dark:` variant를 새로 쓰지 않는다.** 다크 모드는 비범위다.

### 3.1 강제 장치 — `@custom-variant`를 지우지 말 것

```css
@custom-variant dark (&:is(.dark *));
```

`app/globals.css`의 `@import` 직후에 있다. **이 줄이 라이트 고정의 유일한 장치다.**

Tailwind v4는 `dark:`의 기본 동작이 **`prefers-color-scheme`** 이다. 이 줄이 그걸 클래스 기반으로 덮어쓰고, `.dark` 클래스를 **DOM에 어디에도 붙이지 않으므로** `dark:` 유틸이 컴파일돼도 절대 매치되지 않는다.

shadcn 생성물이 사라져(2026-09-07) `dark:`를 쓰는 소스는 0곳이지만 **줄은 남긴다** — 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아나는 경로를 막는 것이 이 줄이고, `lib/__tests__/globals-css.test.ts`가 리터럴로 고정한다.

### 3.2 `.dark` 토큰 블록이 없다

`:root` 하나뿐이다. 다크 값을 되살리려면 `.dark` 블록을 추가하고 §2의 비대칭 판단(라이트 slate / 다크 neutral)을 다시 해야 한다 — 그건 bugshot-2 `docs/DESIGN.md` §2에 근거가 있다.

## 4. 타이포그래피

- **`font-sans`**: Pretendard Variable → 시스템 한/영 폴백. 폰트 파일은 **동적 서브셋 생성물**이라 `public/fonts/`가 gitignore돼 있다 (CLAUDE.md 폰트 절). GitLab Sans(Inter 기반)를 들이지 않는다 — Pretendard의 라틴 글리프도 Inter에서 왔다.
- 크기 관용: **`text-xs`·`text-sm`이 지배적**(라벨·필드·보조 텍스트·표 셀·버튼). `text-base`=본문·섹션 제목, `text-lg`=페이지 제목(한 화면에 하나).
- **임의값(`text-[…]`)은 스케일에 대응값이 없을 때만.** 12px은 `text-xs`, 14px은 `text-sm`이 있으므로 임의값으로 쓰지 않는다.
- 헤딩·라벨은 `font-medium`(500)이고 700을 쓰지 않는다.

### 4.1 mono 표면 불변식 — 13px / 18px

**식별자는 mono 표면이다** — 번역 키, 프로젝트 slug, 리포 `owner/name`, 브랜치 이름, 초대 링크 URL, 파일 경로, 토큰 값. `common.viewAll`·`popup_title`은 식별자고 산문이 아니다 — sans로 깔면 `l`/`1`/`I`와 `_`/`.`이 구분되지 않아 번역자가 키를 잘못 읽는다.

값은 `:root`의 **단일 출처**에서 나온다:

```css
--mono-size: 13px;
--mono-leading: 18px;
```

소비 경로는 **`text-mono` 유틸 하나**다 — `@utility text-mono`가 **font-family·font-size·line-height 셋**을 함께 싣는다. ⚠️ 2026-09-06까지는 `@theme inline`의 `--text-mono`(font-size 토큰)뿐이어서 **글꼴이 안 실렸고**, 키·slug·링크가 전부 13px sans로 렌더됐다 — 이름이 mono라 아무도 의심하지 않았다(`/doc-check` 1회차가 잡았다). bugshot-2는 소비 경로가 넷이라 "하나만 놓치면 조용히 갈라진다"는 경고가 붙었지만, 우리는 CodeMirror·Tiptap·별도 번들이 없어 경로가 하나다. **그 상태를 유지한다** — 두 번째 경로가 생기면 그 경고가 우리에게도 적용된다.

- **13px인 이유**: 12px이 작고, 14px는 mono 자폭이 sans의 1.2배라 트렁케이션·가로 스크롤이 함께 늘어난다.
- **`text-[13px]`가 아니라 `text-mono`를 쓴다.** 임의값은 행간이 따라오지 않아 표면마다 갈린다.

### 4.2 ⚠ `text-mono`를 twMerge에 등록해야 한다

`lib/utils.ts`의 `cn()`이 `extendTailwindMerge`로 `text-mono`를 **font-size 그룹**에 등록한다.

**안 하면 twMerge가 커스텀 `text-*`를 text-color로 오분류한다.** `cn("text-mono", "text-foreground")`에서 `text-mono`가 조용히 제거되고, base `text-xs`와도 dedupe되지 않는다. bugshot-2가 액션 로그 값 칩에서 정확히 이 함정을 밟았다.

⚠️ **twMerge는 `cn()` 안에서만 일한다.** 정적 문자열 `"text-mono text-xs"`는 dedupe되지 않고 Tailwind v4가 알파벳순으로 정렬해 `text-xs`가 이긴다 → 12px sans. 같은 font-size 그룹을 한 문자열에 두 번 쓰지 않는다 (2026-09-06 slug·초대 링크 두 곳에서 실제로 그랬다).

### 4.3 mono 리거처

mono 폰트를 시스템 스택으로 두는 동안은 해당 없다. **Geist Mono·JetBrains Mono(GitLab Mono의 기반) 같은 리거처 폰트를 도입하면 `font-variant-ligatures: none`을 켠다** — `--`를 2셀에서 1셀로 붕괴시키고, 우리 키에 `_`·`.`이 흔해 같은 계열 문제가 난다. `font-feature-settings`가 아니라 `font-variant-ligatures`를 쓴다(전자는 가산이 아니라 통째로 덮어쓴다). 시스템 스택을 유지하기로 했다(2026-09-07).

## 5. 간격 · Radius · 레이아웃

- `--radius: 0.625rem`. shadcn 관용대로 `--radius-sm/md/lg/xl`이 `calc()`로 파생된다. 컨트롤은 `rounded-md`, 카드·패널은 `rounded-lg`.
- 간격은 Tailwind 기본 스케일. **섹션은 `space-y-4`, 컨트롤 묶음은 `space-y-2`, 카드·표 셀 패딩은 `px-4 py-3`** — 실사용을 따랐다(2026-09-06 실측).

### 5.1 레이아웃 치수 — GitLab에서 가져온 것 (2026-09-07)

배치는 GitLab을 따르되 **값은 우리 스케일로 반올림**했다(GitLab 실측은 §11).

| 항목 | 값 | GitLab |
|---|---|---|
| **사이드바 폭** | `w-60` (240px) | `$super-sidebar-width: 15rem` |
| **top bar 높이** | `h-12` (48px) + 하단 1px `border` | `$header-height: 3rem + 1px` |
| 사이드바 항목 높이 | `h-8` (32px), 아이콘 16을 `size-6` 박스에 | nav item ≈ 32px |
| **콘텐츠 최대 폭 (limited)** | `max-w-4xl` (896px) — 폼·설정·목록·계정·온보딩·초대 | `$limited-layout-width: 1006px` (우리 스케일 대응값) |
| 콘텐츠 fluid | 번역 표 — 전폭, 표만 자기 컨테이너 안에서 가로 스크롤 | 표 화면은 fluid |
| 콘텐츠 패딩 | `px-6 py-6` | 12~24 |
| 사이드바 접힘 기준 | **`xl`** — 이상은 아이콘 레일로 접기(`localStorage`), 미만은 햄버거로 여는 오버레이 | 1200px |
| 드롭다운 패널 | `min-w-60 max-w-md` | 248~456px |
| 모달 | `max-w-lg` (512px) | modal sm 512 |

**페이지 셸은 둘이다**: **셸 안**(`(edit)` — 사이드바 + top bar + `max-w-4xl` 또는 fluid) / **셸 밖 카드**(로그인 2열 · 초대 수락 `mx-auto max-w-sm`). 새 화면은 둘 중 하나다.

## 6. 편집 UI 특화 규칙

라우트는 여덟이다 (user-stories.md 순서) — 로그인 · 목록 · 새 프로젝트 · **번역** · **멤버** · 설정 · **계정** · 초대 수락. 공통 형은 §6.4.

### 6.1 번역 표

화면은 `| Key | en (base) | ko | fr |`이고 **모든 셀이 편집 가능**하다 (base 포함 — 고정된 것은 키뿐이다). **예외는 orphaned**다 — 키든 로케일이든 어느 축이 orphaned면 그 셀은 `disabled` + placeholder "Not editable — removed from the code".

**셀 메타는 배지 + 편집자**다: "Edited by {name}"을 `text-muted-foreground text-xs`로 붙이고, **이름이 없으면 마스킹한 이메일**이다(`s***@example.com` — 이 표는 멤버 전원이 본다). **`updatedBy`가 없으면 편집자 표기가 없다** — push가 덮은 셀이 그 상태다(design §3.6). ⚠️ `Translation.updatedBy`에 `User.id`와 옛 GitHub 핸들이 섞여 있어 **못 찾은 값은 원문이 그대로 보인다** — 그게 정상 폴백이다 (malmoi#3).

| 요소 | 규칙 |
|---|---|
| 키 이름 | **`text-mono`** (§4.1) + Orphaned 배지 |
| `description` | `text-xs text-muted-foreground` — **`background` 표면 위일 때만** (§2.2) |
| 코드 참조 | `text-xs text-blue-600 underline` + `ExternalLink` 12px (§6.3) |
| 번역 입력 | `Textarea` `rows=1` + `field-sizing-content`(미지원 브라우저는 1행), `text-sm` |
| 저장 상태 | 셀 안 `role="status"` 한 줄 — Saving… / Saved(1.5초 뒤 소거) / Couldn't save: … (`text-destructive`). 실패 시 포커스가 그 입력으로 돌아온다 |
| 헤더 | `bg-muted/50` + `sticky top-0`. 글자는 `text-foreground/60` — **`text-muted-foreground`가 아니다** (§2.2). `(base)` 표기도 같은 규칙 |
| 열 순서 | **base가 맨 앞**, 나머지는 코드순 |
| 행 | `px-4 py-3` · `divide-y` · hover `bg-muted/40` · `align-top` |

**넓은 표는 자기 컨테이너에서만 스크롤한다** (`overflow-x-auto`). 로케일이 6개면 표가 화면을 넘고, 페이지 본문이 좌우로 흔들리면 사이드바까지 밀린다.

**"Translated"에는 배지를 붙이지 않는다** — 가장 흔한 상태가 가장 조용해야 한다 (§6.2와 같은 원리). 같은 이유로 **"From repository" 같은 표시도 두지 않는다**.

### 6.2 상태 색 — 배지 3종 + 연결 건강성 6종 + Alert 4종, 색 체계는 하나

**축이 셋이고 색 체계는 하나다.** amber는 **경고**, destructive는 **글자색 전용 오류**, 나머지는 무색이다. **semantic 토큰으로 표현 못 하는 상태 색**이라 raw 색을 쓰되, 라이트 단일이므로 `dark:` 짝을 두지 않는다.

| 상태 | 색 | 근거 |
|---|---|---|
| 미번역 | 무색 — `text-muted-foreground` "Untranslated" | 없음은 상태가 아니라 부재다. 색을 주면 셋 중 가장 흔한 것이 가장 시끄러워진다 |
| 검토필요 (`needsReview`) | **amber** — `Badge warning` = `bg-amber-100/80 text-amber-800` | 경고지 오류가 아니다 |
| orphaned | **red 계열 글자만** — `Badge danger` = `text-destructive` (배경 없음) | §2.3대로 글자색 전용. 배경을 주면 "삭제됨"으로 읽히는데 실제로는 되돌릴 수 있다. **키 행과 로케일 헤더 두 축에 같은 표기** |

**연결 건강성 6종** (설정 화면): `ok`·`not-connected`·`unknown` → 무색 `Badge muted` / `repo-moved` → **amber** / `app-uninstalled`·`installation-changed` → **`text-destructive` 글자만**. ⚠️ **`unknown`을 `app-uninstalled` 색으로 접지 않는다** — 조회 실패를 "제거됨"으로 보여주면 사용자가 멀쩡한 설치를 다시 만든다.

**첫 적재 상태 3종** (`planProjectReadiness`): `ready` → **표시 없음**(`readinessLabel`이 `null`) / `awaiting_first_sync`·`setup` → 무색 `Badge muted`. 오류가 아니라 진행 중이다.

**Alert 4종** (§6.4 — Publish 결과·편집 손실 배너·페이지 수준 거부):

| variant | 색 | 쓰는 곳 |
|---|---|---|
| `info` | `border-border bg-muted/40` + `Info` 아이콘 `text-muted-foreground` | "Nothing to publish" |
| `success` | `border-border bg-background` + `CircleCheck` 아이콘 `text-foreground` | Publish 성공 둘 — **초록을 쓰지 않는다**(raw 색을 늘리지 않는다). 성공은 조용하다 |
| `warning` | `border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert` | 편집 손실 배너 · Publish "일부 미기록" · `repo-moved` |
| `danger` | `border-destructive/40 bg-background text-destructive` + `CircleX` | Publish 실패 · 페이지 수준 거부(`?e=`) · 블록 안 컨트롤 실패 |

⚠️ **내부 이름을 화면에 쓰지 않는다** — `awaiting_first_sync`는 번역자에게 아무것도 알려주지 않는다 (SAAS §3). 문구는 `messages/en.json`이 든다.

**새 raw 색을 늘리지 않는다.** 등재된 것이 전부다 — **amber**(`100/80`·`800`, Alert용 `50`·`200`·`900`)·**destructive**, 그리고 §6.3의 외부 링크 **blue-600**. 초록·주황·보라는 없다.

### 6.3 외부 링크

**리포 밖으로 나가는 링크는 전부 `text-blue-600 underline` + `ExternalLink` 12px 아이콘**이다 — 코드 참조 permalink · Publish 결과의 PR 링크 · App 설치 링크 · GitHub 프로필. `target="_blank" rel="noreferrer"`. 내부 링크(사이드바·breadcrumb·목록 행)는 밑줄 없이 `text-foreground`/`text-muted-foreground`다.

### 6.4 공통 형 — 프리미티브가 든다 (2026-09-07)

옛 판의 "hand-rolled 컨트롤 클래스 표"는 사라졌다. **형은 `components/ui/`의 variant이고 화면은 raw 태그를 쓰지 않는다** — `focus-ring.test.ts`가 `ui/` 밖의 `<button>`·`<input>`·`<select>`·`<textarea>`를 0개로 고정한다(§7). 색은 전부 §2의 토큰이다.

| 프리미티브 | 형 (옛 표의 어느 행을 잇나) |
|---|---|
| **Button** `primary` | `bg-primary text-primary-foreground hover:bg-primary/90` · `h-8 px-3 text-sm font-medium rounded-md` — 옛 "primary 버튼". **화면당 하나**(확정 액션) |
| **Button** `default` | `border border-input bg-background hover:bg-accent text-foreground` · 같은 치수 — 옛 "bordered(페이지·툴바)"를 하나로. 툴바도 `h-8`이다 |
| **Button** `danger` | `default` + `text-destructive border-destructive/40 hover:bg-destructive/5` — `bg-destructive` 없음(§2.3). 멤버 제거·연결 해제·초대 취소 |
| **Button** `ghost` | 배경·테두리 없음 · `text-muted-foreground hover:text-foreground` — 옛 "텍스트 버튼"(밑줄 제거). 툴바 보조·아이콘 버튼·사이드바 |
| **Button** `link` | `text-blue-600 underline` 인라인 — "Sign in with another account" |
| **Button** `size="sm"` | `h-7 px-2 text-xs` — 표 안·배지 옆 |
| **Button** `disabled` | `disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent`(default·ghost) / `disabled:opacity-70`(primary) — 옛 규칙 그대로 |
| **Button** `loading` | **라벨 교체**("Saving…") + disabled. 옆 문구가 아니다(폭이 흔들린다). **목록 안에서는 누른 버튼 하나만** 교체한다 |
| **Input·Textarea·Select** | `h-8 px-2 text-sm border border-input bg-background rounded-md` · invalid `border-destructive` · disabled `bg-muted text-muted-foreground` — 옛 "입력(페이지·툴바)"을 하나로 |
| **FormGroup** | label `text-sm font-medium` · help `text-xs text-muted-foreground` · error `text-xs text-destructive` · "(optional)" `font-normal` |
| **Checkbox·Radio** | 16px · `border-input` · checked `bg-primary border-primary` · label `text-sm` |
| **Badge** | `text-xs rounded px-1.5 py-0.5` · variants `muted`(`text-muted-foreground`, 배경 없음)·`warning`(amber)·`danger`(`text-destructive`) — §6.2 |
| **Alert** | `rounded-lg border p-4` · 좌측 아이콘 16 · 제목 `text-sm font-medium` · 본문 `text-sm` ≤ 2문장 + 다음 행동 · 액션 최대 2 · 닫기 우상단 `ghost sm`. variant 넷은 §6.2. **배치 셋** — global(top bar 아래 전폭 — `?e=` 거부) · page-level(제목 아래 — 편집 손실 배너·Publish 결과) · in-block(설정 블록 안 — 컨트롤 실패) |
| **Card** | `border-border rounded-lg border` · 헤더(`px-4 py-3 border-b` 제목 `text-sm font-medium` + 우측 슬롯) · 본문 `p-4 space-y-2` — 옛 "섹션 카드" |
| **Table** | §6.1 |
| **Breadcrumb** | `text-xs` · 항목 `text-muted-foreground hover:text-foreground` · 마지막 `text-foreground font-medium` `aria-current="page"` · 구분자 `/` `text-muted-foreground/60 px-2` |
| **DropdownMenu** | `min-w-60 rounded-lg border bg-popover shadow-md py-1` · 항목 `mx-1 px-2 py-1.5 rounded text-sm hover:bg-accent` · selected `bg-muted` + `Check` 16 |
| **Dialog** | `max-w-lg rounded-lg border bg-background shadow-lg` · 제목 `text-base font-medium` · 본문 `p-4 text-sm` · 푸터 `p-4 pt-2 gap-2` 버튼 최대 3(primary·default·ghost cancel) · 배경 `bg-foreground/40` · Esc·배경·X·Cancel 넷으로 닫힌다 |
| **Tooltip** | `bg-foreground text-background text-xs px-2 py-1 rounded shadow-md` · 접힌 사이드바의 아이콘 라벨에만 |
| **Avatar** | 사람 = `rounded-full`, 프로젝트 = `rounded`(라운드 사각) · 16/24/32 · 이니셜 폴백 `bg-muted text-foreground/60` |
| **EmptyState** | 제목 `text-base font-medium` ≤5단어 마침표 없음 · 설명 `text-sm text-muted-foreground` 완전 문장 · 액션 **버튼 하나** · 일러스트 없음 |
| **값 칩** | `text-mono bg-muted rounded px-2 py-1` — `text-xs`를 겹치지 않는다(§4.2). 블록 요소면 `inline-block` |
| **코드 블록** | `<pre className="text-mono bg-muted overflow-x-auto rounded-md p-3">` + 우상단 `ghost sm` [Copy] → 라벨 교체 "Copied" |

**빈 상태 문체**: 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, 버튼 하나 (§10).

### 6.5 앱 셸 — 사이드바와 top bar (GitLab super sidebar 형, 2026-09-07)

레이아웃만 GitLab이다. 색은 §2다.

| 요소 | 규칙 |
|---|---|
| 사이드바 | `w-60 shrink-0 bg-muted border-r border-border` (§5.1) · `xl` 이상에서 아이콘 레일(`w-12`)로 접기 · `xl` 미만은 햄버거로 여는 오버레이 + `bg-foreground/40` 배경 |
| 브랜드 | `h-12 px-4` "Malmoi" 워드마크 `text-sm font-medium` |
| 프로젝트 컨텍스트 | `mx-2 my-1 px-2 py-2 rounded-md` · 아바타 24 라운드 사각 + 이름 `font-medium truncate` + `ChevronDown` 16 → DropdownMenu(내 멤버십 목록 + "All projects"). **프로젝트 밖 라우트(`/projects`·`/projects/new`·`/account`)에는 없다** |
| 섹션 항목 | `h-8 mx-2 px-2 rounded-md text-sm flex items-center gap-2` · 아이콘 16(`Languages`·`Users`·`Settings`) · **비활성 `text-foreground/70 hover:text-foreground`(muted 표면이라 §2.2·§2.1 — `hover:bg-accent`는 무효)** · **선택 `bg-background text-foreground font-medium shadow-sm`**(흰 알약 — GitLab의 선택 배경을 우리 토큰으로 옮긴 것) · 우측 카운트 `text-xs text-foreground/60` |
| 항목 셋 | Translations · Members* · Settings* (* OWNER에게만 렌더 — 편의다, 방어는 페이지) |
| 구분선 | `mx-4 my-3 border-t border-border` |
| 하단 전역 항목 | All projects · Account · Sign out · **Collapse sidebar**(`PanelLeft`) — 같은 항목 형 |
| top bar | `h-12 bg-background border-b border-border px-4 flex items-center justify-between` · 좌 = 햄버거(`xl` 미만) + `Breadcrumb` · 우 = 아바타 32 원형 `ghost` 버튼 → DropdownMenu(이름·이메일 → Account · Sign out) |
| 콘텐츠 | `flex-1 min-w-0` · limited면 `mx-auto max-w-4xl px-6 py-6` · fluid(번역)면 `flex min-h-0 flex-1` |

GitLab top bar의 검색·`+`·카운터 셋은 **넣지 않는다** — 대응물이 없고 SAAS §4.2가 기능 밀도를 막는다. **Publish 버튼은 셸에 없다** — 번역 화면 툴바다(셸은 `/projects`도 감싸 slug를 모른다).

### 6.6 설정 (`/projects/[slug]/settings`) — settings-block 넷

블록 = `Card` 한 장(제목 + 한 줄 설명 `text-xs text-muted-foreground` + 본문). 위에서 아래로 **Repository**(연결 상태·[Reconnect]·**Base branch·Base language 폼**) · **Import status** · **Push token** · **Workflow**, 그 아래 한 줄 "GitHub account — Connected as @handle · Manage in Account".

- ⚠️ **블록이 독립적으로 실패한다.** 건강성은 App 토큰, 계정 한 줄은 사용자 토큰 — 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다. 각 블록이 자기 오류를 `Alert danger`(in-block)로 낸다.
- **push 토큰은 발급 응답에만 원문이 있다** — 값 칩 + [Copy] + "You won't see this again. Update the repository secret now."
- **[Run first import]의 결과 컴포넌트는 readiness 분기 밖**에 있다 (POSTMORTEM 2026-09-07 revalidate).
- **Base branch·Base language 저장 뒤에는 `Alert warning`이 블록 안에 남는다** — "Update the workflow file — until then CI pushes are rejected" (design §3.13, `checkFormat` 409).
- 페이지 수준 거부(`?e=`)는 **global Alert**, 컨트롤의 실패는 **in-block Alert** — 두 층을 섞지 않는다.

### 6.7 새 프로젝트 (`/projects/new`)

②~⑥이 한 라우트의 클라이언트 상태다 (`features/project-onboarding/design.md` §2 — 바꾸지 않는다). 형만 바뀐다:

| 요소 | 규칙 |
|---|---|
| ①①' 빈 상태 3갈래 | `EmptyState` — 계정 미연결 → `primary` [Connect GitHub] / 설치 없음 → 외부 링크 "Install the app" / 리포 없음 → "Add repositories to the installation". ⚠️ `GITHUB_APP_SLUG`가 없으면 링크가 사라지고 "Ask your administrator to install the app"으로 떨어진다 |
| 섹션 셋 | `Card` 셋이 아래로 열린다 — Repository · Locale files · Name |
| 리포 목록 | `divide-y divide-border` + 위 `Input`(필터). `owner/name`은 **mono**. 누른 행의 버튼만 "Detecting…" |
| 후보 목록 | `Radio` 목록. 선택 행 `bg-muted font-medium`(`cn()`) |
| 경로 템플릿 | **mono.** `{locale}` 자리를 "the language goes here"로 한 줄 |
| 기준 언어 | `Radio`, 기본은 `pickBaseLocale`. 코드는 mono |
| 수동 지정 | `<details>` — 후보가 있으면 접힘, `no-candidates`면 **펼친 채 주 행동** |
| ⑤⑥ 결과 카드 | 토큰 값 칩 + [Copy] · YAML 코드 블록 + [Copy] 라벨 교체 "Copied" · "Imported N keys" / 부분 실패 목록 "Could not read {path}"(`text-sm text-destructive`) + 원문 진단은 `<details>` 안 `text-mono text-xs` · [Open translations] `primary` |

⚠️ **어댑터 내부 이름을 화면에 쓰지 않는다** (SAAS §3). 라벨은 서버가 `formatLabel`로 만들어 내려준다 — 그 모듈을 클라이언트가 **값으로** import하면 어댑터 전부(ts-morph)가 번들에 들어온다 (POSTMORTEM 2026-09-07).

## 7. 접근성

- **대비 하한 AA(4.5:1)**. §2.2가 가장 흔한 위반 경로다 — 사이드바가 muted 표면이 되면서 그 자리가 늘었다.
- **포커스 링 셋** — `focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none`. **셋은 `components/ui/` 안에 있다.** 화면이 raw 태그를 쓰지 않으므로 옛 판의 "태그마다 리터럴로, 상수에 숨기지 말 것"은 사라졌다 — `components/__tests__/focus-ring.test.ts`가 (1) `ui/`의 네 태그가 셋을 드는지, (2) `ui/` 밖에 네 태그가 **0개**인지 둘을 센다. 옛 규칙이 있던 이유(hand-rolled라 기본값이 지켜 주지 않았다 — 2026-09-06·07 두 번 샜다)가 프리미티브로 없어졌다.
- `--ring` == `--border`라서 **`muted` 표면 위에선 포커스 링이 약하다** — 사이드바 항목·값 칩 옆 버튼에 `focus-visible:ring-offset-1`을 더한다(offset 색 기본이 배경).
- **저장 상태는 `role="status" aria-live="polite"`** 고, 실패 시 포커스가 그 입력으로 돌아간다 (design §3.8).
- 아이콘만 있는 버튼은 `aria-label`. 사이드바 접힘 상태의 라벨은 Tooltip **과** `aria-label` 둘 다.
- 드롭다운·모달은 Radix가 포커스 트랩·Esc·`aria-*`를 든다 — 직접 만들지 않는다.

## 8. className & 변형

- 조건부 클래스는 **항상 `cn()`** 을 지난다 (§4.2의 twMerge 등록 때문에 특히). 삼항으로 문자열을 고르는 것도 조건부 클래스다.
- 변형이 셋 이상이면 `class-variance-authority`(Button·Badge·Alert). 둘 이하면 인라인 삼항이 낫다.
- 프리미티브는 `className`을 받아 **끝에** 병합한다(`cn(base, variants, className)`) — 호출부가 폭·여백만 덧댄다. 색·높이를 호출부에서 덮으면 형이 갈린다.

## 9. SaaS UI 레퍼런스 — GitLab (2026-09-07 결정, Supabase에서 변경)

**레퍼런스가 정하는 것은 레이아웃·정보구조·컴포넌트 구성이다. 색·타입·간격은 정하지 않는다** — 그건 §2·§4·§5 앞부분의 우리 토큰이다.

Supabase를 골랐던 이유(2026-09-05)는 "개발자 도구이면서 비개발자도 쓰는 밀도, 프로젝트 전환이 일급인 정보구조"였다. GitLab이 그 둘을 더 직접 갖고 있고, 결과물이 PR이라 **사용자가 이미 그 화면 안에 있다** — 같은 배치를 쓰면 "내가 고친 것이 저기로 간다"가 화면에서 이어진다 (spec §2.5).

### 9.1 가져오는 것

| 축 | 무엇 | 어디 |
|---|---|---|
| **super sidebar** | 브랜드 → 프로젝트 컨텍스트(전환 메뉴) → 섹션 항목 → 하단 전역 항목 · 접힘 | §6.5 |
| **top bar** | breadcrumb 좌 · 사용자 메뉴 우 · 48px | §6.5 |
| **콘텐츠 폭 둘** | 폼·설정은 limited, 표는 fluid | §5.1 |
| **settings-block** | 제목 + 설명 + 본문 카드가 세로로 쌓인다 | §6.6 |
| **표 구성** | 헤더 sticky · 행 hover · 세로선 없음 · 마지막 행에도 하단선 | §6.1 |
| **Alert 배치 셋** | global / page-level / in-block | §6.4 |
| **빈 상태 패턴** | 짧은 제목 · 문장 하나 · 버튼 하나 | §6.4 |
| **로그인 2열** | 폼 좌 · 장식 우(스크린샷 2) | user-stories §1 |
| **문장 규칙** | sentence case · 라벨에 마침표 없음 · 결과를 말하는 버튼 | §10 |

### 9.2 가져오지 않는 것

- **색 팔레트·시맨틱 토큰** (Pajamas neutral/blue/…). 토큰의 진실은 `app/globals.css`(slate)이고 새 raw 색을 늘리지 않는다(§6.2).
- **타입 스케일·폰트**(GitLab Sans·GitLab Mono)·**간격·radius 값**. 우리 스케일로 반올림한다(§5.1).
- **다크 모드** (§3).
- **top bar의 검색·`+`·카운터**, **기능 밀도**(사이드바 항목 십수 개). SAAS §4.2.
- **Vue 컴포넌트(`@gitlab/ui`)·아이콘 세트(`gitlab-svgs`)** — lucide 16px로 대응.
- **일러스트**(빈 상태 SVG) — 로그인 우측 장식은 CSS dot-grid + 인라인 SVG 카드 하나뿐이다(design §3.12).

### 9.3 판정 기준

"GitLab처럼 보이는가"로 판정하지 않는다. **§9.1의 아홉 축 중 어긋난 것이 있는가**로 본다 — 그래야 "GitLab처럼 보이게" 다듬는 작업이 색·폰트로 새지 않는다.

## 10. UI 문장 규칙 (en — design.gitlab.com/content에서 가져온 것, 2026-09-07)

문자열은 `messages/en.json`에 있고(design §3.1) 이 절이 그 문체다.

- **Sentence case.** 라벨·열 제목·버튼·제목 전부.
- **UI 요소 라벨에 마침표 없음**(버튼·라벨·제목·배지). help text·Alert 본문 같은 완전 문장에는 있음. **느낌표 금지.**
- **줄임표 `…`** 는 진행 중("Saving…")과 추가 입력이 필요한 행동에만. 앞에 공백 없음.
- **버튼은 결과를 말한다** — "Save"가 아니라 "Create link"·"Remove member". 파괴 행동은 **무엇을** 파괴하는지 라벨에.
- **오류는 무엇이 일어났고 어떻게 풀지를 말한다.** "Sorry"·"Whoops"·"please" 금지. 다음 행동 없는 오류를 내지 않는다.
- **Alert 제목은 구두점 없는 문장 조각**, 본문 ≤2문장 + 다음 단계. variant는 **뜻**으로 고른다.
- **모달 제목은 대상을 명시한 질문**("Remove Jane Doe from bugshot-2?"), 액션 라벨은 결과("Remove member").
- 능동태·**축약형 선호**(can't, won't, you're)·숫자는 숫자로.
- **git 어휘를 편집자 화면에 쓰지 않는다** (`lib/pull/message.ts`의 옛 결정) — "PR opened"가 아니라 "Sent for review". 링크 라벨만 "View pull request"다(그 링크가 실제로 PR로 가므로).

## 11. 출처 (레이아웃 실측)

§5.1·§6.5의 GitLab 값은 2026-09-07에 읽은 gitlab `app/assets/stylesheets/framework/{variables,super_sidebar,layout,header,top_bar}.scss` ·
`app/assets/javascripts/super_sidebar/components/*.vue` · gitlab-ui `src/scss/variables.scss`·`src/components/base/{table,alert,card,breadcrumb,modal,new_dropdowns}` ·
design.gitlab.com `/product-foundations/layout` · `/components/{table,alert,card,breadcrumb,modal}` · `/patterns/empty-states` · `/content/{ui-text,punctuation,error-messages}`에서 왔다.
못 확인한 것: super sidebar 선택 항목의 정확한 배경(테마 변수 정의 파일 미발견 — 우리는 `bg-background` 알약으로 정했다).

## 빠른 체크리스트 (새 UI 만들 때)

- [ ] `dark:`를 새로 쓰지 않았나 (§3)
- [ ] 식별자(키·slug·URL·경로)에 `text-mono`를 썼고 `text-xs`를 겹치지 않았나 (§4.1·§4.2)
- [ ] raw `<button>`·`<input>`·`<select>`·`<textarea>`를 쓰지 않고 프리미티브를 지났나 (§6.4·§7)
- [ ] `muted` 표면(사이드바·표 헤더·칩) 위에 `text-muted-foreground`·`hover:bg-accent`를 쓰지 않았나 (§2.1·§2.2)
- [ ] `bg-destructive`를 쓰지 않았나 — 글자색 전용이다 (§2.3)
- [ ] 새 raw 색을 늘리지 않았나 — amber·destructive·blue-600뿐 (§6.2)
- [ ] 조건부 클래스가 `cn()`을 지나나 (§8)
- [ ] 임의값(`text-[…]`) 대신 스케일을 썼나 (§4)
- [ ] 문자열이 `messages/en.json`에서 오고 §10의 문체인가
- [ ] 외부 링크에 `ExternalLink` 아이콘이 있나 (§6.3)
- [ ] 결과를 인라인으로 보이는 컴포넌트가 `revalidatePath`가 바꾸는 분기 밖에 있나 (§6.6)
- [ ] (셸) §9.1의 아홉 축과 어긋나지 않았나 — 색·폰트를 GitLab에 맞추려 하지 않았나 (§9.2)
