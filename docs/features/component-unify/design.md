# component-unify — design

줄 번호는 dev `a034cb0c`(2026-10-01) 기준이다. **ux-drift T17–T31 뒤에 T0이 §9 명령을 다시 돌려 갱신한다.**

## 1. 영향 받는 흐름

**편집 UI · 공개 셸 · 랜딩 · 로그인 · 초대 메일 템플릿(hex 대조만)** — 형과 이름만 옮긴다. push·pull·export·어댑터·판정(`lib/`의 순수 함수)·
사전 문구는 건드리지 않는다. `lib/`는 Tailwind를 모른다는 규칙(`components/ui/tone.ts:4-5`)은 그대로다 — 새 클래스 맵은 전부 `components/ui/`.

## 2. 층과 순서 — 세 단위(spec S3)

**단위 ①** 토큰(값) → **단위 ②** 프리미티브 API 규약(이름) → **단위 ③** 형제 통합·새 프리미티브·소비자 이관·§6.3 교정. 단위마다 따로 dev에 나간다.

- **값을 먼저 고정하는 이유**: 토큰이 서야 프리미티브가 raw 값 대신 토큰을 들고, 이관 뒤 "렌더 결과 동일"을 판정할 기준이 생긴다.
- **이름을 통합 앞에 두는 이유**: 통합이 새 이름으로 곧장 서야 소비자를 두 번 옮기지 않는다.
- **이관은 프리미티브를 만든 같은 커밋**(S2 — 형이 두 벌로 남는 창을 만들지 않는다). 단위 ②는 §3 **축마다 커밋 하나**(S8 — bisect가 원인을 가를 수 있게).
- **특성 테스트가 단위 ② 앞이다**(S8) — API를 바꾸는 프리미티브의 현재 동작을 먼저 고정하고, API가 바뀔 때 그 테스트를 뒤집는다.

## 3. API 규약 (단위 ②)

**사본이 있는 축만 적용한다**(S5) — "지금 어긋난 곳" 열이 빈 프리미티브에 규약을 새로 입히지 않는다.

| 축 | 규약 | 지금 어긋난 곳 |
|---|---|---|
| 상태 색 | **상태는 `StatusBadge state: StateKey` 하나로 들어온다**(S6). 매핑은 `lib/status/canon.ts`. `EventResult`·surface status → `StateKey` 변환은 `lib/`의 순수 함수(canon 또는 `lib/events/view.ts`). `tone: StateTone`은 tone을 이미 가진 프리미티브(BannerLine·IconTile·Note)에서만 이 이름이다 | `result-badge.tsx:9` · `source-status.tsx:19` · `event-detail.tsx:236` 매핑 사본 · PanelRow `statusTone` · BannerLine `tone`에 `muted` 대신 다른 이름이 섞인 곳(T0 확인) |
| 형태 | `variant` — 상태가 아닌 모양. Badge 면/글자·개수·역할·로케일 코드, Alert `info`(파랑 — StateTone 밖, 소비자 4), Button primary/default/danger/ghost/link | Badge `muted`(글자)·`neutral`(면)이 상태 이름을 빌림 · DESIGN §2.4 "neutral" ↔ 코드 `muted`(`sync-result.tsx:142` 손 변환) — 이름 하나로 T0이 정해 DESIGN에 적는다 |
| 아바타 색 | `lib/tone.ts` → **`lib/hue.ts`**(`Hue`·`HUES`·`hueOf`), `toneFill` → **`hueFill`** — "tone"은 상태 하나의 뜻(Y7) | `components/ui/tone.ts:29` · `lib/tone.ts:17,19,34` · `canon.ts` 주석 |
| 크기 | `size` — 문자 스케일 `sm/md/lg` + 아이콘 버튼 **`icon-xs/sm/md/lg` = 24·28·32·36**(Y6, 값 변화 0). Button `size`가 스피너 크기를 정한다. 숫자 크기는 Avatar(사진 규격)만 | Alert `default/compact` · SkeletonLine `text=` · 아이콘 버튼 손 조립(`project-switcher:92` · `key-list:89` · `user-menu:61` · `invite-modal:356`) · `[&_.animate-spin]:size-` 12 |
| 폭 | 입력류(Input·SelectTrigger·SearchInput)에 **`width` prop**(S9). 값 목록은 T0이 호출부 폭 분포에서 확정하고 여기 적는다(예: `sm/md/lg/full`) — 목록 밖 폭은 prop에 넣지 않고 호출부가 감싼다. global-search의 `FieldButton`은 입력류가 아니고 소비자가 하나라 이 규약의 대상이 아니다(S5 — 폭은 그 파일이 소유한다) | 100% `className` 덮어쓰기 |
| 진행 | `busy`(클릭 차단 + aria-busy) / `loading`(표시만). 앞 글리프 교체는 Button이 든다(ux-drift U3) | `nextPending`(Modal) · 손 삼항 · `{!pending && <Icon/>}` 3곳 |
| 슬롯 | 동작 `action`(하나)·`actions`(여럿) · 설명 `description` · 개수 `count`+`countLabel` · 값 `badge`(개수가 아닌 값) · 알림 `notice` · 글리프 `icon` | `footer`(Dialog 버튼 / Modal 문장) · `headerAction` · `subtitle`·`secondary`·`detail` · `glyph`·`leading` |
| rest props | **실수요 자리만** — 표시용 잎 프리미티브 중 호출부가 `data-*`를 붙이려 래퍼를 둔 곳(S5) | `source-status.tsx:21` 래퍼 span(T0이 같은 이유의 래퍼를 더 찾는다) |
| 테스트 표식 | `data-tone`은 `tone` prop을 가진 프리미티브에만(`icon-tile.tsx:39` 선례) | BannerLine에 없음 |
| a11y 철자 | `aria-describedby`·`aria-labelledby` 그대로 받는다(camel 별칭 금지). FormGroup은 만든 `-error`/`-help` id를 자식에 연결한다 | SegmentedControl `describedBy` · RowCardList `labelledBy` · `form-group.tsx:53-54` |
| className 이름 | `className` 하나. 부위별이 필요하면 슬롯 컴포넌트로 | `panelClassName` · `labelClassName` · `fallbackClassName` · `components/search-input.tsx:20 inputClassName` |

규약 표는 DESIGN §8(className & 변형)로 올린다(T16).

## 4. 프리미티브 — 통합 · 신설 · 이관 (단위 ③)

**"ux-drift" 행은 ux-drift가 만든다(S4)** — 이 기능은 T0에서 존재를 확인하고 §3 규약·§5 사본 스캔 표에 올리기만 한다.

| 대상 | 변경 | 흡수하는 손 사본 · 형제 | 경계 |
|---|---|---|---|
| **Card**(`PanelCard`+`RowCard`, C1) | 머리 슬롯의 합집합 하나(`title`·`description`·`count`·`badge`·`action`·`notice`·`titleId`) + 본문 `CardRows`(비대화형)/`CardList`(행 목록). 머리 아래 선 규약·`aria-labelledby`·`flex-wrap` 변화는 §6.3 | `connected-apps-card:137` notice 부재로 children에 넣은 Alert. export별 소비자: PanelCard 11 · PanelRows/PanelRow 3 · PanelFacts 2 · RowCard 5 · RowCardList/Item 4 · BannerLine 2 · EmptyRowCard 4. 손 사본 머리 12곳(`card-head.test.ts` 추적) | 클라이언트(`useId`) |
| **ListRow**(`PanelRow` 확장, C6) | `href`/`onClick`/정적 세 형, 글리프·두 줄 본문·보조줄·chevron·hover. **`li`를 누가 렌더하는지(`as`)와 `ring-inset` 조건이 API다** — 행 래퍼 id 포커스 복귀(`logs/page.tsx:151` · `logs-card.tsx:47`)와 `attention-card:77` `:first-child>a` 선택자를 깨지 않는다 | 누르는 행 5형(§6.3 결정표) · 정적 행 2 · 두 줄 본문 · Button 행 2(`ci-card:25` · `sources-screen:111`) · `ListItemButton`(`key-list:126` · `tree-panel` — 소비자 교체만, 전후 렌더 측정) | 훅 없음. `onClick` 형은 클라이언트 소비자만 |
| **SelectRow** | **모양만**(선택 면·앞뒤 선·클릭 영역) + 입력 종류 `input: "radio" \| "checkbox"` + `expand` 슬롯(선택 행 안 확장) + `aside` 슬롯(부가 액션). repo 목록은 Radix 화살표 이동 = 선택이라 확장 슬롯의 브랜치 로드가 행마다 불리지 않게 한다 | `naming.tsx:242`(radio) · `repo.tsx:228`(radio + BranchRow 확장) · `files.tsx:194`(checkbox 다중 + 미리보기 버튼 `:205` → `aside`) · `token-grant-fields.tsx:127`(checkbox + 2열 격자 — `ul role="group"`·손 조립 `span role="radio"` `:160` 결함은 §6.3) | 클라이언트 |
| **EmptyState**(+`EmptyRowCard`) | `placement: "page" \| "card" \| "inset"` — **형마다 실소비자가 있을 때만**(T0이 수를 적는다). 아이콘·설명 타입 통일은 §6.3 | `EmptyRowCard` · Home 카드 안 `EmptyState` + className(`attention-card:66` · `logs-card:38`) | 서버 호환(훅·지시문 없음 유지 — 서버 소비자가 아이콘 **함수**를 넘긴다: `logs/page.tsx:111,123` · `logs-card.tsx:38` · `attention-card.tsx:66` · `project-archived.tsx:35`) |
| **NoMatch** | `EmptyState` 위의 얇은 형 — 아이콘 `SearchX` 고정, 출구는 `href` 형과 `onClick` 형(서버 소비자 `logs/page.tsx`). 출구 없는 형은 만들지 않는다 — 소비자가 생기는 global-search가 더한다(S5) | `logs/page:111` · `empty-projects:55,67` · `repo.tsx:188`(글리프 Search→SearchX, §6.3). 번역 화면 0건(`workspace:577`, 출구 라벨 넷 `lib/translations/query.ts:156-161`)은 소비자 교체만. `project-list:206`은 결과 카드 머리 링크라 대상 아님 | 서버 호환 |
| **LargeModal**(`OnboardingModal` 개명, C2) | 1024 껍데기. **`step`(전환 키 → 포커스·낭독, `modal.tsx:114-135`) · `announce`(단일 live 영역 `:138,187`) · `bodyDirection`(`:227`) · `bodyScroll`(소비자 5)은 껍데기에 남는다.** `showBack`·`onBack`·`next*`만 `WizardFooter`로 뗀다. `headerAction`(0) 삭제. 바닥 버튼 `busy` 전환에 focus fixup observer(POSTMORTEM 2026-09-20) | `components/onboarding/modal.tsx:2` 재수출 · `100vh`↔`100svh`(§6.3) | 클라이언트 |
| **event-dialog 치수** | LargeModal과 **형제**로 남기고 껍데기 치수(1024·dim·radius·그림자)만 상수로 공유 — 헤더를 서버가 그리고(`event-detail.tsx:64`) 복귀가 행 래퍼 id(`event-dialog.tsx:64-68`)라 흡수하지 않는다 | `logs/event-dialog.tsx:52-79` | — |
| **Popover**(Y4) | **Radix Popover** — Anchor로 Root 밖 트리거(`key-list:89`)를 잇고, `onCloseAutoFocus`로 바깥 클릭 시 포커스 미복귀(`workspace.tsx:932`의 의도)를 지킨다. 그림자 `shadow-md`(DESIGN §4.5)·z는 §6.3 | `workspace.tsx:938` 손 팝오버 — 열린 채 토글 누름(`pointerdown` 닫힘 → click 재열림) 결함 의심, 재는 테스트를 더한다 | 클라이언트. CLAUDE.md "Radix 여섯"·`focus-ring.test.ts:202-208 RADIX_FIXTURES` 갱신 |
| **ButtonLink `external` · `newTab`** | `external`은 포커스 링 + `rel`, **글리프 없음**(DESIGN §6.3). 새 탭(`target=_blank`)은 별도 prop — GitHub App 설치 왕복은 외부지만 같은 탭 | `<a className={buttonClass()}>` 13곳: 링 누락 외부 3(`github-section:109` · `publish-button:531` · `sync-result:79`) · 링 누락 내부 3(`publish-button:436,595,598` → `ButtonLink`) · 손 링 7(`repo.tsx:440,509` · `repository-card:78` · `app/page.tsx:94` · `new-project-button:22` 등) · 상수 우회 `FOOTER_LINK`(`event-detail:324`). 랜딩 목업 `<span>` 10개는 비대화형이라 제외 | 서버 호환 |
| **Link**(인라인) | 문장 안 인라인 링크 형(파랑 + 링) — 상수 `DOC_LINK`(`components/docs/classes.ts:7`)를 프리미티브로 | 인라인 파랑 링크 25줄, 그중 링 없음 9(`publish-button:523` · `project-list:427,436` · `event-detail:270,277` · `locale-panel:106` · `workspace:854` · `repo.tsx:287` — §6.3) | 서버 호환 |
| **ProjectThumbnail**(`ImageTile`+`hueFill`) | 크기 prop으로 세 벌을 하나로 | `project-thumbnail:45` · `invite/project-card:45` · `general-card:48` | 서버 호환 |
| **SearchInput** | 정의 둘(`components/search-input.tsx` · `components/projects/search-input.tsx`)을 `components/ui/`로 하나, 글리프 슬롯을 `Input`에, 폭은 `width`(§3) | 손 검색 칸 `repo.tsx:170` · `tree-panel:51`(즉시 필터 형은 prop — 소비자 교체만) | 클라이언트 |
| **CopyButton** | `components/onboarding/` → `components/ui/` 이동 | 손 조립 `docs/code-block:42` · `locale-panel:287` | 클라이언트 |
| **Skeleton** | `SkeletonLine` 재구현 흡수. **기본 radius는 바꾸지 않는다** — 지정 없는 28곳이 4→10px로 바뀌므로, 명시한 `rounded-md` 61곳의 className만 걷어낼지 T0이 §6.3에서 판정 | `members/loading:64` · `sources/loading:59` | 서버 호환 |
| **상태 배지 래퍼 셋** | `StatusBadge`(ux-drift) 하나로 — §3 상태 색 행 | `result-badge.tsx` · `source-status.tsx` · `event-detail.tsx:236` | — |
| **sr 상태 줄** | 프리미티브가 아니라 glob 테스트(`loading.tsx`마다 `role="status"` 한 줄) | `loading.tsx` 8곳 중 없는 2(`account/` — ux-drift T23 4-Y17 · `projects/(list)/`) | — |
| Meter · SecretField · Facts · ErrorState/404 · FieldError | **ux-drift**(S4) — T0이 존재·규약을 확인한다. ErrorState는 `role="alert"`를 계약으로 든다(`(edit)/error.tsx`의 낭독 유지). Facts 라벨은 `neutral-400`(Y5). FieldError는 ux-drift T22 산출물 | `locale-meter:47-49` · `source-detail-modal:161-163` · `push-token-panel:98` 등 | — |

⚠️ **POSTMORTEM 2026-09-15🔁 · 09-14**: 형제 export마다 소비자를 따로 세고(위 Card 행), 슬롯 유무에 따라 여백·선이 갈리는 곳은 코드 조건으로 쓴다 —
`connected-apps-card:137-157`(`first={index===0 && unconfirmed===null}`) · `token-card:148,157,233`(`afterAlert`) · `pending-invitations:161-187`(`first={index===0}`가 Alert를 무시 — 기존 결함 의심).
표의 "흡수" 열이 곧 전수 목록이고 T0 재조사가 갱신한다.

## 5. 그물 (테스트)

### 5.1 사본 스캔 — 표 주도 파일 하나
`components/__tests__/hand-copies.test.ts` 하나에 **행 = {프리미티브, 사본 정규식, 허용 경로, 스캔 하한}**. 워커(`readdirSync`)·주석 제거(`bare()`)는 하나,
행마다 **양성 카나리아**(정규식이 실제 사본 문자열을 잡는다)와 **뮤테이션 1회**(사본 한 줄을 되살리면 red). 관용구는 `visual-system.test.ts:207,271`(카나리아)·`bare()`.
근거: POSTMORTEM 2026-09-07(메타 테스트) · 2026-09-14(방어선을 지워도 green). 이미 18개 파일이 워커를 복사해 들고 있으므로 새 사본을 늘리지 않는다.
여러 줄 JSX와 상수 경유(`FOOTER_LINK`)를 잡는다.

### 5.2 API 규약 스캔 — 위반표 + 허용 목록 (S8)
§3 표의 행마다 규칙 하나. **허용 목록 = 지금 위반 × 해소 태스크**로 시작해 green이고, 각 태스크가 자기 행을 지운다(ux-drift T28 선례). 단위 ②·③이 끝나면 목록이 빈다(spec 완료 조건 4).
`components/ui/*.tsx` export props에 금지 이름(`statusTone`·`describedBy`·`*ClassName`·`subtitle`·`headerAction` …) 0, 실수요 자리의 rest 전달(렌더해 `data-x`가 루트에 붙는지), `tone` 가진 프리미티브의 `data-tone`.

### 5.3 토큰 스캔 · 동치
- `visual-system.test.ts` 확장: 같은 값 두 철자 0, 확정 토큰 값의 raw 사용 0, `lib`·`messages`도 스캔, 접두 `border-t-`·`placeholder-`·`caret-`·`accent-` 포함, `@theme`에 없는 클래스 0.
- **철자 동치 자동 테스트**(S10): 설치된 `tailwindcss`의 `compile`로 옛·새 철자 쌍을 `globals.css` 기준 컴파일해 선언이 같은지 대조한다. 이것이 단위 ① "값 변화 0"의 판정이다.
- **이메일 hex 대조**: `lib/invitation-email/template.ts` hex ↔ `globals.css` 토큰(hsl → hex 변환). 짝 없는 `#262626`(`template.ts:46`)은 사유가 붙은 예외 목록.
  `message.ts:36-43 TONE_HEX`도 범위에 넣는다. 선례 `lib/invitation-email/__tests__/message.test.ts:353-390` 옆에 둔다.

### 5.4 렌더 계약 — 단위 ② 전에 현재 동작 고정
Select · Input · Textarea · Radio · ListItemButton · BannerLine · EmptyRowCard · EmptyState · Badge variant 전수 · Button(size·variant·busy). 단위 ②·③이 API를 바꿀 때 이 테스트를 **뒤집는다**
— 기대 문자열만 새 값으로 바꾸는 것은 복사다. 클래스 문자열 대신 상태 키·`data-tone`·슬롯 노드로 단언한다(ux-drift E 공통 규칙). 두 줄 본문은 textContent가 아니라 1·2번째 노드(POSTMORTEM 2026-09-16).

## 6. 토큰 · 교정 · 문서

### 6.1 값 변화 0 (철자 접기 — 단위 ①)
foreground 알파 `/2`·`/3` 10건 → 괄호 철자 · divider와 같은 불투명 선 → `divider` · `leading-[1.5]` 3 → `leading-normal` · `rounded-[4px]` 1 → `rounded` ·
토큰 자간 재기술 `tracking-[..]` 8 삭제 · `[overflow-wrap:anywhere]` 14 → `wrap-anywhere` · 중복 `<style>body{…}`(`public-shell:46` · `auth-layout:48`) 하나로.
⚠️ **BannerLine 제외** — `row-card.tsx:173`은 자기 요소의 `bg-foreground/[0.02]` 위에 선을 긋는다. `--divider`는 불투명 `rgb(240 240 240)`(`globals.css:204`)이라 투명 면 위에서는 값이 다르다 → §6.3.
⚠️ **ux-drift T23 5-Y8(철자 하나로)이 먼저 접는다** — T0이 남은 것만 센다.

### 6.2 토큰 (C5 — 3파일 이상 같은 값만)
후보: `--color-link`(파랑 31 — ux-drift T19 🔴 N 뒤 줄어든다) · 회색 3단(neutral-300/400/600, 58 — Facts 라벨 포함) · 행간(`leading-[1.6]` 34 · `[1.7]` 15 · `[1.55]` 7) ·
행 패딩(`py-[13px]` 27 · `[11px]` 12 — ux-drift T23 4-W3 뒤) · 두 줄 간격(`gap-[3px]` 15 + `space-y-[3px]` 4) · 모달 gutter(`calc(100svh-96px)` 24) · 컨테이너(`@max-[640px]` 36 · `[1016px]` · `[850px]`) · 셸 최소폭(`min-w-[1280px]` 9).
**T0이 규칙으로 확정 이름 목록을 여기 적는다.** 순서는 POSTMORTEM 2026-09-23: **`@theme`에 먼저 두고 → 소비자 교체 → 죽은 클래스 스캔**을 한 커밋에.

### 6.3 값이 바뀌는 곳 — 결정표 (S7 · 단위 ③)
**이 표에 없는 모양 변화는 결함이다**(spec 완료 조건 9). "이기는 값" 규칙은 spec S11(편집자 상시 화면 — 번역·Logs·Home). T0이 "T0" 칸을 채운다.

| 대상 | 전 | 후 | 근거 |
|---|---|---|---|
| 누르는 행 여백 | `py-[13px]`(ci-card · event-row · sources) · `py-3.5`(attention-card) · `py-3.5 pl-3 pr-3.5 gap-4`(project-list) | T0 — Logs(`event-row`)·Home(`attention-card`) 중 | S11 |
| 누르는 행 hover | 없음(ci-card) · `/[0.02]` · `/2`(sources) · 3%(ListItemButton 캔버스) | 카드 안 2% · 캔버스 3%(DESIGN §5 유지) | DESIGN §5 |
| 누르는 행 포커스 링 | `ring-inset` 3 · 바깥 링 2 | T0 — `ring-inset` 조건을 ListRow API로 | — |
| 누르는 행 본문 | `gap-[3px]` · attention `gap-0.5` + 순서 반대 · 보조줄 `text-sm`(project-list) | 두 줄 간격 토큰 · 보조줄 13 | ux-drift 4-Y9 |
| 누르는 행 chevron | 버튼 밖 `neutral-400`(sources) · 안 | 안, muted | — |
| EmptyState ↔ EmptyRowCard | 제목 18 vs 15 · 간격 4 vs 6 · 설명 행간 · Home 카드 `px-4 py-8` | `placement`별 값(T0) | — |
| NoMatch | `workspace:577` 아이콘 없는 `text-sm` 문단 · `repo.tsx:188` `Search` | `SearchX` 칩 | — |
| Card 머리 선 | RowCard는 자식이 선(`row-card.tsx:124,223` · `token-card:233` · `connected-apps:143`) | Card 머리가 선(ux-drift 1d72114e 규약) · RowCard 쪽 `aria-labelledby`·`flex-wrap` 신규 | C1 |
| BannerLine 선 | 투명 면 위 `/[0.06]` | T0 — divider로 바꿀지(≈236 → 240) · `row-card.tsx:116-118` 주석과 DESIGN:509 함께 | Y-a |
| Facts 라벨 | `neutral-400` 6 · `muted-foreground` 1(`source-detail-modal:90`) · 라벨 폭 96·120·104 | `neutral-400` · 폭 T0 | Y5 |
| Popover | `shadow-medium` · `z-20` | `shadow-md` · `z-50` | Y4 · DESIGN §4.5 |
| LargeModal 높이 | `event-dialog.tsx:63` `100vh` | `100svh` | — |
| Skeleton radius | 지정 없는 28곳 4px | T0 — 유지(기본값 불변) 권장 | — |
| 외부·내부 링크 버튼 링 | 링 없음 6 | 포커스 링 | spec 사용자 |
| 인라인 링크 링 | 링 없음 9 | 포커스 링 | spec 사용자 |
| token-grant-fields | `ul role="group"` · 손 조립 `span role="radio"`(화살표 안 닿음, `:160`) | SelectRow 역할 | a11y |
| Sources 행 hover · 배지 글리프 · 닫기 버튼 | `/2`·`/5` · `source-detail-modal:169` | T0 — ux-drift가 고친 것은 뺀다(`sources-screen:95` 닫기는 이미 `CloseButton`) | — |

### 6.4 문서 교정 (T16)
- **DESIGN**: 체크리스트 bare `rounded` = 12(실제 4px) · `:35` Breadcrumb 소비자(삭제) · `:672` RowCard 소비자·치수(→ Card) · `:673` EntityCard 소비자 · `:675` Avatar 프로젝트 형 ·
  `:651` danger disabled hover · `:681` EmptyState 대기 초대 · `rounded-3xl` 개수 · 자간 "아홉"(`:219` · `:2052` → 8) · §2 토큰 표(`divider` 행 누락 + 새 토큰) · §2.1(accent=secondary=muted) ·
  §6.2 등재 목록·`REGISTERED` · §6.3 링크 색 · §6.8 아이콘 무채 계단 · §6.625 메일 hex 표 · §8 API 규약 표(§3) · `:509` BannerLine 선.
- **`globals.css` 주석**: `#e2e8f0`(`:37,196,201`) · "소비자 66곳".
- **CLAUDE.md**: UI 행 "프리미티브 26개"(실제 29, 이 기능 뒤 다시 셈) · "Radix 여섯"(+Popover) · 작업 원칙에 `ui-primitives-first` 예외 한 줄(spec 원칙 — 손 사본이 실재하는 형은 선반영이 아니다).
- **DIRECTORY**: 새 프리미티브·이동 파일(`hue.ts` · `search-input` · `copy-button` · `large-modal`).
- **global-search 문서**: 이 기능 종료를 착수 조건으로 들고 §3 규약·재사용 단위(`LargeModal` 치수 상수 · `Input` 글리프 슬롯 · `NoMatch` · `hand-copies.test.ts`)를 이미 적었다(2026-10-01 반영). T21은 그 이름들이 이 기능의 실제 산출물 이름과 같은지만 대조한다. `FieldButton` 폭은 prop 없음(위 §3 폭 행).
- (줄 번호는 a034cb0c 기준 — ux-drift T29 뒤 재확인.)

## 6.5 스키마 · 환경변수 · 불변식 · 경계

- **스키마·환경변수 없음.**
- **불변식 영향 없음** — export 결정성·blob SHA·인증 경계를 건드리지 않는다(`middleware.ts` · `lib/adapters/shared.ts` · `lib/githash.ts`는 `components/`·canon을 import하지 않는다).
  `lib/` **판정** 함수(canon)는 이름을 바꾸지 않는다 — 개명은 아바타 해시 `lib/tone.ts` → `lib/hue.ts` 하나다(Y7).
- **클라이언트 그래프** — `client-graph.test.ts`는 도달 가능한 `lib/**`를 `CLIENT_LIB_FILES`와 **정확 일치**로 비교한다(`:464-468`, canon 도달 집합 `:414-418`).
  `lib/hue.ts` 개명과 `StateKey` 변환 함수 추가가 이 목록을 바꾼다 — 잎만(POSTMORTEM 2026-09-07).
- **서버/클라이언트 경계**(RSC 직렬화 — `pnpm build`만 잡는다):

  | 서버 호환(지시문·훅 없음) | 클라이언트 |
  |---|---|
  | EmptyState · NoMatch(`href` 출구) · Skeleton · Link · ButtonLink · ProjectThumbnail · ListRow(`onClick` 형은 클라이언트 소비자만) · Facts · Meter | Card(`useId`) · LargeModal · Popover · SelectRow · SearchInput · CopyButton · SecretField · ErrorState(`reset`) |

- **게이트 트리거**: `lib/__tests__/`(`globals-css.test.ts`)·`lib/invitation-email/`을 건드리는 커밋은 `scripts/gate-plan.ts`가 postgres 스위트를 붙인다(로컬 postgres 필요).

## 7. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| ux-drift design:163처럼 ListRow·NoMatch·SecretField·ErrorState를 만들지 않는다 | 사용자 원칙 `ui-primitives-first`(2026-10-01)가 뒤집었다 — 손 사본이 실재하면 추상화가 아니라 중복 제거다(S5) |
| 한 기능·한 흐름으로 간다 | 100파일 이상 · 25개 프리미티브 작업이 한 번에 나가면 red 원인을 가를 수 없다(S3) |
| PanelCard·RowCard를 두고 슬롯 이름만 맞춘다 | 껍데기·머리가 같고 슬롯만 갈려 소비자가 없는 슬롯을 Alert로 우회한다(C1) |
| Badge가 `tone`을 직접 받는다 | `muted`가 면·글자 두 모양으로 갈리고 상태 아닌 배지가 많아 매핑이 호출부로 흩어진다(S6) |
| 전 프리미티브 rest props · `data-tone` | 실수요가 래퍼 하나 — 사본 없는 축은 선반영이다(S5) |
| `event-dialog`를 LargeModal에 흡수 | 서버 헤더·id 복귀 어댑터가 필요해 껍데기가 커진다(C2) |
| Skeleton 기본 radius를 `rounded-md`로 | 지정 없는 28곳의 값이 바뀐다 — 값 변화 0 원칙과 충돌 |
| 아이콘 버튼 두 크기(28·36) | 24·32 소비자의 값이 바뀐다(Y6) |
| computed style 스냅샷 diff 도구 | 새 도구를 만들어야 한다 — 단위 ①은 컴파일 동치, ③은 결정표 + 수동으로 충분(S10) |

## 8. 결정 (spec "사용자 결정" 표가 정본)

C1–C6 · S3–S11 · Y4–Y7 · Y-a는 2026-10-01 feature-review에서 답이 났다. **남은 T0 판정**: §3 `width` 값 목록 · 상태/중립 이름 하나 · §6.2 확정 토큰 이름 · §6.3 "T0" 칸 · EmptyState `placement` 형별 소비자 수.

## 9. 세는 명령 (T0이 다시 돌린다 — a034cb0c 값)

`c(){ rg -o -g '!**/__tests__/**' -g '!*.test.*' -e "$1" app components lib messages | wc -l; }`

| 패턴 | 값 |
|---|---|
| `py-\[13px\]` · `py-\[11px\]` | 27 · 12 |
| `gap-\[3px\]` · `space-y-\[3px\]` | 15 · 4 |
| `text-blue-600` | 31 |
| `leading-\[1\.6\]` · `\[1\.7\]` · `\[1\.55\]` · `\[1\.5\]` | 34 · 15 · 7 · 3 |
| `calc\(100svh-96px\)` · `@max-\[640px\]` · `min-w-\[1280px\]` | 24 · 36 · 9 |
| `\[overflow-wrap:anywhere\]` · `rounded-\[4px\]` | 14 · 1 |
| `\[&_\.animate-spin\]:size-` | 12 |
| `foreground/[23]\b` · `foreground/\[0\.06\]\|ring-foreground/6\b` | 10 · 12 |
| `neutral-(300\|400\|600)` | 58 |
| `className=\{buttonClass\(` | 13 |
| `find app -name loading.tsx` · 그중 `role="status"` 없음 | 8 · 2 |
| `ls components/ui/*.tsx \| wc -l` | 29 |
