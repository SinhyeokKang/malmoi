# component-unify — spec

> **착수 조건 확인(2026-10-02):** `ux-drift-unify`·`translation-tree-range` 디렉터리 둘 다 없음. S4 산출물 누락은 S14 승인으로 단위 ③에 포함한다.
> `global-search`는 **이 기능 뒤**에 착수한다(결정 S9 — 입력 폭 규약을 이쪽이 먼저 세운다).
> 수치·참조 기준은 `aed73f32`(2026-10-02), 재현 명령은 design §9. 실측과 제안은 분리하며, 선택의 근거와 승인 출처는 design §8에 남긴다.

## 사용자

**개발자(OWNER)와 코딩 에이전트가 주 대상이다** — 화면을 만들 때마다 같은 형을 새로 고르고(행 패딩 `py-[13px]` 32건 · 링크 파랑 28건),
프리미티브가 비워 둔 축을 `className`으로 덮는다(Input 18/18·SelectTrigger 10/10 · Button 아이콘 크기 네 벌). 그 결과가 ux-drift 조사의
"프리미티브 우회"(부류 4)였고, 이번 기능은 그 원인 쪽을 닫는다.

**번역 편집자는 결과를 받는다** — 같은 역할의 요소가 화면마다 같은 모양·같은 포커스 링을 갖는다. 지금 `buttonClass()`를 `<a>`에 직접 쓴
링크 버튼 4곳(외부 2 · 내부 로그인 2)과 인라인 파랑 링크 7곳은 포커스 링이 없어 UA 기본 outline으로 떨어진다(키보드 사용자에게 보이는 결함).

**둘이 갈리면 편집자 쪽이다**(결정 S11) — 형을 합칠 때 모양이 갈리면 **편집자가 상시로 보는 화면(번역·Logs·Home)의 형**이 이기는 값이다.

**원칙(2026-10-01 사용자 — 메모리 `ui-primitives-first`)**: UI는 손 조립 대신 재사용 단위를 쓴다. 없는 단위는 그 작업 안에서
`components/ui/` 프리미티브로 만들고, **같은 형의 기존 손 사본도 같은 작업에서 옮긴다**(형이 두 벌로 남지 않게). "나중에 정리하려면 그것도 부채다."
이 원칙이 ux-drift design:163("ListRow·NoMatch·ArchivedNotice·SecretField·ErrorState·FactLabel은 만들지 않는다 — 확장성 선반영 금지")을 뒤집는다.
**단 한정이 하나 있다**(결정 S5): 손 사본이 실재하는 형만 만든다(소비자 1이어도). **사본이 없는 축**(값이 없는 급, 쓰는 곳 없는 슬롯·placement,
전 프리미티브 rest props·`data-tone`)은 넣지 않는다 — 그것은 여전히 선반영이다. CLAUDE.md 작업 원칙과의 관계는 T-doc이 한 줄로 정리한다.

## 문제 (관측 — aed73f32, 2026-10-02)

1. **손 사본** — 누르는 행 5형은 모두 `py-[13px]`로 이미 맞았다(`ci-card:28` · `event-row:53` · `attention-card:140` · `sources-screen:102` · `project-list:220`). 포커스 링·글리프·두 줄 슬롯의 소유는 여전히 갈린다. `gap-[3px]` 16건/16파일, `space-y-[3px]` 4건/3파일이다.
2. **API 빈 축** — JSX 호출부 기준 Input className 18/18, SelectTrigger 10/10, ImageTile 3/3, ListItemButton 4/4, IconTile 8/20, ButtonLink 10/27, Badge 11/27이다. className 유무는 폭 덮어쓰기와 동의어가 아니다(스위처·초대 Input은 flex 배치). 스피너 크기 override는 11건이다.
3. **형제·소유 경계** — PanelCard 15호출/13파일, RowCard 6호출/5파일. EmptyState 13호출과 EmptyRowCard 8호출을 page 13·card 2·inset 6으로 분류할 수 있다. OnboardingModal은 7소비자 중 wizard 1이다. SearchInput은 정의 하나이며 `ProjectSearch`는 URL 상태를 잇는 래퍼다.
4. **상태 API** — SourceStatus는 이미 StatusBadge를 쓴다. 남은 결과 매핑은 `logs/result-badge.tsx:10`이고 event-detail의 surface 결과(`:131`)도 그것을 쓴다. 결과 라벨·결과 tone을 StateKey 하나로 바꿀 때 Logs 성공=회색 예외를 보존해야 한다.
5. **토큰** — raw 수는 링크 파랑 28, neutral-300/400/600 합계 46, leading 1.6/1.7/1.55 각각 33/10/6, 행 패딩 13px 32, 11px 12, 모달 높이식 25, 640 컨테이너 35, 셸 최소폭 9다. 11px 패딩은 **2파일뿐**이므로 C5 탈락이다. 주석 포함 rg 실측과 JSX 호출 수는 design §9처럼 구분한다.
6. **선행 완료와 미완** — 알파 `/2`·`/3`, loading 상태줄 누락, 행 세로 패딩, Sources hover/배지 글리프/닫기 버튼은 해소됐다. FieldError·StatusBadge는 있으나 Meter는 ui 밖 공유 MeterBar이고 SecretField·Facts·ErrorState는 없다. S14가 이관을 단위 ③에 포함한다.
7. **필드 셋** — FilterMenu는 번역 목록 머리와 언어 패널의 `sm` 둘, Logs 손 트리거는 md다. `align="end"`·DropdownMenu collisionPadding 8·TTR disabled hover를 보존한다. SearchInput 지우기는 S12 승인 사항이며 **Escape도 검색 해제**한다(S15).
8. **포커스·테스트** — 테두리형 링 문제(S13), 프리미티브 계약 테스트 공백, 사본 스캔 부재는 남아 있다. 근거와 시각 변화 제안은 design §4–§6.3에 둔다.

## 전달 단위 (결정 S3)

이 기능은 **세 단위로 나눠 각자 dev에 나간다** — 한 단위가 끝나면 `/push`, ②③은 끝에 `/runtime-test`(결정 S10).

| 단위 | 무엇 | 값 변화 |
|---|---|---|
| **①** 토큰·철자·정리 | 철자 접기 · 토큰 신설 · 소비자 0 삭제(C4) · 문서 교정 | **0** (자동 동치 테스트) |
| **②** API 이름 규약 | design §3 — 상태 색 · hue · 크기 · 폭 · 진행 · 슬롯 · a11y 철자 · className 이름 | **0** (이름만) |
| **③** 통합·신설 | design §4 — Card · EmptyState/NoMatch · LargeModal · ListRow · SelectRow · Popover · ButtonLink · Link 등 + **필드 셋(§4.1)** · **포커스 링 테두리형(§4.2)** + §6.3 교정 | **있음** — design §6.3 결정표가 전부 |

## 완료 조건 (검증 가능한 문장)

**단위 ① 토큰**
1. 같은 값의 두 철자가 0이다 — foreground 알파는 괄호 철자(`/[0.0N]`)와 짝이 있는 bare 철자가 공존하지 않는다(**짝이 없는 `/5`·`/6`은 허용**),
   `--divider`와 같은 불투명 선은 `border-divider`(**투명 면 위의 BannerLine 선은 제외** — design §6.1), `leading-[1.5]` → `leading-normal`,
   `rounded-[4px]` → `rounded`, 토큰 자간을 다시 적은 `tracking-[..]` 0(`public-doc-table` 제외), `[overflow-wrap:anywhere]` → `wrap-anywhere`.
   **렌더 결과는 바뀌지 않는다** — 옛·새 철자 쌍이 `globals.css` 기준 컴파일에서 같은 선언을 낸다는 자동 테스트(design §5.3).
2. design §6.2의 **확정 토큰 이름 목록**(3파일 이상 근거 포함)이 `@theme`에 있고, 그 값을 raw로 쓰는 곳이 0이다 — `visual-system.test.ts`가 센다.
   `@theme`에 없는 클래스 이름이 소스에 0이다(POSTMORTEM 2026-09-23 `text-link`).
3. `Breadcrumb` · `SegmentedLinks` · `Avatar shape="square"` export가 0이고, 소비자 0인 `@theme` 색 7개와 `:root`의 짝 변수가 없다
   (`globals-css.test.ts`가 남은 토큰마다 소비자 ≥1). 이메일 hex가 토큰 값과 같음을 테스트가 대조한다 — 짝 없는 `#262626`은 사유가 붙은 예외 목록.

**단위 ② API**
4. design §3 규약 표의 행마다 스캔 또는 렌더 테스트가 하나 있고 위반표(design §5.2)의 허용 목록이 비었다.
5. 호출부 `className` 덮어쓰기가 "API가 비워 둔 축"에서 0이다 — 입력류 폭(`width` prop, 값 목록은 design §3), Button 아이콘 크기(`size="icon-xs|sm|md|lg"`),
   스피너 크기(`spinnerSize="sm|md"` = 14/16px, 기본 `md`=16px; `[&_.animate-spin]:size-` 0). **Button `size`와 독립적으로 현재 14·16px을 보존한다.** 레이아웃 배치(margin·flex 배치)는 허용한다.
6. 상태→배지 매핑은 `lib/status/canon.ts` 하나이고 상태 배지는 `StatusBadge state` 하나로 그린다 — 남은 `result-badge` 매핑 사본 0(그 소비자 event-detail surface 결과 포함); SourceStatus의 시각·배치 래퍼는 보존.
   "tone"은 `StateTone` 한 뜻이다 — 아바타 해시는 `hue`(`lib/hue.ts` · `hueFill`).

**단위 ③ 통합·신설**
7. design §4 표의 통합·신설(S14의 누락 산출물 포함)이 전부 들어갔고, 각 행이 `hand-copies.test.ts`(design §5.1) 표에 한 줄씩 — ui 밖 사본 0 · 스캔 하한 · 양성 카나리아.
8. `buttonClass()`를 `<a>`에 직접 쓰는 곳 0(외부는 `ButtonLink external`, 내부는 `ButtonLink`), 인라인 링크는 `Link` 프리미티브 — 포커스 링 없는 링크 0.
9. design §6.3 결정표의 행이 전부 ✓이고, 그 표에 없는 모양 변화는 [수동] 레이아웃 QA(1280·1440·1890, 화면 목록 tasks)에서 0건이다.
9a. **필드 셋**(design §4.1): 필드형 드롭다운 트리거는 `FieldTrigger` 하나(손 사본 0), 호출부 `Input`의 `h-*`·`text-xs`·`border-0`·검색 글리프 절대 배치 0,
   브라우저 기본 지우기 버튼이 어느 브라우저에도 서지 않고 검색 칸 셋의 지우기가 같은 lucide `X`다. SearchInput의 지우기는 검색을 해제한다(`onSearch("")` 단언).
9b. **포커스 링**(design §4.2): 테두리를 가진 포커스 대상은 포커스 때 테두리가 링 색 + 링 1px이다 — `focus-ring.test.ts`가 렌더 클래스로 테두리형·무테형을 갈라 센다.
   invalid 필드의 포커스는 테두리·링 모두 destructive다.

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
  **승인된 예외**: SearchInput의 지우기가 검색을 해제한다(S12 — 지금의 기본 x는 칸만 비워 결과와 어긋난다). 사전 키는 그 버튼 이름 하나만 는다. 비조합 Escape도 X와 같이 검색 해제한다(S15); 빈 입력 Escape는 상위 팝업으로 전달한다.
- **콤보박스 프리미티브** — "검색 + 목록"은 형이 다른 둘뿐이다(S12). global-search가 셋째가 될 때 판정한다.
- **`radix-ui` 밖 새 의존성** — Popover는 이미 설치된 `radix-ui`에서 온다(CLAUDE.md UI 행).
- **번역 화면 세 패널의 레이아웃** — 소비자 교체(프리미티브 채택)만 한다. `key-list` 행 교체는 전후 렌더 측정을 붙인다(결정 Y16).
- **사본이 없는 축** — 쓰는 곳 없는 슬롯·placement·급, 전 프리미티브 rest props(결정 S5).

## 사용자 결정

| # | 결정 | 날짜 |
|---|---|---|
| S1 | 범위는 **디자인 시스템 전면 정리**(손 조립 + 프리미티브 API + 토큰) | 2026-10-01 |
| S2 | 손 조립 금지 원칙 — 없는 단위는 프리미티브로, 기존 사본 동시 이관(`ui-primitives-first`) | 2026-10-01 |
| S3 | **세 단위로 나눠 각자 dev에 낸다**(① 토큰·정리 ② API 이름 ③ 통합·신설) | 2026-10-01 |
| S4 | ux-drift 미완 태스크와 산출물이 같은 것(Meter·SecretField·Facts·ErrorState·404·행 패딩·철자 접기)은 **ux-drift가 만든다** — **누락 산출물 소유권은 S14로 변경** | 2026-10-01 |
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
| S12 | **필드 셋(입력·콤보박스·드롭다운 트리거)의 형을 맞춘다** — 사용자 요청. 형: `FieldTrigger` 신설 · `Input` `size`/`bare`/`icon`/`clearable`/읽기 전용 · 기본 지우기 끔 · SearchInput 지우기 = 검색 해제 · 콤보박스 프리미티브는 만들지 않음(design §4.1 — 2026-10-02 지휘자 적용 확정) | 2026-10-01 |
| S13 | **포커스 링이 테두리 바깥에 샌드위치로 겹치지 않게** — 사용자 요청. 형: 테두리형은 포커스 때 테두리 = 링 색 + 링 1px(한 띠 2px), invalid면 둘 다 destructive(design §4.2 — 2026-10-02 지휘자 적용 확정) | 2026-10-01 |
| Y-a | ErrorState `role="alert"` · `ButtonLink external`은 글리프 없음 + 새 탭은 별도 prop · 메일 hex `#262626` 예외 · BannerLine은 divider 접기 제외 · 알파 규칙은 "같은 값 두 철자만" | 2026-10-01 |
| S14 | **누락된 S4 형(Meter·SecretField·Facts·ErrorState)을 단위 ③에 포함하고 기존 소비자도 함께 이관한다** — 사용자 “포함해 진행”, 지휘자 전달. S4의 ux-drift 소유 전제를 이 범위에서 덮는다 | 2026-10-02 |
| S15 | **SearchInput 비조합 Escape는 값이 있을 때 X와 같이 입력·제출 질의를 한 번 해제**, 빈 입력 Escape는 상위 팝업으로 전달 — 사용자 “검색 해제”, 지휘자 전달 | 2026-10-02 |
