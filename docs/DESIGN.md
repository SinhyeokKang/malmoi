# DESIGN.md

편집 UI의 시각 규칙. **`~/code/bugshot-2`의 `docs/DESIGN.md`를 원본으로 이식했고**, 두 축이 다르다: Tailwind **v4**(그쪽은 v3)이고 **라이트 단일**(그쪽은 라이트/다크 양쪽)이다. 그 차이가 만드는 함정을 §1·§3에 적었다.

무엇을 만드는지는 [MVP.md](./MVP.md), 불변식은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. 기반 스택

| | 값 | bugshot-2와의 차이 |
|---|---|---|
| Tailwind | **v4** — `tailwind.config.js`가 **없다**. 테마는 `app/globals.css`의 `@theme inline` | v3 + config 파일 |
| shadcn | CLI `shadcn@4.19.0`, style `new-york`, `rsc: true` | 같은 style, `rsc: false` |
| Radix | `radix-ui` **단일 패키지** (`import { Slot } from "radix-ui"`) | `@radix-ui/react-*` 개별 |
| 애니메이션 | `tw-animate-css` | `tailwindcss-animate` |
| 폰트 | Pretendard Variable 동적 서브셋, 자사 호스트 | 같은 폰트, `@fontsource` |
| 테마 | **라이트 단일** | 라이트/다크 |

**v4에서 `@theme inline`의 의미**: 토큰 값은 `:root`에 CSS 변수로 두고, `@theme inline`이 그걸 Tailwind 유틸 이름에 연결한다. v3의 `tailwind.config.js` `colors: { border: "hsl(var(--border))" }`에 해당한다. **`inline`을 빼면** 변수가 한 겹 더 감싸져 `@apply`·임의값에서 다르게 해석되므로 지우지 않는다.

## 2. 색상 (디자인 토큰)

`components.json`의 `"baseColor"`는 **shadcn CLI 생성 시드일 뿐이다.** `cssVariables: true`라 생성 컴포넌트는 semantic 토큰만 참조하고, **실제 값의 진실은 `app/globals.css`다.** `shadcn add`가 새 토큰을 append하면 손으로 맞춘다.

**팔레트는 `slate`다** (푸른 틴트). bugshot-2가 라이트=slate / 다크=neutral로 갈랐던 이유는 "같은 채도가 저명도에서 배경을 남색으로 물들여 칙칙하게 읽힌다"는 것인데, **라이트 단일이라 그 비대칭이 필요 없다** — 고명도에서 slate의 틴트는 순백 배경 위에서 맑게 읽히는 쪽이다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 페이지 바탕 / 기본 텍스트 |
| `primary` (+`-foreground`) | 주요 CTA·강조 |
| `secondary` (+`-foreground`) | 보조 버튼 |
| `muted` (+`-foreground`) | 보조 텍스트·비활성 배경 |
| `accent` (+`-foreground`) | hover 강조 |
| `destructive` (+`-foreground`) | 위험·오류 |
| `card` / `popover` (+`-foreground`) | 카드·팝오버 표면 |
| `border` / `input` / `ring` | 테두리 · 입력 테두리 · 포커스 링 |

### 2.1 ⚠ `accent` == `secondary` == `muted`가 같은 값이다

세 토큰이 모두 `210 40% 96.1%`다. 위 표의 "용도"는 **의미 구분이지 시각 구분이 아니다.** 귀결:

- **`muted`·`secondary` 표면 위 컨트롤에 `hover:bg-accent`는 무효다** (hover 피드백 0).
- shadcn `outline` 버튼의 `bg-background → hover:bg-accent`는 **`background` 표면 위를 전제한 관용구**다. muted 표면으로 옮기면 방향이 뒤집힌다.
- 그런 자리의 hover는 배경이 아니라 **등장(opacity)·글자색·그림자**로 낸다.

### 2.2 ⚠ 글자 대비는 토큰 이름이 아니라 "무슨 표면 위냐"가 정한다

같은 `--muted-foreground`가 `--background`(흰색) 위에선 **4.75:1**로 AA를 넘지만 `--muted` 위에선 **4.34:1로 미달**한다.

**`muted` 표면 위 글자에 `--muted-foreground`를 반사적으로 쓰지 말 것.** 옅게 깐 `--foreground`(예: `text-foreground/60`)가 AA를 넘으면서도 본문보다 약하다.

우리 편집 UI에서 이게 걸릴 자리: **키 리스트의 행 배경**(선택·hover 시 muted 계열), **네임스페이스 사이드바의 비활성 항목**, **`orphaned` 배지**.

### 2.3 `--destructive`는 글자색 전용이다

`text-destructive`로만 쓴다. shadcn의 `variant="destructive"`(`bg-destructive`)는 쓰지 않는다.

값은 **red-600 (`0 72.2% 50.6%`)** 이고 흰 배경에서 4.83:1로 AA를 넘는다. shadcn 기본값 red-500은 흰 배경에서 **3.76:1로 미달**이라 쓰지 않는다.

## 3. 라이트 단일 — `dark:`를 쓰지 않는다

**`dark:` variant를 새로 쓰지 않는다.** 다크 모드는 비범위다.

### 3.1 강제 장치 — `@custom-variant`를 지우지 말 것

```css
@custom-variant dark (&:is(.dark *));
```

`app/globals.css` 4행이다. **이 줄이 라이트 고정의 유일한 장치다.**

Tailwind v4는 `dark:`의 기본 동작이 **`prefers-color-scheme`** 이다. 이 줄이 그걸 클래스 기반으로 덮어쓰고, `.dark` 클래스를 **DOM에 어디에도 붙이지 않으므로** `dark:` 유틸이 컴파일돼도 절대 매치되지 않는다.

**이 줄을 지우면** shadcn 생성 컴포넌트에 이미 들어 있는 `dark:` 클래스 6개(`button.tsx` 4 · `input.tsx` 2 — `dark:bg-input/30`, `dark:aria-invalid:ring-destructive/40` 등)가 **OS 다크 설정에서 살아나** 의도치 않게 적용된다. 라이트 단일이 조용히 깨지는 경로다.

`shadcn add`가 만드는 `dark:` 클래스는 **그대로 둔다** — 위 장치로 죽어 있고, 지우면 CLI 재실행 때 되살아나 diff만 늘어난다.

### 3.2 `.dark` 토큰 블록이 없다

`:root` 하나뿐이다. 다크 값을 되살리려면 `.dark` 블록을 추가하고 §2의 비대칭 판단(라이트 slate / 다크 neutral)을 다시 해야 한다 — 그건 bugshot-2 `docs/DESIGN.md` §2에 근거가 있다.

## 4. 타이포그래피

- **`font-sans`**: Pretendard Variable → 시스템 한/영 폴백. 폰트 파일은 **동적 서브셋 생성물**이라 `public/fonts/`가 gitignore돼 있다 (CLAUDE.md 폰트 절).
- 크기 관용: **`text-xs`·`text-sm`이 지배적**(라벨·필드·보조 텍스트). `text-base`=본문, `text-lg`=섹션 제목.
- **임의값(`text-[…]`)은 스케일에 대응값이 없을 때만.** 12px은 `text-xs`, 14px은 `text-sm`이 있으므로 임의값으로 쓰지 않는다.

### 4.1 mono 표면 불변식 — 13px / 18px

**번역 키는 mono 표면이다.** `common.viewAll`·`popup_title`은 식별자고 산문이 아니다 — sans로 깔면 `l`/`1`/`I`와 `_`/`.`이 구분되지 않아 번역자가 키를 잘못 읽는다.

값은 `:root`의 **단일 출처**에서 나온다:

```css
--mono-size: 13px;
--mono-leading: 18px;
```

소비 경로는 **`text-mono` 유틸 하나**다 (`@theme inline`의 `--text-mono`). bugshot-2는 소비 경로가 넷이라 "하나만 놓치면 조용히 갈라진다"는 경고가 붙었지만, 우리는 CodeMirror·Tiptap·별도 번들이 없어 경로가 하나다. **그 상태를 유지한다** — 두 번째 경로가 생기면 그 경고가 우리에게도 적용된다.

- **13px인 이유**: 12px이 작고, 14px는 mono 자폭이 sans의 1.2배라 트렁케이션·가로 스크롤이 함께 늘어난다.
- **`text-[13px]`가 아니라 `text-mono`를 쓴다.** 임의값은 행간이 따라오지 않아 표면마다 갈린다.

### 4.2 ⚠ `text-mono`를 twMerge에 등록해야 한다

`lib/utils.ts`의 `cn()`이 `extendTailwindMerge`로 `text-mono`를 **font-size 그룹**에 등록한다.

**안 하면 twMerge가 커스텀 `text-*`를 text-color로 오분류한다.** `cn("text-mono", "text-foreground")`에서 `text-mono`가 조용히 제거되고, base `text-xs`와도 dedupe되지 않는다. bugshot-2가 액션 로그 값 칩에서 정확히 이 함정을 밟았다.

### 4.3 mono 리거처

mono 폰트를 시스템 스택으로 두는 동안은 해당 없다. **Geist Mono 같은 리거처 폰트를 도입하면 `font-variant-ligatures: none`을 켠다** — Geist Mono는 `--`를 2셀에서 1셀로 붕괴시키고, 우리 키에 `_`·`.`이 흔해 같은 계열 문제가 난다. `font-feature-settings`가 아니라 `font-variant-ligatures`를 쓴다(전자는 가산이 아니라 통째로 덮어쓴다).

## 5. 간격 & Radius

- `--radius: 0.625rem`. shadcn 관용대로 `--radius-sm/md/lg/xl`이 `calc()`로 파생된다.
- 간격은 Tailwind 기본 스케일. **카드 안 패딩은 `p-4`, 섹션 간격은 `space-y-4`** 를 기본으로 둔다.

## 6. 편집 UI 특화 규칙

MVP §3.2가 정한 화면은 **네임스페이스 사이드바 → 키 리스트 → 인라인 편집** 하나다.

### 6.1 키 테이블

화면은 `| key | en(base) | ko | fr |`이고 **모든 셀이 편집 가능**하다 (base 포함 — 고정된 것은 키뿐이다).

| 요소 | 규칙 |
|---|---|
| 키 이름 | **`text-mono`** (§4.1) |
| `description` | `text-xs text-muted-foreground` — **`background` 표면 위일 때만** (§2.2) |
| 번역 입력 | 셀마다 `TranslationInput`, `text-sm` |
| 헤더 | `bg-muted/50` + `sticky top-0`. 글자는 `text-foreground/60` — **`text-muted-foreground`가 아니다** (§2.2: muted 표면 위에서 4.34:1로 미달) |
| 열 순서 | **base가 맨 앞**, 나머지는 코드순. 번역자가 왼쪽의 원문을 보고 채운다 |

**넓은 표는 자기 컨테이너에서만 스크롤한다** (`overflow-x-auto`). 로케일이 6개면 표가 화면을 넘고, 페이지 본문이 좌우로 흔들리면 사이드바까지 밀린다.

**"번역됨"에는 배지를 붙이지 않는다** — 가장 흔한 상태가 가장 조용해야 한다 (§6.2와 같은 원리).

### 6.2 상태 배지 3종

필터가 셋(미번역 / 검토필요 / orphaned)이므로 배지도 셋이다. **semantic 토큰으로 표현 못 하는 상태 색**이라 raw 색을 쓰되, 라이트 단일이므로 `dark:` 짝을 두지 않는다.

| 상태 | 색 | 근거 |
|---|---|---|
| 미번역 | 무색 — `text-muted-foreground` | 없음은 상태가 아니라 부재다. 색을 주면 셋 중 가장 흔한 것이 가장 시끄러워진다 |
| 검토필요 (`needsReview`) | **amber** — `bg-amber-100/80 text-amber-800` | 경고지 오류가 아니다 |
| orphaned | **red 계열 글자만** — `text-destructive` | §2.3대로 글자색 전용. 배경을 주면 "삭제됨"으로 읽히는데 실제로는 되돌릴 수 있다 |

**새 raw 색을 늘리지 않는다.** 등재된 것이 전부다 — 배지의 **amber**·**destructive**, 그리고 §6.3의 외부 링크 **blue-600**.

### 6.3 코드 참조 링크

GitHub permalink는 `text-xs` + `text-blue-600 underline`. 외부 링크임이 보여야 하므로 밑줄을 뺀 관용을 쓰지 않는다.

## 7. 접근성

- **대비 하한 AA(4.5:1)**. §2.2가 가장 흔한 위반 경로다.
- **포커스 링을 지우지 않는다.** shadcn 기본 `focus-visible:ring-[3px]`을 유지한다.
- `--ring` == `--border`라서 **`muted`·`secondary` 표면 위에선 포커스 링이 약하다.** 그런 자리엔 `ring-offset`을 주거나 배경을 `background`로 되돌린다.

## 8. className & 변형

- 조건부 클래스는 **항상 `cn()`** 을 지난다 (§4.2의 twMerge 등록 때문에 특히).
- 변형이 셋 이상이면 `class-variance-authority`로 뽑는다. 둘 이하면 인라인 삼항이 낫다.

## 9. SaaS UI 레퍼런스 — Supabase 대시보드 (2026-09-05 결정)

**SaaS 단계에서 화면을 새로 만든다** (SAAS.md §8 3·6단계). 그 시각 기준을 **Supabase 대시보드**로
삼는다 — 개발자 도구이면서 비개발자도 쓰는 밀도, 리포/프로젝트 전환이 일급인 정보구조가 우리와 같은
문제를 이미 풀었다.

### 9.1 가져오는 것 — 레이아웃·밀도·정보구조

| 축 | 무엇을 따르나 |
|---|---|
| **좌측 고정 사이드바** | 최상단이 **프로젝트 전환**, 그 아래가 섹션 네비게이션. 우리 구조가 `translations` · `publish` · `settings` 셋이라 그대로 맞는다 |
| **높은 밀도** | 테이블 행 높이와 패딩을 작게. 번역 테이블이 수백 행이고 **한 화면에 많이 보이는 것이 이 도구의 값**이다 (가상화를 안 쓰는 이유와 같은 판단 — CLAUDE.md) |
| **중성이 지배하고 강조는 한 곳** | 회색조가 화면을 채우고 brand 색은 CTA·활성 탭·선택 행에만. 상태 색을 늘리지 않는다 |
| **식별자는 mono** | 키 이름·SHA·경로·slug. 우리 §4.1 mono 표면 불변식이 이미 그 규칙이다 |
| **인라인 편집** | 셀을 직접 고치고 blur에 저장. 이미 그렇게 만들어져 있다 |
| **상태는 작은 배지** | 알약 모양, 글자 크기를 본문보다 작게. §6.2가 이미 3종을 든다 |
| **빈 상태에 다음 행동** | "아직 없습니다" 다음에 **버튼**. 온보딩이 성패인 단계(SAAS.md §1)라 특히 중요하다 |

### 9.2 가져오지 않는 것

- **⚠️ 다크 모드.** Supabase는 다크가 기본이지만 **우리는 라이트 단일이고 그 강제 장치가 §3이다.**
  레퍼런스를 보고 `dark:`를 되살리지 않는다 — `@custom-variant dark` 한 줄이 지워지는 순간 shadcn
  생성 컴포넌트의 `dark:`가 OS 다크에서 전부 살아난다 (§3.1).
- **색 팔레트 자체.** Supabase의 초록 brand를 가져오지 않는다. 토큰의 진실은 `app/globals.css`이고,
  새 raw 색을 늘리면 §6.2에 등재해야 한다.
- **기능 밀도.** 그쪽 사이드바는 항목이 십수 개다. 우리는 셋이고, 늘리는 것은 SAAS.md §4.2가 막는다.

### 9.3 판정 기준

레퍼런스를 "닮았는가"로 판정하지 않는다. **§9.1의 일곱 축 중 어긋난 것이 있는가**로 본다 — 그래야
"Supabase처럼 보이게" 다듬는 작업이 §4.2 비범위로 새지 않는다.

## 빠른 체크리스트 (새 UI 만들 때)

- [ ] `dark:`를 새로 쓰지 않았나 (§3)
- [ ] 키 이름에 `text-mono`를 썼나 (§4.1)
- [ ] `muted` 표면 위에 `text-muted-foreground`를 쓰지 않았나 (§2.2)
- [ ] `muted` 표면 위 컨트롤에 `hover:bg-accent`를 쓰지 않았나 (§2.1)
- [ ] `bg-destructive`를 쓰지 않았나 — 글자색 전용이다 (§2.3)
- [ ] 새 raw 색을 늘리지 않았나 (§6.2)
- [ ] 조건부 클래스가 `cn()`을 지나나 (§8)
- [ ] 임의값(`text-[…]`) 대신 스케일을 썼나 (§4)
- [ ] (SaaS 화면) §9.1의 일곱 축과 어긋나지 않았나
