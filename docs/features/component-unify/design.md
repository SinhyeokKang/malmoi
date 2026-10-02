# component-unify — design

기준은 `aed73f32`(2026-10-02). 수치는 §9의 재현 명령으로 다시 셌다. 선택의 승인 출처는 §8에 구분한다. S14·S15는 사용자 추가 승인, 나머지는 기존 S11/S12/S13/Y-a 적용이다.

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
| 상태 색 | **상태는 `StatusBadge state: StateKey` 하나로 들어온다**(S6). 매핑은 `lib/status/canon.ts`. `EventResult`·surface status → `StateKey` 변환은 `lib/`의 순수 함수(canon 또는 `lib/events/view.ts`). `tone: StateTone`은 tone을 이미 가진 프리미티브(BannerLine·IconTile·Note)에서만 이 이름이다 | `logs/result-badge.tsx:10` 매핑 → event-detail 해당 문구도 소비. SourceStatus 해당 문구은 이미 StatusBadge. PanelRow `statusTone`은 남고 BannerLine `tone`은 이미 muted/warning/danger다 |
| 형태 | `variant` — 상태가 아닌 모양. Badge 면/글자·개수·역할·로케일 코드, Alert `info`(파랑 — StateTone 밖, 소비자 4), Button primary/default/danger/ghost/link | Badge `muted`(글자)·`neutral`(면)이 상태 이름을 빌림 · 상태 tone `muted`와 배지의 회색 면 이름은 별개 축 — 값0 이름 결정: `muted→text`, `neutral→soft-neutral`, `success→soft-green`, `warning→soft-amber`, `missing→soft-red`; StateTone `muted`는 유지하고 StateVariant만 같은 사전으로 개명한다. 새 variant·색 축은 만들지 않는다 |
| 아바타 색 | `lib/tone.ts` → **`lib/hue.ts`**(`Hue`·`HUES`·`hueOf`), `toneFill` → **`hueFill`** — "tone"은 상태 하나의 뜻(Y7) | `components/ui/tone.ts:29` · `lib/tone.ts:17,19,34` · `canon.ts` 주석 |
| 크기 | `size` — 문자 스케일 `sm/md/lg`(입력 md36/sm32/xs28, 필드 트리거 md36/sm28) + 아이콘 버튼 **`icon-xs/sm/md/lg` = 24·28·32·36**(Y6, 값 변화 0). Button 스피너는 `size`와 독립적인 **`spinnerSize: "sm" \| "md"` = 14/16px**, 기본 `md`=16px이다. 같은 md 버튼에도 두 값이 실재하므로 size별 정규화를 하지 않는다. 숫자 크기는 Avatar(사진 규격)만 | Alert `default/compact` · SkeletonLine `text=` · 아이콘 버튼 손 조립(`project-switcher:92` · `key-list:95` · `user-menu:61` · `invite-modal.tsx` 제거 버튼) · `[&_.animate-spin]:size-` 11 |
| 폭 | 입력류(Input·SelectTrigger·SearchInput)에 **`width` prop**(S9). 실측 값 보존 목록(숫자는 width 축이므로 size 숫자 제한과 별개): `132 / 160 / 168 / 192 / 220 / 240 / 256 / 320 / "full"`(px, 숫자는 기존 폭의 이름이지 새 급이 아니다) — 목록 밖 폭은 prop에 넣지 않고 호출부가 감싼다. global-search의 `FieldButton`은 입력류가 아니고 소비자가 하나라 이 규약의 대상이 아니다(S5 — 폭은 그 파일이 소유한다) | Input 18/18·SelectTrigger 10/10 className 있음. 폭 목록·래퍼 경계는 아래 표 |
| 진행 | `busy`(클릭 차단 + aria-busy) / `loading`(표시만). 앞 글리프 교체는 Button이 든다(ux-drift U3) | `nextPending`(Modal) · 손 삼항 · `{!pending && <Icon/>}` 3곳 |
| 슬롯 | 동작 `action`(하나)·`actions`(여럿) · 설명 `description` · 개수 `count`+`countLabel` · 값 `badge`(개수가 아닌 값) · 알림 `notice` · 글리프 `icon` | `footer`(Dialog 버튼 / Modal 문장) · `headerAction` · `subtitle`·`secondary`·`detail` · `glyph`·`leading` |
| rest props | **실수요 자리만** — 표시용 잎 프리미티브 중 호출부가 `data-*`를 붙이려 래퍼를 둔 곳(S5) | `source-status.tsx:16` 래퍼는 배지+시각+반응형 배치를 함께 소유하므로 유지한다. data-*만 때문에 생긴 래퍼 실수요는 재조사에서 입증되지 않아 rest prop 일괄 추가는 제외 |
| 테스트 표식 | `data-tone`은 `tone` prop을 가진 프리미티브에만(`icon-tile.tsx:39` 선례) | BannerLine에 없음 |
| a11y 철자 | `aria-describedby`·`aria-labelledby` 그대로 받는다(camel 별칭 금지). FormGroup은 만든 `-error`/`-help` id를 자식에 연결한다 | SegmentedControl `describedBy` · RowCardList `labelledBy` · `form-group.tsx:53-54` |
| className 이름 | `className` 하나. 부위별이 필요하면 슬롯 컴포넌트로 | `panelClassName` · `labelClassName` · `fallbackClassName` · `components/search-input.tsx:20 inputClassName` |

규약 표는 DESIGN §8(className & 변형)로 올린다(T21).

## 4. 프리미티브 — 통합 · 신설 · 이관 (단위 ③)

**S14(2026-10-02)**: 선행 디렉터리는 없지만 Meter·SecretField·Facts·ErrorState 프리미티브가 없으므로 이 기능 단위 ③이 만든다. FieldError(`ui/form-group.tsx:71`)·StatusBadge(`ui/status-badge.tsx:10`, 화면 15호출/13파일)는 이미 있다.

| 대상 | 변경 | 흡수하는 손 사본 · 형제 | 경계 |
|---|---|---|---|
| **Card**(`PanelCard`+`RowCard`, C1) | 머리 슬롯의 합집합 하나(`title`·`description`·`count`·`badge`·`action`·`notice`·`titleId`) + 본문 `CardRows`(비대화형)/`CardList`(행 목록). 머리 아래 선 규약·`aria-labelledby`·`flex-wrap` 변화는 §6.3 | `connected-apps-card:137` notice 부재로 children에 넣은 Alert. export별 소비자: PanelCard 15호출/13파일 · PanelRows 3/3 · PanelRow 4/3 · PanelFacts 4/2 · RowCard 6/5 · RowCardList 4/4 · RowCardItem 4/4 · BannerLine 2/2 · EmptyRowCard 8/7. `card-head.test.ts:17` SITES는 12항목/13호출(ui2·외부11=실화면3+loading8); 전부 Card 껍데기로 바꾸지 않고 고정 머리/aside 의미론 유지 | 클라이언트(`useId`) |
| **ListRow**(`PanelRow` 확장, C6) | `href`/`onClick`/정적 세 형, 글리프·두 줄 본문·보조줄·chevron·hover. **`li`를 누가 렌더하는지(`as`)와 `ring-inset` 조건이 API다** — 행 래퍼 id 포커스 복귀(`logs/page.tsx` event-row 래퍼 id · `logs-card.tsx:47`)와 `attention-card.tsx` 카드 :first-child>a `:first-child>a` 선택자를 깨지 않는다 | 누르는 행 5형(§6.3 결정표) · 정적 행 2 · 두 줄 본문 · Button 행 2(`ci-card:28` · `sources-screen:102`) · `ListItemButton`(`key-list:134` · `tree-panel` — 소비자 교체만, 전후 렌더 측정) | 훅 없음. `onClick` 형은 클라이언트 소비자만 |
| **SelectRow** | **모양만**(선택 면·앞뒤 선·클릭 영역) + 입력 종류 `input: "radio" \| "checkbox"` + `expand` 슬롯(선택 행 안 확장) + `aside` 슬롯(부가 액션). repo 목록은 Radix 화살표 이동 = 선택이라 확장 슬롯의 브랜치 로드가 행마다 불리지 않게 한다 | `naming.tsx:242`(radio) · `repo.tsx:228`(radio + BranchRow 확장) · `files.tsx:194`(checkbox 다중 + 미리보기 버튼 → `aside`) · `token-grant-fields.tsx:127`(checkbox + 2열 격자 — `ul role="group"`·손 조립 `span role="radio"` 결함은 §6.3) | 클라이언트 |
| **EmptyState**(+`EmptyRowCard`) | `placement: "page" \| "card" \| "inset"` — **실측 page 13 · card 2 · inset 6호출**(총 21, 아래 목록). NoMatch/ErrorState 이관 뒤에는 해당 래퍼를 통해 같은 placement를 쓴다. 아이콘·설명 타입 통일은 §6.3 | `EmptyRowCard` 8호출(둘은 독립 카드, 여섯은 inset). Home 둘은 이미 EmptyRowCard inset(`attention-card:71` · `logs-card:38`) | 서버 호환(훅·지시문 없음 유지 — 서버 소비자가 아이콘 **함수**를 넘긴다: `logs/page.tsx:111,123` · `logs-card.tsx:38` · `attention-card.tsx:71` · `project-archived.tsx:35`) |
| **NoMatch** | `EmptyState` 위의 얇은 형 — 아이콘 `SearchX` 고정, 출구는 `href` 형과 `onClick` 형(서버 소비자 `logs/page.tsx`). 출구 없는 형은 만들지 않는다 — 소비자가 생기는 global-search가 더한다(S5) | `logs/page:111` · `empty-projects:55` · `repo.tsx:188`(글리프 Search→SearchX, §6.3). 번역 화면 0건(`workspace:674`, 출구 계약 `lib/translations/query.ts`)은 소비자 교체만. `project-list.tsx` 결과 카드 머리은 결과 카드 머리 링크라 대상 아님 | 서버 호환 |
| **LargeModal**(`OnboardingModal` 개명, C2) | 1024 껍데기. **`step`(전환 키 → 포커스·낭독, `modal.tsx:114-135`) · `announce`(단일 live 영역 `:138,187`) · `bodyDirection`(해당 문구) · `bodyScroll`(소비자 5)은 껍데기에 남는다.** `showBack`·`onBack`·`next*`만 `WizardFooter`로 뗀다. `headerAction`(0) 삭제. 바닥 버튼 `busy` 전환에 focus fixup observer(POSTMORTEM 2026-09-20) | `components/onboarding/modal.tsx:2` 재수출 · `100svh` 이미 선행 완료(§6.3) | 클라이언트 |
| **event-dialog 치수** | LargeModal과 **형제**로 남기고 껍데기 치수(1024·dim·radius·그림자)만 상수로 공유 — 헤더를 서버가 그리고(`event-detail.tsx:64`) 복귀가 행 래퍼 id(`event-dialog.tsx:64-68`)라 흡수하지 않는다 | `logs/event-dialog.tsx:52-79` | — |
| **Popover**(Y4) | **Radix Popover** — Anchor로 Root 밖 트리거(`key-list:95`)를 잇고, `onCloseAutoFocus`로 바깥 클릭 시 포커스 미복귀(`workspace.tsx:1046`의 의도)를 지킨다. 그림자 `shadow-md`(DESIGN §4.5)·z는 §6.3 | `workspace.tsx:1053` 손 팝오버 — 열린 채 토글 누름(`pointerdown` 닫힘 → click 재열림) 결함 의심, 재는 테스트를 더한다 | 클라이언트. CLAUDE.md "Radix 여섯"·`focus-ring.test.ts:202-208 RADIX_FIXTURES` 갱신 |
| **ButtonLink `external` · `newTab`** | external은 rel+링, 새 탭은 별도 prop; onNavigate 전달을 보존 | 직접 buttonClass a/Link 5(링 없는4: github-section:109, publish-button:518,585, sync-result:105; 있는1: repository-card:80), FOOTER_LINK 경유4(event-detail:320–323), 여러줄 cn 경유도 AST로 조사 | 서버 호환 |
| **Link**(인라인) | 문장 안 파랑+링, DOC_LINK 공유 | 링 없는7: publish-button:510, project-list:408, event-detail:262,269, locale-panel:108, workspace:968, repo:287. text-blue-600 전체28은 링크가 아닌 글리프·주석도 포함 | 서버 호환 |
| **ProjectThumbnail**(`ImageTile`+`hueFill`) | 크기 prop으로 세 벌을 하나로 | `project-thumbnail:45` · `invite/project-card:45` · `general-card.tsx` ImageTile | 서버 호환 |
| **SearchInput** | 공통 정의 `components/search-input.tsx` 하나를 `components/ui/`로 이동; `components/projects/search-input.tsx`의 ProjectSearch/useProjectQuery는 화면 래퍼로 유지, 글리프 슬롯을 `Input`에, 폭은 `width`(§3) | 손 검색 칸 `repo.tsx:170` · `tree-panel:92`(즉시 필터 형은 prop — 소비자 교체만) | 클라이언트 |
| **CopyButton** | `components/onboarding/` → `components/ui/` 이동 | 손 조립 `ui/code-block`(2026-10-01 이동 — 아래 행) · `locale-panel:287` | 클라이언트 |
| **CodeBlock** | ✅ **선행 완료(2026-10-01 `/ship`)** — `components/docs/code-block` → `components/ui/code-block` + `fill`, 워크플로 YAML(`workflow-block`)이 이것을 쓴다(docs 형으로 맞췄다). T0은 세기만 하고 다시 만들지 않는다 | 옛 `workflow-block`의 `bg-muted` `<pre>` + 블록 위 `CopyButton` | 클라이언트 |
| **Skeleton** | `SkeletonLine` 재구현 흡수. **기본 radius는 바꾸지 않는다** — ui 밖 JSX 93호출(내부 SkeletonLine 포함94) 중 radius 미지정 14, 명시 rounded-md 45다(내부 포함46). 기본 4px 유지; 나머지 radius도 보존한다(§6.3) | `members/loading:64` · `sources/loading:59` | 서버 호환 |
| **상태 결과 배지** | `StatusBadge`(ux-drift) 하나로 — §3 상태 색 행 | `logs/result-badge.tsx:10` · 소비자 `event-detail.tsx:131`; SourceStatus 래퍼는 제거하지 않는다 | — |
| **sr 상태 줄** | 프리미티브가 아니라 glob 테스트(`loading.tsx`마다 `role="status"` 한 줄) | `loading.tsx` 8/8이 role="status" 보유 — 누락 교정 제외, glob 회귀 그물만 유지 | — |
| **Meter**(S14) | `locale-meter.tsx:56` MeterBar를 ui로 옮긴다(이미 공유되므로 재구현 없음) | `locale-meter.tsx:47` · `sources/source-detail-modal.tsx:154` | 서버 호환 |
| **SecretField**(S14) | TokenField+MCP 공개 직후 값 칸을 공유; push text-xs·MCP text-sm/select-all은 실수요 변형으로 보존, 복사 성공/실패 유지 | `onboarding/copy-button.tsx:51` → 소비자 `steps/result.tsx:15`, `settings/push-token-panel.tsx:108`; `mcp/token-modal.tsx:140` | 클라이언트 |
| **Facts**(S14) | 기존 dl/table 의미론·폭을 보존하는 라벨/값 단위, Y5 라벨색은 §6.3 | `home/meta-column.tsx:76`(96) · `mcp/token-card.tsx:234`(120) · `logs/event-detail.tsx:176`(104, th) · `sources/source-detail-modal.tsx:87`(세로 셀 라벨) · `mcp/connected-apps-card.tsx:235`(가로 dl) | 서버 호환; PanelFacts는 Card 배치 슬롯으로 별도 |
| **ErrorState / 404**(S14) | 오류는 `retry` 콜백을 유지(Next의 reset으로 바꾸지 않음); `role="alert"`는 기존에 없으므로 Y-a 승인된 낭독 추가다. 404는 비오류 EmptyState 형을 재사용하고 alert를 붙이지 않는다; 루트 h1/24·셸 p/18 보존 | `app/(edit)/error.tsx:21` · `app/(edit)/projects/[slug]/logs/error.tsx:32`; 루트 `app/error.tsx`·`app/not-found.tsx`는 RootFallback 껍데기 유지; 셸 404 둘은 EmptyState | 클라이언트 오류/서버 404 경계 유지 |
| **FieldError** | 선행 완료 — 재신설 없음 | `ui/form-group.tsx:71`, ui 밖 5호출/4파일(내부 FormGroup 포함6/5) | — |

⚠️ **POSTMORTEM 2026-09-15🔁 · 09-14**: 형제 export마다 소비자를 따로 세고(위 Card 행), 슬롯 유무에 따라 여백·선이 갈리는 곳은 코드 조건으로 쓴다 —
`connected-apps-card.tsx:137`(`first={index===0 && unconfirmed===null}`) · `token-card.tsx:156,158,234`(`afterAlert`) · `pending-invitations.tsx:161,177`(`first={index===0}`가 Alert를 무시 — 기존 결함 의심).
흡수 집합은 §9 JSX 실측과 위 export별 집합을 기준으로 한다. 선/슬롯은 두 상태를 모두 렌더해 검증한다.

**T12 → T13 임시 모듈 인계**: T12는 Card와 행 컨테이너 소비자를 `components/ui/card.tsx`로 이관하되 **`EmptyRowCard`는 `components/ui/row-card.tsx`에 그대로 남긴다**. 혼합 import는 분리하고, 빈형 소비자 8호출/7파일의 import·서버 경계를 유지한 상태로 T12 gate를 통과한다. `BannerLine`도 아직 그 모듈을 쓰므로 파일 전체를 지우지 않는다. T13이 빈형 소비자를 EmptyState/NoMatch로 모두 이관한 뒤 `EmptyRowCard` export를 제거한다. Card 머리선과 임시 빈형의 선이 겹치지 않는지 T12/T13 각각 검사하고, T13에서 필요 없어진 임시 선 보정만 걷는다.

**T12 식별자 검사**는 주석·테스트를 제외한 production AST에서 정확한 export/import binding·JSX 사용을 본다(별칭 import도 원래 export로 추적). T12 제거 대상은 `PanelCard`, `RowCard`, `PanelRows`, `RowCardList`, `RowCardItem`이다. `PanelRow`는 T16의 ListRow, `PanelFacts`는 별도 배치 슬롯, `BannerLine`은 남은 소비자 계약이 있어 이 검사에 섞지 않는다. `EmptyRowCard`는 부분 문자열로 잡지 않고 **T13의 별도 정확 식별자 검사**에서 0을 요구한다.


### 4.1 필드 셋 — 입력 · 콤보박스 · 드롭다운 트리거 (S12, 단위 ③)

**프리미티브 셋(Input·Textarea·SelectTrigger)은 이미 `fieldClass` 하나를 지난다**(`components/ui/input.tsx:17-21`). 어긋남은 **호출부와 손 트리거**에 있다.

| 대상 | 변경 | 흡수하는 손 사본 · 어긋남 |
|---|---|---|
| **FieldTrigger**(필드형 드롭다운 트리거) | `SelectTrigger`와 필터 `DropdownMenuTrigger`가 같은 형 하나 — `fieldClass` + `size`(md 36 · sm 28) + 뒤 글리프 + `active`(켜짐 = `border-foreground font-medium`). Radix 트리거에 `asChild`로 얹는다(자식 옆 글리프는 `Slot.Slottable` — POSTMORTEM 2026-09-09) | `translations/workspace/filter-menu.tsx:42`(md/sm 두 크기 — md 소비자 0, sm 2(`workspace:814`, `locale-panel:76`, 둘 다 align=end)) · `logs/log-filters.tsx:272`(주석이 "FilterMenu md와 같은 형"이라 적은 손 사본). 어긋남(§6.3): 테두리 이름 `border-border`↔`border-input`(값은 같다 — `globals.css:194,205`) · disabled `bg-accent`↔`bg-muted` · hover 면 유무 · 글리프 색 상속↔muted · 열림 글리프 뒤집기(`ChevronUp`) 유무 |
| **Input `size`** | md36(기본) · sm32(`h-8 text-xs`) · xs28(복사실패 칸) — 사본이 있는 크기만(S5) | `tree-panel.tsx:99` `h-8 … text-xs` · `project-switcher.tsx:117` `h-8` · `locale-panel.tsx:282` `h-7 text-xs` |
| **Input `variant="bare"`** | 메뉴 머리 안의 테두리 없는 필드 — 캐럿이 포커스를 말한다(링 없음, DESIGN:744) | `project-switcher.tsx:117` `border-0 px-1 shadow-none focus-visible:ring-0` |
| **Input 앞 글리프 · 지우기 슬롯** | `icon`(앞 글리프 자리·크기를 프리미티브가 든다) + `clearable`(뒤 지우기 = lucide `X` + Button `icon-xs`, 이름은 사전 키 하나). **브라우저 기본 지우기(`::-webkit-search-cancel-button`)는 `globals.css`에서 끈다** — 크롬·사파리만 그리고 모양이 브라우저 것이다(파이어폭스는 없다) | 검색 칸 셋의 글리프 자리가 셋 다 다르다: `search-input.tsx:46` `top-2.5 left-2 size-4` · `repo.tsx:171` `top-2.5 left-2.5 size-4` + `pr-2.5 pl-8` · `tree-panel.tsx:91` `top-2 left-2.5 size-3.5`. 기본 x가 서는 곳은 `type="search"` 둘(`search-input.tsx:48` · `tree-panel.tsx:93`) — `repo.tsx`는 `type="search"`가 아니라 x가 없다 |
| **SearchInput 지우기 = 검색 해제** | 지우기가 칸을 비우고 **`onSearch("")`까지** 부른다. ⚠️ **승인된 검색 동작 변경이다**(spec 비목표의 예외) — 지금은 기본 x가 칸만 비우고 결과는 옛 질의로 남는다(Enter만 제출). 즉시 필터형(tree·repo)은 `onChange`로 이미 풀린다 | `search-input.tsx:51-59`; 현행 Escape는 Enter guard가 걸러 처리하지 않음 → S15로 변경 |
| **Input 읽기 전용 형** | `read-only:` 한 형을 `Input`이 든다(`bg-muted` + 글자색 foreground(D4)). **`Textarea`는 제외** — 번역 셀의 `readOnly`는 이동 중 잠금이지 표시가 아니다(`workspace.tsx:850` · `locale-panel.tsx:124,213`) | `account/page.tsx:190` `bg-muted cursor-default` · `general-card.tsx:106` `bg-muted text-muted-foreground` · `locale-panel.tsx:282` 복사 실패 칸(무표시) |

**콤보박스 프리미티브는 만들지 않는다** — 지금 "검색 + 목록"은 스위처(`DropdownMenu` 재사용 — 2026-09-27 사용자, DESIGN:744)와 온보딩 repo(검색 칸 + `SelectRow` 목록) 둘이고 형이 다르다.
global-search의 `CommandDialog`가 셋째가 되면 그쪽이 판정한다. **제외**: 네이티브 date 동작을 가진 Input 둘(`log-filters.tsx:325,328` — DESIGN §6.68의 의도된 이탈),
`SelectContent`↔`DropdownMenuContent` 면은 같은 값이다. 다만 DropdownMenuContent 기본 collisionPadding=8(`ui/dropdown-menu.tsx`)과 SelectContent 미지정은 다르므로 D5 결정대로 Select에도 8을 준다.

### 4.2 포커스 링 — 테두리와 겹치지 않게 (S13, 단위 ③)

**지금**: 링 셋은 `ring-2`(box-shadow — 테두리 **바깥**)이고 회색 테두리가 그대로 남아, 테두리를 가진 컨트롤이 포커스를 받으면
**흰 면 | 회색 1px | 파랑 2px** 세 겹으로 보인다(`--input` #e5e5e5 · Checkbox·Radio `neutral-300` · `--ring` blue-400 `globals.css:235`).

**규약**: **테두리를 가진 포커스 대상은 포커스 때 테두리가 링 색이 되고 링은 1px 덧댄다** — `focus-visible:border-ring focus-visible:ring-1`.
테두리 1 + 링 1이 파랑 2px 한 띠로 읽혀 테두리 없는 컨트롤의 `ring-2`와 두께가 같다(2026-09-11 사용자 2px 결정 유지). 테두리 없는 것(Button primary·ghost·link · `ring-inset` 행)은 그대로다.

- **대상**: Input · Textarea · SelectTrigger/FieldTrigger · Button `default`(`button.tsx:79` `border-input`) · ButtonLink `default` · Checkbox(`checkbox.tsx:13`) · Radio(`radio.tsx:42`). `variant="bare"` Input은 링 없음 그대로.
- ⚠️ **오류 테두리가 포커스에 덮이지 않는다** — 지금 `aria-[invalid=true]:border-destructive`(`input.tsx:20`)는 링이 바깥이라 포커스 중에도 빨강이 보인다. 테두리를 링 색으로 바꾸면 빨강이 사라지므로, invalid면 포커스 중에도 **테두리·링 모두 destructive**다.
- ⚠️ **Checkbox·Radio의 checked 테두리**(`border-foreground`)도 포커스 중엔 링 색이 이긴다 — 포커스가 풀리면 돌아온다.
- **그물**: `focus-ring.test.ts`의 `RING`(해당 문구)이 둘이 된다 — 테두리형 {`focus-visible:ring-ring` · `focus-visible:ring-1` · `focus-visible:border-ring` · `focus-visible:outline-none`} / 무테형 기존 셋.
  어느 쪽인지는 **렌더된 클래스에 `border` 유틸이 있는가**로 테스트가 스스로 가른다(호출부가 고르지 않게). DESIGN §7 링 셋 문장이 함께 바뀐다.

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
- **이메일 hex 대조**: `lib/invitation-email/template.ts` hex ↔ `globals.css` 토큰(hsl → hex 변환). 짝 없는 `#262626`(`lib/invitation-email/template.ts` #262626)은 사유가 붙은 예외 목록.
  `message.ts:36-43 TONE_HEX`도 범위에 넣는다. 선례 `lib/invitation-email/__tests__/message.test.ts:353-390` 옆에 둔다.

### 5.4 렌더 계약 — 단위 ② 전에 현재 동작 고정
Select · Input · Textarea · Radio · ListItemButton · BannerLine · EmptyRowCard · EmptyState · Badge variant 전수 · Button(size·variant·busy/loading·스피너 14/16px). 단위 ②·③이 API를 바꿀 때 이 테스트를 **뒤집는다**
— 기대 문자열만 새 값으로 바꾸는 것은 복사다. 클래스 문자열 대신 상태 키·`data-tone`·슬롯 노드로 단언한다(ux-drift E 공통 규칙). 두 줄 본문은 textContent가 아니라 1·2번째 노드(POSTMORTEM 2026-09-16).

T5는 같은 기본 md·danger·busy 버튼의 두 실례를 API 변경 전에 고정한다: `settings/archive-card.tsx:112`의 selector override는 14px, `members/member-list.tsx:379`는 override 없이 16px(`ui/button.tsx:190` 기본). T9는 앞 사례를 `spinnerSize="sm"`으로, 뒤 사례는 기본값(또는 `spinnerSize="md"`)으로 바꾸며 **치수 기대값을 바꾸지 않는다**. loading·busy 양쪽에서 같은 API를 쓰고, 조상 selector가 영향을 주던 자식 Button까지 조사한다(`FileInput`·`ReconnectButton`은 실제 필요한 곳에서만 prop을 전달).

## 6. 토큰 · 교정 · 문서

### 6.1 값 변화 0 (철자 접기 — 단위 ①)
foreground `/2`·`/3`는 **0**으로 이미 정리됐다. 남은 동치 대상은 divider 철자(raw 13건에서 BannerLine 제외), `leading-[1.5]` 3건, `rounded-[4px]` 1건, `[overflow-wrap:anywhere]` 14건이다.
`tracking-[..]`는 기존 토큰과 값이 같은 곳만 접고 public-doc-table의 별도 값을 보존한다. 주석을 포함한 검색 수를 실제 교체 수로 쓰지 않는다.
**BannerLine 선은 제외**(`ui/row-card.tsx:173`): 투명 면 위의 알파 선과 불투명 divider는 값이 달라 D3이다.

### 6.2 토큰 (C5 — 서로 다른 3파일 이상)

이름은 기존 값만 표현하는 기계적 제안이다. **값은 바꾸지 않는다.** 먼저 @theme에 두고 소비자 치환·동치 테스트·DESIGN 등록을 같은 커밋에서 끝낸다.
횟수는 §9와 같은 주석 포함 rg 기준이며, 아래 증거 파일에는 실제 클래스 소비자가 있다.

| 확정 후보 이름 | 기존 값 | 건/파일 | 실제 소비자 증거(components/ 생략) |
|---|---|---|---|
| `--color-link` | blue-600 | 28/21 | `docs/classes.ts`, `projects/project-list.tsx`, `translations/workspace/locale-panel.tsx` |
| `--color-gray-light` | neutral-300 | 6/6 | `ui/checkbox.tsx`, `ui/radio.tsx`, `members/role-chip.tsx` |
| `--color-gray-dim` | neutral-400 | 27/15 | `home/meta-column.tsx`, `logs/event-detail.tsx`, `mcp/grant-badges.tsx` |
| `--color-gray-strong` | neutral-600 | 13/6 | `home/sync-button.tsx`, `translations/workspace/key-list.tsx`, `translations/workspace/tree-panel.tsx` |
| `--leading-body` | 1.6 | 33/21 | `changelog/release-entry.tsx`, `settings/ci-card.tsx`, `onboarding/steps/repo.tsx` |
| `--leading-prose` | 1.7 | 10/9 | `mcp/token-grant-fields.tsx`, `mcp/token-modal.tsx`, `oauth/consent-panel.tsx` |
| `--leading-translation` | 1.55 | 6/3 | `landing/mockup/translations.tsx`, `sources/source-detail-modal.tsx`, `translations/workspace/locale-panel.tsx` |
| `--spacing-row-y` | 13px | 32/21 | `logs/event-row.tsx`, `home/attention-card.tsx`, `sources/sources-screen.tsx` |
| `--spacing-copy-gap` | 3px | gap 16/16 + space-y 4/3 | `logs/event-row.tsx`, `settings/repository-card.tsx`, `sources/sources-screen.tsx` |
| `--spacing-modal-gutter` | 96px | 식 25/6 | `ui/modal.tsx`, `logs/event-dialog.tsx`, `publish-button.tsx` |
| `--container-form` | 640px | @max 35/8 | `settings/general-card.tsx`, `settings/repository-form.tsx`, `ui/panel-card.tsx`(@min도 같은 값) |
| `--spacing-shell-min` | 1280px | 9/6 | `app/(edit)/layout.tsx`, `onboarding/steps/files.tsx`, `public-shell/public-shell.tsx` |

**탈락**: `py-[11px]` 12건/**2파일**, `@max-[1016px]` 11건/**2파일**, `@max-[850px]` 8건/**1파일** — C5에 못 미쳐 raw 유지. 1.5 행간은 새 토큰 대신 `leading-normal`. 토큰을 지울 때 직접 클래스 소비자0인 색 일곱은 card/card-foreground/popover-foreground/secondary/secondary-foreground/accent-foreground/destructive-foreground이며 CSS 변수 직접 참조까지 T3가 다시 확인한다.
색은 해당 Tailwind 변수 값에 별칭을 건다(새 색/반올림 없음). 모달 식은 `calc(100svh-var(--spacing-modal-gutter))`; 컨테이너는 `@max-form`/`@min-form`으로 바꾸되 동치 컴파일로 원래 경계 연산자를 확인한다.

### 6.3 값이 바뀌는 곳 — 결정표 (S7 · 단위 ③)

**이 표에 없는 모양 변화는 결함이다.** S11은 번역·Logs·Home 우선이고 판정 근거는 D번호로 남긴다. 지휘자가 기존 결정을 적용한 D2–D7은 추가 사용자 답변으로 기록하지 않는다.

| 대상 | 실측 전 | 후 / 상태 | 근거 |
|---|---|---|---|
| 누르는 행 세로 패딩 | 다섯 모두 13px | 13px 유지 — 값 변경 삭제 | ux-drift 선행 완료 |
| 행 hover | 카드 2%, 캔버스 3%; disabled 행은 없음 | 그대로 유지, aria-disabled guard도 보존 | DESIGN §5 · TTR |
| 행 포커스 | 카드 5형 중 inset 3(ci·sources·projects), 바깥 2(Logs·Home); 트리/키 목록 inset | overflow 경계에서 inset, 그 밖 기존 바깥 링 유지 | 잘림을 막는 기존 근거 — 시각 통일 명목 변경 없음 |
| 행 본문 | attention gap 2px, 나머지 3px; project 보조줄 이미 text-xs | gap 3px, Home 문장 순서 유지(D2b) | 지휘자: 기존 두줄 토큰+Logs 기준 적용 |
| 행 chevron | Sources만 버튼 밖(이미 muted) | 버튼 안 — 기존 통합 설계; 키보드 클릭 영역 검증 | C6 |
| EmptyState / EmptyRowCard | page 제목18/간격4, card/inset 제목15/간격6 | placement별 현재 값 유지: page py48; card px24 py48 gap14; inset p32 gap10 | Home·Logs 모두 기존 형 보존(S11); 설명 타입 ReactNode |
| NoMatch | 번역 목록은 글자 블록, repo는 Search | SearchX 칩(D2a) | 지휘자: 기존 승인 SearchX 설계 적용 |
| Card 머리 선 | RowCard 자식이 첫 선 | 머리가 선 1개; aria-labelledby·flex-wrap | C1 |
| BannerLine 선 | 2% 면 위 6% 알파 선 | 기존 알파 유지(D3), 값변경 대상에서 제외 | S11 projects/members 기존 값 보존 |
| Facts 라벨 / 폭 | Home neutral-400, token·source 등 muted; 96·120·104px 및 세로 셀 | Y5 승인: neutral-400. 폭/의미론은 자리별 유지(96·120·104 + stacked) | 폭 통일은 사전 결정 없음; 기존 레이아웃 보존 |
| Popover | 이미 shadow-md, z20 | z50, shadow-md 유지 | Y4 · DESIGN §4.5 |
| LargeModal 높이 | event-dialog도 이미 100svh | 단위 교체 없음; 치수 상수 공유만 | `logs/event-dialog.tsx:63` |
| Skeleton radius | ui 밖 93호출, 미지정14, rounded-md45 | 기본4px + 명시 radius 유지; md 제거하지 않음 | ①② 값0, 미사용 API 추가 없음 |
| 링크 버튼 링 / 인라인 링 | 없음 4 / 7 | 링 추가 | 승인된 접근성 교정 |
| token-grant-fields | ul group + 손 span radio | SelectRow 역할 + 키보드 동작 계약 | 기존 a11y 설계 |
| 필드 트리거 | FilterMenu hover primary-foreground, disabled accent, 글리프 상속/열림 반전; Select muted/고정 | FilterMenu 형을 md/sm 공통으로, active/aria-disabled 보존(D4a) | S11 번역 sm 트리거 우선 |
| 검색 글리프 / 지우기 | 세 벌; SearchInput은 칸만 비워짐 | Input icon·X 슬롯, 명시 지우기 onSearch("") | S12 승인; Escape도 S15 승인 |
| 읽기 전용 Input | account 기본색, general muted색, 복사실패 기본색 | bg-muted + foreground(번역 복사실패 가독성, D4b) | S11 번역 우선; Textarea 읽기잠금 제외 |
| 필드 Input 크기 | h36·h32 외 복사실패 h28 있음 | md36/sm32/xs28 보존 | `locale-panel.tsx:282`; xs는 실소비자1이라 S5 충족 |
| 팝업 collisionPadding | DropdownMenu 8, Select 미지정 | Select도 8(D5) | TTR 화면 끝 배치, 시각 배치 변경 |
| 오류 낭독 | edit·logs EmptyState에 alert 없음 | ErrorState role=alert 추가, 404 비live 유지(D6) | Y-a가 이미 role=alert를 승인; 기존 낭독 보존이라고 하지 않는다 |
| 테두리 포커스 링 | 회색1 + 파랑2 | 테두리 파랑 + 링1; invalid는 둘 다 destructive | S13의 기존 border-ring+ring1 설계 적용 |

### 6.4 문서 교정 (T4·T21)
- **DESIGN**: 체크리스트 bare rounded=4px는 선행 교정 완료(재수정 제외) · Breadcrumb 소비자(삭제) · RowCard 소비자·치수(→ Card) · EntityCard 소비자 · Avatar 프로젝트 형 ·
  danger disabled hover · EmptyState 대기 초대 · `rounded-3xl` 개수 · 자간 "아홉"(· → 8) · §2 토큰 표(`divider` 행 누락 + 새 토큰) · §2.1(accent=secondary=muted) ·
  §6.2 등재 목록·`REGISTERED` · §6.3 링크 색 · §6.8 아이콘 무채 계단 · §6.625 메일 hex 표 · §8 API 규약 표(§3) · BannerLine 선 ·
  §6.4 입력 행(FieldTrigger · `size`·`bare`·슬롯 · 읽기 전용 형 · 기본 지우기 끔) · **§7 포커스 링 셋(— 테두리형 넷 / 무테형 셋, §4.2)** · 스위처 입력 → `Input variant="bare"`.
- **`globals.css` 주석**: `#e2e8f0`(`:37,196,201`) · "소비자 66곳".
- **CLAUDE.md**: UI 행 30개는 현재와 일치(이 기능 뒤 다시 셈) · "Radix 여섯"(+Popover) · 작업 원칙에 `ui-primitives-first` 예외 한 줄(spec 원칙 — 손 사본이 실재하는 형은 선반영이 아니다).
- **DIRECTORY**: 새 프리미티브·이동 파일(`hue.ts` · `search-input` · `copy-button` · `large-modal`).
- **global-search 문서**: 이 기능 종료를 착수 조건으로 들고 §3 규약·재사용 단위(`LargeModal` 치수 상수 · `Input` 글리프 슬롯 · `NoMatch` · `hand-copies.test.ts`)를 이미 적었다(2026-10-01 반영). T21은 그 이름들이 이 기능의 실제 산출물 이름과 같은지만 대조한다. `FieldButton` 폭은 prop 없음(위 §3 폭 행).
- 문서 줄 번호 대신 절·문구로 조회한다. DESIGN §7 링 문장은 현재 :1971, 체크리스트 :2107; 옛 숫자 참조는 위치 근거로 쓰지 않는다.

## 6.5 스키마 · 환경변수 · 불변식 · 경계

- **스키마·환경변수 없음.**
- **불변식 영향 없음** — export 결정성·blob SHA·인증 경계를 건드리지 않는다(`middleware.ts` · `lib/adapters/shared.ts` · `lib/githash.ts`는 `components/`·canon을 import하지 않는다).
  `lib/` 상태 판정 함수의 의미는 바꾸지 않는다 — StateVariant 타입/리터럴과 결과→StateKey 변환은 T7 범위이며 모듈 개명은 아바타 해시 `lib/tone.ts` → `lib/hue.ts` 하나다(Y7).
- **클라이언트 그래프** — `client-graph.test.ts`는 도달 가능한 `lib/**`를 `CLIENT_LIB_FILES`와 **정확 일치**로 비교한다(`:464-468`, canon 도달 집합 `:414-418`).
  `lib/hue.ts` 개명과 `StateKey` 변환 함수 추가가 이 목록을 바꾼다 — 잎만(POSTMORTEM 2026-09-07).
- **서버/클라이언트 경계**(RSC 직렬화 — `pnpm build`만 잡는다):

  | 서버 호환(지시문·훅 없음) | 클라이언트 |
  |---|---|
  | EmptyState · NoMatch(`href` 출구) · Skeleton · Link · ButtonLink · ProjectThumbnail · ListRow(`onClick` 형은 클라이언트 소비자만) · Facts · Meter | Card(`useId`) · LargeModal · Popover · SelectRow · SearchInput · FieldTrigger · CopyButton · SecretField · ErrorState(`retry`) |

- **게이트 트리거**: `lib/__tests__/`(`globals-css.test.ts`)·`lib/invitation-email/`을 건드리는 커밋은 `scripts/gate-plan.ts`가 postgres 스위트를 붙인다(로컬 postgres 필요).

## 7. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| ux-drift design:163처럼 ListRow·NoMatch·SecretField·ErrorState를 만들지 않는다 | 사용자 원칙 `ui-primitives-first`(2026-10-01)가 뒤집었다 — 손 사본이 실재하면 추상화가 아니라 중복 제거다(S5) |
| 한 기능·한 흐름으로 간다 | 100파일 이상 · 25개 프리미티브 작업이 한 번에 나가면 red 원인을 가를 수 없다(S3) |
| PanelCard·RowCard를 두고 슬롯 이름만 맞춘다 | 껍데기·머리가 같고 슬롯만 갈려 소비자가 없는 슬롯을 Alert로 우회한다(C1) |
| Badge가 `tone`을 직접 받는다 | `muted`가 면·글자 두 모양으로 갈리고 상태 아닌 배지가 많아 매핑이 호출부로 흩어진다(S6) |
| 전 프리미티브 rest props · `data-tone` | data-*만 위한 래퍼 실수요가 입증되지 않음 — 사본 없는 축은 선반영이다(S5) |
| `event-dialog`를 LargeModal에 흡수 | 서버 헤더·id 복귀 어댑터가 필요해 껍데기가 커진다(C2) |
| Skeleton 기본 radius를 `rounded-md`로 | 지정 없는 14곳의 값이 바뀐다 — 값 변화 0 원칙과 충돌 |
| 아이콘 버튼 두 크기(28·36) | 24·32 소비자의 값이 바뀐다(Y6) |
| 콤보박스 프리미티브 신설 | "검색 + 목록" 둘(스위처·repo)의 형이 다르고, 스위처는 사용자가 `DropdownMenu` 재사용을 골랐다(2026-09-27) — 셋째(global-search)가 판정한다(S12) |
| 포커스 링을 `ring-inset`이나 음수 `outline-offset`으로 테두리 위에 겹친다 | 테두리 색이 그대로라 겹침만 안쪽으로 옮겨진다 · `focus-ring.test.ts`의 여는 태그 리터럴 규칙과 따로 논다 — 테두리를 링 색으로 바꾸는 쪽이 한 띠로 읽힌다(S13) |
| 링을 2px 그대로 두고 테두리만 링 색 | 한 띠가 3px로 두꺼워져 테두리 없는 컨트롤(2px)과 갈린다(S13) |
| computed style 스냅샷 diff 도구 | 새 도구를 만들어야 한다 — 단위 ①은 컴파일 동치, ③은 결정표 + 수동으로 충분(S10) |

## 8. 결정 기록 (2026-10-02)

추가 사용자 선택은 모두 답을 받았다. **구현·검증 완료를 뜻하지 않는다.** S14·S15만 새 사용자 답변이며 나머지는 지휘자가 기존 결정의 적용으로 판정했다.

| ID | 결과 | 출처 |
|---|---|---|
| D1 | 비조합·값 있음 Escape는 X처럼 입력+검색 해제(onSearch 빈값1회), 빈 입력 Escape는 상위 팝업으로 | **사용자 S15 “검색 해제”** |
| D2a | NoMatch SearchX 칩 | 지휘자: 기존 승인된 §4/§6.3 설계 적용 |
| D2b | 행 두줄 gap3, Home 문장 순서 유지 | 지휘자: 기존 두줄 간격 토큰·Logs 기준 |
| D3 | BannerLine 알파 선 유지; 불투명 divider로 바꾸지 않음 | 지휘자: 값 보존·Y-a |
| D4a | FilterMenu hover/disabled/상속색+열림 반전으로 FieldTrigger 통일 | 지휘자: S11 번역 화면 우선 |
| D4b | readonly Input bg-muted + foreground | 지휘자: S11 번역 복사실패 소비자 우선 |
| D5 | Select collisionPadding=8 | 지휘자: TTR 배치 지침 적용 |
| D6 | ErrorState role=alert, retry 계약 유지 | 기존 **Y-a** 승인, 현재 소스에는 없으므로 신규 낭독 |
| D7 | 테두리형 border-ring+ring1, invalid 둘 다 destructive | 기존 **S13** 설계 적용 |

기계적 결정: Badge text/soft-neutral/soft-green/soft-amber/soft-red(값0), width 수치 목록, C5 토큰 목록, placement 현재 page13/card2/inset6, Skeleton 기본4px 유지. NoMatch·오류 래퍼로 이관해도 원래 배치와 서버 경계를 보존한다.

## 9. 재현 명령·실측 (aed73f32)

다음 명령은 **주석 포함 문자열 출현 수**다. JSX 호출 수는 TypeScript AST(`require("ts-morph").ts`)로 opening/self-closing 태그를 세며 `components/ui/` 정의 내부·테스트를 제외했다. 두 단위를 섞지 않는다.

```sh
c(){ rg -o -g '!**/__tests__/**' -g '!*.test.*' -e "$1" app components lib messages | wc -l; }
f(){ rg -l -g '!**/__tests__/**' -g '!*.test.*' -e "$1" app components lib messages | wc -l; }
```

| 패턴 | 출현 수 / 파일 수 |
|---|---|
| `py-\[13px\]` · `py-\[11px\]` | 32/21 · 12/2 |
| `gap-\[3px\]` · `space-y-\[3px\]` | 16/16 · 4/3 |
| `text-blue-600` | 28/21 |
| `leading-\[1\.6\]` · `leading-\[1\.7\]` · `leading-\[1\.55\]` · `leading-\[1\.5\]` | 33/21 · 10/9 · 6/3 · 3/3 |
| `calc\(100svh-96px\)` · `@max-\[640px\]` · `min-w-\[1280px\]` | 25/6 · 35/8 · 9/6 |
| `@max-\[1016px\]` · `@max-\[850px\]` | 11/2 · 8/1 |
| `\[overflow-wrap:anywhere\]` · `rounded-\[4px\]` | 14/9 · 1/1 |
| `\[&_\.animate-spin\]:size-` | 11/6 |
| `foreground/[23]\b` · `foreground/\[0\.06\]\|ring-foreground/6\b`(뒤 패턴은 regex OR) | 0/0 · 13/8 |
| `neutral-(300\|400\|600)`(regex OR) | 46/21 |
| `className=\{buttonClass\(` | 12/6 — a/Link 5와 mockup span 7。링크 총수가 아님 |
| `rg --files app -g loading.tsx` | 8, role="status" 누락0 |
| `rg --files components/ui -g '*.tsx'` | 30 |

**폭 분포(실제 클래스)**: 132(member-list:306), 160(base-language-form:51/add-sources-modal:158), 168(invite-modal:350), 192(files:352/surface-selector:18/locale-panel:282), 220(repo:336,348), 240(repository-form:105,110), 256(SearchInput 기본), 320(app/(edit)/account/page.tsx:185/profile-name-form:69/general-card:90,106/SearchInput 소비자2), full(Input8·Select2). `max-w-sm`은 naming:193의 외부 래퍼 상한, responsive min/max/flex는 wrapper가 유지한다. 스위처·초대 flex 필드는 수치폭을 신설하지 않는다.

**placement 목록**: page13 = edit 오류1 + 셸404둘 + project-not-ready1 + project-archived1 + Logs empty/error3 + repo2 + files preview1 + workspace detail2. card2 = empty-projects:30,55. inset6 = token-card:156, connected-apps-card:149, attention-card:71, logs-card:38, sources-screen:93, pending-invitations:170. NoMatch 새 번역 목록 슬롯은 현재21에 더해질 신규 소비자1이므로 이 수에 섞지 않는다.
