# component-unify — spec

> **착수 조건: `ux-drift-unify`가 끝난 뒤** — 판정은 `test ! -d docs/features/ux-drift-unify`(그 T31이 디렉터리를 지운다).
> `global-search`는 **이 기능 뒤**에 착수한다(결정 S9 — 입력 폭 규약을 이쪽이 먼저 세운다).
> 이 문서의 수치는 dev `a034cb0c`(2026-10-01) 실측이고 **세는 명령이 design §9에 있다** — T0이 그 명령을 다시 돌려 갱신한 뒤 범위를 확정한다.

## 사용자

**개발자(OWNER)와 코딩 에이전트가 주 대상이다** — 화면을 만들 때마다 같은 형을 새로 고르고(행 패딩 `py-[13px]` 27곳 · 링크 파랑 31곳),
프리미티브가 비워 둔 축을 `className`으로 덮는다(Input·SelectTrigger 100% · Button 아이콘 크기 네 벌). 그 결과가 ux-drift 조사의
"프리미티브 우회"(부류 4)였고, 이번 기능은 그 원인 쪽을 닫는다.

**번역 편집자는 결과를 받는다** — 같은 역할의 요소가 화면마다 같은 모양·같은 포커스 링을 갖는다. 지금 `buttonClass()`를 `<a>`에 직접 쓴
링크 버튼 6곳(외부 3 · 내부 3)과 인라인 파랑 링크 9곳은 포커스 링이 없어 UA 기본 outline으로 떨어진다(키보드 사용자에게 보이는 결함).

**둘이 갈리면 편집자 쪽이다**(결정 S11) — 형을 합칠 때 모양이 갈리면 **편집자가 상시로 보는 화면(번역·Logs·Home)의 형**이 이기는 값이다.

**원칙(2026-10-01 사용자 — 메모리 `ui-primitives-first`)**: UI는 손 조립 대신 재사용 단위를 쓴다. 없는 단위는 그 작업 안에서
`components/ui/` 프리미티브로 만들고, **같은 형의 기존 손 사본도 같은 작업에서 옮긴다**(형이 두 벌로 남지 않게). "나중에 정리하려면 그것도 부채다."
이 원칙이 ux-drift design:163("ListRow·NoMatch·ArchivedNotice·SecretField·ErrorState·FactLabel은 만들지 않는다 — 확장성 선반영 금지")을 뒤집는다.
**단 한정이 하나 있다**(결정 S5): 손 사본이 실재하는 형만 만든다(소비자 1이어도). **사본이 없는 축**(값이 없는 급, 쓰는 곳 없는 슬롯·placement,
전 프리미티브 rest props·`data-tone`)은 넣지 않는다 — 그것은 여전히 선반영이다. CLAUDE.md 작업 원칙과의 관계는 T-doc이 한 줄로 정리한다.

## 문제 (관측 — 2026-10-01 전수조사 세 갈래 + feature-review 재실측)

조사 원자료: 세션 스크래치패드 `cu-survey-{1,2,3}.md`(커밋하지 않는다 — 근거 줄은 design·tasks에 옮겼다).

1. **손 조립이 프리미티브를 대신한다** — 누르는 행 5형(`ci-card:25` · `event-row:53` · `attention-card:134` · `sources-screen:111` · `project-list:252` —
   여백·hover·포커스 링·`li` 소유가 전부 다르다, design §6.3), 두 줄 본문(`gap-[3px]` 15 + `space-y-[3px]` 4), 비밀값 칸 3형, 온보딩 선택 행 4곳
   (라디오 둘 · 체크박스 둘), 보관 표시 5형, 검색 0건 형, 미터 2벌, 1024 모달 껍데기 2벌(`modal.tsx` · `logs/event-dialog.tsx:52-79`),
   `CopyButton`이 `components/onboarding`에 있고 소비자 5/7이 밖.
2. **프리미티브 API가 실제 쓰임을 못 덮는다** — `className` 덮어쓰기율: Input·SelectTrigger 100%(폭) · ImageTile·ListItemButton 100% ·
   IconTile 52% · ButtonLink 42% · Badge 30%. Button에 아이콘 전용 크기가 없어 24·28·32·36 네 벌을 손으로 쓰고, 행 전체로 늘려 쓴다(2곳).
   `[&_.animate-spin]:size-` 12곳.
3. **형제 프리미티브가 같은 일을 다른 이름으로 한다** — `PanelCard`↔`RowCard`(같은 껍데기·머리, 오른쪽 문구가 `subtitle`↔`description`),
   `EmptyState`↔`EmptyRowCard`(제목 18↔15 · 간격 · 설명 타입), `Dialog`↔`OnboardingModal`(소비자 7 중 6이 온보딩이 아님, wizard 바닥 prop은 한 곳만 씀),
   `Button`↔`ButtonLink`↔`buttonClass()`(`<a className={buttonClass()}>` 13곳 — 링 누락 6), `Avatar square`(소비자 0)↔`ImageTile`+`toneFill` 3벌.
4. **이름이 개념을 따르지 않는다** — 상태 색이 `variant`·`tone`·`statusTone` 없이 섞이고, "tone"이 두 뜻(`toneFill`·`lib/tone.ts` 아바타 해시 ↔ `StateTone`)이다.
   상태→배지 매핑 사본이 셋(`result-badge.tsx:9` EventResult · `source-status.tsx:19` 삼항 · `event-detail.tsx:236` surface status). 슬롯 이름
   `action/actions/footer/headerAction`, `description/subtitle/secondary/detail`. rest props를 안 넘겨 `data-*`를 못 붙이는 래퍼 span(`source-status.tsx:21`).
5. **토큰이 값의 반복을 못 모은다** — 같은 값 두 철자(`/2`·`/3` 10 ↔ `/[0.02]`·`/[0.03]`, divider 알파 12 = `--divider`), 토큰 없는 반복값(링크 파랑 31 ·
   회색 3단 58 · `leading-[1.6]` 34 · `py-[13px]` 27 · `calc(100svh-96px)` 24 · `@max-[640px]` 36 · `min-w-[1280px]` 9), 쓰이지 않는 `@theme` 색 7개,
   이메일 템플릿 hex가 토큰 값을 손으로 복제.
6. **정본 문서가 코드와 어긋난다** — DESIGN이 bare `rounded` = 12라 적지만 4px, `Breadcrumb`을 `/projects/new`가 쓴다고 적지만 소비자 0, RowCard 소비자·치수,
   EntityCard 소비자 수, Avatar 프로젝트 형, danger disabled hover, 자간 "아홉"(실제 8) 등. `globals.css` 주석의 `#e2e8f0`(세 줄 `:37,196,201`)·"66곳"도 낡았다.
   CLAUDE.md "프리미티브 26개"(실제 29).
7. **세는 그물이 없다** — 행 규격·링크 파랑·선택 행·비밀값 칸·오류 경계는 손 사본을 세는 테스트가 없다. 프리미티브 렌더 테스트 공백:
   Select · Input · Textarea · Radio · ListItemButton(링 검사만 — `focus-ring.test.ts:227-236`) · BannerLine · EmptyRowCard · Badge variant 전수 · Button 전용.

## 전달 단위 (결정 S3)

이 기능은 **세 단위로 나눠 각자 dev에 나간다** — 한 단위가 끝나면 `/push`, ②③은 끝에 `/runtime-test`(결정 S10).

| 단위 | 무엇 | 값 변화 |
|---|---|---|
| **①** 토큰·철자·정리 | 철자 접기 · 토큰 신설 · 소비자 0 삭제(C4) · 문서 교정 | **0** (자동 동치 테스트) |
| **②** API 이름 규약 | design §3 — 상태 색 · hue · 크기 · 폭 · 진행 · 슬롯 · a11y 철자 · className 이름 | **0** (이름만) |
| **③** 통합·신설 | design §4 — Card · EmptyState/NoMatch · LargeModal · ListRow · SelectRow · Popover · ButtonLink · Link 등 + §6.3 교정 | **있음** — design §6.3 결정표가 전부 |

## 완료 조건 (검증 가능한 문장)

**단위 ① 토큰**
1. 같은 값의 두 철자가 0이다 — foreground 알파는 괄호 철자(`/[0.0N]`)와 짝이 있는 bare 철자가 공존하지 않는다(**짝이 없는 `/5`·`/6`은 허용**),
   `--divider`와 같은 불투명 선은 `border-divider`(**투명 면 위의 BannerLine 선은 제외** — design §6.1), `leading-[1.5]` → `leading-normal`,
   `rounded-[4px]` → `rounded`, 토큰 자간을 다시 적은 `tracking-[..]` 0(`public-doc-table` 제외), `[overflow-wrap:anywhere]` → `wrap-anywhere`.
   **렌더 결과는 바뀌지 않는다** — 옛·새 철자 쌍이 `globals.css` 기준 컴파일에서 같은 선언을 낸다는 자동 테스트(design §5.3).
2. design §6.2의 **확정 토큰 이름 목록**(T0이 "3파일 이상 같은 값" 규칙으로 채움)이 `@theme`에 있고, 그 값을 raw로 쓰는 곳이 0이다 — `visual-system.test.ts`가 센다.
   `@theme`에 없는 클래스 이름이 소스에 0이다(POSTMORTEM 2026-09-23 `text-link`).
3. `Breadcrumb` · `SegmentedLinks` · `Avatar shape="square"` export가 0이고, 소비자 0인 `@theme` 색 7개와 `:root`의 짝 변수가 없다
   (`globals-css.test.ts`가 남은 토큰마다 소비자 ≥1). 이메일 hex가 토큰 값과 같음을 테스트가 대조한다 — 짝 없는 `#262626`은 사유가 붙은 예외 목록.

**단위 ② API**
4. design §3 규약 표의 행마다 스캔 또는 렌더 테스트가 하나 있고 위반표(design §5.2)의 허용 목록이 비었다.
5. 호출부 `className` 덮어쓰기가 "API가 비워 둔 축"에서 0이다 — 입력류 폭(`width` prop, 값 목록은 design §3), Button 아이콘 크기(`size="icon-xs|sm|md|lg"`),
   스피너 크기(`[&_.animate-spin]:size-` 0). 레이아웃 배치(margin·flex 배치)는 허용한다.
6. 상태→배지 매핑은 `lib/status/canon.ts` 하나이고 상태 배지는 `StatusBadge state` 하나로 그린다 — 래퍼 셋(`result-badge`·`source-status`·`event-detail:236`)의 사본 0.
   "tone"은 `StateTone` 한 뜻이다 — 아바타 해시는 `hue`(`lib/hue.ts` · `hueFill`).

**단위 ③ 통합·신설**
7. design §4 표의 통합·신설(ux-drift 산출물 행 제외)이 전부 들어갔고, 각 행이 `hand-copies.test.ts`(design §5.1) 표에 한 줄씩 — ui 밖 사본 0 · 스캔 하한 · 양성 카나리아.
8. `buttonClass()`를 `<a>`에 직접 쓰는 곳 0(외부는 `ButtonLink external`, 내부는 `ButtonLink`), 인라인 링크는 `Link` 프리미티브 — 포커스 링 없는 링크 0.
9. design §6.3 결정표의 행이 전부 ✓이고, 그 표에 없는 모양 변화는 [수동] 레이아웃 QA(1280·1440·1890, 화면 목록 tasks)에서 0건이다.

**공통**
10. DESIGN §2·§2.1·§4·§5·§6.2·§6.3·§6.4·§6.625·§6.8·§8, `globals.css` 주석, CLAUDE.md(UI 행 개수 · Radix 목록 · 작업 원칙 예외 한 줄), DIRECTORY가 코드와 모순되지 않는다(design §6.4 목록 전부 ✓).
11. 프리미티브 렌더 계약 테스트 공백 0 — design §5.4 표의 프리미티브마다 계약 테스트가 있다(단위 ② 착수 **전에** 현재 동작 고정).
12. `pnpm gate` green — 커밋 경계마다. 단위 ②③ 끝마다 `/runtime-test`(픽스처: 보관 프로젝트 · 오류 경계 · 검색 0건 · 포털 트리거).

## 비목표

- **시각 재설계** — 값을 바꾸는 것은 design §6.3 결정표뿐이다. 새 색·새 여백 체계를 만들지 않는다.
- **보관 표시의 모양**(결정 C3) — 전면 거부 vs 읽기 전용은 제품 판정이라 이 기능 밖이다. `ArchivedNotice`를 만들지 않는다.
- **다크 모드 · 테마 전환** — 라이트 단일(DESIGN §3)은 그대로다.
- **Storybook·린터·컴포넌트 문서 사이트** — 스택에 없고(CLAUDE.md "린터는 없다"), 계약은 테스트가 든다.
- **화면 동작·문구 변경** — 상태 판정·사전은 ux-drift의 몫이었다. 이 기능은 형과 이름만 옮긴다.
- **`radix-ui` 밖 새 의존성** — Popover는 이미 설치된 `radix-ui`에서 온다(CLAUDE.md UI 행).
- **번역 화면 세 패널의 레이아웃** — 소비자 교체(프리미티브 채택)만 한다. `key-list` 행 교체는 전후 렌더 측정을 붙인다(결정 Y16).
- **사본이 없는 축** — 쓰는 곳 없는 슬롯·placement·급, 전 프리미티브 rest props(결정 S5).

## 사용자 결정

| # | 결정 | 날짜 |
|---|---|---|
| S1 | 범위는 **디자인 시스템 전면 정리**(손 조립 + 프리미티브 API + 토큰) | 2026-10-01 |
| S2 | 손 조립 금지 원칙 — 없는 단위는 프리미티브로, 기존 사본 동시 이관(`ui-primitives-first`) | 2026-10-01 |
| S3 | **세 단위로 나눠 각자 dev에 낸다**(① 토큰·정리 ② API 이름 ③ 통합·신설) | 2026-10-01 |
| S4 | ux-drift 미완 태스크와 산출물이 같은 것(Meter·SecretField·Facts·ErrorState·404·행 패딩·철자 접기)은 **ux-drift가 만든다** — 이 기능은 규약만 맞춘다 | 2026-10-01 |
| S5 | 신설 기준 = 손 사본이 실재하는 형(소비자 1이어도). 사본 없는 축은 넣지 않는다 | 2026-10-01 |
| S6 | 상태 색은 `StatusBadge state` 하나로만 들어온다 — Badge·Alert는 모양 축 `variant`만, `info`는 variant | 2026-10-01 |
| S7 | 통합으로 바뀌는 값은 design §6.3 결정표 하나로 판정 | 2026-10-01 |
| S8 | 규약 스캔은 위반표 + 허용 목록, 특성 테스트를 단위 ② 전에. 단위 ② 커밋은 §3 축마다 하나 | 2026-10-01 |
| S9 | 입력 폭은 `width` prop. **이 기능이 global-search보다 먼저**, global-search design을 이 규약에 맞춰 고친다 | 2026-10-01 |
| S10 | 동일성 판정: 단위 ①은 Tailwind 컴파일 동치 자동 테스트, ③은 [수동] 화면·뷰포트·기준 SHA 명시 + 단위마다 `/runtime-test` | 2026-10-01 |
| S11 | 형이 갈리면 편집자 상시 화면(번역·Logs·Home)의 형이 이긴다 | 2026-10-01 |
| C1 | `PanelCard`+`RowCard` → **Card 하나**(슬롯 합집합에 `badge` 유지) | 2026-10-01 |
| C2 | `OnboardingModal` → **LargeModal** 개명, wizard 바닥(`showBack`·`onBack`·`next*`)만 `WizardFooter`로. `event-dialog`는 치수 상수만 공유하는 형제 | 2026-10-01 |
| C3 | 보관 표시 모양 — **이 기능에서 뺀다**(별도 제품 판정) | 2026-10-01 |
| C4 | 소비자 0(`Breadcrumb`·`SegmentedLinks`·`Avatar square`·`@theme` 색 7개) — **지운다** | 2026-10-01 |
| C5 | 토큰은 **3파일 이상 같은 값만**, DESIGN 등재와 같은 커밋 | 2026-10-01 |
| C6 | Button 행 확장 2곳(`ci-card`·`sources-screen`) → ListRow. `files.tsx:205`는 SelectRow 부가 액션 슬롯 | 2026-10-01 |
| Y4 | Popover는 **Radix Popover**, 그림자 DESIGN §4.5(`shadow-md`) | 2026-10-01 |
| Y5 | Facts 라벨 = `neutral-400`(회색 토큰 후보) | 2026-10-01 |
| Y6 | Button 아이콘 크기 **넷**(`icon-xs/sm/md/lg` = 24·28·32·36) — 값 변화 0 | 2026-10-01 |
| Y7 | "tone" 개명은 **lib까지**(`lib/tone.ts` → `lib/hue.ts`) | 2026-10-01 |
| Y-a | ErrorState `role="alert"` · `ButtonLink external`은 글리프 없음 + 새 탭은 별도 prop · 메일 hex `#262626` 예외 · BannerLine은 divider 접기 제외 · 알파 규칙은 "같은 값 두 철자만" | 2026-10-01 |
