# tasks — projects-panel-rework

**순서의 원칙**: 캔버스 확정 → 순수 함수 → 프리미티브(라우트 9개) → 목록 본문 → Summary 제거 → 문서.
⚠️ **T7(Summary 제거)이 마지막 코드 커밋이다** — 본 기능이 `project-home`보다 먼저라 그 커밋이
**고아 창을 연다**(`design.md` §4.2). 떼어낼 수 있는 경계로 유지한다.

⚠️ **착수 전 전제**: 워킹 트리가 clean하고 `pnpm test`가 green이다. 현재 `docs/PRODUCT.md`·
`docs/features/project-home/`에 미커밋 변경이 있다 — **먼저 정리한다.** 섞인 변경 위에서 실측하면
무엇이 원인인지 못 가린다.

---

## T0. 캔버스 확정 — `/design-sync projects --audit`

`README.md`만으로 선 스펙을 **아트보드 넷의 인라인 스타일**로 덮는다.

```
DesignSync get_file  b99d54cd-…  design_handoff_projects_panel_rework/Projects v2.dc.html
→ 스크래치패드에 저장 → grep -n 'id="1a"' → sed -n 'N,Mp'로 구역만 읽는다
```

- 아트보드 `1a`(3건) · `1b`(0건) · `1c`(검색 1건) · `1d`(검색 0건) **넷 다 읽는다** — 예외 아트보드를
  빼먹는 것이 `/design-sync`가 경고하는 그 자리다.
- 뽑을 것: 치수 · radius · 색 · padding · gap · font-size/weight/letter-spacing · line-height ·
  구분선 색 규칙 · hover · 선택 상태.
- **`spec.md` §7의 확인 4개와 `design.md` §9의 문구 판정을 여기서 닫는다.**
- **검증**: `spec.md`에 치수표가 붙고, README와 어긋난 항목이 표로 남는다(캔버스가 이긴다).

`─── docs(features): pin the projects panel canvas measurements ───`

---

## T1. `listBody` 테스트 먼저 (red) — `/tdd interface`

`lib/projects/__tests__/list.test.ts`에 갈래 넷을 박는다.

- `groups` — 프로젝트 3건 · `q` 없음 → 카드 셋, 각 카드의 `rows`와 label
- `empty` — `all: []` · `q` 없음
- `results` — `q="chrome"` · 매치 1건 → 그룹으로 안 쪼갠다
- `no-results` — `q="stripe"` · 매치 0건
- `q`가 공백뿐 → `groups` (`.trim()` 관용구)
- 보관만 있을 때 → `groups`이고 `empty`가 아니다 (PRODUCT §7.9 — 빈 화면으로 바뀌지 않는다)
- ⚠️ **`summaryQueue` 테스트를 건드리지 않는다.**

- **검증**: `pnpm test` → `listBody` 관련만 red, 나머지 green.

`─── test: pin the four projects list body branches ───`

---

## T2. `listBody` 구현 (green)

`lib/projects/list.ts`에 추가. `searchProjects`·`groupProjects`를 부르는 얇은 껍데기다.

- ⚠️ **기존 다섯 판정 함수의 시그니처를 바꾸지 않는다.**
- **주석은 한국어로 "왜"만** — 갈래를 넷으로 가른 이유(출구의 무게가 반대다)를 적는다.

- **검증**: `pnpm test` green · `pnpm typecheck` green.

`─── feat(projects): add the four-branch list body judgement ───`

---

## T3. `PanelHeader`·`PanelBody` 규격화 (라우트 9개)

⚠️ **이 커밋이 이 기능에서 가장 위험하다** — 시안이 안 그린 화면 여덟이 함께 움직인다
(`design.md` §2.3, POSTMORTEM 2026-09-14).

1. `content-panel.tsx`에 `width: "fluid" | "limited"` prop(기본 `limited`) + padding 16 전방향 +
   `PanelHeader`에 `border-bottom 1 #e5e5e5`.
2. **설명 한 줄 슬롯을 조건으로 쓴다** — 주석이 아니라 코드의 조건으로(`design.md` §2.3 재발 방지 1).
3. 소비자 11곳에서 여백·폭 클래스를 걷어낸다. fluid 4 / limited 7.
4. 제목 h1 아홉을 `text-xl` → `text-lg` + `tracking-[0.01em]`.

- ⚠️ **`ContentPanel`의 `isolate`·grid 배치를 만지지 않는다** (POSTMORTEM 2026-09-15).
- ⚠️ **`add-surface.tsx`(`/projects/[slug]/surfaces/new`)의 `px-6 py-5`는 표류로 판정됐다** — 16으로 통일한다.
- ⚠️ **설명 한 줄 슬롯은 `logs`·`locales`·`surfaces/new` 셋이다** — `settings`는 설명이 없다
  (`spec.md` §8.1). 크기는 현재 12/14 두 벌인데 **시안값 13으로 통일한다.**
- ⚠️ **재작업 예정 넷(`logs`·`locales`·`settings`·`translations`)에 예외 prop을 만들지 않는다**
  (`spec.md` §8). 넷의 현재 생김새는 제약이 아니다.
- **검증**:
  - `grep -rn "<PanelHeader" components app | grep -v __tests__ | grep -E "px-|py-|pt-|pb-"` → **0건**
  - `grep -rn 'text-xl font-medium' app components | grep -v ui/avatar | grep -v onboarding/modal` → **1건**
    (남는 하나는 `project-list.tsx:283` — 제목이 아니라 SummaryRow의 수치다. **T7에서 0이 된다.**
    여기서 0을 기대하면 Summary를 T3에 끌어들이게 되고, T7을 떼어낼 수 없게 된다)
  - `grep -rn "<PanelHeader" components app | grep -v __tests__ | wc -l` → **11** (수가 바뀌면 소비자를 다시 센다)
  - `pnpm test` green (`shell-layout.test.ts`·`shell-panels.test.tsx` 포함) · `pnpm typecheck` · `pnpm build`

`─── refactor(shell): move panel padding, width grade and the header rule into the primitive ───`

---

## T4. 목록 본문 — 그룹 카드

`project-list.tsx`를 `listBody`의 넷으로 분기시키고 그룹 헤더를 카드 안으로 옮긴다.

- 카드: `border 1 #e5e5e5 · radius 12 · bg #fff · overflow hidden`
- 헤더: `padding 16 · 15/500/0.015em` + 카운트 배지(갭 8) · **hover 없음**
- 첫 행 `border-top #f0f0f0` / 행↔행 `#e5e5e5` — **급이 다르다**
- ⚠️ **`ProjectRow`를 한 픽셀도 바꾸지 않는다** (`spec.md` §4)
- ⚠️ **카드 바닥에 더 보기 링크를 두지 않는다**
- 제목 옆 총계 배지는 **질의에 안 흔들린다**

- **검증**: DOM 테스트가 카드 수·헤더 카운트·두 선 색을 구별해 단언 · `pnpm test` green.

`─── feat(projects): move the group headers into cards ───`

---

## T5. 빈 상태 둘 (`1b` · `1d`)

- `empty-projects.tsx`: `KeyVisual`·`DotField`·그라데이션 제거 → 카드 하나
  (아이콘 칩 36/radius 8 · 제목 15/500 · 설명 14/1.6 46ch · 버튼 **36/radius 10**)
- `1d`: 같은 카드, 아이콘 `search-x`, 출구는 **링크**(`Clear search`)
- 신규 문구 둘(`design.md` §9) 추가

- **검증**: `grep -rn "KeyVisual\|DotField" components/projects "app/(edit)/projects"` → **0건** ·
  `pnpm test` green · **⚠️ `1b`를 브라우저로 밟을 수 있는지 먼저 본다**(`design.md` §10).

`─── feat(projects): bring both empty states into the card grammar ───`

---

## T6. 검색 결과 카드 (`1c`)

헤더가 `Results for "{q}"` + 카운트 + 오른쪽 `Clear search`. 그룹 헤더 셋을 그리지 않는다.
`projects.searchResult(n, total)` 삭제 · `resultsFor(q)` 추가.

- **검증**: `q=chrome`에서 제목 배지 `3` · 카드 카운트 `1` · `pnpm test` green.

`─── feat(projects): replace the search result line with a result card ───`

---

## T7. ⚠️ Summary 제거 — 호출만 뗀다 (고아 창을 연다)

`design.md` §4. **본 기능이 `project-home`보다 먼저이므로 이 커밋 뒤 `summaryQueue`·`newKeys`는
소비자 없이 남는다** — 의도된 상태이고 지우지 않는다 (`spec.md` §5).

- `SummaryRow` 삭제 · `ProjectListView.summary` 삭제 · `loadProjectList`의 `summaryQueue({...})` 삭제
- `projects/loading.tsx`의 골격에서 Summary 줄 제거
- 거부 `Alert` 위치 재확인 (지금 *"제목 줄 아래 · Summary 위"*)
- ⚠️ **`summaryQueue()`·`newKeys`·`m.projects.summary.*`와 그 테스트를 지우지 않는다**
- **고아라는 사실을 두 자리에 주석으로 적는다** — `lib/projects/list.ts`의 `summaryQueue` 위와
  `lib/keys/query.ts`의 `newKeys` 옆. *"목록에서 뗐고 `project-home`이 받는다 — 그때까지 소비자가 없다"*

- **검증**:
  - `grep -rn "SummaryRow\|view\.summary" app components lib` → **0건**
  - `grep -rn 'text-xl font-medium' app components | grep -v ui/avatar | grep -v onboarding/modal` → **0건** (이제야)
  - `grep -rn "summaryQueue\|newKeys" lib` → **남아 있다** (지워지면 실패다)
  - `pnpm test` green · `pnpm test:projects:postgres` green

`─── refactor(projects): drop the account-level summary row from the list ───`

---

## T8. 문서 (문서별 커밋)

`design.md` §8의 표 그대로. **PRODUCT와 DESIGN은 별도 커밋이다.**

- `docs(PRODUCT): drop the summary row from the projects list decisions`
- `docs(DESIGN): record the panel header rule and retire the summary block`
- `docs(DIRECTORY): note the empty projects card`

- **검증**: `/doc-check` 또는 `/push` 4단계 문서 신선도.

---

## T9. `/design-sync projects` — 실측 루프

**여기가 이 기능의 진짜 게이트다** (`design.md` §10).

- ⚠️ **재작업 예정 넷은 "프리미티브 계약"만 잰다 — "시안과 같은가"는 묻지 않는다**(시안이 없다).
  거기서 나온 시각 어긋남은 본 기능의 결함이 아니라 재작업 대기 목록이다 (`spec.md` §8).
- 라우트 **9개 전부**의 머리를 computed style로 잰다 — padding 16 · border-bottom 1 `#e5e5e5` · 제목 18/500/0.01em
- `/projects`의 카드 두 선(`#f0f0f0` vs `#e5e5e5`)을 **값으로** 구별한다
- 접근성은 CDP로 — 카드 헤더가 목록의 접근 이름을 깨지 않았나
- **불일치가 하나라도 있으면 T3/T4로 돌아간다**

- **검증**: 실측 표 전 항목 일치 + 서브에이전트 리뷰 통과.

---

## T10. 남은 것

- `docs/features/projects-panel-rework/` **삭제** — 결론은 PRODUCT·ARCHITECTURE·DESIGN이 든다
  (CLAUDE.md: 근거 기록을 쌓아 두지 않는다).
- `/postmortem` — T3에서 라우트 하나라도 깨졌다면.
