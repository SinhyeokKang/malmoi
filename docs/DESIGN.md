# DESIGN.md

편집 UI의 시각 규칙. **`~/code/bugshot-2`의 `docs/DESIGN.md`를 원본으로 이식했고**, 두 축이 다르다: Tailwind **v4**(그쪽은 v3)이고 **라이트 단일**(그쪽은 라이트/다크 양쪽)이다. 그 차이가 만드는 함정을 §1·§3에 적었다.

**2026-09-07 — 레퍼런스를 Supabase → GitLab으로 바꿨다** (SaaS 6단계 `features/translation-ui/`). 가져오는 것은 **레이아웃·정보구조·컴포넌트 구성**(§5·§6.5~§6.7·§9)이고, **색 토큰·타입 스케일·간격·radius는 기존 것 그대로다**(§2·§4·§5 앞부분) — GitLab Pajamas의 팔레트·폰트를 들이지 않는다. 같은 날 컨트롤이 hand-rolled에서 **프리미티브(`components/ui/`)** 로 바뀌었다(§6.4·§7).

무엇을 만드는지는 [SAAS.md](./SAAS.md)(현재)와 [MVP.md](./MVP.md)(PoC — 닫힘), 화면별 구성은 [features/translation-ui/user-stories.md](./features/translation-ui/user-stories.md), 불변식은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. 기반 스택

| | 값 | bugshot-2와의 차이 |
|---|---|---|
| Tailwind | **v4** — `tailwind.config.js`가 **없다**. 테마는 `app/globals.css`의 `@theme inline` | v3 + config 파일 |
| 프리미티브 | **`components/ui/`를 이 리포가 소유한다** (2026-09-08 — shadcn 생성 코드를 걷어내고 다시 썼고 CLI를 다시 돌리지 않는다). Radix는 `radix-ui` 단일 패키지에서 DropdownMenu·Dialog·Tooltip 셋만 | shadcn 생성물을 그대로 씀 |
| 변형 | `class-variance-authority` — Button·Badge·Alert | 같음 |
| 아이콘 | `lucide-react` **16px** — 세트는 이것 하나이고 **셸은 전 항목이 든다** (§6.8). ⚠️ 1.x에 브랜드 아이콘(`Github`)이 없다 | 같음 |
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

shadcn 생성 코드가 사라져(2026-09-08) `dark:`를 쓰는 소스는 0곳이지만 **줄은 남긴다** — 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아나는 경로를 막는 것이 이 줄이고, `lib/__tests__/globals-css.test.ts`가 리터럴로 고정한다.

### 3.2 `.dark` 토큰 블록이 없다

`:root` 하나뿐이다. 다크 값을 되살리려면 `.dark` 블록을 추가하고 §2의 비대칭 판단(라이트 slate / 다크 neutral)을 다시 해야 한다 — 그건 bugshot-2 `docs/DESIGN.md` §2에 근거가 있다.

## 4. 타이포그래피

- **`font-sans`**: Pretendard Variable → 시스템 한/영 폴백. 폰트 파일은 **동적 서브셋 생성물**이라 `public/fonts/`가 gitignore돼 있다 (CLAUDE.md 폰트 절). GitLab Sans(Inter 기반)를 들이지 않는다 — Pretendard의 라틴 글리프도 Inter에서 왔다.
- 크기 관용: **`text-xs`·`text-sm`이 지배적**(라벨·필드·보조 텍스트·표 셀·버튼). `text-base`=본문·섹션 제목·**셸 안 페이지 제목**, `text-lg`=**셸 밖 카드의 제목 전용**(로그인·초대 수락 둘뿐이다 — 아래 네 번째 불릿).
- **임의값(`text-[…]`)은 스케일에 대응값이 없을 때만.** 12px은 `text-xs`, 14px은 `text-sm`이 있으므로 임의값으로 쓰지 않는다.
- 본문·셸 안 제목은 `font-medium`(500)이고, **셸 밖 카드의 페이지 제목만** `text-lg font-semibold tracking-tight`(600)다(로그인·초대 수락). 700은 쓰지 않는다.

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

### 6.1 번역 화면 — 패널 · 헤더 스트립 · 고정 슬롯 · 표

**표 밖에 셋이 있다** (2026-09-08 ship 3). 표만 적어 두면 다음 사람이 그 셋을 다시 발명한다.

| 요소 | 규칙 |
|---|---|
| **네임스페이스 패널** | `aside` `w-52 shrink-0 overflow-y-auto border-r py-2`(콘텐츠 표면 — 셸 사이드바의 muted가 아니다). 항목 `px-3 py-1.5 text-sm`, 우측에 `pending/total`(전부 번역됐으면 총계만). ⚠️ **선택은 `bg-muted` 알약이다** — 셸 사이드바의 선택은 `bg-background`다. **비대칭이 의도다**(표면이 서로 반대라서) — 한쪽으로 맞추면 그 표면에서 알약이 사라진다. muted 알약 위 글자는 `text-foreground`이고 링에 `ring-offset-1`을 덧댄다(§7) |
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

### 6.2 상태 색 — 배지 4종 + 연결 건강성 6종 + Alert 4종, 색 체계는 하나

**축이 셋이고 색 체계는 하나다.** amber는 **경고**, destructive는 **글자색 전용 오류**, 나머지는 무색이다. **semantic 토큰으로 표현 못 하는 상태 색**이라 raw 색을 쓰되, 라이트 단일이므로 `dark:` 짝을 두지 않는다.

| 상태 | 색 | 근거 |
|---|---|---|
| 미번역 | 무색 — `text-muted-foreground` "Untranslated" | 없음은 상태가 아니라 부재다. 색을 주면 셋 중 가장 흔한 것이 가장 시끄러워진다 |
| 검토필요 (`needsReview`) | **amber** — `Badge warning` = `bg-amber-100/80 text-amber-800` | 경고지 오류가 아니다 |
| 미배포 (`isUnpublished`) | 무색 — `Badge muted` "Not yet sent" | 툴바 건수·편집 손실 배너와 **같은 술어**다(`updatedBy`가 사람인 행). 색을 주면 편집 직후의 정상 상태가 경고로 읽힌다 |
| orphaned | **red 계열 글자만** — `Badge danger` = `text-destructive` (배경 없음) | §2.3대로 글자색 전용. 배경을 주면 "삭제됨"으로 읽히는데 실제로는 되돌릴 수 있다. **키 행과 로케일 헤더 두 축에 같은 표기** |

**연결 건강성 6종** (설정 화면): **배지를 쓰지 않는다** (2026-09-08 실물 정정) — `ok`·`not-connected`·`unknown`은 평문 `text-muted-foreground text-xs`(가장 흔한 상태가 조용하다) / `repo-moved` → **`Alert warning`** / `app-uninstalled`·`installation-changed` → **`Alert danger` + [Reconnect]**. 색 체계는 아래와 같고 담는 그릇만 다르다. ⚠️ **`unknown`을 `app-uninstalled` 색으로 접지 않는다** — 조회 실패를 "제거됨"으로 보여주면 사용자가 멀쩡한 설치를 다시 만든다.

**첫 적재 상태 3종** (`planProjectReadiness`): `ready` → **표시 없음**(`readinessLabel`이 `null`) / `awaiting_first_sync`·`setup` → 무색 `Badge muted`. 오류가 아니라 진행 중이다.

**Alert 4종** (§6.4 — Publish 결과·편집 손실 배너·페이지 수준 거부):

| variant | 색 | 쓰는 곳 |
|---|---|---|
| `info` | `border-border bg-muted/40` + `Info` 아이콘 `text-muted-foreground` | "Nothing to publish" |
| `success` | `border-border bg-background` + `CircleCheck` 아이콘 `text-foreground` | Publish 성공 둘 — **초록을 쓰지 않는다**(raw 색을 늘리지 않는다). 성공은 조용하다 |
| `warning` | `border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert` | 편집 손실 배너 · Publish "일부 미기록" · `repo-moved` |
| `danger` | `border-destructive/40 bg-background text-destructive` + `CircleX` | Publish 실패 · 페이지 수준 거부(`?e=`) · 블록 안 컨트롤 실패 |

⚠️ **내부 이름을 화면에 쓰지 않는다** — `awaiting_first_sync`는 번역자에게 아무것도 알려주지 않는다 (SAAS §3). 문구는 `messages/en.tsx`이 든다.

**새 raw 색을 늘리지 않는다.** 등재된 것이 전부다 — **amber**(`100/80`·`800`, Alert용 `50`·`200`·`900`)·**destructive**, 그리고 §6.3의 외부 링크 **blue-600**. 초록·주황·보라는 없다.

### 6.3 외부 링크

**리포 밖으로 나가는 링크는 전부 `text-blue-600 underline` + `ExternalLink` 12px 아이콘**이다 — 코드 참조 permalink · Publish 결과의 PR 링크 · 툴바의 "View what was sent" · App 설치 링크 둘. ⚠️ 2026-09-08 `/doc-check`이 다섯 곳 중 **둘만** 아이콘을 든 상태를 잡았다 — 규칙이 아니라 코드를 고쳤다. `target="_blank" rel="noreferrer"`. 내부 링크(사이드바·breadcrumb·목록 행)는 밑줄 없이 `text-foreground`/`text-muted-foreground`다.

### 6.4 공통 형 — 프리미티브가 든다 (2026-09-08)

옛 판의 "hand-rolled 컨트롤 클래스 표"는 사라졌다. **형은 `components/ui/`의 variant이고 화면은 raw 태그를 쓰지 않는다** — `focus-ring.test.ts`가 `ui/` 밖의 `<button>`·`<input>`·`<select>`·`<textarea>`를 **0개로 고정한다** (§7 — 축소형 허용 목록이 2026-09-08 ship 4에서 비어 전면 방어선이 됐다). 색은 전부 §2의 토큰이다.

| 프리미티브 | 형 (옛 표의 어느 행을 잇나) |
|---|---|
| **Button** `primary` | `bg-primary text-primary-foreground hover:bg-primary/90` · `h-8 px-3 text-sm font-medium rounded-md` — 옛 "primary 버튼". **화면당 하나**(확정 액션) |
| **Button** `default` | `border border-input bg-background hover:bg-accent text-foreground` · 같은 치수 — 옛 "bordered(페이지·툴바)"를 하나로. 툴바도 `h-8`이다 |
| **Button** `danger` | `default` + `text-destructive border-destructive/40 hover:bg-destructive/5` — `bg-destructive` 없음(§2.3). 멤버 제거·연결 해제·초대 취소 |
| **Button** `ghost` | 배경·테두리 없음 · `text-muted-foreground hover:text-foreground` — 옛 "텍스트 버튼"(밑줄 제거). 툴바 보조·아이콘 버튼·사이드바 |
| **Button** `link` | `text-blue-600 underline` 인라인 — 번역 셀의 [Retry]·[Sign in] (초대 화면의 "Sign in with another account"는 기본형 `w-full`이다) |
| **Button** `size="sm"` | `h-7 px-2 text-xs` — 표 안·배지 옆 |
| **Button** `disabled` | `disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent`(default·ghost) / `disabled:opacity-70`(primary) — 옛 규칙 그대로 |
| **Button** `loading` | **라벨 교체**("Saving…") + disabled. 옆 문구가 아니다(폭이 흔들린다). **목록 안에서는 누른 버튼 하나만** 교체한다 |
| **ButtonLink** | 같은 variant·size를 입은 `<Link>` — 주 행동이 **라우트 이동**인 자리("New project"·"Open translations"). ⚠️ **`Button`에 `asChild`를 두지 않는 것의 짝이다**: Slot 한 겹이 `<button>` 태그를 지워 `focus-ring` 스캐너가 그 파일을 못 보게 된다(§7). 형의 단일 출처는 `buttonClass()` |
| **Input·Select** | `h-8 px-2 text-sm border border-input bg-background rounded-md` · invalid `border-destructive` · disabled `bg-muted text-muted-foreground` — 옛 "입력(페이지·툴바)"을 하나로 |
| **Textarea** | 같은 형이지만 **`h-8`을 안 든다** — `rows=1` + `field-sizing-content py-1`이라 높이는 내용이 정한다 (§6.1) |
| **FormGroup** | label `text-sm font-medium` · help `text-xs text-muted-foreground` · error `text-xs text-destructive` · "(optional)" `font-normal` |
| **Radio** | `size-4` · `border-input accent-primary` · label `text-sm`. **`Checkbox`는 없다** — 와이어 여덟에서 사용 0회라 필요해질 때 만든다 |
| **Badge** | `text-xs rounded px-1.5 py-0.5` · variants `muted`(`text-muted-foreground`, 배경 없음)·`warning`(amber)·`danger`(`text-destructive`) — §6.2 |
| **Alert** | `rounded-lg border p-4` · 좌측 아이콘 16 · 제목 `text-sm font-medium` · 본문 `text-sm` ≤ 2문장 + 다음 행동 · 액션 최대 2 · 닫기 우상단 `ghost sm`. variant 넷은 §6.2. **배치 셋** — global(top bar 아래 전폭 — `?e=` 거부) · page-level(제목 아래 — 편집 손실 배너·Publish 결과) · in-block(설정 블록 안 — 컨트롤 실패) |
| **Card** | `border-border rounded-lg border` · 헤더(`px-4 py-3 border-b` 제목 `text-sm font-medium` + 우측 슬롯) · 본문 `p-4 space-y-2` — 옛 "섹션 카드" |
| **Table** | §6.1 |
| **Breadcrumb** | `text-xs` · 항목 `text-muted-foreground hover:text-foreground` · 마지막 `text-foreground font-medium` `aria-current="page"` · 구분자 `/` `text-muted-foreground/60 px-2` |
| **DropdownMenu** | `min-w-60 rounded-lg border bg-popover shadow-md py-1` · 항목 `mx-1 px-2 py-1.5 rounded text-sm hover:bg-accent` · selected `bg-muted` + `Check` 16 |
| **Dialog** | `max-w-lg rounded-lg border bg-background shadow-lg` · 제목 `text-base font-medium` · 본문 `p-4 text-sm` · 푸터 `p-4 pt-2 gap-2` 버튼 최대 3(primary·default·ghost cancel) · 배경 `bg-foreground/40` · Esc·배경·X·Cancel 넷으로 닫힌다 |
| **Tooltip** | `bg-foreground text-background text-xs px-2 py-1 rounded shadow-md` · 접힌 사이드바의 아이콘 라벨에만. ⚠️ **프리미티브가 자기 `Provider`를 든다** (2026-09-08) — Radix는 조상 provider가 없으면 **던지고**, 그 툴팁은 접힌 상태에서만 렌더되므로 "접기를 누르면 셸이 죽는다"로 나타난다(접힘이 `localStorage`에 남아 영구화된다, POSTMORTEM 2026-09-08). 바깥의 `TooltipProvider`는 **지연 공유 최적화**이고 필수가 아니다 |
| **Avatar** | 사람 = `rounded-full`, 프로젝트 = `rounded`(라운드 사각) · 16/24/32 · 이니셜 폴백 `bg-muted text-foreground/60` |
| **EmptyState** | 제목 `text-base font-medium` ≤5단어 마침표 없음 · 설명 `text-sm text-muted-foreground` 완전 문장 · 액션 **버튼 하나** · 일러스트 없음 |
| **값 칩** | `text-mono bg-muted rounded px-2 py-1` — `text-xs`를 겹치지 않는다(§4.2). 블록 요소면 `inline-block` |
| **코드 블록** | `<pre className="text-mono bg-muted overflow-x-auto rounded-md p-3">` + **블록 위 한 줄의 오른쪽**에 [Copy] `default`(아이콘 `Copy` → `Check`) → 라벨 교체 "Copied", 실패는 "Copy failed"(삼키면 사용자가 복사된 줄 알고 떠난다) |

**빈 상태 문체**: 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, 버튼 하나 (§10).

### 6.5 앱 셸 — 사이드바와 top bar (GitLab super sidebar 형, 2026-09-07)

레이아웃만 GitLab이다. 색은 §2다.

| 요소 | 규칙 |
|---|---|
| 사이드바 | `w-60 shrink-0 bg-muted border-r border-border` (§5.1) · `xl` 이상에서 아이콘 레일(`w-12`)로 접기 · `xl` 미만은 햄버거로 여는 오버레이 + `bg-foreground/40` 배경 |
| 브랜드 | `h-12 px-4` "Malmoi" 워드마크 `text-sm font-medium` |
| 프로젝트 컨텍스트 | `mx-2 my-1 px-2 py-2 rounded-md` · 아바타 24 라운드 사각 + 이름 `font-medium truncate` + `ChevronsUpDown` 16 → DropdownMenu(**내 멤버십 목록만** — "All projects"는 하단 전역 항목이 든다). hover는 `hover:bg-background/60`이다 — muted 표면에서 유효한 유일한 배경 hover다(§2.1). **프로젝트 밖 라우트(`/projects`·`/projects/new`·`/account`)에는 없다** |
| 섹션 항목 | `h-8 mx-2 px-2 rounded-md text-sm flex items-center gap-2` · 아이콘 16(`Languages`·`Users`·`Settings` — **전 항목 표는 §6.8**) · **비활성 `text-foreground/70 hover:text-foreground`(muted 표면이라 §2.2·§2.1 — `hover:bg-accent`는 무효)** · **선택 `bg-background text-foreground font-medium shadow-sm`**(흰 알약 — GitLab의 선택 배경을 우리 토큰으로 옮긴 것) · **우측 카운트는 없다** — SAAS §7.7 결정 5이 그것을 닫았다(셸이 매 렌더에 세게 되고 키 수와 무관한 1.9초 고정비가 이미 있다). 카운트가 사는 곳은 번역 화면의 네임스페이스 패널이다(§6.1) |
| **구역 둘** | ⚠️ **축이 둘이라 구역이 둘이다** (6b-4 — SAAS §7.7). 순서는 **사용자 축 먼저**(`Your work`: All projects · New project · Your account) → **프로젝트 축**(`<project>`). 헤더가 서로 다르다: 앞은 라벨 `<p>` `text-xs text-muted-foreground font-medium tracking-wide uppercase px-4 pt-2 pb-1`, 뒤는 **프로젝트 컨텍스트 스위처가 곧 헤더**다(이름을 라벨로도 보이면 같은 값이 두 번 뜬다). 둘째 구역만 `border-t border-border mt-3 pt-1`. ⚠️ **`<nav>` 둘이 `aria-label`을 든다** — 라벨이 `<p>`라 접근성 트리에서 이름이 아니고 **접힌 레일에서는 렌더되지 않는다**(그때 구역을 구별할 수단이 `aria-label`뿐이다) |
| 프로젝트 축 항목 | Translations · Members · Settings* (* `project:settings`가 있는 역할에만 — 편의다, 방어는 페이지). ⚠️ **Locales·Home은 6b-5·6b-6, Logs는 7단계다** — **항목은 자기 라우트와 같은 사이클에 온다**(없는 라우트를 가리키는 항목은 404다) |
| 활성 판정 | ⚠️ **축마다 다르다.** 프로젝트 축은 **접두**(`?ns=`·`/settings` 같은 하위 경로가 있다), 사용자 축은 **정확히 일치** — `/projects`가 `/projects/new`의 접두라 접두로 재면 새 프로젝트 화면에서 [All projects]도 함께 선택돼 보인다 |
| 하단 전역 | Sign out · **Collapse sidebar** — 라우트가 아니라 조작이라 구역 밖 `mt-auto`다. 같은 항목 형이고 **아이콘도 전부 든다**(§6.8) |
| top bar | `h-12 bg-background border-b border-border px-4 flex items-center justify-end` · **드는 것은 사용자 메뉴 하나다** — 아바타 32 원형 `ghost` 버튼 → DropdownMenu(이름·이메일 → **Your account** → Sign out). ⚠️ **breadcrumb은 여기 없다** (2026-09-08 정정): 레이아웃이 페이지 props를 못 받아 여기 두려면 parallel route 슬롯이나 클라이언트 컨텍스트(첫 페인트 플래시)가 필요하다 — **페이지 콘텐츠의 첫 줄**이 든다(`features/translation-ui/design.md` §2). 햄버거(`xl` 미만)는 사이드바가 자기 여는 버튼으로 든다 |
| 콘텐츠 | `flex-1 min-w-0` · limited면 `mx-auto max-w-4xl px-6 py-6` · fluid(번역)면 `flex min-h-0 flex-1` |
| **셸 루트** | ⚠️ **`flex h-svh overflow-hidden`이고 `min-h-svh`가 아니다** (malmoi#13). `min-`은 "최소 한 화면"이라 콘텐츠가 길면 컨테이너가 함께 자라고, 그러면 `aside`가 stretch로 **문서 높이만큼** 늘어 Sign out·Collapse sidebar가 화면 밖으로 나간다 — 24키 화면에서도 그랬다(`scrollHeight` 1483 / 뷰포트 775). **스크롤은 콘텐츠 컬럼과 사이드바가 각자 든다**(둘 다 `overflow-y-auto`), 콘텐츠 컬럼엔 `min-w-0`이 함께 있어야 번역 표의 가로 스크롤이 사이드바를 밀지 않는다. `app/(edit)/__tests__/shell-layout.test.ts`가 소스로 고정한다 |

GitLab top bar의 검색·`+`·카운터 셋은 **넣지 않는다** — 대응물이 없고 SAAS §4.2가 기능 밀도를 막는다. **Publish 버튼은 셸에 없다** — 번역 화면 툴바다(셸은 `/projects`도 감싸 slug를 모른다).

### 6.6 설정 (`/projects/[slug]/settings`) — settings-block 다섯

블록 = `Card` 한 장(제목 + 한 줄 설명 `text-xs text-muted-foreground` + 본문). 위에서 아래로 **Repository**(mono 리포 칩 + 연결 상태 + [Connect]/[Reconnect]) · **Import status** · **Push token** · **Workflow** · **GitHub account**(mono `@handle` 칩 + [Disconnect] `danger sm`). ✅ **Base branch·Base language 폼은 6b-3이 Repository 카드에 넣었다**(기준 로케일은 6b-5가 `locales`로 옮긴다 — SAAS §7.7 결정 4). ⚠️ **GitHub account 블록은 `/account`(6b-4)와 같은 상태를 보인다** — 같은 로더(`lib/github-connect/account-view.ts`)를 부르고 다른 것은 연결 버튼의 착지뿐이다. **여기서 그 블록을 지우지 않는다**: 재인가 안내가 리포 재연결의 맥락에서 필요하고, 그 자리에서 "Manage in Account"로 링크하면 고치려고 두 화면을 오간다(§7.7 결정 4와 같은 판단).

- ⚠️ **블록이 독립적으로 실패한다.** 건강성은 App 토큰, 계정 한 줄은 사용자 토큰 — 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다. 각 블록이 자기 오류를 `Alert danger`(in-block)로 낸다.
- **push 토큰은 발급 응답에만 원문이 있다** — 값 칩 + [Copy] + "You won't see this again. Update the repository secret now."
- **[Run first import]의 결과 컴포넌트는 readiness 분기 밖**에 있다 (POSTMORTEM 2026-09-07 revalidate).
- **(6b) Base branch·Base language 저장 뒤에는 `Alert warning`이 블록 안에 남는다** — "Update the workflow file — until then CI pushes are rejected" (design §3.13, `checkFormat` 409). 그 폼이 서기 전까지는 이 불릿의 대상이 없다.
- 페이지 수준 거부(`?e=`)는 **global Alert**, 컨트롤의 실패는 **in-block Alert** — 두 층을 섞지 않는다.

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
- ⚠️ **이메일 마스킹의 예외가 여기 있다.** 두 표 모두 `maskEmail`이 기본이지만(이 표는 EDITOR도 본다 —
  규칙을 역할로 나누지 않는다) **대기 초대는 마스킹한 주소가 유일한 식별자**라 첫 글자만 남기면 서로 다른
  둘이 같은 행이 된다([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)). 서버가
  `maskedInviteLabels`로 **목록 전체를 보고** 충돌하는 행만 접두를 늘린다 — 충돌이 없으면 출력이 `maskEmail`과
  같다(§6.1 "가장 흔한 상태가 가장 조용하다").
- **대기 0건은 `EmptyState`** — 표 머리만 남은 화면은 "불러오는 중"과 구별되지 않는다.
- **EDITOR에게는 컨트롤이 아예 렌더되지 않는다**([Invite member]·`Select`·[Remove]·[Revoke] 전부). 목록과
  대기 초대는 본다. ⚠️ 노출은 편의이고 차단이 아니다 — 판정은 Action의 `member:manage`다.

### 6.67 계정 (`/account`) — 카드 셋 (2026-09-09, 6b-4)

**사용자 축의 유일한 화면이다** (SAAS §7.7). 셸 안 `mx-auto max-w-4xl px-6 py-6`, 제목 `text-base
font-medium`, **breadcrumb 없다** — 프로젝트 축이 아니라 위로 올라갈 자리가 없다.

카드 셋: **Profile** · **GitHub account** · **Sign out**.

| 블록 | 규칙 |
|---|---|
| Profile | 이름·이메일을 `<dl>`로 (`sm:grid-cols-[8rem_1fr]`, 라벨 `text-xs text-muted-foreground`). ⚠️ **읽기 전용이고 그 이유를 카드 설명이 말한다** — provider가 소유하고 재로그인마다 `planEmailRefresh`가 갱신한다(고칠 수 있게 하면 초대 대조가 검증되지 않은 주소 위에 선다). 값은 세션이 아니라 **`User` 행**에서 읽는다: 초대 대조가 보는 값이 그쪽이다. ⚠️ 주소는 식별자라 `text-mono`이고 **마스킹하지 않는다**(자기 주소다 — 남의 주소를 보이는 자리만 `maskEmail`을 지난다) · 값이 없으면 "None" |
| GitHub account | 설정 화면 §6.6의 같은 블록과 **같은 4갈래**(`ok` 연결됨 / `ok` 미연결 / `reauthorize` / `unavailable`)이고 같은 로더를 부른다. 다른 것은 **연결 버튼의 착지**뿐이다(`dest="account"`) |
| Sign out | 셸에 이미 둘(사이드바 하단·유저 메뉴)이 있는데 여기 세 번째를 둔다 — Action 하나에 상태가 없어 **낡을 수 없고**, 계정 화면에 로그아웃이 없으면 사용자가 찾으러 나간다. 버튼은 `default sm`이다(`danger`가 아니다 — 되돌릴 수 있다) |

⚠️ **페이지 수준 거부는 global `Alert danger`** (§6.4) — callback이 연결 실패를 `?e=`로 여기 보낸다.
**주소창 값이라 `isConnectError`로 거른다**: 캐스팅하면 프로토타입 키가 문자열 자리에 함수를 넣어 화면이
죽는다 (POSTMORTEM 2026-09-08).

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

세트는 `lucide-react` **하나**다 (§1). 크기는 **셋뿐이다**: **16**(기본 — 사이드바·버튼·Alert·인라인) · **12**(외부 링크 `ExternalLink`만, §6.3) · **24**(`EmptyState` 하나). 그 밖의 크기를 만들지 않는다 — 사이드바 항목이 `h-8`이고 아이콘 박스가 `size-6`이라 20 이상은 알약 안에서 넘친다 (§5.1).

**아이콘이 없으면 미완인 자리** (LNB가 대표다 — 접힌 레일에서는 아이콘이 유일한 라벨이므로, 항목 하나라도 비면 그 상태가 성립하지 않는다):

| 자리 | 아이콘 |
|---|---|
| 사이드바 섹션 | Translations `Languages` · Members `Users` · Settings `Settings` |
| 사이드바 하단 전역 | All projects `LayoutGrid` · New project `Plus` · Account `CircleUser` · Sign out `LogOut` · Collapse `PanelLeft` |
| 프로젝트 컨텍스트 | 우측 `ChevronsUpDown` (DropdownMenu 트리거) |
| top bar | **사용자 메뉴 아바타뿐이다** — 햄버거 `Menu`(`xl` 미만)는 그것이 여는 **사이드바**가 든다. breadcrumb 구분자는 아이콘이 아니라 텍스트 `/`다(§6.4) |
| 아이콘 전용 버튼 | 닫기 `X` · 복사 `Copy` → 성공 `Check` · 재시도 `RotateCcw` · 행 메뉴 `Ellipsis` |
| 주 행동 버튼 | Publish `Send` · 리포 재연결 `RefreshCw` · 첫 적재 `Play` · 초대 `UserPlus` · GitHub 연결 `Link2` |
| 필터 | 검색 `Input` 앞 `Search`(`absolute left-2` + `pl-8`) · 상태 `Select` 앞 `ListFilter` |
| Alert 4종 | `Info`·`CircleCheck`·`TriangleAlert`·`CircleX` — **정본은 §6.2 표**다 |
| 외부 링크 | `ExternalLink` 12 (§6.3) |
| `EmptyState` | 24 `text-muted-foreground` 하나 — **일러스트는 여전히 없다** |

**쓰지 않는 자리** (아이콘이 정보를 안 더하고 스캔만 방해한다): 배지(§6.2는 텍스트만) · `Card` 제목 · 표 헤더 · **반복 목록의 모든 행**(네임스페이스 패널·리포 목록·키 행 — 같은 아이콘이 n번 반복되면 정보량이 0이다) · 텍스트 링크 안(외부 링크 예외).

**형**: `size-4`(12는 `size-3`, 24는 `size-6`) · 색은 **상속**(`currentColor`) — 아이콘에 별도 색 클래스를 주지 않는다(예외는 Alert 4종과 `EmptyState`뿐) · 라벨과 `gap-2` · **라벨이 있으면 `aria-hidden`**, 아이콘만이면 `aria-label`, 접힌 사이드바는 Tooltip **과** `aria-label` 둘 다 (§7).

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
- 아이콘만 있는 버튼은 `aria-label`. 사이드바 접힘 상태의 라벨은 Tooltip **과** `aria-label` 둘 다.
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
| **top bar** | 사용자 메뉴 우 · 48px — **breadcrumb은 페이지 콘텐츠 첫 줄이다**(§6.5) | §6.5 |
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
- **일러스트**(빈 상태 SVG) — 로그인 우측 장식은 CSS dot-grid + **토큰만 쓴 정적 모형 카드** 하나뿐이다(design §3.12).

### 9.3 판정 기준

"GitLab처럼 보이는가"로 판정하지 않는다. **§9.1의 아홉 축 중 어긋난 것이 있는가**로 본다 — 그래야 "GitLab처럼 보이게" 다듬는 작업이 색·폰트로 새지 않는다.

## 10. UI 문장 규칙 (en — design.gitlab.com/content에서 가져온 것, 2026-09-07)

문자열은 `messages/en.tsx`에 있고 화면은 **`@/lib/i18n`의 `m`** 으로 읽는다(design §3.1 — 그 모듈은 잎이라 `client-graph.test.ts`가 무게를 센다). 이 절이 그 문체이고, **`lib/i18n/__tests__/no-korean-ui.test.ts`가 화면 소스의 한글 리터럴을 축소형 허용 목록으로 고정한다**(`focus-ring`·`globals-css`와 같은 계열).

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
- [ ] 문자열이 `messages/en.tsx`에서 오고 §10의 문체인가
- [ ] 외부 링크에 `ExternalLink` 아이콘이 있나 (§6.3)
- [ ] 사이드바 항목·주 행동 버튼·Alert에 §6.8의 아이콘이 붙었나 — 16px, 색은 상속, 라벨 있으면 `aria-hidden`
- [ ] 결과를 인라인으로 보이는 컴포넌트가 `revalidatePath`가 바꾸는 분기 밖에 있나 (§6.6)
- [ ] (셸) §9.1의 아홉 축과 어긋나지 않았나 — 색·폰트를 GitLab에 맞추려 하지 않았나 (§9.2)
