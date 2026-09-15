# design — projects-panel-rework

## 1. 영향 받는 흐름

**편집 UI 전용이다.** push·pull 어느 쪽도 건드리지 않는다 — 어댑터·export 결정성·blob SHA·커밋/PR
전략에 닿는 코드가 없다. 서버 쪽 변경은 `loadProjectList`의 **반환 형에서 필드 하나를 빼는 것**뿐이고,
그 아래 raw 집계는 그대로 돈다(§4).

```
app/(edit)/projects/page.tsx          ← summary 전달만 사라진다
components/projects/project-list.tsx  ← 본체 재구성 (그릇)
components/projects/empty-projects.tsx ← 카드 규격으로 내려온다
components/shell/content-panel.tsx    ← ⚠️ 여기가 라우트 9개를 움직인다
lib/keys/query.ts                     ← summaryQueue 호출 제거 (함수·집계는 존치)
messages/en.tsx                       ← 신규 3 · 삭제 1
```

⚠️ **소비자 넷(`logs`·`locales`·`settings`·`translations`)은 UI 재작업이 예정돼 있다.**
프리미티브는 넷에도 똑같이 적용하되 **넷의 현재 생김새에 프리미티브를 맞추지 않는다** — 취급 규칙은
`spec.md` §8이다.

## 2. ⚠️ ①의 본체 — 여백만 옮기면 limited 7곳이 32px이 된다

### 2.1 지금 여백이 두 모양으로 산다

실측 (`grep -rn "<PanelHeader" components app | grep -v __tests__`, 11건):

| 등급 | 소비자 | 여백을 누가 드나 |
|---|---|---|
| **fluid 4** | `projects/project-list` · `translations/header` · `projects/loading` · `onboarding/add-surface` | `PanelHeader`의 `className` |
| **limited 7** | `[slug]/page` · `settings` · `logs` · `members` · `locales` · `account/page` · `account/loading` | 안쪽 래퍼 `mx-auto w-full max-w-4xl px-6 pt-6 pb-3` |

`PanelBody`도 같은 이중구조다(limited 7곳이 `mx-auto w-full max-w-4xl … px-6 pt-3 pb-8`).

### 2.2 그래서 여백과 **폭 등급**을 함께 올린다

프리미티브에 padding만 넣으면 limited 7곳은 래퍼의 24 + 프리미티브의 16 = **40**이 된다.
`PanelHeader` 주석이 정확히 그 경고를 적어 뒀다(`spec.md` §6.3). 두 값은 **한 층에서 같이 결정돼야 한다.**

```tsx
// components/shell/content-panel.tsx
type Width = "fluid" | "limited";   // fluid = max-w-7xl(1280) · limited = max-w-4xl(896)

export function PanelHeader({ width = "limited", children, className, ...props })
export function PanelBody({ width = "limited", children, className, ...props })
```

- **기본값은 `limited`다** — 7 대 4로 다수이고, 빠뜨렸을 때 좁아지는 쪽이 넘치는 쪽보다 눈에 띈다.
- **`className`은 여백이 아니라 레이아웃용으로만 남는다**(`flex flex-col gap-*`). 완료 조건 1이
  `px-|py-|pt-|pb-`를 0으로 고정한다.
- ⚠️ **`CONTENT_MAX` 상수를 등급 둘로 가르는 것이지 등급을 셋으로 늘리는 것이 아니다**
  (DESIGN §5.1). fluid 화면은 여전히 둘(번역 · 목록)이고, `add-surface`(`/projects/[slug]/surfaces/new`)와
  `projects/loading`이 **현재 fluid로 렌더되고 있으므로 등급을 T0에서 확정한다** — `add-surface`의
  `px-6 py-5`는 근거 주석이 없어 **표류로 판정됐고 16으로 통일한다**(`spec.md` §7-2).

### 2.3 ⚠️ POSTMORTEM 2026-09-14 — "프리미티브의 여백 하나가 그 슬롯을 안 쓰는 소비자에게만 깨졌다"

> `16 16 0`의 `0`은 "아래 여백이 없다"가 아니라 **"아래 여백을 푸터가 자기 16으로 든다"**이고,
> 그 전제는 시안이 그린 네 Dialog가 전부 확인 대화라 **암묵적**이었다.

**이번 변경이 정확히 그 부류다.** 시안은 `/projects` 하나를 그리고 여백 16을 정했는데, 그 값을
프리미티브에 넣으면 **시안이 안 그린 화면 여덟**이 함께 움직인다. 그 회고의 재발 방지 둘을 그대로 적용한다:

1. **여백이 전제하는 형제 슬롯을 적는다.** `PanelHeader` 16의 전제는 *"제목 줄 하나 + 툴바"*다.
   설명 한 줄이 붙는 화면은 **`logs`·`locales`·`surfaces/new` 셋이다** — ⚠️ **`settings`가 아니다**
   (README 열린 결정 2가 잘못 짚었다: `spec.md` §8.1의 실측표). 그 셋은 `flex-column · gap 12`로 갈리고,
   **그 조건을 주석이 아니라 코드의 조건으로 쓴다**(README의 PanelHeader 명세가 그렇게 적혀 있다).
2. **소비자를 세는 명령을 문서에 박고, 그 명령을 실제로 돌려 본문과 맞춘다.** 아래가 그 명령이고
   **실제로 돌려 11을 확인했다**(`grep -rln "PanelHeader"`는 13을 내는데, `project-archived.tsx`·
   `project-not-ready.tsx`가 *"`PanelHeader`가 없다"*는 **주석**으로 잡힌다 — 그 둘은 소비자가 아니다):

```
grep -rn "<PanelHeader" components app | grep -v __tests__     # 11
```

### 2.4 ⚠️ POSTMORTEM 2026-09-11 — 게이트 셋이 green인데 번역 입력이 28px였다

표현만 바꾸는 변경은 **`pnpm test`가 원리적으로 못 본다.** 그래서 이 기능의 실질 게이트는
`/design-sync` 4단계의 **computed style 실측**이고, 단위 테스트는 구조(무엇이 있나)만 든다.
**스크린샷으로 판정하지 않는다** — `#f0f0f0`과 `#e5e5e5`는 압축된 PNG에서 구별되지 않는데,
이 시안은 그 두 색의 **급 차이**에 카드의 읽힘을 걸어 뒀다(`1a` 선의 급).

### 2.5 ⚠️ POSTMORTEM 2026-09-15 — 콘텐츠 패널 폭 분할 / `isolate`

`content-panel.tsx`는 **바로 전날 고친 파일이다.** `ContentPanel`의 `isolate`와 grid 배치
(`col-start-1 row-start-1`)는 전환 중 패널 둘이 공존하는 프레임을 위한 것이고, **이 변경이 건드리는
것은 그 형제 둘(`PanelHeader`·`PanelBody`)이지 `ContentPanel`이 아니다.** 그 클래스들을 만지지 않는다.
- 회귀 그물: `components/shell/__tests__/shell-panels.test.tsx`가 배치·격리 계약을 든다. **green 유지.**

## 3. 순수 함수로 분리 가능한 부분 — `/tdd` 진입점

⚠️ **먼저 정직하게**: 이 기능은 **그릇**을 바꾸는 것이라 순수 함수 표면이 얇다. 판정 로직
(`groupProjects`·`projectStatus`·`rowBanner`·`meterSlot`)은 **입력도 출력도 안 바뀐다**(`spec.md` §4).
그래도 하나는 진짜로 나온다 — **본문이 네 모양 중 어느 것인가**가 지금은 컴포넌트 안에 흩어져 있다.

### 3.1 `listBody(...)` — 아트보드 넷과 1:1

```ts
// lib/projects/list.ts
export type ListBody =
  | { kind: "groups"; cards: { group: ProjectGroup; label: string; rows: ProjectListRow[] }[] }  // 1a
  | { kind: "empty" }                                                                            // 1b
  | { kind: "results"; query: string; rows: ProjectListRow[] }                                   // 1c
  | { kind: "no-results"; query: string };                                                       // 1d

export function listBody(all: readonly ProjectListRow[], q: string | undefined): ListBody
```

**이 함수가 있어야 하는 이유**는 갈래가 넷인데 지금은 `hasProjects`·`query`·`rows.length`가 JSX
안에서 섞여 판정되기 때문이다. 넷을 한 자리에 모으면 **`/tdd`가 아트보드 넷을 그대로 단언**할 수 있다.
- ⚠️ **`kind: "results"`는 그룹을 나누지 않는다** — 결과 1건에 헤더 셋이면 둘이 빈 카드가 된다.
  상태는 행의 칩이 계속 말한다.
- ⚠️ **`empty`와 `no-results`를 한 갈래로 합치지 않는다.** 출구의 무게가 반대다 — 만들기(채운 버튼) /
  되돌리기(링크). 합치면 그 차이를 그리는 자리가 사라진다.
- ⚠️ **`q`가 공백뿐일 때는 `groups`다** — 현재 `project-list.tsx`가 `.trim()`으로 거르는 그 관용구를 안으로 옮긴다.

### 3.2 그대로 두는 것

`searchProjects` · `groupProjects` · `highlightName` · `projectStatus` · `rowBanner` · `meterSlot` ·
`summaryQueue`(§4) · `rowLocaleProgress` · `rowReviewCounts`. **`listBody`는 앞의 둘을 부르는 껍데기다.**

## 4. Summary — 호출만 뗀다

```
lib/keys/query.ts
  loadProjectList()           → return 에서 `summary:` 한 줄 삭제
  ProjectListView             → `summary` 필드 삭제
  loadProjectListAggregates() → ⚠️ 건드리지 않는다. `newKeys`(raw ④) 그대로 둔다

lib/projects/list.ts
  summaryQueue()              → ⚠️ 건드리지 않는다
  SummaryQueue 타입           → ⚠️ 건드리지 않는다
```

### 4.1 ⚠️ `newKeys`를 지우지 않는 이유

`project-home/design.md` §3.1이 `New from GitHub`의 원천으로 **`raw ④`를 지목**한다. 지웠다가 다시
만들면 미발송 술어의 **넷째 벌**이 생기는데, CLAUDE.md와 그 문서가 둘 다 그것을 금지한다
(*"넷째 벌을 만들지 않는다 — 기존 셋 중 하나를 부른다"*). `pnpm test:projects:postgres`가
"셋이 같은 행을 세나"를 재는 유일한 자리이므로, **그 셋을 흔들지 않는 것이 이 변경의 안전 조건**이다.

### 4.2 고아 창 — 열린다, 그리고 수용한다

**순서 확정(2026-09-15 사용자): 본 기능이 `project-home`보다 먼저다.** 따라서 T7 이후 `summaryQueue`와
`newKeys`는 **소비자 없이** 남는다. 지우지 않는 근거와 주석 의무는 `spec.md` §5에 있다.

⚠️ **`/code-review`·`/audit`이 이 둘을 "미사용"으로 올릴 것을 예상한다** — 의도된 상태이고, 기각 근거는
`spec.md` §5다. 코드 옆 주석이 그 사실을 들어야 다음 사람이 같은 판단을 반복하지 않는다.

## 5. 스키마 변경

**없다.** 마이그레이션 없음. `prisma/schema.prisma` 무변경.

## 6. 새 환경변수

**없다.** `.env.example` 무변경.

## 7. 불변식 영향 (ARCHITECTURE §0)

**없다.** 대조한 것:

| 불변식 | 닿나 | 근거 |
|---|---|---|
| 번역 값은 DB가 진실 / 소스 키는 코드가 진실 | ❌ | 읽기 전용 화면이다 |
| export 결정성 | ❌ | 어댑터·writer 무변경 |
| blob SHA 계약 | ❌ | 같음 |
| 키를 삭제하지 않는다(`orphaned`) | ❌ | 같음 |
| **모든 DB 쿼리를 `projectId`로 좁힌다** | ⚠️ **간접** | `loadProjectList`는 `userId`로 좁히고 그 결과의 `id` 집합이 집계의 테넌트 경계다 — **그 경계를 안 건드린다**(반환 필드만 뺀다) |
| 인증 경계 (middleware 1차 + 진입점 본판정) | ❌ | `requireUser`·`requireProjectAccess` 무변경. 새 라우트 없음 → `matcher` 무변경 |
| 미발송 술어 세 벌 | ⚠️ **간접** | §4.1 — 셋을 흔들지 않는 것이 안전 조건이다 |

## 8. 문서 갱신 (본 기능이 되돌리는 결정)

⚠️ **`/feature`는 정본 문서를 직접 고치지 않는다** — 태스크로만 남긴다(`tasks.md` T8).

| 문서 | 무엇 | 왜 |
|---|---|---|
| `docs/PRODUCT.md` §7.9 | *"머리의 Summary 네 값에서는 빠진다"*(569행) · *"Summary가 전부 0"*(571행) | 그 블록이 사라진다. **보관 규칙 자체는 남는다** — 빠지는 것은 Summary를 가리키는 문장뿐 |
| `docs/DESIGN.md` §6.63 | Summary 행 넷(칸·구분선·띠·머리) · 빈 상태 행의 KV 예외 · 로딩 골격의 Summary 줄 · 거부 위치 *"Summary 위"* | 시안이 되돌린 결정 |
| `docs/DESIGN.md` §5.1 | 폭 등급을 **프리미티브의 prop**이 든다는 사실 | 지금은 "화면이 고른다"로 적혀 있다 |
| `docs/DESIGN.md` 새 절 | **PanelHeader/PanelBody 규격**(여백 16 · border-bottom · 제목 18 · 소비자 세는 명령) | 라우트 9개의 공통 규칙이 정본 없이 코드에만 있으면 다음 화면이 또 각자 판단한다 |
| `docs/DIRECTORY.md` | `empty-projects.tsx`의 성격 변화(장식 → 카드) | 파일의 "왜 그렇게 생겼나"가 바뀐다 |

**DESIGN §6.2 확인**: `EmptyProjects` 삭제로 `text-neutral-700`(#404040) 등재 근거가 사라지는지 본다 —
다른 소비자가 있으면 그대로 둔다.

## 9. 문구 (`messages/en.tsx`)

| 키 | 변화 | 비고 |
|---|---|---|
| `projects.searchResult(n, total)` | **삭제** | 카운트 배지가 건수를 드므로 문장에 수를 두면 두 번 말한다 |
| `projects.resultsFor(q)` | **신규** — `Results for "{q}"` | 질의를 **문자열 밖**에서 강조하는 현재 관용구를 깨지 않는지 캔버스로 확인 |
| `projects.narrowed.description` | **신규** — `Search looks at the project name and the repository.` | 0건을 본 사람의 다음 질문 |
| `projects.narrowed.title` / `bySearch` | **캔버스 확인 후 판정** | 현재 `No results` / `No project matches "{q}".` — README는 `No projects match "{q}"`를 신규로 적는데 **거의 같은 문장이다** |
| `projects.summary.*` | **존치** | `project-home`이 쓴다 |
| `projects.clearSearch` · `narrowed.reset` | **존치** | 이미 `Clear search`다 (`spec.md` §6.4) |
| `projects.empty.*` | **존치** | 문구는 그대로, 그릇만 바뀐다 |

⚠️ **한글 UI 리터럴 금지** — `lib/i18n/__tests__/no-korean-ui.test.ts`.
⚠️ **제품 이름은 `malmoi`** — `brand-spelling.test.ts`. `empty.description`이 그 낱말을 든다.

## 10. 검증 층이 셋이다

| 층 | 무엇을 보나 | 못 보는 것 |
|---|---|---|
| `pnpm test` (단위·DOM) | `listBody` 갈래 넷 · 구조(카드가 몇, 헤더가 있나) · 배지 수 · `summary` 부재 | **값** — 여백 16, 선 색 급, 제목 18 |
| `/design-sync` 4단계 (computed style + CDP) | 라우트 9개의 머리 padding·border·font-size · 카드 선 두 급 · 접근 이름 | 못 밟는 갈래 |
| `pnpm test:projects:postgres` | 미발송 술어 셋이 같은 행을 세나 | 표현 전부 |

⚠️ **`1b`(프로젝트 0건)를 브라우저로 밟을 수 있는지 먼저 본다.** dev DB에 멤버십이 있으면 못 밟는다 —
`/design-sync` 전제 3번이 그것이고, **못 밟은 갈래는 "검증했다"고 적지 않는다.**
