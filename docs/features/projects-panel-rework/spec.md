# spec — projects-panel-rework

**시안이 정본이다.** Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의
`design_handoff_projects_panel_rework/` — `README.md`(읽음) + `Projects v2.dc.html`(아트보드 `1a`~`1d`, **미독**).
⚠️ **캔버스를 아직 안 읽었다** — 이 스펙은 README만으로 섰다. `/tdd` 전에 `/design-sync --audit`으로
아트보드 넷의 인라인 스타일을 받아 §6의 치수표를 확정한다. **README와 캔버스가 어긋나면 캔버스가 이긴다.**

## 1. 사용자

**둘 다.** `/projects`는 로그인 직후의 착지점이고 인가 거부의 리다이렉트 목적지다 — 개발자도 번역
편집자도 매번 여기를 지난다. 다만 이 화면이 답하는 질문은 하나다: **"어디로 들어갈까."**

①②(PanelHeader·PageTitle)는 그보다 넓다 — **라우트 9개 전부**의 머리가 움직이므로 두 사용자가 보는
모든 화면이 대상이다.

## 2. 문제 — 관측된 사실

1. **패널 머리의 여백을 프리미티브가 아니라 소비자 11곳이 각자 판단한다.** 실측(`grep -rn "<PanelHeader"`):
   - fluid 4곳은 `PanelHeader`에 `className="… px-6 pt-6 pb-3"`를 직접 넘긴다.
   - limited 7곳은 안쪽 래퍼 `mx-auto w-full max-w-4xl px-6 pt-6 pb-3`가 든다.
   - `components/onboarding/add-surface.tsx`만 `px-6 py-5`로 **혼자 다르다**.
   → 같은 값을 11번 적는 동안 하나가 이미 어긋나 있었다.
2. **24와 12가 섞인 비대칭이다.** 폭이 줄면 좌우(24)만 답답해지고 아래(12)는 그대로다.
3. **머리 아래 선이 없다.** 본문이 전부 카드(border 1 · radius 12)가 되면서 제목 줄이 **카드 사이에 뜬
   또 하나의 요소**로 읽힌다.
4. **PageTitle 20과 카드 헤더 15의 차가 5px이라 위계가 과하다.** 빈 상태 제목은 이미 18이라 같은 화면
   안에서 제목이 두 급을 쓴다.
5. **그룹 헤더가 카드 밖 14/500 줄이다.** `Project Home`은 이미 반대 문법(카드가 자기 제목을 든다)이고,
   같은 앱이 같은 것을 두 문법으로 말한다.
6. **Summary 넷이 못 누르는 숫자로 머리 90px을 차지한다.** 계정 합계는 "어느 프로젝트를 열지"에
   쓰이지 않고, 같은 값을 프로젝트별로 쪼갠 것이 이미 행의 Meter와 아래 띠다.
7. **빈 상태만 화려하다.** 다른 블록이 전부 `border 1 · radius 12 · 흰 배경`인데 `EmptyProjects`만
   그라데이션 + 점 필드 + KV 합성 + `size="lg"` 버튼이다.

## 3. 완료 조건

검증 가능한 문장으로만 쓴다.

1. **`PanelHeader`가 여백과 선을 든다.** 소비자 11곳 중 `className`으로 padding을 넘기는 곳이 **0**이다.
   - 검증: `grep -rn "<PanelHeader" components app | grep -v __tests__ | grep -E "px-|py-|pt-|pb-"` → 0건.
2. **limited 7곳이 이중 여백을 만들지 않는다.** 폭 등급이 프리미티브의 prop이 되고, 안쪽 래퍼의
   `max-w-4xl px-6 pt-6 pb-3`가 사라진다.
   - 검증: `/design-sync` 4단계에서 라우트 9개의 머리 computed `padding`이 전부 `16px`.
3. **머리 아래 `border-bottom: 1px #e5e5e5`가 라우트 9개 전부에 있고, 스크롤 여부와 무관하게 늘 있다.**
   로딩 골격(`projects/loading.tsx`·`account/loading.tsx`)에도 있다.
   - 검증: computed `border-bottom-width` = `1px` · 스켈레톤 DOM 테스트.
4. **PageTitle이 18/500/0.01em이다.** `text-xl`을 쓰는 화면 제목 h1이 **0**이다(모달 제목·아바타는 제외).
   - 검증: `grep -rn 'text-xl font-medium' app components | grep -v ui/avatar | grep -v onboarding/modal`
   - ⚠️ **오늘 이 명령은 10을 낸다: 제목 h1 아홉 + `project-list.tsx:283` 하나.** 마지막 하나는 제목이
     아니라 **SummaryRow의 수치**라 T3이 아니라 **T7에서 사라진다** — 그래서 **0이 되는 시점은 T7 뒤**이고,
     T3 직후의 기대값은 **1**이다. (POSTMORTEM 2026-09-14: 세는 명령은 실제로 돌려 본문과 맞춘다.)
5. **`/projects` 본문이 카드 셋이고, 각 카드가 자기 헤더(padding 16 · 15/500 + 카운트 배지)를 든다.**
   헤더↔첫 행 구분선이 `#f0f0f0`, 행↔행이 `#e5e5e5`로 **급이 다르다**.
   - 검증: DOM 테스트가 두 색을 구별해 단언 + computed style 실측.
6. **Summary 넷이 `/projects` 화면에서 사라진다.** `ProjectListView`에 `summary` 필드가 없다.
   - 검증: `grep -rn "SummaryRow\|view.summary\|\.summary\b" app components lib/keys/query.ts` → 목록 경로 0건.
7. **`summaryQueue`·raw 집계 ④(`newKeys`)·`m.projects.summary.*`는 그대로 남고 테스트도 green이다.**
   — `project-home`이 새 소비자다 (§5).
   - 검증: `pnpm test` green · `pnpm test:projects:postgres` green.
8. **빈 상태(`1b`)와 검색 0건(`1d`)이 같은 카드 규격을 쓴다.** 다른 것은 아이콘과 출구의 무게뿐이다
   (만들기=채운 버튼 / 되돌리기=링크). `KeyVisual`·`DotField`가 `/projects` 경로에서 사라진다.
   - 검증: `grep -rn "KeyVisual\|DotField" components/projects app/\(edit\)/projects` → 0건.
9. **검색 결과(`1c`)가 결과 카드 하나이고, 헤더가 `Results for "{query}"` + 카운트 + `Clear search`다.**
   제목 옆 총계 배지는 **질의에 흔들리지 않는다.**
   - 검증: DOM 테스트 — `q=chrome`일 때 배지가 `3`, 카드 카운트가 `1`.

## 4. 비목표

- **`ProjectRow`를 건드리지 않는다.** 글리프 28/radius 4 · 이름 칸 420 고정 · Meter 100/gap 16/바 4 ·
  우측 칩 + chevron · padding `14 14 14 12` — 앞선 핸드오프의 규격이 그대로 유효하다.
- **그룹 배정 규칙을 건드리지 않는다.** `groupProjects`·`projectStatus`·`rowBanner`·`meterSlot`의
  판정은 입력도 출력도 그대로다. 바뀌는 것은 **그릇**뿐이다.
- **그룹을 접지 않는다.** Archived가 1건이어도 카드로 남는다.
- **카드 바닥에 더 보기 링크를 두지 않는다** — 이 카드는 그룹 전체를 이미 그린다.
- **필터 축을 되살리지 않는다.** URL은 `q` 하나다.
- **계정 단위 큐 화면을 만들지 않는다.** Summary 넷이 돌아갈 자리는 이 기능 밖이다.
- **`Project Home`의 카운트 카드를 만들지 않는다.** 그것은 `docs/features/project-home/`의 범위다.
- **스키마·환경변수 변경 없음.**

## 5. ⚠️ `project-home`과의 의존 — Summary는 삭제가 아니라 **이관**이다

사용자 판정(2026-09-15): **"summary 데이터 project 홈에서 쓸거야."**
`docs/features/project-home/`가 이미 그것을 설계해 뒀고, 본 기능은 **화면에서만** 걷어낸다.

| 대상 | 본 기능 | 근거 |
|---|---|---|
| `SummaryRow` (`project-list.tsx:247`) | **삭제** | 시안에서 사라진 블록 |
| `ProjectListView.summary` + `loadProjectList`의 `summaryQueue({...})` 호출 | **삭제** | 목록이 더는 안 쓴다 |
| `summaryQueue()` (`lib/projects/list.ts:328`) + 단위 테스트 | **존치** | `project-home/tasks.md` T4 — *"`summaryQueue`를 고치지 않는다. 호출부가 `archived: false`를 고정으로 넘긴다"* |
| raw 집계 ④ `newKeys` (`lib/keys/query.ts:598`) + 단위·통합 테스트 | **존치** | `project-home/design.md` §3.1 — `New from GitHub`의 원천 |
| `m.projects.summary.*` 넷 | **존치** | `project-home/tasks.md`:189 — *"카드 넷의 제목은 새로 만들지 않는다"* |

### ⚠️ 고아 창(orphan window)을 감수한다

목록의 호출을 떼면 `summaryQueue`와 `newKeys`가 **어느 화면에도 안 붙은 채로** 남는다.
CLAUDE.md의 *"내 변경이 만든 고아만 제거"*에 걸리지만, **여기서는 제거가 틀린 답이다** —
`project-home`이 곧 그 소비자가 되고, 지웠다가 다시 만들면 미발송 술어의 **넷째 벌**을 만드는 셈이 된다
(CLAUDE.md가 명시적으로 금지하는 것).

**순서 확정 (2026-09-15 사용자): 본 기능이 먼저다.** 따라서 고아 창은 **실제로 열리고, 그것을 수용한다** —
`project-home`이 머지될 때까지 `summaryQueue`·`newKeys`는 **어느 화면도 안 쓰는 채로 남는다.**

- **그래도 지우지 않는다.** 지웠다 다시 만들면 미발송 술어의 **넷째 벌**을 만드는 셈이고, CLAUDE.md와
  `project-home/tasks.md` T4가 둘 다 그것을 금지한다. `pnpm test:projects:postgres`가 "셋이 같은 행을
  세나"를 재는 유일한 자리라, 그 셋을 흔드는 쪽이 훨씬 비싸다.
- **고아라는 사실을 코드에 적는다.** `summaryQueue`와 `loadProjectListAggregates`의 `newKeys` 옆에
  *"목록에서 뗐고 `project-home`이 받는다 — 그때까지 소비자가 없다"*를 남긴다. 주석이 없으면 다음
  사람이(또는 `/audit`이) 죽은 코드로 보고 지운다.
- ⚠️ **`/code-review`·`/audit`이 이 둘을 "미사용"으로 올릴 것을 예상한다.** 올라오면 이 절을 근거로
  기각한다 — 새 발견이 아니라 **의도된 상태**다.

## 6. 시안 ↔ 코드 불일치 — README가 잘못 짚은 자리 넷

**시안의 시각 판정은 그대로 정본이다.** 아래는 README가 인용한 **코드 사실**의 정정이다.

### 6.1 ⚠️ Summary는 "앞선 핸드오프가 추가하려던 것"이 아니라 **이미 출하돼 있다**

README 표: *"현재 코드 | 없다(앞선 핸드오프가 추가하려던 것)"*. **반대다.**
`summaryQueue()`·raw ④·`SummaryRow`·`m.projects.summary.*`가 전부 있고, **PRODUCT §7.9와
DESIGN §6.63(행 27~29·49~50·60·63·64)이 그것을 문서화한 결정으로 못 박아 뒀다.**
→ 본 기능은 "안 만들기"가 아니라 **문서 둘의 결정을 되돌리기**다. 태스크에 문서 갱신이 들어간다.

### 6.2 ⚠️ `PanelHeader`는 신규 프리미티브가 아니고, 자리도 `components/ui/`가 아니다

README: *"Component: PanelHeader (신규 프리미티브)"* · *"`components/ui/` — 기존 프리미티브(`PanelHeader`가
들어갈 자리)"*. **이미 `components/shell/content-panel.tsx`에 있다.**
`ContentPanel`·`PanelBody`와 한 파일에 사는 형제 셋이고, **`components/ui/`로 옮기지 않는다** —
셸 구조의 일부이고 `app/(edit)/__tests__/shell-layout.test.ts`가 그 체인을 훑어 센다.

### 6.3 ⚠️ 프리미티브 자신이 "padding을 넣지 말라"고 적어 뒀다

`content-panel.tsx`의 `PanelHeader` 주석:
> ⚠️ **여백은 화면이 정한다** — 현재 좌우 여백은 `px-6`이지만 limited 화면은 안쪽 래퍼가 든다.
> 이 프리미티브에도 padding을 넣으면 **그 화면들만 두 번 적용된다.**

→ **이 경고를 지우는 것이 ①의 본체다.** 여백만 옮기면 limited 7곳이 32px이 된다.
**폭 등급을 함께 올려야** 한 곳에서 여백이 성립한다 (`design.md` §2).

### 6.4 ⚠️ `Clear filters`는 이미 `Clear search`다

README 신규 문구: *"`Clear search` — 기존 `Clear filters`를 대체한다"*. **2026-09-13에 이미 바뀌었다**
(`messages/en.tsx`의 `projects.narrowed.reset` 주석이 그 사실을 적는다). 신규 문구에서 뺀다.

## 7. 확정된 판정 (2026-09-15 사용자)

1. **본 기능이 `project-home`보다 먼저다.** → 고아 창을 수용한다 (§5). T7을 뒤로 미루지 않고
   **이 기능 안에서 끝낸다.**
2. **`add-surface`는 `/projects/[slug]/surfaces/new`** — 표면 추가 화면이다(모달이 아니라 전체 페이지,
   `app/(edit)/projects/[slug]/surfaces/new/page.tsx` → `components/onboarding/add-surface.tsx`).
   혼자 `px-6 py-5`인 것에 근거 주석이 없으므로 **의도된 이탈이 아니라 표류로 본다** → 16으로 통일한다.
3. **`logs`·`locales`·`settings`는 나중에 UI를 재작업한다.** → 본 기능은 그 셋에 **프리미티브 변경만**
   적용하고, 지금 생김새를 제약으로 삼지 않는다. §8 참조.
4. **`translations`도 나중에 UI를 재작업한다.** → 같다. 툴바 슬롯이 둘을 넘는 것(탭+검색+필터)을
   **본 기능이 해결하지 않는다** — README 열린 결정 1은 그 재작업으로 넘긴다.

## 8. ⚠️ 나중에 재작업할 화면 넷을 지금 어떻게 다루나

`logs` · `locales` · `settings` · `translations` 넷은 UI 재작업이 예정돼 있다. 그래도 **PanelHeader
소비자이므로 T3에서 함께 움직인다** — 빼면 라우트마다 여백이 다시 갈려 이 기능의 요지가 사라진다.

**원칙: 프리미티브는 넷에도 똑같이 적용하되, 넷의 현재 생김새에 프리미티브를 맞추지 않는다.**

- **`/design-sync` 실측 대상에는 넣는다** — 여백 16 · 선 · 제목 18이 실제로 걸렸는지는 재야 한다.
  ⚠️ **다만 "시안과 같은가"는 묻지 않는다**(넷의 시안이 아직 없다). 재는 것은 **프리미티브 계약**뿐이다.
- **넷에서 발견되는 시각 어긋남은 본 기능의 결함이 아니다** — 재작업 대기 목록으로 넘기고 리포트에 적는다.
- ⚠️ **넷을 위해 프리미티브에 예외 prop을 만들지 않는다.** 재작업이 오면 그 화면이 값을 가져간다 —
  지금 선반영하는 것은 그 자체가 결함이다 (CLAUDE.md 작업 원칙).

### 8.1 설명 한 줄 슬롯 — 실측 정정

README 열린 결정 2가 `Project settings`를 지목했는데 **그 화면엔 설명이 없다.** 실제로 설명 줄을
드는 화면은 셋이고, **크기가 이미 두 벌로 갈려 있다**(시안의 13은 어느 쪽도 아니다):

| 화면 | 현재 | 재작업 예정 |
|---|---|---|
| `logs` | `text-xs`(12) `text-muted-foreground` | ✅ |
| `locales` | `text-xs`(12) `text-muted-foreground` | ✅ |
| `surfaces/new` (add-surface) | **`text-sm`(14)** `text-muted-foreground` | ❌ |
| `settings` | **설명 없음** | ✅ |

→ **슬롯은 만들되 크기는 시안값 13으로 통일한다.** 셋 중 둘이 재작업 예정이라 지금 값을 맞추는 비용이
작고, 남는 하나(`add-surface`)가 재작업 밖이라 **그 하나 때문에라도 슬롯이 규격을 가져야 한다.**

## 9. 캔버스 치수표 — T0에서 확정 (2026-09-15)

**`Projects v2.dc.html`의 아트보드 `1a`~`1d` 넷을 전부 읽었다.** 아래는 그 인라인 스타일에서 인용한
값이고, §1의 *"README와 캔버스가 어긋나면 캔버스가 이긴다"*를 여기서 집행한다.

### 9.1 패널 머리 (넷 다 같다)

| 자리 | 캔버스 | 코드로 옮기면 |
|---|---|---|
| 머리 컨테이너 | `flex · align-items:center · gap:12 · padding:16 · border-bottom:1px #e5e5e5 · flex-shrink:0` | `border-b border-border` + `p-4`, 행은 `flex items-center gap-3` |
| 제목 묶음 | `inline-flex · gap:8` | `flex items-center gap-2` |
| PageTitle | `h1 18/500/0.01em` | **`text-lg font-medium`** — ⚠️ **`tracking-[0.01em]`을 손으로 쓰지 않는다**: `--text-lg--letter-spacing`이 이미 `0.01em`이다 (`app/globals.css`). tasks.md T3의 *"+ `tracking-[0.01em]`"*은 그래서 **불필요**하다 |
| 카운트 배지 | `min-width:20 · radius:999 · padding:2px 6px · 13/500 · bg rgba(10,10,10,0.05)` | `Badge variant="neutral"` **그대로** (`min-w-5 px-1.5 py-0.5 text-xs`, `--text-xs`가 13px) |
| 검색 | `36 × 220 · radius 10 · border #e5e5e5` | `SearchInput` 그대로 — **폭만 256이다**(DESIGN §6.63에 이미 등재된 유일한 예외) |
| [New project] | `36 · radius 10 · bg #171717` | `ButtonLink variant="primary"` 그대로 |
| 선의 폭 | 패널 **전폭**이다 — 아트보드 넷 모두 `border-bottom`이 머리 컨테이너에 있고 그 안에 여백이 든다 | ⚠️ **선을 `CONTENT_MAX` 안쪽에 두면 1280 상한에서 잘린다.** 바깥 `shrink-0` div가 선을, 안쪽 래퍼가 padding을 든다 |

### 9.2 본문 · 그룹 카드

| 자리 | 캔버스 | 코드 |
|---|---|---|
| 본문 | `flex-column · gap:16 · padding:16` | `p-4` + `flex flex-col gap-4` |
| 카드 | `border:1px #e5e5e5 · radius:12 · bg #fff · overflow:hidden · flex-shrink:0` | 기존 `ProjectCard`의 `<ul>`과 같다 |
| 카드 헤더 | `flex · align-items:center · gap:8 · padding:16`, `h2 15/500/0.015em` | `text-base font-medium` — ⚠️ letter-spacing도 `--text-base--letter-spacing`(0.015em)이 준다 |
| 헤더↔첫 행 | `border-top:1px #f0f0f0` | **`border-foreground/[0.06]`** — 흰 배경에서 `rgba(10,10,10,0.06)`이 곧 `#f0f0f0`이다. 띠가 이미 같은 표현을 쓰므로 새 raw 색이 아니다 (DESIGN §6.2) |
| 행↔행 | `border-top:1px #e5e5e5` | `border-border` — 지금 그대로 |
| hover | 행만 `rgba(10,10,10,0.02)`. **카드 헤더·띠는 없다** | 지금 그대로 |

### 9.3 빈 상태 카드 (`1b` = `1d`, 부품이 같다)

| 자리 | 캔버스 |
|---|---|
| 카드 | `flex-column · align-items:center · gap:14 · border 1 #e5e5e5 · radius 12 · bg #fff · padding:48px 24px · text-align:center` |
| 아이콘 칩 | `36 × 36 · radius 8 · bg rgba(10,10,10,0.04) · color #525252`, 글리프 **18** |
| 제목·설명 묶음 | `flex-column · gap:6 · align-items:center` |
| 제목 | `15/500/0.015em` |
| 설명 | `14/1.6 · max-width:46ch · #737373 · text-wrap:pretty` |
| 출구 (`1b`) | 채운 버튼 `36 · radius 10` |
| 출구 (`1d`) | **링크** `14 · #2563eb` |
| 글리프 | `1b` `box` · `1d` `search-x` |

### 9.4 ⚠️ 캔버스를 그대로 못 옮기는 자리 셋 — 근거와 함께 남긴다

1. **아이콘 칩의 글리프가 18이다.** DESIGN §6.8이 아이콘 크기를 **셋(16·12·24)으로 고정**하므로
   18은 넷째 값이 된다. **16으로 간다** — 36 칩 안의 2px이고, 검색 폭(220 vs 256)이 이미 같은 부류의
   등재된 예외다. ⚠️ **T9의 실측에서 이 항목이 뜰 것을 예상한다** — 결함이 아니라 등재된 차이다.
2. **`1d`의 설명이 두 문장이고 뒤 문장이 총계를 문자열에 박는다** —
   *"Check the spelling, or clear the search to see all three projects."* 의 `three`가 그것이다.
   프로젝트가 셋이 아닌 계정에서 **거짓말이 된다.** 앞 문장만 쓴다
   (`Search looks at the project name and the repository.` — README의 신규 문구와 같다).
3. **`1d`의 제목이 질의를 든다** — `No projects match “stripe”`. 지금 `narrowed.title`은 상수
   `No results`이고 질의는 `bySearch`가 들었다. **캔버스를 따라 제목이 함수가 되고** 설명이 검색 대상
   문장을 든다. ⚠️ **`messages/en.tsx`의 *"제목이 질의를 안 싣는다"* 주석이 이 판정으로 뒤집힌다** —
   주석도 같이 고친다. 따옴표는 캔버스대로 **곡선 따옴표**(`“ ”`)다.

### 9.5 캔버스가 확인해 준 것 (§7의 열린 항목)

- **Summary 넷은 아트보드 넷 어디에도 없다.** `1b`(0건)에서도 머리는 제목 + 배지뿐이다.
- **`1b`의 머리에 검색·[New project]가 없다** — 지금 코드의 `hasProjects` 판정 그대로다. **배지 `0`은 남는다.**
- **`1c`의 총계 배지가 `3`이고 카드 카운트가 `1`이다** — 완료 조건 9가 캔버스로 확인됐다.
- **`Clear search`가 결과 카드 헤더의 `margin-left:auto` 자리**이고 `14 · #2563eb` 링크다.
- **거부 `Alert`는 아트보드에 없다.** 기존 판정(*"제목 줄 아래"*)을 유지하고 **머리 안에 남긴다** —
  본문으로 내리면 스크롤로 사라진다 (POSTMORTEM 2026-09-06).
