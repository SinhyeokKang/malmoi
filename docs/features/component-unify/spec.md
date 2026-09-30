# component-unify — spec

> **착수 조건: `ux-drift-unify`가 끝난 뒤(그 T31로 디렉터리가 지워진 뒤).** 이 문서의 수치는 dev `1e0a5f57`(2026-10-01) 스냅샷이고,
> ux-drift의 화면 태스크(T17–T24)가 같은 파일을 고치고 있다 — **T0이 재조사로 수치를 갱신한 뒤 범위를 확정한다.**

## 사용자

**개발자(OWNER)와 코딩 에이전트가 주 대상이다** — 화면을 만들 때마다 같은 형을 새로 고르고(행 패딩 `py-[13px]` 25곳 · 링크 파랑 31곳),
프리미티브가 비워 둔 축을 `className`으로 덮는다(Input·SelectTrigger 100% · Button 아이콘 크기 네 벌). 그 결과가 ux-drift 조사의
"프리미티브 우회"(부류 4)였고, 이번 기능은 그 원인 쪽을 닫는다.

**번역 편집자는 결과를 받는다** — 같은 역할의 요소가 화면마다 같은 모양·같은 포커스 링을 갖는다. 지금 외부 링크 버튼 6곳은 포커스 링이
없어 UA 기본 outline으로 떨어진다(키보드 사용자에게 보이는 결함).

**원칙(2026-10-01 사용자 — 메모리 `ui-primitives-first`)**: UI는 손 조립 대신 재사용 단위를 쓴다. 없는 단위는 그 작업 안에서
`components/ui/` 프리미티브로 만들고, **같은 형의 기존 손 사본도 같은 작업에서 옮긴다**(형이 두 벌로 남지 않게). "나중에 정리하려면 그것도 부채다."
ux-drift design §4의 "두 곳 이상 반복될 때만 올린다"보다 이 원칙이 우선한다.

## 문제 (관측 — 2026-10-01 전수조사 세 갈래)

조사 원자료: 세션 스크래치패드 `cu-survey-{1,2,3}.md`(커밋하지 않는다 — 근거 줄은 design·tasks에 옮겼다).

1. **손 조립이 프리미티브를 대신한다** — 누르는 행 5형(`ci-card:25` · `event-row:55` · `attention-card:135` · `sources-screen:108` · `project-list:263`),
   두 줄 본문 `flex min-w-0 flex-1 flex-col gap-[3px]` 14곳, 비밀값 칸 3형, 온보딩 선택 행 3곳 동일 사본, 보관 표시 5형, 검색 0건 5형,
   미터 2벌, 1024 모달 껍데기 2벌(`modal.tsx` · `logs/event-dialog.tsx:52-79`), 손 스피너 삼항 7곳, `CopyButton`이 `components/onboarding`에 있고 소비자 5/7이 밖.
2. **프리미티브 API가 실제 쓰임을 못 덮는다** — `className` 덮어쓰기율: Input·SelectTrigger 100%(폭) · ImageTile·ListItemButton 100% ·
   IconTile 52% · ButtonLink 42% · Badge 30%. Button에 아이콘 전용 크기가 없어 24·28·32·36 네 벌을 손으로 쓰고, 행 전체로 늘려 쓴다(3곳).
   `[&_.animate-spin]:size-3.5` 11곳.
3. **형제 프리미티브가 같은 일을 다른 이름으로 한다** — `PanelCard`↔`RowCard`(같은 껍데기·머리, 오른쪽 문구가 `subtitle`↔`description`),
   `EmptyState`↔`EmptyRowCard`(제목 크기·아이콘 타입·설명 타입이 다름), `Dialog`↔`OnboardingModal`(소비자 7 중 6이 온보딩이 아님, wizard prop 9개는 한 곳만 씀),
   `Button`↔`ButtonLink`↔`buttonClass()`(외부 링크는 `<a className={buttonClass()}>` — 포커스 링 누락 6곳), `Avatar square`(소비자 0)↔`ImageTile`+`toneFill` 3벌.
4. **이름이 개념을 따르지 않는다** — 상태 색이 `variant`·`tone`·`statusTone`·`intent` 없이 섞이고, "tone"이 두 뜻(`toneFill` 아바타 해시 ↔ `StateTone`)이다.
   tone→variant 매핑이 네 곳(`result-badge` · `source-status` · `canon` · `event-detail:127`). 슬롯 이름 `action/actions/footer/headerAction`,
   `description/subtitle/secondary/detail`. rest props를 안 넘기는 프리미티브 8개 때문에 `data-*`를 못 붙여 래퍼 span을 둔다(`source-status.tsx`).
5. **토큰이 값의 반복을 못 모은다** — 같은 값 두 철자(`/2`↔`/[0.02]`, `/3`↔`/[0.03]`, `border-foreground/[0.06]` = `--divider`),
   토큰 없는 반복값(링크 파랑 31 · 회색 3단 51 · `leading-[1.6]` 33 · `py-[13px]` 25 · `gap-[3px]` 19 · `calc(100svh-96px)` 24 · `@max-[640px]` 36 · `min-w-[1280px]` 3),
   쓰이지 않는 `@theme` 색 7개, 이메일 템플릿 hex 25건이 토큰 값을 손으로 복제.
6. **정본 문서가 코드와 어긋난다** — DESIGN이 bare `rounded` = 12라 적지만 4px, `Breadcrumb`을 `/projects/new`가 쓴다고 적지만 소비자 0, RowCard 소비자·치수,
   EntityCard 소비자 수, Avatar 프로젝트 형, danger disabled hover 등 9곳. `globals.css` 주석의 `#e2e8f0`·"66곳"도 낡았다.
7. **세는 그물이 없다** — 행 규격·링크 파랑·선택 행·비밀값 칸·오류 경계는 손 사본을 세는 테스트가 없다. 프리미티브 렌더 테스트 공백:
   Select · Input · Textarea · Radio · ListItemButton · BannerLine · EmptyRowCard · Badge variant · Button 전용.

## 완료 조건 (검증 가능한 문장)

**토큰**
1. 같은 값의 두 철자가 0이다 — foreground 알파는 `/[0.0N]` 하나, `--divider`와 같은 알파 선은 `border-divider`, `leading-[1.5]` → `leading-normal`,
   `rounded-[4px]` → `rounded`, 토큰 자간을 다시 적은 `tracking-[..]` 0(실제로 덮는 `public-doc-table` 제외), `[overflow-wrap:anywhere]` → `wrap-anywhere`.
   **렌더 결과는 바뀌지 않는다**(값 변화 0).
2. 확정된 토큰 후보(결정 기록)가 `@theme`에 있고, 그 값을 raw로 쓰는 곳이 0이다 — `visual-system.test.ts`가 센다.
3. 쓰이지 않는 `@theme` 색은 결정대로 지워졌거나 사유와 함께 남았다. 이메일 템플릿 hex가 토큰 값과 같음을 테스트가 대조한다.

**프리미티브 API**
4. design §3의 **API 규약**(상태 색 = `tone: StateTone`, 형태 = `variant`, 크기 = `size`, 진행 = `busy`/`loading`, 슬롯 이름 표, rest props·`data-tone` 전달)을
   `components/ui/` 전 프리미티브가 따른다 — 규약 표의 행마다 소스 스캔 또는 렌더 테스트 하나.
5. 호출부 `className` 덮어쓰기가 "API가 비워 둔 축"에서 0이다 — Input·SelectTrigger 폭(`width`/`size` prop), Button 아이콘 크기(`size="icon-*"`),
   Skeleton radius 기본값, ImageTile 상자 형. 레이아웃 배치(margin·flex 배치)는 허용한다.
6. tone→variant 매핑은 `lib/status/canon.ts` 하나다(래퍼 셋의 사본 0).

**형제 통합 · 새 프리미티브**
7. design §4 표의 통합·신설이 전부 들어갔고, **각 신설 프리미티브마다 "`components/ui/` 밖 사본 0" 소스 스캔 테스트**가 같은 커밋에 있다
   (POSTMORTEM 2026-09-15🔁 — 형제 export마다 소비자를 따로 센다).
8. 외부 링크 버튼이 전부 포커스 링을 가진다 — `buttonClass()`를 `<a>`에 직접 쓰는 곳 0(`ButtonLink external`로 흡수).
9. 소비자 0인 프리미티브·export는 결정대로 지워졌거나 사유와 함께 남았다.

**정본 · 그물**
10. DESIGN §4·§5·§6.4·§8과 `globals.css` 주석이 코드와 모순되지 않는다(design §6의 교정 목록 전부 ✓).
11. 프리미티브 렌더 테스트 공백 0 — design §5 표의 프리미티브마다 계약 테스트가 있다.
12. `pnpm gate` green — 커밋 경계마다. 화면 스냅샷 차이는 [수동] 레이아웃 QA(1280·1440·1890)로 "의도한 변화만"을 확인한다.

## 비목표

- **시각 재설계** — 값을 바꾸는 것은 규칙 위반 교정(design §6 "값이 바뀌는 곳" 표)뿐이다. 새 색·새 여백 체계를 만들지 않는다.
- **다크 모드 · 테마 전환** — 라이트 단일(DESIGN §3)은 그대로다.
- **Storybook·린터·컴포넌트 문서 사이트** — 스택에 없고(CLAUDE.md "린터는 없다"), 계약은 테스트가 든다.
- **화면 동작·문구 변경** — 상태 판정·사전은 ux-drift의 몫이었다. 이 기능은 형과 이름만 옮긴다.
- **`radix-ui` 밖 새 의존성** — 필요한 프리미티브는 이 리포가 소유한다(CLAUDE.md UI 행).
- **번역 화면 세 패널의 레이아웃** — `translation-filter-scope`가 정한 형은 소비자 교체(프리미티브 채택)만 한다.

## 사용자 결정

| # | 결정 | 날짜 |
|---|---|---|
| S1 | 범위는 **디자인 시스템 전면 정리**(손 조립 + 프리미티브 API + 토큰) | 2026-10-01 |
| S2 | 손 조립 금지 원칙 — 없는 단위는 프리미티브로, 기존 사본 동시 이관(`ui-primitives-first`) | 2026-10-01 |
| … | design §7 "확인 필요"의 답을 여기 적는다 | |
