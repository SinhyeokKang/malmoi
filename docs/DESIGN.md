# DESIGN.md

편집 UI의 시각 규칙. **`~/code/bugshot-2`의 `docs/DESIGN.md`를 원본으로 이식했고**, 두 축이 다르다: Tailwind **v4**(그쪽은 v3)이고 **라이트 단일**(그쪽은 라이트/다크 양쪽)이다. 그 차이가 만드는 함정을 §1·§3에 적었다.

**2026-09-07 — 레퍼런스를 Supabase → GitLab으로 바꿨다** (SaaS 6단계 PRODUCT §7.7). 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**(§5·§6.5~§6.7·§9)이고, **색 토큰·타입 스케일·간격·radius는 기존 것 그대로다**(§2·§4·§5 앞부분) — GitLab Pajamas의 팔레트·폰트를 들이지 않는다. 같은 날 컨트롤이 hand-rolled에서 **프리미티브(`components/ui/`)** 로 바뀌었다(§6.4·§7).

무엇을 만드는지는 [PRODUCT.md](./PRODUCT.md)(화면별 구성은 §7.7), 불변식은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 0. ⚠️ 8단계 UI 재작성으로 바뀐 것 (2026-09-10)

**Figma 시안을 화면에 입히면서 전역 규칙 열일곱이 바뀌었다.** 이 문서의 나머지가 그 이전을 서술하고
있으면 그쪽이 낡은 것이다 — 각 항목의 상세는 오른쪽 절에 있다.

| 무엇 | 전 | 후 | 상세 |
|---|---|---|---|
| **팔레트** | slate (푸른 틴트) | **neutral** | §2 |
| **font-weight** | 최대 600, 기본 400 | **500과 400 둘뿐이다** — 제목·라벨 500, 나머지 400 (⚠️ 2026-09-11에 기본을 300에서 400으로 올렸다: 상한 500은 그대로이고 **하한이 사라졌다**. `font-light`는 소비자 0) | §4 |
| **자간** | 유틸(`tracking-tight`)로 그때그때 | **크기 토큰이 든다** (`--text-*--letter-spacing`) | §4 |
| **radius** | `--radius` 10px | **12px** — 파생 전부 상승(md 10 · lg 12 · xl 16), 버튼 base `rounded-lg` | §5 |
| **elevation** | Tailwind `shadow-sm`·`shadow-md` | **`shadow-low`·`shadow-medium`** (Figma 색 + spread 확대) | §4.5 |
| **인라인 링크** | `underline` | **밑줄 없음** — 색과 아이콘으로만 | §6.3 |
| **피드백** | 인라인 `Alert` | **토스트**(전역 결과에 한해) | §6.25 |
| **셸 밖 화면** | `mx-auto max-w-sm` 카드 | **2열 패널** — 바깥 padding 8 · 패널 간 gap 8. ⚠️ **셋이다** (2026-09-12): `/signin` · `/invite/[token]` · **`/signin/link/[challenge]`** | §5.1 |
| **앱 셸** (8-2) | 사이드바 `bg-muted border-r` + top bar + `xl` 미만 오버레이 | **캔버스 위 패널 둘** — 전폭 48 헤더 · 투명 사이드바 · 흰 콘텐츠 패널, 반응형 분기 0. ⚠️ **320 프로젝트 패널은 2026-09-16에 지웠다**(§6.55) | §5.1·§6.5 |
| **캔버스 토큰** (8-2) | `--auth-canvas` | **`--canvas`** — 셸과 셸 밖 화면이 같은 값을 쓴다 | §2 |
| **Badge 모양** (8-3) | `rounded` (4px) | **알약** `rounded-full px-2` + `neutral` variant | §6.4 |
| **EmptyState** (8-3) | 맨 아이콘 24 | **48 원형 칩 + 아이콘 16** | §6.4·§6.8 |
| **사이드바** (8-3) | 접기 레일 · 프로젝트 스위처 · `Your work` 라벨 | **접기 없음 · 스위처 없음 · 라벨이 이름 그대로 · 하단에 Docs** | §6.5 |
| **번역 표의 축** (8-4) | 로케일이 **열** (`\| Key \| en \| ko \|`) | **로케일이 행** — 키 셀 320 + 그 아래 로케일 행들, shadcn 기반 `<table>` | §6.1 |
| **번역 필터** (8-4) | 왼쪽 `w-52` 네임스페이스 패널 + 상태 `Select` + 기준 로케일 `Select` | **툴바 셋**(네임스페이스 드롭다운 · 로케일 다중 선택 · 검색) + **칩 행**, 상태 필터 없음 | §6.1 |
| **breadcrumb** (8-4) | 프로젝트 하위 화면 다섯의 첫 줄 | **없다** — 위로 가는 길은 사이드바가 든다(프리미티브는 `/projects/new`가 계속 쓴다) | §6.1 |
| **타입 스케일** (2026-09-12) | `text-xs` 12px (Tailwind 기본) | **13px** — mono 표면(`--mono-size`)과 크기가 같아졌다. `@theme`이 덮는 단계가 `base`와 둘이다 | §4.1 |

⚠️ **앞의 여덟은 8-1b(로그인·초대)를 그리며 나왔고, 그다음 둘이 8-2(셸) · 그다음 셋이 8-3(사이드바·
목록) · 마지막 셋이 8-4(번역 화면)다. 전 화면에 적용된다.**
다음 화면을 옮길 때 여기부터 읽는다.

⚠️ **base 치수 교체는 2026-09-11에 끝났다** — `md`가 36(`h-9`)이고 입력 셋도 같은 높이다. 미뤄 둔
이유("소비자 26파일이 함께 움직인다")는 시안의 기본값이 36으로 드러나면서 해소됐다. `Button
size="lg"`(40)는 그대로 **셸 밖 카드 전용**이다(로그인·초대 수락·**계정 병합** — 2026-09-12에 셋이
됐다, §6.4).

## 1. 기반 스택

| | 값 | bugshot-2와의 차이 |
|---|---|---|
| Tailwind | **v4** — `tailwind.config.js`가 **없다**. 테마는 `app/globals.css`의 `@theme inline` | v3 + config 파일 |
| 프리미티브 | **`components/ui/`를 이 리포가 소유한다** (2026-09-08 — shadcn 생성 코드를 걷어내고 다시 썼고 CLI로 신규 컴포넌트 추가는 허용하되 기존 파일을 덮어쓰지 않는다). Radix는 `radix-ui` 단일 패키지에서 **여섯** — DropdownMenu·Dialog·Slot·**RadioGroup**·**Checkbox**·**Select** (2026-09-11에 `Tooltip`을 걷었다 — 8-3이 접기 레일을 지우면서 소비자가 0이 됐다. **RadioGroup은 2026-09-12** — `SegmentedControl`이 roving tabindex를 넘겼다. **Select와 `Radio` 본체는 2026-09-13** — 사용자 지시 "Radix 우선"이고, 핸드오프가 셀렉트의 `chevron-down`과 라디오의 원·점을 **px로 못 박아** native로는 맞출 수 없었다) | shadcn 생성물을 그대로 씀 |
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
- ⚠️ **캔버스(`--canvas`) 위에서도 무효다** (8-2) — 그 값이 `--muted`와 거의 같아 사이드바에서 아무것도 안 보인다. 그래서 사이드바의 hover·선택은 **`--foreground`의 알파**(`hover:bg-foreground/[0.03]` · `bg-foreground/[0.07]`)다: 알파는 어느 표면에서도 성립한다 (§6.5). ⚠️ **2026-09-11에 둘 다 한 단계 내렸다**(`/5`·`/10`에서) — 배경 없는 표면이라 같은 알파도 흰 패널 위보다 진하다.
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
- 크기 관용: **`text-xs`·`text-sm`이 지배적**(라벨·필드·보조 텍스트·표 셀·버튼). `text-base`=본문·섹션 제목(⚠️ **셸 안 페이지 제목이 2026-09-11에 `text-xl`로 빠져나갔다** — 사용자, 8단계 리워크 기준: `/projects`·번역만 20px이던 것을 나머지 일곱이 따라갔다. 남은 소비자는 프로젝트 목록 **행 이름**과 `Dialog` 제목이다. ⚠️ **그리고 2026-09-15에 18로 되돌아왔다** — 규격이 `PanelHeader`로 올라가면서 셸 안 `h1` **아홉이 전부 `text-lg font-medium`**이다(§5.15). 20은 카드 헤더·모달 제목이 들고, 남은 `text-xl` 소비자는 **온보딩/Publish 모달 제목**과 **56 아바타의 이니셜**뿐이다), `text-lg`=**셸 밖 카드의 제목 전용**이었다 — ⚠️ **8-1b가 그 둘을 `text-2xl`로 올렸다**(Figma 시안). 지금 `text-lg`의 소비자는 **`EmptyState` 제목**(2026-09-11)과 **셸 안 페이지 제목 아홉**이다(2026-09-15) — ⚠️ **`/privacy`·`/docs`는 2026-09-19에 `text-2xl`로 올라가 이 목록에서 빠졌다**(§6.61: 셸 밖 제목이라 §6.62와 같은 급이 맞다). ⚠️ **`@theme`이 덮는 단계는 둘이다 — `text-base` 15px와 `text-xs` 13px**(뒤는 2026-09-12, §4.1). 남은 소비자가 둘 다 제목이고 본문은 `text-sm`(14)이라, 이 토큰이 정하는 것은 본문 크기가 아니라 **제목과 본문의 간격**이다(15/14면 한 단계, 16/14면 두 단계). `EmptyState` 제목이 `text-lg`로 올라간 것도 그 1px 차이 때문이다.
- **임의값(`text-[…]`)은 스케일에 대응값이 없을 때만.** 13px은 `text-xs`(코드 블록이면 `text-mono` — §4.1), 14px은 `text-sm`이 있으므로 임의값으로 쓰지 않는다. ⚠️ **12px은 2026-09-12부터 스케일에 없다** — `text-xs`가 한 단계 올라가며 대응값이 사라졌다. 12px이 필요해 보이면 임의값을 박기 전에 **왜 `xs` 아래가 필요한지**를 먼저 묻는다(스케일에 단계를 더하는 것이 답일 수 있다).
  ⚠️ **2026-09-24에 그 질문의 답이 "필요 없다"였다** (audit #45) — 시안이 12를 지정한 셋(`Not sent` 알약 · Publish 표의 키 칸 ·
  저자 이름)이 전부 `text-xs`(13)로 올라갔다. 단계를 더할 만큼 소비자가 없고, 셋 다 13에서 넘치지 않는다. `text-[15px]` 셋은
  `text-base`, `text-[13px]` 셋(초대 모달)은 `text-xs`로 접혀 **`text-[Npx]`가 전수 0건**이다(`visual-system.test.ts`).
- ⚠️ **weight 규칙이 2026-09-10에 전면 교체됐고 2026-09-11에 하한이 되돌아갔다** — **가장 두꺼운 서체가 500이고, 쓰는 단계는 400과 500 둘뿐이다.**

  | 전 | 후 | 쓰는 곳 |
  |---|---|---|
  | 600 (`font-semibold`) | **500** (`font-medium`) | 셸 밖 카드의 페이지 제목 |
  | 500 (`font-medium`) | 500 그대로 | 셸 안 제목·라벨 |
  | — | **400** (`font-normal`) | **버튼 라벨** — 본문(300)과 제목(500) 사이. 500이면 버튼만 도드라진다 |
  | 400 (기본·`font-normal`) | ~~300~~ → **400** (`body`의 기본값) | 나머지 전부 — ⚠️ **2026-09-11에 300을 도로 400으로 올렸다**(사용자). **쓰는 weight가 400과 500 둘뿐**이고 `font-light`는 소비자가 0이 됐다 |

  **`body`에 `font-weight: 400`이 있고 그것이 기본이다** (2026-09-11 — 전날의 300을 한 단계
  되돌렸다). **600 이상은 쓰지 않는다.**
  ⚠️ 상위에서 500을 상속받는 자리를 되돌릴 때는 **`font-normal`**을 명시한다(기본과 같아 보여도
  그 의도가 코드에 남아야 한다) — 소비자는 `FormGroup`의 "(optional)"과 `Button` base 둘이다.
  ⚠️ **`font-light`를 쓰지 않는다** — 300이 없으므로 가리킬 단계가 없다. 2026-09-11에 넷을 걷었고
  (`FormGroup`·사이드바 Sign out·로케일 배지의 `(base)`·`Badge` 주석), 그중 둘은 **클래스를 지우는
  것으로 끝났다**(기본이 이미 400이라 되누를 것이 없다).
  ⚠️ **크기는 8-1b부터 `text-2xl`**(로그인·초대 수락) — 시안 24px에 맞췄다.

- ⚠️ **본문이 grayscale 안티앨리어싱이다** (2026-09-25 사용자) — `body`의 `@apply … antialiased`(`app/globals.css`).
  명시가 없으면 macOS 브라우저가 획을 두껍게 그려 **같은 500이 밝은 회색에서 한 단계 무겁게** 읽혔다(보관 프로젝트 행의
  `neutral-400` 이름·배지). 켜면 글자가 전반적으로 가늘어진다 — 그 결과 500이 약해 보이는 자리는 **그 자리의 weight를
  600으로 올리는 것**으로 푼다(사용자 예고, 아직 소비자 0 — 올리면 위 "600 이상은 쓰지 않는다"를 함께 고친다).
  `lib/__tests__/globals-css.test.ts`가 이 한 단어를 고정한다.
- ⚠️ **자간은 크기 토큰이 든다 — `tracking-*` 유틸을 쓰지 않는다** (8-1b). `@theme`의
  `--text-*--letter-spacing`이 크기마다 값을 갖고(작을수록 넓게, 클수록 좁게), **호출부에
  `tracking-tight`를 붙이면 그것을 덮는다.** 현재 임의 자간은 계정 라벨·공유 PanelCard·모달 제목의 **여덟**뿐이다.
  ⚠️ **번역 작업 화면(C4)의 스물하나를 2026-09-24에 걷었다** (audit #46). 대부분은 크기 토큰과 **같은 값을 되적은**
  것이었고(`text-xs tracking-[0.02em]` · `text-[15px] tracking-[0.015em]` → `text-base`), 셋(키 행 원문 · 로케일 입력 ·
  빈 칸의 원문)은 `text-sm`(0.02em) 위에 `0.015em`을 얹어 **토큰을 덮고** 있었다 — 14px에서 0.07px 차이라 토큰 쪽으로
  접었다(캔버스와 갈리는 값이 그 0.07px이다).
  `[0.02em]`은 `--text-xs`, `[0.015em]`은 `--text-base`, `[0.005em]`은 `--text-xl`과 같다.
  계정 핸드오프에서 승격한 공통 규격의 예외다(§6.67). 새 설정 행은 같은 토큰값을 그대로 쓴다. 전역 자간 변경 시
  `rg -n 'tracking-' app components`로 함께 확인한다. 새 화면은 토큰을 우선한다.

### 4.1 mono는 코드 블록 전용이다 — 13px / 18px

⚠️ **2026-09-23에 화면에서 mono를 통째로 걷었다** (사용자 — "YAML 같은 코드 블록 제외하고 전부 sans"). 살아 있는 자리는 **하나뿐**이다:

| 자리 | 왜 남았나 |
|---|---|
| `components/onboarding/workflow-block.tsx` `<pre>` | 워크플로 YAML — 원본 줄바꿈과 들여쓰기가 값의 일부다 |

⚠️ **셋이었다가 하나가 됐다** — 옛 로케일 화면의 대기 Alert `<pre>`가 사라졌고(2026-09-22 Sources 리워크로 `locales/page.tsx` 둘이 전부 리다이렉트가 됐다. 같은 값 `base-locale:` 한 줄은 Sources 상세가 **sans `<code>`**로 낸다), importer가 0이던 `first-ingest-retry.tsx`(어댑터 오류의 캐럿 다이어그램)를 2026-09-24에 지웠다(audit #66).

⚠️ **목록의 정본은 `components/__tests__/surface-rules.test.ts`다** — 그 스캐너가 `components`·`app`의 `.tsx` 전수에서 `text-mono`를 세고 허용 목록 밖이면 red다. **자리를 늘리려면 위 표와 그 목록을 함께 바꾼다**(표가 "왜 남았나"를, 목록이 "지금 몇이나"를 든다). 같은 파일이 §6.3의 `underline` 0건도 함께 센다 — 둘 다 값은 맞고 글꼴·장식만 어긋나는 부류라 렌더 테스트가 green인 채 회귀했다(2026-09-22 Sources 셋 · 2026-09-21 설정 하나).

**판정 기준은 "식별자인가"가 아니라 "원본 줄바꿈과 열 정렬이 의미를 드는가"다.** 앞의 기준을 쓰는 동안 판정이 계속 미끄러졌다 — 2026-09-11에 번역 키와 로케일 코드, 09-12에 온보딩 기준 로케일 `Input`, 09-13에 이메일과 `@handle` 다섯 자리, 09-19에 "복사 버튼이 붙은 값은 mono가 아니다"가 차례로 빠졌고, 매번 **같은 값이 화면마다 다른 폰트로 서 있는 것**을 발견한 뒤에야 걷혔다. 기준을 엘리먼트(`<pre>`)로 옮기면 그 판정 자체가 사라진다.

⚠️ **옛 방침의 두 근거가 죽었다.** "mono의 목적지는 diff 하나다"(Publish 모달 `1a` — §6.55)와 "토큰 값은 다른 시스템에 붙여 넣고 대조하는 값이라 남는다"가 그것이고, **둘 다 이제 sans다.** 옛 기록에서 그 문장을 만나면 이 절이 이긴다.

⚠️ **`<code>`·`<pre>`는 클래스를 떼도 mono로 남는다.** Tailwind preflight가 `code, kbd, samp, pre`에 mono를 깐다 — 그래서 값 칩 `<code>` 둘(`push-token-panel.tsx` · `onboarding/steps/result.tsx`)은 **`font-sans`를 명시**한다. 클래스만 지우고 끝내면 화면은 그대로 mono다.

값은 `:root`의 **단일 출처**에서 나온다:

```css
--mono-size: 13px;
--mono-leading: 18px;
```

- **13px인 이유**: 12px이 작고, 14px는 mono 자폭이 sans의 1.2배라 트렁케이션·가로 스크롤이 함께 늘어난다.
- **`text-[13px]`가 아니라 `text-mono`를 쓴다.** 임의값은 행간이 따라오지 않아 표면마다 갈린다. 소비 경로는 **`@utility text-mono` 하나**이고 font-family·font-size·line-height 셋을 함께 싣는다 — 두 번째 경로를 만들지 않는다(2026-09-06에 font-size 토큰만 있어 **글꼴이 안 실린** 채 이름만 mono였다).
- ⚠️ **`text-mono`는 `white-space`를 안 든다** (2026-09-08). 접혀선 안 되는 값(옛 `first-ingest-retry.tsx`의 파서 원문 — 2026-09-24 삭제)에는 `whitespace-pre-wrap`을 같은 태그에 함께 적는다 — 실제로 파서 원문이 세 자리에서 한 줄로 접혀 나갔다(POSTMORTEM 2026-09-08). `components/__tests__/multiline-detail.test.ts`가 그 자리를 상시로 센다. `<pre>` 쪽은 `overflow-x-auto`가 대신 붙는다. 가르는 기준은 "긴 줄을 접어야 하나(pre-wrap)"와 "원본 줄바꿈을 지켜야 하나(pre)"다.
- ⚠️ **`components/__tests__/home-vocabulary.test.ts`의 카나리아가 `workflow-block.tsx`를 본다.** 스캐너가 실제로 red를 낼 수 있는지 재는 자리인데, 앱에서 mono를 쓰는 파일이 그것 하나뿐이라 **그 파일을 sans로 바꾸면 카나리아도 함께 옮겨야 한다** — 안 옮기면 매칭 0인 스캐너가 장식으로 남는다.

### 4.2 ⚠ `text-mono`를 twMerge에 등록해야 한다

`lib/utils.ts`의 `cn()`이 `extendTailwindMerge`로 `text-mono`를 **font-size 그룹**에 등록한다.

**안 하면 twMerge가 커스텀 `text-*`를 text-color로 오분류한다.** `cn("text-mono", "text-foreground")`에서 `text-mono`가 조용히 제거되고, base `text-xs`와도 dedupe되지 않는다. bugshot-2가 액션 로그 값 칩에서 정확히 이 함정을 밟았다.

⚠️ **twMerge는 `cn()` 안에서만 일한다.** 정적 문자열 `"text-mono text-xs"`는 dedupe되지 않고 Tailwind v4가 알파벳순으로 정렬해 `text-xs`가 이긴다 → **13px sans**(⚠️ 2026-09-12 전에는 12px이라 크기가 튀었다 — 이제 같은 크기의 sans라 **눈으로는 안 보인다**). 같은 font-size 그룹을 한 문자열에 두 번 쓰지 않는다 (2026-09-06 slug·초대 링크 두 곳에서 실제로 그랬다).

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

- **`--radius: 0.75rem`(12px)** — 2026-09-10에 한 단계 올렸다(§0). `--radius-sm/md/lg/xl`이 `calc()`로 파생돼 **8 · 10 · 12 · 16**이다. **삼분한다**: 입력 필드 `rounded-md`(10) · **카드·Alert `rounded-lg`(12)** · **패널 `rounded-xl`(16)**. ⚠️ **버튼은 그 삼분 밖이고 `size`가 radius를 든다** (2026-09-11): `sm` 8 · `md` 10 · `lg` 12 — 크기가 커질수록 한 칸씩 둥글어진다. base에 두고 size가 덮으면 cva가 충돌하는 클래스 둘을 내고 `cn()`의 twMerge가 이기는 것에 기대게 되는데, 그 의존을 만들지 않는 것이 이 배치의 이유다.
  - ⚠️ **`rounded-[10px]`을 쓰지 않는다 — `rounded-md`가 같은 값이다** (2026-09-24, audit #47 — 열여섯 자리를 접었다). 그리고 **호출부가 버튼의 radius·높이를 덮지 않는다**: 번역 화면의 트리 열기·링크 복사가 `size="sm"`(8) 위에 10을, Sources 상세의 언어 행 버튼이 `h-8`(넷째 높이)을 얹고 있었다 — 셋 다 `sm` 그대로(28 · 8)다. ⚠️ **행 전체가 버튼인 자리는 밖이다**(사이드바·설정 행·Sources 행의 `h-auto`·`rounded-none|sm`, §8). `visual-system.test.ts`가 둘 다 센다.
  - ⚠️ **예외가 하나 더 있다 — 로케일 배지의 국기가 `rounded-xs`(2px)다** (2026-09-11 사용자). 그 조각이 **16×11px**이라 이 스케일의 최소인 8px을 주면 **국기가 타원이 된다.** `xs`는 `@theme`가 안 덮은 Tailwind 기본값이고(`--radius-xs: .125rem`), **남의 나라 깃발을 우리 스케일로 재단하지 않는** 가장 작은 처리다. ⚠️ **치수가 둘이다** (2026-09-13 사용자 — 온보딩 ③): 기본 `sm` **16×11**과 글리프 칩 안 전용 `md` **24×17**(`LocaleFlag`의 `size`). 칩이 40이라 16×11을 넣으면 가운데가 비어 보인다. ⚠️ **`md`는 그 한 자리 전용이다** — 표·배지·메뉴·세그먼트는 전부 `sm`이고, 새 자리에 `md`를 쓰려면 여기 근거를 더한다. radius는 둘 다 `xs`다. ⚠️ **이 값을 다른 곳에 번지게 하지 않는다** — 예외의 근거가 "우리가 고른 자산이 아니다"이고 §6.2의 Google 4색 예외와 같은 부류다.
- 간격은 Tailwind 기본 스케일. **섹션은 `space-y-4`, 컨트롤 묶음은 `space-y-2`, 카드·표 셀 패딩은 `px-4 py-3`** — 실사용을 따랐다(2026-09-06 실측).

### 5.1 레이아웃 치수 — GitLab에서 가져온 것 (2026-09-07)

배치는 GitLab을 따르되 **값은 우리 스케일로 반올림**했다(GitLab 실측은 §11).

| 항목 | 값 | GitLab |
|---|---|---|
| **사이드바 폭** | `w-60` (240px) — ⚠️ **8-2부터 배경도 border도 없다**(캔버스 위에 얹힌다) | `$super-sidebar-width: 15rem` |
| **헤더 높이** | `h-12` (48px) — ⚠️ **8-2가 top bar를 대체했다**: 전폭이고 border가 없으며 로고를 든다 | `$header-height: 3rem + 1px` |
| 사이드바 항목 높이 | `p-1.5` + `text-sm` = 32px, 아이콘 16 (8-2 시안 치수: `p-6`·`gap-8`·`radius-8`) | nav item ≈ 32px |
| **패널 여백** | 바깥 padding 8(`p-2`) · 패널 간 간격 8(LNB↔콘텐츠는 8px 리사이저, 나머지는 `gap-2`) — 규약 3.5, 예외 없음 | — |
| **콘텐츠 최대 폭 (limited)** | `max-w-4xl` (896px) — ⚠️ **2026-09-20부터 설정 축 둘뿐이다**(사용자 판정): **프로젝트 설정** · **`/account`**(+ 그 스켈레톤). 멤버·Sources(옛 언어)·이력은 그날 fluid로 갔고, 프로젝트 목록(8-3)·Home도 이미 갔다. ⚠️ **초대 수락은 8-1b에 셸 밖 2열로 갔다** — 폼 컬럼이 `w-[320px]`다(§6.62). 그 밖에 **본문 전용 셋**(`error`·`ProjectArchived`·`ProjectNotReady`)이 기본값으로 limited다 | `$limited-layout-width: 1006px` (우리 스케일 대응값) |
| 콘텐츠 fluid | **아홉이다** (2026-09-20, 2026-09-22 갱신) — 번역 표 · 프로젝트 목록(+ 그 스켈레톤) · **Home(+ 그 스켈레톤)** · **멤버 · Sources(목록 + 보관 안내) · 이력**. ⚠️ **`surfaces/new`가 이 목록에서 빠졌다** — 그 라우트는 이제 `/sources?add=sources`로 보내는 리다이렉트라 패널을 아예 렌더하지 않는다(§6.6). 남은 폭을 쓰되 **`max-w-7xl`(1280) 상한**이고, 표만 자기 컨테이너 안에서 가로 스크롤한다. 등급은 §5.15의 `width` prop이 든다 | 표 화면은 fluid |
| **콘텐츠 상한 (공통)** | ⚠️ **등급 둘을 `PanelHeader`·`PanelBody`의 `width` prop이 든다** (2026-09-15 — projects-panel-rework. 그 전에는 프리미티브가 `max-w-7xl` 하나를 들고 limited 일곱이 **안쪽 래퍼**로 `max-w-4xl`을 다시 씌웠다). `fluid` = 1280 · `limited` = 896이고 **기본값이 `limited`다**. ⚠️ **2026-09-20부터 그쪽이 소수다** — `PanelHeader` 소비자 열둘 중 **fluid 아홉 · limited 셋**. 그래도 뒤집지 않는 근거는 "다수"가 아니라 **빠뜨렸을 때의 증상**이다: 좁아지는 쪽이 넘치는 쪽보다 눈에 띄고, fluid를 기본으로 돌리면 본문 전용 셋이 아무도 안 본 채 1280으로 넓어진다. ⚠️ **등급을 셋으로 늘린 것이 아니다** — 화면이 고르던 둘을 한 층 위로 올렸을 뿐이다. ⚠️ **폭과 여백은 같이 결정된다**: 여백만 프리미티브로 올리면 안쪽 래퍼가 살아 있는 limited 일곱이 `16 + 24 = 40`이 된다. ⚠️ **1440을 안 고른 이유**: 뷰포트 2032px부터 걸려 1920 디스플레이(패널 1328)에서는 아무 일도 안 한다. ⚠️ **스크롤 컨테이너에 직접 주지 않는다** — 좁히면 **스크롤바가 콘텐츠 옆에** 생긴다 | — |
| **패널 머리 (라우트 아홉 공통)** | ⚠️ **2026-09-15에 규격이 프리미티브로 올라갔다** — 아래 §5.15가 정본이다. 그 전 이력: 2026-09-11에 `px-6 pt-6 pb-3` + `h1 text-xl`(20)로 통일했는데(그 전에는 `/projects`·번역만 20이고 나머지 일곱이 15였다) **값을 열한 곳이 각자 적었고 그중 하나가 이미 어긋나 있었다**(`add-surface`의 `px-6 py-5`) | — |
| ~~사이드바 접힘~~ | ⚠️ **없다** — 8-2가 반응형 분기를(최소 대응 너비가 1280이라 `xl` 미만 오버레이·햄버거는 도달 불가였다), **8-3이 아이콘 레일과 `localStorage`까지** 걷었다(시안에 없다). 레일에서만 렌더되던 툴팁이 함께 사라져 `Tooltip` 프리미티브도 없다 (§6.5) | 1200px |
| 드롭다운 패널 | `min-w-60 max-w-md` | 248~456px |
| 모달 | **`max-w-110` (440px)** — ⚠️ 2026-09-18 사용자가 360에서 올렸다(그 전 2026-09-13에 512에서 360으로 내려왔다, §6.4). 온보딩 모달은 이 프리미티브를 안 쓴다(Radix `Dialog.*`를 직접 조립한다) | modal sm 512 |

**페이지 셸은 둘이다**: **셸 안**(`(edit)` — 헤더 + 사이드바 + 흰 콘텐츠 패널, 그 안이 `max-w-4xl` 또는 fluid) / **셸 밖**(로그인·초대 수락 — **둘 다 2열**이다, 8-1b). 새 화면은 둘 중 하나다.

⚠️ **둘이 같은 골격이다** (8-2): 캔버스(`--canvas`) 위에 패널이 뜨고 바깥 padding 8 · 패널 간 gap 8 ·
각 패널 `rounded-xl` + `border-border-subtle` + `shadow-low`다. 셸 안의 그 패널을
`components/shell/content-panel.tsx`가 들고, **셸 레이아웃이 `{children}`을 감싸지 않는다** — 감싸면
흰 패널이 겹쳐 padding이 두 배가 된다. 라우트마다 정확히 하나인지는
`app/(edit)/__tests__/shell-layout.test.ts`가 레이아웃 체인을 훑어 센다.

⚠️ **셸 밖 화면의 골격은 `components/signin/auth-layout.tsx` 하나가 든다** (8-1b) — 바깥 padding 8 ·
패널 간 gap 8 · 각 패널 `rounded-xl` + 아주 연한 border + `shadow-low`, 바깥은 `--canvas`(아주
연한 회색)이고 좌측 패널은 **true white**다. **그 대비가 없으면 흰 패널과 흰 배경이 붙어 경계가
사라진다.** 시안 전체가 이 규칙이고 좌표로 검산했다 (DESIGN §6.5(규약 3).5).

### 5.15 패널 머리·본문 — `PanelHeader`·`PanelBody`가 규격을 든다 (2026-09-15)

**시안**: `design_handoff_projects_panel_rework/Projects v2.dc.html`(아트보드 `1a`~`1d`).
아래 값은 그 캔버스의 인라인 스타일에서 인용했고 **브라우저 computed style로 라우트 아홉 전부를
대조했다** — 어긋나면 구현이 틀린 것이다.

| 자리 | 값 | 실측 |
|---|---|---|
| 머리 여백 | `p-4` (16 전방향) | `16px 16px 16px 16px` — 라우트 아홉 |
| 머리 아래 선 | `border-b border-border` (1px `#e5e5e5`) | 같음. ⚠️ **바깥 요소가 든다** — 폭 상한 안쪽에 두면 1280을 넘는 화면에서 선이 잘린다 |
| 머리 열 간격 | `gap-3` (12) | `12px` — 제목 줄 · 거부 `Alert` · 설명 한 줄이 이 간격으로 쌓인다 |
| 제목 행 | `flex min-h-9 items-center gap-3` | `36px` / `12px`. ⚠️ **`min-h-9`가 없으면 버튼 없는 화면에서 28로 떨어져 머리가 라우트마다 4px 튄다** |
| 제목 묶음 | `gap-2` (8) | `8px` — 배지는 제목의 일부(총계)이고 툴바는 다른 종류다 |
| PageTitle | `h1 text-lg font-medium` (18/500/0.01em) | `18px`·`500`·`0.18px`. ⚠️ **`tracking-[0.01em]`을 손으로 쓰지 않는다** — `--text-lg--letter-spacing`이 이미 그 값이다 |
| 설명 한 줄 | `description` **prop** — `text-xs text-muted-foreground`(13) | `13px`·`#737373`. 소비자는 설명 prop을 쓰는 패널이다(⚠️ `logs`는 2026-09-24부터 **보관 안내만** 이 자리를 쓴다 — 평소 설명문은 종류 필터와 같은 목록이라 지웠다) **전에는 12와 14 두 벌로 갈려 있었다** |
| 본문 여백 | `p-4` (16) | 같음 |
| 폭 등급 | `width` prop — `fluid` 1280 / `limited` 896 (기본) | **fluid 아홉**(목록 · 그 스켈레톤 · 번역 · Home · 그 스켈레톤 · **멤버 · Sources 목록 · Sources 보관 안내 · 이력**) / **limited 셋**(프로젝트 설정 · `/account` · 그 스켈레톤) + 본문 전용 셋 |

⚠️ **설명 슬롯이 prop인 이유는 POSTMORTEM 2026-09-14다** — *"프리미티브의 여백 하나가 그 슬롯을 안
쓰는 소비자에게만 깨졌다"*. 여백 16의 전제는 **"제목 줄 하나"**이고, 설명이 붙는 화면은 머리가 세로로
늘어야 한다. 그 회고의 재발 방지가 *"조건이 있으면 코드에 조건으로 쓴다"*이므로 주석이 아니라 슬롯이다.

⚠️ **소비자를 세는 명령** (적을 때 실제로 돌려 본문과 맞춘다):

```
grep -rn "<PanelHeader" components app | grep -v __tests__   # 13 (+ 정의 파일 주석의 자기참조 1)
grep -rn "<PanelBody"   components app | grep -v __tests__   # 17 (+ 같은 자기참조 1)
```

⚠️ **둘의 수가 다르다.** `PanelHeader`로만 세면 **본문 전용 소비자 셋**(`project-archived` ·
`project-not-ready` · `app/(edit)/error.tsx`)이 빠지는데, 여백은 `PanelBody`도 들므로 그 셋에서 같은
이중 여백(40)이 생긴다 — 이 변경에서 실제로 밟았다. 방어선은
`components/__tests__/panel-header.test.tsx`이고 두 목록을 각각 센다.

⚠️ **`ContentPanel`의 `isolate`·`col-start-1 row-start-1`은 이 절과 무관하다** (POSTMORTEM 2026-09-15)
— 전환 중 패널 둘이 공존하는 프레임을 위한 것이고, 형제 둘을 만질 때 그 클래스를 건드리지 않는다.

## 6. 편집 UI 특화 규칙

라우트는 열이다 (user-stories.md 순서) — 로그인 · 목록 · 새 프로젝트 · **Home** · **번역** · **언어** · **멤버** · 설정 · **계정** · 초대 수락. 공통 형은 §6.4.

### 6.1 번역 화면 — 세 패널이 정본이다 (§6.1a)

⚠️ **2026-09-23(translation-rework)에 옛 표 화면을 지웠다** — 머리 · 툴바 · 칩 행 · 키 그룹(shadcn Table + `rowSpan`) ·
셀 blur 저장 · announcer가 전부 사라지고, 라우트는 트리 · 키 목록 · 로케일 세 패널(§6.1a)을 렌더한다. 옛 규칙의 근거는
`git log -- components/translations/key-group.tsx`가 든다. **새 화면으로 넘어온 규칙은 셋이다**:

- **배너 순서는 기준 로케일 대기 → 리포 갱신 보류**다(`edit-loss-banner.tsx`의 `info` 배너 — 닫기 없음). ⚠️ **둘 다 조건부 분기
  밖**이어야 한다 — 분기 안이면 `revalidatePath`·`router.refresh()`가 방금 받은 상태를 언마운트한다(POSTMORTEM 2026-09-07).
  `base-locale-screens.test.ts`가 작업 화면에서 그 형제 관계를 센다.
- **로케일 순서는 base가 맨 위**, 나머지는 코드순이다 — 원문이 위에 있어야 그 아래를 채운다.
- **Publish 결과는 모달이 든다**(§6.646) — 화면에 결과 Alert 자리를 두지 않는다.

### 6.1a 번역 작업 화면 — 트리 · 키 목록 · 로케일 세 패널 (2026-09-23, translation-rework C4 · 시안 `design_handoff_translations` 2a · 트리 2k-B)

**SoT는 Claude Design 캔버스 `Translations.dc.html`의 2a다.** 아래 값은 Chrome 1440×900(LNB 열림)에서
computed style로 잰 것이다.

| 무엇 | 값 | 근거 |
|---|---|---|
| 본문 | `p-4` · 카드 사이 16(리사이저 폭) | 캔버스 2a |
| 카드 둘 | `rounded-lg`(12) · `border-border` · 흰 면 · 그림자 없음 | 캔버스 2a. ⚠️ 첫 구현이 `rounded-xl`(16)이었다 |
| 트리 | 260 · 우측 `border-border` · 행 `rounded-sm`(8) · gap 8 · 14/20. **소스 행** 34 높이 `px-2 py-[7px]` · `FileJson2` 16. **네임스페이스 행** 32 높이 `py-1.5 pr-2 pl-[30px]` · `Folder` 14, "All namespaces" `Layers` 14. 13개 이상이면 트리 머리에 `Filter namespaces`(32 높이 · **트리 폭 가득**) | 캔버스 2a · 트리 아이콘 **2k-B 확정**. ⚠️ **30은 이탈이다** — 캔버스는 34라 네임스페이스 아이콘이 소스 아이콘보다 4px 안쪽이었다. 30 = 소스 행 `px-2`(8) + chevron(14) + gap(8)로 두 아이콘의 왼쪽 끝을 맞췄다(2026-09-23 사용자 결정, 실측 둘 다 x=311) |
| 키 목록 | 392(⚠️ **카드 테두리 안쪽은 390**이다 — 캔버스는 260+392를 테두리 **바깥**에 두어 외곽이 654이고, 구현은 `layout.left` 652를 border-box에 준다. 2px를 맞추려면 폭 계약의 모든 하한이 함께 움직여서 두었다) · `<ul>`/`<li>` · 행 `px-4 py-3` · gap 12 · 행 사이 `border-t`(첫 행 `border-divider`, 나머지 `border-border`) · 선택 `bg-foreground/[0.07]`(`ListItemButton` — `sidebar.tsx`와 같은 규칙) | 캔버스 2a |
| 검색 | **320**(`SearchInput`의 `inputClassName="w-80"`) · 36 높이 | 캔버스 2a. ⚠️ 프리미티브 기본 `w-64`는 그대로다 — 다른 화면의 검색을 이 루프가 안 봤다 |
| 로케일 입력 | `w-full` — 행을 채운다 · `rounded-md`(10) · padding 10 · 14 / `leading-[1.55]` | ⚠️ `field-sizing-content`가 폭도 내용에 맞춰 줄여서, `w-full`이 없으면 빈 칸이 한 글자 폭으로 선다 |
| 값의 방향 | 로케일 입력이 **자기 언어의 `dir`·`lang`**을 든다(`lib/translations/text-direction.ts` — script 서브태그 → `Intl.Locale#getTextInfo` → 표). 빈 칸에 겹친 원문은 **base**의 것을 든다. ⚠️ **`ku`(script 없음)는 `dir="auto"`다** — CLDR은 Latin인데 소라니를 같은 코드에 담는 리포가 있다. LTR은 `dir="ltr"`이라 레이아웃이 안 움직인다 | malmoi#91 (2026-09-24) — 셀이 페이지의 `lang="en"`·`ltr`을 상속해 ar-SA의 `.(…`가 반대 끝으로 튀었다 |
| 빈 칸(Missing) | 점선 상자 `min-h-[62px]` · padding 10 · 입력이 상자 안쪽 전체(`min-h-[42px]`) · **원문이 입력 첫 줄 자리에 겹친다**(grid 한 칸 · `pointer-events-none` · `aria-describedby`) | ⚠️ **이탈이다** — 캔버스는 20px 입력줄 아래 형제로 원문을 두었고, 그대로 구현하니 "플레이스홀더가 아래에 붙었다"로 읽혔다(2026-09-23 사용자 지적). absolute가 아니라 grid라 원문이 여러 줄이면 상자가 따라 늘어난다(실측 두 줄 64) |

**폭 계약은 `lib/translations/layout.ts`가 정본이다** — 로케일 ≥ 420을 마지막까지 지키고, 모자라면
목록 392→336 → 트리 260→208 → 트리 접힘(목록 머리의 버튼이 겹쳐 뜨는 패널을 연다) 순으로 준다. 접힌 뒤에도
772 미만이면 본문만 가로 스크롤이다. 1280 창에서 실측: 좌 546 · 로케일 420(`aria-valuemax` 546.09 = 영역
982.1 − 16 − 420).

**리사이저는 시안에 없고 사용자 결정이다**(트리+목록 카드 ↔ 로케일 카드 사이). `react-resizable-panels`를 쓰지
않는다 — 그 라이브러리의 크기가 % 전용이라 px 하한 셋(420·336·208)을 매 리사이즈에 환산해야 하고, 핸들이
카드 사이 16px 간격 자체여야 해서다. `role="separator"` + `aria-valuenow/min/max` + ←→ 8px · Home · End. 트리가 접혀 범위가 한 점이면 `tabIndex=-1` + `aria-disabled`다(죽은 Tab 정거장). 드래그는 `pointerup`·`pointercancel`·캡처 상실 셋 다에서 끝난다 — 하나만 걸면 끝나지 않은 드래그가 버튼 없이 지나가는 포인터로 폭을 바꾸고 저장한다.
⚠️ **접근 이름 `Resize key list`가 필수다** — 첫 구현이 이름 없이 나갔고 화면에도 jsdom에도 안 드러나 CDP로만
잡혔다(`translation-workspace.test.tsx`가 고정한다). 선호 폭은 사용자×프로젝트별 `localStorage`이고 **clamp 값을
저장하지 않는다** — 좁은 창에서 저장하면 넓혔을 때 안 돌아온다.

**문서화된 이탈** — 프리미티브가 이긴 자리: Badge 칩 padding · 꺼진 Button 색은 `components/ui/`의 값을 따른다.
키 카드 머리는 캔버스 후보 중 **2c**를 골랐다. 목록 머리 우측은 2a의 `All keys` 드롭다운 칩이 아니라 평문 `+n saved · Incomplete first`다 — 캔버스 안에서도 아트보드마다 칩형과 평문형이 엇갈리고, 정렬이 하나뿐이라 고를 것이 없는 칩은 누를 이유가 없는 버튼이다. Publish 버튼 아이콘은 §6.646의 헤더 버튼과 같은 것을 쓴다.

**숫자마다 단위가 다르고, 섞지 않는다.** 제목 배지 = 활성 소스 전체의 활성 키 수 · 트리 숫자 = 언어와 무관한 활성 키 수 ·
키 목록 배지 = 현재 조건을 만족한 **키** 수 · Publish 배지 = 프로젝트 전체의 미전달 **셀** 수. 키 집계는 저장된 값만 본다.
⚠️ **`needsReview`는 결측이 아니다** — 결측(null·행 부재·빈 문자열) 0인 키는 검토필요가 남아도 `Complete`라서, `Complete`와
`Needs review`가 한 키에 같이 선다(`Complete`는 승인 완료라는 뜻이 아니다).

**실브라우저로 잰 것**(2026-09-23 T19, Chrome) — 1280/1440/1920 × LNB 200/240/320 아홉 조합에서 로케일 ≥420 · 입력 = 카드 − 34 ·
1280/320에서만 트리 접힘. 접힌 트리 오버레이 280 · 열면 선택 항목으로, Escape·선택이면 토글로 포커스. 57언어 · 619키에서 잘림 0 · 로케일 패널만 세로
스크롤 · 고정 푸터가 마지막 입력을 가리지 않는다(마지막 상자 아래 801 < 푸터 위 813).

**브라우저로 못 밟은 것** — Safari·Firefox, 네이티브 `beforeunload` 확인창, 772 미만 가로 스크롤(단위 테스트 `layout.test.ts`만), 200언어.

### 6.2 상태 색 — 배지 4종 + 연결 건강성 7종 + Alert 4종, 색 체계는 하나

**축이 셋이고 색 체계는 하나다.** amber는 **경고**, destructive는 **글자색 전용 오류**, 나머지는 무색이다. **semantic 토큰으로 표현 못 하는 상태 색**이라 raw 색을 쓰되, 라이트 단일이므로 `dark:` 짝을 두지 않는다.

| 상태 | 색 | 근거 |
|---|---|---|
| 미번역 | 무색 — `text-muted-foreground` "Untranslated" | 없음은 상태가 아니라 부재다. 색을 주면 셋 중 가장 흔한 것이 가장 시끄러워진다 |
| 검토필요 (`needsReview`) | **amber** — `Badge warning` = `bg-amber-100/80 text-amber-800` | 경고지 오류가 아니다 |
| 미배포 (`isUnpublished`) | 무색 — `Badge muted` "Not yet sent" | 툴바 건수·보류 배너와 **같은 술어**다(편집 토큰이 남은 활성 셀 — 2026-09-18). 색을 주면 편집 직후의 정상 상태가 경고로 읽힌다 |
| orphaned | **red 계열 글자만** — `Badge danger` = `text-destructive` (배경 없음) | §2.3대로 글자색 전용. 배경을 주면 "삭제됨"으로 읽히는데 실제로는 되돌릴 수 있다. **키 행과 로케일 헤더 두 축에 같은 표기** |

**연결 건강성 7종** (설정 화면): **배지를 쓰지 않는다** (2026-09-08 실물 정정) — `ok`·`not-connected`·`unknown`은 평문 `text-muted-foreground text-xs`(가장 흔한 상태가 조용하다) / `repo-moved` → **`Alert warning`** / `app-uninstalled`·`installation-changed` → **`Alert danger` + [Reconnect]** / **`repo-replaced` → `Alert danger`이고 [Reconnect]가 **없다**(2026-09-10, sec-audit-2 — 저장된 주소가 **다른 리포**를 가리키는 상태다. 리포는 프로젝트 생성 시점에 고정이라 `connectRepository`가 재고정을 거부하므로 **눌러도 실패할 버튼**이고, 그래서 'danger = danger + [Reconnect]'라는 짝이 여기서만 깨진다). 색 체계는 아래와 같고 담는 그릇만 다르다. ⚠️ **`unknown`을 `app-uninstalled` 색으로 접지 않는다** — 조회 실패를 "제거됨"으로 보여주면 사용자가 멀쩡한 설치를 다시 만든다.

**첫 적재 상태** (`planProjectReadiness`): 판정 자체는 셋이지만 **화면 문구는 목록의 `projectStatus`가 든다** (8-3 — `readinessLabel`은 삭제됐다). 목록에서는 `setup`·`awaiting_first_sync`가 **`Badge neutral`**로 `Setup`·`Pending`이고 `ready`는 **`Badge success`**(초록) `Active`다 (2026-09-11 정정 — 그 둘은 새 프로젝트가 지나가는 **정상 경로**라 amber로 칠하면 고장난 것처럼 보인다). amber는 `Disconnected` 하나뿐이다.

**sync 실행 4종** (`logs` 화면, 2026-09-10 7단계 — 옛 `syncRunView`. 지금 판정은 `lib/events/view.ts`의 `eventView`가 들고 결과 어휘가 늘었다): `SUCCEEDED`("Sent")·`SKIPPED`("Nothing to send")·`RUNNING`("Running…") → **무색 `Badge muted`** / `FAILED`("Failed") → **`Badge danger`**. ⚠️ **색이 셋뿐이라 구별은 라벨이 든다** — 새 raw 색을 만들지 않는 것이 §6.2의 규칙이고, 성공·스킵·진행 중을 색으로 가르려 들면 그 규칙이 첫날에 깨진다. **판정 함수가 tone을 `Badge` variant와 같은 이름으로 낸다** — 화면이 매핑 표를 또 들지 않는다(⚠️ 선례로 적혀 있던 `PublishTone`은 2026-09-16에 사라졌다 — Publish는 tone이 아니라 **갈래 이름**을 내는 쪽으로 갔다, §6.646). ⚠️ 버린 값이 있는 실행에는 `Badge warning` "N dropped"가 **성공한 행에도** 붙는다 (PRODUCT 불변식 9).

**보관** (2026-09-10): 목록 행의 상태 배지가 `Badge neutral` "Archived"다(8-3 — 배지가 **항상 하나**이고 갈래는 `projectStatus`가 정한다, §6.63). ⚠️ **숨기지 않는다** — 숨기면 OWNER가 되돌릴 링크에 도달할 길이 없다. ⚠️ **프로젝트 스위처는 8-3에 사라졌다** — 프로젝트를 옮기는 길이 목록 하나로 통일됐다(§6.5).

**목록 행 상태 5종** (`/projects`, 2026-09-11 사용자 — `projectStatus`): `Active` → **`Badge success`**(초록) / `Archived`·`Setup`·`Pending` → **무색 `Badge neutral`** / `Disconnected` → **`Badge warning`**(amber). ⚠️ **`Active`가 초록인 것은 §6.1("가장 흔한 상태가 가장 조용하다")의 예외다** — 근거는 이 목록이 **훑어보는 화면**이라는 것이고, 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어야 대비가 생긴다. ⚠️ **amber가 `Disconnected` 하나뿐이다** — 축이 "덜 됐나"가 아니라 **"깨졌나"**다: `Setup`·`Pending`은 새 프로젝트가 지나가는 정상 경로라 저절로 `Active`가 되지만, `Disconnected`는 한때 돌던 것이 멈춘 것이라 사람이 손대야 풀린다. ⚠️ **라벨이 전부 한 낱말이고 동사가 없다** — 배지는 행 우측의 좁은 칸이라 문장이 이름·리포 URL과 폭을 다투고, 좁은 칸의 동사는 누를 수 있는 것처럼 읽힌다(할 일은 설정 화면의 `Alert`가 말한다). **새 raw 색은 green 하나**이고 amber와 같은 형이다(`bg-green-100/80 text-green-800`).

**이름에서 뽑는 색 8종** (2026-09-11 사용자 — `lib/tone.ts`의 `toneOf` + `components/ui/tone.ts`의 `toneFill`): **소비자가 둘이고 형이 같다** — 사용자 아바타 폴백과 **프로젝트 목록 행의 아이콘**이 모두 채운 배경 + 흰 글리프(`toneFill`)다. 그 배경이 곧 **프로젝트 이미지가 들어올 자리**이므로 지금 색을 채워 두면 이미지가 붙는 날 표면이 바뀌지 않는다. 이름을 해시해 `rose`·`orange`·`amber`·`emerald`·`teal`·`sky`·`indigo`·`fuchsia`의 **`-600` 배경 + 흰 글자**를 고른다. **같은 이름은 언제나 같은 색**이다(`Math.random`이 아니다 — 렌더마다 바뀌면 색이 사람을 못 가리킨다). ⚠️ **`-600`으로 통일한다**: `-500`이 더 밝지만 amber·lime 계열에서 흰 글자가 안 읽혀, 색마다 단계를 다르게 두면 여덟이 같은 계열로 안 보인다. ⚠️ **클래스를 문자열 리터럴 맵으로 든다** — `bg-${tone}-600`으로 조립하면 Tailwind가 정적 추출을 못 해 배경이 통째로 빠진다. ⚠️ **판정은 `lib/`, 클래스는 컴포넌트**다(`STATUS_VARIANT`와 같은 형) — `lib/`가 Tailwind 클래스를 알면 규칙이 두 층에 걸린다.

**Alert 4종** (§6.4 — Publish 결과·리포 갱신 보류 배너·페이지 수준 거부):

| variant | 색 | 쓰는 곳 |
|---|---|---|
| `info` | `border-border bg-muted/40` + `Info` 아이콘 `text-muted-foreground` | **번역 화면의 리포 갱신 보류 배너** (2026-09-18 — 소비자 0에서 1로 부활했다). `Repository updates are paused until N unsent changes are sent.` · **닫기 없음**(상시 조건) · 액션 `Send with Publish ↑`는 헤더 Publish 버튼으로 **포커스만** 옮긴다(둘째 트리거를 만들지 않는다). 새 색·토큰은 없다. ⚠️ 꺼진 Publish의 사유(`Everything you've edited is already sent.` 등)는 **`aria-disabled` + `aria-describedby`**다(2026-09-23 — 그 전엔 진짜 `disabled` 버튼을 감싼 span의 hover `title`뿐이라 키보드·스크린리더로 닿지 않았다, §6.65). `title`은 마우스용으로 남는다(§6.646) |
| `success` | `border-border bg-background` + `CircleCheck` 아이콘 `text-foreground` | ⚠️ **소비자가 0이다** (2026-09-16) — Publish 성공 둘이 모달의 무색 블록으로 내려갔다(§6.646). **초록을 쓰지 않는다**는 근거는 그대로 산다. ⚠️ **로그인 화면의 전체 로그아웃 완료(`?sessions=revoked`)는 8-1b가 토스트로 옮겼다** — 아래 §6.25 |
| `warning` | `border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert` | `repo-moved` · 수동 Sync 결과의 `reconfirm` 거부와 "남은 편집" 결과 (⚠️ **편집 손실 배너가 2026-09-18에 여기서 빠져 `info`로 갔다** — 보호가 켜진 뒤 안전한 상태에 amber를 띄우면 "가장 흔한 상태가 가장 조용하다"(§6.1) 위반이다) |
| `danger` | `border-destructive/40 bg-background text-destructive` + `CircleX` | Publish 실패 **둘**(모달 안 — §6.646) · 페이지 수준 거부(`?e=`) · 블록 안 컨트롤 실패 |

⚠️ **내부 이름을 화면에 쓰지 않는다** — `awaiting_first_sync`는 번역자에게 아무것도 알려주지 않는다 (PRODUCT §3). 문구는 `messages/en.tsx`이 든다.

**새 raw 색을 늘리지 않는다.** 등재된 것이 전부다 — **amber**(`100/80`·`800`, Alert용 `50`·`200`·`900`, **면으로 칠하는 `500`** — Meter의 검토 구간(§6.63)과 셀 상태 표시의 **`needsReview` 마름모**(§6.1), 그리고 카운트 카드 글리프의 `700`)·**destructive** · §6.3의 외부 링크 **blue-600**(`--signin-dot`이 같은 값이다) · **포커스 링의 blue-400**(2026-09-11에 하나 늘었다 — `--ring`, §7) · 목록 행 `Active`의 **green**(`100/80`·`800`) · 이름에서 뽑는 **tone 여덟**(`-600`) · **`--divider`**(`#f0f0f0`, 2026-09-13 — 바로 아래) · **neutral-300**(`#d4d4d4`) — 라디오·**체크박스** 지시자의 비선택 테두리(16px 원·사각에서 `--input`(#e5e5e5)은 안 보인다) · 번역 작업 화면 빈 칸의 **점선 상자** · 멤버 역할 칩의 **자물쇠**(캔버스 값 — 사유는 `sr-only`가 진다, §6.65). ⚠️ 옛 소비자였던 Home 로그 레일의 점은 사라졌다(2026-09-24 실측 0) · **neutral-400**(`#a3a3a3`, 2026-09-16 등재 — **전부터 쓰이던 것을 이제 센다**: Home의 메타 열·개수 카드·로그 카드 글리프, `/account` Profile 사실 블록의 라벨 열, **logs 상세의 필드·블록 라벨**(2026-09-22 — 그 전엔 `--muted-foreground`와 합쳐져 있었다), **그리고 2026-09-20부터 `/projects` 보관 행의 이름·메타·배지**(§6.63의 등재된 이탈). 캔버스가 라벨·보조 글리프에 그 값을 직접 지정하고 `--muted-foreground`(#737373)보다 한 단계 연하다). · **neutral-600**(`#525252`, 2026-09-22 등재 — **전부터 쓰이던 것을 이제 센다**: `row-card`의 글리프 칩 · Home sync 버튼 · `/projects` 행, 그리고 Sources 행의 글리프 칩. 캔버스가 칩 안 글리프에 그 값을 직접 지정하고 `--muted-foreground`(#737373)보다 한 단계 진하다) · **red-700**(`#b91c1c`, 2026-09-22 — `Badge` `missing` · Sources 상세의 사라짐 띠 문장 · Publish diff(아래 표) · 활동 칩(아래 일곱).  ⚠️ **`destructive`(#dc2626)와 다른 값이다**: 시안이 실패 **글자**와 사라짐 **알약**을 두 색으로 갈랐고, 채운 알약이 같은 밝기면 amber `warning`과 무게가 안 맞는다) · **활동 글리프 칩의 팔레트 일곱**(2026-09-20 등재, logs-rework §6.68 — `emerald-50/700` · `amber-50/700` · `red-50/700` · `slate-100/600` · `blue-50/700` · `teal-50/700` · `violet-50/700`). ⚠️ **배지 톤 셋과 별도 축이다** — 칩은 **훑기용 보조**이고 뜻은 결과 열의 낱말과 문장이 든다(색만으로 구별되는 정보는 칩에 싣지 않았다). 규칙이 둘이다: **실행은 결과의 색**(성공 emerald · 보류/부분/거부 amber · 실패 red · 진행 중과 `Nothing to send`는 slate — 보낸 것이 없는 것은 성공이 아니다), **그 외는 종류의 색**(번역 blue · 소스/로케일 teal · 멤버 violet · 설정 slate). ⚠️ **시안의 hex 일곱 쌍이 Tailwind 기본 팔레트와 정확히 같은 값이라 임의 hex를 쓰지 않는다** — 그래서 `app/globals.css`에 토큰이 늘지 않았고, 이 줄이 그 등재다. · **neutral-50**(`#fafafa`, 2026-09-22 — logs 상세의 `Before` 면과 값이 아닌 상태의 점선 블록 **둘뿐**이다. ⚠️ **`--muted`(#f5f5f5)로 대신하지 않는다**: 이 블록은 **흰 `After`와 나란히** 서고 두 면의 차이가 "같은 값의 두 시점"을 말하는 유일한 신호라, 한 단계 더 연한 값이 시안의 판정이다. 새 자리에 번지게 하지 않는다 — 리포의 회색 면은 여전히 `--muted`다). 그 밖은 없다.

**B6 등재·접기 (2026-09-24, audit #43·#44)** — 번역 작업 화면(C4) 분량이 위 목록에서 통째로 빠져 있었다. **값마다 판정했고 새 값은 하나다**:

| 값 | 판정 | 자리 · 근거 |
|---|---|---|
| `text-amber-700` | **등재** (소비자 확장) | 번역 작업 화면의 **상태 글자** — 키 행의 `Needs review`·미번역 수, 로케일 행의 `Missing`·`Not saved`·`n of m languages`, 툴바의 미저장 수. amber-800(배지 글자)은 면 위의 값이라 면 없이 선 글자에는 한 단계 밝은 700이 캔버스 값이다(흰 배경 5.0:1) |
| `border-amber-500/50` | **등재** (새 값) | Sources 기준 언어 `Select`의 **대기 테두리** 하나. 같은 칸의 오류 `border-destructive/50`과 짝이다 — amber-500은 이미 면 값으로 등재돼 있고 알파만 새로 든다 |
| `neutral-300` | **등재** (소비자 확장) | 위 줄 — 체크박스 · 점선 상자 · 자물쇠 |
| `neutral-400` | **등재** (소비자 확장) | 번역 화면 트리의 네임스페이스 글리프 · 로케일 머리의 경로 구분 chevron · Publish 진행의 완료 체크 · 설정 General 카드의 라벨 열(`/account` Profile과 같은 형) · Sources 상세의 **사라진 언어 행 수치**(같은 행의 `missing` 알약이 뜻을 완성한다 — §6.63 보관 행과 같은 예외) · 멤버 행의 `(you)` |
| `neutral-600` | **등재** (소비자 확장) | 번역 작업 화면의 **한 단계 아래 글리프**(트리 소스 행의 chevron·파일, 키 목록의 트리 열기, 링크 복사, 툴바 Sync) · `Not sent` 알약 글자 |
| `bg-white` (이력 날짜 카드) | **접기** → `bg-background` | §6.2가 `bg-white`를 로그인 좌측 하나로 한정한다. 셸 안 흰 카드는 토큰이다 |
| `disabled:text-neutral-400` (번역 필터 트리거) | **접기** → `disabled:text-muted-foreground` | `Button`의 꺼진 글자와 같은 값이어야 필터 줄의 꺼진 컨트롤이 한 형으로 읽힌다 |
| `text-neutral-400` (Sources 기준 언어 행의 비고) | **접기** → `text-muted-foreground` | 홀로 선 문장이라 위 "본문 금지"에 걸린다(Publish 저자 이름과 같은 판정) |
| `shadow-[0_0_0_1px_rgba(10,10,10,0.06)]` (Publish 표의 국기) | **접기** → `ring-1 ring-foreground/6` | 같은 box-shadow를 토큰의 알파로 낸다 — 임의값 안에 rgba를 두지 않는다 |

⚠️ **등재 목록의 실물은 `components/__tests__/visual-system.test.ts`의 `REGISTERED`다** — 값 → 쓰는 파일을 들고, 그 밖의 값·파일은 red다(소비자가 0이 된 줄도 red다). **이 절이 "왜"를, 그 표가 "지금 어디에"를 든다** — 자리를 늘리려면 둘을 함께 고친다(§4.1의 mono 목록과 같은 분업). 위 문단들의 소비자 나열은 그 표보다 늦게 갱신될 수 있고, 어긋나면 그 표가 실물이다.

⚠️ **선이 셋이다** (2026-09-13 정정 — 실물 실측). 처음에는 핸드오프의 `#f0f0f0`을
`border-subtle`(#e9ecef)로 접었는데 **그것이 오판이었다**: `border-subtle`은 *떠 있는 표면의 바깥
윤곽*이고 `#f0f0f0`은 *목록·표 **안에서** 행을 가르는 선*이라 쓰임이 다르다. 접어 두면 **muted 면에
접한 경계(`border`, #e5e5e5)와 그렇지 않은 경계의 구별이 사라진다** — 선택된 행의 위아래 가장자리가
면 안에서 풀린다. → **`--divider`(#f0f0f0)를 신설했다.**

| 선 | 토큰 | 쓰는 곳 |
|---|---|---|
| 구조 `#e5e5e5` | `--border` | 목록·표의 바깥 테두리 · **muted 면(선택 행·브랜치 줄)에 접한 경계** · 표의 첫 구분선 |
| 그룹 안 `#f0f0f0` | **`--divider`** | 비선택 행끼리의 구분선 · 모달 바닥 `border-top` · ③의 구분선 |
| 패널 가장자리 `#e9ecef` | `--border-subtle` | 셸 밖 패널의 바깥 윤곽 (온보딩 모달은 안 쓴다) |

⚠️ **`--primary-foreground`(#fafafa)가 역할을 둘 더 든다** (2026-09-13). 원래는 `primary` 버튼의
글자색이었는데 **온보딩 ②의 sticky 표 헤더 면색**과 **`default` 버튼의 hover 면색**으로도 쓴다.
뒤엣것은 계정 화면 핸드오프가 `hover:bg-accent`(#f5f5f5)를 #fafafa로 옮긴 것이고 **앱 전체의
`default` 버튼이 함께 움직였다** — 새 raw 색을 늘리는 대신 기존 토큰에 역할을 더하는 쪽이다. 핸드오프 값은 `rgba(10,10,10,0.02)`
지만 그것은 흰 패널 위 **한 겹**으로 그린 값이고, 여기 헤더는 `sticky`라 **뒤로 키 행이 지나간다** —
98% 투과면 글자가 비친다. 흰 위 2%에 해당하는 불투명 값이 정확히 `#fafafa`다. ⚠️ **불투명 값은 흰
면 위를 전제한다** — muted·canvas 면 위에 표가 서면 헤더가 배경과 어긋난다(지금 `Table` 소비자는
전부 흰 면이다). ⚠️ **`Th` 프리셋의 기본값 `bg-muted/50`은 아직 반투명이라 번역 화면이 같은
결함을 든다** — 값 차이는 2/255라 옮겨도 눈에 안 보이지만, 그 화면을 실물로 확인하는 작업에서 함께 옮긴다.

나머지 raw 셋은 그대로 기존 토큰으로 접힌다: dim `rgba(10,10,10,0.32)` → **`bg-foreground/32`**
(기존 `Dialog`의 `/40`과 값이 갈리는 것이 의도다 — 이 모달은 뒤의 목록이 읽혀야 한다) · 스켈레톤
`rgba(10,10,10,0.07)` → **`bg-foreground/5`**(`EmptyState` 칩과 같은 값. 따로 만들면 회색 블록 값이
두 벌이 된다) · `#f5f6f7` → 이미 **`--color-canvas`**다.

⚠️ **`backdrop-blur-[6px]`가 리포 최초의 `backdrop-*`다** (2026-09-13). 색이 아니라 **필터**라 위
목록에 들지 않지만 새 시각 관용구이므로 여기 적는다 — 쓰는 곳은 **1024 표면의 dim 둘**이다 — 온보딩 모달과 logs 상세(2026-09-24, §6.68).
넓히려면 이 줄을 먼저 고친다: blur는 그 뒤의 것을 "읽지 말라"가 아니라 "지금 초점이 아니다"로
만드는 수단이고, 그 말이 필요한 표면이 1024 둘뿐이다(440 `Dialog`는 뒤가 읽힐 필요가 없다).

**목록 재설계가 데려온 다섯** (2026-09-13 등재 — 전부 `/projects`가 유일한 소비자다):

| 색 | 자리 | 왜 기존 토큰이 아닌가 |
|---|---|---|
| `red-800` (`#991b1b`) | 임포트 실패 띠의 `triangle-alert` | `--destructive`는 red-600이라 값이 다르다. 띠는 Alert가 아니라 **한 줄**이고 배경이 2%뿐이라 그 위에서 red-600은 경고보다 장식으로 읽힌다 |
| `blue-600` (`#2563eb`) | `New from GitHub`의 글리프·숫자 | 이미 §6.2에 있던 값이지만 **숫자에 색을 쓰는 첫 자리**다. 넷 중 유일하게 "내가 만들지 않은 변화"라 그 하나만 색을 든다 |
| `blue-600/[0.14]` | 검색 일치 구간(`<mark>`) | 강조가 배경이라 알파가 필요하다. `radius 3` · `padding 0 1px`로 글자 사이를 안 벌린다 |
| `neutral-600` (`#525252`) | 무색 배지의 글자(`Setup`·`Pending`) · 빈 상태 카드의 아이콘 칩 · **Home 머리 `[Sync]`의 `ArrowDownToLine` 글리프** · **Sync 확인 Dialog 설명문의 브랜치**(2026-09-15 실측. ⚠️ 2026-09-23까지 mono였다 — 지금은 색만 남았다) | `Badge neutral`의 기본은 foreground이라 호출부에서 내린다 — 프리미티브를 바꾸면 이 화면 밖 배지가 함께 움직인다. 뒤의 둘은 **한 단계 아래**를 표시하는 같은 쓰임이다(버튼 라벨 `#0a0a0a`보다 글리프가, 설명문 `#737373`보다 브랜치가) |

⚠️ **2026-09-15에 둘이 등재에서 빠졌다가 하나가 돌아왔다** — `amber-700`은 Summary 블록이
사라지며 소비자가 0이 됐지만 **같은 날 Home의 카운트 카드가 그 자리를 받았다**(`To review`의
글리프 — §6.64). `neutral-700`(`#404040`, 그라데이션 면 위 설명문)은 그대로 0이다(빈 상태가
카드가 되며 그 면이 없어졌다). 되살아날 자리가 생기면 그때 다시 등재한다.

**Home 재편이 데려온 하나** (2026-09-15 등재 — `/projects/[slug]` 그래프가 유일한 소비자다):

| 색 | 자리 | 왜 기존 토큰이 아닌가 |
|---|---|---|
| `neutral-400` (`#a3a3a3`) | 카드 글리프(색을 안 든 둘) · 항목 행의 시각 · 메타 열의 라벨 · 0인 수치 · **`/projects` 보관 행의 이름·메타·배지**(2026-09-20 — 아래 하한의 **등재된 예외**, 근거는 §6.63) | **`--muted-foreground`(#737373)보다 한 단계 더 물러난 층**이고 리포에 그 층이 없었다. 이 화면은 한 화면에 읽을 것이 넷(수 · 근거 · 사건 · 사실)이라 전부 같은 회색이면 위계가 서지 않는다 — 캔버스가 이 색을 **"정보이지만 지금 읽을 필요는 없는 것"** 에 일관되게 쓴다. ⚠️ **흰 배경 2.6:1이라 §7의 3:1 하한을 못 넘는다 — 본문에 쓰지 않는다**: 대상은 라벨·시각·비활성 글리프처럼 **옆의 값이 뜻을 완성하는** 자리뿐이고, 그 값은 전부 `#0a0a0a`다 |

**Publish 모달이 데려온 둘** (2026-09-16 등재 — `components/publish-button.tsx`의 diff 표가 유일한 소비자다):

| 색 | 자리 | 왜 기존 토큰이 아닌가 |
|---|---|---|
| `red-700` (`#b91c1c`) + `red-700/[0.14]` | diff의 `−` 글리프 · 제거된 낱말의 배경 | **diff의 만국 공용 어휘**라 이 제품의 상태색 축(§2.3의 "destructive는 글자색 전용")과 별개다. `--destructive`(#dc2626)보다 한 단계 내린 것은 배경 위에 얹는 글자라서이고, 알파 0.14는 **배지로 안 보이게** 하는 값이다 — 줄 전체가 아니라 바뀐 낱말만 칠한다 |
| `green-800` (`#166534`) + `green-800/[0.16]` | diff의 `+` 글리프 · PR 카드의 `GitPullRequestArrow` · 추가된 낱말의 배경 | 같은 축이다. `Badge success`가 이미 `text-green-800`을 들고 있어 **색 자체는 새 값이 아니고**, 배경 없이 홀로 서는 쓰임과 알파 변형이 새로 등재된다 |

⚠️ **초록·빨강을 이 두 자리 밖으로 넓히지 않는다.** 여기서만 예외인 근거가 "diff"이고, 상태·결과에
쓰기 시작하면 §6.2가 첫날에 깨진다 — 그래서 성공 결과의 PR 배지도 `Badge success` 하나뿐이다.

⚠️ **`neutral-400`은 저자 이름에 쓰지 않는다** (2026-09-16). 시안은 diff 행의 저자를 `#a3a3a3`으로
그렸지만 위 등재 줄이 그 색을 **본문 금지**로 못 박았고, 저자 이름은 "옆의 값이 뜻을 완성하는"
부류가 아니다 — 그 화면에서 누가 고쳤는지 말하는 **유일한** 자리다. `--muted-foreground`로 올린다.

**흑백 둘과 남의 자산은 이 규칙 밖이다** (2026-09-11 등재):

- **`bg-white`** — 셸 밖 좌측 패널의 **true white** 하나뿐이다(`components/signin/auth-layout.tsx`). `--background`가 아닌 이유는 §6.62에 있다: 캔버스와의 대비가 그 화면의 골격이라 토큰이 움직여도 이 자리는 순백이어야 한다.
- **`text-white`** — `toneFill` 위의 글자·글리프 전용이다(아바타 이니셜·목록 행 타일). tone 여덟의 짝이라 별도 색이 아니다.
- **국기 SVG 253개**(`public/flags/`) — **우리가 고른 색이 아니다.** Google 4색(§6.8)과 같은 부류라 토큰으로 접지 않고, 인라인 `style`의 `background-image`로만 들어온다(§6.1). 이 예외를 다른 자산으로 넓히지 않는다.

### 6.25 토스트 — 피드백의 두 번째 표면 (8-1b, 2026-09-10)

⚠️ **2026-09-08이 `sonner`를 "사용 0"으로 제거하며 반대로 판정한 자리다.** 8단계가 **토스트로 통일**
하기로 뒤집었고(사용자, 두 번 재확인), 그 결정이 요구한 **경계**는 이렇다:

| | 무엇 | 예 |
|---|---|---|
| **토스트** | **전역 결과를 내는 이벤트** — 대상이 화면 전체이고 읽고 나면 사라져도 되는 것 | 로그인 거부 · 세션 회수 완료 |
| 인라인 | **대상이 있는 판정** | 셀 저장 상태 · 멤버 행 옆 거부 |
| 인라인 | **지속되는 조건** | 리포 갱신 보류 배너 · base 대기 배너 · 초대 수락 실패 전체(`?e=unauthorized`·`unavailable` 포함) |
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

**리포 밖으로 나가는 링크는 `text-blue-600` + `target="_blank" rel="noreferrer"`다 — 글리프를 달지 않는다** (2026-09-18 사용자 판정으로 반전).

⚠️ **예외 — GitHub App 설치·설치 설정 왕복은 같은 탭이다** (2026-09-18, install-and-connect). ①의 [Install GitHub App]·[Choose repositories]·목록 아래 "Choose repositories"는 GitHub이 callback으로 되돌려 ①에 착지시키므로, 새 탭이면 원래 탭이 낡은 목록으로 남고 착지한 탭에 모달이 하나 더 선다. `/account`의 [Installation settings]는 malmoi 쪽 착지가 정해지지 않은 나가는 문이라 새 탭 그대로다.

⚠️ **`ExternalLink` 12px는 소비자 0이 됐다.** 2026-09-16에 Home 리포 행 하나가 먼저 뺐고 — 캔버스(`design_handoff_project_home`)의 lucide 목록에 `external-link`가 없다 — 그 근거가 화면 전체로 넓혀져 나머지 **열한 곳**이 따라왔다: 코드 참조 permalink · 툴바의 "View what was sent" · Publish 결과의 PR 링크 · Home의 PR 링크 · 이력 표의 PR 링크 · 보관 Dialog의 열린 PR 링크 · 목록 띠의 외부 링크 · App 설치 링크 셋(온보딩 둘·설정 — 온보딩 쪽은 2026-09-18부터 같은 탭이다, 위 예외) · Installation settings. 한 줄짜리 메타 행·띠에서 12px 아이콘이 자리만 먹었고, **나가는 신호는 색과 새 탭이 이미 든다.**

⚠️ **글리프가 빠지면서 인라인 링크의 `inline-flex items-baseline gap-*`도 함께 빠졌다** — 텍스트만 남으면 그 셋이 할 일이 없다. (예외였던 `key-group.tsx`의 코드 참조는 2026-09-23에 옛 번역 표와 함께 사라졌다.)

⚠️ **목적지를 모양으로 알리지 않으므로 문장이 그 몫을 진다.** 접근 이름이 `#127` 하나로 줄어드는 자리(Home·이력 표의 PR)는 앞의 라벨(`Pull request`)이 그것을 말한다. `messages/en.tsx`의 `sendHint`처럼 **"앱 안으로 간다"를 문장으로 적던 자리도 이제 모양으로는 안팎이 안 갈린다.**

⚠️ **이 반전은 2026-09-08 `/doc-check`이 "다섯 곳 중 둘만 아이콘을 든 상태"를 잡아 코드를 고쳤던 것의 되돌림이다** — 그때 맞춘 방향이 지금은 반대다. `home-landmarks.test.tsx`(리포·PR 두 행을 함께)와 `projects-screen.test.ts`(`not.toContain`)가 되살아나지 못하게 센다.

⚠️ **예외 하나 — Home 메타 열의 리포 링크는 파랑이지만 글리프가 없다** (2026-09-16). 규칙을 "전부"로
읽으면 이 자리가 위반으로 보이므로 여기 적는다: **두 정본이 함께 그렇게 정했다** — `design_handoff_project_home`의
lucide 목록에 `external-link`가 없고 `2a`가 *"리포 주소와 PR 번호만 링크"*라고만 적으며, 바로 위 여덟
목록에도 **Home의 PR 링크는 있고 리포 링크는 없다.** 같은 카드 안에서 PR 번호는 글리프를 들고 리포
주소는 안 드는 **비대칭이 의도**이고, `components/__tests__/home-landmarks.test.tsx`가 둘을 **한 검사**로
센다 — 한쪽만 고치면 red다.

**내부 링크는 표면이 두 갈래다.** 셸 **안**의 내부 링크(사이드바·목록 행·진행률 행·활동 행)는 밑줄 없이 `text-foreground`/`text-muted-foreground`다 — 행 전체가 눌리는 자리라 색이 아니라 hover가 그것을 말한다. ⚠️ **셸 밖 화면의 텍스트 링크는 `text-blue-600`이다**(로그인 푸터의 Privacy·Docs, `/privacy`·`/docs`의 돌아가는 링크) — 그 화면들엔 사이드바도 행도 없어서 **링크가 문단 안의 글자 하나**이고, 색이 없으면 눌리는 것인지 알 수단이 밑줄뿐인데 그것을 8-1b가 전역으로 걷었다. 아이콘은 안 붙는다(리포 밖으로 안 나간다).

### 6.4 공통 형 — 프리미티브가 든다 (2026-09-08)

옛 판의 "hand-rolled 컨트롤 클래스 표"는 사라졌다. **형은 `components/ui/`의 variant이고 화면은 raw 태그를 쓰지 않는다** — `focus-ring.test.ts`가 `ui/` 밖의 `<button>`·`<input>`·`<select>`·`<textarea>`를 **0개로 고정한다** (§7 — 축소형 허용 목록이 2026-09-08 ship 4에서 비어 전면 방어선이 됐다). 색은 전부 §2의 토큰이다.

| 프리미티브 | 형 (옛 표의 어느 행을 잇나) |
|---|---|
| **Button** `primary` | `bg-primary text-primary-foreground hover:bg-foreground` (2026-09-13 — hover에서 **어두워진다**. 코드는 `bg-primary/90`(≈#2e2e2e)이라 **밝아지고** 있었고 눈으로는 "둘 다 회색"이라 리뷰가 못 잡는다) · `h-9 px-3 text-sm font-normal` + **size가 radius를 든다**(`md` `rounded-md` 10 — §5) — 옛 "primary 버튼". **화면당 하나**(확정 액션) |
| **Button** `default` | `border border-input bg-background hover:bg-primary-foreground text-foreground` (2026-09-13 — #f5f5f5 → **#fafafa**, §6.2) · 같은 치수 — 옛 "bordered(페이지·툴바)"를 하나로. **툴바도 같은 `md`(36)다** — 크기로 자리를 가르지 않는다 |
| **Button** `danger` | `default` + `text-destructive border-destructive/40 hover:bg-destructive/5` — `bg-destructive` 없음(§2.3). 멤버 제거·연결 해제·초대 취소<br>⚠️ **꺼져도 destructive 계열을 유지한다 — 이 variant만 그렇다** (2026-09-20, 사용자가 화면에서 잡았다). 나머지는 꺼지면 `text-muted-foreground`로 죽지만 여기는 **선 `/20` · 글자 `/40`** 으로 한 단계씩 내려갈 뿐이다. 근거: 소비자가 **전부 되돌릴 수 없는 동작**이라(Discard · Archive · Sign out everywhere · Unlink · Remove · Revoke) 회색으로 접으면 *"이건 파괴적이다"* 라는 신호가 사라진다 — 핸드오프가 danger의 꺼진 형을 따로 정의한 이유다.<br>⚠️ **선과 글자를 반드시 짝으로 옅힌다.** 글자만 muted로 바꾸고 테두리를 `/40`에 두었더니 **붉은 테두리 + 회색 글자**가 되어 꺼진 것으로도 켜진 것으로도 안 읽혔다 — `disabled-pairing.test.ts`가 그 짝을 상시로 센다.<br>⚠️ **대비가 낮아진다** — `text-destructive/40`은 흰 배경에서 **약 1.6:1**로 muted(4.7:1)보다 낮다. 꺼진 컨트롤이라 WCAG 1.4.3 대상은 아니고, **꺼진 컨트롤에는 반드시 사유가 붙는다**(§6.65)는 규칙이 색이 지지 않는 정보를 진다. |
| **Button** `ghost` | 배경·테두리 없음 · `text-muted-foreground hover:text-foreground` — 옛 "텍스트 버튼"(밑줄 제거). 툴바 보조·아이콘 버튼·사이드바 |
| **Button** `link` | `text-blue-600` 인라인 (밑줄 없음) — 번역 셀의 [Try again]·[Sign in] (초대 화면의 "Sign in with another account"는 기본형 `w-full`이다) |
| **Button** `size="sm"` | `h-7 px-2 text-xs` — 표 안·배지 옆 |
| **Button** `disabled` | `disabled:text-muted-foreground disabled:hover:bg-transparent`(default·danger — **ghost에는 hover 짝이 없다**: 거기서 hover가 바꾸는 것은 배경이 아니라 글자색이라 `disabled:text-muted-foreground` 쪽에 짝이 선다) / `disabled:bg-muted disabled:text-muted-foreground`(primary). ⚠️ **`disabled:cursor-not-allowed`는 variant가 아니라 base에 있다** — 커서는 어느 variant든 같다. primary는 불투명한 muted 면을 쓰며 호출부에서 `disabled:opacity-*`나 비활성 형을 덧씌우지 않는다 |
| **ButtonLink** | 같은 variant·size를 입은 `<Link>` — 주 행동이 **라우트 이동**인 자리("New project"·"Open translations"). ⚠️ **`Button`에 `asChild`를 두지 않는 것의 짝이다**: Slot 한 겹이 `<button>` 태그를 지워 `focus-ring` 스캐너가 그 파일을 못 보게 된다(§7). 형의 단일 출처는 `buttonClass()` |
| **Input·Select** | `h-9 px-2.5 text-sm border border-input bg-background rounded-md` · invalid `border-destructive` · disabled `bg-muted text-muted-foreground` — 옛 "입력(페이지·툴바)"을 하나로 |
| **Textarea** | 같은 형이지만 **높이 클래스(`h-9`)를 안 든다** — `rows=1` + `field-sizing-content py-1`이라 높이는 내용이 정한다 (§6.1) |
| **SearchInput** | ⚠️ **`components/ui/` 밖에 산다**(`components/search-input.tsx`) — `Input`을 조립한 **공유 화면 컨트롤**이고 Radix도 variant도 없다. `Input` + `Search` 글리프(`absolute top-2.5 left-2` 16) · ⚠️ **폭 `w-64 pl-8`을 파일이 소유한다**(`className`은 바깥 자리잡기용이다 — 폭을 인자로 열면 툴바마다 검색창이 달라지고 그 차이는 두 화면을 나란히 놓기 전에는 안 보인다) · **Enter 제출형**이고 IME 조합 확정 Enter는 거른다(`isComposing`과 `keyCode === 229`를 **둘 다** 본다 — 브라우저마다 하나씩만 주는 경우가 있다). 소비자 **둘**(`projects/search-input` · `translations/workspace/workspace` — 후자는 `inputClassName="w-80"`으로 폭만 바꾼다, §6.1a). ⚠️ **온보딩 ①의 리포 검색은 이것을 안 쓴다** — 입력 중 즉시 거르는 폭 100% 필드라 계약이 다르고, 글리프 자리잡기 관용구만 빌린다 |
| **FileInput** | account-settings 신설 (2026-09-13) — **프리미티브 19**. 보이는 것은 `Button`(`default` `md`)이고 `<input type="file">`은 `sr-only` + **`tabIndex={-1}` + `aria-hidden`**이다. ⚠️ **`sr-only` + `<label>` 관용구를 쓰지 않는다** — 그 형은 포커스를 **숨은 input**이 받아 보이는 것에 아무 표시가 없고, 링을 `peer-focus-visible`로 옮겨 붙이면 **포커스 링 검사가 보는 자리(여는 태그)와 링이 사는 자리가 갈린다.** 대신 input을 포커스 대상에서 통째로 빼고 링은 `Button`이 든다(§7). ⚠️ **`focus-ring.test.ts`의 면제가 그래서 넓어졌다** — `type="hidden"`이 될 수 없는 태그라 **`tabIndex={-1}`와 `aria-hidden`을 함께** 든 것만 면제하고, 하나만으로는 안 빠지는 것을 메타 테스트가 센다. ⚠️ **`change` 뒤 `value`를 비운다** — 거부된 파일을 고쳐 같은 이름으로 다시 고르는 것이 흔한 경로인데, 안 비우면 같은 파일에서 이벤트가 안 난다. ⚠️ **`accept`는 대화상자 필터이고 방어선이 아니다**(사용자가 "모든 파일"을 고를 수 있다) — 판정은 `planImagePick`(클라이언트)과 `planImageUpload`(서버 시그니처)가 든다. ⚠️ **`disabled`가 `loading`과 갈라져 있다** (2026-09-14) — 짝이 되는 컨트롤([Delete])이 도는 동안 이 자리를 막되 **스피너는 그쪽에 세워야** 하기 때문이다. 하나로 합치면 도는 쪽이 둘로 보이고, 안 막으면 둘이 동시에 돌아 먼저 끝난 쪽이 남의 스피너를 끈다 |
| **캡션 강조** | ⚠️ **필드 아래 캡션(help·hint·경고 한 줄)에서 굵게 쓰지 않는다** (2026-09-13 사용자). 13px 한 덩어리에 굵기를 섞으면 그 조각이 **제목처럼** 읽혀 바로 위 라벨과 경쟁한다 — **보이는** 강조는 `text-foreground`까지다(바탕이 `text-muted-foreground`라 그것만으로 충분히 뜬다). ⚠️ **`<strong>`은 지우지 않는다 — `font-normal`로 되누른다**: 되돌릴 수 없음을 말하는 문장(주소 확정·토큰 1회 노출)이 색만 남으면 스크린리더가 평평하게 읽고 고대비 모드에서도 사라진다. 색에 시맨틱을 딸려 보내는 것은 `LocaleBadge`의 `sr-only`와 같은 규칙이다(§7). `(optional)`이 `font-normal`로 라벨의 500을 되누르는 관용구가 이미 있다 |
| **FormGroup** | label `text-sm font-medium` · help `text-xs text-muted-foreground **leading-[1.7]**` · error `text-xs text-destructive **leading-[1.7]**` (2026-09-13 — 시안. 필드 아래 설명은 두세 줄이 되는 자리라 기본 행간 1.33이면 줄이 붙어 한 덩어리로 읽힌다. ⚠️ **`text-xs`에 `line-height`를 짝으로 안 주는 것이 `@theme`의 결정**이라 이 값은 소비자가 든다) · `labelId`(Radix `Select` 트리거가 `aria-labelledby="{labelId} {triggerId}"`로 라벨+값을 잇는다) · "(optional)" `text-muted-foreground font-normal`(⚠️ label이 500이라 **되눌러야 한다** — §4의 기본 400) 오류는 14px 장식 아이콘·role=alert·안정된 ID(`{htmlFor}-error`)를, help도 안정된 ID(`{htmlFor}-help`)를 제공한다. 필드의 aria-invalid/aria-describedby는 소비자가 잇는다 — ⚠️ **help도 잇는다**(2026-09-24, audit #89 — 전엔 help에 id가 없어 경로 형식·slug·기준 언어 안내가 입력에 포커스한 스크린리더 사용자에게 안 닿았다). 오류가 help를 대신하는 동안은 오류를 가리킨다. |
| **Radio** | **Radix `RadioGroup.Item`이다** (2026-09-13 — 그 전엔 native `<input type="radio">`였다). 16 원 · 비선택 테두리 **`neutral-300`**(#d4d4d4) · 선택 테두리 `foreground` + 안쪽 점 **8**(`Indicator`) · label `text-sm`. ⚠️ **`Radio`는 `RadioGroup` 안에서만 선다** — Radix `Item`이 Root 컨텍스트를 읽으므로 홀로 쓰면 던진다. 목록을 그리는 쪽이 `RadioGroup`을 감싸고 `aria-label`로 그룹 이름을 준다. ⚠️ **`asChild`로 `<ul>`에 얹지 않는다** (2026-09-13 실측) — Radix가 그 태그의 role을 `radiogroup`으로 덮어써 `<li>`가 부모 list를 잃은 고아가 된다. Root의 div 한 겹을 받아들이면 리스트와 radiogroup이 둘 다 산다. ⚠️ **`fieldset`/`legend`와 겹쳐 쓰지 않는다** — 그룹이 둘이 되어 이름이 두 번 읽힌다. ⚠️ **`labelClassName`이 행의 gap을 연다** — 온보딩 행이 "라디오 16 + 칩 40 + 텍스트"이고 셋 사이가 전부 12인데, `className`은 지시자로 가므로 그 자리로는 바깥 `<label>`의 `gap-2`를 못 덮는다. **`Checkbox`는 아래 별도 행이다**<br>⚠️ **`RadioGroupItem`(맨 재수출)의 소비자는 `SegmentedControl` 하나다** (2026-09-23 — 초대 모달의 Role 카드가 행마다의 `Select`로 가며 빠졌다, §6.65). Radix의 선택·roving focus만 쓰고 **형은 자기가 얹으며**, 그래서 **포커스 링도 자기가 든다** — `Radio`와 달리 지시자 원이 없어 링이 빠지면 키보드로 어디 있는지 알 수 없다 (§7) |
| **Checkbox** | Radix `Checkbox.Root` · 16 사각 · 비선택 `neutral-300`, 선택 `foreground` + 체크 12. Radio와 같은 포커스 링·disabled. 시각 label은 필수가 아니며 `aria-label` 또는 `aria-labelledby`로 이름을 준다. 포함 체크와 상세 버튼은 형제다 |
| **SegmentedControl / SegmentedLinks** | 8-2 신설 · 8-3이 링크판을 더했다. 트랙 `bg-canvas rounded-lg p-1 gap-1` · 세그먼트 `rounded-md px-2 py-1 text-sm gap-1.5`(`min-w-11`은 **링크판만**) · 선택 `bg-background shadow-low font-medium` / 비선택 `text-muted-foreground hover:text-foreground`. ⚠️ **칸의 radius가 `md` 버튼과 같다** (2026-09-11) — 선택된 칸이 흰 배경 + `shadow-low`로 떠올라 버튼처럼 보이고 툴바에서 실제 `Button`과 나란히 선다. 트랙은 칸이 `p-1`만큼 안쪽이라 **한 단계 크다**(동심이 되는 14가 스케일에 없어 12). ⚠️ **`SegmentContent`가 `icon`·`badge`를 받는다**(라벨 왼쪽 `size-4 aria-hidden` / 오른쪽 `Badge neutral`, **0도 보인다**) — **지금 그 두 축의 소비자는 0이다**. 치수를 프리미티브가 드는 이유는 bugshot-2가 children으로 넘기다 배지 크기가 두 벌로 갈렸기 때문이다. ⚠️ **형이 둘인 것이 요지다**: 상태를 클라이언트가 들면 `SegmentedControl`(버튼 · `role=radiogroup`), **URL이 들면 `SegmentedLinks`**(`<nav>` + `aria-current="page"`). 필터·탭은 뒤엣것이다 — 뒤로가기·공유·새로고침이 그냥 돼야 한다. ⚠️ **`role="tablist"`가 아니다**: ARIA 탭은 `aria-controls`와 패널 연결이 계약인데 이 컨트롤은 그걸 안 든다. ⚠️ **대신 라디오의 키보드 계약은 든다** — 2026-09-12부터 **Radix `RadioGroup`이** 방향키·roving tabindex·`loop`를 들고, **Home/End만 프리미티브가 얹는다**(Radix가 안 준다). 2026-09-11의 손수 구현(`nextRovingIndex` + `tabIndex={selected ? 0 : -1}`)을 대체했고, 링 검사가 `button[role="radio"]`를 보므로 Radix가 곁들이는 숨은 `<input>`이 보이지 않는 링으로 green을 만들지 않는다 |
| **Badge** | ⚠️ **알약이고 한 글자면 정원이다** (8-3 · 2026-09-11): `text-xs rounded-full px-1.5 py-0.5 min-w-5 justify-center`. `min-w-5`가 높이(`text-xs` 16 + `py-0.5` 4 = 20)와 같아 개수 배지가 원이 되고, **padding이 `px-1.5`여야** 한 글자에서 그것이 이긴다(`px-2`면 8+7+8=23으로 20을 넘는다). **레이블은 `font-medium`(500)으로 전역 통일한다** (2026-09-12 사용자). variants **다섯**: `muted`(`text-muted-foreground`, 배경 없음)·`warning`(amber)·`danger`(`text-destructive`)·**`neutral`**(`bg-foreground/5 text-foreground` — 8-3, `--foreground`의 알파)·**`success`**(`bg-green-100/80 text-green-800` — 2026-09-11, 목록 행의 `Active`) — §6.2. ⚠️ **검정 채움(`solid`)은 없다** — 시안 개정이 역할을 배지에서 메타 평문으로 내리며 소비자가 0이 됐다 |
| **Alert** | `rounded-lg border p-4` · 좌측 아이콘 16 · 제목 `text-sm font-medium` · 본문 `text-sm` ≤ 2문장 + 다음 행동 · 액션 최대 2 · 닫기 우상단 **`ghost` + `size-9 rounded-md p-0`**(36 정방 · 음수 마진 `-mt-2 -mr-2`). ⚠️ **`ghost sm`(28 / radius 8)이었다** (2026-09-13 — 계정 화면 핸드오프): `size="icon"`을 만들지 않고 `md`의 높이·radius를 그대로 쓰고 정사각 유틸로 폭만 맞춘다. 라벨은 `m.common.dismiss`다. variant 넷은 §6.2. **배치 셋** — global(페이지 콘텐츠 맨 위 전폭 — `?e=` 거부) · page-level(제목 아래 — 리포 갱신 보류 배너·Publish 결과) · in-block(설정 블록 안 — 컨트롤 실패) **`inset`**은 radius·사방 테두리 없이 상단 divider와 padding 13/16으로 카드 전폭에 붙는다. 페이지형의 역할·색은 유지한다. |
| **PanelCard** | 계정 구역에서 승격한 공유 카드. PanelCard/Rows/Row/Facts 넷이며 제목 없는 사용도 지원한다. 설정·계정·Sources에서 사용한다. radius 12 · header padding 16 · title 15/500 · container query 640. 옛 Card는 삭제했다 (§6.6·§6.67) |
| **Table** | 번역·언어·이력 **셋** + 공개 문서(§6.61) **넷**이 쓴다 (⚠️ **2026-09-19에 멤버가 빠졌다** — 그 화면이 카드 + `<ul>`로 갔다, §6.65. 온보딩 ②의 파일 표는 이 수 밖이다 — §6.643. 세는 명령: `grep -rln 'from "@/components/ui/table"' components app | grep -v __tests__ | grep -v ui/table` → **파일 여섯**, 화면 다섯). shadcn `new-york-v4` 기반이고 `TableHeader`·`TableBody`·`TableRow`·`TableHead`·`TableCell` 다섯을 낸다(⚠️ **`TableFooter`·`TableCaption`은 안 들인다** — 소비자 0). ⚠️ **`Th`·`Td`·`Tr`은 별도 구현이 아니라 그 위의 프리셋이다** (2026-09-12) — 번역 화면이 프리미티브를 직접 들고, 공개 문서는 **섞어 쓴다**(열 머리는 `TableHead`, 셀은 `Td` — §6.61이 그 이유를 든다). 나머지 셋은 프리셋만 쓴다. 프리셋이 **되눌러야 하는 기본값**(`whitespace-nowrap`·`align-middle`·`border-b`·`h-10`·`px-2`)은 각 함수 위에 적혀 있고 `components/__tests__/table-presets.test.ts`가 렌더해서 센다 — 하나가 안 지워지면 긴 사유가 한 줄로 늘어나고 마지막 행 아래에 선이 하나 더 선다. ⚠️ **`scrollable` 기본이 참이고 끄는 곳이 셋이다** — 번역 화면(`PanelBody`가 스크롤을 소유한다, §6.1) · 온보딩 ②의 파일 표(그 `div`가 스크롤을 들어야 `Th`의 `sticky`가 붙는다, §6.643) · 공개 문서(그 `div`가 `role="region"`을 들어야 키보드로 가로 스크롤된다, §6.61). 컨테이너를 하나 더 만들면 스크롤이 중첩된다 |
| **Breadcrumb** | `text-xs` · 항목 `text-muted-foreground hover:text-foreground` · 마지막 `text-foreground font-medium` `aria-current="page"` · 구분자 `/` `text-muted-foreground/60 px-2` |
| **DropdownMenu** | `min-w-60 rounded-lg border bg-popover shadow-md py-1` · 항목 `mx-1 px-2 py-1.5 rounded text-sm hover:bg-accent` · selected `bg-muted` + `Check` 16 |
| **Dialog** | **`max-w-110`(440 — 2026-09-18, 옛 360)** `rounded-lg border bg-background` **`shadow-medium`** · 헤더 `p-4 pb-2` · 제목 `text-base font-medium`(15/500) · 설명 `px-4 text-xs leading-[1.6]`(13/1.6) · 푸터 **`p-4`** `gap-2` 버튼 최대 3(primary·default·ghost cancel) · 배경 `bg-foreground/40` · Overlay·Content 모두 `z-50` · Esc·배경·X·Cancel 넷으로 닫힌다. 닫기는 위 Alert와 **같은 36 정방**(음수 마진만 `-mt-1.5 -mr-2`), 라벨은 `m.common.close`<br>⚠️ **넷이 2026-09-13에 움직였다**(계정 화면 핸드오프 — 폭 512→360 · `shadow-lg`→`shadow-medium` · 설명 14→13/1.6 · 푸터 위 24→16). **`shadow-lg`는 Tailwind 기본 그림자라 §4.5가 금지한 값이었다** — 이건 이탈이 아니라 기존 위반의 교정이다. 소비자 **열둘**이 함께 움직인다(archive-card · member-list · login-methods · github-account · sessions-section · home/sync-button · publish-button · sources/source-detail-modal · logs/log-filters · translations/workspace · **members/pending-invitations** · **settings/push-token-panel** — 뒤의 둘은 2026-09-24 audit #19·#20의 확인창이다. 2026-09-24에 아래 명령으로 다시 셌다) — ⚠️ **이 수가 네 번 틀렸다**(넷 → 다섯 → 여섯 → 일곱 → **그때 실제로는 여덟**). 2026-09-19에 아래 명령을 다시 돌려 보니 그 시점 소비자가 **여덟**이었고 **`publish-button`이 목록에서 빠져 있었다** — 이 줄이 *"프리미티브를 만질 때마다 소비자를 다시 센다"*고 적어 두고 스스로 그것을 안 한 것이다. 그날 일곱이 된 이유는 같은 날 `invite-dialog`가 사라졌기 때문이다(초대가 `OnboardingModal`로 갔다, §6.65). *"프리미티브를 만질 때마다 소비자를 다시 센다"*의 입력이 이 숫자이고, 빠졌던 하나가 하필 **푸터 유무로 본문 형이 갈리는** 변경의 소비자였다. 세는 명령은 `grep -rln "import .*DialogContent" components app | grep -v __tests__ | grep -v ui/dialog`다 — ⚠️ **프리미티브 자신을 빼야 한다**, 그리고 **`import` 없이 세면 주석에서 그 이름을 부른 파일까지 든다**(2026-09-15에 실제로 한 건 더 셌다). 이 줄을 처음 적었을 때 그것이 빠져 **명령과 본문이 서로 다른 수를 냈다**<br>⚠️ **본문의 형이 푸터 유무를 따라간다** — 확인 Dialog의 "검은 줄"은 `p-4 pb-0 text-xs leading-[1.6]`(*지금 참인 값*을 말하는 한 줄이고 푸터가 자기 16을 갖는다), **푸터 없는 소비자**(초대 폼)는 본문이 곧 폼이라 `p-4 text-sm`이다. 구별 없이 `pb-0`을 주면 그 폼이 바닥에 붙고 `FormGroup` help까지 13으로 내려간다(2026-09-13 실측)<br>⚠️ **본문이 없으면 그 `<div>`를 그리지 않는다** — 확인 Dialog는 대부분 본문이 없어서 빈 블록의 `p-4`가 설명문과 푸터 사이에 **죽은 32px**을 만들고 있었다<br>⚠️ **Dialog 안의 경고는 `Alert`가 아니라 전용 블록이다** (2026-09-15 — sync 핸드오프 §7 · 실측): `border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert`로 **색은 `Alert warning` 그대로**이고 **치수만 한 단계 줄인다**(radius **10** · padding **12** · 글자 **13** · 글리프 **14** · 줄 사이 **6**). 360 Dialog에서 `p-4` Alert는 본문 폭을 296으로 떨어뜨려 두 줄 문장이 네 줄이 된다. **프리미티브로 올리지 않는다 — 소비자가 `home/sync-button` 하나다**(올리면 안 본 화면 넷이 함께 움직인다). 글리프는 **블록 머리에 하나**이고 줄마다 주지 않는다: 글리프가 둘이면 경고가 둘인 화면이 되는데 실제로는 한 경고의 근거가 둘이다 |
| **Modal** | **큰 모달 껍데기** — 정의는 `components/ui/modal.tsx`의 `OnboardingModal`이다(⚠️ **`components/onboarding/modal.tsx`는 2줄 re-export shim이다** — 경로를 그쪽으로 적지 않는다). ⚠️ **위 `Dialog`를 쓰지 않고 Radix `Dialog.*`를 직접 조립한다**: Overlay 색이 고정이고 머리·본문·바닥 padding이 박혀 있고 바닥이 `justify-end`라 왼쪽 `Step n of 4`가 안 들어가는데, 그것을 고치면 440 Dialog 소비자 **여덟이 함께 움직인다**. 폭 **1024**(2026-09-18 사용자, 옛 800 — `w-[calc(100%-96px)] max-w-[1024px]`. 온보딩·Publish 공통이다 — Publish가 736으로 덮던 것을 지웠다) · `rounded-xl` · `shadow-medium` · dim **`bg-foreground/32` + `backdrop-blur-[6px]`**(360 Dialog의 `bg-foreground/40`과 다르다 — 이쪽은 흐린다) · 머리 `px-8 pt-8 pb-5` 제목 `text-xl font-medium` · 닫기 `ghost` `size-9 rounded-full` 안의 `X` 20 · 바닥 버튼 `size="lg"`(§5의 "셸 밖 카드 전용"에 이 모달을 예외로 넣었다 — dim 위에 뜬 표면이라 셸 안이 아니다). 소비자 **여섯**(`onboarding/new-project` · `publish-button` · **`members/invite-modal`** — 2026-09-19에 440 `Dialog`에서 옮겨 왔고 2026-09-23에 다중 초대 폼 하나가 됐다, §6.65 · **`sources/source-detail-modal`** — 2026-09-22) + settings Add sources·Workflow (§6.6). 선택적 closeDisabled는 X·Esc·backdrop을 함께 막는다. 선택적 `initialFocusRef`는 **Radix 열림 자동 포커스 자리에서** 그 요소로 옮긴다(2026-09-23 — 소비자 effect로는 Radix가 뒤에 돌아 진다) |
| **DropdownMenu** | ⚠️ **`DropdownMenuItem`은 `{children}`을 `Slot.Slottable`로 감싼다** (2026-09-09). 호출부가 `asChild`를 주면 Radix Slot이 그 자식에 props를 얹는데 **자식이 정확히 하나여야 한다** — `selected`의 `Check`가 형제로 붙는 순간 던지고, 그 트리(= 앱 셸)가 통째로 죽는다. 실측: 프로젝트 스위처를 **한 번 열면** "This page couldn't load"였고 `add099a`부터 프로덕션에 있었다(POSTMORTEM 2026-09-09 — 툴팁 provider와 같은 계보). `components/__tests__/slottable-item.test.ts`가 `asChild`가 닿는 프리미티브 전수 + 이 이름을 고정한다 |
| **RowCard** | members-rework 신설 (2026-09-19) — **프리미티브 23**. **행 목록 카드**: `RowCard`(헤더 = 제목 · 카운트 배지 · 설명 한 줄) / `RowCardList`(`<ul>` + `@container`) / `RowCardItem`(선의 급 둘) / `BannerLine`(행 아래 사유 띠) / `EmptyRowCard`(칩 36 · padding `48 24` · `inset`이면 카드 안). 소비자 **다섯**(`projects/project-list` · `projects/empty-projects` · `members/member-list` · `members/pending-invitations` · `members/member-row`). 카드 `border-border rounded-lg shrink-0 overflow-hidden` · 헤더 `p-4` 제목 `text-base font-medium` · 헤더↔첫 행 `border-foreground/[0.06]` · 행↔행 `border-border`. ⚠️ **`Card`가 아닌 이유**: 제목이 `text-sm`, 헤더 선이 전폭 `border-border`, 본문 `space-y-2 p-4`라 행 목록에 padding이 두 벌, 카운트 배지 슬롯도 `overflow-hidden`·`shrink-0`도 없다. ⚠️ **`EntityCard`도 아니다** — 형은 가깝지만 **개별 카드이고 목록 카드가 아니다.** ⚠️ **`divide-y` 금지** — 띠가 행의 형제라 그 규칙이 띠와 행 사이에도 `#e5e5e5`를 넣는데 시안은 거기가 `#f0f0f0`이다. ⚠️ **`countLabel`에 기본값이 없다** — 전에는 `m.projects.count`가 박혀 있었고, 그대로 공유했으면 멤버 카드가 "3 projects"를 낭독했다. ⚠️ **`description`은 `/projects`가 안 쓰는 슬롯이라 조건을 코드에 조건으로 쓴다**(POSTMORTEM 2026-09-14) — 설명이 없으면 헤더가 예전과 글자 하나까지 같은 한 줄이다. ⚠️ **hover·`ring-inset`·전체-링크 형은 올리지 않는다** — 소비자에 남는다(헤더에 hover가 붙으면 누를 수 없는 것이 눌릴 것처럼 보이고 `projects-cards.test.tsx`가 그것을 0으로 고정한다). ⚠️ **`titleId`가 있으면 `tabIndex={-1}`도 같이 붙는다** — 그 id가 붙는 유일한 이유가 포커스 착지점이라(malmoi#51) 둘이 갈리면 `focus()`가 조용히 무시된다 |
| **EntityCard** | account-linking 신설 (2026-09-12) — **프리미티브 17**. "지금 다루는 대상 하나"를 보이는 자리이고 소비자는 **병합 화면 하나**다. 박스 `flex items-center gap-3 rounded-lg border p-3 w-full`(radius **12** — ⚠️ `rounded-xl`은 16이라 같은 화면의 `Card`·`Alert`·`Dialog`(전부 12) 사이에서 **작은 카드 하나만 더 둥글어진다**) · 본문 `min-w-0 flex-1 flex-col gap-px`, 1행 `text-sm truncate`, 2행 `text-xs text-muted-foreground` · 우측 슬롯(provider 마크 16, ⚠️ **브랜드 마크는 무채색 위계의 대상이 아니라 `--foreground`를 그대로 받는다**). ⚠️ **아바타 소스가 1행 텍스트와 갈라져 있다**(`avatarName`·`image`, 2026-09-12) — 병합 화면의 1행은 **마스킹한 이메일**이라 이니셜이 주소의 첫 글자가 되는데 셸 아바타는 표시 이름에서 온다. 같은 계정이 화면마다 다른 글자·다른 색으로 보이면 아바타가 사람을 가리키지 못하고 소음이 된다. ⚠️ **`kind` prop이 없다** — 초대의 프로젝트 카드는 **같은 박스 규격**을 쓰지만 `components/invite/project-card.tsx`의 화면 조각이다: 아바타 폴백이 이니셜이 아니라 **흰 `Box` 글리프**이고 §6.63이 이미 그 대체를 거부해 뒀다(`Avatar`는 한 줄도 안 건드린다). ⚠️ **그 글리프 박스의 radius는 `rounded-sm`(8)로 §6.63의 목록 행과 같다** (2026-09-12 실측 — 12로 나가 있었다. ⚠️ **그 사이 목록 행만 4로 내려가 이 문장이 한동안 거짓이었고, 2026-09-17에 목록·Home을 8로 올려 다시 참이 됐다** — 이 줄을 읽고 8을 고른 사람이 실제로는 어긋난 값을 보고 있었다): 같은 대상을 가리키는 표식이 화면마다 다른 모서리를 가지면 같은 것이라는 신호가 죽는다. 크기는 카드 규격을 따라 32이고 목록 행은 28이다. ⚠️ **테두리가 없는 것도 셋이 같다** (2026-09-25 사용자 — `Avatar`·`ProjectThumbnail`·이 글리프 박스. 2026-09-20의 `border border-border`를 셋이 함께 걷었다). ⚠️ **`LocaleFlag`를 물지 않는다** — 프리미티브가 `components/translations/`를 import하면 `ui/`가 잎에 가깝다는 성질이 깨진다 |
| **DropdownMenuCheckboxItem** | 8-4 신설 — 번역 화면의 `Select locales`가 유일한 소비자다. ⚠️ **`dropdown-menu.tsx`의 export이지 새 프리미티브가 아니다** — 이 리포는 **파일 단위로** 센다(`SegmentedControl`/`SegmentedLinks`가 한 행인 것이 그 근거다). 그래서 **프리미티브는 16 그대로였다** (2026-09-12에 `EntityCard`가 붙어 **17**이다 — 아래 행). 형은 `DropdownMenuItem`과 같고 다른 것이 셋이다: `role="menuitemcheckbox"` + `aria-checked`를 **Radix가 준다**(옛 `selected`는 `bg-muted` + `Check`라는 시각 표시뿐이라 접근성 트리에 상태가 없었다) · **`onSelect`의 `preventDefault()`를 프리미티브가 든다**(Radix `Item`은 선택 시 메뉴를 닫아서, 소비자가 그것을 기억하게 하면 하나가 빠진다) · 체크가 `Primitive.ItemIndicator`라 켜질 때만 그려진다. ⚠️ `{children}`은 여기서도 `Slot.Slottable`을 지난다(위 줄과 같은 이유) |
| **Avatar** | 사람 = `rounded-full`, 프로젝트 = `rounded`(라운드 사각) · 16/24/32/**56** — ⚠️ **56은 `/account` 머리 하나다** (2026-09-13) 그리고 **글자 크기가 `size`를 따라간다**(56은 `text-xl` = 20/500, 나머지는 `text-xs` = 13). 56짜리 원 안의 13은 점처럼 보인다. 소비자 둘(`entity-card`·`user-menu`)은 32라 안 움직인다. ⚠️ **사진 렌더는 이 유니온과 무관하다** — `src`를 받으면 raw `<img>`다(`next/image`가 아니다 — POSTMORTEM 2026-09-11) · 이니셜 폴백이 **`toneFill(name)` 배경 + `text-white font-medium`**이다 (2026-09-11 — 전엔 `bg-muted text-foreground/60` 하나라 사람이 여럿인 화면에서 아바타가 전부 같은 회색이었다). 색 판정은 §6.2 · **테두리가 없다** (2026-09-25 사용자 — 2026-09-20에 사진·이니셜 두 갈래에 붙였던 `border border-border`를 걷었다). 두 갈래가 함께 없어서 폴백이 일어나도 같은 `size`로 보인다. 16은 사이드바 사용자 구역 머리다 |
| **ImageTile** | project-settings-rework 신설 (2026-09-20) — **프리미티브 24**. 프로젝트 타일의 **이미지 한 장과 그 폴백**을 같은 정사각 상자에서 바꾼다. 소비자 **셋**(`projects/project-thumbnail` · `invite/project-card` · `settings/general-card`)이고 치수·radius·폴백 배경은 전부 호출부가 준다 — 이 잎이 드는 것은 **실패 판정**과 `object-contain` 둘이다(후자는 셋이 같은 값이라 prop으로 열지 않는다). ⚠️ **`Avatar`를 흡수하지 않는다** — 그쪽은 사람이라 `object-cover`에 폴백이 이니셜 글자이고, 공유하는 것은 `useImageFallback` 훅뿐이다(마크업을 합치면 §6.63이 거부해 둔 "이니셜 폴백"이 프로젝트 타일로 새어 든다). ⚠️ **실패를 불리언이 아니라 그 `src`로 기억하고 `ref`가 한 번 더 본다** (malmoi#50) — 하이드레이션 전에 끝난 실패는 `onError`로 안 오고(`complete = true`·`naturalWidth = 0`), 불리언이면 사진 교체 때 새 URL이 한 박자 늦는다. ⚠️ **`fallbackClassName`이 폴백에만 붙는다** — `toneFill`이 이미지 뒤에 깔리면 투명 PNG의 배경이 프로젝트마다 달라진다. ⚠️ **소비자가 `"use client"`가 되지 않는다** — 상태를 이 잎이 들어 `ProjectThumbnail`·초대 카드가 서버 컴포넌트로 남는다 |
| **ListItemButton** | translation-rework C4 신설 (2026-09-23) — **프리미티브 25**. 목록 행 전체가 누를 수 있는 `<button>`: `w-full text-left` · 선택 `bg-foreground/[0.07]` · hover `[0.03]`(`sidebar.tsx`와 같은 규칙) · `ring-inset` 포커스 링. 소비자 **둘**(`translations/workspace/tree-panel` · `key-list`). ⚠️ **선택은 배경만 바꾸고 굵기를 주지 않는다** — 굵기가 바뀌면 행 폭이 흔들린다. ⚠️ **이 파일이 생긴 이유는 `focus-ring.test.ts`다** — `components/ui` 밖의 raw `<button>`을 금지하므로 행 버튼도 프리미티브를 지나야 한다. 목록 의미(`<ul>`/`<li>`)는 소비자가 든다(§6.1a) |
| **Button `loading`** | **`Loader2` 스피너를 라벨 앞에** 세우고 disabled. ⚠️ **문구를 바꾸지 않는다** (2026-09-10 규칙 변경) — 전에는 `loadingLabel`로 `"Saving…"` 류를 넣었는데 폭이 흔들리고 화면마다 문구를 따로 들어야 했다(제거하며 죽은 문구 16개가 나왔다). 어느 버튼이 도는지는 스피너 위치가 말한다. ⚠️ **아이콘이 있는 버튼은 스피너를 *더하지* 않고 그 아이콘을 *교체*한다** (2026-09-17 — `NewProjectButton`의 `Plus` → `Loader2`, 둘 다 16): 더하면 라벨 폭이 그대로여도 버튼이 글리프 하나만큼 넓어졌다 좁아진다. **`Button`의 `loading`은 여전히 더하는 쪽이다** — 그쪽 소비자는 아이콘 없는 확정 버튼이라 교체할 대상이 없다. ⚠️ **라우트 이동의 pending은 `Button`이 못 든다**(`<a>`가 아니다) — `Link.onNavigate`를 가로채 `useTransition`으로 재는 것이 그 자리의 형이고, 지금 소비자는 [New project] 하나다<br>⚠️ **`disabled`를 못 쓰는 자리는 `aria-disabled` 속성만 세운다** (2026-09-17 사용자 — 전역 규칙): `buttonClass`의 모든 `disabled:` 유틸리티가 `aria-disabled:` 짝을 들고 있어 **겉모습은 같은 한 곳에서 나온다.** 소비자가 그 모양을 직접 그리면 `disabled-pairing.test.ts`가 red다 — 전엔 `sync-button`과 `new-project-button`이 각자 철자를 들어 같은 pending이 세 화면에서 달랐다. ⚠️ **`hover:`만 두 접두사의 값이 다르다**: 브라우저가 진짜 `disabled`에 hover를 안 태워 `disabled:hover:*`는 죽은 규칙이고, 그것을 복제하면 `default`·`danger`의 배경이 흰색에서 **투명**으로 떨어진다(2026-09-17 computed style 실측)<br>⚠️ **`busy`는 Dialog 트리거 전용 pending이다** (2026-09-24, audit B5): 같은 스피너에 `disabled` 대신 `aria-disabled` + `aria-busy`를 걸고 클릭을 막는다. 확정과 같은 커밋에 트리거가 `loading`(진짜 `disabled`)이 되면 Radix가 돌려주는 포커스가 `body`로 빠졌다 — Rotate token · Archive · Remove · Revoke · 두 Disconnect가 이것을 쓴다. **폼의 [Save]는 `busy`가 아니다** — 저장 중 `loading`이 규칙(§6.6)이고 끝난 뒤 착지한다(§7) |
| **Button `size` 셋** | `md` `h-9 rounded-md px-3`(기본 — 2026-09-11에 32에서 36으로 올렸다, 시안의 기본 버튼이 36이고 입력 셋도 같이 올라갔다) · `sm` `h-7 rounded-sm px-2 text-xs` · `lg` `h-10 rounded-lg px-4`(**셸 밖 카드 전용** — 로그인·초대 수락). ⚠️ **넷으로 늘리지 않는다** — 그러면 "어느 걸 쓰나"가 매 화면 판단이 된다. ⚠️ **radius가 base가 아니라 `size`에 붙어 있다**(§5) — base에 두고 size가 덮으면 cva가 충돌하는 클래스 둘을 내고 twMerge가 이기는 것에 기대게 된다. ⚠️ **`size="icon"`은 없다** — 정사각 아이콘 버튼은 `ghost` + 정사각 유틸이다(`user-menu.tsx`·칩 행의 초기화) |
| **EmptyState** | ⚠️ **아이콘이 48px 원형 칩 안이다** (8-3 — `bg-foreground/5` + 아이콘 16). 맨 아이콘은 텍스트에 붙어 제목의 일부처럼 읽히는데 칩이 그것을 **그림 자리**로 만든다(시안은 아이콘 20인데 이 자리는 §6.8의 기본 16이다 — 20은 40 칩 안에만 산다). 제목 **`text-lg font-medium` + `mb-1`** (2026-09-11 — `--text-base`가 15px로 내려가 설명 14와 1px 차이가 됐다) ≤5단어 마침표 없음 · 설명 `text-sm text-muted-foreground` **`max-w-[46ch]`** 완전 문장 (2026-09-13 — 시안값. `max-w-prose`(65ch)는 한 문장을 세 줄로 흘려 칩·제목과 무게가 뒤집힌다) · 액션 **버튼 하나** · 일러스트 없음. ⚠️ **액션 래퍼가 `mt-4 flex flex-wrap items-center justify-center gap-2`다** (2026-09-13 사용자 실물) — 액션 둘(검색 0건, 아래 예외 2)을 호출부가 `<>`로 넘기므로 사이를 벌릴 자리가 거기뿐이고, `mt-4`만 들고 있으면 버튼 둘이 **간격 0으로 맞붙는다**. 바로 아래 "컨테이너 `gap` 금지"와 충돌하지 않는다: 그쪽은 칩·제목·설명·액션 **사이**의 수직 간격이고 이것은 액션 **안**의 수평 간격이다. ⚠️ **수직 중앙을 컴포넌트가 하지 않는다** — 표 안(`logs`·대기 초대)에서도 쓰여서 자리마다 다르다. `flex-1`은 호출부가 든다. ⚠️ **컨테이너에 `gap`이 없다** (2026-09-11) — 칩 `mb-3` · 제목 `mb-1` · 액션 `mt-4`가 각자 여백을 들어 gap이 **거기에 더해지고**, 그러면 하나를 건드릴 때 세 간격이 함께 움직인다. 구조는 shadcn `Empty`와 1:1이고 **CLI를 돌리지 않는다**(Radix 없는 순수 마크업이다) |
| **값 칩** | `bg-muted rounded px-2 py-1` — **sans다**(§4.1, 2026-09-23). ⚠️ `<code>`로 그리면 preflight의 mono를 `font-sans`로 덮는다. 블록 요소면 `inline-block` |
| **코드 블록** | `<pre className="text-mono bg-muted overflow-x-auto rounded-md p-3">` + **블록 위 한 줄의 오른쪽**에 [Copy] `default`(아이콘 `Copy` → `Check`) → 라벨 교체 "Copied", 실패는 "Copy failed"(삼키면 사용자가 복사된 줄 알고 떠난다) |

**같은 행동은 같은 형이다** (2026-09-24, audit #49·#50 — 화면마다 손으로 다시 만든 형이 갈라져 있었다):

| 행동 | 형 | 근거 |
|---|---|---|
| **연결 해제**(`/account`의 GitHub App · 로그인 수단 둘) | 트리거가 **`danger`**다 — 꺼진 형(마지막 수단)도 `danger` + `aria-disabled` | 위 `danger` 행이 소비자로 이미 "연결 해제"를 적는다. 2026-09-13 핸드오프가 트리거를 `default`로 내렸지만 **같은 표의 나머지 되돌릴 수 없는 동작(Sign out everywhere · Remove · Archive)과 무게가 갈렸다** — 확인 Dialog가 무게를 든다는 근거는 그 셋에도 똑같이 참이다. ⚠️ **시안이 아직 `default`다** — 핸드오프를 사람이 고쳐야 `/design-sync`가 되돌리지 않는다 |
| **Retry**(`Try again`) — 페이지의 유일한 출구 | **`primary`** — `app/error.tsx`·`(edit)/error.tsx`·logs 조회 실패 셋 | 그 화면에서 할 수 있는 일이 그것 하나다. ⚠️ **블록 안 Retry(Alert의 액션 — Sync 결과 등)는 `default`로 남는다** — 화면의 primary가 따로 있다 |
| **되돌리기**(`Clear filters`) | **primary가 아니다** — 툴바는 `ghost`, 빈 상태 본문은 `default`. 둘 다 **`RotateCcw`**를 든다(§6.8) | 되돌리기는 확정이 아니다. primary는 "만들라·보내라"의 자리이고(§6.4 예외 2의 [New project]), 빈 상태에서 되돌리기를 primary로 칠하면 그 화면에서 가장 무거운 동작이 된다 |
| **검색 비우기**(`Clear search`) | 모달·목록 안은 `default` 버튼 · **`/projects`는 링크**(`text-blue-600`) | `/projects`는 캔버스(§6.63 `1c`·`1d`)가 정본이고 그 화면의 `Clear search` 둘이 **서로 같은 링크**다(2026-09-24 사용자 — 링크로 둔다) |
| 로딩 블록 | **`Skeleton`** 프리미티브(`bg-foreground/5` · `motion-safe:animate-pulse` · `aria-hidden`) | 라우트 `loading.tsx` 셋이 로컬 `Block`을, Publish 표가 `bg-muted animate-pulse`를 들어 **회색 값 둘·움직임 규칙 둘**이 섰다. `animate-pulse`는 `skeleton.tsx` 밖에 0건이다 |
| 회색 알약 | **`Badge neutral`** | Home 할 일 카드의 개수와 logs의 `Archived`가 같은 클래스를 손으로 들었다(`Archived`는 `bg-muted`라 값까지 갈렸다) |
| 안내 상자 | **`Alert`** — 상시 조건은 `info`(닫기 없음) | logs 보관 안내와 이벤트 상세의 상시 노트 둘이 테두리·아이콘을 손으로 그렸다. ⚠️ **상세의 실패 노트는 `Alert`가 아니다** (2026-09-24 사용자) — `danger`는 `role="alert"`를 들고, 상세는 **지난 기록**이라 여는 순간 assertive로 끼어들면 §6.644("상시 상태에 assertive를 쓰지 않는다")와 반대가 된다. **아이콘만 붉은** 무색 상자이고 상세 안에 live 영역이 0이다(`logs-events.test.tsx`) |
| 필터 트리거(`DropdownMenuTrigger`) | 번역 화면 `FilterMenu`의 md 형 — `bg-background` · hover **`bg-primary-foreground`**(`default` 버튼의 면, §6.2) · 고른 상태 `text-foreground` · chevron 16 | logs 필터만 hover가 `bg-accent`(#f5f5f5)라 한 줄의 두 트리거가 다른 면을 냈다 |

**B6의 승인된 캔버스 이탈** (2026-09-24 사용자 — **핸드오프를 사람이 고친다**. 안 고치면 `/design-sync`가 불일치로 되돌린다):

| 자리 | 캔버스 | 구현 | 근거 |
|---|---|---|---|
| `Not sent` 알약 · Publish 표의 키 칸 · 저자 이름 | 12px | **13**(`text-xs`) | 스케일에 12가 없다(§4) |
| 번역 키 행 원문 · 로케일 입력 · 빈 칸의 원문 | 14 / 0.015em | **14 / 0.02em**(`text-sm` 토큰) | 자간은 크기 토큰이 든다(§4) |
| Sources 상세 언어 행 [Open] | 32 · radius 10 (행 58) | **28 · 8**(`size="sm"`, 행 54) | 넷째 버튼 높이를 만들지 않는다(§5) |
| 번역 키 목록의 트리 열기 · 링크 복사 | radius 10 | **8**(`size="sm"`) | `sm` 위에 radius를 얹지 않는다(§5) |
| 연결 해제 트리거 셋 | `default` | **`danger`** | 위 "같은 행동은 같은 형이다" |
| logs 보관 안내 | 무색 상자 · 문장 muted · 복원 링크가 문장 **옆** | **`Alert info`** · 문장 foreground · 복원 링크가 문장 **아래**(Alert의 액션 줄) | 안내 상자는 Alert가 든다 — Alert에 인라인 액션 자리가 없고 새 형을 만들지 않았다 |

**빈 상태 문체**: 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, 버튼 하나 (§10).

⚠️ **예외 둘이 `/projects`에 있다** (2026-09-13 — 시안 `1a`·`3b`):

1. **프로젝트 0건은 `EmptyState`를 쓰지 않는다.** 첫 로그인의 착지점이고 사용자가 할 수 있는 일이
   하나뿐이라 **패널 자리를 KV 합성이 든다**(§6.63). 장식이 패널 **안**으로 들어오는 유일한 경우이고,
   행이 한 줄이라도 생기면 그 면은 통째로 사라진다.
2. ~~**검색 0건은 액션이 둘이다**~~ — **닫혔다 (2026-09-15 캔버스)**: `1d`의 [New project]가 머리로 올라가고 출구가 `Clear search` 링크 하나가 됐다(§6.63). 옛 판정 — [Clear search] `default` + [New project] `primary`. "되돌리라"와
   "만들라"는 **다른 출구**이고 여기까지 온 사람에게 둘 다 말이 된다. `EmptyState.action`이
   `ReactNode` 하나라 구조는 이미 둘을 받는다.

### 6.5 앱 셸 — 헤더·사이드바·패널 (Figma 시안 `212:937`, 2026-09-10 8-2)

**셸은 캔버스 위에 패널이 떠 있는 구조다.** 1920 기준 좌표다 — ⚠️ **아래 넷은 2026-09-10 시점의 실측이고 지금 값이 아니다**(§6.55가 우측 패널을 지웠다). 2026-09-16 실측은 §6.55의 표에 있다:
헤더 `(8,8) 1904×48` · 사이드바 `(8,64) 240×1008` · 콘텐츠 `x=256 w=1328` · 프로젝트 패널 `x=1592 w=320`. ⚠️ **뒤엣것을 지웠으므로 콘텐츠는 이제 `x=256 w=1656`이다**(1920 실측 1655).

⚠️ **2026-09-07의 GitLab super sidebar 형을 시안이 대체했다.** 가져간 것은 **정보구조**(구역 둘 ·
프로젝트 컨텍스트 · 하단 전역 항목 · 접힘)이고, **표면**(사이드바 배경·top bar·경계선)은 시안이 정한다.

| 요소 | 규칙 |
|---|---|
| **셸 루트** | ⚠️ **`flex h-svh overflow-hidden`이고 `min-h-svh`가 아니다** (malmoi#13). `min-`은 "최소 한 화면"이라 콘텐츠가 길면 컨테이너가 함께 자라고, 그러면 `aside`가 stretch로 **문서 높이만큼** 늘어 Sign out·Collapse sidebar가 화면 밖으로 나간다 — 24키 화면에서도 그랬다(`scrollHeight` 1483 / 뷰포트 775). 여기에 **`bg-canvas p-2 gap-2 min-w-[1280px]`**가 붙는다 — ⚠️ `min-w-`가 없으면 1280 미만에서 **스크롤이 아니라 flex가 압축돼 콘텐츠가 잘린다**(실측: 1100 뷰포트에서 문서 폭 1280, 가로 스크롤 발생). `app/(edit)/__tests__/shell-layout.test.ts`가 소스로 고정한다 |
| **헤더** | `h-12 px-1`, **배경도 border도 없다**(캔버스 위에 얹힌다). 드는 것은 **로고 32 좌측**(`public/brand/malmoi-icon-black.svg`, `/projects` 링크) **+ 사용자 메뉴 32 우측**(아바타 `ghost` 버튼 → DropdownMenu: 이름·이메일 → **Account** → Sign out) **둘뿐이다.** ⚠️ 항목 문구가 사이드바 사용자 구역의 `Account`와 **같은 키**다 — 한 곳(`/account`)을 가리키는 이름이 둘이면 그중 하나가 낡는다. ⚠️ 버튼이 아바타와 같은 32여야 한다 — `size="sm"`(28)이면 아바타가 위아래로 삐져나온다(실측). ⚠️ **breadcrumb은 여기에도, 어디에도 없다** — 8-4가 프로젝트 하위 화면 다섯에서 통째로 걷었고(§0) 위로 가는 길은 사이드바가 든다. 셸로 옮길 것이 남아 있지 않다 |
| 사이드바 | `w-60 shrink-0 p-1 gap-2 overflow-y-auto`, **배경도 border도 없다.** ⚠️ **접기가 없다** (8-3 — 시안에 없다): 아이콘 레일과 함께 **레일에서만 렌더되던 툴팁도 사라졌다**(2026-09-08에 셸을 죽였던 그 자리다). 소비자가 0이 되어 **2026-09-11에 `Tooltip` 프리미티브 자체를 걷었다** — 조상 provider를 요구하는 Radix 컴포넌트는 프리미티브가 자기 provider를 든다는 교훈은 POSTMORTEM 2026-09-08에 남아 있고, 다음에 그런 컴포넌트를 들일 때 그 확인을 한 번 한다. ⚠️ **반응형 분기가 0개다**(규약 3 — 최소 대응 너비 1280) |
| **항목 hover·선택** | ⚠️ **배경 알파다** — 선택 `bg-foreground/[0.07]`, 비활성 hover `hover:bg-foreground/[0.03]` — 2026-09-11에 **둘 다 한 단계 내렸다**(사이드바는 배경 없이 캔버스 위에 얹혀 같은 알파도 흰 패널 위보다 진하다). ⚠️ **선택에 weight가 없다 — 면 하나로만 표현한다** (2026-09-20 사용자 — 옛 판정 *"선택의 weight는 라벨 `<span>`이 든다"*의 철회. 그 판정은 **굵기를 `<Link>`가 아니라 라벨에 두는** 자리 문제를 푼 것이고, 굵기가 필요한가는 묻지 않았다). 굵기가 면과 함께 움직이면 선택을 옮길 때마다 **라벨 폭이 바뀌어 글자가 흔들리고**, 신호가 둘이라 면의 알파를 조정할 근거도 흐려진다. `components/__tests__/sidebar-selection.test.ts`가 소스에서 `font-medium` 개수를 **1**(구역 라벨 `<p>`)로 고정한다 — 사이드바에 렌더 테스트가 없어 스캔이 든다. Badge는 자체 `font-medium`(500)을 쓰므로 상속 문제도 함께 사라졌다. `--accent == --muted`(§2.1)라 캔버스 위에서 `hover:bg-accent`가 **보이지 않고**, 6단계의 "흰 알약"(`bg-background`)도 배경이 흰색이 아니게 되면서 근거가 사라졌다. **hover와 선택은 한 단계 벌린다** — 같은 알파면 포인터 아래 항목이 선택된 것처럼 보인다 |
| 섹션 항목 | `flex items-center gap-2 rounded-sm p-1.5 text-sm` · 아이콘 16(**전 항목 표는 §6.8**) · 글자는 `text-foreground`(캔버스가 거의 흰색이라 §2.2의 muted 표면 문제가 없다) |
| **개수 배지** | ⚠️ **`Projects` 하나에만 붙는다** (8-3). 그 값은 셸이 **이미 조회한** 멤버십 배열의 길이라 왕복이 0이다. 시안의 나머지 셋(Sources·Translations·Members)은 프로젝트별 집계라 **모든 페이지에 왕복을 더한다** — PRODUCT §7.7 결정 5가 거절했고 §8이 🔒로 다시 열어 둔 항목이다. ⚠️ **`0`도 보인다** — `undefined`와 다르다: 프로젝트가 없다는 사실이 정보이고, 화면이 `badge && …`로 쓰면 0이 falsy라 조용히 사라진다 |
| **구역 둘** | ⚠️ **축이 둘이라 구역이 둘이다** (PRODUCT §7.7). 순서는 **사용자 축 먼저**(`Projects`·`Account`) → **프로젝트 축**. ⚠️ **라벨이 이름 그대로다** (8-3 — 시안): 사용자 축은 **사용자 이름**, 프로젝트 축은 **프로젝트 이름**. 6b-4의 `Your work` 라벨과 6a의 프로젝트 스위처를 **함께** 대체했다. 라벨은 `<p data-zone-head>` `text-foreground flex items-center gap-2 p-1.5 text-sm font-medium`이고, 둘째 구역만 `border-t border-border pt-2`. ⚠️ **라벨 앞에 대상의 얼굴이 선다** (2026-09-24 사용자): 사용자 구역은 `Avatar` 16(원, 세션 사진 → 이니셜 폴백), 프로젝트 구역은 `ProjectThumbnail` `size={16}`(라운드 사각 radius 8, 글리프 12 — 이미지 없으면 이름 색 폴백). 모양이 대상을 말한다(§6.4). ⚠️ **얼굴이 아래 항목 아이콘과 같은 규격이다** (2026-09-25 사용자 — 24 · `px-0.5 py-1`에서 내렸다): 16 · `p-1.5` · `gap-2`가 항목과 같아서 **머리 라벨과 항목 라벨의 시작점이 한 세로선**에 서고 줄 높이도 같은 32다. 중심만 맞추던 옛 판정은 라벨 시작점이 4px 어긋났다. `sidebar-identity.test.tsx`가 그 규격을 고정한다. 썸네일 값은 `loadMemberships`의 `image`가 레이아웃을 지나 `NavProject.image`로 온다. ⚠️ **`<nav>` 둘이 `aria-label`을 든다** — 라벨이 `<p>`라 접근성 트리에서 이름이 아니다 |
| **스위처가 없다** | ⚠️ 8-3이 지웠다 (시안). 프로젝트를 옮기는 길이 **목록 하나**로 통일됐고, `New project`를 사이드바에서 뺀 것과 같은 방향이다 — 진입점이 하나면 "어디서 눌렀나"에 따라 다른 곳에 착지할 수 없다. 그와 함께 `DropdownMenuItem asChild`의 실사용이 셸에서 사라졌다(규칙과 그 테스트는 그대로다) |
| 사용자 축 항목 | **Projects**(`Box`, 개수 배지) · **Account**(`CircleUser` → `/account`). ⚠️ **라벨이 2026-09-23에 `Settings`에서 바뀌었다**(사용자) — 시안(8-3)은 `Settings`였으나 같은 사이드바의 `Project settings`와 축만 다른 동의어라 어느 설정인지 되묻게 했고, `Account`는 라우트·아이콘과 같은 낱말이다. ⚠️ **아이콘 둘이 2026-09-11에 바뀌었다**: Projects는 **목록 행 타일과 같은 글리프**(같은 대상을 두 글리프로 가리키지 않는다), 계정 항목은 **헤더 서랍 안 같은 항목과 같은 글리프**(`Settings` 톱니는 프로젝트 설정이 쓰므로 사용자 축과 섞인다). ⚠️ **`New project`가 없다** (8-3) — 라우트는 그대로라 URL로는 열린다. ⚠️ **유저 메뉴도 같은 `Account` 문구를 쓴다** — 한 곳을 가리키는 이름이 둘이면 그중 하나가 낡는다 |
| 프로젝트 축 항목 | **Home**(`House`) · **Sources**(`Files`) · **Translations**(`Languages`) · **Members**(`Users`) · **Logs**(`History`) · **Project settings**(`Settings`, `project:settings` 역할만). Sources가 Translations 앞이다 — 소스 구성·언어 상태를 확인한 뒤 번역으로 간다. |
| 활성 판정 | ⚠️ **규칙이 축이 아니라 항목에 붙는다** (6b-6 — `NavItem.exact`). **접두인 것 셋**: Sources·Translations·Members·Project settings 중 하위 경로가 있는 것들. **정확히 일치인 것**: Home(`/projects/<slug>`는 그 프로젝트 **모든** 하위 라우트의 접두다) · **Logs**(하위 라우트가 없다 — `?cursor=`는 쿼리다) · Projects(`/projects`가 `/projects/new`의 접두다) · Account |
| 하단 전역 | **Docs**(`CircleHelp` → `/docs`) · **Sign out**(`LogOut`). 라우트가 아니라 "앱을 벗어나는 것"이라 구역 밖 `mt-auto`다. ⚠️ **`<nav>`가 아니다** — 둘의 성격이 갈려(문서 링크 / 폼 제출) 하나로 묶을 이름이 없다. ⚠️ **라벨이 그 화면의 제목과 같은 키다**(`m.publicDocs.docs.title`) — 2026-09-11까지 `nav.help: "Help"`로 갈려 있었고, 같은 라우트를 가리키는 라벨이 둘이면 하나가 낡는다. 그 화면의 본문은 2026-09-24에 섰다(L2.3). ⚠️ **Collapse는 사라졌다** |
| 콘텐츠 패널 | `components/shell/content-panel.tsx` — **`<main>`**이고 `flex min-w-0 flex-1 flex-col **overflow-hidden** rounded-xl border border-border-subtle bg-background shadow-low`. ⚠️ **스크롤이 패널이 아니라 본문에 있다** (2026-09-11) — 패널이 통째로 스크롤하면 제목·툴바가 콘텐츠와 함께 올라가는데 그 둘은 "지금 보고 있는 것이 무엇인지"를 말한다. 형제 둘이 그것을 가른다: **`PanelHeader`**(`shrink-0`) · **`PanelBody`**(`min-h-0 flex-1 overflow-y-auto`). `head` prop이 아닌 이유는 라우트 넷 중 셋이 패널을 **레이아웃**에서 드는데 레이아웃은 페이지 props를 못 받아서다. 여백과 폭 상한은 **§5.15가 정본이다** — 둘 다 그 프리미티브가 들고 화면이 적지 않는다(⚠️ **폭 상한은 안쪽 래퍼가 든다** — 스크롤 컨테이너에 직접 주면 좁아져 스크롤바가 콘텐츠 옆에 생긴다). ⚠️ **본문 랜드마크를 이것이 든다 — 화면은 자기 `<main>`을 만들지 않는다**(라우트당 하나가 구조로 보장된다. 8-2에서 `/projects`가 실제로 그것을 잃었다). ⚠️ **넷이 함께 있어야 패널이 뜬다**(흰 배경·radius·border·그림자) — 8-1b가 그중 몇을 한꺼번에 잃고도 "그럭저럭" 보여서 못 알아챘다 |

**스크롤은 사이드바와 콘텐츠 패널이 각자 자기 안에서 든다**(둘 다 `overflow-y-auto`), 콘텐츠 패널엔
`min-w-0`이 함께 있어야 번역 표의 가로 스크롤이 사이드바를 밀지 않는다. 실측에서 문서 자체는 세로로
스크롤되지 않고 활성 스크롤러가 하나였다.

GitLab top bar의 검색·`+`·카운터 셋은 **넣지 않는다** — 대응물이 없고 PRODUCT §4.2가 기능 밀도를 막는다.
**Publish 버튼은 셸에 없다** — 번역 화면 **제목 행 우측**이고(8-4), Home의 머리에도 하나 있다. 버튼은 그 두 자리에 그대로 있고, **결과와 확인이 2026-09-16에 모달로 들어갔다**(§6.646).

전환 중 콘텐츠 패널 둘이 공존해도 폭을 나누지 않도록 셸 우측은 `grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)]`이다. 콘텐츠는 `isolate col-start-1 row-start-1`(스켈레톤 opacity 애니메이션의 쌓임을 패널 내부로 제한)이다. ⚠️ **둘째 열은 2026-09-16부터 비어 있다**(§6.55) — grid를 유지하는 이유는 그 열이 아니라 **전환 중 두 콘텐츠 패널이 같은 셀을 쓴다**는 것이고, flex로 되돌리면 한 프레임 동안 화면이 반으로 갈린다. grid 자체에는 gap을 두지 않아 빈 열의 간격이 남지 않는다. 패널 사이 간격은 8px 그대로다.

### 6.55 ~~프로젝트 패널~~ — **지웠다** (2026-09-16)

2026-09-10에 320px 골격으로 세웠다가 **한 번도 내용을 못 채우고** 지웠다. 담기로 한 둘이 각각 다른
주인을 찾았기 때문이다:

- `Changes`의 diff → **Publish 모달 `1a`가 요구하는 것과 같은 데이터**다(`design_handoff_publish_modal`
  §10-1). 두 자리가 같은 것을 두고 경쟁했다.
- `General`의 Publish 버튼·결과 → **그 모달이 가져간다**(같은 핸드오프 §4).

**남은 것은 빈 프레임과 아무것도 안 하는 세그먼트 컨트롤뿐이었다.**

⚠️ **지우면서 콘텐츠가 328(320 + gap 8) 넓어졌다.** 2026-09-16 실측(LNB 기본 240):

| 뷰포트 | 콘텐츠 패널 | 카드 컨테이너 | 카드 열 |
|---|---|---|---|
| 1280 (최소 대응) | 1016 | 642 | **2** |
| 1502 | 1239 | 865 | **4** |
| 1920 | 1655 | 908 | **4** |

⚠️ **패널 폭과 카드 컨테이너 폭은 다른 값이다** — 카드의 `@container`는 본문 grid의 **왼쪽 열**이라
패널에서 **374**(border 2 + `p-4` 32 + 메타 열 320 + gap 20)를 뺀다. 둘을 한 화살표에 묶어 적었다가
2026-09-16 리뷰가 잡았다. Home 카운트 카드가 **처음으로 4열을 밟지만 최소 대응 폭 1280에서는 여전히
2열**이고(그 `@[672px]` 쿼리는 2026-09-15에 고쳐졌는데 패널 때문에 임계값을 한 번도 못 넘었다 —
§6.64), 4열은 뷰포트 ~1310 위에서 시작한다.

**함께 지운 것과 남긴 것**

| 무엇 | 판정 |
|---|---|
| `components/shell/project-panel.tsx` · `m.common.panel.*` | 삭제 — 소비자 0 |
| `app/(edit)/projects/[slug]/layout.tsx` | **남긴다.** `ContentPanel` 한 겹만 든다 — 지우면 `[slug]` 아래 페이지가 각자 패널을 들게 되고 "라우트마다 정확히 하나"를 여러 자리에서 지켜야 한다 |
| `SegmentedControl` | **남긴다** — 온보딩 ②가 쓴다 |
| `ShellPanels`·`lib/shell/panel-size.ts` | **남긴다** — LNB 리사이저용이고 이 패널과 무관했다 |
| 셸 우측 `grid` | **남긴다** — 지키는 것이 그 패널이 아니라 **전환 중 콘텐츠 패널 둘이 같은 셀을 쓴다**는 것이다 |
| LNB 상한 320 | **남긴다** — 근거가 "우측 패널과 같은 값"에서 "넓힐 이유가 없다"로 바뀐다 |

`app/(edit)/__tests__/shell-layout.test.ts`가 **부재를 소스에서 센다**(사전 고아 포함) — 렌더 테스트는
"안 그린다"를 못 본다.

### 6.56 패널 리사이저 (2026-09-14)

**드래그로 폭을 바꾸는 구분선 둘** — 셸의 LNB ↔ 콘텐츠, 새 프로젝트 모달 ②의 후보 목록 ↔ 미리보기.
프리미티브는 `components/ui/resizable.tsx`이고 라이브러리는 `react-resizable-panels`다.
원본은 bugshot-2 로그 뷰어의 메인 리사이저이고, **시각·동작을 거의 그대로 가져왔다.**

| 요소 | 규칙 |
|---|---|
| **핸들 자체** | ⚠️ **투명하다** (`bg-transparent`). shadcn 기본은 `bg-border`라 1px 선이 **상시로** 보이는데, 이 화면들의 패널 경계는 이미 흰 패널의 border가 만들어 선이 두 겹이 된다. 보이는 것은 `::after` 하나뿐이다 |
| **시각 바** | `::after` **4px**(`after:w-1`), 스트립 한가운데(`after:left-1/2 after:-translate-x-1/2`), 위아래 끝이 페이드(`after:bg-gradient-to-b after:from-transparent after:via-ring after:to-transparent`) |
| **색** | ⚠️ **`via-ring`이다 — 원본의 `via-blue-300`이 아니다.** blue-300은 리포 전수 0건의 **미등재 raw 색**이고, `app/globals.css`가 그것을 **흰 배경 1.80:1이라 목측 뒤 버린** 색으로 기록하고 있다. 같은 색을 뒷문으로 들이지 않는다. `--ring`(blue-400)은 이미 등재된 토큰이라 **§6.2에 색이 늘지 않는다** |
| **표시 트리거** | ⚠️ **React state가 아니라 `data-*`다.** 라이브러리가 DOM에 쓰는 `data-resize-handle-state`(`inactive`/`hover`/`drag`)를 CSS가 직접 읽는다: `after:opacity-0 data-[resize-handle-state=hover]:after:opacity-100 data-[resize-handle-state=drag]:after:opacity-100` |
| **폭** | ⚠️ **핸들이 부모의 `gap-*`을 흡수한다.** flex `gap` **안에** 핸들을 형제로 끼우면 간격이 `gap + 핸들 + gap`으로 늘어난다. 그래서 부모의 `gap`을 떼고 핸들이 그 폭의 투명 스트립이 된다. **둘 다 `w-2`(8)다** — 셸은 옛 `gap-2`와 같아 간격이 그대로이고, **모달 ②는 옛 `gap-4`(16)에서 8로 좁혔다**(2026-09-14 사용자 확정). ⚠️ **`files.tsx`의 `FILES_PANEL_WIDTH = 736 − 8`이 이 값을 따라간다** — 16으로 두면 좌측 기본이 240이 아니라 242로 서고, 그 3px은 화면에서 안 보인다 |
| **히트 영역** | ⚠️ **CSS가 아니다.** 라이브러리가 document의 pointermove에서 핸들 rect에 마진을 얹어 판정한다(기본 `fine: 5px` / `coarse: 15px`). 그래서 시각 4px이어도 잡히고, `hitAreaMargins`를 **덮지 않는다** |
| **커서** | ⚠️ **핸들에 `cursor-*`를 쓰지 않는다.** 드래그가 시작되면 라이브러리가 `document.head`에 `<style>`을 꽂아 `*{cursor: ew-resize !important}`를 건다 — 포인터가 핸들을 벗어나도 커서가 유지되는 이유가 이것이고, 클래스는 먹지도 않으면서 "여기가 커서의 출처"라는 거짓 단서만 남긴다 |
| **포커스** | 핸들은 `role="separator" tabindex="0"`이라 포커스를 받는다 — §7의 링 셋을 그대로 든다. ⚠️ **접근 이름을 붙인다**(`m.common.resizeSidebar` · `m.newProject.files.resize`) — 라이브러리는 이름을 만들어 주지 않아 스크린리더가 "separator"로만 읽는다 |
| **치수** | 둘 다 **min 200 / default 240 / max 320**. 상한 320은 2026-09-16까지 우측 프로젝트 패널과 맞춘 값이었고(§6.55), 패널을 지운 뒤에도 유지한다 — 넓혀야 할 근거가 새로 생긴 것이 아니고 올리면 가장 좁은 뷰포트에서 콘텐츠가 함께 줄어든다 |
| **폭 영속화 없음** | `autoSaveId`(localStorage)를 쓰지 않는다 — SSR에서 첫 페인트가 `defaultSize`로 그려지고 저장값으로 점프한다. **세션 내 리사이즈만** 하고, 필요해지면 쿠키로 붙인다 |

⚠️ **`minSize`·`defaultSize`·`maxSize`는 % 전용이다** (v2에 px 짝이 없다). 셸은 그룹 폭이 뷰포트를
따르므로 **`ResizeObserver`로 재고 px→%로 환산한다**(`lib/shell/panel-size.ts` — 순수 함수) —
고정 %를 박으면 2560 디스플레이에서 LNB가 486px이 된다. 모달 ②는 **그룹 폭이 항상 728**이라
(`max-w-[800px]` − `px-8` 64 − 핸들 8) 재지 않고 모듈 상수로 굳힌다.

⚠️ **분모가 그룹 폭이 아니라 "핸들을 뺀 폭"이다** — 라이브러리는 패널에 `flex-basis: 0` +
`flex-grow: <size>`를 걸고 핸들은 **자기 폭을 가진 별도 flex 항목**이다.

⚠️ **재기 전에는 LNB를 px로 못박는다** — SSR은 뷰포트를 모르므로 %가 거짓이고, 그 상태로 그리면
큰 모니터에서 LNB가 **하이드레이션이 끝날 때까지** 부풀어 있는다(한 프레임이 아니다).

### 6.6 설정 (`/projects/[slug]/settings`) — 카드 넷 (2026-09-22 Sources)

활성 프로젝트는 **General → Repository → CI integration → Archive project**다.
보관되면 Restore 카드가 첫 자리이고 나머지 편집 컨트롤은 사유와 함께 비활성이다. 페이지 거부(`?e=`)는
카드 밖 Alert, 카드 결과는 inset Alert, 필드 오류는 안정된 ID·`role="alert"`·장식 아이콘 14로 구분한다.
⚠️ **연 채로 다른 탭이 보관하면** (2026-09-24, QA D1) 그 뒤 누른 쓰기의 `archived` 거부가 세그먼트를 다시 그려 화면이
보관 상태로 옮겨 간다. 거부 문구는 공용 `errors.access.archived`("설정에서 복원하라")가 아니라 다른 행과 같은
`settings.archivedReason`이고(`settingsAccessMessage`), 보관 상태가 오면 그 행의 옛 오류·거부된 입력은 내린다.

공유 `PanelCard`는 radius 12 · `@container` · 머리 padding 16 · 제목 15/500이다. 헤더↔본문은
`border-divider`, 행↔행은 `border-border`다. 제목 없는 사용은 헤더와 `aria-labelledby`를 생략한다.
활성·보관 상태 모두 이름 있는 설정 region 넷을 유지한다. 본문 폭은 기존 limited PanelBody 규칙을 따른다.

| 카드 | 계약 |
|---|---|
| General | 썸네일 56/radius 8/`object-contain`, PNG·JPEG 3MB, Upload·Remove는 작업 중 함께 잠기고 실행한 버튼에만 스피너. 저장 이미지는 목록·Home·초대에도 쓰며 null은 기존 Box 폴백이다. Name은 320×36·최대 200자, 성공 후 입력 원문을 보존하고 다음 입력까지 Saved. Address는 320×36·sans·읽기 전용이며 Copy 버튼이 없다. 키보드 선택·복사를 위해 Tab 진입은 유지한다. 각 사실 행 padding 14/16, 라벨 열 96 |
| Repository | 리포명은 sans. 건강성 일곱 갈래: ok / not-connected / app-uninstalled / installation-changed / repo-moved / repo-replaced / unknown. 해제·설치 변경·리포 대체는 카드 전폭 danger, 이동은 warning. unknown을 해제로 단정하지 않는다. 재연결 버튼은 연결 가능한 갈래에만 선다. Base branch는 온보딩과 같은 목록 `Select`(240×36)다. 저장된 현재값을 초기 선택으로 보존하고, 목록에 없어도 임의로 바꾸지 않는다. 조회 중에는 Skeleton과 비활성 Save, 실패 시 현재값과 오류 안내를 표시하고 저장을 막는다. 300개 초과 시 온보딩과 같이 `Input`으로 전환한다. 보관 상태에서는 조회하지 않고 현재값을 표시한다. ⚠️ **그 행의 안내 캡션은 `text-foreground/60`이다** (2026-09-23 실측 — muted 면 위 `text-muted-foreground`는 4.35:1로 AA 미달, 온보딩 ①과 같은 판정). 오류 캡션은 `text-destructive` 그대로다. ⚠️ **Name·Base branch의 [Save]는 저장된 값과 다를 때만 켜진다**(이름은 앞뒤 공백을 접어 비교한다). ⚠️ **이 꺼짐은 §6.65 `aria-disabled` 규칙의 예외다** — 저장할 것이 없다는 것 외에 사유가 없고, 같은 버튼이 저장 중에는 `loading`으로 진짜 `disabled`를 걸어 한 버튼에 두 형이 섞이지 않게 한다. ⚠️ **Base branch 행은 카드 안의 `bg-muted` 면이고, 라벨은 `GitBranch` 14 + `text-sm font-medium` `--foreground`다** (2026-09-23 사용자) — 새 프로젝트 모달 ①의 `BranchLabel`과 같은 모양이다. 폼이 `pl-10`으로 들여 써 행 시작선이 위 리포 이름(16 + 칩 28 + gap 12 = 56)과 같다 — 모달의 `pl-20`과 같은 원리다. ⚠️ **이 행은 공용 96 라벨 열(`PanelFacts`)이 아니다** — 아이콘 + 라벨이 약 102라 96 열에서 flex가 아이콘을 7.6으로 눌렀다(실측). 라벨이 제 폭을 갖는 flex 행이고, 640 미만에서는 라벨이 위로 올라간다. GitHub account 독립 카드는 없고 재인가 안내와 `/account` 링크 한 줄이다 |
| CI integration | Push token 행과 Workflow file 행, 그 아래 **Sources 안내 한 문장**(`One workflow covers every source. Add or change sources in [Sources].` — 시안 §13-2). ⚠️ **낱말 하나로 두지 않는다**(2026-09-23 실측 — `Sources`만 서서 무엇으로 가는 링크인지 안 읽혔고, 테마에 없는 `text-link` 클래스라 색도 없었다). 링크는 `text-blue-600`. 토큰 원문은 발급 응답에만 남고 저장 즉시 리포 secret을 갱신하라는 안내를 유지한다. 카드에 YAML `<pre>`를 두지 않는다. 워크플로 모달은 1024×640(작은 화면은 가용 높이 상한), 코드만 스크롤하며 훅 안내 포함. SHA가 없는 소스 안내는 CI 설정 검증이 아니다 |
| Archive / Restore | 보관 확인 Dialog는 Cancel에 최초 포커스, 열린 PR 문자열/null/조회 실패 삼상태를 구분한다. ⚠️ **카드의 [Archive project] 트리거도 `danger`다** (2026-09-23 사용자 — 확인 창을 열기 전에 파괴적이라는 신호가 서야 한다). 복원은 `default`이고 확인 없이 실행. 보관 성공 후 카드 전환이 결과 피드백이다. 보관 일시는 표시하되 저장하지 않는 보관자 이름은 만들지 않는다 |

소스 추가 모달은 Sources가 소유한다(§6.66). Settings에는 워크플로 모달만 남는다.
`/settings?add=sources`·`/surfaces/new`는 `/sources?add=sources`로 보내며 OAuth 오류 `e`를 보존한다.

워크플로 모달은 포커스를 원래 트리거로 돌린다. pending은 `aria-busy`와 14px 스피너, 라벨은 유지한다.
카드 폭 **640 미만**에서 라벨은 값 위(간격 6), 필드는 남는 폭, 보조 문구는 아래, 사실 행 버튼은 본문
아래로 옮긴다. 머리 설명도 제목 아래로 내려간다. 뷰포트 분기는 추가하지 않는다.

### 6.61 공개 장문 문서 (`/privacy`·`/docs`) — 셸 밖 1열 (2026-09-19, launch-readiness L2.0)

**시안이 없다.** `public-doc.tsx`의 옛 주석이 가리키던 "8-1b 시안"은 존재한 적이 없고, 그래서
**이 절이 그 화면의 정본이다** — 여기 표를 고치는 것이 시안을 고치는 것이고 구현이 따라간다
(POSTMORTEM 2026-09-15 "시안 없이 만든 화면이 네 곳에서 어긋났고 4,039개가 green").

⚠️ **본문은 사전(`messages/en.tsx`)이 든다 — 마크다운 파일로 빼지 않는다.** 클라이언트 번들에 실리는 대가가 있지만, 빼면
`no-korean-ui`·`brand-spelling` 스캔과 방침 게이트(ARCHITECTURE §6.035)의 대상 밖으로 나간다.

**읽는 화면이지 조작하는 화면이 아니다.** 셸 밖이고 패널도 카드도 없다 — §6.62의 2열 골격을
가져오지 않는다(그쪽은 폼이 주인공이고 우측이 장식이다). 골격은 본문 한 컬럼과 나가는 링크
하나이고, **그 컬럼 안에 서는 표면은 표 하나뿐이다**(2026-09-19 privacy — 수집 항목과 쿠키를 문단으로
접을 수 없다). 조작 어포던스는 여전히 0이다 — 표에도 hover 강조를 주지 않는다.

| 요소 | 규칙 |
|---|---|
| 골격 | `main` 한 겹 · `mx-auto max-w-2xl px-8 py-12` · `min-h-svh`. ⚠️ **세로 중앙 정렬을 쓰지 않는다** — placeholder 시절의 `justify-center`는 한 문단짜리라 참이었고, 절이 여럿인 문서에서는 **첫 화면이 문서 중간부터 시작한다.** 위에서 시작한다 |
| 제목(`h1`) | `text-2xl font-medium` — 셸 밖 제목 규칙(§4, §6.62의 `h1`과 같은 급). ⚠️ **`text-lg`에서 올라왔다**(2026-09-19) |
| 시행일 | **선택 — `/privacy`만 쓴다.** `h1` 바로 아래·도입 문단 **위**에 `라벨 + <time dateTime="YYYY-MM-DD">` 한 줄, 라벨은 `Effective date`, 급은 `text-muted-foreground text-sm`. ⚠️ **본문의 muted 금지가 이 줄에는 안 걸린다** — 읽으라고 만든 글이 아니라 메타 줄이라 보조 색이 맞다. ⚠️ **날짜 포맷터를 새로 만들지 않는다** — 사전이 든 `"2026-09-19"`를 그대로 보이고 같은 문자열을 `dateTime`에 넣는다(`lib/utc-time.ts`의 `utcMinute`은 분까지 내므로 안 맞는다). ⚠️ **이 줄은 `<section>` 밖이라 본문 링크 규칙(`[&_a]:`)이 안 걸린다** — 색이 다르다고 고치지 않는다. 도움말(`/docs`)에 시행일은 의미가 없어 없으면 아무것도 그리지 않는다 |
| 도입 문단 | `h1` 바로 아래 한 문단(선택). 절 제목 없이 문서 전체를 한 줄로 말한다 |
| 절 제목(`h2`) | `text-base font-medium` + **`id`가 필수다** — `/docs#workflow`처럼 **다른 화면이 절을 직접 가리킨다**(L2.3의 설정 화면 링크). `id`는 사전의 데이터이지 제목에서 파생하지 않는다(문구를 고치면 남의 링크가 죽는다) |
| 본문 | `text-sm leading-6 text-foreground`. ⚠️ **`text-muted-foreground`를 쓰지 않는다** — 그 색은 라벨·보조 줄의 색이고, 한 화면이 통째로 그 색이면 **읽으라고 만든 글이 부차적으로 보인다.** 장문에서만 `leading-6`을 쓴다(기본 행간은 표·라벨 기준이라 문단에는 좁다) |
| 문단 사이 | `space-y-3`, 절 사이 `space-y-8` — 절의 경계가 제목 굵기가 아니라 **빈 자리**로 읽혀야 한다(쓰는 weight가 400·500 둘뿐이라 §4) |
| 목록 | `<ul>` `list-disc pl-5` + 항목 사이 `space-y-1`. 법적 문서의 열거는 문단으로 접지 않는다 |
| 표 | `components/ui/table.tsx` 재사용 + **`scrollable={false}` + 그릇이 스크롤 `div`를 직접 든다**(온보딩 ②와 같은 형, §6.643) — ⚠️ **컨테이너 자체는 필수다**: 바깥에 스크롤을 받을 것이 없는 유일한 화면이라 없으면 3열 표가 페이지를 가로로 밀고 중앙 정렬 본문까지 어긋난다. **프리미티브의 래퍼를 안 쓰는 이유는 그것이 `role`·`aria-label`을 안 받아서다** — 한 소비자를 위해 프리미티브의 API를 넓히지 않는다. 그 `div`에 `role="region" tabIndex={0} aria-label`(표 안에 포커스 가능한 것이 없어 컨테이너가 직접 받는다 — 키보드로 가로 스크롤할 길이 그것뿐이다). ⚠️ **같은 이름을 `<table>`에도 준다** — 래퍼의 이름은 랜드마크의 이름이고 **스크린리더의 표 목록은 `<table>` 자신의 이름을 읽는다**(2026-09-19 CDP 실측: 래퍼에만 걸었을 때 `role=table, name=""`이었다). 열 머리는 **`Th`가 아니라 `TableHead`** + `scope="col"`을 그릇이 직접 박는다: `Th`의 `sticky`는 스크롤 컨테이너가 표 자신뿐이라 무의미하고, `bg-muted/50` + `text-foreground/60`은 **§2.2·§7에 AA 미달로 등재된 조합**이라 법적 고지에 심을 자리가 아니다. 배경은 불투명 `bg-primary-foreground`. **`TableRow`의 hover 강조는 되누른다.** ⚠️ **좁은 폭에서는 표가 자기 컨테이너 안에서 가로 스크롤한다** — 1차 독자가 초대 링크를 폰에서 여는 비개발자이고 320px에서 본문 폭이 256px다(§5의 "최소 1280"은 셸의 `min-w-[1280px]`에 걸린 규칙이라 이 화면에는 없다) |
| 본문 안 링크 | `text-blue-600`, **밑줄·글리프 없음**(§6.3 셸 밖 규칙). ⚠️ **클래스는 래퍼의 `[&_a]:` 변형이 건다** — 사전(`messages/en.tsx`)은 잎이라 컴포넌트를 import할 수 없어 `<a>`를 맨몸으로 내놓는다. 리포 밖으로 나가는 링크는 사전이 `target`·`rel`을 직접 단다 |
| 복귀 링크 | 본문 **아래** 한 줄, `text-blue-600`. ⚠️ **세션으로 갈린다** — 로그인 상태면 `/projects`("Back to projects"), 아니면 `/signin`("Back to sign in"). 사이드바 `CircleHelp`→`/docs`(§6.5)로 들어온 사람에게 "Back to sign in"만 주면 **나가는 길이 로그아웃처럼 보인다.** 세션을 못 읽는 장애(`unavailable`)는 `/signin` 쪽이다 — 공개 문서가 세션 장애로 안 열리는 것이 더 나쁘다 |
| 새 색 | **0이어야 한다** — 이 화면이 §6.2에 더하는 raw 색은 없다 |

⚠️ **내용은 사전이 데이터로 든다** — `{ id, heading, blocks }`이고 `blocks`는 문단·목록·표 셋이다.
그릇이 마크업과 클래스를 전부 들므로 **사전에 클래스가 새지 않는다**(§10과 같은 경계: 사전은 문구,
그릇은 형).

### 6.62 로그인·초대 수락 — 셸 밖 2열 (2026-09-10, 8-1)

**골격을 `components/signin/auth-layout.tsx` 하나가 든다.** 캔버스(`--canvas`) 위에 패널 둘이
`grid-cols-2 gap-2 p-2`로 앉고, 각 패널이 `rounded-xl` + `border-border-subtle` + `shadow-low`다
(규약 3.5 — 셸과 같은 규칙이다, §5.1).

| 요소 | 규칙 |
|---|---|
| 좌측(폼) | **true white** · 폼 컬럼 `w-[320px]` · 로고 48 · `h1` `text-2xl font-medium` · provider 버튼 둘(`size="lg"` — **셸 밖 전용**, §6.4). ⚠️ **`h1`이 셋 다 있다** — `/invite/[token]`은 2026-09-12까지 이 칸이 비어 있던 유일한 화면이었고(설명 한 줄이 제목을 겸했다), account-linking이 그 규칙 위반을 교정했다 |
| 우측(장식) | base가 **페이지 배경색**이고 아래로 갈수록 파랑이 든다(`--auth-hero-from` = `--canvas`, `bg-gradient-to-b`). ⚠️ **그라데이션이 없으면 배경과 구분되지 않아 "로그인 패널만 떠 있는 그림"이 된다** — 그것이 의도이므로 위쪽에서 배경으로 수렴한다. 위·아래 문구가 **`text-3xl font-medium`**이고 그 사이가 키비주얼(`max-w-[768px]`)이다 — ⚠️ **리포에서 `text-3xl`을 쓰는 유일한 자리이고 셸 안으로 넓히지 않는다**(§4의 크기 관용은 `text-2xl`에서 멈춘다: 이 화면만 장식 면적이 있다) |
| 도트 필드 | Canvas 2D (`components/signin/dot-field.tsx` + 잎 `lib/signin/dot-field.ts`). ⚠️ **hex를 tsx에 박지 않는다** — `--signin-dot`을 `getComputedStyle`로 읽는다(§6.2). ⚠️ 커서가 없으면 `autoCursor`가 ㄹ자로 순회하고 `prefers-reduced-motion`이면 1회 렌더 |
| 브랜드 아이콘 | GitHub·Google 인라인 SVG (`components/signin/brand-icons.tsx`) — ⚠️ `lucide-react`에 브랜드 글리프가 없고 **Google 4색은 §6.2의 예외다**(남의 브랜드 자산이라 토큰으로 접을 수 없다) |
| 피드백 | `?error=`·`?sessions=` → **토스트** (§6.25). ⚠️ **`auth-toast`는 아무것도 렌더하지 않는다** — 자리를 차지하면 그것이 곧 인라인 Alert의 자리가 된다 |
| 초대 복귀 링크 (2026-09-12) | provider 화면에서 취소하면 Auth.js가 `/signin?error=`로 되돌리고 **초대 토큰이 사라진다.** `authjs.callback-url`이 초대를 가리킬 때만 provider 버튼 **아래·약관 위**에 `text-blue-600` 텍스트 링크 한 줄을 세운다(§6.3의 셸 밖 링크 규칙). ⚠️ **버튼으로 만들지 않는다** — 이 화면의 primary는 로그인이고, 돌아가는 길은 `/privacy`·`/docs`의 그것과 같은 무게다 |
| 초대 수락 | 같은 골격. **실패는 모두 인라인 `Alert`**다 — 이 초대의 지속되는 조건이므로 규약 8을 적용한다(예외 추가 아님). `planInviteView`의 `kind`가 알림과 CTA를 함께 고른다. `blocked`는 재시도 가능한 장애에만 토큰 보존 GET 버튼이고, 재시도 없는 막힘(없음·만료·사용됨)은 **출구 하나**다 — 로그인했으면 [Go to your projects](`/projects`), 아니면 [Sign in](`/signin`) (2026-09-24, audit #15 — 셸 밖이라 전엔 할 수 있는 일이 0이었다), `sign-in`은 provider 둘과 하단 캡션, `accept`는 프로젝트 카드와 수락, `wrong-account`는 프로젝트 카드와 **출구 하나**인데 그 출구가 사유로 갈린다 — `email-mismatch`는 [Sign in with another account](로그아웃 → 같은 링크), `already-member`는 **[Open project]**다. ⚠️ **뒤엣것에 로그아웃을 주지 않는다** (2026-09-12 실물 검증): 문구는 프로젝트를 열라는데 유일한 버튼이 세션을 끊는 것이었고, 이 화면은 셸 밖이라 시키는 일을 할 수단이 0이었다. 만료가 불일치보다 앞이고 불일치가 기존 멤버보다 앞이다. 알림은 설명 아래·카드 위, 비로그인에는 프로젝트 카드가 없다. provider 버튼은 `/signin`과 같은 `ProviderSubmit`·브랜드 아이콘·문구를 쓰고 GitHub이 `primary`다. |
| 계정 병합 (2026-09-12) | 같은 골격 · 320 컬럼 다섯 줄(로고 · `h1` · 설명 · `EntityCard` · 채움 버튼 + 각주) + 구분선 아래 outlined 버튼. ⚠️ **실패는 기본 상태 + `Alert variant="danger"` 한 장이 전부다** — 부제·각주·구분선·버튼 라벨이 그대로다(실패에서 레이아웃을 갈아치우면 같은 화면으로 돌아온 것을 못 알아본다). 자리는 설명 **아래**, 카드 **위**. ⚠️ **§6.25 Layer A가 아니라 의도적 예외다** — 빼도 화면이 안 비지만, **메시지와 조치가 한 자리에 있어야** 한다: 다시 누를 버튼이 바로 아래이고 토스트는 그 둘을 화면의 반대 끝으로 가른다. ⚠️ **만료는 이 화면을 다시 그리지 않는다** — `/signin`으로 되돌린다(다시 그리면 그 상태가 또 하나의 표면이 된다) |

### 6.63 프로젝트 목록 (`/projects`) — 그룹 **카드** 셋 + 행마다 Meter (2026-09-15 2차 재설계)

**LocaleMeter의 공유 소비자는 Projects와 Sources다.** `components/locale-meter.tsx`로 값 변경 없이 이동했다.
완료/검토 막대 클래스·국기·aria-hidden은 동일하고 두 번째 막대 구현은 만들지 않는다.


**시안이 둘이고 뒤엣것이 이긴다.** 행의 규격은 `design_handoff_projects_list/Projects.dc.html`
(2026-09-13)이 정본이고, **그것을 담는 그릇**은 `design_handoff_projects_panel_rework/Projects v2.dc.html`
(아트보드 `1a` 목록 3건 · `1b` 프로젝트 0건 · `1c` 검색 결과 · `1d` 결과 없음)이 정본이다.
**아래 값은 그 캔버스의 인라인 스타일에서 인용했고 브라우저 computed style로 대조했다** — 어긋나면
구현이 틀린 것이지 시안이 융통성 있는 것이 아니다.

⚠️ **2차가 되돌린 결정 넷**: 머리의 Summary 넷(삭제) · PageTitle 20→18 · 그룹 헤더가 카드 **밖**
14/500 줄 → 카드 **안** 16 padding·15/500 · 빈 상태의 KV 합성 → 카드 하나. 아래 표에서 그 자리는
새 값으로 덮여 있다.

**fluid다** — `max-w-4xl`이 아니다. 이름 칸 420 + Meter 셋 + 우측 배지가 896px에서는 겹친다.
**머리·본문의 여백과 폭 등급은 이 화면이 정하지 않는다 — §5.15가 정본이다**(둘 다 16, `width="fluid"`).

⚠️ **필터 탭 여섯이 사라졌다.** 3건짜리 목록에 여섯 칸이면 넷이 빈 탭이고, 빈 탭을 누른 사람은
프로젝트를 잃었다고 읽는다 — 그 빈 화면의 문구가 이미 그 사고를 전제로 쓰여 있었다. 상태 구분은
**그룹 헤더**가 하고 "그 상태가 0건"은 헤더의 카운트가 말한다. 되돌아올 조건은 정해져 있다:
`Archived`가 쌓이면 `All / Archived` **둘로만**이고 상태 다섯을 되살리지 않는다.

#### 치수표 — 이 화면이 정본이다

| 자리 | 값 | 실측 |
|---|---|---|
| 이름 칸 | `w-[420px] min-w-0 shrink-0` | 420 |
| Meter 칸 | `w-25`(100) · 칸 사이 `gap-4`(16) · 라벨↔바 `gap-1.5`(6) | 100 |
| Meter 바 | `h-1`(4) · `rounded-full` · 트랙 `bg-foreground/[0.08]` · 완료 `bg-foreground/85` · 검토 `bg-amber-500` | 4 |
| Meter 대체 문장 | `w-[332px] min-w-0 shrink truncate`(= 100×3 + 16×2) | 332 → 좁아지면 축소 |
| 행 | `gap-4 py-3.5 pr-3.5 pl-3` · hover `bg-foreground/[0.02]` | `14 14 14 12` |
| 행 글리프 | **`ProjectThumbnail`이 소유한다**(`components/projects/project-thumbnail.tsx` — Home 머리와 같은 컴포넌트다). `size-7 rounded-sm` + `toneFill` + 흰 `Box` 16 · **테두리 없음**(2026-09-25 사용자 — 2026-09-20의 `border border-border`를 걷었다. 이미지·폴백 두 갈래가 함께 없어 폴백 순간에도 같은 28로 보인다. `Avatar`·초대 카드 타일·설정 General 썸네일과 같은 판정이다). ⚠️ **radius가 8이고 캔버스의 4가 아니다** (2026-09-17 사용자 — 이 표에서 캔버스를 벗어난 유일한 값이다): 초대 카드의 같은 타일이 8이라(§6.4) 같은 대상이 화면마다 다른 모서리를 갖고 있었고, **세 화면을 한 값으로 모으는 쪽**을 골랐다 | 28 · radius 8 |
| 띠 | `py-2 pr-3.5 pl-14` · `border-t border-foreground/[0.06]` · `bg-foreground/[0.02]` · 13 | 좌측 들여쓰기 56 |
| 카드 | `rounded-lg`(12) + `border-border` + `overflow-hidden` | 12 |
| 카드 헤더 | `padding 16` · `h2 text-base font-medium`(15/500/0.015em) + 카운트 `Badge neutral`(gap 8). **hover도 링크도 없다** | `16` · `15` |
| 헤더↔첫 행 선 | `border-foreground/[0.06]` — 흰 배경 합성이 `#f0f0f0`이고 **행 구분선보다 한 급 약하다.** 그래야 "헤더 + 행들"로 읽힌다 | `#f0f0f0` |
| 행 사이 선 | **`divide-y`가 아니다** — 행마다 `border-t border-border`(첫 행은 위 줄이 이긴다) | `#e5e5e5` |
| 빈 상태 카드 | `padding 48 24` · `gap 14` · 칩 `size-9 rounded-sm bg-foreground/[0.04]`(36·radius 8) · 제목↔설명 `gap-1.5` · 제목 15/500 · 설명 14 `leading-relaxed` 46ch | 전부 실측 일치 |
| 폭 축소 | `@container`가 **행 목록(`<ul>`)**에 붙는다. `@max-[1120px]`→둘 · `@max-[940px]`→하나 · `@max-[760px]`→0 | 1200/1000/840/680에서 3/2/1/0 |
| 검색 폭 | **`w-64`(256)** — 시안 220의 **유일한 예외** | 256 |

⚠️ **폭 축소가 뷰포트가 아니라 컨테이너 기준인 이유**: 패널 폭은 뷰포트에서 사이드바 240·바깥
padding을 뺀 값이고 **LNB가 200~320으로 리사이즈되므로 같은 뷰포트가 두 폭을 만든다**(2026-09-16까지
근거에 '오른쪽 패널 320'이 함께 있었다 — §6.55). 셸이 `min-w-[1280px]`을 들어
뷰포트 브레이크포인트로는 1120·940·760이 **영영 안 밟힌다**(가로 스크롤이 먼저 생긴다).

⚠️ **앞에서부터 자른다.** 정렬이 base 먼저라 `nth-child`로 뒤를 숨기면 "하나만 남으면 기준 로케일"이
공짜로 성립한다 — 서버는 정렬된 셋만 주고 고르는 일을 하지 않는다.

#### ⚠️ 등재된 이탈 셋 — "px 하나까지 동일"의 예외는 여기 적힌 것이 전부다

1. **검색 폭 256**(시안 220). `SearchInput` 프리미티브가 폭을 소유하는 이유가 "두 툴바가 같아야
   한다"이고, 36px 때문에 그것을 열지 않는다. ⚠️ **그 파일은 `components/ui/` 밖에 남긴다**
   (`components/search-input.tsx`, §6.4) — `ui/`의 `Input`을 조립하고 URL 질의·IME 제출까지 아는
   **화면 컨트롤**이라, `ui/`로 옮기면 잎에 가까워야 할 그 디렉터리가 화면 계약을 들게 된다.
2. **빈 상태 칩의 글리프 16**(시안 18). §6.8이 아이콘 크기를 **넷(16·14·12·20)으로 고정**하므로 18은
   다섯째 값이 된다 — 36 칩 안의 2px이다.
3. **설명 줄 `leading-relaxed`**(1.625, 실측 22.75px — 시안 1.6 = 22.4px). Tailwind 스케일 밖의 임의
   치수를 만들지 않으려는 선택이다.

#### 요소

| 요소 | 규칙 |
|---|---|
| 머리 | **한 줄이다.** 제목 줄은 `h1 text-lg font-medium`(18) + 총계 `Badge neutral`(gap 8), `ml-auto`로 검색, 그 뒤 [New project] `primary`. 여백·선은 §5.15. ⚠️ **총계는 좁히기 전의 값이다** — 검색을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에 답하고, 배지가 `1`로 바뀌면 "하나 남았다"로 오읽힌다(실측 `1c`: 배지 4 고정 · 카드 카운트 2) |
| ~~Summary 넷~~ | ⚠️ **2026-09-15에 사라졌다** (PRODUCT §7.9). 못 누르는 숫자 넷이 머리 90px을 차지했고, 같은 값을 프로젝트별로 쪼갠 것이 이미 행의 Meter와 아래 띠다. **집계는 지우지 않았다** — `Project Home`이 카운트 카드 넷으로 받는다 |
| 그룹 | 셋이고 **접지 않는다** — 세 헤더가 이 화면의 목차다. **헤더가 카드 안에 있다**(`Project Home`이 이미 그 문법이다 — 카드가 자기 제목을 든다). **빈 그룹은 헤더를 만들지 않는다**(`Archived 0`이 상시로 서면 목차가 아니라 배경이 된다). ⚠️ **카드 바닥에 더 보기 링크를 두지 않는다** — `All logs`는 잘린 목록의 나머지로 가는 출구지만 이 카드는 그룹 전체를 이미 그린다. ⚠️ **`<ul>`/`<li>`를 유지한다** — 카드로 감싸면서 list role을 잃으면 스크린리더가 개수를 못 읽는다(CDP 실측: `list`·`listitem`). ⚠️ **검토 대기와 열린 PR은 `All set`이다** — 둘 다 "읽고 누르면 되는 것"이고, 손볼 것으로 올리면 정상 운영 중인 프로젝트가 상시 `Needs attention`에 남아 그 그룹이 의미를 잃는다 |
| 검색 | `?q=` — 이름만 훑는다. **검색 중에는 그룹을 접고 결과 카드 하나**가 된다(결과 1건에 헤더 셋이면 둘이 빈 카드가 된다). 그 카드의 헤더는 `Results for “{q}”` + 카운트 배지 + `ml-auto` `Clear search` 링크(14 · `#2563eb`)다. ⚠️ **문장에 수를 두지 않는다** — 카운트 배지가 건수를 들므로 옛 `1 of 3 projects match`는 같은 것을 두 번 말한다. ⚠️ **곡선 따옴표다**(`“ ”`) — 검색 0건의 제목과 같은 표기여야 한 화면에서 같은 것이 두 모양으로 안 보인다. ⚠️ **일치 구간은 이름에서만 칠한다** — `searchProjects`의 대상이 이름 하나라 리포 줄까지 칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다 |
| 행 | 좌에서 우로 글리프 · 이름 칸(이름 15/500 + 메타 14/muted) · Meter 묶음 · `ml-auto` 우측(배지 + `chevron-right` 16). ⚠️ **메타가 `owner/repo`다** — `https://github.com/`는 행마다 같아서 아무것도 안 가른다. ⚠️ **`ml-auto`가 우측 묶음에만 붙는다**: 이름 칸 420 고정 + Meter 좌측 정렬 + 우측 `ml-auto`가 "흔들리는 것은 빈 공간뿐"을 만드는 장치이고, 셋 중 하나만 빠져도 칩의 x가 행마다 달라진다 |
| Meter | 행당 최대 셋. 정렬은 **base 먼저 → 코드순**. 라벨은 국기(`LocaleFlag` 16×11 · radius 2) + 코드 + `ml-auto` 퍼센트. ⚠️ **퍼센트는 `done + review`다**(캔버스 `1c`: 84 + 8 → 92%) — 검토를 기다리는 값도 **채워진 칸**이고, 바가 그중 얼마가 아직 검토 전인지를 amber로 말한다. 라벨을 `done`만으로 내면 그 값이 화면에서 미번역과 구별되지 않는다. ⚠️ **두 구간은 겹치지 않는다**(`done`에 검토 대기가 없다) — 겹치면 폭 합이 트랙을 넘는다 |
| Meter 자리의 문장 | 값이 없는 상태(`setup`·`awaiting_first_sync`)는 **0% 바가 아니라 문장**이다 — 빈 바는 "0% 번역됨"으로 읽히는데 그 프로젝트는 아직 셀 것이 없다. 넷: `Waiting for the first sync.` · `Syncing translation files.` · `Nothing synced yet.` · `Connect the GitHub App to continue.` ⚠️ **이미 적재된 프로젝트의 실패는 바를 지우지 않는다** — 데이터가 있는데 문장으로 덮으면 "번역이 사라졌다"로 읽힌다(그 사실은 띠가 말한다) |
| 띠 | 행의 **형제**다(`<a>` 안이 아니다 — 링크를 중첩할 수 없다). **상태를 설명하지 않고 다음 한 수를 쓴다**, 링크는 하나까지. 겹치면 **하나만**: 끊김·임포트 실패가 모든 것을 덮고, 그 아래는 발송 > 원격 변경 > 검토. ⚠️ **보관 행에는 어떤 사건이 겹쳐도 띠가 없다** — 멈춘 프로젝트에 "지금 뭘 하면 되나"는 답할 질문이 아니다 |
| 띠의 역할 분기 | **링크 둘만 갈린다**(`Reconnect`·`Continue setup`) — 둘 다 `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다. ⚠️ **가져오기 실패의 `View details`는 역할과 무관하다** (2026-09-24, audit #6 — 사용자 결정): 목적지가 Settings에서 **Sources**로 바뀌었고 Sources는 `translation:write`라 EDITOR도 열어 사유를 읽는다. 재시도만 OWNER 몫이라 EDITOR의 사유 문장 끝이 `Only project owners can try it again.`이다(Home 할 일 카드의 같은 행도 같다). 그 자리에는 "누가 할 수 있는지"를 말한다. ⚠️ **문장 자체는 역할과 무관하다** — 시안의 Editor 전용 문구(*"24 edits are waiting for an owner to send them."*)는 버렸다: PRODUCT §3이 **EDITOR에게도 Publish를 허용**하므로 그 문구는 화면이 권한을 실제보다 좁혀 말하는 것이다. ⚠️ **판정은 호출부가 하고 `rowBanner`는 역할을 안 받는다** |
| 상태 배지 | **항상 하나**이고 갈래 다섯은 그대로다(`projectStatus`). 칩만 `px-2`이고 총계·그룹 카운트는 `px-1.5` 그대로다(`min-w-5`가 이겨야 원형이 된다). ⚠️ **무색 배지의 글자색이 갈린다**: 보관 **`#a3a3a3`**(2026-09-20 — 아래) · `Setup`·`Pending` `#525252` · 총계·카운트는 foreground. **호출부에서 내린다** |
| 보관 | **세 번째 그룹**으로 남고 **이름·메타·배지 셋이 `#a3a3a3` 한 색으로 내려간다** — 숨기지 않는 대신 훑는 눈에서만 멀어진다. 배지 하나로는 그 행이 여전히 같은 무게로 읽힌다. Meter와 총계는 그대로다.<br>⚠️ **`#737373`이었다** (캔버스 `1c`의 `muted: true` · 2026-09-20 사용자가 한 단계 더 내렸다 — *"거의 비활성 상태에 가깝게 보였으면"*). 그 값은 이 리포에서 **꺼진 컨트롤의 글자색**이라(`button.tsx`·`select.tsx`의 `disabled:`·`aria-disabled:`) "비활성처럼"의 하한이 아니라 **그 값 자체**였고, 더 물러나려면 층이 하나 더 필요했다.<br>⚠️ **셋이 함께 움직인다** — 하나라도 `#737373`에 남으면 그것이 행에서 가장 진한 것이 되어, 물러나게 하려던 행으로 눈이 먼저 간다.<br>⚠️ **§6.2의 `neutral-400` 하한에서 벗어난 자리다**(*"흰 배경 2.3:1이라 본문에 쓰지 않는다 — 옆의 값이 뜻을 완성하는 라벨·시각·글리프뿐"*): 여기서는 **행 이름**, 곧 링크의 접근 이름이 그 색이다. **등재된 이탈**이고 근거는 보관 행이 *읽으라고 두는 행이 아니라 있다는 것만 알리는 행*이라는 것이다(숨기지 않는 유일한 이유가 OWNER의 복원 경로다 — §6.69). 실제로 읽을 때는 그 행을 눌러 들어간 화면이 `#0a0a0a`로 말한다. 되돌릴 곳은 이 한 줄이다 |
| 빈 상태 둘 (`1b` 프로젝트 0건 / `1d` 검색 0건) | **같은 카드를 쓴다.** 다른 것은 **아이콘과 출구의 무게**뿐이다: 프로젝트가 없을 때의 출구는 **만들기**(`box` + 채운 버튼 36·radius 10)이고, 검색이 빈 것의 출구는 **되돌리기**(`search-x` + 링크)다 — 되돌리는 일에 채운 버튼을 쓰면 그것이 이 화면의 목적처럼 보인다. 치수는 위 표. ⚠️ **`1b`의 머리는 제목 + 배지 `0`뿐이다**(`listBody`의 `kind === "empty"`) — 좁힐 것이 없는 검색은 죽은 컨트롤이고, 만들기 버튼을 머리에도 두면 같은 행동이 한 화면에 두 번 선다. **선은 그대로 선다.** ⚠️ **장식을 걷어냈다** (2026-09-15) — 전엔 그라데이션 면 + 점 필드 + KV 합성이었고 그것이 "장식은 패널 안에 살지 않는다"(원칙 5)의 **유일한 예외**였다. 본문이 전부 카드가 되면서 **빈 상태가 화면 중 가장 화려해지는** 문제가 됐다. 브랜드가 서는 자리는 로그인 화면이 든다. ⚠️ **액션이 하나로 줄었다** — `1d`의 [New project]는 머리에 이미 서 있다(DESIGN §6.4 "버튼 하나"의 등재 예외가 닫혔다) |
| 로딩 | 골격이 **제목 줄 · 카드 헤더 · 행 둘**이다. ⚠️ **Summary 줄이 2026-09-15에 빠졌다** — 골격이 실물보다 90px 길면 데이터가 도착하는 순간 목록이 그만큼 밀려 올라온다. **머리 아래 선은 프리미티브가 드므로 스켈레톤에도 있다**(뒤늦게 생기면 본문이 1px 밀린다). ⚠️ **이 화면은 GitHub도 기다린다** — 스켈레톤이 서 있는 시간이 길어, 골격이 실물과 어긋나면 그만큼 오래 어긋나 보인다 |
| 거부 | `?e=`는 **제목 줄 아래이고 머리 안**이다. 제목 위나 패널 밖에 두면 화면 전체의 머리처럼 읽히는데, 이건 직전 시도에 대한 답이고 화면의 정체는 여전히 Projects다. **목록은 그대로 살아 있다** |
| hover · focus | hover는 **배경 하나뿐**이다(`bg-foreground/[0.02]`) — 테두리·그림자·확대를 더하면 커서가 지나가는 곳마다 목록이 출렁인다. 행의 focus 링은 **안쪽**이다(`ring-inset`): 카드가 `overflow-hidden`(radius 12가 첫·끝 행 모서리를 자르는 수단)이라 바깥 링은 통째로 잘린다. 검색·버튼은 자를 부모가 없어 바깥 링을 쓴다 |

⚠️ **`--ring`이 blue-400이고 캔버스는 `#2563eb`다** (2026-09-13 실측). 프리미티브 넷이 공유하는
**전 화면 축**이라 이 화면만 바꾸면 포커스 색이 화면마다 갈린다 — 고친다면 토큰을 옮기는 별도 판단이다.

⚠️ **셸의 `loadMemberships`와 다른 로더를 쓴다**(`loadProjectList`). 집계 다섯과 GitHub 조회가 거기
붙으므로, 셸의 로더에 얹으면 `(edit)` 아래 **모든** 페이지가 목록 하나를 위한 왕복을 문다 —
PRODUCT §7.7 결정 5가 사이드바 카운트를 거절한 것과 같은 축이다.

### 6.64 Home (`/projects/[slug]`) — 카운트 카드 넷 + 할 일 + 로그 + 메타 열 (2026-09-15 재편)

**프로젝트 진입의 착지점이다** (PRODUCT §7.7 결정 1). 시안은 Claude Design 핸드오프
`design_handoff_project_home`이고 **캔버스가 px 단위 정본**이다 — 아래 값은 2026-09-15에 Chrome의
computed style과 CDP 접근성 트리로 **실측한** 것이다.

⚠️ **그 결정이 번역자에게 클릭 하나를 물렸고, 이 화면이 그것을 갚아야 한다.** 갚는 수단이
2026-09-15에 바뀌었다 — **카드 넷이 각자 `?state=`로, 할 일 행이 그 로케일로** 착지시킨다.
`[Open translations]` primary와 진행률 행 링크는 그때 사라졌다(카드가 더 좁은 목적지를 준다).

⚠️ **Home이 프로젝트 합계를 소유한다** (PRODUCT §7.7 결정 2의 정정). 표면이 여럿이 되면서 번역 화면
머리의 수는 **한 표면의 것**이 됐고 합계를 말할 자리가 여기밖에 없다. 금지되는 것은 "같은 수를 두 번
그리는 것"이 아니라 **"같은 수를 두 번 세는 것"**이다 — 카드 넷은 `summaryQueue` 하나에서 나온다.

**레이아웃** — 본문이 `grid-template-columns: minmax(0,1fr) 320px`, **gap 20**(세로 블록 간격도 20이라
한 격자로 읽힌다). 오른쪽 320은 고정이고 왼쪽이 `minmax(0,1fr)`이다: `flex-1`로 두면 `min-width:auto`
때문에 카드 안의 긴 문장이 오른쪽 열을 밀어낸다.

| 요소 | 실측값 |
|---|---|
| 머리 | 타일 28(radius 8, **이름 기반 `toneFill`** — 목록 행과 같은 `ProjectThumbnail`이다) + `h1` 18/500 + (보관이면) `Archived` pill + 우측 `[Sync]`·`[Publish]`. **리포·브랜치·멤버 수를 머리에 안 적는다** — 메타 열이 그 사실의 소유자다 |
| 카드 넷 | `repeat(4,1fr)` **gap 8** · 카드 padding 14 · 내부 gap 12 · **radius 12**(`rounded-lg` — ⚠️ `rounded-xl`은 16이다) · border `#e5e5e5` · hover `bg-foreground/[0.02]` · **전체가 링크** |
| 카드 내용 | 1행 제목 14/500 + `ml-auto` 글리프 16 / 2행 수치 24/500 + 보조 줄 13 `#737373`. 순서가 **파이프라인**이다. ⚠️ **`To send`가 0이 아니면 보조 줄은 `repository updates paused`다** (2026-09-18 — 마지막 Publish 시각 줄을 대체했다). OWNER가 CI 적재 보류를 아는 화면 자리이고, 넷째 전폭 배너를 두지 않는다(상시 상태에 배너를 두면 배너 0개 전제가 깨진다) |
| 카드 색 | 첫 칸만 **글리프와 수치 둘 다** `blue-600`(들어온 것) · `To review` 글리프만 `amber-700` · 나머지 글리프 `neutral-400`. **값이 0이면 수치·글리프가 `neutral-400`이고 색이 빠진다**(값은 안 지운다 — 0이 곧 정보다) |
| 유입 수치 | **`+n` 접두**(늘어난 양이라서다). 나머지 셋은 남아 있는 양이라 부호가 뜻을 바꾼다. 천단위 구분자는 **`en-US` 고정**이다 — 서버 로케일을 따르면 같은 DB 상태가 다른 화면을 낸다 |
| 블록 카드 | 머리 `h2` 15/500 padding 16 · 카드 안 구분선은 **`--divider`(#f0f0f0)**이고 테두리(`#e5e5e5`)보다 연하다 |
| 할 일 행 | 타일 28(radius 4) + 글리프 16 / 첫 줄 13 `#737373` **truncate**(표면 · 로케일) / 둘째 줄 15 — **굵은 조각 + 문장**(색이 아니라 무게로 가른다) / 시각 13 `neutral-400` / chevron 16. 행 전체가 링크이고 **버튼도 바닥 링크도 없다** |
| 할 일 pill | 머리의 카운트. **0에서는 안 그린다** — `0` 배지가 하나의 항목처럼 읽힌다 |
| `+n more` | `<details>`/`<summary>` — **클라이언트 상태 0**. 기본 marker를 `list-none` + `[&::-webkit-details-marker]:hidden`으로 지우고 chevron 회전은 `group-open:rotate-90` |
| 로그 레일 | 점 10(**border 2**, 채움 아님) + 1px 세로선 `--divider`, **마지막 줄만 선이 없다**(있으면 `All logs`가 타임라인에 붙는다). 본문 padding `14px 16px 0` · 줄 15 · 시각 13 `neutral-400` |
| 로그 파랑 | sync 줄의 **점 테두리**와 **키 수 조각**, publish 줄의 **PR 번호**. 셋 다 **링크가 아니다** — 이 카드는 요약이고 목적지는 바닥의 `All logs`다 |
| 바닥 링크 | `All logs ›` · `Project settings ›` 둘 다 **중앙 정렬** padding `12px 16px` 14 + chevron. 화면 **안**으로 가는 이동은 전부 chevron이다 |
| 메타 열 | radius 12 · **구역 둘**(리포의 모양 6행 / 시각 3~4행) · 구역 padding `14px 16px` gap 10 · **라벨 width 96** 13 `neutral-400` + 값 14. `Last publish`는 **`Pull request #127 · 2d ago`**(무엇을 보냈나가 먼저) |
| EmptyState | 프리미티브 그대로 + `px-4 py-8`(칩 48 · 글리프 16 · 제목 18/500 · 설명 14). **액션 없음** |
| 역할 | 게이트는 **`translation:write`**. ⚠️ **`[Sync]`는 EDITOR에게 부재다**(누를 수 없는 버튼을 주지 않는다 — §6.69와 같은 규칙) · **미연결·보관에서는 비활성이고 부재가 아니다**(OWNER가 가진 동작이 지금 멈춘 것이다) · `[Publish]`는 EDITOR도 누른다 |
| 거부 tone과 낭독 | ⚠️ **tone이 live politeness까지 정한다** — `Alert`가 `role`을 `danger`면 `"alert"`(assertive)로 덮는다(`alert.tsx`). 캔버스 `4f`는 **색**을 골랐는데 프리미티브가 그것을 **읽던 것을 끊는 결정**으로 번역한다 — "danger 시각 + `status`"라는 조합이 지금 구조에 **없다**. 일시적 실패(`ingest-failed`·`unavailable`)가 그 대가를 받는 자리이고, **알고 받는다**(2026-09-16 라운드 4). ⚠️ **거부의 tone은 캔버스 tone 표가 정하고 `dismissible`만 "다시 누르면 되나"로 갈린다** — 두 축의 소유자가 다르고, `lib/import/refusal.ts`의 주석이 근거다 |
| 진행 중 상호 잠금 | ⚠️ **한쪽이 도는 동안 다른 쪽이 잠긴다** (sync-repository 캔버스 `4f`) — Sync는 리포로 DB를 덮고 Publish는 DB로 리포를 덮으므로, 겹치면 **남는 값이 두 요청의 도착 순서에 달린다**. 화면이 약속할 수 없는 근거다. ⚠️ **판정은 호스트(Home의 `components/home/actions.tsx` · 번역 작업 화면의 `components/translations/workspace/workspace.tsx`)의 몫이다** — 각 버튼은 자기 연타만 막고 서로의 존재를 모른다. ⚠️ **두 진행을 하나의 `busy`로 접지 않는다**: 접으면 Sync가 자기를 잠가 `Syncing…` 트리거가 native `disabled`로 떨어지고 Dialog의 포커스 복귀 대상이 사라진다. 2026-09-15 브라우저 실측이 `Syncing…` 중 `[Publish]`가 그대로 눌리는 것을 잡았다 |
| 배너 | **머리와 본문 사이 · 전폭**. 본문 안에 두면 스크롤과 함께 밀려 올라가 "왜 안 눌리나"를 말하는 문장이 화면 밖으로 나간다. ⚠️ **danger는 본문이 muted이고 제목·글리프만 빨강이다** — 전체가 빨가면 "무엇이 안전한가"까지 경고로 읽혀 이 배너가 하는 일의 절반이 사라진다 |
| 로딩 | `[slug]/(home)/loading.tsx`. ⚠️ **route group `(home)/`에 둔다** — `[slug]/`에 바로 두면 자기 `loading.tsx`가 없는 형제 화면(Members·Sources·Settings·Translations)으로 가는 동안에도 이 골격이 뜬다(malmoi#95). 골격이 실물과 **같은 치수**여야 한다(머리 padding · 카드 테두리 · 행 높이 · 구분선). 개수를 모르는 자리는 가장 흔한 수(항목 3 · 로그 5 · 메타 9), 폭은 비율(`62%`·`72%`), `motion-safe:` |

**접근성 — CDP로 잰 값** (2026-09-15). ⚠️ **jsdom은 accname을 계산하지 않아 이 층을 못 본다.**

| 노드 | role | 이름 |
|---|---|---|
| 카드 링크 | `link` | `New from GitHub +907 keys · synced 6 days ago` (name-from-content) |
| 할 일 카드 | `region` | `Needs your attention` |
| 로그 카드 | `region` | `Recent logs` |
| 메타 열 | `complementary` | `Project` |
| `All logs` · `Project settings` | `link` | 그 문구 |

⚠️ **`<section>`은 접근 이름이 있을 때만 `region`이다** — 없으면 Chrome이 `generic`으로 접어 블록이
접근성 트리에서 통째로 사라지는데 **화면은 똑같다.** 실제로 이 루프가 그 상태를 잡았다.
`components/__tests__/home-landmarks.test.tsx`가 배선을 고정한다.

**캔버스와의 의도된 이탈 아홉** — `/design-sync`가 결함으로 잡지 않도록 여기 적는다.

| 이탈 | 근거 |
|---|---|
| `h1`이 **18**(캔버스 20) | 리포의 패널 머리 `h1`이 전부 `text-lg`다. 한 화면만 다른 크기면 화면을 옮길 때마다 제목이 뛴다 — 프리미티브가 이긴다 (2026-09-15 사용자) |
| 패널 여백 **16**(캔버스 24) | `PanelHeader`·`PanelBody`가 든 값이고 다른 화면 열하나가 함께 움직인다 (§5.1) |
| 머리 타일이 **이름 기반 `toneFill`**(캔버스 `#4f46e5`) | 미등재 raw 색을 늘리지 않는다(§6.2). ⚠️ **2026-09-17까지 고정 `bg-foreground`였고 그것이 결함이었다** — 같은 프로젝트가 목록에서는 이름 색, Home에서는 검정이라 두 화면이 같은 것을 가리키지 못했다 (POSTMORTEM 2026-09-17) |
| 머리·목록 타일 radius가 **8**(캔버스 4) | §6.63의 같은 줄이 정본이다 — 초대 카드(§6.4)까지 세 화면을 한 값으로 모았다 (2026-09-17 사용자) |
| 미채움 항목 타일이 **무채색 + `languages`**(캔버스 `#0891b2` + `mail`) | 캔버스의 그것은 **그 표면(emails)의 아이콘**이지 항목 종류의 색이 아니다. 표면별 아이콘·색을 정하는 데이터가 없다 |
| `role="alert"`이 **danger 배너 하나**(캔버스는 셋 다) | `Alert`의 danger가 이미 그렇고, 미연결·보관은 **상시 상태**다 — assertive live 영역을 상시 상태에 쓰면 화면에 들어올 때마다 읽던 것을 끊는다 |
| 할 일 정렬이 **시간순**(캔버스는 종류순) | 로그 카드가 바로 옆에서 시간순이다. 두 카드의 정렬 규칙이 다르면 어느 쪽을 읽고 있는지 매번 다시 판단해야 한다 |
| 메타 `Archived` 행에 **실행자 없음**(캔버스 `· by Sinhyeok`) | 보관은 OWNER만 하고 멤버 상한이 10이라 "누가"의 값이 낮다 (PRODUCT) |
| 로그에 **`added the {surface} surface` 줄 없음** | 출처가 아예 없다 — `SyncRun`은 Publish 전용이고 `trigger`/`status` enum이 그 가정 위에 선다 |
| 보관에서 **첫·넷째 카드가 0**(캔버스는 값 유지) | 그 둘의 raw 집계가 SQL에서 `p."archivedAt" IS NULL`을 건다. 피하려면 **미발송 술어의 넷째 벌**이 필요하고 CLAUDE.md가 그것을 금지한다 |

**⚠️ 실측이 밟은 갈래는 `2a` 하나다 — 나머지 다섯은 미검증이다** (2026-09-15). 밟지 못한 것을
"검증했다"고 적지 않는 것이 `/design-sync`의 규칙이라 여기 남긴다. 다음에 이 화면을 손대는 사람이
**이 표부터 본다.**

| 아트보드 | 상태 | 밟는 방법 |
|---|---|---|
| `2a` 기본 | ✅ 실측(computed style + CDP) | dev의 `bugshot-i18n-test-qa` |
| `2a` 빈 | ⚠️ **절반** — 할 일·로그의 `EmptyState`는 봤지만 **카드 넷이 전부 0인 화면**은 못 봤다(`New from GitHub`이 907로 남아 있다) | 전부 발송·전부 번역된 프로젝트가 필요하다 — **만드는 방법이 정해지지 않았다** |
| `2b` Sync 실패 | ✅ 실측(2026-09-16) — danger 배너 · 제목 `The last sync could not finish` · 본문이 **무엇이 안전한지까지 말한다**(`Nothing was lost — the cells you see are from the last good sync, {시각}`) · `[Try again]`이 확인 Dialog를 연다 | `i18n-format-check`의 `locales/ja.yml`을 깨뜨려 커밋하고 Sync. **되돌림 커밋 + 재Sync로 복구**된다 |
| `2c` 미연결 | ❌ 단위·DOM 테스트뿐 | GitHub App 설치 목록에서 리포를 뺀다 — ⚠️ **되돌리는 절차를 같이 적고 시작한다** |
| `2d` 보관 | ❌ 단위·DOM 테스트뿐 | 설정 화면에서 보관 → 복원 (되돌릴 수 있다) |
| `2e` 로딩 | ❌ 골격 파일만 있고 실물을 못 봤다 | 네트워크 스로틀 |

⚠️ **그 다섯에서 값이 아니라 표현이 틀리는 부류는 지금 어느 게이트도 못 본다** — `pnpm test`는
판정만 보고, 소스 스캐너는 구조만 본다. 2026-09-13의 29곳이 정확히 그 층이었다.

⚠️ **`?e=` 슬롯이 없다** — 보내는 자리가 0이다. ⚠️ **첫 적재 전 화면은 `ProjectNotReady`가 든다** —
번역 화면과 **같은 컴포넌트**다. ⚠️ **보관은 전면 교체가 아니라 배너다** — `ProjectArchived`의
소비자가 넷으로 줄었고 **그 컴포넌트를 지우지 않는다**(번역·로케일·멤버·이력이 계속 쓴다).

### 6.644 Sync — 확인 Dialog와 결과 Alert (2026-09-16 실측)

시안은 Claude Design 핸드오프 `design_handoff_sync_repository`(아트보드 `4a`~`4f`)이고 **캔버스가 px 단위
정본**이다. 아래는 Chrome computed style + CDP 접근성 트리로 **실측한** 값이다. ⚠️ **Home의 핸드오프가
아니다** — 그 둘은 파랑 규칙도 다르다(§6.64 마지막 ⚠️).

| 요소 | 실측값 |
|---|---|
| Dialog | 360 · radius 12 · shadow `rgba(22,24,27,.15) 0 6px 16px 2px` · 400px 뷰포트에서도 360 유지 |
| 머리 | padding `16 16 8` · gap 8 · 제목 15/500/22.5px/0.225px |
| 설명문 | 13/20.8px/0.26px/`#737373`/padding `0 16` · 브랜치는 **sans** 13/`#525252`(§4.1 — 2026-09-23까지 mono 13/18px이었다) |
| 본문 | padding `16 16 0` · 블록 사이 8 |
| 위험 블록 | amber radius 10 · padding 12 · 13px · 글리프 14 mt 2 · **줄 사이 6** · `#fffbeb`/`#fde68a`/`#78350f` · **수에만 weight 500** |
| 푸터 | padding 16 · gap 8 · flex-end · 버튼 36/radius 10/px 12/14px |
| 확정 버튼 | **위험 집계가 0이어도 danger다** — 글자 `#dc2626` · bg `#fff` · border `destructive/40` |
| 포커스 | 열릴 때 `Cancel`. 접근 이름 `Sync` ≠ 확정 라벨 — **확정 라벨이 건수로 갈린다** (2026-09-18): 미발송 0이면 `Sync from repository`, N이면 `Discard changes and sync`(무엇을 버리는지를 동사가 먼저 말한다). 둘 다 트리거와 이름이 다르다 |
| `aria-describedby` | ⚠️ **Radix는 설명문 하나에만 건다** — 경고 블록 id를 함께 넘겨 넓힌다. 안 넓히면 열릴 때 읽히는 것이 "덮는다"까지이고 **무엇이 지워지는지는 안 읽힌다** |

**위험 블록은 네 갈래이고 권유 줄이 갈래마다 다르다.** ⚠️ **블록이 줄어드는 방향으로 움직인다** —
조회가 `null`을 주면 미확인 줄이 사라지고 `describedby`도 하나로 줄어든다.

| 갈래 | 아트보드 | 블록 | 권유 |
|---|---|---|---|
| 미발송 0 ∧ PR 없음 | `4a` | **본문 자체가 없다** — 부재가 곧 정보다 | — |
| 미발송 N | `4b` | 미발송 한 줄 — **`Sync will discard N unsent translation changes and replace them with repository values.`** (2026-09-18 교체 — 전엔 "…will be replaced"였다. 문장을 더하지 않아 360 Dialog 줄 수가 같다) | `Publish first` — **앱 내부 링크** (audit #28 — 전엔 `Send changes first`였고 도착 화면에 그 버튼이 없었다) |
| 미발송 N ∧ 열린 PR | `4c` 좌 | **블록 하나 안에 `<p>` 둘** · 글리프는 블록 머리에 하나 · PR 번호는 **링크가 아니다** | 같은 `Publish first` |
| 미발송 0 ∧ 열린 PR | `4c` 우 | 미발송 줄이 **빠지고** PR 줄만(`0 edits …`를 안 쓴다) | `Nothing is waiting to be sent.` + `See what's open`(`_blank`·`noreferrer`·글리프 12·파랑) |
| PR 조회 중·실패 | `4d` | 확인된 경고와 **같은 amber** — muted 한 줄이면 부재와 같은 신호로 읽힌다. ⚠️ **줄 문장은 둘이다** — 조회 중 `Checking whether anything is still waiting in a pull request…` / 실패 `We couldn't check …`(malmoi#75 — 전엔 로딩에도 실패 문장이 섰다) | **줄 없음** |

**결과 Alert는 형이 둘이고 그것이 방어다** (`4e` · ARCHITECTURE §0 불변식 9). 색만 다르면 `Synced …`라는
앞머리가 같아 스캔에서 성공으로 읽힌다 — **높이와 줄 수가 달라야 읽지 않아도 다른 결과임이 보인다.**

| 갈래 | 형 | 실측 |
|---|---|---|
| 전부 성공 / 정상 0키 | **한 줄** | `Synced 18 keys from dev` · `CircleCheck` 16 `text-foreground` · bg `#fff` · border `#e5e5e5` · Dismiss만 |
| 전부 성공 + 관리하지 않는 항목 (2026-09-24, B2 r3 · QA5) | 헤드라인 + **안내 줄** · **success 톤 그대로** | `Synced 904 keys from main`(**브랜치가 남는다** — 성공이다) + `2 entries aren't plain text and stay in the code.` — ts-dict `String(…)`처럼 코드에 남는 항목이라 실패가 아니다(ARCHITECTURE §1 "read 오류의 두 갈래"). ⚠️ **"성공 = 한 줄" 규칙의 등재된 이탈이다** — 구별은 톤과 브랜치가 든다 |
| 파일 일부 실패 | 헤드라인 + 파일 줄 | `Synced 18 keys`(브랜치 없음 — 붙이면 전부 성공과 **글자까지 같아진다**) + `1 item was not imported.` + `locales/ja.yml: The file couldn't be parsed.` |
| CI 미적용 | **두 줄** | `Synced 9 keys, but 1 surface was not replaced` + `locales — New repository data arrived while syncing.`(slug는 sans, `[data-surface]`가 자리를 든다) · `[Try again]` 있음 |
| 전 표면 실패 | 두 줄 | `Sync could not finish` — **`…, but …`을 쓰지 않는다**(앞 절이 거짓이 된다) |
| 승인 뒤 남은 편집 | 헤드라인 + 원인 줄 · **warning** (2026-09-18) | `Synced 18 keys`(브랜치 없음) + `2 unsent changes were kept. Repository updates stay paused until they are sent.` — 폐기를 승인했는데 편집이 남은 것은 성공 한 줄에 숨기지 않는다 |

⚠️ **`partial` 표면에는 사유가 없다** (2026-09-16 실측이 잡은 결함). `lib/import/run.ts`의 `finishSurface`는
`prepared.kind === "failed"`에만 `reason`을 달아 **`partial`은 언제나 `null`**이다. 폴백을 쓰면
`locales — The last import did not finish.`가 서는데 **그 임포트는 끝났고 18키가 들어갔다** — 한 Alert
안에서 두 문장이 서로를 부정한다. 그 갈래의 원인은 **파일 줄**이 든다.
⚠️ **말할 것이 없는 사고는 자리를 만들지 않는다** — 중복 키만으로도 `partial`이 되고(`duplicateKeys`는
어댑터 오류가 아니라 `lastWins`가 흡수한다) 그 표면은 사유도 파일 오류도 없어 **빈 `<div>`**가 남는다.
⚠️ **이 결함이 통과한 이유는 테스트가 서버가 만들지 않는 조합(`reason: "partial-import"`)을 재고 있었기
때문이다** — 회귀는 `components/__tests__/sync-result.test.tsx`가 고정한다.

**거부 갈래 넷은 `[Sync]`에서 도달할 수 없다** (2026-09-16 실측). 근거와 "지우지 않는 이유"는
`lib/import/refusal.ts`의 머리 주석이 든다 — **`not-ready`·`no-surfaces`는 Home이 서지 않아서**,
**`not-connected`·`repo-replaced`는 `paused`가 트리거를 native `disabled`로 만들어서**다.
⚠️ **후자를 "비활성 버튼은 이유를 말하지 못한다"로 반박하지 않는다** — 그 화면은 `not_connected` 배너가
`[Reconnect]`를 들어 거부 Alert의 액션이 하려던 일을 이미 한다.

**세션이 끝난 거부(`unauthorized`)는 막다른 길이 아니다** (2026-09-24 QA D2) — danger · **닫을 수 있음** · 액션 **[Sign in]**(새 탭,
`<a>` + `buttonClass()`). 같은 화면의 편집자 세션 Alert와 같은 형이다: 이 탭(번역 화면의 draft)을 떠나지 않고 로그인한 뒤
`[Sync]`를 다시 누른다. 제목은 Sync 전용 문장이고 공용 `access.unauthorized`("…to save your work")를 빌리지 않는다 —
`[Sync]`에는 저장할 입력이 없다. Home과 번역 화면이 같은 `SyncResult`를 써서 두 자리가 함께 움직인다.

**실측 상태** — ⚠️ **jsdom 통과를 실물 검증으로 바꿔 적지 않는다.** `sync-button.test.tsx`·
`sync-result.test.tsx`가 재는 것은 **판정**이고 여기가 재는 것은 **시안과 같은가**다.

| 갈래 | 상태 | 밟는 방법 |
|---|---|---|
| `4a` · `4b` · `4c` 좌우 · `4d` · `4f` 진행/연타/역방향 잠금 | ✅ 실측 | `4c`는 Publish를 돌려 PR을 만든 뒤 Dialog를 연다 |
| `4e` 성공 한 줄 · 정상 0키 · 일부 파일 실패 · CI 미적용 | ✅ 실측 | 0키는 로케일 파일을 **빈 카탈로그**로, 일부 실패는 파일 하나를 깨뜨려 커밋. CI 미적용은 실행권을 잡은 직후 표면에 **남의 마킹**을 끼운다 |
| 거부 — `unavailable`(요청이 못 감) | ✅ 실측 | CDP로 오프라인 |
| 거부 — `already-running` | ✅ 실측 | `Project.repositoryImportToken`·`repositoryImportStartedAt`을 세운다(5분 안에 누른다) |
| 거부 — 나머지 넷 | ⛔ **도달 불가** | 위 참조. `pnpm test`의 판정 테스트가 유일한 방어선이다 |

### 6.645 ⚠️ 이메일 칸에는 상태가 **셋**이다 (2026-09-10)

암호화 전환 뒤 표의 이메일·이름 칸이 세 갈래로 갈린다 — **셋을 같은 모양으로 그리면 안 된다**:

| 상태 | 무엇 | 어떻게 |
|---|---|---|
| 값 있음 | 남의 주소 | **마스킹 라벨**(`a***@acme.com`) — 충돌하는 행만 접두를 늘린다(malmoi#18). **서버가** 만든다 |
| 부재 | 그 값이 원래 없다 | 이력 표는 `—`, 멤버 행은 **마스킹 주소가 이름 자리로 올라간다**(§6.68·§6.65 — `planMemberIdentity`. 둘 다 없으면 `No name set`이고, 못 읽은 행은 `Couldn't be read`로 갈래가 하나 더 있다) |
| **못 읽었다** | 저장된 값을 지금 키로 못 연다 | **`m.common.unreadable`("Unavailable")** — `lib/auth/query.ts`·`lib/events/query.ts`가 낸다 |

⚠️ **셋째를 부재로 접지 않는다.** 빈 칸으로 두면 관리자가 "이 사람은 이메일이 없구나"로 읽는데, 실제로는 키가 옛 세대라 못 연 것이다 — POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다")이 화면 층으로 내려온 자리다. 이력 표에서는 `—`와 "Unavailable"이 **같은 열에서** 갈린다.

⚠️ **배지가 아니라 평문이다** — 사용자가 할 일이 없고(운영자가 키를 되살린다) 드문 상태를 요란하게 만들면 §6.1의 "가장 흔한 상태가 가장 조용하다"가 뒤집힌다.

### 6.646 Publish — 한 동작의 끝 열하나가 **모달 안에서** 답한다 (2026-09-16 실측)

시안은 Claude Design 핸드오프 `design_handoff_publish_modal`(아트보드 `1a`~`1k`)이고 **캔버스가 px
단위 정본**이다. 아래 값은 Chrome의 computed style로 잰 것이고 소비자는 **둘**이다 — 번역 화면
작업 화면 머리(`components/translations/workspace/workspace.tsx`)와 Home 머리(`components/home/actions.tsx`).

⚠️ **껍데기가 `components/ui/modal.tsx`(온보딩과 공유)이지 `Dialog`(440)가 아니다.** 근거는 `1a`의
diff 표가 **키 220 + 로케일 84 + 값**의 3열이라는 것이다 — 작은 창에서는 값 칸이 한 줄에 두세 낱말이
되어 "바뀐 낱말만 칠한다"가 무의미해진다. **수용한 비용: 확인 창 계열이 둘이 됐다** — Archive·Sync는
440, Publish는 1024이고 **Home에서는 그 둘이 한 화면에 나란히 산다**. 경계 규칙은 한 줄이다:
**답만 받는 확인은 440 · 읽어야 하는 목록이 있으면 1024.** 그래서 Publish 안에서도 답만 받는 두 갈래(`1j`)는 440 Dialog다
(2026-09-18 — 폭은 옛 360/736에서 올렸다).

| 자리 | 값 |
|---|---|
| 패널 | 폭 **1024**(2026-09-18 — 껍데기 기본값을 따른다, 옛 736) · ⚠️ **게이트 둘(`1j` already-running·too-soon)은 이 패널이 아니라 작은 Dialog(440)다** — 제목·한 문장·버튼 하나라 큰 패널이면 빈 판이 된다(2026-09-18 사용자, 옛 512 패널) · radius 16 · `shadow-medium` · dim `bg-foreground/32` + `backdrop-blur-[6px]` |
| 높이 | **갈래마다 고정**이다 — `1a` 620~680 · `1c` 340~380 · `1d` 420~460 · `1e`·`1h` 460~500 · `1f` 360~400 · `1g` 560~600 · `1i` 400~440 · `1k` 440~480(`1j`는 Dialog라 높이가 내용을 따른다). ⚠️ **한 값으로 묶으면** 단계가 짧은 갈래에서 바닥 버튼이 허공에 뜬다. ⚠️ **클래스를 리터럴로 적는다** — Tailwind는 소스에 그대로 있는 문자열만 만든다 |
| 본문 블록 사이 | **결과 갈래는 12**(안쪽 열 하나가 든다) · `1a`는 껍데기의 **16**. ⚠️ 껍데기 값을 바꾸면 온보딩 네 단계가 함께 움직인다 |
| 무색 블록 | `border-border` radius 12 · padding **14 16**(제목 없는 `1f`는 **16**) · gap 12 · 제목 14/500 · 본문 13/1.7 muted. ⚠️ **글리프 칸의 높이가 첫 줄의 line-height와 같다**(17 / 21 / 24) — `margin-top` 보정은 글자 크기가 다른 블록마다 어긋난다 |
| diff 표 | radius 12 · 머리 bg `--primary-foreground`(= `rgba(10,10,10,.02)`) `sticky` · 머리 아래 `--border` · 머리 옆·행 사이 `--divider` · 열 **220 / 84 / 나머지** · 셀 padding **11 14**(로케일 11 12) · 머리 **9 14** · 키 **sans** 12(네임스페이스 접두 muted. ⚠️ §4.1이 "mono의 목적지는 이 diff다"라고 말하던 자리이고 2026-09-23에 그 방침째 걷혔다) · 로케일 13/500 + 국기 16×11 radius 2 + `0 0 0 1px rgba(10,10,10,.06)` · 값 14/lh20 · 값은 `whitespace-pre-wrap`(−/+ 둘 다 — 개행이 공백으로 접히면 PR이 쓰는 줄바꿈과 구별되지 않는다, #96 · §6.68 Logs 값과 같은 형) |
| PR 배지 | `Badge success` — 시안의 `padding 3 9`가 아니라 프리미티브 값이다 |
| 바닥 버튼 | `Button primary size="lg"`(40 · radius 12 · padding 0 16) — 시안 값과 **정확히 같다** |

**⚠️ `<table>`이다 — `div`가 아니다.** 캔버스는 그림이라 DOM 시맨틱을 정하지 않는다. 200행짜리
데이터 그리드에서 열 머리와 셀의 연결이 사라지면 낭독에 `actionLog. filter.all en All`만 남는다.
**키 병합은 `rowSpan`이 든다** — 테두리를 지워 병합처럼 보이게 하면 화면은 같고 접근성 트리에만
빈 칸이 하나 더 생긴다. ⚠️ **`border-separate`다**: `collapse`는 `sticky` 머리에서 테두리가 같이
안 붙는다. ⚠️ **머리 셀의 아래와 옆이 다른 색이라** `border-b-border border-r-divider`로 변을 갈라
준다 — 한 클래스로 주면 뒤엣것이 네 변을 다 덮는다.

**⚠️ `−`/`+`는 `aria-hidden`이고 뜻은 `sr-only`가 든다** (2026-09-16 CDP 실측). 글리프만 두면
낭독에 "All … All actions"만 남아 어느 쪽이 리포의 값인지 사라진다.

**알림은 한 곳이다.** danger 갈래는 `Alert`의 `role="alert"` 하나이고 그때 껍데기의 live는 `off`다 —
같은 결과를 두 번 읽지 않는다(시안의 블록별 `aria-live="polite"`를 이 규칙으로 정정했다).
**포커스**는 열릴 때 컨테이너, 목록·결과로 전이하면 본문, 닫으면 호출 버튼(사라졌으면 호스트 제목). ⚠️ **꺼진 Publish도 호출 버튼이다** (2026-09-23) — `aria-disabled`라 포커스를 받으므로 닫힌 뒤 그 버튼으로 돌아와 사유를 읽힌다. 번역 화면의 미저장 가로채기는 `aria-disabled` 버튼을 건너뛴다(꺼진 버튼의 클릭도 이벤트는 오므로).

**⚠️ `bodyScroll`은 안쪽 스크롤러가 있는 갈래만 `hidden`이다**(`1a`·`1k`·`1g`, 그리고 경고가 붙은
`1f`). 나머지는 `shrink-0` 블록만 쌓으므로 잠그면 **낮은 뷰포트에서 마지막 줄에 스크롤로도 못
닿는다** — 패널 높이가 `max-h-[min(X, calc(100svh-96px))]`이라 화면이 낮으면 뒤엣것이 이긴다.

**시안과 일부러 다른 자리** — 전부 근거가 리포 쪽에 있다:

| 무엇 | 시안 | 구현 | 왜 |
|---|---|---|---|
| `Alert`·`Badge`·비활성 primary의 radius·padding·색 | 8 / 3 9 / `rgba(10,10,10,.05)` | 프리미티브 값 | "프리미티브와 어긋나면 프리미티브가 이긴다" — 한 화면만 다른 폼이 되면 안 된다 |
| diff 행의 저자 | `#a3a3a3` | `--muted-foreground` | §6.2가 그 색을 **본문 금지**로 등재했다 |
| PR 카드의 제목 · 파일별 건수 · `opened 2 days ago` | 있음 | 없음 | `PullResult`에 그 값이 없다. `updated`는 남이 만든 제목일 수 있어 지어내면 거짓이 된다 |
| `1j` 좌우의 실행자·마지막 발송 줄 | 있음 | 없음 | `planSyncStart`가 그 값을 안 싣는다 — 핸드오프가 남긴 **열린 결정**이다 |
| `1j` `too-soon`의 버튼 | 비활성 | **활성** | 카운트다운을 안 넣기로 한 이상 꺼진 버튼은 스스로 안 풀려 "18초 뒤에 다시"가 못 지키는 약속이 된다 |
| `1h`의 `Open project settings` | 역할 무관 | **OWNER만** | 설정은 `project:settings`다 — 캔버스 자신이 "눌러서 거절당하는 경험을 만들지 않는다"를 근거로 적었다 |
| PR 줄의 `aria-live` | 블록마다 `polite` | 껍데기 한 곳 | 같은 전이를 둘이 알리면 중복 낭독이다(리뷰 6번) |

**열린 결정 넷이 2026-09-16에 닫혔다** — 넷 다 "새 화면을 만들지 않는다"로 끝났다:

- **경고가 수십 줄일 때** → **전부 펼치고 목록만 자체 스크롤한다.** `Not written`이 `flex-1` +
  안쪽 스크롤러라 몇 줄이든 PR 블록을 밀어내지 않는다 — "다섯까지 보이고 나머지는 Logs로"가
  필요 없고 불변식 9(버린 값을 숨기지 않는다)가 그대로 선다.
- **확인 창의 두 형** → **경계를 문장으로 박는다**(위 ⚠️). `Dialog`에 큰 변주를 만들지 않는다 —
  그 프리미티브의 소비자가 일곱이라 크기를 늘리면 "어느 걸 쓰나"가 매 화면 판단이 된다.
- **`1h`의 복구 버튼** → **OWNER에게만 세운다.** 설정 화면이 `project:settings`라 EDITOR가 누르면
  거절당하고, **무반응·거절당하는 버튼은 비활성보다 한 단계 아래다**(Home의 배너 셋·Sync 결과가
  이미 같은 형이다). EDITOR에게는 바닥의 *"Not a project owner? Share the reference above with one"* 한 줄이
  유일한 복구 경로로 남는다. ⚠️ **세션 만료의 `Sign in`은 역할을 안 탄다** — 다시 로그인하는 것은
  누구나 할 수 있다.
- **`1b`가 열린 PR 앞에서도 같은 모양인가** → **같다.** PR 링크는 **이미 두 화면에 서 있고**(번역
  화면 머리의 `Last sent … · View pull request`, Home 메타 열의 PR 번호 — §6.3), 버튼 자리에 하나
  더 세우면 같은 사실을 한 화면에서 두 번 말한다. 그리고 **"열려 있나"는 지금 모르는 값이다** —
  `lastPrUrl`은 마지막으로 **만든** PR이지 현재 상태가 아니고, 열림 여부를 알려면 0건 화면에서도
  GitHub 왕복을 상시로 돌려야 한다.

**`1g`의 실측** (2026-09-16 `/l10n-roundtrip` — `yaml-catalog`가 맵 자리에 스칼라를 못 써서 경고
셋이 났다): 높이 599(`created`) / 600(`updated`) · `Not written` 목록 radius **8**(경고 블록 12와
갈라 둔 값) · 머리·행 padding **11 16** · 경로 칸 **210** · 행 사이 `--divider` · `<details>` **0**.
⚠️ **목록이 자체 스크롤러를 든다** — 경고가 몇 줄이든 PR 블록을 밀어내지 않는다는 것이 "다섯까지만
보이고 나머지는 Logs로"를 안 만든 근거다. `updated` 변주의 순서는 **PR 줄 → 무색 블록 → 목록**이다.
⚠️ **`1g`는 2026-09-18부터 "보내지 않았다"다** (sync-edit-protection T10) — writer 경고가 있으면 GitHub에 쓰기 전에 멈추므로 PR 카드·교체 줄이 빠지고
제목이 `Not sent — some values can't be written to the files`, 바닥은 `Close`다. 틀(높이 560~600 · 목록 치수)은 그대로 재사용하고 새 갈래를 만들지 않았다.
**위 실측(PR 줄이 있는 모양)은 그 전의 것이다** — 새 모양은 브라우저로 아직 안 쟀다.

**⚠️ 실물로 못 밟은 갈래** (2026-09-16): `1j`(쿨다운 30초가 미리보기 GitHub 왕복보다 짧아 세 번 시도 모두 실패) —
**단위 테스트로만 서 있다**. 위 표의 높이 중 그것은 코드 값이지 실측값이 아니다.
`1h`는 2026-09-18에 밟았다 — 미리보기 단계의 거부가 이 갈래로 흐르게 된 뒤(launch-readiness L3.3) 세션 쿠키를 지우고
Publish를 누르면 `1h` + `Sign in`(`/signin`)이고 Retry가 없으며 포커스가 본문으로 간다(구조·포커스 실측. 높이는 안 쟀다).
**표 아래 `withoutFile` 한 줄**(수술적 어댑터의 원본 파일 부재로 뺀 셀 수 — L3.7)은 설치된 리포에 그 모양이 없어 못 밟았다.
**결과의 보류 줄** (2026-09-24, delivery-invariants D7 — **미실측**): `created`·`updated`·`no-changes`·`partial`(= `skipped/withheld`) 본문에
`withoutFile`과 같은 `text-xs muted` 문단이 사유별 한 줄로 선다(새 raw 색·블록 없음). 문장은 미리보기와 같은 명사·같은 약속이고 역할별로
끝이 갈린다(EDITOR `Ask a project owner.` / OWNER 파일 추가 또는 `Revert to last sent`). ⚠️ **갈래마다 고정한 패널 높이에 이 줄이 들어가는지
재지 않았다.** 미리보기 표 아래 `withoutKey` 한 줄(ts-dict 자리 없는 키)도 같다.
**미리보기 base 파일 부재는 전용 거부다** (2026-09-24 사용자 결정 — **미실측**): `configError` 패널을 쓰고 제목 `The base language file isn't in the
repository` · 설명에 경로와 브랜치 · `Trying again won't help` Alert에 역할별 다음 행동 · 액션은 OWNER에게만 `Settings`다. **Try again이 없다** — 다시
눌러도 같은 거부다(L3.3). **Logs에는 `Not sent`**(결과 어휘 `notSent` — warning 톤 · 글리프 amber)가 보류만 남은 Publish에 선다.
**전부 보류인 미리보기**(#84 — **미실측**): 제목 `Nothing can be sent yet` · 액션 `Close` 하나 · PR 줄 없음 · 표와 보류 줄은 그대로다. 보류가 섞이면 제목·요약이 나가는 수이고
도입 문장이 `The edits that can be sent go to …`로 갈린다. `no-changes` + 보류 결과는 `Not sent` 틀(#83)이고 설명이 보류 사유 문장이다.
**PR을 닫는 no-changes** (B1 r3 — **미실측**): 미리보기 제목 `Publishing closes pull request #N` · 버튼 `Close pull request #N`, PR이 없으면
`Nothing differs from <base>` · 버튼 `Publish`. 푸터는 파일 수를 빼고 `N changes · K keys`다(#94 — 실행·Logs가 `0 files`라 편집이 사는 파일을 세면 한 흐름 안에서 수가 갈린다). base와 같은 행은 −/+ 두 줄 대신 값 한 줄 + `text-xs muted` 사유(`Undoes the change in #N` /
`Already in the repository`). 결과에는 `text-xs muted` 한 줄(역할별 끝맺음) + `View #N` 링크(`text-blue-600`, §6.3 외부 링크), Logs 상세는
`Closed pull request` 필드다.

### 6.65 멤버 (`/projects/[slug]/members`) — 카드 둘 (2026-09-19, members-rework)

셸 안 **`fluid`**(2026-09-20 사용자 판정 — limited는 설정 축 둘뿐이다). ⚠️ **캔버스는 limited 전제로 그려졌다** — 아트보드의 카드 폭이 864(=896 − padding 32)이고, fluid에서는 1248까지 넓어져 고정 열(이름 300 · 역할 132 · 가입일 150) 사이의 빈 공간이 그만큼 커진다. 캔버스 값을 바꾼 것이 아니라 **그릇을 넓힌 것**이다. `h1`(`text-lg font-medium`) 줄 **우측이 좌석 라벨 + [Invite member]**이고, 본문은
`space-y-4`로 카드 둘 — **Members** · **Pending invitations**. ⚠️ **breadcrumb이 없다** (8-4 — §0).

⚠️ **2026-09-19에 표 둘이 카드 둘이 됐다.** 그 전에는 `PanelBody` 안에 `<Table>` 둘이 `space-y-6`으로
서 있었다. 표를 버린 근거는 세 개다:
1. **열 머리가 사라지면 `<table>`의 가치가 사라진다** — `<th>` 없는 표는 스크린리더에 "5열 4행"만 말하고
   셀 이름을 못 준다. 옛 `sr-only <Th>` 행이 그 부채를 메우고 있었다.
2. **행 아래 사유 띠가 `<tr>` 형제로 안 들어간다** — 전폭·들여쓰기 56인데 `colSpan`을 세야 하고 **열 수가
   역할별로 갈린다**(EDITOR는 액션 열이 없다).
3. `/projects` 행이 이미 `<ul>`이고 **같은 그릇을 공유하는 것이 이 변경의 목적**이다.

**그릇은 `components/ui/row-card.tsx`다** — `RowCard`(헤더: 제목 · 카운트 배지 · 설명 한 줄) /
`RowCardList`(`<ul>` + `@container`) / `RowCardItem`(선의 급 둘) / `BannerLine`(사유 띠) /
`EmptyRowCard`. `/projects`의 그룹 카드와 **같은 파일**이다 (§6.63). ⚠️ **`countLabel`을 반드시 넘긴다** —
기본값이 없고, 안 넘기면 타입이 막는다(전에는 `m.projects.count`가 박혀 있어 멤버 카드가 "3 projects"를
낭독할 뻔했다).

| 자리 | 규칙 |
|---|---|
| 행 | 아바타 **32** · 두 줄 텍스트 · 메타 · **오른쪽 군(갭 8)**. padding `14 14 14 12` · 요소 갭 16. 텍스트가 **60에서 시작**한다(`pl-3` 12 + 32 + `gap-4` 16) — 띠의 `pl-15`(60)와 같은 x라야 그 띠가 이 행에 속한 것으로 읽힌다 |
| 고정 열 | 이름 **300** · 역할 **132** · 가입일/만료 **150**. ⚠️ **늘어나게 두면 오른쪽 메타의 x가 행마다 달라져** "오너가 몇인지"를 세로로 훑을 수 없다 — `/projects`의 이름 칸 420과 같은 장치다 |
| 글자 | 이름 `text-base`(15/500) · 주소 `text-sm`(14) · 메타·띠 `text-xs`(13) · `(you)` 13/400 `text-neutral-400`. ⚠️ **캔버스의 15·14·13이 이 리포의 `base`·`sm`·`xs`와 정확히 맞물린다**(§4) |
| 값이 자기 라벨을 든다 | `Joined {상대시각}` · `Expires {상대시각}` · `Invited by {누구}`. ⚠️ **열 머리를 지운 대가다** — 라벨이 없으면 `2 days ago`가 가입일인지 만료인지 화면이 말하지 않는다. ⚠️ **`Invited by`는 행의 유일한 가변 칸이라 잘린다** — 1280에서 112px(malmoi#90). 잘림을 받되 전문을 `title`로 든다 |
| 두 줄 배치 | `planMemberIdentity`가 정한다 — 이름 → (없으면) 마스킹 주소가 1행으로 **올라가고** 2행은 빈다 → (없으면) `No name set`. 못 읽은 행은 `Couldn't be read` |
| 아바타 | `<Avatar size={32}>` · `lib/tone.ts` 8색 — **기존 프리미티브 그대로**다. ⚠️ **씨앗이 1행 텍스트와 갈라져 있다** — 1행이 마스킹 주소면 이니셜이 `y***@…` → `y`가 되어 셸 아바타와 다른 글자·다른 색이 된다(`entity-card.tsx`가 밟은 함정). ⚠️ **씨앗이 없으면 빈 문자열을 넘겨 `?` + `toneOf("")`를 받는다 — 갈래를 늘리지 않는다.** ⚠️ **24·28을 쓰지 않는다**: 24는 두 줄 텍스트 옆에서 작고, 28은 `Avatar`의 `size` 유니온을 늘려 글자 크기 분기까지 따라 늘린다 |
| 역할 — OWNER 시야 | `Select`(즉시 적용, `w-[132px]`) |
| 역할 — 읽기전용 | **점선 테두리 + 자물쇠 칩**(`role-chip.tsx` · 132 · 자물쇠 12 `#d4d4d4`). ⚠️ **자물쇠는 보조 신호다** — 캔버스가 정한 그 색은 칩 배경(`bg-foreground/[0.02]`) 위에서 대비가 약 1.5:1이라 **형만으로 사유가 전달되지 않는다.** 사유를 지는 것은 아래 `sr-only` 문장이고, 눈으로 "잠겼다"를 말하는 것은 **점선 테두리** 쪽이다. 대기 초대는 **전원** 이 칩이다(발급 후 변경 불가). ⚠️ **접근 이름이 둘이다** — 잠긴 까닭이 다르다: 대기 초대 `{role}, set when the invitation was created. Revoke and invite again to change it.` / EDITOR `{role}, only project owners can change roles.` 한 문장으로 접으면 **복구 경로**("Revoke하고 다시 초대")가 사라진다. 자물쇠는 `aria-hidden`이고 칩이 `aria-label`을 드는데, **그 라벨이 역할 낱말로 시작**하므로 보이는 글자가 이름에서 사라지지 않는다(WCAG 2.5.3) |
| 제거·철회 | 둘 다 **`danger` variant**(붉은 테두리 · 흰 면). ⚠️ **`ghost`를 기각했다** — *"행 위를 지나야 존재가 드러나 «누를 수 있는 것인지 라벨인지» 모호했다."* 면을 채우지 않는 이유는 그러면 이 화면이 통째로 제거하는 화면처럼 보이기 때문이고, 대개 이 화면을 여는 이유는 **보는 것**이다. [Remove]·[Revoke] 둘 다 Dialog 확인 한 번(되돌릴 수 없다 — audit #20, 2026-09-24. 옛 판정 "Revoke 확인 없음"(malmoi#18)의 반전이고, 식별 수정은 그대로다) |
| 대기 초대 행의 글리프 | **mail 칩**(32 원 · `bg-foreground/[0.05]` · `Mail` 14). ⚠️ **아바타가 아니다** — 아직 사람이 아니라 보낸 링크이고, 이니셜 원을 그리면 멤버 카드의 행과 구별되지 않는다 |
| 대기 0건 | `EmptyRowCard`를 **카드 안에**(`inset`) 세운다 — 칩 **40 원** · 글리프 16(`size-4` — 캔버스 18은 §6.8 스케일 밖이다) · padding **32** · gap 10, **버튼이 없다**(할 일은 헤더의 [Invite]다). ⚠️ **`/projects`의 서 있는 빈 카드와 규격이 다르다**(칩 36 라운드 사각 · 글리프 16 · padding `48 24`) — 앞은 화면의 착지점이고 이쪽은 카드 하나가 비었다는 보조 신호라 무게가 다르다. 갈래를 `inset`에 묶어 `/projects` 값을 안 건드린다. ⚠️ `components/ui/empty-state.tsx`를 쓰지 않는다 — 그쪽은 칩 48 + `py-12`이고 맞추면 소비자 아홉이 함께 움직인다 |
| 사유 띠 | 들여쓰기 **60** · `text-xs` · 배경 `bg-foreground/[0.02]` · 위 선 `border-foreground/[0.06]` · **언제나 `text-muted-foreground`**. ⚠️ **색이 사유에 따라 갈리지 않는다** (2026-09-20 사용자 — *"alert 계열 말고 그냥 일반 계열"* · 옛 판정 *"막힌 동작은 `text-destructive`"*의 철회). 마지막 오너는 **막힌 예외가 아니라 상시 상태**다: 오너가 하나인 프로젝트에서 그 행은 **언제나** 참이라(`planMemberChange`), 붉게 두면 경고가 배경이 되고 **진짜 거부인 사후 `Alert`의 무게를 깎는다**. 문장은 그대로 보인다 — 잠깐 가려 봤다가(sr-only) 같은 날 되돌렸다: 꺼진 컨트롤만 남으면 *왜* 꺼졌는지가 화면에서 사라진다. ⚠️ **톤 슬롯 자체를 지웠다** — `MemberRow`의 `bandTone`은 제거했고 `BannerLine`의 `tone="danger"`는 **소비자가 0**이다(호출부가 되살릴 자리를 없애는 것이 요지다). ⚠️ **검정(`text-foreground`) 띠는 없다** — 13px 캡션이 검정이면 바로 위 행 이름과 같은 급이 된다 |
| 헤더 우측 사유 | `text-xs`(13) — 카드 헤더 설명·행 메타와 같은 급이다. ⚠️ **`text-sm`(14)이면 제목 옆에서 한 단계 무거워져** [Invite]와 제목 사이의 위계가 흐려진다(2026-09-19 실측에서 14로 나가 있었다) |

#### 실측 (2026-09-19 · 1440×900 · computed style + CDP)

⚠️ **모달 높이는 뷰포트에 물린다** — `min(80svh, 800, 100svh-96)`이라 1440×900에서만 캔버스의 720이 나온다.
좁은 창에서 재면 561이 나오고 그것을 이탈로 오진하게 된다.

접근성은 `Accessibility.getPartialAXTree`로 쟀다(jsdom의 accname은 브라우저와 다르다). 확인된 것:

- 꺼진 셀렉트·[Remove]가 **`focusable: true`이면서** `description`에 사유를 싣는다 — `aria-disabled`를 고른
  판단이 실제로 작동한다는 증거다. 진짜 `disabled`였다면 `focusable: false`라 그 경로가 죽는다.
- `<ul>`의 접근 이름이 카드 제목(`Members`)이고, 카드 `h2`가 `focusable: true`다(제거 뒤 착지점).
- 모달의 Role 카드가 `role=radio` + `name="Editor Can translate and publish"` — 지시자 없는 카드인데도
  이름이 내용에서 온다. ⚠️ POSTMORTEM 2026-09-13이 `role=combobox`에서 **빈 이름**을 낸 자리와 같은 형이라
  이 라운드에서 확인했다.
- 읽기전용 칩은 **`sr-only` 텍스트**로 역할 + 사유를 들고 보이는 낱말과 자물쇠는 `aria-hidden`이다.
  ⚠️ **`aria-label`을 쓰지 않는다** — 그 칩은 role 없는 `<span>`이고 ARIA 1.2는 `generic`에 이름을
  붙이는 것을 **금지**한다. Chromium은 그 노드를 unignore해 이름을 실어 주므로 **CDP 실측이 통과
  신호를 준다** — 그것은 Chrome이 관대하다는 사실이지 계약이 아니다(2026-09-19 리뷰가 잡았다).
  **이 부류는 실측으로 반증되지 않으므로 규격을 근거로 판정한다.**

⚠️ **밟지 못한 갈래 셋** — 좌석 10/10 · 복호화 실패 행 · 보관된 프로젝트. 단위 테스트로만 서 있고
**실측으로 확인되지 않았다.**

#### 사전 차단 — **감추지 않고 꺼서 그린다**

⚠️ **이 화면이 "컨트롤만 role로 갈린다"는 관용구를 뒤집는다** (2026-09-19). 다른 화면(§6.66 · §6.68 ·
§6.63의 띠 링크 셋)은 **할 수 없는 컨트롤을 안 그린다.** 멤버는 반대다 — **그리고 끈 뒤 이유를 붙인다.**

근거: 이 화면은 EDITOR도 들어오고(게이트가 `translation:write`다) **같은 화면을 OWNER와 함께 본다.**
감추면 오른쪽 끝이 통째로 비어 "여기에 무엇이 있었는지"조차 안 보이고, 둘이 말을 맞출 수 없다. 다른
화면들은 그 자리에 "누가 할 수 있는지"를 **문장으로** 넣을 수 있었지만 여기는 행마다 컨트롤이 선다.
**다음 화면은 어느 쪽을 따를지 이 문단으로 판단한다**: 같은 화면을 두 역할이 나란히 보고, 그 컨트롤이
행 단위로 반복되면 멤버 쪽이다.

| 갈래 | 화면 |
|---|---|
| EDITOR | 좌석 라벨 자리에 `Only project owners can invite or change roles` + **꺼진 [Invite]**. 역할은 자물쇠 칩, [Remove]·[Revoke] 없음. ⚠️ **띠는 안 그린다** — 그 사유가 설명할 행동이 EDITOR에게 없다 |
| 좌석 10/10 | `10 of 10 seats — remove someone to invite` + 꺼진 [Invite]. ⚠️ **EDITOR × 좌석 초과는 역할 사유가 이긴다** — 좌석이 비어도 그 사람은 초대할 수 없으므로 좌석 문구가 거짓 희망이 된다. 판정은 `planSeatNotice`의 단언이 든다 |
| 마지막 오너 | 그 행의 `Select`·[Remove]가 꺼지고 **행 아래 띠**가 사유를 든다 |
| 못 읽은 행 | 행이 **남고** 띠가 사유를 든다. 역할·가입일은 정상이다. ⚠️ **EDITOR에게도 보인다** — 막힌 행동이 아니라 행이 그렇게 보이는 이유를 말한다 |
| 못 읽음 + 마지막 오너 | **띠 하나에 문장 둘**(못 읽음 → 마지막 오너 순). 한 행에 띠는 항상 하나다 — 둘이면 `aria-describedby`가 어느 쪽을 가리킬지 화면마다 정하게 된다 |

⚠️ **꺼진 컨트롤은 `aria-disabled`다, `disabled`가 아니다.** 진짜 `disabled`는 포커스를 못 받아
`aria-describedby`의 전달 경로가 없고, 그러면 "꺼진 컨트롤에는 반드시 이유가 붙는다"가 성립하지 않는다.
**`loading`과 겸용 불가다**(그쪽이 진짜 `disabled`를 건다). 겉모습의 철자는 `button.tsx`·`select.tsx`가
들고 호출부는 **속성만** 세운다 (§6.4 · `disabled-pairing.test.ts`).

⚠️ **Radix 컨트롤을 끌 때는 그것이 *어느 이벤트에서 여는지*를 `dist/index.mjs`에서 센다.**
`Select.Trigger`는 셋(`onPointerDown`·`onClick`·`onKeyDown`)이고 셋 다 막아야 한다 — 포인터만 막으면
**우리가 건너뛴 핸들러가 라이브러리의 포인터 종류 감지를 무력화해 클릭이 도리어 열어 준다**
(POSTMORTEM 2026-09-19). 키 가드는 `Tab` 외 전부를 막는 **화이트리스트**다(블랙리스트는 타이프어헤드를 못 덮는다).

⚠️ **사전 차단은 편의이고 차단이 아니다.** 다른 탭이 그 사이 좌석을 채우거나 오너를 바꾼다 — 서버 거부
셋이 전부 남는다. 그래서 **화면과 서버가 같은 판정 함수를 부른다**(`planMemberChange` ·
`planInvitationCreate`를 감싼 `planSeatNotice`)고, 사전 사유와 사후 `Alert`이 **같은 문자열**
(`accessErrorMessage("last-owner")`)을 쓴다. 그 동일성은 `members-cards.test.tsx`가 **렌더로** 센다 —
소스에 그 이름이 있는지 세는 검사는 오늘 이미 green이다 (POSTMORTEM 2026-09-18).

⚠️ **같은 문자열이지만 같은 색은 아니다**(2026-09-20) — 사전 띠는 `muted`이고 **사후 `Alert`만 붉다**.
사전은 오너가 하나이면 **언제나 참인 조건**이고 사후는 **사람이 방금 시도한 것에 대한 답**이라, 둘을
같은 붉기로 두면 매번 서 있는 쪽이 진짜 거부의 무게를 깎는다. ⚠️ **`disabled`가 아니라 `aria-disabled`
라는 결정은 그대로다** — 그 띠를 `aria-describedby`로 전달할 포커스 경로가 사라지면 사유도 사라진다.

#### ⚠️ 캔버스와 의도적으로 갈린 여덟 (2026-09-19 사용자 판정 — **프리미티브가 이긴다**)

`/design-sync` 2단계의 *"프리미티브와 어긋나면 프리미티브가 이긴다"*를 적용한 자리다. 캔버스가 이
화면만 다른 값을 그렸고, 따라가면 같은 컨트롤이 화면마다 두 모양이 된다.

| 무엇 | 캔버스 | 이 리포 | 왜 |
|---|---|---|---|
| 행 안 컨트롤 높이 | 32 | **36**(`h-9`) | `Button`·`SelectTrigger`의 기본값이다. 32를 만들면 `size`가 넷이 되고 *"어느 걸 쓰나"*가 매 화면 판단이 된다(§6.4). **대가**: 아바타 32와 컨트롤 36이 어긋나 캔버스가 노린 *"행의 세로 리듬이 하나"*가 깨진다 |
| 초대 모달의 Email `Input` | 40 | **36**(`fieldClass`) | 같은 이유. `Input`·`Textarea`·`SelectTrigger`가 한 값을 공유한다 |
| 꺼진 [Invite]의 면 | 흰 면 + 테두리 + `#a3a3a3` | **`bg-muted`**(`buttonClass`의 `aria-disabled:` 짝) | 2026-09-17에 *"같은 pending이 화면마다 다르게 보였다"*를 고치며 세운 전역 규칙이고, `disabled-pairing.test.ts`가 호출부의 철자 발명을 0으로 고정한다 |
| 아바타 이니셜 글자 | 12 | **13**(`Avatar`의 `text-xs`) | 프리미티브가 `size === 56 ? text-xl : text-xs` 둘로만 가른다. 한 자리를 위해 분기를 늘리면 다음 크기마다 같은 판단이 생긴다 |
| 발급 링크의 letter-spacing | 0.01em | **0.02em**(`--text-sm--letter-spacing`) | 타입 스케일이 크기와 자간을 **짝으로** 든다(§4). 한 자리만 덮으면 같은 `text-sm`이 화면마다 다른 자간을 갖는다 — 실측 차이는 0.14px다 |
| 자물쇠 글리프 | 13 | **12**(`size-3`) | §6.8이 아이콘 크기를 넷(16·14·12·20)으로 고정한다. 13을 쓰면 **리포 최초의 임의 아이콘 치수**가 생기고, §6.63의 등재된 이탈 2번(*"빈 상태 글리프 16 — 18은 다섯째 값이 된다"*)의 근거가 죽는다 |
| 카드 안 빈 상태 글리프 | 18 | **16**(`size-4`) | 같은 이유. `/projects`의 서 있는 빈 카드가 이미 같은 판단을 내려 뒀다(§6.63 이탈 2번) — 두 자리가 같은 값이다 |

⚠️ **`danger` variant의 색도 캔버스와 1:1이 아니다** — 캔버스는 `#b91c1c`(red-700)이고 이 리포의
`--destructive`는 `hsl(0 72.2% 50.6%)`다. 같은 이유로 프리미티브를 따른다(§2.3).

#### 초대 — `OnboardingModal` 폼 하나 (2026-09-23, invitation-email)

[Invite member]와 모달을 **같은 클라이언트 컴포넌트**(`members-panel-header.tsx`)가 든다 —
`OnboardingModal`은 제어형이고 `DialogTrigger`가 없다. 정본은 Claude Design `Invite Modal.dc.html`
(`1a`–`1i`·`1l`)이고 아래는 2026-09-23 Chrome 실측값이다.

- **흐름은 하나다**: 입력 → 전송 → 성공이면 **닫힘 + 토스트**(`Invitation sent` / `Invitations sent to N people`),
  오류면 같은 폼. ⚠️ **링크 얼굴·결과 화면·Done이 없다** — 원문 링크는 메일로만 나간다(클라이언트 상태에 토큰이
  없다). `members-screen.test.ts`가 모달 소스에서 `routes.invite(`·`/invite/`·`token`을 0으로 센다.
- **행 = 사람 하나**: Email `Input`(flex 1 · 36) · Role `Select`(**168** 고정 · 36) · 제거 ghost **36** 정방,
  갭 **8** · 행 사이 **10**. 열 머리 `Email`/`Role` **13 · `--muted-foreground`**, 오른쪽 **44**(제거 36 + 갭 8) —
  빈 행 하나로 열리면 두 번째 컨트롤이 무엇인지 값만으로 안 읽힌다. 한 행일 때 제거는 **꺼진 채 자리를 지킨다**.
- ⚠️ **역할 셀렉트의 이름은 `aria-labelledby="{숨긴 라벨} {트리거 자신}"`이다** — `aria-label`만 주면 버튼형
  combobox가 값을 안 실어 여덟 행을 탭으로 돌 때 Editor/Owner를 들을 수 없다(실측 이름 `Role for {email} Editor`).
  제거 버튼은 `Remove {email}`, 빈 행은 `recipient {n}`.
- ⚠️ **Email은 `type="text"` + `inputMode="email"`이다** — `type="email"`이면 브라우저가 앞뒤 공백을 지워 표시가
  원문이 아니게 되고, 제출 전에 자기 검증 말풍선을 띄워 **행 사유 검증이 한 번도 돌지 않는다**(jsdom 실측).
  폼은 `noValidate`. 판정은 `parseRecipients` 하나다.
- **역할 메뉴** `SelectContent` **280** · 항목 두 줄(`SelectItem`의 `description` — ⚠️ **`ItemText` 밖이다**,
  안에 두면 닫힌 트리거에도 두 줄이 찍힌다). 폼에는 역할 설명·붙여넣기 안내 캡션이 없다.
- **키보드**: 이메일에서 Enter는 **아래에 행 추가**(제출이 아니다 — 여덟 행에서 Enter 제출은 다 치기 전에 나간다),
  IME 조합 중 Enter는 통과. 여러 주소 붙여 넣기는 쉼표·줄바꿈·공백으로 갈라 행이 되고 포커스는 마지막 새 행.
  행 삭제 → 다음 행 이메일(마지막이면 [Add another]). ⚠️ **열리면 첫 이메일이다 — `initialFocusRef`로 준다**:
  소비자 effect로 주면 jsdom은 green인데 Chrome에서는 Radix의 열림 자동 포커스가 뒤에 돌아 **패널이 가져갔다**
  (`modal-initial-focus.test.tsx`가 그 핸들러를 걷으면 red다).
- **[Add another]는 테두리 있는 `default`** — h36 · px 12 · `Plus` 14. 스크롤이 끝난 목록 아래에서 ghost면 버튼인지
  안 읽힌다. **스크롤하는 것은 행 목록뿐**이고 열 머리·[Add another]·바닥은 고정이다(1280×720에서 목록만 스크롤,
  바닥은 화면 안 — 실측). 목록은 `p-1` + `-mx-1 -my-0.5`로 포커스 링 자리를 둔다.
- **오류가 서는 자리는 둘뿐이다**: **그 행 아래**(주소 형식·목록 안 중복·이미 멤버 — `CircleX` 14 · 13/1.6 · 갭 8 ·
  오른쪽 44 · 입력 테두리 destructive)와 **본문 맨 위 폼 `Alert` 하나**(제한·결과 미확인은 `warning`, 발송 실패·
  메일 설정·21명 이상은 `danger`). 같은 주소에 역할 둘이면 **양쪽 행**, 같은 역할이면 **뒤 행만**이다.
  서버 행 거부의 "아무것도 안 나갔다"는 새 Alert가 아니라 **바닥 왼쪽**이 `Nothing was sent by this request…`로 말한다.
  ⚠️ **사유는 문장이 아니라 사실(`code` + 상대 행 id)로 들고 번호는 렌더 때 센다** — 문장으로 굳히면 행을 지운 뒤
  `Already in row 1`이 자기 자신을 가리킨다. 상대 행이 사라지면 중복 사유도 사라진다. 역할만 바꾸면 주소 사유는 남고
  역할 충돌만 풀린다.
- **바닥 왼쪽 상태 슬롯**은 `aria-live="polite"`이고 **13/1.6**이다(껍데기 값 그대로다 — 바닥 슬롯이 이미 `text-xs leading-[1.6]`이라 이 모달이 덮는 것이 없다. 상태
  문장이 두 줄까지 길어지는 유일한 바닥이다). 좌석 수 → `Sending invitations…` → `Nothing was sent…`을 한 자리에 쓴다.
- **전송 중**은 입력·역할·제거·[Add another]·X·Esc·배경이 전부 잠긴다(`closeDisabled`). 주 버튼은 스피너 + 같은 라벨
  (`loadingLabel`이 없다), 라벨은 수를 든다(`Send invitation` / `Send N invitations`, 0명이면 꺼진 `Send invitations`).
- ⚠️ **제출 버튼이 바닥이라 `<form>` 바깥이다 → `form="invite-form"`으로 묶는다** (POSTMORTEM 2026-09-08).
- ⚠️ **포커스 복귀가 `pending`에 물려 있다** (malmoi#64) — 행 오류는 첫 문제 행 이메일, 폼 Alert는 주 버튼.
  `useTransition`의 pending이 응답 커밋에도 아직 true라 그때 `focus()`하면 무시된다.
- **시각은 서버의 `retryAt`을 UTC로**(`retryAtLabel` — 분 단위로 **올린다**, 내리면 그 시각에 눌러 다시 막힌다).
  캔버스의 `3:40 PM`은 라벨 없는 로컬 시각이라 리포 규칙(CLAUDE.md 날짜)에 진다.

**캔버스와 다른 채 둔 것** (전부 프리미티브·리포 규칙이 이긴 자리다): 폼 Alert 본문 14(캔버스 13 — `Alert`
프리미티브) · 꺼진 주 버튼 `bg-muted`+`--muted-foreground`(캔버스 `foreground/5`+`#a3a3a3` — §6.4 전역 규칙) ·
destructive 글자 `#dc2626`(캔버스 `#b91c1c` — §2.3 토큰, 전 화면 공통) · 1280×720 패널 624(캔버스 576 — 껍데기의
min/max 규칙, 내용이 많으면 상한까지 자란다).

#### 대기 초대의 [Resend] (`1l`)

- OWNER만(`member:manage`). 순서는 **역할 칩 → [Resend](`default`) → [Revoke](`danger`)**, 둘 다 **h36**
  (캔버스 32 — 멤버 행 규칙에 맞춘 design §6 보정) · radius 10 · px 12. 모달·확인창이 없다.
- 처리 중엔 **그 행의 두 버튼만** 잠긴다(`aria-busy`). ⚠️ **처리 중인 행을 집합으로 든다** — 값 하나면 두 행을
  연달아 누를 때 먼저 끝난 응답이 다른 행의 잠금까지 푼다(`pending-resend.test.tsx`). 스피너는 `Button loading`의
  형(스피너 + 라벨)이다 — 캔버스의 라벨 숨김 + 겹침은 2026-09-10 프리미티브 규칙에 진다.
- 성공은 토스트 `Invitation resent to {label}` + 목록 갱신이고 포커스는 **카드 제목**이다(행이 새 초대로 바뀐다).
- ⚠️ **실패·제한·미확인은 행이 아니라 카드 머리 아래 `Alert inset` 하나다** — Resend가 행을 새 초대로 바꾸므로
  행에 매단 안내는 행과 함께 사라진다. 대상 라벨을 문장에 넣고, 목록이 갱신돼도 남고, X 또는 다음 Resend/Revoke에
  지워진다. 사전 거부로 행이 남으면 포커스는 **그 [Resend]**로 돌아온다(실측).

#### 그대로 남는 것

- **행 컨트롤의 라벨은 대상을 든다** — `Change role for {name}` · `Remove {name}` ·
  `Revoke invitation for {email}` · 칩의 `Role for {who} — only owners can change this`. 행마다 같은
  라벨이면 컨트롤이 누구의 것인지 구별되지 않는다. ⚠️ [Remove]의 `aria-label`은 **보이는 텍스트를
  포함**한다 — 음성 입력이 라벨로 컨트롤을 찾는다 (WCAG 2.5.3).
- **거부 문구는 그 행 아래다** (띠와 같은 자리). ⚠️ 이 화면에는 **global Alert 슬롯이 없다** — `?e=`를
  이 경로로 보내는 자리가 없다(거부는 `/projects?e=`로 간다).
- ⚠️ **마스킹은 서버가 한다 — 원문은 와이어에 오르지 않는다** (2026-09-09, sec-audit 발견 4). 전에는 두
  로더가 `email`을 원문으로 내려보내고 `"use client"` 컴포넌트가 렌더할 때 가렸다 — **그러면 원문이 RSC
  페이로드에 그대로 실린다.** `MemberView.emailLabel`·`PendingInvitation.emailLabel`이 **이미 마스킹된
  값**이고 컴포넌트는 그것을 그대로 그린다. 상시 검사는 `members-screen.test.ts`이고 **렌더가 아니라
  소스 스캔**이다(페이로드는 눈으로 안 보인다) — 그 금지선은 이제 `components/members/**`의
  `"use client"` 파일을 **전수로** 훑는다(파일 둘 하드코딩이었고, 파일이 넷이 되자 신설분이 방어선 밖이었다).
- ⚠️ **대기 초대는 마스킹한 주소가 유일한 식별자다** — 첫 글자만 남기면 서로 다른 둘이 같은 행이 된다
  ([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)). 서버가 **`maskedEmailLabels`**
  (`lib/auth/invite-label.ts`)로 **목록 전체를 보고** 충돌하는 행만 접두를 늘린다 — 충돌이 없으면 출력이
  `maskEmail`과 글자 하나까지 같다 (§6.1). ⚠️ **이름이 `maskedInviteLabels`가 아니다** — 그 이름은
  같은 함수의 옛 별칭이고 이 문단이 2026-09-19까지 그것을 가리키고 있었다.
- ⚠️ **행을 지우는 성공(제거·철회) 뒤 포커스는 그 카드의 제목으로 간다**
  ([malmoi#51](https://github.com/SinhyeokKang/malmoi/issues/51)). 포커스를 쥔 행이 사라지면 브라우저가
  `body`로 떨어뜨린다. **이웃 행이 아닌 이유**: 마지막 행을 지우면 없고, 제목은 대기 초대가 빈 상태로
  접혀도 남는다. ⚠️ **2026-09-19에 착지점이 페이지에서 카드로 내려왔다** — 카드가 자기 헤더를 들면서
  페이지 `<h1>Members</h1>` 아래에 `<h2>Members</h2>`가 서는 문제도 함께 풀렸다. **id와
  `tabIndex={-1}`을 프리미티브가 한 자리에서 짝지어 든다**(`RowCard`) — 갈라지면 `getElementById`는
  찾는데 `focus()`가 무시되고 그 실패는 `?.`에 삼켜져 조용하다. 결과는 카드마다 **상시 마운트된**
  `role="status"` 한 줄이 대상 이름과 함께 한 번 읽는다 — 빈 상태 갈래 **밖**에 있어야 마지막 철회도
  읽힌다. **역할 변경은 옮기지 않는다**(행이 남는다). 실패는 행 아래 `Alert`가 답하고 ⚠️ **포커스는 그
  행의 [Remove]·[Revoke]로 돌아간다**
  ([malmoi#53](https://github.com/SinhyeokKang/malmoi/issues/53)) — 실행 중 버튼이 `loading`(= `disabled`)
  이라 브라우저가 포커스를 `body`로 떨어뜨린다.

### 6.66 Sources (`/projects/[slug]/sources`) — 목록 + 상세 모달 (2026-09-22, 배포 대기)

**폭 등급은 `fluid`다** — 두 패널 모두 `width="fluid"`이고 카드가 패널을 채운다(시안 `1a`에 max-width
래퍼가 없다. 실측 1440→1174 · 1920→1280 · 1280→1014). ⚠️ **옛 Locales가 들던 이 prop이 이관에서
빠져 한 배포 동안 기본값 `limited`(896)로 좁았다** (2026-09-22) — `typecheck`도 5,008건의 테스트도
green이었고, 증상이 "내용이 안 보인다"가 아니라 **"여백이 넓다"**라 화면을 봐도 결함으로 안 읽힌다.
`shell-layout.test.ts`가 그 뒤로 **소비자별 등급**을 센다(fluid 여섯 · limited 둘).

옛 Locales 두 주소는 인가 뒤 이 목록으로 보낸다. orphaned 언어의 사유·복구 안내를 유지하며,
로케일 코드도 **경로도 sans**다(§4.1). ⚠️ **2026-09-23에 한 번 더 뒤집혔다** — 이 절이 처음 쓰인
2026-09-22에는 "경로에만 mono를 쓴다"였는데, 다음 날 §4.1이 **mono를 `<pre>` 코드 블록 전용**으로
못 박으면서 경로도 그 밖이 됐다. 구현은 아직 `text-mono`를 세 자리에 들고 있다(`sources-screen.tsx` ·
`source-detail-modal.tsx` 둘) — **문서가 정본이고 코드가 따라간다**(/refactor 대기).
로컬 정본은 `design_handoff_sources/Sources.dc.html`이다. 확정 spec이 덮는 동작은
미저장 이탈 확인창 없음·Open translations의 바닥 배치·절대 UTC 시각이다.

| 요소 | 규칙 |
|---|---|
| 목록 | slug 오름차순. 이름·활성 키/언어 수·진행률·사라진 언어 수·평문 적재 상태. OWNER에게만 형식·경로(**sans** — §4.1)·리포/브랜치. 행의 상세 버튼과 Open translations는 형제로 두고 중첩하지 않는다 |
| 역할 | 페이지·상세 읽기 모두 `translation:write`. 연결 정보는 EDITOR 응답에서 제외한다. 추가·첫 적재 재시도·기준 언어 Save는 OWNER 전용. 보관 프로젝트는 OWNER 복원 링크 / EDITOR 소유자 요청 안내 |
| 상세 상태 | URL 없는 클라이언트 선택. 주소·이력 불변, 새로고침은 목록. 안정된 화면 소유자가 추가/적재 결과를 유지한다. 늦은 읽기는 선택/요청 번호로 무시한다 |
| 모달 | 기존 OnboardingModal 그대로. 폭 min(1024px, 창−96px), 본문 좌우32, dim 여백48. 본체·로딩 min(560px, 창높이−96px)/max(800px, 창높이−96px), 오류 min-height 0. 바닥 Open translations + Close. 본문만 스크롤 |
| 로딩·오류 | 제목+값 skeleton 세 블록 + 언어 세 행. 읽기 실패는 Try again, 접근 거부에는 Try again 없음. 성공 후 최신 조회만 실패하면 기존 상세와 성공 결과를 보존하고 재조회 안내 |
| 연결 블록 | OWNER만. 경로·형식·리포/브랜치, border/radius12·muted 배경. 넓을 때 1fr/180/280, 컨테이너850 이하에서 경로 한 줄+형식/리포 두 칸. null은 Not configured, 알 수 없는 형식은 Unrecognized format. ⚠️ **경로·리포 값은 `break-all`이 아니라 `overflow-wrap:anywhere` + `/` 뒤 `<wbr>`다** (malmoi#89) — `break-all`이 `master`를 `m`/`aster`로 갈라 두 값처럼 읽혔다. 조각 경계(`/` · ` · `)에서 먼저 꺾고 한 조각이 칸보다 길 때만 그 안에서 꺾는다 |
| 카드 | Sync status · Base language · Languages. 공유 PanelCard, 간격16, header16, 본문13/16. 정상 적재는 무채색, 실패만 warning. 미적재·진행 중은 info 아이콘 |
| 적재 | not-imported / importing / failed-first / failed-after / imported. 최초 실패만 재시도, 이후 실패는 OWNER에게 워크플로 재실행 안내. Source commit은 원본 커밋 시각이고 적재 완료 시각이라고 부르지 않는다. `<time dateTime>`+UTC 접근 이름, null 시각 생략, 상대 표기는 importing뿐 |
| 기준 언어 | 활성 언어 Select + Save. **적용 대기는 신호 셋이다** — 카드 머리의 `warning` 배지 · Select의 `border-amber-500/50` · 적용값/요청값 두 줄. 저장이 즉시 적용된 것처럼 보이지 않게 하는 장치이고, 배지가 낱말을 들었으므로 아래 Alert에 같은 제목을 또 쓰지 않는다. 선언만 저장한다. 저장 중 refresh와 실패에서도 draft를 보존하고 baseline만 갱신. 오류 뒤 Save 포커스. EDITOR는 적용값만 읽고 대기 시 적용값/요청값을 본다. OWNER만 workflow 한 줄+Copy. 비활성 Select는 pointer/click/key 셋을 막는다 |
| 언어 | base 먼저→활성 코드순→고아(기존 localeProgress 정렬). 코드·Base·완료 수·공유 Meter·검토 수·고아 사유/복구·Open. percent는 완료만, 막대는 완료+검토. 0분모는0%, 동시 읽기 어긋남은 clamp. 고아는 활성 수에서 제외하되 행은 남기며 Open은 비활성 |
| 좁은 표 | 컨테이너640 이하에서 고아 사유를 별도 행으로 내려 코드·진행률·복구 문구를 보존한다 |
| 이탈 | 미저장 확인창 없음. 저장 중 X·Esc·배경·Close·두 Open을 잠그고 그 외 즉시 실행. 닫기 후 진입 행, 사라졌으면 제목에 포커스. 브라우저 Back을 모달 Close로 재정의하지 않는다 |
| 행 시각 | 글리프 칩 28 정방 radius 4 · 글자 `text-neutral-600`(#525252 — ghost Button의 muted를 상속하면 글리프가 경로와 같은 톤이 된다) — 기본 `bg-foreground/5`, **실패만 `bg-destructive/8`+`text-destructive`이고 행 자체는 칠하지 않는다**(눈이 먼저 닿아야 하는 것이 파일 이름이다). 첫 줄은 `text-foreground`로 되돌린다 — ghost Button이 본문을 muted로 상속시켜 시안의 진함/연함 대비가 0이 됐었다. chevron 16 `text-neutral-400`. 상태 줄은 `shrink-0`이라 줄어드는 것이 상태가 아니라 경로 열이다. 상세가 열린 행은 `disabled:bg-foreground/3`으로 눌린 채 남는다 |
| 상태 낱말·글리프 | **색만으로 말하지 않는다** — `First import failed`(데이터 없음·재시도 가능)와 `Last import failed`(기존 데이터 있음·CI에서 고친다)를 목록에서도 낱말로 가르고, 실패는 `CircleAlert` 14 · 진행 중은 `LoaderCircle` 14 회전이 붙는다. ⚠️ **글리프는 목록 전용(`icon` prop)이다** — 상세는 같은 줄을 `Alert` 안에서 쓰고 그 그릇이 이미 아이콘을 그려 경고가 둘이 된다. 사라진 언어는 목록 배지와 표의 `Missing` 배지 둘 다 `danger`(배경 없는 붉은 글자, §6.2의 orphaned 규칙)이고 **파일이 사라졌다고 단정하지 않는다** |
| Add sources | 기존 FilesStep·탐지·수동 경로 재사용. 기존 소스는 체크+잠금. 원자 거부는 선택 보존·Nothing was added, 부분 적재는 추가 성공+warning, 응답 불명은 확정하지 않는다. 소스별 결과·workflow 안내는 목록 고정 영역에 남는다. 모달1024×680, 저장 중 입력/이탈 잠금 |

Logs 필터 **Sources & locales**는 사건 범주이므로 유지한다.

**실측 (2026-09-22, `/design-sync` + `/runtime-test` — 로컬 dev, computed style)**: 1440×900 모달
**1024×800**, 960×900 **864×800**, 960×600 **864×504**(Close 488–528이라 화면 안). 읽기 실패 패널
**301**, 접근 거부 **275**로 둘 다 바닥 행동이 보인다. 모달 radius 16 · 머리 32/32/20 · 제목 20/500/0.005em ·
바닥 24/32 + `border-top #f0f0f0` + 버튼 40/radius 12 · 연결 판 셀 14/16 + 열 1fr/180/280 ·
행 13/16 + 경로 13 — 전부 핸드오프와 일치했다(⚠️ **그때 경로는 mono였다** — 2026-09-23에 §4.1이
sans로 뒤집었고 치수 13은 그대로다).

⚠️ **핸드오프와 의도적으로 다른 자리 셋**: ① 경로 줄바꿈이 `overflow-wrap:anywhere`가 아니라
`break-all`이다(리포 관용구 — `naming.tsx`·`repository-card`가 같다). ② 언어 행의 열 구성은
시안의 4열이 아니라 spec §6이 정한 **6열**이고 행의 `Open`은 공용 `size="sm"`이다. ③ 모달 본문 위
패딩 2px는 공용 `modal.tsx`가 다섯 모달과 공유하는 값이다. **셋 다 프리미티브·확정 spec이 이긴
자리이고, 고치면 이 화면만 다른 폼이 된다.**

⚠️ **넷이었다가 셋이 됐다** (2026-09-23) — 빠진 것은 "연결 판의 경로가 14가 아니라 13이다"였다.
그 13은 **옛 `text-mono` 유틸(13/18)이 강제한 값**이지 이 화면이 고른 값이 아니었고, §4.1이 mono를
걷으면서 근거가 함께 사라져 **핸드오프의 14로 돌아왔다**(형제 셀 둘과 같은 값이다). ⚠️ **목록 행의
경로는 13 그대로다** — 그쪽은 핸드오프 자체가 13이다(위 `1d` 실측의 "행 13/16 + 경로 13").

⚠️ **셸이 `min-w-[1280px]`이라 창 960에서는 문서에 가로 스크롤 320px이 생긴다** — Sources가 만든
것이 아니라 셸의 기존 하한이고, 그 안에서 모달은 `min(1024, 창−96)`을 지킨다.

**2026-09-22 — 캔버스와 1:1로 맞췄다** (사용자 지시). 그 전까지 "기록해 두는 미이행"으로 남겨 둔
넷을 전부 이행했고, 목록 행의 **진행 막대·퍼센트·사라진 언어 배지를 걷어냈다** — 시안 `1a`에 없고
spec이 더한 것이었는데 그 근거가 정본 어디에도 없었다(feature 문서와 함께 사라졌다).

- 카드 머리 보조문 셋(`Updated by imports from your repository.` · `The base language decides which keys exist in this source.` · `Languages come from the repository…`)
- 목록 카드 머리의 `github` 글리프 14 — ⚠️ **`lucide-react` 1.37이 브랜드 아이콘을 뺐다.** 캔버스가 무는
  lucide 0.462의 path를 `components/sources/github-mark.tsx`에 인라인했고 **그 파일이 이 리포의 유일한 브랜드 마크**다.
- 행 안 순서 `상태 → [Open translations] → chevron` — chevron을 행 버튼 **밖 형제**로 뺐다(클릭 영역이 그만큼 줄었다).
- 좁은 폭(`@container/panel`, 1016 이하): 행이 `items-start`, 상태가 셋째 줄, 헤더 설명 숨김, chevron `pt-2`.
- 모달: `[Open translations]`가 **머리 보조 행동**이고(`modal.tsx`에 `headerAction` 추가 — 값이 없으면 안 그려
  기존 다섯 모달의 머리 DOM이 불변) 바닥은 **primary [Close] 하나** + 왼쪽에 읽기 전용 보조문.
- Sync status(옛 Import status)가 `Alert` 상자에서 **칩 28 + 두 줄 행**으로. 적재 이후 실패는 두 행(`1d` ④).
- Languages가 표에서 **행 목록**으로: 코드 열 150(좁을 때 120) · 진행 열 300 · 비고 · [Open] **28/radius 8**(`Button size="sm"` 그대로 — 행 58 → 54) + `arrow-right`. ⚠️ **승인된 이탈이다** (2026-09-24 사용자, audit #47) — 캔버스는 32/10이고 그 값은 버튼의 넷째 높이였다.
  사라진 언어는 국기 `opacity 0.5` · 코드 muted · 막대 `bg-foreground/25` · 비고에 `missing` 배지 · **카드 바닥 스트립**.
- 기준 언어: EDITOR는 **점선 칩 + 자물쇠**, 저장 거부는 상자가 아니라 **붉은 테두리 + 한 줄**.
- **`1j` 폐기 확인창을 만들었다** — `Dialog`(440) · 확정은 danger · [Keep editing]/[Discard change].
  × · Esc · 배경 · 바닥 [Close] · 머리 보조 행동 · 언어 행 [Open] **여섯 길이 전부 같은 문을 지난다**.
  ⚠️ **spec §7이 "확인창을 만들지 않는다"였고 그것을 뒤집은 것이다** — 근거는 시안이 정본이라는 판정이다.
- 빈 상태가 카드 안 중앙 블록(36 칩 · 제목 15/500 · 460 설명)이고 **개수 배지는 0을 그리지 않는다**(`1f`).
- 추가 결과가 카드 **첫 행**(`role="status"` · `bg-foreground/2` · 28 원형 닫기)이고 문장이 소스 이름별이다(`1i`).
- 보관은 공용 `ProjectArchived`가 아니라 **이 축의 카드**다(`1g`) — `Archived` 배지 + 보관 시각 + OWNER에게만 Settings 링크.

⚠️ **`TranslationSurface`에 컬럼 둘을 더했다** — `lastImportedAt`(마지막 **성공** 적재)와 `createdAt`(소스 선언).
시안 `1d`가 `Imported — 5 minutes ago` · `added 2 minutes ago` · `Last successful import`를 말하는데 그 값이
DB에 없었고, `lastCommitAt`(원본 커밋)을 그 자리에 쓰면 거짓이 된다. **backfill이 없어** 그 이전 성공에는
시각이 없고 화면이 시각을 생략한다. 상대 표기여도 `<time dateTime>`의 접근 이름은 UTC 절대값이다.

### 6.67 계정 (`/account`) — 카드 넷 (2026-09-09 6b-4 · 2026-09-10 세션 회수 · 2026-09-13 재편 · **2026-09-16 카드 규격**)

**사용자 축의 유일한 화면이다** (PRODUCT §7.7). 셸 안 `mx-auto max-w-4xl`, 제목 `text-lg font-medium`, **breadcrumb 없다** — 프로젝트 축이 아니라 위로 올라갈 자리가 없다.

⚠️ **본문이 카드 넷이다** (2026-09-16 — 핸드오프 v2). **Profile · Sign-in methods · GitHub App · Sessions** 순서이고 근거는 *나 → 들어오는 길 → 붙어 있는 것 → 나가는 길*이다. 그 전(2026-09-13 재편)은 **머리 하나 + 리스트 셋**이었고 세 가지가 어긋나 있었다: 구역 제목이 **카드 밖** 14/500이라 제목↔리스트 12가 구역 사이 28과 경쟁했고, **Profile만 그릇이 없었으며**(패널 머리에 붙은 블록), 행 규격(글리프 32/radius 8 · 본문 14)이 **셸 안에서 이 화면만** 쓰던 값이었다.

⚠️ **그 재편이 푼 문제는 그대로 유효하다** — 그 전엔 `Card` 다섯이 `space-y-6`으로 평평하게 쌓여 축이 안 보였고, 같은 화면에 "GitHub"이 세 군데(로그인 수단 · 리포 쓰기 권한 · 전체 로그아웃의 확인 상대) 나오는데 그 구별을 **카드 설명문 두 줄**에 맡기고 있었다. 축을 드는 것은 지금도 **카드 제목**이고, 바뀐 것은 그 제목이 사는 자리다.

뼈대(2026-09-16 브라우저 실측 — computed style): 본문 폭 **896**(`max-w-4xl`, 안쪽 래퍼가 든다) · 머리 padding **16** · 본문 padding **16**(`PanelBody`가 `p-4`로 든다 — 화면이 다시 정하면 두 번 적용된다) · **카드 사이 16**(`space-y-4`, 실측 16·16·16 — 전엔 구역 28 + 헤더↔리스트 12) · 항목 사이 **0**.

| 규격 | 값 |
|---|---|
| 카드 | `border-border overflow-hidden rounded-lg border` — radius **12**. ⚠️ **`rounded-xl`은 이 리포에서 16이다** (POSTMORTEM 2026-09-15): 한 단계 둥글어지고 화면에서 모서리가 섞인다 |
| 카드 헤더 | `p-4` · `h2` **15/500/0.015em** + 배지(gap 8) + 설명 한 줄 `ml-auto text-xs muted`. 카드 폭 640px 이상에서는 설명을 제목 옆에 두고, 미만에서는 아래로 내린다 |
| 디바이더 **둘** | 헤더 아래 **`--divider`**(#f0f0f0) · 행 사이 **`--border`**(#e5e5e5). ⚠️ **같은 회색 하나면 머리가 첫 행처럼 보인다** — 옅은 선이 "여기부터 내용", 진한 선이 "항목과 항목"이다 |
| 항목 | `px-4 py-[13px] gap-3` · 글리프 **28**(radius 4 · `bg-foreground/5`) · 본문 `min-w-0 flex-1 flex-col gap-[3px]` · 우측 `flex shrink-0 items-center gap-2` |
| 항목 본문 | **한 줄이다** — `**{이름}** — {상태}` (`PanelRow`의 `name` + `status`). 15/0.015em, 이름만 500. ⚠️ **상태를 13 보조 줄로 내리지 않는다** — 그러면 **부연으로 읽히는데**, 상태는 이 행이 묻는 질문의 답이다. ⚠️ **구분자(em dash)는 프리미티브가 든다** — 호출부마다 문자열에 박으면 한 화면에 `—`와 `-`가 섞인다 |
| 항목 보조 | **다음에 할 일**을 든다 — 13 muted `leading-normal` `tracking-[0.02em]`. 없으면 그리지 않는다. ⚠️ **`tracking-*`을 여기서만 쓴다** — §4가 금지하는 유틸이고 이 화면이 그 예외로 등재돼 있다(값은 `--text-xs--letter-spacing`과 같다) |
| 행 hover | **없다.** ⚠️ Project Home의 attention 행에서 **치수는 빌리고 상호작용은 빌리지 않는다** — 그쪽은 행 전체가 링크라 `bg-foreground/[0.02]`가 깔리지만, 여기서 누를 수 있는 것은 우측 버튼뿐이라 hover를 주면 행을 눌러도 되는 것처럼 보인다 |
| 글리프 | provider면 **브랜드 마크**(무채색 위계 밖), 그 밖은 lucide **회색**(`link-2` · `log-out` · `monitor-smartphone` — 동작을 가리킨다). ⚠️ **캔버스는 그 회색을 `#525252`로 그렸고 구현은 `--muted-foreground`(#737373)다 — 의도적 이탈이다**: §6.2가 "새 raw 색을 늘리지 않는다"인데 **neutral-600은 이 화면 하나를 위한 신규**다. ⚠️ **근거를 "리포는 늘 토큰을 쓴다"로 적지 않는다 — 그건 거짓이다**(2026-09-16 리뷰): `components/home/count-cards.tsx`가 캔버스 `#a3a3a3`에 맞춰 글리프를 **raw `neutral-400`**으로 두는 선례이고, 그 문장을 읽은 다음 사람이 그 파일을 보면 이탈 전체를 뒤집는다. 가르는 선은 **그 raw가 이미 여러 화면이 쓰는 것인가**이다 |
| 배지 | **수단 카드에만** `Badge variant="neutral"`로 `{connected} of {total}`. ⚠️ **새 variant를 만들지 않았다** — `neutral`이 이미 `bg-foreground/5 text-foreground`이고 프리미티브 기본값(radius 999 · `px-1.5 py-0.5` · 13/500 · `min-w-5`)이 캔버스 스펙과 그대로 맞는다. 값이 같은 variant를 하나 더 두면 다음 사람이 어느 쪽을 쓸지 고민한다. ⚠️ **분모를 보인다** — 숫자만 두면 Project Home 배지와 형은 같아지지만 "하나 더 붙일 수 있다"가 안 읽힌다 |

**설정 재편에서 `components/ui/panel-card.tsx`로 승격했다**(2026-09-20). 이전 AccountCard/Rows/Row/Facts
소비자를 각각 **4 / 3 / 3 / 1**로 센 뒤 계정 화면을 전환했다. 이름은 PanelCard/Rows/Row/Facts이고,
당시 locales는 제목 없는 PanelCard였다. 지금은 Sources의 이름 있는 카드로 옮겼다. 옛 `Card`는 삭제됐다.
Project Home의 별도 카드까지 합치지는 않는다 — 그쪽의 빈 상태·details·Meter는 그대로 소유한다.

⚠️ **`PanelCard`가 `<ul>`을 만들지 않는다.** Profile 카드의 몸통은 목록이 아니라 **사실 블록**(`PanelFacts` — 라벨 열 **96** `text-xs text-neutral-400` · `px-4 py-3.5`, Project Home 오른쪽 `Project` 카드의 메타 열과 같은 형)이다. 카드가 감싸면 `<ul>` 안에 `<div>`가 들어가고, 스크린리더가 **편집 가능한 폼을 "목록, 항목 3개"로 예고**한다. 행을 드는 카드 셋만 `PanelRows`를 쓴다.

⚠️ **우측 클러스터가 `shrink-0`이라 실패 Alert를 그 안에 두면 행이 패널 밖으로 밀린다** (2026-09-13 리뷰). 좌측 본문이 `min-w-0`으로 먼저 truncate되고도 모자라기 때문이다. `DisconnectGithubButton`·`ConnectGithubButton` 둘 다 **실패 문구를 바깥이 들도록** 콜백을 받는다(`onFailure`·`onResult`) — `/account`는 그것을 **카드 Alert**로 올리고, 설정 화면·온보딩은 기존처럼 버튼 아래 그린다.

⚠️ **쿼리 슬롯이 넷이고, 머리에 서는 것은 하나다** (2026-09-16에 `?link=`가 내려갔다). 가르는 축은 **"다시 시도할 컨트롤이 이 화면에 있는가"**다 — `?e=`(연결 왕복이 화면 밖에서 깨졌다)만 **머리 Alert**이고, `?link=`(수단 해제 거절)·`?sessionRevocation=`·`?connect=`는 **그 카드 안**이다. `?link=`가 카드로 간 이유: 마지막 수단이라 거절된 것이면 **다시 누를 행이 그 카드에 있다.** ⚠️ **머리가 하나가 되면서 머리 높이가 고정됐다** — 전엔 `?e=`·`?link=`가 **동시에 설 수 있어** 무엇이 실패했는지에 따라 본문이 밀렸다. ⚠️ **[Dismiss]는 머리 Alert에만 있다** — 카드 Alert를 치우면 바로 아래 재시도 컨트롤 옆에서 **사유만** 사라진다. 덕분에 숨길 수 있는 지역 상태가 없어져, "닫은 알림이 같은 주소로 돌아온 두 번째 실패에서 무음"(POSTMORTEM 2026-09-14)이 **원리적으로 생기지 않는다**.

| 블록 | 규칙 |
|---|---|
| Profile | 헤더 `Profile`(배지 없음) + 사실 블록: 아바타 **56** + [Image upload]·[Delete] + 캡션(gap 6) / `Name` 라벨 + 필드 **320×36** + [Save] / `Email` 라벨 + **읽기 전용 필드** + 출처 한 줄. ⚠️ **이름은 편집 가능하고 이메일만 읽기 전용이다** (2026-09-13) — 이메일을 고칠 수 없는 근거는 초대 대조가 **검증된 주소** 위에 선다는 것이고 그 논증은 이메일 축에서만 성립한다. ⚠️ **"재로그인마다 `planEmailRefresh`가 갱신한다"가 이름에도 걸린 것처럼 적혀 있었고 거짓이었다** — 그 함수는 입력 넷이 전부 이메일이다. 값은 세션이 아니라 **`User` 행**에서 읽는다. ⚠️ **주소가 sans다**(§4.1) · **마스킹하지 않는다**(자기 주소다) · 이메일 필드는 `disabled`가 아니라 **`readOnly` + `tabIndex={-1}`**(disabled면 접근성 트리에서 빠져 자기 주소를 못 읽는다)이고 **글자가 기본색**이다(muted 면 위 muted 글자는 14px에서 4.35:1로 하한을 깬다). ⚠️ **저장 피드백은 [Save] 오른쪽 `text-xs` 인라인**이고 토스트가 아니다 — 그 형이 이 리포에 0이다. ⚠️ **편집은 페이지 레벨이다** — Dialog로 되돌리지 않는다 |
| Sign-in methods | 헤더 + 배지 `{connected} of {total}` + 오른쪽 한 줄. 행이 **언제나 둘이고 순서가 고정**이다(`LOGIN_PROVIDERS`). 본문 `**GitHub** — Connected` / `**Google** — Not connected`. ⚠️ **보조 줄을 그리지 않는다 — 의도적 이탈이다**: 캔버스는 연결됨에 `Signed in with this method last on {date}.`를 두는데 **그 데이터가 리포에 없다**(`Account`에 마지막 사용 컬럼이 없고 `Session`은 provider를 모른다). 미연결 행에만 그리면 두 행 높이가 갈리므로 둘 다 안 그린다. **되살리려면 스키마가 늘고, 그 순간 이 기능의 "스키마 변경 없음"이 깨진다.** **마지막 수단은 버튼을 지우지 않고 비활성 + 왼쪽에 사유** — 버튼이 사라지면 "원래 없는 기능"으로 읽힌다 |
| GitHub App | ⚠️ **카드 제목이 `GitHub App`이다** (2026-09-16 — 전엔 `GitHub account`). 이 화면에 "account"가 이미 셋이고(계정 화면 · 로그인 수단의 GitHub · 이 연결), 붙어 있는 것은 계정이 아니라 **설치된 app**이라 뒤쪽 낱말만 바꿨다. `Malmoi app`(New Project 모달의 어휘)을 버린 이유: 사용자가 묻는 것은 "내 GitHub에 무엇이 붙어 있나"이고, 우리 제품 이름을 앞에 세우면 malmoi 안의 기능처럼 읽힌다 — 정작 가서 끊는 곳은 GitHub이다. ⚠️ **해제 Dialog 제목과 표기가 같아야 한다**(`Disconnect GitHub App from malmoi?`) — 한 화면에 `GitHub app`과 `GitHub App`이 같이 서면 **같은 사전의 다른 절**에 살아 리뷰로 안 걸린다(2026-09-13에 `malmoi`/`Malmoi`가 정확히 그랬다). 설정 화면 §6.6은 같은 로더의 **4갈래**(`ok` 연결됨 / `ok` 미연결 / `reauthorize` / `unavailable`)를 복구 안내에 쓰며, 독립 계정 카드는 계정 화면에만 남는다. 본문이 `**@handle** — {상태}`이고 **보조 줄이 갈래마다 다르다**(전엔 본문이 핸들 하나, 보조가 `Connected · Installed on …`이었다). 상태 넷은 짧은 구절이다: `Connected` · `Not connected` · `Authorization expired` · `Couldn't load`. 보조 줄은 **키로 적는다** — `account.github.hintNotConnected`(연결하면 무엇이 보이나) · `hintReauthorize`(무엇이 막히고 무엇이 안 막히나) · `hintUnavailable`(다시 열어 보라) · 연결됨은 `installedOn`. ⚠️ **긴 문장은 값이 아니라 키를 적는다** (2026-09-16 재검토 🔴1): 정본에 문장을 박아 두면 `messages/en.tsx`를 고칠 때마다 **여기를 같이 세야 하고**, 한 번 놓친 순간 정본이 **폐기된 값을 현재 값으로** 들어 다음 사람이 "정본대로" 되돌린다 — stale 문서가 아니라 **잘못된 지시**다. 실제로 이 절이 그 상태로 한 라운드를 났다<br>⚠️ **재인가 문구가 "발송이 멈춘다"고 말하지 않는다** (2026-09-16 리뷰 🔴1). 한때 `malmoi can't send changes until you reconnect.`였고 **거짓이었다** — `ensureUserToken` 소비자는 넷뿐이고(`account-view` · `installed-repos` · 프로젝트 Action 둘) **`lib/pull`·`lib/push`에는 0곳**이다. 야간 pull·PR은 `createGitClient`의 **설치 토큰**이 내므로 사용자 토큰이 만료돼도 그대로 돈다. 그 문장을 믿으면 없는 장애를 찾거나 **멀쩡한 App 설치를 다시 만든다**. ⚠️ **`unavailable`에만 컨트롤이 없다** — 조회 실패를 "연결 안 됨"으로 접으면 사용자가 멀쩡한 설치를 다시 만든다. `reauthorize`는 장애가 아니라 인가 만료라 다시 연결할 문이 필요하다 |
| [Installation settings] | ⚠️ **연결됨에만 선다** (2026-09-16 신설). 리포를 붙이거나 빼는 문이 전엔 **New Project 모달 안에만** 있어 프로젝트를 만들려던 사람만 그 링크를 봤다 — "지금 무엇이 붙어 있나"를 읽는 자리에 둬야 그 자리에서 고친다. 나머지 세 갈래는 설치를 못 믿는 상태라 **밖으로 나가는 문을 두면 "고치러 갔는데 고칠 게 없는" 자리에 착지한다**. ⚠️ **나가는 것이 왼쪽, 파괴적인 것이 오른쪽 끝**(세션 카드와 같은 순서)이다 — 링크는 `default`, [Disconnect]는 **`danger`**다(2026-09-24, audit #50 — 그 전엔 둘 다 `default`였다, §6.4 "같은 행동은 같은 형이다"). ⚠️ **목적지가 `apps/<slug>/installations/new`다** — `Account`에 설치 ID 컬럼이 없고 설치가 여럿일 수 있어 "어느 설치인가"에 답이 없다. 그 주소는 이미 설치한 계정을 GitHub이 설정 화면으로 보낸다. `GITHUB_APP_SLUG`가 없으면 **그 링크만 조용히 사라진다**. ⚠️ **`ButtonLink`가 아니라 `<a>` + `buttonClass()`다** — 그 프리미티브는 `next/link`라 `target`·`rel`을 안 받는다(§6.3의 외부 링크 규칙: 글리프 없이 `target="_blank" rel="noreferrer"`). 프리미티브를 넓히면 `Button`↔`ButtonLink` 소비자 74곳이 함께 움직인다 |
| 설치 리포 집계 | `Installed on {n} repositories.` — **연결됨 갈래의 보조 줄**이다(다른 셋은 그 자리에 `hint*`가 선다). 설치 설정으로 나가기 전에 **그 숫자가 바꾸려는 값**이라 나가는 링크와 같은 행에 있다. ⚠️ **`null`(못 읽었다)과 `0`(고른 것이 없다)은 둘 다 그 줄을 안 그린다** — `Installed on 0 repositories.`는 연결이 깨진 것처럼 읽히고 행 높이만 갈린다. 판정은 화면 아래에서 갈려 있어 `logFailure`가 원인을 남긴다. ⚠️ **`N projects use this connection.`을 되살리지 않는다** (2026-09-14 리뷰 🔴1 · 2026-09-16 캔버스 정정): 그 N이 세던 것은 **내가 OWNER인 모든 프로젝트**였고 그중 이 연결에 실제로 의존하는 것은 없다 — 야간 pull·PR은 App **설치 토큰**이 내고 사용자 토큰을 한 줄도 안 읽는다. **근거가 될 수 없는 숫자**라 확인 Dialog의 "지금 참인 사실" 자리에도 못 선다. 지금 숫자는 다르다: 사용자가 GitHub에서 **직접 고른 것**이다 |
| Sessions | 본문 `**Sign out** — this device` / `**Sign out everywhere** — all devices, this one included`. 보조 줄은 **둘 다 있고 provider 이름이 없다**(`account.signOut.description` · `account.sessions.willConfirm` — 값은 사전이 든다). ⚠️ **캔버스의 `GitHub will ask you to confirm…`을 행에 쓰지 않는다 — 의도적 이탈이고 근거가 둘이다**: (a) 그 문구는 확인 상대를 아는 갈래에만 서므로 못 고르는 날 아래 행의 보조 줄만 사라져 **두 행 높이가 갈린다** — 수단 카드에서 보조 줄 둘을 다 지운 것과 같은 논거를 같은 화면에서 반대로 적용하지 않는다. (b) **Dialog가 이미 하는 말을 행이 반복하지 않는다** — 첫 판본(`You'll confirm with the account you sign in with before anything changes.`)은 앞 8낱말이 Dialog 회색 설명과, 뒤 절이 검은 줄과 겹쳤다. 행이 들 것은 Dialog가 **아직 안 한 말**, 즉 *이 버튼은 일을 끝내지 않고 나갔다 돌아온다*이다(`confirmAction`이 `Continue to GitHub`인 것과 같은 축). provider 이름은 Dialog의 검은 줄이 든다. 항목 둘이 **한 리스트**이고 **Sign out이 위**다 — 같은 축(지금 열린 것을 닫는다)이고 흔한 쪽이 아래에 있으면 사용자가 되돌릴 수 없는 쪽을 먼저 읽는다. 행 버튼은 Sign out `default` / Sign out everywhere **`danger`**. 실패는 **카드 Alert**다(항목 안에 넣으면 행 높이가 항목마다 달라진다). ⚠️ **행 버튼 라벨을 건드리지 않는다** — 이미 `Sign out everywhere`이고, `Confirm and sign out everywhere`는 **Dialog 확정 버튼의 폴백**(확인 상대를 못 골랐을 때)이라 다른 자리다 |
| 되돌릴 수 없는 넷 | **전부 확인 Dialog를 지난다** (2026-09-13). 그 전엔 수단 해제 하나뿐이었고, 주석이 그 비대칭을 *"`DisconnectGithubButton`은 다시 누르면 복구되는 연결"*로 정당화했다 — **복구가 쉬운 것과 결과가 가벼운 것은 다른 축이다**: 그 해제는 **새 프로젝트에서 리포를 고르는 일과 (재)연결을 막고**, 다시 열려면 OAuth 왕복 전체가 필요하다. ⚠️ **"모든 프로젝트의 발송을 멈춘다"가 아니다** (2026-09-14 정정) — 이미 연결된 프로젝트의 야간 pull·PR은 **설치 토큰**이 내므로 해제 뒤에도 그대로 돈다. 확정 라벨이 **결과**를 말한다(전체 로그아웃은 `Continue to GitHub` — 그 버튼이 일을 끝내지 않는다). **로그아웃만 확정이 primary**이고 나머지 셋은 danger — 잃는 것이 없는 하나를 같은 무게로 칠하지 않는다. ⚠️ **제출 지점이 Dialog 안이면 `pending`도 거기 선다** — 트리거는 overlay 뒤라 스피너가 안 보이고, 그동안 화면이 안 바뀌면 사용자가 다시 눌러 **두 번째 challenge가 첫 것을 지운다** |
| 접근 이름 | ⚠️ **보이는 라벨이 `Disconnect`인 컨트롤이 셋이다.** 이름까지 같으면 브라우즈 모드의 컨트롤 목록과 음성 입력에서 **유일한 로그인 수단 해제**와 **리포 쓰기 권한 해제**가 구별되지 않는다. ⚠️ **대상만 붙이면 부족하다** — `"Disconnect GitHub"`이 양쪽에서 나온다(2026-09-13에 실제로 그랬다). **이름이 드는 것은 축이다**: `Disconnect GitHub as a sign-in method` / `Disconnect GitHub repository access`. 비활성 컨트롤에도 붙인다(접근성 트리에는 남는다) |
| 카드 접근 이름 | ⚠️ **카드 넷 전부 `<section aria-labelledby>`로 자기 `h2`를 가리킨다.** 없으면 Chrome이 `<section>`을 `generic`으로 접어 **접근성 트리에서 카드가 통째로 사라진다**(POSTMORTEM 2026-09-15 #2) — 화면에서 하는 구별이 그 사용자에게만 없어진다. ⚠️ **검사는 개수를 센다**(`section` 넷 + 각자의 labelledby 참조가 살아 있는지) — "region이 있다"만 세면 하나가 이름을 잃어도 그대로 지나간다(POSTMORTEM 2026-09-14 #1) |

⚠️ **로딩 골격은 카드 셋까지다**(Profile · Sign-in methods · GitHub App). Sessions를 안 그리는 근거는 "그 구역이 기다리지 않아서"가 **아니다** — `loading.tsx`는 세그먼트 전체의 fallback이라 Sessions도 그동안 안 그려진다. 대가는 그 리스트 한 벌만큼의 높이 변화이고, 받아들이는 이유는 **골격이 길수록 화면이 "다 왔다"고 거짓말한다**는 쪽이다. ⚠️ **카드 껍데기·헤더 padding·디바이더 둘은 골격에서도 실물이고** 움직이는 것은 글자 자리뿐 — 골격이 그 값을 안 들면 데이터가 도착할 때 카드 경계가 튄다(POSTMORTEM 2026-09-15 #3의 유령 띠와 같은 축). 치수도 실물이다: 필드 320×36 · 아바타 56 · 글리프 **28**.

⚠️ **페이지 수준 거부는 global `Alert danger`** (§6.4) — callback이 연결 실패를 `?e=`로 여기 보낸다.
**주소창 값이라 `isConnectError`로 거른다**: 캐스팅하면 프로토타입 키가 문자열 자리에 함수를 넣어 화면이
죽는다 (POSTMORTEM 2026-09-08).

### 6.68 이력 (`/projects/[slug]/logs`) — 날짜 카드 + 이벤트 행 (2026-09-20, logs-rework · 시안 `design_handoff_project_logs` 1a–1m)

셸 안 **`fluid`**(§5.1 — 여백·폭 상한은 `PanelHeader`·`PanelBody`가 든다, §5.15가 정본이다). 머리는 **제목 + 검색 + [Refresh] + 필터 다섯 + 한 줄 설명**, 본문은 **날짜 카드**(머리 `2026-09-20 · Today`)에 담긴 **이벤트 행**이다. ⚠️ **breadcrumb이 없다** (§0).

⚠️ **표 다섯 열이 사라졌다.** When·Started by·Result·Files·Reason은 **Publish 실행 하나에만** 맞고, 종류가 여섯이면 번역 편집 행의 Files·Reason이 영원히 빈 칸이다 — **빈 칸은 "값이 없다"와 "이 종류엔 해당 없다"를 구별하지 못한다**(§6.1의 부재 규칙). 그래서 세로로 맞추는 것은 **셋뿐**이다.

**행**: `[시각 48] [글리프 28] [문장 15 + 보조 13] [결과 172] [chevron 16]`

- **시각은 `09:42`만** 든다 — 날짜는 카드 머리가 한 번 든다. 정확한 값은 사라지지 않는다: `<time dateTime>` + `aria-label="2026-09-20 09:42 UTC"`. ⚠️ **행마다 전체 날짜를 적던 옛 형은 활동이 하루 수십 건이 되면 같은 날짜를 스무 번 반복하고 그 폭(약 150)이 문장에서 빠져나간다.**
- **문장이 행위자로 시작한다**(500 굵기). 자동 실행은 `Nightly`·`CI`가 그 자리를 그대로 쓴다 — 사람과 자동화를 같은 문법으로 읽는다. ⚠️ **방향은 낱말과 글리프가 함께 말한다**: 내보내기 `sent … to GitHub`/`git-pull-request-arrow`, 가져오기 `synced … from the repository`/`arrow-down-to-line`. 내부 이름이 하나(`SyncRun`)라는 사실이 두 방향을 섞을 근거가 되지 않는다.
- **보조줄은 그 종류가 실제로 가진 맥락만** 적는다. 없는 값을 자리 채우려고 적지 않는다.
- **결과 열은 실행에만 값이 있고 비어 있어도 폭을 유지한다** — 스무 행을 훑을 때 결과가 같은 세로선에 서야 실행만 골라 읽을 수 있다. 번역 저장·역할 변경에 `Sent`류를 붙이면 **없는 실행을 발명하는 것**이 된다.
- **긴 값을 자르지 않는다**(`overflow-wrap:anywhere`). 말줄임 + tooltip을 쓰면 hover가 유일한 확인 수단이 되어 키보드·터치에서 값이 사라진다 — 행 높이가 들쭉날쭉해지는 비용은 받아들인다. 여러 줄 번역은 `white-space:pre-wrap`이다.

**필터 다섯 + 검색**: 종류·기간·행위자는 **단일 선택**(오른쪽 체크 글리프, 고르면 닫힌다), 소스·결과는 **다중 선택**(왼쪽 체크박스, 열린 채로 여러 개). [Apply]가 없다 — 누를 때마다 URL이 바뀐다(예외는 아래 `Custom range`의 Dialog 하나). 켜진 트리거는 **색이 아니라 테두리 `--foreground` + 500**으로도 구별되고, 접근 이름이 축을 포함한다("Source: web, emails").

- **Source 메뉴의 `Project-wide`**는 소스가 없는 사건(멤버·설정)을 고르는 항목이다 — 그 사건에 **가짜 소스 값을 넣지 않기** 때문에 목록에서 빠지는 것을 여기서 되돌린다.
- **Result 메뉴 머리의 한 줄**이 이 축은 실행에만 적용된다는 사실을 고르기 전에 말한다.
- **행위자 메뉴에만 찾기가 있다** — 나머지 넷은 항목이 일곱 이하다.
- ⚠️ **기간의 `Custom range (UTC)`는 네이티브 `<input type="date">` 둘이다** — 라이브러리도 새 프리미티브도 넣지 않는다. **피커 모양을 브라우저가 정하므로 시안과 픽셀이 갈리는 것이 의도된 이탈이다**(아래 "의도된 이탈"). ⚠️ **두 칸은 메뉴 밖 Dialog에 산다** (2026-09-24, audit #8 — WCAG 2.1.1): 메뉴 안에 두면 roving focus가 `menuitem`만 들르고 Tab이 메뉴를 닫아 키보드로 도달할 수 없었다. 메뉴에는 `Custom range (UTC)…` 항목 하나가 서고, Dialog는 [Cancel]/[Apply range]를 든다 — **칸을 바꿀 때마다 이동하지 않는다**(한 칸만 고친 중간 상태가 결과처럼 서지 않게). 닫히면 Date 트리거로 포커스가 돌아간다. 두 칸은 **보이는 라벨이 있는 Dialog 필드**다(`FormGroup` + 기본 `Input` — 메뉴 시절의 `h-8 text-xs`가 아니다) · 설명 한 줄(한쪽을 비우면 열린 범위) · **여는 때마다 URL의 현재 값에서 시작한다**(취소한 입력·프리셋 이전의 범위가 남지 않는다).

**상세 1024** (2026-09-22 사용자 — `/design-sync`) — ⚠️ **캔버스 `1d`의 640 판정을 뒤집은 값이다.** 시안은 640을 *"본문 한 줄이 약 70자에서 끊기는 폭"* 이라는 근거로 못 박았지만, 같은 셸에서 Sources 상세가 `OnboardingModal`(1024)로 서면서 **두 상세가 나란히 다른 판**이 됐고 사용자가 그 불일치를 먼저 발견했다. 확인창 `dialog.tsx`(440)는 여전히 아니다 — Before/After 두 블록과 소스별 결과가 들어가면 줄바꿈이 무너진다. ⚠️ **`modal.tsx`와 폭·radius·dim이 같다**(`w-[calc(100%-96px)] max-w-[1024px]` — dim 여백 48이 그 관용구에 딸려 온다. 옛 `max-w-[calc(100vw-48px)]`는 좌우 24만 비워 시안의 절반이었고 높이만 96을 뺐다) · `rounded-xl` · dim `bg-foreground/32` + `backdrop-blur-[6px]`. ⚠️ **2026-09-24에 dim·radius도 모달로 접었다**(사용자) — 전엔 폭만 빌리고 dim `/35`·blur 없음·`rounded-2xl`을 두어 *"온보딩 껍데기까지 따라가면 라우트를 대신하는 판으로 읽힌다"* 고 판정했는데, 폭을 1024로 맞춘 뒤로는 Sources 상세와 나란히 서서 **blur 유무가 먼저 보이는 차이**가 됐다. ⚠️ **껍데기 컴포넌트는 여전히 따로다**(`components/logs/event-dialog.tsx`) — `OnboardingModal`의 높이 하한 `80svh`가 참조 한 줄뿐인 상세를 빈 판으로 만들고, 머리에 글리프·종류·시각 자리가 없으며 바닥이 [Back]/[Next] 전용이다. ⚠️ **값 열이 860px가 된다**(1024 − 여백 48×2 − 라벨 104 − gap 12)는 것을 **보고 유지한 판정이다** (2026-09-22 실측 스크린샷). ⚠️ **2026-09-24에 머리와 필드가 움직였다**(사용자): 칩이 **40**(`EventGlyph` `size="lg"`, 글리프 20 · radius 10 — 온보딩 ①②의 40 칩과 같은 규격, 목록 행은 28 그대로)이고, 본문이 칩이 아니라 **제목 열에서 시작한다**(`pl-[76px]` = 머리 좌측 24 + 칩 40 + gap 12 — 셋 중 하나를 바꾸면 이 값도 같이 움직인다). 필드는 `dl` 격자에서 **`Table`**(`scrollable={false}`, `border rounded-lg` 박스 · 행 선 `--border` · hover 없음)로 바뀌었고 라벨은 `th scope="row"`(104, `text-neutral-400` 13)다. **행 최소 높이 48(`h-12`)은 [Copy reference]가 든 참조 행이 기준이고**(버튼 28 + 10×2) 세로 정렬은 가운데다 — 값 열 폭은 그만큼 줄었다. 시안이 640을 고른 근거였던 *"본문 한 줄 약 70자"* 는 폭 결정과 함께 버렸고, 격자 `104px 1fr`의 비가 1:4에서 1:8로 간다 — **값에 `max-w`를 두거나 라벨 열을 넓히지 않는다**: 긴 번역 값·긴 키가 줄바꿈 없이 보이는 쪽을 택했다. 나머지 껍데기 값은 시안대로다(머리 24/24/16 · 제목 18/500 · 닫기 36 ghost · 푸터 위 선 `--divider` · 그림자는 `shadow-medium` — `--shadow-medium`이 시안이 적은 `0 6px 16px 2px rgba(22,24,27,0.15)`와 **바이트 단위로 같아** raw를 토큰으로 바꿨다). **dim은 임의 hex가 아니라 토큰 + 불투명도다** — §6.2의 "새 raw 색을 늘리지 않는다"가 그 형이고, 행 hover도 같은 이유로 `hover:bg-foreground/[0.02]`, 날짜 카드 머리↔첫 행 선은 `border-foreground/[0.06]`이다(#f0f0f0 — 철자의 정본은 `RowCardItem`이고, 같은 색의 `border-divider`와 한 화면에 섞지 않는다). ⚠️ **모달은 그 "한 화면"이 아니다** (2026-09-22): 상세 안의 선 셋은 `border-divider`이고 목록의 카드 선은 `border-foreground/[0.06]`이라 **같은 라우트에 두 철자가 산다.** 규칙이 막는 것은 *같은 판 안에서* 두 철자가 섞이는 것이고, dim 위에 뜬 표면은 그 판이 아니다.

- **공통 필드는 참조 하나**이고 나머지는 종류가 정한다 — 모든 상세에 같은 격자를 깔면 **빈 칸이 "못 읽었다"로 읽힌다**. 실행에만 시작·종료 두 시각이 붙고 일회성 사건은 발생 시각 하나다.
- **전후를 색이 아니라 라벨과 자리로 가른다** — 붉은·초록 diff를 쓰지 않는다(번역 한 셀은 문장 전체가 바뀌는 값이고, 색만으로 가르면 색각·흑백에서 두 블록이 같아진다). `Before`는 회색 면, `After`는 흰 면, 항상 Before가 위다. 값이 아닌 상태는 **점선 테두리 + 회색 글자**다.
- **값 상태 넷 + 해당 없음**: `Empty`(사람이 비운 값) · `Spaces only (N characters)` · `Not recorded`(수집 이전) · `Unavailable`(복호 실패) · `—`(해당 없음). **빈 칸을 만들지 않는 규칙의 유일한 관문이 `valueState`다.**
- **목적지 링크는 대상이 살아 있고 권한이 있을 때만** 그린다 — 죽은 링크를 남겨 404로 보내는 쪽이 더 나쁘다.
- ⚠️ **푸터의 [Close]는 항상 선다** (2026-09-22 실측). 목적지 링크는 종류·권한·대상 생존이 정하므로 **없을 수 있고**(SURFACE · EDITOR가 보는 SETTINGS · 대상이 사라진 번역), 그때 푸터가 **버튼 0개**로 서서 구분선과 빈 56px만 남는 판이 됐다. 닫기는 종류와 무관하므로 그 자리를 채운다 — 시안의 상세 셋도 전부 들고 있다. ⚠️ **푸터 버튼의 폼을 손으로 쓰지 않는다**: 캔버스의 값(h36 · radius 10 · px 12 · 14 · hover `#fafafa`)이 `Button` `default`/`md`와 **정확히 겹치므로** [Close]는 `<DialogClose asChild><Button>`이고 목적지 링크는 `buttonClass()`를 빌린다(⚠️ **`ButtonLink`가 아니다** — 목적지 셋 중 하나가 `target="_blank"`로 리포에 나간다). 손수 쓴 클래스 문자열이 `hover:bg-accent`(#f5f5f5)에 남아 2026-09-13의 hover 교체를 **혼자 놓쳤던** 자리다. ⚠️ **목적지 링크 셋은 `arrow-up-right` 16을 든다**(2026-09-24 — 캔버스 15는 §6.8 스케일 밖이다) — "여기를 떠난다"는 신호다. ⚠️ **`DialogClose`를 본문(서버 컴포넌트)이 렌더한다** — Root는 껍데기(클라이언트)가 들고, `asChild` + `Button`이 리포의 `DialogClose` 호출부 열둘이 쓰는 형이다(POSTMORTEM 2026-09-09이 지목한 것은 `asChild`가 아니라 **형제를 렌더하는 래퍼**다).
- ⚠️ **필드 라벨은 `text-neutral-400`(#a3a3a3)이고 시각·설명의 `--muted-foreground`(#737373)와 다른 색이다** (2026-09-22 실측 — 구현이 둘을 하나로 합쳐 두었다). 같은 축으로 **본문 값은 `text-base`**다: `text-[15px]`는 arbitrary라 `--text-base--letter-spacing`(0.015em)이 **안 붙어** 자간이 통째로 빠져 있었다.
- ⚠️ **되돌리기·재실행 버튼이 없다** — `logs`는 과거 이력이고 "지금 상태 + 행동"은 Home의 패널이다. 목적지로 보낸다.

**빈 상태 둘이 서로 다르다**: 빈 이력은 `No activity yet`, 필터 0건은 `No events match these filters` + "This project has activity — none of it is in this slice." **원인이 반대라 문장도 반대여야 한다.** 0건에서도 **머리와 필터는 남는다** — 숨기면 방금 무엇을 골랐는지 확인할 방법이 사라진다.

**페이지네이션은 링크 하나다** — 서버 `?cursor=` + [Older]. 총계·총 페이지·성공률 카드를 만들지 않는다(키셋이라 셀 수 있는 총계가 없고, 지어낸 수를 두지 않는다). 무효 커서는 첫 페이지다.

⚠️ **자동 갱신·폴링이 0건이다** — `Running…`이 조회 시점 스냅샷이라는 사실을 **[Refresh] 하나**가 든다. 브라우저 타이머로 실패로 바꾸지 않는다.

**수집 공백 경계선**은 경계가 실제로 드러나는 **행 바로 위에 한 번** 선다. 페이지 경계에 걸리면 아래 페이지가 들고, 커서가 이미 과거면 반복하지 않는다. ⚠️ **개시 시각을 서버가 못 주면 그 줄을 아예 그리지 않는다**(추정값 금지).

#### 의도된 이탈 둘 (캔버스와 다르고, 근거가 여기 있다)

1. **상세 로딩·상세 오류가 라우트 층으로 내려갔다.** 캔버스 `1i`는 클라이언트 fetch를 전제해 상세 전용 로딩·오류를 그렸는데, 상세를 **RSC가 그리기로** 하면서(스키마가 두 벌이 되지 않는다) 그 둘이 `loading.tsx`·`error.tsx`가 됐다. **같은 이유로 조회 실패가 all-or-nothing이다** — 캔버스 `1i`-4의 "이미 읽은 목록은 남기고 마지막 갱신 시각을 밝힌다"는 리뷰가 뒤집었다: 두 목록을 한 화면에 세우면 어느 쪽이 지금 사실인지 말할 수 없다.
2. **기간 필터의 `Custom range (UTC)`가 네이티브 date 입력 둘이다** — 피커 모양을 브라우저가 정한다. date picker 라이브러리를 넣지 않는 결정의 대가이고, 그 결정의 근거는 "라이브러리 0·새 프리미티브 0"이다.

#### Home의 Recent logs (§6.64와 함께)

같은 스트림의 **최신 여섯**이고 같은 행 컴포넌트를 쓴다. 다른 것은 둘: **시각 열이 없고**(날짜 카드가 없으므로 오른쪽에 상대 시각), **결과 배지가 보조줄 안**으로 들어간다(720 폭에서 172 열을 따로 두면 문장이 두 줄로 접힌다). ⚠️ **타임라인 점과 "첫 항목 파랑"이 사라졌다** — 점은 아무 값도 싣지 않았고 파랑("새 것")은 새로고침하면 뜻이 바뀐다. ⚠️ **7일 창도 사라졌다** — 조용한 프로젝트의 카드를 통째로 비웠다. 상세는 **Home 위에서** 열리고 닫으면 Home으로 돌아온다.

- **행 보조줄의 판정은 `lib/events/view.ts`의 `eventMeta`가 소유한다.** 컴포넌트는 문자열·코드·링크 표시의 모양만 정한다.
  수동 적재 뒤 남은 편집은 소스별 결과와 함께 표시하고, 성공한 적재에 `Nothing was imported`를 붙이지 않는다.
- **상세 Copy는 참조를 실제로 복사한다.** 완료된 Publish의 종료 시각은 `SyncRun`에서 읽고,
  `N dropped`는 Logs 행·Home 행·상세에 모두 남는다. Import 실패는 Import 사유로 설명한다.
- **전역 소스 필터의 URL 값은 `@project-wide`다.** 화면 라벨은 `Project-wide`이며 실제 소스 slug와 섞지 않는다.

### 6.69 보관된 프로젝트 (2026-09-10, 7단계)

⚠️ **이력(`/logs`)이 2026-09-20에 이 목록에서 빠졌다** (logs-rework) — 보관 사건과 그 직전 기록을 확인하려고 **복원해야 하는 순환**이었다. 그 화면만 읽기로 통과하고(인가 변경 — ARCHITECTURE §5.6.4), 읽기 전용 신호가 셋이다: 제목 옆 `Archived` 배지 · 설명 한 줄 · **[Refresh] 없음**(진행 중 실행이 생길 수 없다). 필터·검색은 남는다 — 읽기가 그 화면의 전부이므로 읽는 도구를 뺄 이유가 없다. ⚠️ **검색은 필터 줄 끝의 공용 `SearchInput`(`w-80`)이다** (2026-09-24 사용자) — 번역 화면 툴바(§6.1a)와 같은 형이다: 제목 줄은 제목·배지·[Refresh]뿐이고 좁히는 도구가 한 줄에 모인다. 바닥 안내는 **`Alert info`**(닫기 없음 — 2026-09-24, audit #49. 그 전엔 손으로 그린 상자였다)이고 복원 링크는 **OWNER에게만** 그린다. 제목 옆 `Archived`는 `Badge neutral`이다.

`translation:write` 화면 **셋**(번역·언어·멤버)이 같은 `EmptyState`를 낸다 — `components/project-archived.tsx`가 정책과 문구를 한 곳에서 든다. ⚠️ **패널 세로 중앙이다**(2026-09-13 — readiness(`project-not-ready.tsx`)와 함께 §6.4의 형으로 맞췄다: `PanelBody className="flex flex-col"` + 안쪽 래퍼 `flex-1 items-center justify-center`). 이 갈래엔 `PanelHeader`가 없어 화면에 그 블록 하나뿐인데, 위에 붙여 두면 1080에서 한 줄만 뜨고 그 아래가 통째로 빈다. OWNER에게만 [Open settings] `primary`가 붙는다(EDITOR는 그 화면에 못 들어가므로 누를 수 없는 버튼을 주지 않는다). ⚠️ **설정 화면은 이 갈래를 안 만난다** — `project:settings`가 보관을 통과하는 유일한 permission이고 그것이 되돌리는 길이다.

### 6.7 새 프로젝트 (`/projects/new`) — **`/projects` 위의 모달 네 단계** (2026-09-13)

⚠️ **라우트 하나를 대신하는 급의 모달이다** — 단계가 넷이고 실패 갈래가 열이라 "확인 대화상자"가
아니다: 제목 20/500(페이지 제목과 같은 급) · 폭 **800** · 높이가 뷰포트와 **800**에 물린 고정 · 본문만 스크롤.
**뒤에 프로젝트 목록이 그대로 있고**, 닫으면 열기 직전의 `?q=`·`?filter=`를 들고 `/projects`로 간다.

⚠️ **`components/ui/dialog.tsx`를 쓰지도 고치지도 않는다.** 그 프리미티브는 Overlay가 고정
(`bg-foreground/40`)이고 머리·본문·바닥 padding이 박혀 있으며 바닥이 `justify-end`라 왼쪽
`Step n of 4`를 못 넣는다 — 고치면 초대·확인·아카이브·로그인수단 모달 넷이 함께 움직인다.
**Radix `Dialog.*`를 직접 조립한다**(`components/ui/modal.tsx` — ⚠️ **`components/onboarding/modal.tsx`는
2줄 re-export shim이다**, §6.4의 `Modal` 행). 나머지 프리미티브는 그대로
쓰고 필요한 만큼만 넓혔다: `skeleton` 신설 · `segmented-control`의 `leading` · `empty-state`의
`className` · `alert`의 `role="status"`.

| 요소 | 규칙 |
|---|---|
| 껍데기 | 폭 **1024** (2026-09-18 사용자 — 아래 800 판정을 넘어섰다. ②의 패널 그룹 폭이 같이 움직인다: `files.tsx` `FILES_PANEL_WIDTH` 952). 옛 판정: 폭 **800 — 핸드오프 값** (2026-09-13 사용자. 880을 거쳐 돌아왔고 **②의 값이 덜 보이는 것을 감수한 결정이다**). 한때 960으로 올렸던 근거 "800이면 ②의 값 셀이 ≈188px라 24자에서 잘린다"는 **좌측 300 + 표 `1fr 1fr`** 기준이었고, 좌측 240 + `1fr 2fr`인 지금 값 셀은 **800→≈291 / 880→≈344**라 그 문제로 돌아가지 않는다. ⚠️ **좌측 240과 `1fr 2fr`은 시안으로 되돌리지 않는다** — 그 둘까지 300·`1fr 1fr`로 가면 값 셀이 ≈244로 내려가 그 이유가 정말로 되살아난다. · `rounded-xl` · `shadow-medium` · dim `bg-foreground/32` + **`backdrop-blur-[6px]`**(§6.2). 높이는 **dim padding을 뺀 값과 800에 물린다**: `min-h-[min(80svh,800px,calc(100svh-96px))] max-h-[min(800px,calc(100svh-96px))]` — `min-height:80vh`를 그대로 쓰면 1280×720에서 바닥의 [Back]·[Next]가 화면 밖이다. ⚠️ **800이 `min-h`에도 들어간다**: CSS는 `min-height`가 `max-height`를 이기므로 상한만 막으면 1,100px 화면에서 하한이 이겨 상한이 없는 것과 같아진다. ⚠️ **`vh`가 아니라 `svh`다**(셸 관용구) |
| 바닥 | 왼쪽 `Step n of 4`(`text-xs leading-[1.6]` muted) · `border-t`는 **`border-divider`**(#f0f0f0, §6.2) · 오른쪽 [Back]·[Next] `Button size="lg"`. ⚠️ **스텝퍼를 세우지 않는다** — 네 칸이 누를 수 없는 장식이 된다. **①④에는 [Back]이 없다**(닫는 길은 X·Esc·backdrop / 되돌릴 것이 없다). ⚠️ **소비자가 넘긴 `actions`도 껍데기가 같은 `gap-2` 무리로 싼다** (malmoi#87 — Add sources가 fragment를 넘겨 [Cancel]이 바닥 가운데로 떴다). `null`이면 무리를 세우지 않는다 |
| 비활성 [Next] | **primary variant가 든다** — muted 면 + muted 글자 + `cursor-not-allowed`. 껍데기와 단계는 비활성 형을 덧씌우지 않는다 |
| ① 막힘 갈래 | `EmptyState` + 보조 줄(빈 상태 **아래** `text-xs` muted — action 래퍼는 가로 flex라 그 안에 넣지 않는다). 갈래와 문구 (2026-09-18 사용자 확정, install-and-connect): **프로젝트 상한**(2026-09-24, launch-readiness L2.6 — **다른 갈래보다 먼저**, `listConnectableRepos`가 GitHub 전에 판정한다) `Archive` "Project limit reached" · "You own 3 projects, the most you can have. Archive one to make room." → `primary` [Open projects](`/projects`, `<a>`+`buttonClass`) — ⚠️ **[New project]를 끄지 않는다**(사유 없는 `disabled` 0건) / **설치 전(연결 없음·설치 0)** `Link2` "Connect your repositories" → `primary` [Install GitHub App](설치+인가 한 왕복), 연결 없음에만 보조 줄 "Already installed on your organization? Connect your account"(Authorize) / **리포 없음** `FolderGit2` "Add a repository" → [Choose repositories](설치 설정, `<a>`+`buttonClass`) / **승인 대기** `Clock` "Waiting for approval" → [Try again](`router.refresh()` + `loading`, 아직이면 모달 live 영역에 "Still waiting for approval.", 승인되면 포커스를 검색 필드로) + 보조 줄 "Install on a different account" / **재인가** `GithubIcon` "Reconnect GitHub" → [Reauthorize GitHub App]. ⚠️ **주 버튼과 보조 링크가 pending 하나·오류 Alert 하나를 공유한다** — 각자 들면 둘 다 눌려 state 쿠키가 덮이고 먼저 떠난 왕복이 `state-mismatch`다. ⚠️ **대기에 설치 제목·버튼을 세우지 않는다** — 요청자는 설치할 수 없고 다시 누르면 요청이 한 번 더 간다. 목록이 이미 서 있는데 대기면 목록 위 `info` Alert 한 줄("An organization owner still has to approve your install request.") — 거부가 아니라 `danger`가 아니다. ⚠️ **"Refresh this page"는 어느 갈래에도 없다** — 설치·리포 선택 모두 같은 탭 왕복이다. ⚠️ `GITHUB_APP_SLUG`가 없으면 설치 버튼을 세우지 않는다(항상 실패하는 버튼이 된다) — 설치 전은 [Authorize GitHub App] + "Ask your administrator…", 리포 없음은 버튼 없이 그 문장, 대기는 보조 줄 없음. ⚠️ **검색 0건은 별도 갈래다** — 요구하는 일이 다르다(검색어를 지워라). ⚠️ **전부 본문 세로 중앙이다**(2026-09-13 사용자 실물 — `flex flex-1 flex-col items-center justify-center`): 껍데기가 `min-h`로 세로를 잡아 두므로 그냥 반환하면 칩·제목·설명이 헤더 바로 아래 뭉친다. **검색 0건은 검색 필드를 위에 남기고** 그 아래 남은 높이의 중앙이다. ⚠️ **조회 실패(`Alert`)는 중앙이 아니다** — 폭 100% 배너라 빈 상태와 같은 자리에 서면 둘이 같은 부류로 읽힌다 |
| ① 리포 목록 | 한 테두리(**r10**) 안의 `Radio` 행 — `padding:12` gap 12 = 라디오 16 + **글리프 칩 40 r10**(`folder-git-2` 20) + 텍스트열 `gap-0.5`(이름 **15/500** + 보조 줄 **14** `owner · pushed …`). 상세 대상 행 `bg-muted` + **칩만 흰색** + 보조 `text-foreground/60`. 체크는 포함 여부만 표시하고 버튼은 미리보기만 바꾼다. 접근 이름은 `Include {path}` / `Preview {path}`이며 `<ul>`의 list role을 보존한다(muted 면에서 `muted-foreground`는 AA 미달) · 비선택 hover `bg-foreground/3`. 구분선은 **선택 행에 접하면 `border`(#e5e5e5), 아니면 `divider`(#f0f0f0)** — 그래서 `divide-y`가 아니라 행마다 `border-t`다. ⚠️ **`owner/name`이 sans다**(mono가 아니다). ⚠️ **`RadioGroup`에 `asChild`를 쓰지 않는다** — `<ul>`의 list role이 덮여 `<li>`가 고아가 된다(§6.4) |
| ① 브랜치 | 고른 행 **아래로** 펼쳐지는 한 줄 — `border-t`(#e5e5e5) · `padding:12 12 12 80`(라디오 16 + 12 + 칩 40 + 12이라 **이름과 같은 세로선**) · gap 12로 [라벨 14/500 + `git-branch` 14][`Select` **220**×36][캡션 13/1.6 `text-foreground/60`]가 나란히 선다. 값은 **sans**다(mono가 아니다 — 읽는 값이다). `Select`(기본값 default branch). 300개 초과면 `Input`, 조회 실패면 읽기 전용 한 줄 + "Using the repository's default branch." — ⚠️ **실패를 "브랜치가 없다"로 그리지 않는다** |
| ② 2단 | 좌 **240** 후보 `Checkbox` + 형제 상세 버튼 / 우 키·값 표. ⚠️ **키 행만 스크롤한다** — 툴바·헤더·총량 줄은 고정. 거터 16은 **껍데기 본문의 `gap-4`가 유일한 출처**다(안에서 또 래퍼를 세우지 않는다). ⚠️ **좌측은 열 전체가 스크롤하고 후보 목록은 한 행(`min-h-[4.5rem]`) 아래로 눌리지 않는다** (malmoi#88 — 1280×720에서 수동 지정 폼이 열리자 69px 행이 24px로 눌렸다). 스크롤은 패널이 아니라 안쪽 래퍼(`-m-1 p-1`)가 든다 — 패널에 두면 가로도 `auto`가 되어 포커스 링이 잘린다. Add sources도 같은 `FilesStep`이다. ⚠️ **후보의 경로·개수 줄은 잘리고 전문을 `title`로 든다** (malmoi#97 — 240이라 `public/_locales/{l…`로 잘려 선택 안 한 후보는 경로를 읽을 곳이 없었다. 잘림은 받는다: 좌측 폭이 위의 판정이다) |
| ② 후보 행 형 | ①과 **같은 행 형**이다 — `padding:12` · gap 12 · 체크박스 16 + **글리프 칩 40 r10**(`file-json-2`/`file-code-2` 20, ⚠️ **경로의 확장자로 가른다** — 어댑터 이름을 화면에 쓰지 않는다) + 텍스트열 `gap-0.5`(이름=**경로** 15/500 · 보조 14). 상세 대상 행 `bg-muted` + **칩만 흰색** + 보조 `text-foreground/60`. 체크는 포함 여부만 표시하고 버튼은 미리보기만 바꾼다. 접근 이름은 `Include {path}` / `Preview {path}`이며 `<ul>`의 list role을 보존한다 |
| ② 표 | `Table` 프리미티브다 — `scrollable={false}` + 바깥 `role="region" tabIndex={0}`(안에 포커스 가능한 것이 없어 컨테이너가 직접 받는다)가 스크롤을 들고, 그래야 `Th`의 `sticky`가 거기 붙는다. `Th` 배경은 **불투명 `bg-primary-foreground`**(§6.2) · 열 `1fr 2fr`(`table-fixed`) · `Td` 12/16 + **`whitespace-nowrap` 명시**(프리셋의 `whitespace-normal`과 twMerge 그룹이 달라 둘 다 살아남는다) · `Tr`에 `hover:bg-transparent`(읽기 전용이라 hover 신호를 주지 않는다) |
| ② 예외 E | ⚠️ **수동 확인의 거부는 경로 필드의 `FormGroup` 오류로 선다**(2026-09-24, malmoi#99 — `manual-no-match` "No files of that format…" / `single-locale` "Only one language was found…"; 입력이 `aria-invalid` + `aria-describedby="manual-path-error"`, 입력을 바꾸면 걷힌다). 전에는 미리보기 상태에 접혀 빈 미리보기에서 **그려질 자리가 없었다.** 설명은 "didn't find translation files in 2 or more languages on …"로 연결 조건을 말한다. 후보 0개에도 **표 껍데기를 버리지 않는다** — 헤더는 서 있고 `TableBody`만 빠진다(매칭 순간 레이아웃이 안 튄다). ⚠️ **툴바는 통째로 없다** — 고를 로케일이 없는데 트랙 자리를 남기면 탐지 중 화면과 픽셀 단위로 같아 "멈췄다"로 읽힌다. ⚠️ **빈 상태는 제목 + 설명 둘 다 든다**(시안 3a — 2026-09-13까지 제목만이었다. 겹치던 뒷문장은 좌측 수동 지정 힌트에서 뺐다: 같은 문장을 한 화면에 두 번 두지 않는다). ⚠️ **표 헤더 *아래* 남은 높이의 중앙이다**(핸드오프 3a): 중앙을 잡는 것이 **스크롤 컨테이너**(`flex flex-col` + 자식 `flex-1`)여야 하고, 바깥 박스가 잡으면 헤더까지 포함한 중앙이 되어 블록이 위로 밀린다. 그 전환의 대가로 **표에 `shrink-0`이 붙는다** — flex 아이템의 기본 `shrink:1`이 행 많은 표를 누른다 |
| ② 후보 행 | 상세 대상 행 `bg-muted`, 포함 여부는 체크박스다. 초기 체크·상세는 탐지 1순위 하나. 체크 0개 또는 출력 충돌이면 Next를 막는다. 수동 지정은 검증된 후보 하나만 제출한다. ⚠️ **경로 템플릿이 sans다**(mono가 아니다) — 240px 열이라 mono가 줄을 더 잘라 먹는다 |
| ② 세그먼트 | 후보의 **로케일 전부**. **다섯 이상이면 `Select`로 접힌다** |
| ② 값 셀 | 정말 비었으면 **빈 칸**, 못 읽었으면 **"We couldn't read this file."** ⚠️ **둘을 가른다** — 이 화면의 목적이 "ko 열이 비어 있다"를 보이는 것이라 그 구별이 기능 자체에 걸린다 |
| ③ 주소 오류 | 형식 넷(`empty`·`format`·`too-long`·`reserved`)은 **입력 중** 필드 아래 help, 중복은 **제출 뒤** 같은 자리에 `aria-invalid` + destructive. ⚠️ **배너를 세우지 않는다** |
| ③ 기준 언어 | 체크한 표면마다 경로로 구별된 선택기를 표시한다. 미리보기와 독립이고 체크 해제·재선택에서는 유지하며 리포·브랜치 변경·재탐지 때 초기화한다. 표면 하나면 기존 UI다. ①②와 **같은 행 형** — 한 테두리(r10) 안의 행, 글리프 칩 자리에 **국기 `md`(24×17)**, 이름이 **영어 언어명**(`languageName`) — ⚠️ **자국어가 아니다** (2026-09-13 실측 뒤 뒤집었다): `Intl.DisplayNames([code])`는 그 로케일 데이터가 없으면 **보는 사람의 시스템 언어**로 떨어져 Chrome(ko)에서 `az-AZ`가 `azərbaycan (아제르바이잔)`이 됐고, 같은 코드가 Node에서는 `azərbaycan (Azərbaycan)`이었다. 팀원마다 다른 화면을 보고 SSR에 실리면 hydration이 깨진다. ⚠️ **하위태그를 떼지 않는다** — `zh-Hans`/`zh-Hant`가 같은 이름이 되면 되돌릴 수 없는 결정을 잘못 내린다, 보조가 `{경로} · {키 수}`(⚠️ `{locale}`은 **`replaceAll`**로 전부 치환한다), 행 오른쪽 끝에 `Badge neutral` "Most keys". 그 아래 키 수 비교 info. ⚠️ **키 수를 아는 언어에만 단다** — 모르는 언어에 배지를 달면 근거가 "②에서 무엇을 눌렀는지"라는 우연이 된다. ⚠️ **열하나 이상이면 `Select`로 접히고, 그때 배지는 옵션 라벨로 들어간다**(`fieldset`을 버린다 — 컨트롤이 하나면 묶을 것이 없고 `legend`가 `Select`의 이름과 겹쳐 두 번 읽힌다) |
| ③ 생성·실패 | 모든 표면의 준비와 첫 적재를 기다린다. 입력·Back·생성 버튼을 잠그고 `role="status"`로 알린다. Radix Select·RadioGroup에는 `disabled`를 직접 전달한다(Portal은 fieldset 밖이다). 확인된 거부는 전체 미생성·경로·실패 수·상위 5건 진단을 danger Alert에 표시한다. 응답 유실은 목록 확인을 안내하며 미생성을 단정하지 않는다 |
| ④ 결과 | 모든 저장이 끝난 성공 상태만 표시한다. 설명 줄은 `Synced N keys. Add the push token…`이고 **셋째 문장이 야간 PR 공지**다("Every night, translations not yet sent go to the repository as a pull request." — 2026-09-24 L2.9. 별도 블록이 아니다). 성공 Alert는 없다. 별도 적재·부분 실패·재시도 UI는 기존 Settings의 몫이다 |
| ④ 토큰·워크플로 | 토큰 칩 h36 · r10 · border · px-2.5 · bg-muted · **sans 13**(`<code>`라 `font-sans` 명시 — §4.1) + Copy 36. YAML은 서버가 반환한 활성 표면 전체의 step을 표시한다. 상단 줄 13/muted + 파일명 **sans** + Copy 28(sm). `<pre>`는 bg-muted r10 p12 mono 13/18 · border 없음 · min-h-0 flex-1 overflow-auto. 완료 후 토큰·YAML·Start translating을 제공한다 |
| 로딩 | **다음 단계 안의 스켈레톤**이다 — [Next]를 누른 자리에서 라벨만 바꾸면 화면이 멈춘 것으로 보인다. 개수는 실제보다 적게(① 셋, ② 둘). ⚠️ **행의 형이 실물과 같아야 한다** — 디바이더 색·행 padding·칩 자리가 어긋나면 도착하는 순간 레이아웃이 움직인다. ②는 **표 헤더를 세운 채 `<tbody>`만 스켈레톤**이고, 세그먼트는 칸 수를 모르므로 **트랙 자리(150×36 `bg-canvas`)만** 남긴다. 전역 스피너·진행률 숫자가 없다. ⚠️ **예외 하나**: ③→④만 [Next]가 로딩이다(실패하면 ③에 머물러야 하므로 미리 넘어갈 수 없다) |
| 접근성 | `sr-only aria-live="polite"` 하나가 단계 제목과 비동기 전이를 말하고, 단계가 바뀌면 포커스가 본문 컨테이너(`tabIndex={-1}`)로 간다. ③의 생성 중 안내는 `role="status"`다 — ⚠️ `Alert`의 `role="alert"`는 **`danger`일 때만** 붙는다 |

⚠️ **②와 ③의 접힘 경계가 다르고 그것이 의도다** (2026-09-13 사용자 — 정본은 `lib/onboarding/locale-picker.ts`의 상수 둘). ②는 **넷**, ③은 **열**이다: 세그먼트는 가로 트랙 **한 줄**이라 칸이 늘면 로케일 코드가 잘리고, 라디오는 `flex-wrap`으로 **감싸** 줄만 늘 뿐 각 항목이 그대로다. ③이 더 늦게 접히는 것은 그 자리가 **되돌릴 수 없는 결정**이라 한눈에 보이는 편이 낫기 때문이다. **숫자를 화면에 적지 않는다** — 한쪽만 바뀌면 그 차이가 조용히 굳는다.

⚠️ **어댑터 내부 이름을 화면에 쓰지 않는다** (PRODUCT §3). 라벨은 서버가 `formatLabel`로 만들어 내려준다 — 그 모듈을 클라이언트가 **값으로** import하면 어댑터 전부(ts-morph)가 번들에 들어온다 (POSTMORTEM 2026-09-07). ⚠️ **같은 이유로 `keyGap`이 `lib/onboarding/key-gap.ts` 잎에 산다** — ③이 그것을 값으로 부른다.

### 6.8 아이콘 — `lucide-react` 16px, **셸은 전 항목이 아이콘을 든다** (2026-09-08)

세트는 `lucide-react` **하나**다 (§1). ⚠️ **예외가 하나 있다** — provider 브랜드 로고(GitHub·Google)는
그 라이브러리에 **없다**(브랜드 글리프를 제외한다). `components/signin/brand-icons.tsx`가 인라인 SVG로
들고, **Google의 4색은 §6.2의 "새 raw 색을 늘리지 않는다"와 아래 "색은 상속"의 예외다** — 브랜드 색은
우리가 고르는 값이 아니라 남의 자산이라 토큰으로 접을 수 없다 (8-1b). 크기는 **넷이다**: **16**(기본 — 사이드바·버튼·Alert·인라인·`EmptyState` 칩 안) · **14**(`size-3.5` — 버튼·행 안의 작은 인라인 글리프와 경고 블록: Publish·Sync·주의 카드·필터 칩의 ⓧ·복사·프로젝트 행 상태) · **12**(`size-3` — **`Checkbox`의 체크 표시와 사이드바 프로젝트 구역 머리의 16 타일 안 글리프 둘이다.** 외부 링크가 2026-09-18에 글리프를 버려 소비자가 하나로 줄었다가(§6.3) 2026-09-25에 타일이 16으로 내려오며 둘이 됐다) · **20**(`size-5` — **40 글리프 칩 안**(온보딩 ①②의 리포·파일 행, §6.7)과 **원형 ghost 버튼 안**(모달 닫기 36 · 칩 전체 초기화 28), Publish 모달의 빈 상태 글리프도 같은 값이다). ⚠️ **24는 8-3에 소비자가 0이 됐고 되살아나지 않았다** — `EmptyState`의 아이콘이 48 원형 칩 **안의 16**으로 갔다(§6.4). 그 넷 밖의 크기를 만들지 않는다 — ⚠️ **2026-09-24에 임의 크기 일곱을 접었다** (audit #48): 15 넷 → 16(logs 상세의 이동 글리프 · 번역 로케일 머리의 파일 · 필터 트리거 chevron), 13 → 14(`missing` 알약 안), 18 → 20(Sources 빈 상태의 36 칩 안), 26 → 20(설정 General의 56 썸네일 폴백). `size-[Npx]`는 전수 0건이다. 사이드바 항목이 `p-1.5 text-sm`이고 아이콘 박스가 `size-4`라 20 이상은 **그 줄에서** 넘친다(그래서 20은 칩 안에만 산다, §5.1).

**아이콘이 없으면 미완인 자리** (LNB가 대표다 — ⚠️ 옛 근거였던 "접힌 레일에서 아이콘이 유일한 라벨"은 8-3이 접기를 지우며 사라졌다. 남은 근거는 **줄의 정렬**이다: 항목 하나가 아이콘을 빼면 그 라벨만 왼쪽으로 밀려 목록이 두 겹으로 읽힌다):

| 자리 | 아이콘 |
|---|---|
| 사이드바 — 사용자 구역 | Projects `Box` · Account `CircleUser` (2026-09-11 — 라벨은 2026-09-23에 `Settings`에서 바뀌었다) |
| 사이드바 — 프로젝트 구역 | Home `House` · Sources `Files` · Translations `Languages` · Members `Users` · Logs `History` · Project settings `Settings` (8-3이 이름과 순서를 시안에 맞췄다) |
| 사이드바 하단 전역 | **Docs `CircleHelp` · Sign out `LogOut`** — 둘뿐이다 (8-3). ⚠️ `LayoutGrid`·`PanelLeft`는 소비자가 0이 됐다(`Plus`·`CircleUser`는 아래 두 자리에서 다시 쓰인다) |
| ~~프로젝트 컨텍스트~~ | ⚠️ **스위처가 8-3에 사라졌다** — `ChevronsUpDown`도 함께 소비자 0이다 (§6.5) |
| 헤더 | **로고와 사용자 메뉴 아바타뿐이다** (8-2) — ⚠️ 햄버거 `Menu`는 **없어졌다**(반응형 분기 0). breadcrumb 구분자는 아이콘이 아니라 텍스트 `/`다(§6.4) |
| 아이콘 전용 버튼 | 닫기 `X` · 복사 `Copy` → 성공 `Check` · **칩 하나 제거 `X` 14(`size-6` 원형 안) · 칩 전체 초기화 `RotateCcw` 20(`size-7` 원형 안)**(§6.1) |
| 주 행동 버튼 | Publish `Send` · 리포 재연결 `RefreshCw` · 첫 적재 `Play` · 초대 `UserPlus` · GitHub 연결 `Link2` · Home의 [Open translations] `Languages` · **[New project] `Plus`**(제목 줄과 빈 상태 둘, §6.63) · **[Clear filters] `RotateCcw`**(⚠️ `FilterX`가 아니다 — 필터와 검색을 **둘 다** 되돌리므로 깔때기 글리프면 지워지는 것이 절반이라고 말하게 된다) |
| 목록 행 | **프로젝트 타일 `Box`**(§6.63 — 사이드바 `Projects`와 같은 글리프다) |
| 필터 | 검색 `Input` 앞 `Search`(`absolute left-2` + `pl-8`) · **로케일 다중 선택 트리거 안 `ChevronDown`**(§6.1). ⚠️ **상태 `Select`가 없어져 `ListFilter`도 소비자 0이다** (8-4) |
| Alert 4종 | `Info`·`CircleCheck`·`TriangleAlert`·`CircleX` — **정본은 §6.2 표**다 |
| 외부 링크 | **글리프 없음** — 색과 새 탭만 든다 (§6.3, 2026-09-18 반전) |
| `EmptyState` | **48 원형 칩 안의 16** `text-muted-foreground` (8-3) — **일러스트는 여전히 없다**. 빈 이력 `History` · 보관된 프로젝트 `Archive` · 프로젝트 0개 `FolderGit2` · **필터·검색 0건 `Search`**(§6.63) · **대기 초대 0건 `MailPlus`** · 번역 화면 셋 `Languages` · 소스 0개는 역할별 평문 안내 |

**쓰지 않는 자리** (아이콘이 정보를 안 더하고 스캔만 방해한다): 배지(§6.2는 텍스트만) · `Card` 제목 · 표 헤더 · **반복 목록의 모든 행**(네임스페이스 패널·리포 목록·키 행 — 같은 아이콘이 n번 반복되면 정보량이 0이다) · 텍스트 링크 안(외부 링크 예외).

**형**: `size-4`(14는 `size-3.5`, 12는 `size-3`, 20은 `size-5`) · 색은 **상속**(`currentColor`) — 아이콘에 별도 색 클래스를 주지 않는다. 예외는 Alert 4종 · `EmptyState` · **한 단계 아래 글리프**다: 라벨보다 한 단계 물러난 무채 계단(`muted-foreground` · §6.2의 `neutral-300`·`400`·`600`)과 PR 카드의 `green-800`까지이고, **그 밖의 색상(hue)은 아이콘에 주지 않는다**(2026-09-24, audit #48 — 이 문장이 "Alert·EmptyState뿐"이라 적은 동안 Home Sync 글리프(§6.2 등재)를 비롯한 여덟 자리가 이미 계단을 쓰고 있었다. `visual-system.test.ts`가 lucide 글리프의 색 클래스를 이 집합으로 센다) · 라벨과 `gap-2` · **라벨이 있으면 `aria-hidden`**, 아이콘만이면 `aria-label` (§7).

⚠️ **`lucide-react` 1.x에 브랜드 아이콘이 없다** — `Github`·`Google`을 import하면 빌드가 죽는다(1.37.0 실측). GitHub 연결 버튼은 `Link2`이거나 아이콘 없이 라벨만이고, provider 로고가 필요하면 인라인 SVG를 그 컴포넌트 안에 둔다.

⚠️ **아이콘 import는 `client-graph.test.ts`의 허용 목록을 지난다** — `lucide-react`가 거기 없으면 클라이언트 컴포넌트가 아이콘 하나만 써도 red다.

## 7. 접근성

### 표면 선택기

Translations의 **패널 머리**에만 둔다. Sources는 선택기가 아니라 전체 소스 목록이다. Home·Settings·사이드바에는 두지 않는다.
활성 표면이 하나면 렌더하지 않고, 둘 이상이면 빈 표면에서도 남겨 전환할 수 있게 한다.
표시는 경로의 마지막 고정 디렉터리 조각을 **sans**로 낸다(`default`·충돌 suffix는 라벨이 아니다).
닫힌 선택기는 짧은 라벨과 tooltip을, 열린 목록은 전체 path template 보조 줄을 함께 낸다.
같은 이름의 `apps/*/locales`도 경로로 구별한다. 항목별 미발송 수는 배지다. 접근 이름은 `Source`(§10.1).
선택기는 번역 툴바·칩과 같은 pending·이동 함수를 공유한다. 유효한 ns/locales/q는 보존하고
유효하지 않은 필터는 URL에서도 제거한다. Publish는 표면과 무관한 **프로젝트 전체**이고 라벨은
2026-09-16부터 Home과 같은 `Publish` + 배지다(§6.646).

- **대비 하한 AA(4.5:1)**. §2.2가 가장 흔한 위반 경로다 — 남은 자리는 **표 헤더**(`bg-muted/50`)·**값 칩**·**코드 블록**이다(사이드바는 8-2부터 캔버스 위라 이 목록에 없다).
- **포커스 링 셋** — `focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none`. ⚠️ **폭이 2026-09-11에 3px에서 2px로 내려갔다**(사용자) — `ring-2`가 Tailwind 스케일 값이라 **리포의 임의 치수가 그 교체로 0이 됐다**(그전엔 `ring-[3px]`가 유일했고 DESIGN §6.5(규약 6)·`h-10` 판정이 그것을 근거로 들고 있었다). **셋은 `components/ui/` 안에 있다.** `components/__tests__/focus-ring.test.ts`가 (1) **스캔 대상 전체**의 네 태그가 셋을 드는지(허용 목록 파일의 raw 태그도 링은 들어야 한다), (2) `ui/` **밖에 raw 태그를 쓰는 파일이 0개인지** 둘을 센다. ✅ **축소형 허용 목록은 2026-09-08 ship 4에서 비었다** — (2)가 전면 방어선이고, 새 컨트롤은 `components/ui/`에 프리미티브로 만든다(목록을 다시 채우지 않는다).
  - ⚠️ **"상수에 숨기지 말 것"은 사라지지 않았다 — 자리가 `ui/` 안으로 옮겨졌을 뿐이다** (2026-09-08 실측). 스캐너는 **여는 태그의 소스**를 읽으므로 링을 `cva` 베이스나 공유 `fieldClass`에 모으면 그 파일이 통째로 검사 밖이 된다. 그래서 raw 태그를 쓰는 프리미티브 셋(`Button`·`Input`·`Textarea`)이 각자의 태그에 셋을 **리터럴로** 적는다. ⚠️ **`Select`·`Radio`는 2026-09-13에 Radix로 옮겨 소스에 raw 태그가 없다** — 그 둘은 스캐너가 못 보므로 `focus-ring.test.ts`가 `RADIX_FIXTURES`라는 **두 번째 목록**을 들고 렌더된 트리거의 `classList`로 링을 본다. 그 목록이 비면 Radix 프리미티브의 링이 통째로 방어선 밖이 된다. 같은 이유로 `Button`에 `asChild`(Slot)를 두지 않는다 — 그 한 겹이 태그를 지운다.
  - 스캐너는 **주석을 벗기고 센다** — 프리미티브가 자기 태그 이름을 docstring에 쓴다(`native \`<select>\`다`).
- **`--ring`이 blue-400(`#60a5fa`)이다** (2026-09-11 사용자 — `app/globals.css`). ⚠️ **그 전엔 `--border`와 값이 같아** 흰 배경에서 대비가 **1.19:1**이었다: 프리미티브 여덟이 셋을 리터럴로 들고 위 스캐너가 전수로 세는 동안 **검사는 green이고 링은 화면에 없었다.** 이 절의 옛 문장은 그 사실을 "muted 표면 위에선 약하다"로 적고 호출부의 `ring-offset-1` 우회를 규칙으로 들고 있었는데, 고칠 자리는 토큰 한 줄이었다.
  - ⚠️⚠️ **이 절의 3:1 하한을 이 토큰이 넘지 못한다 — 흰 배경 2.54:1 · muted 표면 2.49:1. 수용한 결정이다**(2026-09-11 사용자). blue-600(5.17 / 4.70) → **blue-400** → blue-300(1.80 / 1.64)을 차례로 목측하고 400으로 확정했다("너무 찐해" → "300으로" → "blue-400으로 확정") — **시각 무게를 대비보다 앞에 뒀다.** ⚠️ blue-300은 **고치기 전(1.19:1)과 같은 자릿수**여서 버렸다: 그 값에서는 이 전환이 사는 것이 "무채색이라 `--border`와 구별되지 않던 것"이 색상으로 구별되는 것까지이고 **보이게 만드는 것은 아니다.** 되돌릴 때의 후보는 **blue-500**(3:1을 넘는 가장 연한 파랑)이다.
  - ⚠️ **`focus-visible:ring-offset-1`의 실물 사용처가 0건이다** (2026-09-13 실측 — `grep -rn "ring-offset-1" app components`가 주석 둘만 낸다). 이 절이 *"값 칩 옆 버튼 하나(온보딩의 리포 되돌리기)에서 남겨 뒀다"*고 적고 있었는데 그 호출부는 이미 사라졌다. **규칙이 아니라 사실이 낡은 것이고, 지금 offset을 덧대는 자리는 없다.** ⚠️ **`lib/__tests__/globals-css.test.ts`는 이 대비를 안 본다**(`--border`와 다른가 · 무채색이 아닌가 둘뿐이라 지금 값에서도 green이다) — 링이 안 보인다는 제보의 첫 확인 자리는 검사가 아니라 `--ring` 값이다. 사이드바 항목은 8-2부터 캔버스 위라 대상이 아니다.
  - ⚠️ **`--input`과 값을 다시 같게 두지 않는다** — 필드 테두리는 쉬는 상태의 윤곽, 링은 포커스 신호로 축이 다르다. `lib/__tests__/globals-css.test.ts`가 `--border`와의 동일성과 무채색 여부를 센다.
- ⚠️ **`overflow-hidden` 부모 안에서는 `focus-visible:ring-inset`이 예외로 붙는다** (2026-09-11 실측). 링은 box-shadow라 요소 **밖으로** 3px 퍼지는데, 프로젝트 목록의 `<ul>`이 `rounded-lg`로 첫·끝 행의 모서리를 자르려고 `overflow-hidden`을 들고 있어 **그 3px이 통째로 잘렸다** — 키보드 사용자에게 포커스가 아예 안 보였다. 부모의 `overflow-hidden`을 뗄 수 없는 자리에서만 안쪽으로 그린다.
- **저장 알림은 작업 화면에 `aria-live="polite"` 영역 하나**다 — 키 카드 푸터의 결과 줄(`data-footer-result`). 로케일 행마다 두면 200개다. Revert 뒤에는 포커스가 그 결과 줄로 간다(성공 뒤 Revert가 사라지고 Save는 꺼져 있어서다). 저장 거부·결과 미확인은 그 위의 `Alert`가 든다. ⚠️ **Revert가 꺼진 사유는 그 결과 줄 밖의 형제 span이다** (2026-09-23) — 안에 두면 사유가 바뀔 때마다 결과처럼 다시 낭독된다. 전달 경로는 `aria-describedby` 하나이고, 처리 중에도 `loading` 대신 `aria-disabled` + 스피너라 방금 누른 버튼이 포커스를 지킨다(§6.65 "`loading`과 겸용 불가").
- **번역 화면의 규칙 여럿은 `components/__tests__/translations-screen.test.ts`가 소스로 고정한다** — 작업 화면의 live region이 푸터 하나인지 · 로케일 입력에 `role="status"`가 없는지 · 입력이 키·로케일을 접근 이름으로 드는지 · 보류 배너가 `info`이고 닫기·세션 저장이 없는지 · 옛 표 조각과 `pull-button.tsx`가 사라졌는지. 이 절의 규칙을 고치려면 그 파일이 red를 낸다.
- 아이콘만 있는 버튼은 `aria-label`.
- 드롭다운·모달은 Radix가 포커스 트랩·Esc·`aria-*`를 든다 — 직접 만들지 않는다.
- **포커스는 `body`로 빠지지 않는다** (2026-09-24, audit B5 — `components/ui/focus.ts`). 누른 컨트롤이 꺼지거나 사라지는 자리의 규칙이 넷이다:
  - **Dialog 트리거**는 진행 중에도 `busy`로 포커스를 지킨다(§6.4).
  - **폼의 [Save]**는 끝난 뒤 `useLandAfter`로 착지한다 — 다시 켜졌으면 그 버튼, 저장할 것이 없어 꺼진 채면 방금 고친 필드(General 이름 · Base branch · Base language)다. 번역 화면의 Save는 결과 줄(Revert와 같은 자리)이고, 단축키 저장은 입력의 포커스를 옮기지 않는다(**빠졌을 때만** 옮긴다).
  - **성공하면 컨트롤이 바뀌는 행**(Archive ↔ Restore · 로그인 수단 · GitHub 연결)은 그 행의 새 컨트롤로(⚠️ Settings는 보관 카드가 두 자리에 그려져 전환이 **재마운트**다 — 착지를 새 인스턴스에 몇 초짜리 표식으로 넘긴다, malmoi#82. 한 자리 + CSS `order`는 DOM 순서가 갈려 버렸다), **통째로 사라지는 배너**(Home 보관 배너의 복원)는 Home 제목으로 착지한다.
  - **Alert·Sources 결과 행의 닫기**는 언마운트 전에 그 자리의 **다음** 포커스 가능 요소(없으면 앞)로 옮긴다.
- **Dialog는 닫히면 누른 자리로 돌아간다** — `DialogContent`가 최근 `focusin`·`pointerdown` 기록에서 아직 붙어 있는 가장 최근 요소로 돌려준다(미저장 확인 · Revert · 역할 변경 · Sources 상세 안의 중첩 확인 · 트리거로 연 Dialog는 그 트리거). ⚠️ **Home 배너의 [Try again]으로 연 Sync 확인은 머리의 [Sync]가 아니라 그 [Try again]으로 돌아온다 — 의도다** (malmoi#86 판정): 배너를 읽다 눌렀는데 머리로 튀면 그 문장을 다시 찾아 내려와야 한다. Radix의 트리거 복귀가 여기 적용되지 않는 것은 우리 핸들러가 먼저 돌아 `preventDefault`하기 때문이고, r1에 넣었던 "트리거가 붙어 있으면 비켜선다" 판정은 **Radix가 닫힌 트리거에서 `aria-controls`를 지워** 한 번도 참이 아니었다(걷었다). ⚠️ **`pointerdown`을 기록하는 이유** — Safari·macOS Firefox는 마우스 클릭으로 버튼에 포커스를 주지 않아, `focusin`만 보면 기록의 마지막이 더 오래된 요소였고 닫힐 때 포커스·스크롤이 그리로 튀었다(B5 리뷰 r1). ⚠️ **"열 때의 `activeElement`"로는 못 잡는다** — 안쪽 `autoFocus`가 FocusScope의 mount 이벤트보다 먼저 돌고, Select 옵션에서 여는 Dialog는 그 순간 포커스가 사라질 옵션 위다. ⚠️ 그 요소가 꺼져 있으면 더 거슬러 가지 않는다(착지가 받는다). 호출부의 `onCloseAutoFocus`가 먼저다.
- ⚠️ **꺼진 컨트롤의 사유를 보이는 글자로 세울 자리가 없으면 `title` + sr-only다** (B5 리뷰 r1 — §6.65의 등재된 이탈). 머리의 멈춘 [Sync]와 Publish가 도는 동안의 [Try again] 둘이 그렇고, 옆의 [Publish]가 먼저 쓴 형이다(§6.646). 행 안에 자리가 있는 사유(워크플로 행의 `Add a source…` · Add sources의 `Enter a file path…`)는 보이는 `text-xs` 글자다. ⚠️ **사유는 꺼진 동안만 서고, 막은 갈래를 말한다** (malmoi#93) — Add sources의 푸터가 켜진 [Add selected sources]에도 `Select at least one new source to add.`를 세우고 describedby로 가리켰다. 지금은 `planAddBlock`이 탐지 중 · 탐지 실패 · 고른 것 없음 · 경로 충돌 · 기준 언어 없음 순으로 한 문장을 고르고, 막는 것이 없으면 문장과 describedby가 함께 빠진다.
- **단일 선택 메뉴 항목**(`DropdownMenuItem`에 `selected`를 준 것)은 `menuitemradio` + `aria-checked`다. 값이 아니라 동작인 항목(프리셋·`Custom…`)은 `selected`를 안 받아 `menuitem`으로 남는다.
- **`title`은 유일한 설명이 아니다** — 닫힌 소스 선택기의 전체 경로와 키 사용처의 보조 문장은 sr-only·`aria-describedby`로도 닿는다. **성공 알림은 전부터 있던 `role="status"`에 쓴다**(텍스트와 함께 새로 붙는 live 영역은 놓친다) — General 이름 · Base branch · 표시 이름. 번역 화면은 위의 "live region 하나" 규칙 때문에 CopyLink에 영역을 더하지 않고, 대신 복사된 동안 `aria-label`을 비워 보이는 `Copied`가 이름이 된다(WCAG 2.5.3).

## 8. className & 변형

- 조건부 클래스는 **항상 `cn()`** 을 지난다 (§4.2의 twMerge 등록 때문에 특히). 삼항으로 문자열을 고르는 것도 조건부 클래스다.
- 변형이 셋 이상이면 `class-variance-authority`(Button·Badge·Alert). 둘 이하면 인라인 삼항이 낫다.
- 프리미티브는 `className`을 받아 **끝에** 병합한다(`cn(base, variants, className)`) — 호출부가 폭·여백만 덧댄다. 색·높이를 호출부에서 덮으면 형이 갈린다. ⚠️ 2026-09-08 `/doc-check`이 로그인 provider 버튼의 `h-9`를 잡았고 **규칙이 아니라 코드를 고쳤다** — 높이를 덮는 자리는 사이드바의 `h-auto`(§6.5)와 ②의 상세 버튼이다. 상세 버튼은 행 안 글리프·텍스트 높이를 따르므로 ghost 버튼에 `h-auto p-0`을 사용한다.

## 9. SaaS UI 레퍼런스 — GitLab (2026-09-07 결정, Supabase에서 변경)

**레퍼런스가 정하는 것은 레이아웃·정보구조·컴포넌트 구성이다. 색·타입·간격은 정하지 않는다** — 그건 §2·§4·§5 앞부분의 우리 토큰이다.

Supabase를 골랐던 이유(2026-09-05)는 "개발자 도구이면서 비개발자도 쓰는 밀도, 프로젝트 전환이 일급인 정보구조"였다. GitLab이 그 둘을 더 직접 갖고 있고, 결과물이 PR이라 **사용자가 이미 그 화면 안에 있다** — 같은 배치를 쓰면 "내가 고친 것이 저기로 간다"가 화면에서 이어진다 (spec §2.5).

### 9.1 가져오는 것

| 축 | 무엇 | 어디 |
|---|---|---|
| **super sidebar** | 브랜드 → 프로젝트 컨텍스트(전환 메뉴) → 섹션 항목 → 하단 전역 항목 · 접힘 | §6.5 |
| **헤더** | 사용자 메뉴 우 · 48px. ⚠️ 8-2가 로고를 왼쪽에 더하고 전폭으로 넓혔고, **8-4가 breadcrumb을 통째로 걷었다**(GitLab에서 가져온 그 축은 이제 사이드바가 든다 — §0·§6.5) | §6.5 |
| **콘텐츠 폭 둘** | 폼·설정은 limited, 표는 fluid | §5.1 |
| **settings-block** | 제목 + 설명 + 본문 카드가 세로로 쌓인다 | §6.6 |
| **표 구성** | 헤더 sticky · 행 hover · 세로선 없음 · 마지막 행에도 하단선 | §6.66·§6.68 (⚠️ 번역 화면은 8-4에 `<table>`을 떠났다 — §6.1) |
| **Alert 배치 셋** | global / page-level / in-block | §6.4 |
| **빈 상태 패턴** | 짧은 제목 · 문장 하나 · 버튼 하나 (⚠️ 예외 둘이 §6.4에 등재됐다) | §6.4 |
| **로그인 2열** | 폼 좌 · 장식 우(스크린샷 2) | user-stories §1 |
| **문장 규칙** | sentence case · 라벨에 마침표 없음 · 결과를 말하는 버튼 | §10 |

### 9.2 가져오지 않는 것

- **색 팔레트·시맨틱 토큰** (Pajamas neutral/blue/…). 토큰의 진실은 `app/globals.css`(**neutral** — §2)이고 새 raw 색을 늘리지 않는다(§6.2).
- **타입 스케일·폰트**(GitLab Sans·GitLab Mono)·**간격·radius 값**. 우리 스케일로 반올림한다(§5.1).
- **다크 모드** (§3).
- **헤더의 검색·`+`·카운터**, **기능 밀도**(사이드바 항목 십수 개). PRODUCT §4.2.
- **Vue 컴포넌트(`@gitlab/ui`)·아이콘 세트(`gitlab-svgs`)** — lucide 16px로 대응.
- **일러스트**(빈 상태 SVG) — `EmptyState`는 여전히 아이콘 하나뿐이다.
  - ⚠️ **로그인 우측 장식은 예외가 됐다** (8-1b). 그전까지 "CSS dot-grid + 토큰만 쓴 정적 모형 카드"였는데, Figma 시안이 **래스터 키비주얼(`public/brand/malmoi-signin-kv.png`)과 Canvas 도트 필드**를 들여왔다. 셸 **밖** 화면 둘(로그인·초대 수락)에만 해당하고, 셸 안 화면에는 여전히 일러스트를 두지 않는다.

### 9.3 판정 기준

"GitLab처럼 보이는가"로 판정하지 않는다. **§9.1의 아홉 축 중 어긋난 것이 있는가**로 본다 — 그래야 "GitLab처럼 보이게" 다듬는 작업이 색·폰트로 새지 않는다.

## 10. UI 문장 규칙 (en — design.gitlab.com/content에서 가져온 것, 2026-09-07)

문자열은 `messages/en.tsx`에 있고 화면은 **`@/lib/i18n`의 `m`** 으로 읽는다(design §3.1 — 그 모듈은 잎이라 `client-graph.test.ts`가 무게를 센다). 이 절이 그 문체이고, **`lib/i18n/__tests__/no-korean-ui.test.ts`가 화면 소스의 한글 리터럴을 축소형 허용 목록으로 고정한다**(`focus-ring`·`globals-css`와 같은 계열). ⚠️ **제품 이름은 문장 첫 자리에서도 `malmoi`다** — 도메인(`mal-moi.com`)과 같은 형이라 문장 위치가 표기를 바꾸지 않는다. `brand-spelling.test.ts`가 그 표기를 상시로 센다(2026-09-13 — 계정 화면에서 `malmoi`와 `Malmoi`가 한 화면에 같이 섰다).

- **Sentence case.** 라벨·열 제목·버튼·제목 전부.
- **UI 요소 라벨에 마침표 없음**(버튼·라벨·제목·배지). help text·Alert 본문 같은 완전 문장에는 있음. **느낌표 금지.**
- **줄임표 `…`** 는 진행 중("Saving…")과 추가 입력이 필요한 행동에만. 앞에 공백 없음. ⚠️ **검색 필드의 placeholder가 그 둘째 갈래다** (2026-09-11 사용자 — 앞으로 이 패턴이다): `Search projects…`. **`aria-label`에는 붙이지 않는다** — 스크린리더가 읽는 *이름*이라 장식이 들어가면 안 되고, 그래서 문구 키가 `label`/`placeholder`로 갈린다. **문자는 U+2026이고 마침표 셋이 아니다.**
- **버튼은 결과를 말한다** — "Save"가 아니라 "Create link"·"Remove member". 파괴 행동은 **무엇을** 파괴하는지 라벨에.
- **오류는 무엇이 일어났고 어떻게 풀지를 말한다.** "Sorry"·"Whoops"·"please" 금지. 다음 행동 없는 오류를 내지 않는다.
- **Alert 제목은 구두점 없는 문장 조각**, 본문 ≤2문장 + 다음 단계. variant는 **뜻**으로 고른다.
- **모달 제목은 대상을 명시한 질문**("Remove Jane Doe from bugshot-2?"), 액션 라벨은 결과("Remove member").
- 능동태·**축약형 선호**(can't, won't, you're)·숫자는 숫자로.
- **git 어휘를 편집자 화면에 쓰지 않는다** (`lib/pull/message.ts`의 옛 결정) — "PR opened"가 아니라 "Sent for review". 링크 라벨만 "View pull request"다(그 링크가 실제로 PR로 가므로).

### 10.1 화면 용어 (2026-09-24 — 번역자 기준 세트, audit #29)

**화면 문구만 이 표를 따르고 코드 식별자(`surface`·`locale`·`import`)는 그대로다.** 한 개념에 낱말이 둘이면 읽는 사람이 둘이 같은 것인지부터 되묻는다 — 2026-09-13 `malmoi`/`Malmoi`와 같은 계보라, 표를 **한 번에** 적용하고 `lib/i18n/__tests__/terminology.test.ts`가 사전 전체(함수 값은 호출해 렌더한 문장까지)를 상시로 센다.

| 개념 | 화면 용어 | 쓰지 않는 말 |
|---|---|---|
| 번역 표면 | **Source** / Sources | surface, Translation surface |
| 리포→앱 (CI·수동 모두) | **Sync** | import, imported |
| 앱→리포 | **Publish** | Send changes, pull |
| 언어 | **Language** / **Base language** | locale, Source language |
| OWNER 호칭 | **a project owner** (주어 자리 "Only project owners") | the project owner, an owner of this project, Only an owner |
| 재시도 | **Try again** | Retry, Check again |

- **`pull request`는 예외다** — GitHub의 고유명사이고 링크가 실제로 그리 간다(위 git 어휘 규칙과 같은 근거). 금지하는 것은 **방향 동사**다.
- **`push`는 토큰 이름(`Push token`·`PUSH_TOKEN`)과 개발자 화면 둘(①의 `Pushed 3d ago` · 설정의 CI 설명)에만 선다.** 번역자가 읽는 문장에 "the next CI push"를 쓰지 않는다 — "the next sync from the repository"다.
- **설정의 브랜치는 "base branch"다** (malmoi#85) — "default branch"는 **GitHub 리포의 기본 브랜치**이고 새 프로젝트 ①에서만 뜻이 맞는다. 이미 있는 프로젝트의 Sync·Publish가 그 브랜치를 못 읽으면 **설정된 이름**을 대고 Settings → Base branch로 보낸다(OWNER는 설정 링크, EDITOR는 "ask a project owner"). 온보딩 문장(`onboarding["base-branch-missing"]`)을 빌리지 않는다.
- **파일은 "translation files"다** — `locale files`는 표의 `locale` 금지에 걸린다. 한 언어의 파일을 가리킬 때만 "language file"이다. 경로 예시의 `{locale}` 자리표시는 **사용자가 칠 값**이라 예외다.
- **남을 가리키는 문구는 그 화면·그 역할에 실제로 있는 컨트롤만 부른다** (POSTMORTEM 2026-09-14). 번역 화면으로 데려가는 링크는 "Go to Publish"이고 "Send changes"가 아니다 — 도착한 화면의 버튼이 `Publish`다.
- **모르는 오류 코드를 문장에 끼우지 않는다** — `Couldn't apply that change: invalid input`은 코드 원문을 사람에게 읽힌다. 아는 코드는 사전 문장으로, 모르는 것은 "Refresh the page and try again." 폴백으로 간다.

## 11. 출처 (레이아웃 실측)

§5.1·§6.5의 GitLab 값은 2026-09-07에 읽은 gitlab `app/assets/stylesheets/framework/{variables,super_sidebar,layout,header,top_bar}.scss` ·
`app/assets/javascripts/super_sidebar/components/*.vue` · gitlab-ui `src/scss/variables.scss`·`src/components/base/{table,alert,card,breadcrumb,modal,new_dropdowns}` ·
design.gitlab.com `/product-foundations/layout` · `/components/{table,alert,card,breadcrumb,modal}` · `/patterns/empty-states` · `/content/{ui-text,punctuation,error-messages}`에서 왔다.
못 확인한 것: super sidebar 선택 항목의 정확한 배경(테마 변수 정의 파일 미발견). ⚠️ **그 자리는 세 번 바뀌었다** — 6단계는 `bg-background` 흰 알약, 8-2·8-3은 `bg-foreground/10` 알파(사이드바가 캔버스 위에 얹히면서 흰 알약의 근거가 사라졌다), **2026-09-11에 한 단계 내려 `bg-foreground/[0.07]`**이다(배경 없는 표면이라 같은 알파도 진하게 보인다, §6.5).

## 빠른 체크리스트 (새 UI 만들 때)

- [ ] `dark:`를 새로 쓰지 않았나 (§3)
- [ ] 식별자(키·slug·URL·경로)를 **sans**로 뒀나 — `text-mono`는 `<pre>` 코드 블록 전용이다 (§4.1). `<code>`를 썼으면 `font-sans`를 명시했나
- [ ] raw `<button>`·`<input>`·`<select>`·`<textarea>`를 쓰지 않고 프리미티브를 지났나 (§6.4·§7)
- [ ] `muted` 표면(사이드바·표 헤더·칩) 위에 `text-muted-foreground`·`hover:bg-accent`를 쓰지 않았나 (§2.1·§2.2)
- [ ] `bg-destructive`를 쓰지 않았나 — 글자색 전용이다 (§2.3)
- [ ] 새 raw 색을 늘리지 않았나 — §6.2의 등재 목록뿐이고 실물은 `visual-system.test.ts`의 `REGISTERED`다(값·파일 둘 다 센다). 예외는 **남의 자산**(브랜드 글리프 §6.8 · 국기 SVG §6.1)과 흑백 둘(`bg-white` 로그인 좌측 · `text-white` tone 위 글자)이다
- [ ] **weight가 400과 500 둘뿐인가** — 500을 넘지 않고 `font-light`도 쓰지 않는다 (§0·§4)
- [ ] **`tracking-*` 유틸을 쓰지 않았나** — 자간은 크기 토큰이 든다. 남은 자리는 **여덟**이고 예외는 §6.67뿐이다 (§4 — `visual-system.test.ts`가 파일별로 센다)
- [ ] **인라인 링크에 밑줄을 붙이지 않았나** (§0·§6.3)
- [ ] **그림자가 `shadow-low`·`shadow-medium`인가** — Tailwind 기본은 검정 기반이라 탁하다 (§4.5)
- [ ] 조건부 클래스가 `cn()`을 지나나 (§8)
- [ ] 임의값(`text-[Npx]`·`size-[Npx]`·`rounded-[10px]`) 대신 스케일을 썼나 (§4·§5·§6.8) — 셋 다 전수 0건이다. ⚠️ **`rounded-[4px]`(목록 스켈레톤의 타일)·`rounded-[3px]`(검색 일치 `<mark>`·Publish diff 낱말)는 남는다** — 이 리포의 스케일에 4·3이 없다(bare `rounded`는 `var(--radius)` = 12다)
- [ ] 문자열이 `messages/en.tsx`에서 오고 §10의 문체인가
- [ ] 외부 링크가 색 + `target="_blank" rel="noreferrer"`만 드나 — 글리프를 달지 않는다 (§6.3)
- [ ] 사이드바 항목·주 행동 버튼·Alert에 §6.8의 아이콘이 붙었나 — 16px, 색은 상속, 라벨 있으면 `aria-hidden`
- [ ] 결과를 인라인으로 보이는 컴포넌트가 `revalidatePath`가 바꾸는 분기 밖에 있나 (§6.6)
- [ ] (셸) §9.1의 아홉 축과 어긋나지 않았나 — 색·폰트를 GitLab에 맞추려 하지 않았나 (§9.2)
