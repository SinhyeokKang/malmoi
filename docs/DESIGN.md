# DESIGN.md

편집 UI의 시각 규칙. **`~/code/bugshot-2`의 `docs/DESIGN.md`를 원본으로 이식했고**, 두 축이 다르다: Tailwind **v4**(그쪽은 v3)이고 **라이트 단일**(그쪽은 라이트/다크 양쪽)이다. 그 차이가 만드는 함정을 §1·§3에 적었다.

**2026-09-07 — 레퍼런스를 Supabase → GitLab으로 바꿨다** (SaaS 6단계 `features/translation-ui/`). 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**(§5·§6.5~§6.7·§9)이고, **색 토큰·타입 스케일·간격·radius는 기존 것 그대로다**(§2·§4·§5 앞부분) — GitLab Pajamas의 팔레트·폰트를 들이지 않는다. 같은 날 컨트롤이 hand-rolled에서 **프리미티브(`components/ui/`)** 로 바뀌었다(§6.4·§7).

무엇을 만드는지는 [SAAS.md](./SAAS.md)(현재)와 [MVP.md](./MVP.md)(PoC — 닫힘), 화면별 구성은 [features/translation-ui/user-stories.md](./features/translation-ui/user-stories.md), 불변식은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 0. ⚠️ 8단계 UI 재작성으로 바뀐 것 (2026-09-10)

**Figma 시안을 화면에 입히면서 전역 규칙 여덟이 바뀌었다.** 이 문서의 나머지가 그 이전을 서술하고
있으면 그쪽이 낡은 것이다 — 각 항목의 상세는 오른쪽 절에 있다.

| 무엇 | 전 | 후 | 상세 |
|---|---|---|---|
| **팔레트** | slate (푸른 틴트) | **neutral** | §2 |
| **font-weight** | 최대 600, 기본 400 | **최대 500, 기본 300** — 버튼 라벨 400 | §4 |
| **자간** | 유틸(`tracking-tight`)로 그때그때 | **크기 토큰이 든다** (`--text-*--letter-spacing`) | §4 |
| **radius** | `--radius` 10px | **12px** — 파생 전부 상승(md 10 · lg 12 · xl 16), 버튼 base `rounded-lg` | §5 |
| **elevation** | Tailwind `shadow-sm`·`shadow-md` | **`shadow-low`·`shadow-medium`** (Figma 색 + spread 확대) | §4.5 |
| **인라인 링크** | `underline` | **밑줄 없음** — 색과 아이콘으로만 | §6.3 |
| **피드백** | 인라인 `Alert` | **토스트**(전역 결과에 한해) | §6.25 |
| **셸 밖 화면** | `mx-auto max-w-sm` 카드 | **2열 패널** — 바깥 padding 8 · 패널 간 gap 8 | §5.1 |
| **앱 셸** (8-2) | 사이드바 `bg-muted border-r` + top bar + `xl` 미만 오버레이 | **캔버스 위 패널 셋** — 전폭 48 헤더 · 투명 사이드바 · 흰 콘텐츠 패널 · 320 프로젝트 패널, 반응형 분기 0 | §5.1·§6.5 |
| **캔버스 토큰** (8-2) | `--auth-canvas` | **`--canvas`** — 셸과 셸 밖 화면이 같은 값을 쓴다 | §2 |
| **Badge 모양** (8-3) | `rounded` (4px) | **알약** `rounded-full px-2` + `neutral` variant | §6.4 |
| **EmptyState** (8-3) | 맨 아이콘 24 | **48 원형 칩 + 아이콘 16** | §6.4·§6.8 |
| **사이드바** (8-3) | 접기 레일 · 프로젝트 스위처 · `Your work` 라벨 | **접기 없음 · 스위처 없음 · 라벨이 이름 그대로 · Help** | §6.5 |

⚠️ **앞의 여덟은 8-1b(로그인·초대)를 그리며 나왔고 뒤의 둘은 8-2(셸)다. 전 화면에 적용된다.**
8-3 이후가 나머지 화면을 옮길 때 여기부터 읽는다. 시안 자체의 작업 규약(에셋·1280px·shadcn 정착 등)은
[features/ui-rework/README.md](./features/ui-rework/README.md)가 든다.

⚠️ **아직 반영 안 된 화면이 있다** — `Button size="lg"`는 셸 밖 전용이고, base 치수 교체는
**마지막 화면이 옮겨온 뒤**다(§6.4). 그때까지 셸 안팎의 버튼 높이가 다르다.

## 1. 기반 스택

| | 값 | bugshot-2와의 차이 |
|---|---|---|
| Tailwind | **v4** — `tailwind.config.js`가 **없다**. 테마는 `app/globals.css`의 `@theme inline` | v3 + config 파일 |
| 프리미티브 | **`components/ui/`를 이 리포가 소유한다** (2026-09-08 — shadcn 생성 코드를 걷어내고 다시 썼고 CLI를 다시 돌리지 않는다). Radix는 `radix-ui` 단일 패키지에서 DropdownMenu·Dialog **둘만** (2026-09-11에 `Tooltip`을 걷었다 — 8-3이 접기 레일을 지우면서 소비자가 0이 됐다) | shadcn 생성물을 그대로 씀 |
| 변형 | `class-variance-authority` — Button·Badge·Alert | 같음 |
| 아이콘 | `lucide-react` **16px** — 세트는 이것 하나이고 **셸은 전 항목이 든다** (§6.8). ⚠️ 1.x에 브랜드 아이콘(`Github`)이 없다 | 같음 |
| 폰트 | Pretendard Variable 동적 서브셋, 자사 호스트 | 같은 폰트, `@fontsource` |
| 테마 | **라이트 단일** | 라이트/다크 |

**v4에서 `@theme inline`의 의미**: 토큰 값은 `:root`에 CSS 변수로 두고, `@theme inline`이 그걸 Tailwind 유틸 이름에 연결한다. v3의 `tailwind.config.js` `colors: { border: "hsl(var(--border))" }`에 해당한다. **`inline`을 빼면** 변수가 한 겹 더 감싸져 `@apply`·임의값에서 다르게 해석되므로 지우지 않는다.

## 2. 색상 (디자인 토큰)

**토큰 값의 유일한 진실은 `app/globals.css`다.** ⚠️ 한때 `components.json`의 `"baseColor"`가 시드로 있었지만 **그 파일은 2026-09-08에 CLI를 버리면서 함께 삭제됐다** — 이제 시드도 생성기도 없고, `components/ui/`는 이 리포가 소유한다.

**팔레트는 `neutral`이다** (2026-09-10 전역 교체 — §0). 한때 slate였고 "라이트 단일이라 푸른 틴트가 순백 위에서 맑게 읽힌다"는 근거였는데, **8-1b의 목측이 그것을 뒤집었다**: 시안의 회색이 전부 중립(`#090b0c`·`#6f6f6f`·`#f5f6f7`)이라 패널·배경·보조 텍스트가 나란히 놓이자 화면 전체가 시안보다 파랗게 보였다. 색을 하나씩 맞추는 것으로는 틴트가 안 없어진다. **GitLab의 회색·파랑을 들이지 않는다** (§9.2) — 레퍼런스에서 가져오는 것은 배치이고 색이 아니다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 페이지 바탕 / 기본 텍스트 |
| `primary` (+`-foreground`) | 주요 CTA·강조 — **화면당 하나** |
| `secondary` (+`-foreground`) | 보조 버튼 |
| `muted` (+`-foreground`) | 보조 텍스트·비활성 배경. ⚠️ **사이드바는 더 이상 이 표면이 아니다** (8-2 — 캔버스 위에 얹힌다, §6.5) |
| `accent` (+`-foreground`) | hover 강조 |
| `destructive` (+`-foreground`) | 위험·오류 — 글자색 전용(§2.3) |
| `card` / `popover` (+`-foreground`) | 카드·팝오버 표면 |
| `border` / `input` / `ring` | 테두리 · 입력 테두리 · 포커스 링 |
| `border-subtle` | ⚠️ **`--border`보다 한 단계 연하다** (8-1b) — 캔버스 위에 뜬 패널의 가장자리 정리용. 경계를 만드는 것은 흰색 대비와 `shadow-low`이고 이 선은 윤곽만 남긴다 |
| `canvas` | **앱 전체의 바깥 배경** (8-1b `--auth-canvas` → 8-2 `--canvas`). 셸(헤더·사이드바 바탕)과 셸 밖 화면이 **같은 값**을 쓴다 — 이름에 화면을 넣으면 둘째 변수가 생긴다 |
| `auth-hero-from` / `-to` | 로그인 우측 장식의 그라데이션. ⚠️ `from`이 `--canvas`와 **같은 값**이다 — 위쪽에서 배경으로 수렴하는 것이 의도다 (§6.62) |
| (`--signin-dot`) | ⚠️ **`@theme`에 등록하지 않는다** — Canvas가 `getComputedStyle`로 직접 읽으므로 유틸 클래스의 재료가 아니다. `--radius`·`--mono-size`·`--mono-leading`도 같은 부류다 (`lib/__tests__/globals-css.test.ts`가 그 넷을 이름으로 고정한다) |

### 2.1 ⚠ `accent` == `secondary` == `muted`가 같은 값이다

세 토큰이 모두 `hsl(0 0% 96.1%)`다. 위 표의 "용도"는 **의미 구분이지 시각 구분이 아니다.** 귀결:

- **`muted`·`secondary` 표면 위 컨트롤에 `hover:bg-accent`는 무효다** (hover 피드백 0).
- ⚠️ **캔버스(`--canvas`) 위에서도 무효다** (8-2) — 그 값이 `--muted`와 거의 같아 사이드바에서 아무것도 안 보인다. 그래서 사이드바의 hover·선택은 **`--foreground`의 알파**(`hover:bg-foreground/5` · `bg-foreground/10`)다: 알파는 어느 표면에서도 성립한다 (§6.5).
- `outline` 형 버튼의 `bg-background → hover:bg-accent`는 **`background` 표면 위를 전제한 관용구**다. muted 표면으로 옮기면 방향이 뒤집힌다.
- 그런 자리의 hover는 배경이 아니라 **등장(opacity)·글자색·그림자**로 낸다.

### 2.2 ⚠ 글자 대비는 토큰 이름이 아니라 "무슨 표면 위냐"가 정한다

같은 `--muted-foreground`가 `--background`(흰색) 위에선 **4.75:1**로 AA를 넘지만 `--muted` 위에선 **4.34:1로 미달**한다.

**`muted` 표면 위 글자에 `--muted-foreground`를 반사적으로 쓰지 말 것.** 옅게 깐 `--foreground`(예: `text-foreground/60`)가 AA를 넘으면서도 본문보다 약하다.

이게 걸릴 자리: **표 헤더**(`bg-muted/50`), **값 칩·코드 블록**(`bg-muted`), **`orphaned` 배지**. ⚠️ **사이드바는 2026-09-10부터 이 목록에 없다** — 캔버스가 거의 흰색이라 항목 글자가 `text-foreground` 그대로다 (§6.5).

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

shadcn 생성 코드가 사라져(2026-09-08) `dark:`를 쓰는 소스는 0곳이지만 **줄은 남긴다** — 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아나는 경로를 막는 것이 이 줄이고, `lib/__tests__/globals-css.test.ts`가 리터럴로 고정한다.

### 3.2 `.dark` 토큰 블록이 없다

`:root` 하나뿐이다. 다크 값을 되살리려면 `.dark` 블록을 추가하고 §2의 비대칭 판단(라이트 slate / 다크 neutral)을 다시 해야 한다 — 그건 bugshot-2 `docs/DESIGN.md` §2에 근거가 있다.

## 4. 타이포그래피

- **`font-sans`**: Pretendard Variable → 시스템 한/영 폴백. 폰트 파일은 **동적 서브셋 생성물**이라 `public/fonts/`가 gitignore돼 있다 (CLAUDE.md 폰트 절). GitLab Sans(Inter 기반)를 들이지 않는다 — Pretendard의 라틴 글리프도 Inter에서 왔다.
- 크기 관용: **`text-xs`·`text-sm`이 지배적**(라벨·필드·보조 텍스트·표 셀·버튼). `text-base`=본문·섹션 제목·**셸 안 페이지 제목**, `text-lg`=**셸 밖 카드의 제목 전용**이었다 — ⚠️ **8-1b가 그 둘을 `text-2xl`로 올렸다**(Figma 시안). 지금 `text-lg`의 소비자는 `/privacy`·`/docs` placeholder뿐이고, 8단계가 그 둘을 그리면 이 줄을 다시 본다.
- **임의값(`text-[…]`)은 스케일에 대응값이 없을 때만.** 12px은 `text-xs`, 14px은 `text-sm`이 있으므로 임의값으로 쓰지 않는다.
- ⚠️ **weight 규칙이 2026-09-10에 전면 교체됐다** — **가장 두꺼운 서체가 500이다.**

  | 전 | 후 | 쓰는 곳 |
  |---|---|---|
  | 600 (`font-semibold`) | **500** (`font-medium`) | 셸 밖 카드의 페이지 제목 |
  | 500 (`font-medium`) | 500 그대로 | 셸 안 제목·라벨 |
  | — | **400** (`font-normal`) | **버튼 라벨** — 본문(300)과 제목(500) 사이. 500이면 버튼만 도드라진다 |
  | 400 (기본·`font-normal`) | **300** (`body`의 기본값 · `font-light`) | 나머지 전부 |

  **`body`에 `font-weight: 300`이 있고 그것이 기본이다.** Pretendard Variable이 `45 920` 범위라
  300이 실제로 나온다 — 정적 폰트였다면 400으로 반올림됐다. **600 이상은 쓰지 않는다.**
  ⚠️ 상위에서 500을 상속받는 자리를 되돌릴 때는 `font-light`를 **명시**한다(기본과 같아 보여도
  그 의도가 코드에 남아야 한다).
  ⚠️ **크기는 8-1b부터 `text-2xl`**(로그인·초대 수락) — 시안 24px에 맞췄다.

- ⚠️ **자간은 크기 토큰이 든다 — `tracking-*` 유틸을 쓰지 않는다** (8-1b). `@theme`의
  `--text-*--letter-spacing`이 크기마다 값을 갖고(작을수록 넓게, 클수록 좁게), **호출부에
  `tracking-tight`를 붙이면 그것을 덮는다.** 실제로 제목 넷에 그 클래스가 남아 있어 전역 자간
  조정이 그 자리에만 안 먹었다 — 쓰려면 토큰을 고친다.

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
- ⚠️ **여러 줄일 수 있는 값에는 같은 태그에 `whitespace-pre-wrap`을 함께 적는다** (2026-09-08). `text-mono`는
  **글꼴·크기·행간 셋만** 싣고 `white-space`는 안 든다 — 이름이 "코드 표면"을 뜻하는데 코드 표면의 나머지
  절반이 빠져 있다. 유틸에 넣을 수는 없다: 소비 자리 29곳이 한 줄 값이고 여럿이 `truncate`와 함께 쓰므로
  접히는 것이 의도다. **결정을 소비자가 해야 하고 클래스 이름이 그것을 안 알려준다는 것이 이 줄의 이유다.**
  실제로 어댑터 오류의 파서 원문(YAML의 캐럿 다이어그램)이 세 자리에서 한 줄로 접혀 나갔다
  (POSTMORTEM 2026-09-08). `components/__tests__/multiline-detail.test.ts`가 그 세 자리를 상시로 센다.
  ⚠️ **여러 줄이 본문인 값은 `<pre>`다** — 워크플로 YAML이 그 예이고(§6.4 코드 블록) `whitespace-pre-wrap`이
  아니라 `overflow-x-auto`가 붙는다. 가르는 기준은 "긴 줄을 접어야 하나(pre-wrap)"와 "원본 줄바꿈을
  지켜야 하나(pre)"다.

### 4.2 ⚠ `text-mono`를 twMerge에 등록해야 한다

`lib/utils.ts`의 `cn()`이 `extendTailwindMerge`로 `text-mono`를 **font-size 그룹**에 등록한다.

**안 하면 twMerge가 커스텀 `text-*`를 text-color로 오분류한다.** `cn("text-mono", "text-foreground")`에서 `text-mono`가 조용히 제거되고, base `text-xs`와도 dedupe되지 않는다. bugshot-2가 액션 로그 값 칩에서 정확히 이 함정을 밟았다.

⚠️ **twMerge는 `cn()` 안에서만 일한다.** 정적 문자열 `"text-mono text-xs"`는 dedupe되지 않고 Tailwind v4가 알파벳순으로 정렬해 `text-xs`가 이긴다 → 12px sans. 같은 font-size 그룹을 한 문자열에 두 번 쓰지 않는다 (2026-09-06 slug·초대 링크 두 곳에서 실제로 그랬다).

### 4.3 mono 리거처

mono 폰트를 시스템 스택으로 두는 동안은 해당 없다. **Geist Mono·JetBrains Mono(GitLab Mono의 기반) 같은 리거처 폰트를 도입하면 `font-variant-ligatures: none`을 켠다** — `--`를 2셀에서 1셀로 붕괴시키고, 우리 키에 `_`·`.`이 흔해 같은 계열 문제가 난다. `font-feature-settings`가 아니라 `font-variant-ligatures`를 쓴다(전자는 가산이 아니라 통째로 덮어쓴다). 시스템 스택을 유지하기로 했다(2026-09-07).

## 4.5 elevation — **Tailwind 기본 그림자를 쓰지 않는다** (8-1b)

Figma의 `effect-elevation/low`·`/medium`을 `@theme`에 옮겼다. 소비 경로는 `shadow-low`·`shadow-medium`
유틸이다.

| 토큰 | 값 | 시안 |
|---|---|---|
| `--shadow-low` | `0 4px 12px 4px rgb(22 24 27 / 0.05)` | 색 그대로, **spread 0 → 4** |
| `--shadow-medium` | `0 6px 16px 2px rgb(22 24 27 / 0.15)` | 색 그대로, **spread −2 → 2** |

- ⚠️ **spread를 키운 것이 의도다** (2026-09-10 사용자) — 패널이 아주 연한 회색 배경 위에 떠 있는
  구조라 좁은 그림자는 **경계선처럼** 보이고 떠 있는 느낌이 안 난다.
- ⚠️ **패널·카드 표면에는 Tailwind 기본 `shadow-sm`·`shadow-md`를 쓰지 않는다** — 검정 기반이라 이 팔레트에서 탁해진다. **팝오버 계열은 예외다**: `DropdownMenu`가 `shadow-md`, `Dialog`가 `shadow-lg`, 토스트가 `shadow-sm`을 그대로 쓴다(§6.4 표) — 배경 위에 **잠깐 뜨는 것**이라 짙은 그림자가 층을 만든다.
- ⚠️ **`--shadow-*`는 `:root`에 안 나온다** — Tailwind가 유틸로만 소비하므로 `getComputedStyle`로
  읽으면 빈 문자열이다. 확인은 `boxShadow` 실효값으로 한다.

## 5. 간격 · Radius · 레이아웃

⚠️ **최소 대응 너비는 1280px다** (8단계, 2026-09-10 사용자). 그 아래에서는 **가로 스크롤이 나는 것이
정상**이고 모바일 분기를 만들지 않는다 — 레이아웃 루트에 `min-w-[1280px]`가 있어야 실제로 스크롤이
나고, 없으면 grid가 압축돼 **콘텐츠가 잘린다**(스크롤과 잘림은 다르다).

- **`--radius: 0.75rem`(12px)** — 2026-09-10에 한 단계 올렸다(§0). `--radius-sm/md/lg/xl`이 `calc()`로 파생돼 **8 · 10 · 12 · 16**이다. **삼분한다**: 입력 필드 `rounded-md`(10) · **버튼·카드·Alert `rounded-lg`(12)** · **패널 `rounded-xl`(16)**.
- 간격은 Tailwind 기본 스케일. **섹션은 `space-y-4`, 컨트롤 묶음은 `space-y-2`, 카드·표 셀 패딩은 `px-4 py-3`** — 실사용을 따랐다(2026-09-06 실측).

### 5.1 레이아웃 치수 — GitLab에서 가져온 것 (2026-09-07)

배치는 GitLab을 따르되 **값은 우리 스케일로 반올림**했다(GitLab 실측은 §11).

| 항목 | 값 | GitLab |
|---|---|---|
| **사이드바 폭** | `w-60` (240px) — ⚠️ **8-2부터 배경도 border도 없다**(캔버스 위에 얹힌다) | `$super-sidebar-width: 15rem` |
| **헤더 높이** | `h-12` (48px) — ⚠️ **8-2가 top bar를 대체했다**: 전폭이고 border가 없으며 로고를 든다 | `$header-height: 3rem + 1px` |
| 사이드바 항목 높이 | `p-1.5` + `text-sm` = 32px, 아이콘 16 (8-2 시안 치수: `p-6`·`gap-8`·`radius-8`) | nav item ≈ 32px |
| **패널 여백** | 바깥 padding 8(`p-2`) · 패널 간 gap 8(`gap-2`) — 규약 3.5, 예외 없음 | — |
| **프로젝트 패널 폭** | `w-80` (320px) — 프로젝트 축 라우트에만 (§6.55) | — |
| **콘텐츠 최대 폭 (limited)** | `max-w-4xl` (896px) — 폼·설정·계정·온보딩·초대 · Home·언어·멤버·**이력** (⚠️ **프로젝트 목록은 8-3에 fluid로 갔다**) | `$limited-layout-width: 1006px` (우리 스케일 대응값) |
| 콘텐츠 fluid | 번역 표 · **프로젝트 목록**(8-3) — 전폭, 표만 자기 컨테이너 안에서 가로 스크롤 | 표 화면은 fluid |
| 콘텐츠 패딩 | `px-6 py-6` | 12~24 |
| 사이드바 접힘 | **아이콘 레일**(`w-12`)로 접기, `localStorage`. ⚠️ **8-2가 반응형 분기를 걷었다** — 최소 대응 너비가 1280이라 `xl` 미만 오버레이·햄버거는 도달 불가였다 | 1200px |
| 드롭다운 패널 | `min-w-60 max-w-md` | 248~456px |
| 모달 | `max-w-lg` (512px) | modal sm 512 |

**페이지 셸은 둘이다**: **셸 안**(`(edit)` — 헤더 + 사이드바 + 흰 콘텐츠 패널, 그 안이 `max-w-4xl` 또는 fluid) / **셸 밖**(로그인·초대 수락 — **둘 다 2열**이다, 8-1b). 새 화면은 둘 중 하나다.

⚠️ **둘이 같은 골격이다** (8-2): 캔버스(`--canvas`) 위에 패널이 뜨고 바깥 padding 8 · 패널 간 gap 8 ·
각 패널 `rounded-xl` + `border-border-subtle` + `shadow-low`다. 셸 안의 그 패널을
`components/shell/content-panel.tsx`가 들고, **셸 레이아웃이 `{children}`을 감싸지 않는다** — 감싸면
프로젝트 패널이 그 안에 갇힌다. 라우트마다 정확히 하나인지는
`app/(edit)/__tests__/shell-layout.test.ts`가 레이아웃 체인을 훑어 센다.

⚠️ **셸 밖 화면의 골격은 `components/signin/auth-layout.tsx` 하나가 든다** (8-1b) — 바깥 padding 8 ·
패널 간 gap 8 · 각 패널 `rounded-xl` + 아주 연한 border + `shadow-low`, 바깥은 `--canvas`(아주
연한 회색)이고 좌측 패널은 **true white**다. **그 대비가 없으면 흰 패널과 흰 배경이 붙어 경계가
사라진다.** 시안 전체가 이 규칙이고 좌표로 검산했다 (`features/ui-rework/README.md` 규약 3.5).

## 6. 편집 UI 특화 규칙

라우트는 열이다 (user-stories.md 순서) — 로그인 · 목록 · 새 프로젝트 · **Home** · **번역** · **언어** · **멤버** · 설정 · **계정** · 초대 수락. 공통 형은 §6.4.

### 6.1 번역 화면 — 패널 · 헤더 스트립 · 고정 슬롯 · 표

**표 밖에 셋이 있다** (2026-09-08 ship 3). 표만 적어 두면 다음 사람이 그 셋을 다시 발명한다.

| 요소 | 규칙 |
|---|---|
| **네임스페이스 패널** | `aside` `w-52 shrink-0 overflow-y-auto border-r py-2`(콘텐츠 표면 — 셸 사이드바가 아니다). 항목 `px-3 py-1.5 text-sm`, 우측에 `pending/total`(전부 번역됐으면 총계만). ⚠️ **선택은 `bg-muted` 알약이다** — 셸 사이드바의 선택은 `bg-foreground/10` 알파다(8-2). **비대칭이 의도다**(표면이 서로 다르다) — 한쪽으로 맞추면 그 표면에서 알약이 사라진다. muted 알약 위 글자는 `text-foreground`이고 링에 `ring-offset-1`을 덧댄다(§7) |
| **헤더 스트립** | `border-b px-6 py-4 space-y-3` — breadcrumb → `h1 text-base font-medium` + 키 수 + "Last sent …" + PR 링크 → 우측에 툴바. **자기 안에서 스크롤하지 않는다**(표만 스크롤한다) |
| **툴바 필터 행** | 검색 `Input w-56 pl-8` + `Search` `absolute left-2` · 상태 `Select` + `ListFilter` · **기준 로케일 `Select`**(세 번째 필터 — 집계와 상태 필터가 그 로케일을 본다). ⚠️ **`<form>`을 쓰지 않는다** — 제출 버튼 없는 폼은 Enter로 submit되지 않는다(POSTMORTEM 2026-09-08) |
| **고정 슬롯 순서** | 툴바 아래 **편집 손실 배너가 위, Publish 결과 `Alert`가 아래**다. ⚠️ **둘 다 조건부 분기 밖**에 있어야 한다 — 분기 안이면 `revalidatePath`·`router.refresh()`가 방금 받은 결과를 언마운트한다(POSTMORTEM 2026-09-07) |

**빈 상태 넷**: 준비 전(readiness — OWNER는 설정으로 보낸다) · 로케일 없음 · 키 없음 · 필터 0행. 전부 `EmptyState`다.

#### 표 자체

화면은 `| Key | en (base) | ko | fr |`이고 **모든 셀이 편집 가능**하다 (base 포함 — 고정된 것은 키뿐이다). **예외는 orphaned**다 — 키든 로케일이든 어느 축이 orphaned면 그 셀은 `disabled` + placeholder "Not editable — removed from the code".

**셀 메타는 배지 + 편집자**다: "Edited by {name}"을 `text-muted-foreground text-xs`로 붙이고, **이름이 없으면 마스킹한 이메일**이다(`s***@example.com` — 이 표는 멤버 전원이 본다). **`updatedBy`가 없으면 편집자 표기가 없다** — push가 덮은 셀이 그 상태다(design §3.6). ⚠️ `Translation.updatedBy`에 `User.id`와 옛 GitHub 핸들이 섞여 있어 **못 찾은 값은 원문이 그대로 보인다** — 그게 정상 폴백이다 (malmoi#3).

| 요소 | 규칙 |
|---|---|
| 키 이름 | **`text-mono`** (§4.1) + Orphaned 배지 |
| `description` | `text-xs text-muted-foreground` — **`background` 표면 위일 때만** (§2.2) |
| 코드 참조 | `text-xs text-blue-600 underline` + `ExternalLink` 12px (§6.3) |
| 번역 입력 | `Textarea` `rows=1` + `field-sizing-content`(미지원 브라우저는 1행), `text-sm`. ⚠️ **`aria-label`이 `{키} · {로케일}`이다** — placeholder는 값이 차면 안 읽혀 채워진 셀이 이름 없는 입력이 된다 |
| 저장 상태 | 셀 안 한 줄은 **시각 전용**이고 상태가 **넷**이다 — Saving… / Saved(1.5초 뒤 소거) / **Not saved yet**(값이 변했고 아직 blur 전) / 실패 = `text-destructive` 문장 + `[Retry]`(`Button link sm` — 그 variant는 파랑 밑줄이고 destructive는 옆 문장이 든다). ⚠️ 사유가 `unauthorized`면 [Retry] 자리에 **[Sign in]** `ButtonLink`가 온다. ⚠️ **`role="status"`를 셀에 두지 않는다** — 903행×3로케일이면 live region이 2,700개다. 알림은 표 하나의 영역이 든다(§7) |
| 헤더 | `bg-muted/50` + `sticky top-0`. 글자는 `text-foreground/60` — **`text-muted-foreground`가 아니다** (§2.2). `(base)` 표기도 같은 규칙 |
| 열 순서 | **base가 맨 앞**, 나머지는 코드순 |
| 행 | `px-4 py-3` · 셀 `border-t`(표는 `divide-y`가 아니다) · hover `bg-muted/30` · `align-top`. ⚠️ 헤더는 `sticky top-0 **z-10**` — `z`가 없으면 스크롤 시 셀의 포커스 링이 헤더 위로 그려진다 |

**넓은 표는 자기 컨테이너에서만 스크롤한다** — `Table` 래퍼가 `h-full min-w-0 overflow-auto`로 **두 축을 다 든다** (`min-w-0`이 없으면 표가 콘텐츠 컬럼을 밀어낸다). 로케일이 6개면 표가 화면을 넘고, 페이지 본문이 좌우로 흔들리면 사이드바까지 밀린다. ⚠️ **세로도 그 컨테이너여야 `sticky top-0` 헤더가 붙는다** — `sticky`는 가장 가까운 스크롤 컨테이너를 기준으로 하므로, 세로를 바깥이 들면 헤더가 붙을 대상 없이 그냥 흘러간다. 높이는 부모(`min-h-0 flex-1`)가 정한다.

**"Translated"에는 배지를 붙이지 않는다** — 가장 흔한 상태가 가장 조용해야 한다 (§6.2와 같은 원리). 같은 이유로 **"From repository" 같은 표시도 두지 않는다**.

### 6.2 상태 색 — 배지 4종 + 연결 건강성 7종 + Alert 4종, 색 체계는 하나

**축이 셋이고 색 체계는 하나다.** amber는 **경고**, destructive는 **글자색 전용 오류**, 나머지는 무색이다. **semantic 토큰으로 표현 못 하는 상태 색**이라 raw 색을 쓰되, 라이트 단일이므로 `dark:` 짝을 두지 않는다.

| 상태 | 색 | 근거 |
|---|---|---|
| 미번역 | 무색 — `text-muted-foreground` "Untranslated" | 없음은 상태가 아니라 부재다. 색을 주면 셋 중 가장 흔한 것이 가장 시끄러워진다 |
| 검토필요 (`needsReview`) | **amber** — `Badge warning` = `bg-amber-100/80 text-amber-800` | 경고지 오류가 아니다 |
| 미배포 (`isUnpublished`) | 무색 — `Badge muted` "Not yet sent" | 툴바 건수·편집 손실 배너와 **같은 술어**다(`updatedBy`가 사람인 행). 색을 주면 편집 직후의 정상 상태가 경고로 읽힌다 |
| orphaned | **red 계열 글자만** — `Badge danger` = `text-destructive` (배경 없음) | §2.3대로 글자색 전용. 배경을 주면 "삭제됨"으로 읽히는데 실제로는 되돌릴 수 있다. **키 행과 로케일 헤더 두 축에 같은 표기** |

**연결 건강성 7종** (설정 화면): **배지를 쓰지 않는다** (2026-09-08 실물 정정) — `ok`·`not-connected`·`unknown`은 평문 `text-muted-foreground text-xs`(가장 흔한 상태가 조용하다) / `repo-moved` → **`Alert warning`** / `app-uninstalled`·`installation-changed` → **`Alert danger` + [Reconnect]** / **`repo-replaced` → `Alert danger`이고 [Reconnect]가 **없다**(2026-09-10, sec-audit-2 — 저장된 주소가 **다른 리포**를 가리키는 상태다. 리포는 프로젝트 생성 시점에 고정이라 `connectRepository`가 재고정을 거부하므로 **눌러도 실패할 버튼**이고, 그래서 'danger = danger + [Reconnect]'라는 짝이 여기서만 깨진다). 색 체계는 아래와 같고 담는 그릇만 다르다. ⚠️ **`unknown`을 `app-uninstalled` 색으로 접지 않는다** — 조회 실패를 "제거됨"으로 보여주면 사용자가 멀쩡한 설치를 다시 만든다.

**첫 적재 상태** (`planProjectReadiness`): 판정 자체는 셋이지만 **화면 문구는 목록의 `projectStatus`가 든다** (8-3 — `readinessLabel`은 삭제됐다). 목록에서는 `awaiting_first_sync`·`setup`이 **`Badge warning`**(amber)이고 `ready`는 `Active`다 — 그 둘만 "누군가 뭔가를 더 해야 끝나는" 상태여서다(§6.63). 오류가 아니라 진행 중이므로 `danger`가 아니다.

**sync 실행 4종** (`logs` 화면, 2026-09-10 7단계 — `lib/sync/view.ts`의 `syncRunView`): `SUCCEEDED`("Sent")·`SKIPPED`("Nothing to send")·`RUNNING`("Running…") → **무색 `Badge muted`** / `FAILED`("Failed") → **`Badge danger`**. ⚠️ **색이 셋뿐이라 구별은 라벨이 든다** — 새 raw 색을 만들지 않는 것이 §6.2의 규칙이고, 성공·스킵·진행 중을 색으로 가르려 들면 그 규칙이 첫날에 깨진다. **판정 함수가 tone을 `Badge` variant와 같은 이름으로 낸다** — 화면이 매핑 표를 또 들지 않는다(`PublishTone` 선례). ⚠️ 버린 값이 있는 실행에는 `Badge warning` "N dropped"가 **성공한 행에도** 붙는다 (SAAS 불변식 9).

**보관** (2026-09-10): 목록 행의 상태 배지가 `Badge neutral` "Archived"다(8-3 — 배지가 **항상 하나**이고 갈래는 `projectStatus`가 정한다, §6.63). ⚠️ **숨기지 않는다** — 숨기면 OWNER가 되돌릴 링크에 도달할 길이 없다. ⚠️ **프로젝트 스위처는 8-3에 사라졌다** — 프로젝트를 옮기는 길이 목록 하나로 통일됐다(§6.5).

**목록 행 상태 5종** (`/projects`, 2026-09-11 사용자 — `projectStatus`): `Active` → **`Badge success`**(초록) / `Archived`·`Setup`·`Pending` → **무색 `Badge neutral`** / `Disconnected` → **`Badge warning`**(amber). ⚠️ **`Active`가 초록인 것은 §6.1("가장 흔한 상태가 가장 조용하다")의 예외다** — 근거는 이 목록이 **훑어보는 화면**이라는 것이고, 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어야 대비가 생긴다. ⚠️ **amber가 `Disconnected` 하나뿐이다** — 축이 "덜 됐나"가 아니라 **"깨졌나"**다: `Setup`·`Pending`은 새 프로젝트가 지나가는 정상 경로라 저절로 `Active`가 되지만, `Disconnected`는 한때 돌던 것이 멈춘 것이라 사람이 손대야 풀린다. ⚠️ **라벨이 전부 한 낱말이고 동사가 없다** — 배지는 행 우측의 좁은 칸이라 문장이 이름·리포 URL과 폭을 다투고, 좁은 칸의 동사는 누를 수 있는 것처럼 읽힌다(할 일은 설정 화면의 `Alert`가 말한다). **새 raw 색은 green 하나**이고 amber와 같은 형이다(`bg-green-100/80 text-green-800`).

**이름에서 뽑는 색 8종** (2026-09-11 사용자 — `lib/tone.ts`의 `toneOf` + `components/ui/tone.ts`의 `toneFill`): **소비자가 둘이고 형이 같다** — 사용자 아바타 폴백과 **프로젝트 목록 행의 아이콘**이 모두 채운 배경 + 흰 글리프(`toneFill`)다. 그 배경이 곧 **프로젝트 이미지가 들어올 자리**이므로 지금 색을 채워 두면 이미지가 붙는 날 표면이 바뀌지 않는다. 이름을 해시해 `rose`·`orange`·`amber`·`emerald`·`teal`·`sky`·`indigo`·`fuchsia`의 **`-600` 배경 + 흰 글자**를 고른다. **같은 이름은 언제나 같은 색**이다(`Math.random`이 아니다 — 렌더마다 바뀌면 색이 사람을 못 가리킨다). ⚠️ **`-600`으로 통일한다**: `-500`이 더 밝지만 amber·lime 계열에서 흰 글자가 안 읽혀, 색마다 단계를 다르게 두면 여덟이 같은 계열로 안 보인다. ⚠️ **클래스를 문자열 리터럴 맵으로 든다** — `bg-${tone}-600`으로 조립하면 Tailwind가 정적 추출을 못 해 배경이 통째로 빠진다. ⚠️ **판정은 `lib/`, 클래스는 컴포넌트**다(`STATUS_VARIANT`와 같은 형) — `lib/`가 Tailwind 클래스를 알면 규칙이 두 층에 걸린다.

**Alert 4종** (§6.4 — Publish 결과·편집 손실 배너·페이지 수준 거부):

| variant | 색 | 쓰는 곳 |
|---|---|---|
| `info` | `border-border bg-muted/40` + `Info` 아이콘 `text-muted-foreground` | "Nothing to publish" |
| `success` | `border-border bg-background` + `CircleCheck` 아이콘 `text-foreground` | Publish 성공 둘 — **초록을 쓰지 않는다**(raw 색을 늘리지 않는다). 성공은 조용하다. ⚠️ **로그인 화면의 전체 로그아웃 완료(`?sessions=revoked`)는 8-1b가 토스트로 옮겼다** — 아래 §6.25 |
| `warning` | `border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert` | 편집 손실 배너 · Publish "일부 미기록" · `repo-moved` |
| `danger` | `border-destructive/40 bg-background text-destructive` + `CircleX` | Publish 실패 · 페이지 수준 거부(`?e=`) · 블록 안 컨트롤 실패 |

⚠️ **내부 이름을 화면에 쓰지 않는다** — `awaiting_first_sync`는 번역자에게 아무것도 알려주지 않는다 (SAAS §3). 문구는 `messages/en.tsx`이 든다.

**새 raw 색을 늘리지 않는다.** 등재된 것이 전부다 — **amber**(`100/80`·`800`, Alert용 `50`·`200`·`900`)·**destructive**, 그리고 §6.3의 외부 링크 **blue-600**. 초록·주황·보라는 없다.

### 6.25 토스트 — 피드백의 두 번째 표면 (8-1b, 2026-09-10)

⚠️ **2026-09-08이 `sonner`를 "사용 0"으로 제거하며 반대로 판정한 자리다.** 8단계가 **토스트로 통일**
하기로 뒤집었고(사용자, 두 번 재확인), 그 결정이 요구한 **경계**는 `features/ui-rework/README.md`
규약 8에 있다:

| | 무엇 | 예 |
|---|---|---|
| **토스트** | **전역 결과를 내는 이벤트** — 대상이 화면 전체이고 읽고 나면 사라져도 되는 것 | 로그인 거부 · 세션 회수 완료 |
| 인라인 | **대상이 있는 판정** | 셀 저장 상태 · 멤버 행 옆 거부 |
| 인라인 | **지속되는 조건** | 편집 손실 배너 · base 대기 배너 |
| 인라인 | **페이지 콘텐츠 자체** | 초대의 `not-found`·`expired`·`already-accepted` |

- **`<Toaster theme="light" />`가 `app/layout.tsx`에 있다.** ⚠️ `sonner`는 테마를 **스스로 감지**하므로
  그 prop이 없으면 OS 다크에서 토스트만 어두워진다 — `globals.css`의 `@custom-variant dark`는 우리
  `dark:` 유틸만 막지 남의 패키지 내부 스타일은 못 막는다(§3.1의 사각지대).
- **`toastOptions.classNames`로 우리 토큰에 묶는다** — 안 묶으면 `sonner`가 자기 배경·radius·shadow를
  주입해 **두 번째 CSS 출처**가 되고 `Alert`와 같은 뜻을 다른 형으로 말한다.
- ⚠️ **조치가 필요한 정보는 `duration: Infinity` + 닫기.** 로그인 거부 사유가 4초 뒤 사라지면
  화면에 설명이 0이 된다 — 인라인 `Alert`를 걷어낸 대가를 여기서 갚는다. 세션 회수 완료도 긴
  duration이다(되돌릴 수 없는 조치의 유일한 완료 증거다).
- ⚠️ **`id`를 고정한다** — StrictMode에서 effect가 두 번 돌아 같은 토스트가 둘이 뜬다.
- ⚠️ **`role="alert"`에서 `aria-live="polite"`로 강등된다.** `Alert variant="danger"`는 끼어들어
  읽히고 토스트는 큐에 들어간다 — `lib/pull/message.ts`가 반대 방향으로 같은 축을 판단한 전례가
  있다("already sending"을 `info`로 내렸다). **거부는 끊어야 하는 쪽**이라 실물 확인이 판정이다.

### 6.3 외부 링크

⚠️ **밑줄을 쓰지 않는다** (2026-09-10 사용자 — 전역 규칙). **인라인 하이퍼링크는 색과 아이콘으로
구별하고 `underline`·`hover:underline`을 붙이지 않는다.** 8-1b에서 소스 13곳을 전수로 걷어냈고
(`grep -rn underline app components --include='*.tsx'`가 0건이어야 한다) `Button` variant `link`도
같이 바뀌었다.

**리포 밖으로 나가는 링크는 전부 `text-blue-600` + `ExternalLink` 12px 아이콘**이다 — 코드 참조 permalink · Publish 결과의 PR 링크 · 툴바의 "View what was sent" · App 설치 링크 둘. ⚠️ 2026-09-08 `/doc-check`이 다섯 곳 중 **둘만** 아이콘을 든 상태를 잡았다 — 규칙이 아니라 코드를 고쳤다. `target="_blank" rel="noreferrer"`. 내부 링크(사이드바·breadcrumb·목록 행)는 밑줄 없이 `text-foreground`/`text-muted-foreground`다.

### 6.4 공통 형 — 프리미티브가 든다 (2026-09-08)

옛 판의 "hand-rolled 컨트롤 클래스 표"는 사라졌다. **형은 `components/ui/`의 variant이고 화면은 raw 태그를 쓰지 않는다** — `focus-ring.test.ts`가 `ui/` 밖의 `<button>`·`<input>`·`<select>`·`<textarea>`를 **0개로 고정한다** (§7 — 축소형 허용 목록이 2026-09-08 ship 4에서 비어 전면 방어선이 됐다). 색은 전부 §2의 토큰이다.

| 프리미티브 | 형 (옛 표의 어느 행을 잇나) |
|---|---|
| **Button** `primary` | `bg-primary text-primary-foreground hover:bg-primary/90` · `h-8 px-3 text-sm font-normal` + base `rounded-lg`(12px — §5) — 옛 "primary 버튼". **화면당 하나**(확정 액션) |
| **Button** `default` | `border border-input bg-background hover:bg-accent text-foreground` · 같은 치수 — 옛 "bordered(페이지·툴바)"를 하나로. 툴바도 `h-8`이다 |
| **Button** `danger` | `default` + `text-destructive border-destructive/40 hover:bg-destructive/5` — `bg-destructive` 없음(§2.3). 멤버 제거·연결 해제·초대 취소 |
| **Button** `ghost` | 배경·테두리 없음 · `text-muted-foreground hover:text-foreground` — 옛 "텍스트 버튼"(밑줄 제거). 툴바 보조·아이콘 버튼·사이드바 |
| **Button** `link` | `text-blue-600` 인라인 (밑줄 없음) — 번역 셀의 [Retry]·[Sign in] (초대 화면의 "Sign in with another account"는 기본형 `w-full`이다) |
| **Button** `size="sm"` | `h-7 px-2 text-xs` — 표 안·배지 옆 |
| **Button** `disabled` | `disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent`(default·ghost) / `disabled:opacity-70`(primary) — 옛 규칙 그대로 |
| **ButtonLink** | 같은 variant·size를 입은 `<Link>` — 주 행동이 **라우트 이동**인 자리("New project"·"Open translations"). ⚠️ **`Button`에 `asChild`를 두지 않는 것의 짝이다**: Slot 한 겹이 `<button>` 태그를 지워 `focus-ring` 스캐너가 그 파일을 못 보게 된다(§7). 형의 단일 출처는 `buttonClass()` |
| **Input·Select** | `h-8 px-2 text-sm border border-input bg-background rounded-md` · invalid `border-destructive` · disabled `bg-muted text-muted-foreground` — 옛 "입력(페이지·툴바)"을 하나로 |
| **Textarea** | 같은 형이지만 **`h-8`을 안 든다** — `rows=1` + `field-sizing-content py-1`이라 높이는 내용이 정한다 (§6.1) |
| **FormGroup** | label `text-sm font-medium` · help `text-xs text-muted-foreground` · error `text-xs text-destructive` · "(optional)" `text-muted-foreground font-light`(§4의 기본 300) |
| **Radio** | `size-4` · `border-input accent-primary` · label `text-sm`. **`Checkbox`는 없다** — 와이어 여덟에서 사용 0회라 필요해질 때 만든다 |
| **SegmentedControl / SegmentedLinks** | **열일곱 번째 프리미티브** (8-2 신설 · 8-3이 링크판을 더했다). 트랙 `bg-canvas rounded-sm p-1 gap-1` · 세그먼트 `rounded px-2 py-1 text-sm min-w-11` · 선택 `bg-background shadow-low font-medium` / 비선택 `text-muted-foreground hover:text-foreground`. ⚠️ **형이 둘인 것이 요지다**: 상태를 클라이언트가 들면 `SegmentedControl`(버튼 · `role=radiogroup`), **URL이 들면 `SegmentedLinks`**(`<nav>` + `aria-current="page"`). 필터·탭은 뒤엣것이다 — 뒤로가기·공유·새로고침이 그냥 돼야 한다. ⚠️ **`role="tablist"`가 아니다**: ARIA 탭은 `aria-controls`와 화살표 이동이 계약인데 이 컨트롤은 그걸 안 든다 |
| **Badge** | ⚠️ **알약이다** (8-3): `text-xs rounded-full px-2 py-0.5`. variants `muted`(`text-muted-foreground`, 배경 없음)·`warning`(amber)·`danger`(`text-destructive`)·**`neutral`**(`bg-foreground/5 text-foreground` — 8-3, 새 raw 색이 아니라 `--foreground`의 알파다) — §6.2. ⚠️ **검정 채움(`solid`)은 없다** — 시안 개정이 역할을 배지에서 메타 평문으로 내리며 소비자가 0이 됐다 |
| **Alert** | `rounded-lg border p-4` · 좌측 아이콘 16 · 제목 `text-sm font-medium` · 본문 `text-sm` ≤ 2문장 + 다음 행동 · 액션 최대 2 · 닫기 우상단 `ghost sm`. variant 넷은 §6.2. **배치 셋** — global(페이지 콘텐츠 맨 위 전폭 — `?e=` 거부) · page-level(제목 아래 — 편집 손실 배너·Publish 결과) · in-block(설정 블록 안 — 컨트롤 실패) |
| **Card** | `border-border rounded-lg border` · 헤더(`px-4 py-3 border-b` 제목 `text-sm font-medium` + 우측 슬롯) · 본문 `p-4 space-y-2` — 옛 "섹션 카드" |
| **Table** | §6.1 |
| **Breadcrumb** | `text-xs` · 항목 `text-muted-foreground hover:text-foreground` · 마지막 `text-foreground font-medium` `aria-current="page"` · 구분자 `/` `text-muted-foreground/60 px-2` |
| **DropdownMenu** | `min-w-60 rounded-lg border bg-popover shadow-md py-1` · 항목 `mx-1 px-2 py-1.5 rounded text-sm hover:bg-accent` · selected `bg-muted` + `Check` 16 |
| **Dialog** | `max-w-lg rounded-lg border bg-background shadow-lg` · 제목 `text-base font-medium` · 본문 `p-4 text-sm` · 푸터 `p-4 pt-2 gap-2` 버튼 최대 3(primary·default·ghost cancel) · 배경 `bg-foreground/40` · Esc·배경·X·Cancel 넷으로 닫힌다 |
| **DropdownMenu** | ⚠️ **`DropdownMenuItem`은 `{children}`을 `Slot.Slottable`로 감싼다** (2026-09-09). 호출부가 `asChild`를 주면 Radix Slot이 그 자식에 props를 얹는데 **자식이 정확히 하나여야 한다** — `selected`의 `Check`가 형제로 붙는 순간 던지고, 그 트리(= 앱 셸)가 통째로 죽는다. 실측: 프로젝트 스위처를 **한 번 열면** "This page couldn't load"였고 `add099a`부터 프로덕션에 있었다(POSTMORTEM 2026-09-09 — 툴팁 provider와 같은 계보). `components/__tests__/slottable-item.test.ts`가 `asChild`가 닿는 프리미티브 전수 + 이 이름을 고정한다 |
| **Avatar** | 사람 = `rounded-full`, 프로젝트 = `rounded`(라운드 사각) · 16/24/32 · 이니셜 폴백 `bg-muted text-foreground/60` |
| **Button `loading`** | **`Loader2` 스피너를 라벨 앞에** 세우고 disabled. ⚠️ **문구를 바꾸지 않는다** (2026-09-10 규칙 변경) — 전에는 `loadingLabel`로 `"Saving…"` 류를 넣었는데 폭이 흔들리고 화면마다 문구를 따로 들어야 했다(제거하며 죽은 문구 16개가 나왔다). 어느 버튼이 도는지는 스피너 위치가 말한다 |
| **Button `size="lg"`** | `h-10 px-4` — **셸 밖 카드 전용**(로그인·초대 수락). ⚠️ **base를 안 바꾼 이유**: 소비자가 26파일인데 8-1b가 검증한 화면은 셋이다. 각 화면의 배송이 옮겨오고 **마지막이 옮겨온 뒤 기본값을 바꾼다** — 그때까지 셸 안 화면이 "signin이 쓰니 우리도"로 번지지 않게 이 줄이 막는다 |
| **EmptyState** | ⚠️ **아이콘이 48px 원형 칩 안이다** (8-3 — `bg-foreground/5` + 아이콘 16). 맨 아이콘은 텍스트에 붙어 제목의 일부처럼 읽히는데 칩이 그것을 **그림 자리**로 만든다(시안은 아이콘 20인데 §6.8이 크기를 셋으로 고정한다). 제목 `text-base font-medium` ≤5단어 마침표 없음 · 설명 `text-sm text-muted-foreground` 완전 문장 · 액션 **버튼 하나** · 일러스트 없음. ⚠️ **수직 중앙을 컴포넌트가 하지 않는다** — 표 안(`logs`·대기 초대)에서도 쓰여서 자리마다 다르다. `flex-1`은 호출부가 든다. 구조는 shadcn `Empty`와 1:1이고 **CLI를 돌리지 않는다**(Radix 없는 순수 마크업이다) |
| **값 칩** | `text-mono bg-muted rounded px-2 py-1` — `text-xs`를 겹치지 않는다(§4.2). 블록 요소면 `inline-block` |
| **코드 블록** | `<pre className="text-mono bg-muted overflow-x-auto rounded-md p-3">` + **블록 위 한 줄의 오른쪽**에 [Copy] `default`(아이콘 `Copy` → `Check`) → 라벨 교체 "Copied", 실패는 "Copy failed"(삼키면 사용자가 복사된 줄 알고 떠난다) |

**빈 상태 문체**: 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, 버튼 하나 (§10).

### 6.5 앱 셸 — 헤더·사이드바·패널 (Figma 시안 `212:937`, 2026-09-10 8-2)

**셸은 캔버스 위에 패널이 떠 있는 구조다.** 1920 기준 좌표로 검산했고 런타임에서 그대로 나온다:
헤더 `(8,8) 1904×48` · 사이드바 `(8,64) 240×1008` · 콘텐츠 `x=256 w=1328` · 프로젝트 패널 `x=1592 w=320`.

⚠️ **2026-09-07의 GitLab super sidebar 형을 시안이 대체했다.** 가져간 것은 **정보구조**(구역 둘 ·
프로젝트 컨텍스트 · 하단 전역 항목 · 접힘)이고, **표면**(사이드바 배경·top bar·경계선)은 시안이 정한다.

| 요소 | 규칙 |
|---|---|
| **셸 루트** | ⚠️ **`flex h-svh overflow-hidden`이고 `min-h-svh`가 아니다** (malmoi#13). `min-`은 "최소 한 화면"이라 콘텐츠가 길면 컨테이너가 함께 자라고, 그러면 `aside`가 stretch로 **문서 높이만큼** 늘어 Sign out·Collapse sidebar가 화면 밖으로 나간다 — 24키 화면에서도 그랬다(`scrollHeight` 1483 / 뷰포트 775). 여기에 **`bg-canvas p-2 gap-2 min-w-[1280px]`**가 붙는다 — ⚠️ `min-w-`가 없으면 1280 미만에서 **스크롤이 아니라 flex가 압축돼 콘텐츠가 잘린다**(실측: 1100 뷰포트에서 문서 폭 1280, 가로 스크롤 발생). `app/(edit)/__tests__/shell-layout.test.ts`가 소스로 고정한다 |
| **헤더** | `h-12 px-1`, **배경도 border도 없다**(캔버스 위에 얹힌다). 드는 것은 **로고 32 좌측**(`public/brand/malmoi-icon-black.svg`, `/projects` 링크) **+ 사용자 메뉴 32 우측**(아바타 `ghost` 버튼 → DropdownMenu: 이름·이메일 → Your account → Sign out) **둘뿐이다.** ⚠️ 버튼이 아바타와 같은 32여야 한다 — `size="sm"`(28)이면 아바타가 위아래로 삐져나온다(실측). ⚠️ **breadcrumb은 여기 없다** — 레이아웃이 페이지 props를 못 받아 **페이지 콘텐츠의 첫 줄**이 든다(`features/translation-ui/design.md` §2). 8-3이 그것을 `projects/[slug]/layout.tsx`로 옮길 자리다 |
| 사이드바 | `w-60 shrink-0 p-1 gap-2 overflow-y-auto`, **배경도 border도 없다.** ⚠️ **접기가 없다** (8-3 — 시안에 없다): 아이콘 레일과 함께 **레일에서만 렌더되던 툴팁도 사라졌다**(2026-09-08에 셸을 죽였던 그 자리다). 소비자가 0이 되어 **2026-09-11에 `Tooltip` 프리미티브 자체를 걷었다** — 조상 provider를 요구하는 Radix 컴포넌트는 프리미티브가 자기 provider를 든다는 교훈은 POSTMORTEM 2026-09-08에 남아 있고, 다음에 그런 컴포넌트를 들일 때 그 확인을 한 번 한다. ⚠️ **반응형 분기가 0개다**(규약 3 — 최소 대응 너비 1280) |
| **항목 hover·선택** | ⚠️ **배경 알파다** — 선택 `bg-foreground/10 font-medium`, 비활성 hover `hover:bg-foreground/5`. `--accent == --muted`(§2.1)라 캔버스 위에서 `hover:bg-accent`가 **보이지 않고**, 6단계의 "흰 알약"(`bg-background`)도 배경이 흰색이 아니게 되면서 근거가 사라졌다. **hover와 선택은 한 단계 벌린다** — 같은 알파면 포인터 아래 항목이 선택된 것처럼 보인다 |
| 섹션 항목 | `flex items-center gap-2 rounded-sm p-1.5 text-sm` · 아이콘 16(**전 항목 표는 §6.8**) · 글자는 `text-foreground`(캔버스가 거의 흰색이라 §2.2의 muted 표면 문제가 없다) |
| **개수 배지** | ⚠️ **`Projects` 하나에만 붙는다** (8-3). 그 값은 셸이 **이미 조회한** 멤버십 배열의 길이라 왕복이 0이다. 시안의 나머지 셋(Locales·Translations·Members)은 프로젝트별 집계라 **모든 페이지에 왕복을 더한다** — SAAS §7.7 결정 5가 거절했고 §8이 🔒로 다시 열어 둔 항목이다. ⚠️ **`0`도 보인다** — `undefined`와 다르다: 프로젝트가 없다는 사실이 정보이고, 화면이 `badge && …`로 쓰면 0이 falsy라 조용히 사라진다 |
| **구역 둘** | ⚠️ **축이 둘이라 구역이 둘이다** (SAAS §7.7). 순서는 **사용자 축 먼저**(`Projects`·`Settings`) → **프로젝트 축**. ⚠️ **라벨이 이름 그대로다** (8-3 — 시안): 사용자 축은 **사용자 이름**, 프로젝트 축은 **프로젝트 이름**. 6b-4의 `Your work` 라벨과 6a의 프로젝트 스위처를 **함께** 대체했다. 라벨은 `<p>` `text-foreground py-1.5 text-sm font-medium`이고, 둘째 구역만 `border-t border-border pt-2`. ⚠️ **`<nav>` 둘이 `aria-label`을 든다** — 라벨이 `<p>`라 접근성 트리에서 이름이 아니다 |
| **스위처가 없다** | ⚠️ 8-3이 지웠다 (시안). 프로젝트를 옮기는 길이 **목록 하나**로 통일됐고, `New project`를 사이드바에서 뺀 것과 같은 방향이다 — 진입점이 하나면 "어디서 눌렀나"에 따라 다른 곳에 착지할 수 없다. 그와 함께 `DropdownMenuItem asChild`의 실사용이 셸에서 사라졌다(규칙과 그 테스트는 그대로다) |
| 사용자 축 항목 | **Projects**(`Briefcase`, 개수 배지) · **Settings**(`Settings` → `/account`). ⚠️ **`New project`가 없다** (8-3) — 라우트는 그대로라 URL로는 열린다. ⚠️ **유저 메뉴도 같은 `Settings` 문구를 쓴다** — 한 곳을 가리키는 이름이 둘이면 그중 하나가 낡는다 |
| 프로젝트 축 항목 | **Home**(`House`) · **Locales**(`Globe`) · **Translations**(`Languages`) · **Members**(`Users`) · **Logs**(`History`) · **Project settings**(`Settings`, `project:settings`가 있는 역할에만 — 편의다, 방어는 페이지). ⚠️ **순서가 시안이다**: Locales가 Translations **앞**이다("어떤 언어가 있나"가 "그 언어를 채운다"보다 앞선 질문이다). ⚠️ **라벨이 8-3에 바뀌었다**: `Overview`→**Home** · `Languages`→**Locales** · `Settings`→**Project settings**. 6b-5가 적었던 "`locale`은 내부 낱말이라 화면에 쓰지 않는다"는 **시안이 뒤집었다** |
| 활성 판정 | ⚠️ **규칙이 축이 아니라 항목에 붙는다** (6b-6 — `NavItem.exact`). **접두인 것 셋**: Locales·Translations·Members·Project settings 중 하위 경로가 있는 것들. **정확히 일치인 것**: Home(`/projects/<slug>`는 그 프로젝트 **모든** 하위 라우트의 접두다) · **Logs**(하위 라우트가 없다 — `?cursor=`는 쿼리다) · Projects(`/projects`가 `/projects/new`의 접두다) · Settings |
| 하단 전역 | **Help**(`CircleHelp` → `/docs`) · **Sign out**(`LogOut`). 라우트가 아니라 "앱을 벗어나는 것"이라 구역 밖 `mt-auto`다. ⚠️ **`<nav>`가 아니다** — 둘의 성격이 갈려(문서 링크 / 폼 제출) 하나로 묶을 이름이 없다. ⚠️ **Help의 목적지가 `/docs`다** (8-3): 그 화면은 아직 placeholder이지만 **라우트는 실재한다**(8-1a가 땄다). ⚠️ **Collapse는 사라졌다** |
| 콘텐츠 패널 | `components/shell/content-panel.tsx` — `flex min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-border-subtle bg-background shadow-low`. 그 안이 limited면 `mx-auto max-w-4xl px-6 py-6`, fluid(번역)면 `flex min-h-0 flex-1`. ⚠️ **넷이 함께 있어야 패널이 뜬다**(흰 배경·radius·border·그림자) — 8-1b가 그중 몇을 한꺼번에 잃고도 "그럭저럭" 보여서 못 알아챘다 |

**스크롤은 사이드바와 콘텐츠 패널이 각자 자기 안에서 든다**(둘 다 `overflow-y-auto`), 콘텐츠 패널엔
`min-w-0`이 함께 있어야 번역 표의 가로 스크롤이 사이드바를 밀지 않는다. 실측에서 문서 자체는 세로로
스크롤되지 않고 활성 스크롤러가 하나였다.

GitLab top bar의 검색·`+`·카운터 셋은 **넣지 않는다** — 대응물이 없고 SAAS §4.2가 기능 밀도를 막는다.
**Publish 버튼은 아직 셸에 없다** — 번역 화면 툴바이고, SAAS §8이 그것을 §6.55의 패널로 옮긴다.

### 6.55 프로젝트 패널 (`w-80`, 2026-09-10 8-2 — **골격뿐이다**)

프로젝트 축 라우트 여섯 전부에 붙는 320px 흰 패널. `app/(edit)/projects/[slug]/layout.tsx`가 마운트한다.

⚠️ **셸이 이걸 못 든다.** `app/(edit)/layout.tsx`는 `/projects` 목록도 감싸 `[slug]` params를 못 받는다 —
breadcrumb과 Publish가 지금 셸에 없는 이유가 정확히 그것이고, 그 레이아웃이 생긴 것이 8-2의 절반이다.

| 요소 | 규칙 |
|---|---|
| 프레임 | `w-80 shrink-0 p-2 gap-2` + 콘텐츠 패널과 **같은** 네 클래스(흰 배경·`rounded-xl`·`border-border-subtle`·`shadow-low`) · `aria-label="Project panel"` |
| 세그먼트 컨트롤 | 트랙 `bg-canvas rounded-sm p-1` · 세그먼트 `rounded px-2 py-1 text-sm`, 선택은 `bg-background shadow-low font-medium`. 갈래 둘: General · Changes |
| 본문 | **비어 있다** — "Nothing here yet." ⚠️ **"곧 나온다"고 쓰지 않는다**(§10) |
| 접근 이름 | ⚠️ **랜드마크와 컨트롤의 이름이 달라야 한다**(`Project panel` / `Panel view`) — 같으면 스크린리더가 둘을 똑같이 읽고 구별할 단서가 role뿐이다 |

⚠️ **내용은 8-P다.** `Changes`가 보여줄 diff는 **UI가 아니라 새 서버 능력**이고(커밋 없이 렌더만 하는
경로 + 접힌 상태에서 GitHub 0회 — SAAS §8), UI만 먼저 만들면 빈 껍데기를 두 번 그린다. 편집 손실 배너·
미배포 카운트·Publish 결과가 그때 번역 화면에서 이리로 옮겨온다.

### 6.6 설정 (`/projects/[slug]/settings`) — settings-block 여섯

블록 = `Card` 한 장(제목 + 한 줄 설명 `text-xs text-muted-foreground` + 본문). 위에서 아래로 **Repository**(mono 리포 칩 + 연결 상태 + [Connect]/[Reconnect]) · **Import status** · **Push token** · **Workflow** · **GitHub account**(mono `@handle` 칩 + [Disconnect] `danger sm`) · **Archive project**(2026-09-10, 7단계 — **맨 아래**). ✅ **Base branch 폼이 Repository 카드에 있다**(6b-3). ⚠️ **Base language 필드와 대기 Alert는 6b-5가 `/projects/[slug]/locales`로 옮겼다**(SAAS §7.7 결정 4 — 아래 §6.66). 이 화면이 그 컬럼에 대해 하는 일은 **워크플로 YAML에 `base-locale:` 한 줄을 박는 것뿐**이고, 그래서 로케일 목록을 조회하지도 않는다(`base-locale-screens.test.ts`가 양방향으로 센다). ⚠️ **GitHub account 블록은 `/account`(6b-4)와 같은 상태를 보인다** — 같은 로더(`lib/github-connect/account-view.ts`)를 부르고 다른 것은 연결 버튼의 착지뿐이다. **여기서 그 블록을 지우지 않는다**: 재인가 안내가 리포 재연결의 맥락에서 필요하고, 그 자리에서 "Manage in Account"로 링크하면 고치려고 두 화면을 오간다(§7.7 결정 4와 같은 판단).

- ⚠️ **블록이 독립적으로 실패한다.** 건강성은 App 토큰, 계정 한 줄은 사용자 토큰 — 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다. 각 블록이 자기 오류를 `Alert danger`(in-block)로 낸다.
- **push 토큰은 발급 응답에만 원문이 있다** — 값 칩 + [Copy] + "You won't see this again. Update the repository secret now."
- **[Run first import]의 결과 컴포넌트는 readiness 분기 밖**에 있다 (POSTMORTEM 2026-09-07 revalidate).
- **(6b) Base branch·Base language 저장 뒤에는 `Alert warning`이 블록 안에 남는다** — "Update the workflow file — until then CI pushes are rejected" (design §3.13, `checkFormat` 409). 그 폼이 서기 전까지는 이 불릿의 대상이 없다.
- **(7단계) Archive 블록은 결과 Alert를 두지 않는다** — 성공하면 `revalidatePath("/", "layout")`이 이 화면을 다시 그려 **방금 받은 문구를 언마운트한다**(POSTMORTEM 2026-09-07과 같은 함정). **카드가 [Restore project]로 바뀌는 것 자체가 피드백**이다(`reconnect-button` 선례). 확인은 `Dialog`(전 멤버의 편집이 멈춘다) + `danger` "Archive project"이고, **되돌리기는 묻지 않는다**(잃는 것이 없다). Dialog 본문에 **열린 PR 링크**가 실리고 조회 실패는 "확인하지 못했다" 한 줄이다(POSTMORTEM 2026-09-03). ⚠️ **readiness 분기 밖의 형제다** — 첫 적재가 실패한 프로젝트도 멈출 수 있어야 한다.
- 페이지 수준 거부(`?e=`)는 **global Alert**, 컨트롤의 실패는 **in-block Alert** — 두 층을 섞지 않는다.

### 6.62 로그인·초대 수락 — 셸 밖 2열 (2026-09-10, 8-1)

**골격을 `components/signin/auth-layout.tsx` 하나가 든다.** 캔버스(`--canvas`) 위에 패널 둘이
`grid-cols-2 gap-2 p-2`로 앉고, 각 패널이 `rounded-xl` + `border-border-subtle` + `shadow-low`다
(규약 3.5 — 셸과 같은 규칙이다, §5.1).

| 요소 | 규칙 |
|---|---|
| 좌측(폼) | **true white** · 폼 컬럼 `w-[320px]` · 로고 48 · `h1` `text-2xl font-medium` · provider 버튼 둘(`size="lg"` — **셸 밖 전용**, §6.4) |
| 우측(장식) | base가 **페이지 배경색**이고 아래로 갈수록 파랑이 든다(`--auth-hero-from` = `--canvas`). ⚠️ **그라데이션이 없으면 배경과 구분되지 않아 "로그인 패널만 떠 있는 그림"이 된다** — 그것이 의도이므로 위쪽에서 배경으로 수렴한다 |
| 도트 필드 | Canvas 2D (`components/signin/dot-field.tsx` + 잎 `lib/signin/dot-field.ts`). ⚠️ **hex를 tsx에 박지 않는다** — `--signin-dot`을 `getComputedStyle`로 읽는다(§6.2). ⚠️ 커서가 없으면 `autoCursor`가 ㄹ자로 순회하고 `prefers-reduced-motion`이면 1회 렌더 |
| 브랜드 아이콘 | GitHub·Google 인라인 SVG (`components/signin/brand-icons.tsx`) — ⚠️ `lucide-react`에 브랜드 글리프가 없고 **Google 4색은 §6.2의 예외다**(남의 브랜드 자산이라 토큰으로 접을 수 없다) |
| 피드백 | `?error=`·`?sessions=` → **토스트** (§6.25). ⚠️ **`auth-toast`는 아무것도 렌더하지 않는다** — 자리를 차지하면 그것이 곧 인라인 Alert의 자리가 된다 |
| 초대 수락 | 같은 골격. ⚠️ **Layer A(`not-found`·`expired`·`already-accepted`)는 인라인이다** — 페이지 콘텐츠 자체라 토스트로 옮기면 화면이 빈다(§6.25 경계표). 토스트는 `?e=`(버튼을 눌러서 난 거부)뿐 |

### 6.63 프로젝트 목록 (`/projects`) — 행 하나에 두 줄 (2026-09-10, 8-3)

**시안**: Figma `206:883`(목록) · `240:20442`(빈 상태). **fluid다** — 행이 2줄이고 메타에 리포 URL이
들어가 `max-w-4xl`(896)에서는 그 줄이 잘린다. 패널 안 padding은 `px-4`, 머리 `pt-6 pb-3` · 본문 `pt-3 pb-8`.

| 요소 | 규칙 |
|---|---|
| 머리 | `h1` `text-xl font-medium` + **총계 `Badge neutral`**. ⚠️ **총계는 필터 전의 값이다** — 탭을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에 답한다. 사이드바 카운트(SAAS §8 🔒)와 달리 이미 가진 배열의 길이라 왕복이 0이다 |
| 필터 | `SegmentedLinks` — **링크다, 클라이언트 상태가 아니다.** 트랙에 고정 폭이 없다(`inline-flex gap-1 p-1` + 세그먼트 `min-w-11`); 시안 192×36에 실측 188×36으로 앉는다. `?filter=active\|archived`이고 기본값 `all`은 URL에 안 싣는다. 모르는 값은 `all`로 떨어진다(주소창 값이다 — `parseProjectFilter`) |
| 행 | `p-4`, 좌측 2줄 / 우측 배지 하나. 이름 `text-base font-medium`(2026-09-10에 한 단계 내렸다가 **2026-09-11에 원복**), 메타 `text-sm text-muted-foreground` 한 줄: **`역할 · 리포 URL · N members`**. 실측 높이 80(시안 72 — Tailwind 기본 행간 차이) |
| 역할 | ⚠️ **배지가 아니라 메타 평문이다** (시안 개정). 배지로 만들면 우측에서 상태와 나란히 놓여 어느 쪽이 "지금 벌어지는 일"인지 흐려진다 |
| 리포 | 전체 URL. ⚠️ **링크가 아니다** — 행 전체가 이미 `<a>`라 중첩할 수 없고, 눌러도 GitHub이 아니라 프로젝트로 간다 |
| 상태 배지 | **항상 하나**이고 갈래는 `projectStatus`가 정한다 — **다섯**: `Archived` · `Setting up` · `Waiting for first import` · **`Reconnect needed`**(2026-09-11 — `repositoryId === null`, Publish만 조용히 거부되던 상태다. SAAS §7.5) · **`Active`**. ⚠️ **순서가 판정의 절반이다**: 보관 → readiness → `repositoryId`. 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은 답할 질문이 아니고, 첫 적재도 안 끝난 프로젝트에서 "다시 연결하라"도 아니다(그 컬럼이 막는 것은 **되돌려보내기**다) |
| 배지 색 | **사람이 뭔가 해야 끝나는 셋만 `warning`(amber)** — `Setting up`·`Waiting for first import`·`Reconnect needed`. `Active`·`Archived`는 `neutral`. ⚠️ **`Archived`를 amber로 칠하면 의도된 상태가 문제처럼 읽히고**, `Active`에 색을 주면 가장 흔한 상태가 가장 시끄러워진다(§6.1). 색 선택은 **맵 + `satisfies`**다 — 삼항이면 새 갈래가 사유 없이 회색으로 떨어지고 `tsc`가 조용하다 |
| **`Active`가 보이는 이유** | ⚠️ §6.1("가장 흔한 상태가 가장 조용하다")의 **예외다.** 근거는 **필터 탭이 같은 낱말을 쓴다**는 것 — `All / Active / Archived`를 보는 사람에게 행의 배지가 그 축을 되비추면 "지금 무엇을 보고 있나"가 이어지고, 배지가 항상 하나라 행 우측 폭도 안 흔들린다 |
| 빈 상태 (프로젝트 0개) | ⚠️ **필터와 [New project]를 그리지 않는다** (시안에서 그 줄이 `hidden`이다). 고를 것이 없는 탭 셋은 죽은 컨트롤이고, 만들기 버튼이 머리와 빈 상태에 둘 다 있으면 같은 행동이 한 화면에 두 번 나온다. `EmptyState`가 패널 **세로 중앙**에 선다 |
| 빈 상태 (필터 0건) | **다른 화면이다** — 머리는 그대로 두고 한 줄만 낸다("No archived projects."). 같은 빈 화면을 내면 사용자가 프로젝트를 잃었다고 읽는다 |
| 거부 | 페이지 수준 `?e=`는 **global `Alert danger`** — 머리 블록 맨 위 전폭. `isAccessError`·`isConnectError` **둘로** 거른다(앞의 것만 보면 GitHub 연결 실패가 무음이다 — POSTMORTEM 2026-09-06) |

⚠️ **셸의 `loadMemberships`와 다른 로더를 쓴다**(`loadProjectList`). 멤버 수는 `_count` 서브쿼리라 왕복이
+0이지만, 그것을 셸의 로더에 얹으면 `(edit)` 아래 **모든** 페이지가 목록 하나를 위한 집계를 문다 —
SAAS §7.7 결정 5가 사이드바 카운트를 거절한 것과 같은 축이다.

### 6.64 Home (`/projects/[slug]`) — 개요 (2026-09-09, 6b-6)

**프로젝트 진입의 착지점이다** (SAAS §7.7 결정 1). 셸 안 `mx-auto max-w-4xl px-6 py-6`,
**breadcrumb 없다**(이 화면이 프로젝트 루트다 — 위로 가는 길은 사이드바가 든다).

⚠️ **그 결정이 번역자에게 클릭 하나를 물렸고, 이 화면이 그것을 갚아야 한다.** 개요만 있고 링크가
없으면 순손실이다 — **번역으로 가는 경로가 주된 동작**이어야 한다.

⚠️ **다른 화면의 지표를 복제하지 않는다** (결정 2). 키 수·미배포 건수·마지막 전송·PR 링크는 번역
화면 툴바(§6.1)의 것이고, 리포·연결·적재 상태는 설정(§6.6)의 것이다 — 세 번째 사본을 만들면 그중
하나가 낡는다. **Home이 소유하는 것은 "한 화면에 모아야만 보이는 것"뿐이다.**

| 요소 | 규칙 |
|---|---|
| 머리 | `h1` = 프로젝트 이름 + 우측에 **화면당 하나인 primary** [Open translations](`Languages` 아이콘). 그 버튼이 클릭을 갚는 가장 직접적인 형태다 |
| Languages | 제목 + 설명 한 줄 + **행 전체가 링크인 목록**(`ul.divide-y.border.rounded-lg` + 행 `px-4 py-3`). ⚠️ **`/projects` 목록과 더 이상 같은 형이 아니다** — 8-3이 그쪽을 `rounded-xl` + 2줄 행 `p-4`로 바꿨다(§6.63). 행 = 코드(`text-mono`) + base `Badge` + 우측에 검토 필요 `Badge warning` + "N% · a of b". ⚠️ **`?focus=` 링크가 개요를 일로 잇는 유일한 수단**이다 |
| orphaned | ⚠️ **이 목록에 없다** — 그 열은 번역 화면에서 `disabled`라 `?focus=` 링크가 편집할 수 없는 곳으로 데려간다. 사유·복구는 §6.66이 든다. 살아 있는 로케일이 0이면 한 줄 + 그 화면 링크 |
| Recent activity | 세 출처를 시각 내림차순으로 한 줄에: **편집**(`?ns=`+`?focus=` 링크) · **CI push**(링크 없음 — 어느 키인지 모른다) · **Publish**(PR 외부 링크 `text-blue-600` + `ExternalLink` 12px §6.3). 각 행 우측에 상대 시각 `text-xs text-muted-foreground` |
| 없을 때 | 두 블록 각자 한 줄로 — 실패가 아니라 아직 아무 일도 없는 것이다 (§6.1의 "가장 흔한 상태가 가장 조용하다") |
| 역할 | 게이트는 **`translation:write`**. 이 화면에는 role로 갈리는 컨트롤이 없다 — 개요와 링크뿐이다 |

⚠️ **`?e=` 슬롯이 없다** — 보내는 자리가 0이다. ⚠️ **첫 적재 전 화면은 `ProjectNotReady`가 든다** —
번역 화면과 **같은 컴포넌트**다(정책과 문구의 소유자가 하나여야 한다, 6b-6이 그 사본을 합쳤다).

### 6.645 ⚠️ 이메일 칸에는 상태가 **셋**이다 (2026-09-10)

암호화 전환 뒤 표의 이메일·이름 칸이 세 갈래로 갈린다 — **셋을 같은 모양으로 그리면 안 된다**:

| 상태 | 무엇 | 어떻게 |
|---|---|---|
| 값 있음 | 남의 주소 | **마스킹 라벨**(`a***@acme.com`) — 충돌하는 행만 접두를 늘린다(malmoi#18). **서버가** 만든다 |
| 부재 | 그 값이 원래 없다 | 이력 표는 `—`, 멤버 표는 이름으로 대신(§6.68·§6.65) |
| **못 읽었다** | 저장된 값을 지금 키로 못 연다 | **`m.common.unreadable`("Unavailable")** — `lib/auth/query.ts`·`lib/sync/query.ts`가 낸다 |

⚠️ **셋째를 부재로 접지 않는다.** 빈 칸으로 두면 관리자가 "이 사람은 이메일이 없구나"로 읽는데, 실제로는 키가 옛 세대라 못 연 것이다 — POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다")이 화면 층으로 내려온 자리다. 이력 표에서는 `—`와 "Unavailable"이 **같은 열에서** 갈린다.

⚠️ **배지가 아니라 평문이다** — 사용자가 할 일이 없고(운영자가 키를 되살린다) 드문 상태를 요란하게 만들면 §6.1의 "가장 흔한 상태가 가장 조용하다"가 뒤집힌다.

### 6.65 멤버 (`/projects/[slug]/members`) — 표 둘 (2026-09-09, 6b-2)

**Members** 표(Person · Email · Role · Joined · Actions) 위에 [Invite member] `primary`, 그 아래 **Pending
invitations** 표(Email · Role · Expires · Invited by · Actions). 둘 다 `max-w-4xl` 본문에 있고 breadcrumb은
`프로젝트 이름 / Members`다.

- **Actions 열은 헤더가 `sr-only`다** — 시각적으로 비어야 하지만 이름 없는 `<th>`는 스크린 리더가 빈 열로
  읽는다 (§7).
- **행 컨트롤의 라벨은 대상을 든다** — `Change role for {name}` · `Remove {name}` · `Revoke invitation for
  {email}`. 열마다 같은 라벨이면 셀렉트 다섯 개가 누구의 것인지 구별되지 않는다(번역 셀의 `cellLabel`과
  같은 형). ⚠️ [Remove]의 `aria-label`은 **보이는 텍스트를 포함**한다 — 음성 입력이 라벨로 컨트롤을 찾는다
  (WCAG 2.5.3).
- **역할 변경은 native `Select`**(즉시 적용), **제거는 `Dialog` 확인 한 번**(되돌릴 수 없다). `Revoke`에는
  확인이 없다 — 같은 마스킹 값이 다이얼로그에 다시 나올 뿐이라 **식별을 고치는 것이 답이었다**(아래).
- **거부 문구는 행 옆 in-block `Alert danger`다.** 마지막 OWNER 보호(`last-owner`)는 **그 행에 대한 판정**이라
  상단 global Alert로 올리면 어느 행이 거부됐는지 사라진다. ⚠️ 이 화면에는 **global Alert 슬롯이 없다** —
  `?e=`를 이 경로로 보내는 자리가 없다(거부는 `/projects?e=`로 간다).
- ⚠️ **마스킹은 서버가 한다 — 원문은 와이어에 오르지 않는다** (2026-09-09, sec-audit 발견 4). 전에는 두
  로더가 `email`을 원문으로 내려보내고 `"use client"` 컴포넌트가 렌더할 때 가렸다 — **그러면 원문이 RSC
  페이로드에 그대로 실린다.** 관측자는 그 프로젝트의 EDITOR 이상이고 view-source로 읽으며, **대기 초대
  쪽이 더 민감하다**(아직 멤버가 아닌 외부인의 주소다). 지금 `MemberView.emailLabel`·
  `PendingInvitation.emailLabel`이 **이미 마스킹된 값**이고 컴포넌트는 그것을 그대로 그린다.
  상시 검사는 `components/__tests__/members-screen.test.ts`이고 **렌더가 아니라 소스 스캔**이다 —
  페이로드는 눈으로 안 보인다.
- ⚠️ **이메일 마스킹의 예외가 여기 있다.** 두 표 모두 `maskEmail`이 기본이지만(이 표는 EDITOR도 본다 —
  규칙을 역할로 나누지 않는다) **대기 초대는 마스킹한 주소가 유일한 식별자**라 첫 글자만 남기면 서로 다른
  둘이 같은 행이 된다([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)). 서버가
  `maskedInviteLabels`로 **목록 전체를 보고** 충돌하는 행만 접두를 늘린다 — 충돌이 없으면 출력이 `maskEmail`과
  같다(§6.1 "가장 흔한 상태가 가장 조용하다").
- **대기 0건은 `EmptyState`** — 표 머리만 남은 화면은 "불러오는 중"과 구별되지 않는다.
- **EDITOR에게는 컨트롤이 아예 렌더되지 않는다**([Invite member]·`Select`·[Remove]·[Revoke] 전부). 목록과
  대기 초대는 본다. ⚠️ 노출은 편의이고 차단이 아니다 — 판정은 Action의 `member:manage`다.

### 6.66 언어 (`/projects/[slug]/locales`) — 표 + 폼 (2026-09-09, 6b-5)

**이 화면이 생긴 이유는 orphaned 로케일이다.** 그때까지 로케일은 **번역 표의 열로만** 존재해서, 파일이
사라진 로케일이 왜 그렇게 됐고 어떻게 되살리는지 말할 자리가 없었다 (ARCHITECTURE §5.5.16).

셸 안 `mx-auto max-w-4xl px-6 py-6`. breadcrumb(프로젝트 이름 → Languages) → `h1` → 설명 한 줄 →
**표** → **기준 언어 Card**.

| 요소 | 규칙 |
|---|---|
| 표 | ⚠️ **`Card` 밖이다** — Card 본문의 `p-4`와 셀의 `px-4`가 겹쳐 표만 16px 더 들여쓰인다(실측). 멤버 화면(§6.65)과 같은 관용구로 `<Table>`을 `<main>`에 직접 둔다. 열 둘: Language · Translated |
| Language 열 | 코드는 파일명 그대로가 진실이라 **`text-mono`**(§4.1) + base면 `Badge`(muted) + orphaned면 `Badge danger`("File missing" — **배경 없음**, 되돌릴 수 있는 상태다 §6.2) |
| orphaned 행 | ⚠️ **배지만 달지 않는다** — 사유와 되살리는 방법을 `text-xs text-muted-foreground` 한 단락으로 함께 낸다. 그 둘이 이 화면이 존재하는 이유다. **진행률도 계속 낸다**("되살리면 돌아온다"의 근거) |
| Translated 열 | `localeProgress` — "N% · a of b" + 검토 필요가 있으면 `Badge warning`. ⚠️ **percent는 내림**이라 902/903이 100%로 보이지 않고, **base 로케일도 100%가 아닐 수 있다**(그 파일에 빈 값이 있을 수 있다) |
| 정렬 | base 먼저(나머지가 그것의 번역이다) → 살아 있는 로케일 코드순 → **orphaned 맨 뒤**(행마다 설명이 붙어 사이에 끼면 건강한 목록이 쪼개진다). base가 orphaned여도 맨 앞이다 |
| 기준 언어 Card | ⚠️ **Card에 제목·설명을 달지 않는다** — `FormGroup`이 라벨과 help를 들고, 둘을 다 두면 같은 문장이 화면에 두 번 나온다(실측). `Select`(native) + [Save] 하나. **orphaned 로케일은 목록에 없다** — 감추는 것은 편의이고 방어는 Action이다 |
| 대기 Alert | `Alert warning` + 고칠 줄을 **`<pre>`**로(여러 줄일 수 있는 코드는 값 칩이 아니다 §6.4) + [Copy line]. ⚠️ **`settings`로 링크하지 않는다** — 그러면 고치려고 두 화면을 오간다(§7.7 결정 4의 경계). 워크플로 YAML **전체**는 설정에 남는다 |
| 역할 | 페이지 게이트는 **`translation:write`**(번역자도 "왜 열이 사라졌나"를 봐야 한다). **기준 언어 Card와 대기 Alert만 `project:settings`로 갈리고 판정은 Action**이 한다 (§6.65와 같은 관용구) |

⚠️ **`?e=` 슬롯이 없다** — 보내는 자리가 0이다(거부는 `/projects?e=`, 저장 실패는 폼 안 `Alert danger`).

### 6.67 계정 (`/account`) — 카드 넷 (2026-09-09 6b-4 · 2026-09-10 세션 회수)

**사용자 축의 유일한 화면이다** (SAAS §7.7). 셸 안 `mx-auto max-w-4xl px-6 py-6`, 제목 `text-base
font-medium`, **breadcrumb 없다** — 프로젝트 축이 아니라 위로 올라갈 자리가 없다.

카드 넷: **Profile** · **GitHub account** · **Sessions**(전체 로그아웃) · **Sign out**.

⚠️ **쿼리 슬롯이 둘이다** — `?e=`(연결 실패, `isConnectError`)와 `?sessionRevocation=`(다섯 갈래: `cancelled`·`wrong-account`·`expired`·`invalid`·`unavailable`). 하나로 합치면 두 흐름의 실패가 서로의 문구를 띄운다.

| 블록 | 규칙 |
|---|---|
| Profile | 이름·이메일을 `<dl>`로 (`sm:grid-cols-[8rem_1fr]`, 라벨 `text-xs text-muted-foreground`). ⚠️ **읽기 전용이고 그 이유를 카드 설명이 말한다** — provider가 소유하고 재로그인마다 `planEmailRefresh`가 갱신한다(고칠 수 있게 하면 초대 대조가 검증되지 않은 주소 위에 선다). 값은 세션이 아니라 **`User` 행**에서 읽는다: 초대 대조가 보는 값이 그쪽이다. ⚠️ 주소는 식별자라 `text-mono`이고 **마스킹하지 않는다**(자기 주소다 — 남의 주소를 보이는 자리만 `maskEmail`을 지난다) · 값이 없으면 "None" |
| Sessions | "Sign out everywhere" — 확인 버튼은 **`danger sm`**이고 누르면 **공급자 재왕복**이다(`Dialog`가 아니다: 확인의 근거가 "정말?"이 아니라 **그 계정을 지금 통제하는가**여서, 브라우저 안 확인으로는 그 질문에 답할 수 없다). 버튼은 `loading`이면 스피너가 붙는다(§6.4 — 라벨은 안 바뀐다). 실패는 **in-block `Alert danger`**를 폼 안에 렌더한다 — 페이지 상단으로 올리면 어느 카드의 실패인지 사라진다. ⚠️ **아래 Sign out 카드는 `danger`가 아니다** — 그쪽은 이 기기 하나이고 되돌리기가 재로그인 한 번이라, **되돌릴 수 없는 쪽만** 빨강을 쓴다 |
| GitHub account | 설정 화면 §6.6의 같은 블록과 **같은 4갈래**(`ok` 연결됨 / `ok` 미연결 / `reauthorize` / `unavailable`)이고 같은 로더를 부른다. 다른 것은 **연결 버튼의 착지**뿐이다(`dest="account"`) |
| Sign out | 셸에 이미 둘(사이드바 하단·유저 메뉴)이 있는데 여기 세 번째를 둔다 — Action 하나에 상태가 없어 **낡을 수 없고**, 계정 화면에 로그아웃이 없으면 사용자가 찾으러 나간다. 버튼은 `default sm`이다(`danger`가 아니다 — 되돌릴 수 있다) |

⚠️ **페이지 수준 거부는 global `Alert danger`** (§6.4) — callback이 연결 실패를 `?e=`로 여기 보낸다.
**주소창 값이라 `isConnectError`로 거른다**: 캐스팅하면 프로토타입 키가 문자열 자리에 함수를 넣어 화면이
죽는다 (POSTMORTEM 2026-09-08).

### 6.68 이력 (`/projects/[slug]/logs`) — 표 하나 (2026-09-10, 7단계)

셸 안 `mx-auto max-w-4xl px-6 py-6`. breadcrumb(프로젝트 이름 → Sync history) + 제목 + 한 줄 설명, 그 아래 **표 하나**. ⚠️ **표는 `Card` 밖이다** — 로케일·멤버 화면과 같은 관용구이고, Card 본문의 `p-4`와 셀의 `px-4`가 겹쳐 표만 16px 더 들여쓰인다(실측).

열 다섯: **When**(`<time dateTime>`에 절대 시각 `YYYY-MM-DD HH:mm UTC` + 그 아래 상대 시각 `text-xs`) · **Started by** · **Result**(배지 — §6.2) · **Files** · **Reason**.

- ⚠️ **절대 시각이 먼저이고 UTC라고 말한다.** 이력에서 "2 days ago"만으로는 **어느 밤인지 못 가른다**. 서버 렌더라 `toLocaleString`은 서버의 타임존을 쓸 뿐 보는 사람의 것이 아니고, 라벨 없이 내면 사용자가 자기 시간대로 읽어 날짜를 하루 어긋나게 센다.
- ⚠️ **값이 없는 칸은 빈 칸이 아니라 `—`다** — 빈 칸은 열이 깨진 것처럼 보인다. 실패의 변경 수가 `0`이 아닌 이유도 같다: 0은 "안 바뀌었다"는 **관측**이고 실패엔 관측이 없다.
- **페이지네이션은 링크 하나다** — 서버 `?cursor=` + [Older](`ButtonLink`). 클라이언트 상태가 0이라 뒤로 가기·공유·새로고침이 그냥 된다. 무효 커서는 첫 페이지다(주소창 값이라 500이 아니다).
- ⚠️ **`RUNNING` 행은 스냅샷이다** — 자동 갱신이 없다(이 리포에 폴링 0건). 갱신은 재방문이고, 줄임표는 **진행 중에만** 쓴다(§10).
- ⚠️ **[Send changes]가 없다.** `logs` = 과거 이력 / 8단계 패널 = 지금 상태 + 행동 (SAAS §8 8단계 🔒). 섞으면 `logs`가 패널의 열등한 사본이 된다.
- 빈 상태는 `EmptyState`("No syncs yet") — **표 대신** 반환한다. ⚠️ 그것이 나오는 것은 **조회가 성공했을 때뿐**이다(페이지에 `try`가 없다): 실패를 빈 표로 접으면 "아직 없다"와 "물어보지 못했다"가 같아진다 (POSTMORTEM 2026-09-03).

### 6.69 보관된 프로젝트 (2026-09-10, 7단계)

`translation:write` 화면 **다섯**(Home·번역·언어·멤버·이력)이 같은 `EmptyState`를 낸다 — `components/project-archived.tsx`가 정책과 문구를 한 곳에서 든다. OWNER에게만 [Open settings] `primary`가 붙는다(EDITOR는 그 화면에 못 들어가므로 누를 수 없는 버튼을 주지 않는다). ⚠️ **설정 화면은 이 갈래를 안 만난다** — `project:settings`가 보관을 통과하는 유일한 permission이고 그것이 되돌리는 길이다.

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
| ⑤⑥ 결과 카드 | 토큰 값 칩 + [Copy] · YAML 코드 블록 + [Copy] 라벨 교체 "Copied" · 결과는 **`Alert`**(실패 0 → `success` / 부분 실패 → `warning`) 안에 헤드라인 "Imported N keys." + 상위 5건 "Could not read {path}" `text-xs` + `<details>` 안 `text-mono whitespace-pre-wrap` 진단(§4.1 — 파서 원문이 여러 줄이다) · [Start translating] `primary`. ⚠️ **tone은 `failed`가 정한다** — 진단 목록 길이로 고르면 목록이 빈 부분 실패가 success로 그려진다(불변식 9) |

⚠️ **어댑터 내부 이름을 화면에 쓰지 않는다** (SAAS §3). 라벨은 서버가 `formatLabel`로 만들어 내려준다 — 그 모듈을 클라이언트가 **값으로** import하면 어댑터 전부(ts-morph)가 번들에 들어온다 (POSTMORTEM 2026-09-07).

### 6.8 아이콘 — `lucide-react` 16px, **셸은 전 항목이 아이콘을 든다** (2026-09-08)

세트는 `lucide-react` **하나**다 (§1). ⚠️ **예외가 하나 있다** — provider 브랜드 로고(GitHub·Google)는
그 라이브러리에 **없다**(브랜드 글리프를 제외한다). `components/signin/brand-icons.tsx`가 인라인 SVG로
들고, **Google의 4색은 §6.2의 "새 raw 색을 늘리지 않는다"와 아래 "색은 상속"의 예외다** — 브랜드 색은
우리가 고르는 값이 아니라 남의 자산이라 토큰으로 접을 수 없다 (8-1b). 크기는 **둘뿐이다**: **16**(기본 — 사이드바·버튼·Alert·인라인·`EmptyState` 칩 안) · **12**(외부 링크 `ExternalLink`만, §6.3). ⚠️ **24는 8-3에 소비자가 0이 됐다** — `EmptyState`의 아이콘이 48 원형 칩 **안의 16**으로 갔다(§6.4). 그 밖의 크기를 만들지 않는다 — 사이드바 항목이 `p-1.5 text-sm`이고 아이콘 박스가 `size-4`라 20 이상은 그 줄에서 넘친다 (§5.1).

**아이콘이 없으면 미완인 자리** (LNB가 대표다 — 접힌 레일에서는 아이콘이 유일한 라벨이므로, 항목 하나라도 비면 그 상태가 성립하지 않는다):

| 자리 | 아이콘 |
|---|---|
| 사이드바 — 사용자 구역 | Projects `Briefcase` · Settings `Settings` (8-3) |
| 사이드바 — 프로젝트 구역 | Home `House` · Locales `Globe` · Translations `Languages` · Members `Users` · Logs `History` · Project settings `Settings` (8-3이 이름과 순서를 시안에 맞췄다) |
| 사이드바 하단 전역 | **Help `CircleHelp` · Sign out `LogOut`** — 둘뿐이다 (8-3). ⚠️ `LayoutGrid`·`Plus`·`CircleUser`·`PanelLeft`는 소비자가 0이 됐다 |
| ~~프로젝트 컨텍스트~~ | ⚠️ **스위처가 8-3에 사라졌다** — `ChevronsUpDown`도 함께 소비자 0이다 (§6.5) |
| 헤더 | **로고와 사용자 메뉴 아바타뿐이다** (8-2) — ⚠️ 햄버거 `Menu`는 **없어졌다**(반응형 분기 0). breadcrumb 구분자는 아이콘이 아니라 텍스트 `/`다(§6.4) |
| 아이콘 전용 버튼 | 닫기 `X` · 복사 `Copy` → 성공 `Check` · 재시도 `RotateCcw` · 행 메뉴 `Ellipsis` |
| 주 행동 버튼 | Publish `Send` · 리포 재연결 `RefreshCw` · 첫 적재 `Play` · 초대 `UserPlus` · GitHub 연결 `Link2` · Home의 [Open translations] `Languages` |
| 필터 | 검색 `Input` 앞 `Search`(`absolute left-2` + `pl-8`) · 상태 `Select` 앞 `ListFilter` |
| Alert 4종 | `Info`·`CircleCheck`·`TriangleAlert`·`CircleX` — **정본은 §6.2 표**다 |
| 외부 링크 | `ExternalLink` 12 (§6.3) |
| `EmptyState` | **48 원형 칩 안의 16** `text-muted-foreground` (8-3) — **일러스트는 여전히 없다**. 빈 이력 `History` · 보관된 프로젝트 `Archive` · 프로젝트 0개 `FolderGit2` |

**쓰지 않는 자리** (아이콘이 정보를 안 더하고 스캔만 방해한다): 배지(§6.2는 텍스트만) · `Card` 제목 · 표 헤더 · **반복 목록의 모든 행**(네임스페이스 패널·리포 목록·키 행 — 같은 아이콘이 n번 반복되면 정보량이 0이다) · 텍스트 링크 안(외부 링크 예외).

**형**: `size-4`(12는 `size-3`, 24는 `size-6`) · 색은 **상속**(`currentColor`) — 아이콘에 별도 색 클래스를 주지 않는다(예외는 Alert 4종과 `EmptyState`뿐) · 라벨과 `gap-2` · **라벨이 있으면 `aria-hidden`**, 아이콘만이면 `aria-label` (§7).

⚠️ **`lucide-react` 1.x에 브랜드 아이콘이 없다** — `Github`·`Google`을 import하면 빌드가 죽는다(1.37.0 실측). GitHub 연결 버튼은 `Link2`이거나 아이콘 없이 라벨만이고, provider 로고가 필요하면 인라인 SVG를 그 컴포넌트 안에 둔다.

⚠️ **아이콘 import는 `client-graph.test.ts`의 허용 목록을 지난다** — `lucide-react`가 거기 없으면 클라이언트 컴포넌트가 아이콘 하나만 써도 red다 (`features/translation-ui/tasks.md` T1이 넣는다).

## 7. 접근성

- **대비 하한 AA(4.5:1)**. §2.2가 가장 흔한 위반 경로다 — 사이드바가 muted 표면이 되면서 그 자리가 늘었다.
- **포커스 링 셋** — `focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none`. **셋은 `components/ui/` 안에 있다.** `components/__tests__/focus-ring.test.ts`가 (1) **스캔 대상 전체**의 네 태그가 셋을 드는지(허용 목록 파일의 raw 태그도 링은 들어야 한다), (2) `ui/` **밖에 raw 태그를 쓰는 파일이 0개인지** 둘을 센다. ✅ **축소형 허용 목록은 2026-09-08 ship 4에서 비었다** — (2)가 전면 방어선이고, 새 컨트롤은 `components/ui/`에 프리미티브로 만든다(목록을 다시 채우지 않는다).
  - ⚠️ **"상수에 숨기지 말 것"은 사라지지 않았다 — 자리가 `ui/` 안으로 옮겨졌을 뿐이다** (2026-09-08 실측). 스캐너는 **여는 태그의 소스**를 읽으므로 링을 `cva` 베이스나 공유 `fieldClass`에 모으면 그 파일이 통째로 검사 밖이 된다. 그래서 프리미티브 다섯(`Button`·`Input`·`Textarea`·`Select`·`Radio`)이 각자의 태그에 셋을 **리터럴로** 적는다. 같은 이유로 `Button`에 `asChild`(Slot)를 두지 않는다 — 그 한 겹이 태그를 지운다.
  - 스캐너는 **주석을 벗기고 센다** — 프리미티브가 자기 태그 이름을 docstring에 쓴다(`native \`<select>\`다`).
- `--ring` == `--border`라서 **`muted` 표면 위에선 포커스 링이 약하다** — 사이드바 항목·값 칩 옆 버튼에 `focus-visible:ring-offset-1`을 더한다(offset 색 기본이 배경).
- **저장 알림은 표 하나에 `aria-live="polite"` 영역 하나**다 (`components/translations/announcer.tsx`) — 셀마다 두면 903행×3로케일에 2,700개다. 결과만 알린다("Saving…"은 알리지 않는다). 실패 시 포커스는 **`shouldRefocus(active, own)`가 정한다**: `body`이거나 같은 셀일 때만 되돌리고, 사용자가 다음 셀을 치고 있으면 뺏지 않는다 — 재시도 지점은 상태줄의 `[Retry]`다 (design §3.8).
- **번역 화면의 규칙 여럿은 `components/__tests__/translations-screen.test.ts`가 소스로 고정한다** — `aria-live`가 announcer에만 있는지 · 셀에 `role="status"`가 없는지 · 셀이 키·로케일을 접근 이름으로 드는지 · `Textarea rows=1`인지 · 배너 tone이 warning인지 · 옛 `pull-button.tsx`가 사라졌는지. 이 절의 규칙을 고치려면 그 파일이 red를 낸다.
- 아이콘만 있는 버튼은 `aria-label`.
- 드롭다운·모달은 Radix가 포커스 트랩·Esc·`aria-*`를 든다 — 직접 만들지 않는다.

## 8. className & 변형

- 조건부 클래스는 **항상 `cn()`** 을 지난다 (§4.2의 twMerge 등록 때문에 특히). 삼항으로 문자열을 고르는 것도 조건부 클래스다.
- 변형이 셋 이상이면 `class-variance-authority`(Button·Badge·Alert). 둘 이하면 인라인 삼항이 낫다.
- 프리미티브는 `className`을 받아 **끝에** 병합한다(`cn(base, variants, className)`) — 호출부가 폭·여백만 덧댄다. 색·높이를 호출부에서 덮으면 형이 갈린다. ⚠️ 2026-09-08 `/doc-check`이 로그인 provider 버튼의 `h-9`를 잡았고 **규칙이 아니라 코드를 고쳤다** — 지금 높이를 덮는 자리는 사이드바의 `h-auto`(§6.5가 그 형을 적어 둔다) 하나다.

## 9. SaaS UI 레퍼런스 — GitLab (2026-09-07 결정, Supabase에서 변경)

**레퍼런스가 정하는 것은 레이아웃·정보구조·컴포넌트 구성이다. 색·타입·간격은 정하지 않는다** — 그건 §2·§4·§5 앞부분의 우리 토큰이다.

Supabase를 골랐던 이유(2026-09-05)는 "개발자 도구이면서 비개발자도 쓰는 밀도, 프로젝트 전환이 일급인 정보구조"였다. GitLab이 그 둘을 더 직접 갖고 있고, 결과물이 PR이라 **사용자가 이미 그 화면 안에 있다** — 같은 배치를 쓰면 "내가 고친 것이 저기로 간다"가 화면에서 이어진다 (spec §2.5).

### 9.1 가져오는 것

| 축 | 무엇 | 어디 |
|---|---|---|
| **super sidebar** | 브랜드 → 프로젝트 컨텍스트(전환 메뉴) → 섹션 항목 → 하단 전역 항목 · 접힘 | §6.5 |
| **헤더** | 사용자 메뉴 우 · 48px — **breadcrumb은 페이지 콘텐츠 첫 줄이다**(§6.5). ⚠️ 8-2가 로고를 왼쪽에 더하고 전폭으로 넓혔다 | §6.5 |
| **콘텐츠 폭 둘** | 폼·설정은 limited, 표는 fluid | §5.1 |
| **settings-block** | 제목 + 설명 + 본문 카드가 세로로 쌓인다 | §6.6 |
| **표 구성** | 헤더 sticky · 행 hover · 세로선 없음 · 마지막 행에도 하단선 | §6.1 |
| **Alert 배치 셋** | global / page-level / in-block | §6.4 |
| **빈 상태 패턴** | 짧은 제목 · 문장 하나 · 버튼 하나 | §6.4 |
| **로그인 2열** | 폼 좌 · 장식 우(스크린샷 2) | user-stories §1 |
| **문장 규칙** | sentence case · 라벨에 마침표 없음 · 결과를 말하는 버튼 | §10 |

### 9.2 가져오지 않는 것

- **색 팔레트·시맨틱 토큰** (Pajamas neutral/blue/…). 토큰의 진실은 `app/globals.css`(**neutral** — §2)이고 새 raw 색을 늘리지 않는다(§6.2).
- **타입 스케일·폰트**(GitLab Sans·GitLab Mono)·**간격·radius 값**. 우리 스케일로 반올림한다(§5.1).
- **다크 모드** (§3).
- **헤더의 검색·`+`·카운터**, **기능 밀도**(사이드바 항목 십수 개). SAAS §4.2.
- **Vue 컴포넌트(`@gitlab/ui`)·아이콘 세트(`gitlab-svgs`)** — lucide 16px로 대응.
- **일러스트**(빈 상태 SVG) — `EmptyState`는 여전히 아이콘 하나뿐이다.
  - ⚠️ **로그인 우측 장식은 예외가 됐다** (8-1b). 그전까지 "CSS dot-grid + 토큰만 쓴 정적 모형 카드"였는데, Figma 시안이 **래스터 키비주얼(`public/brand/malmoi-signin-kv.png`)과 Canvas 도트 필드**를 들여왔다. 셸 **밖** 화면 둘(로그인·초대 수락)에만 해당하고, 셸 안 화면에는 여전히 일러스트를 두지 않는다.

### 9.3 판정 기준

"GitLab처럼 보이는가"로 판정하지 않는다. **§9.1의 아홉 축 중 어긋난 것이 있는가**로 본다 — 그래야 "GitLab처럼 보이게" 다듬는 작업이 색·폰트로 새지 않는다.

## 10. UI 문장 규칙 (en — design.gitlab.com/content에서 가져온 것, 2026-09-07)

문자열은 `messages/en.tsx`에 있고 화면은 **`@/lib/i18n`의 `m`** 으로 읽는다(design §3.1 — 그 모듈은 잎이라 `client-graph.test.ts`가 무게를 센다). 이 절이 그 문체이고, **`lib/i18n/__tests__/no-korean-ui.test.ts`가 화면 소스의 한글 리터럴을 축소형 허용 목록으로 고정한다**(`focus-ring`·`globals-css`와 같은 계열).

- **Sentence case.** 라벨·열 제목·버튼·제목 전부.
- **UI 요소 라벨에 마침표 없음**(버튼·라벨·제목·배지). help text·Alert 본문 같은 완전 문장에는 있음. **느낌표 금지.**
- **줄임표 `…`** 는 진행 중("Saving…")과 추가 입력이 필요한 행동에만. 앞에 공백 없음. ⚠️ **검색 필드의 placeholder가 그 둘째 갈래다** (2026-09-11 사용자 — 앞으로 이 패턴이다): `Search projects…`. **`aria-label`에는 붙이지 않는다** — 스크린리더가 읽는 *이름*이라 장식이 들어가면 안 되고, 그래서 문구 키가 `label`/`placeholder`로 갈린다. **문자는 U+2026이고 마침표 셋이 아니다.**
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
못 확인한 것: super sidebar 선택 항목의 정확한 배경(테마 변수 정의 파일 미발견). ⚠️ **그 자리는 두 번 바뀌었다** — 6단계는 `bg-background` 흰 알약, **8-2·8-3은 `bg-foreground/10` 알파**다(사이드바가 캔버스 위에 얹히면서 흰 알약의 근거가 사라졌다, §6.5).

## 빠른 체크리스트 (새 UI 만들 때)

- [ ] `dark:`를 새로 쓰지 않았나 (§3)
- [ ] 식별자(키·slug·URL·경로)에 `text-mono`를 썼고 `text-xs`를 겹치지 않았나 (§4.1·§4.2)
- [ ] raw `<button>`·`<input>`·`<select>`·`<textarea>`를 쓰지 않고 프리미티브를 지났나 (§6.4·§7)
- [ ] `muted` 표면(사이드바·표 헤더·칩) 위에 `text-muted-foreground`·`hover:bg-accent`를 쓰지 않았나 (§2.1·§2.2)
- [ ] `bg-destructive`를 쓰지 않았나 — 글자색 전용이다 (§2.3)
- [ ] 새 raw 색을 늘리지 않았나 — amber·destructive·blue-600뿐 (§6.2). 브랜드 글리프만 예외 (§6.8)
- [ ] **weight가 500을 넘지 않나** — 기본은 300, 버튼 라벨은 400 (§0·§4)
- [ ] **`tracking-*` 유틸을 쓰지 않았나** — 자간은 크기 토큰이 든다 (§4)
- [ ] **인라인 링크에 밑줄을 붙이지 않았나** (§0·§6.3)
- [ ] **그림자가 `shadow-low`·`shadow-medium`인가** — Tailwind 기본은 검정 기반이라 탁하다 (§4.5)
- [ ] 조건부 클래스가 `cn()`을 지나나 (§8)
- [ ] 임의값(`text-[…]`) 대신 스케일을 썼나 (§4)
- [ ] 문자열이 `messages/en.tsx`에서 오고 §10의 문체인가
- [ ] 외부 링크에 `ExternalLink` 아이콘이 있나 (§6.3)
- [ ] 사이드바 항목·주 행동 버튼·Alert에 §6.8의 아이콘이 붙었나 — 16px, 색은 상속, 라벨 있으면 `aria-hidden`
- [ ] 결과를 인라인으로 보이는 컴포넌트가 `revalidatePath`가 바꾸는 분기 밖에 있나 (§6.6)
- [ ] (셸) §9.1의 아홉 축과 어긋나지 않았나 — 색·폰트를 GitLab에 맞추려 하지 않았나 (§9.2)
