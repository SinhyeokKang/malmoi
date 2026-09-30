# component-unify — design

## 1. 영향 받는 흐름

**편집 UI · 공개 셸 · 랜딩 · 로그인 · 초대 메일 템플릿(hex 대조만)** — 형과 이름만 옮긴다. push·pull·export·어댑터·판정(`lib/`의 순수 함수)·
사전 문구는 건드리지 않는다. `lib/`는 Tailwind를 모른다는 규칙(`components/ui/tone.ts`)은 그대로다 — 새 클래스 맵은 전부 `components/ui/`.

## 2. 층과 순서

토큰(값) → 프리미티브 API 규약(이름) → 형제 통합 → 새 프리미티브 → 소비자 이관 → 그물. **값을 먼저 고정하는 이유**: 토큰이 서야 프리미티브가 raw 값 대신
토큰을 들고, 이관 뒤 "렌더 결과 동일"을 판정할 기준이 생긴다. 이관은 프리미티브를 만든 **같은 커밋**에서 한다(S2 — 형이 두 벌로 남는 창을 만들지 않는다).

## 3. API 규약 (전 프리미티브)

| 축 | 규약 | 지금 어긋난 곳 |
|---|---|---|
| 상태 색 | `tone: StateTone`(`lib/status/canon.ts` — success·muted·warning·danger) | Alert·Badge `variant`에 상태가 섞임 · BannerLine `tone`(muted/warning/danger) · PanelRow `statusTone` · `Note tone` |
| 형태 | `variant` — 상태가 아닌 모양(Button primary/default/danger/ghost/link · Badge 면/글자) | Badge `muted`(글자)·`neutral`(면)이 상태 이름을 빌림 · `missing`이 danger 자리 |
| 아바타 색 | `toneFill` → **`hueFill`**(이름만) — "tone"은 상태 하나의 뜻 | `components/ui/tone.ts:29` |
| 크기 | `size` — 문자 스케일 `sm/md/lg` + 아이콘 버튼 `icon-sm/icon-md`(28/36). 숫자 크기는 Avatar(사진 규격)만 | Alert `default/compact` · SkeletonLine `text=` · 아이콘 버튼 네 벌 손 조립 |
| 폭 | 입력류(Input·SelectTrigger·SearchInput)에 `width` prop(토큰 급 몇 개) 또는 `className`의 폭만 허용 | 100% 덮어쓰기 |
| 진행 | `busy`(클릭 차단 + aria-busy) / `loading`(표시만). 앞 글리프 교체는 Button이 든다(ux-drift U3) | `nextPending`(Modal) · 손 삼항 7곳 · `{!pending && <Icon/>}` 4곳 |
| 슬롯 | 동작 `action`(하나)·`actions`(여럿) · 설명 `description` · 개수 `count`+`countLabel` · 알림 `notice` · 글리프 `icon` | `footer`(Dialog 버튼 / Modal 문장) · `headerAction` · `subtitle`·`secondary`·`detail` · `glyph`·`leading` |
| rest props | 전 프리미티브가 루트 요소에 `...rest`(data-*·aria-*)를 넘긴다 | Badge·Alert·EmptyState·PanelCard·RowCard·Skeleton·EntityCard·Avatar |
| 테스트 표식 | 상태 색을 가진 프리미티브는 `data-tone`을 단다 | Badge·Button·BannerLine에 없음 |
| a11y 철자 | `aria-describedby`·`aria-labelledby` 그대로 받는다(camel 별칭 금지). FormGroup은 만든 `-error`/`-help` id를 자식에 연결한다 | SegmentedControl `describedBy` · RowCardList `labelledBy` · `form-group.tsx:45,54-56` |
| className 이름 | `className` 하나. 부위별이 필요하면 슬롯 컴포넌트로 | `panelClassName` · `labelClassName` · `fallbackClassName` · `inputClassName` |

규약 표는 DESIGN §8(className & 변형)로 올린다(T-doc).

## 4. 프리미티브 — 통합 · 신설 · 이관

| 대상 | 변경 | 흡수하는 손 사본 · 형제 |
|---|---|---|
| **Card**(`PanelCard`+`RowCard`) | 머리 슬롯의 합집합 하나(`title`·`description`·`count`·`action`·`notice`·`titleId`) + 본문 `CardRows`(비대화형) / `CardList`(행 목록). 이름은 확인 필요(§7 C1) | RowCard의 notice 부재로 children에 넣은 Alert(`connected-apps-card:137` · `member-list:217`) |
| **ListRow**(`PanelRow` 확장) | `href`/`onClick`/정적 세 형, 글리프·두 줄 본문(`gap-[3px]` → 토큰)·보조줄 13·chevron muted·hover 2% | 누르는 행 5형 · 정적 행 2 · 두 줄 본문 14곳 · Button을 행으로 늘린 3곳(`ci-card:25` · `sources-screen:108` · `files.tsx:205`) · `ListItemButton`(100% 덮어쓰기) |
| **SelectRow**(온보딩 선택 목록) | 선택 면·앞뒤 선 규칙을 든 라디오형 행 | `files.tsx:194` · `repo.tsx:228` · `naming.tsx:242` · `token-grant-fields.tsx:127` |
| **EmptyState**(+`EmptyRowCard`) | `placement: "page" \| "card" \| "inset"` 하나. 아이콘·설명 타입 통일 | `EmptyRowCard` · Home 카드 안 `EmptyState` + className(`attention-card:66` · `logs-card:37`) |
| **NoMatch** | `EmptyState` 위의 얇은 형 — 아이콘 `SearchX` 고정, 출구 `Clear search`/`Clear filters` 둘 | `logs/page:111` · `empty-projects:55,67` · `repo.tsx:188` · `workspace.tsx:578` · `project-list:206` |
| **ArchivedNotice** | 모양 결정 후(§7 C3) 한 형 | `project-archived:35` · `sources-archived:22` · `logs/page:181` · `home/actions:275` · `attention-card:69` |
| **ErrorState** | 오류 경계 한 형(`EmptyState` + `CircleAlert` + Retry) · 404 형 | `(edit)/error.tsx` · `logs/error.tsx` · not-found 2 |
| **SecretField** | 값(mono·select-all) + `CopyButton` | `push-token-panel:98` · `onboarding/steps/result.tsx:21` · `mcp/token-modal.tsx:139` |
| **CopyButton** | `components/onboarding/` → `components/ui/` 이동 | 손 조립 `docs/code-block:42` · `locale-panel:287` |
| **Facts**(`PanelFacts` 확장) | 라벨 muted 한 형 + 컨테이너 `grid`(라벨 폭 급) · `inline` 두 형 | `meta-column:67` · `token-card:236` · `connected-apps-card:240` · `general-card:45,80,98` · `account/page:166-176` · `event-detail:115-186` · `source-detail-modal:90` |
| **Meter** | 트랙 + 완료·검토 조각 | `locale-meter:47-49` · `source-detail-modal:160-162` |
| **LargeModal**(`OnboardingModal` 개명) | 1024 껍데기만 남기고 wizard 바닥(`step`·`next*`·`showBack`·`onBack`·`announce`·`bodyDirection`)을 `WizardFooter`로 뗀다. `headerAction`(0) 삭제 | `logs/event-dialog.tsx:52-79` 손 껍데기 · `100vh`↔`100svh` |
| **Popover** | 번역 화면 손 팝오버 하나 — DropdownMenu 층(`shadow-md`·z)과 맞춘다 | `workspace.tsx:942` |
| **ButtonLink `external`** | `target=_blank`·`rel`·외부 글리프 규칙 + 포커스 링 | `<a className={buttonClass()}>` 6곳(링 누락) · 랜딩 목업 `<span>` 7개는 비대화형이라 제외 |
| **Button `size="icon-*"`** | 아이콘 전용 28·36 | `project-switcher:92` · `key-list:89` · `sources-screen:92` · `user-menu:61` · `invite-modal:356` |
| **Button 스피너 크기** | `size`가 스피너 크기를 정한다 | `[&_.animate-spin]:size-3.5` 11곳 |
| **ProjectThumbnail**(`ImageTile`+`hueFill`) | 크기 prop으로 세 벌을 하나로. `Avatar shape="square"`(0)은 결정대로(§7 C4) | `project-thumbnail:45` · `invite/project-card:45` · `general-card:48` |
| **SearchInput** | `components/ui/`로 이동, 글리프 슬롯을 `Input`에 | 손 검색 칸 `repo.tsx:170` · `tree-panel:51`(계약이 달라 즉시 필터 형은 prop으로) |
| **Skeleton** | 기본 radius `rounded-md`(96 중 60), `SkeletonLine` 재구현 흡수 | `members/loading:64` · `sources/loading:59` |
| **Badge 래퍼 셋** | `StatusBadge`(ux-drift) 하나로 — `ResultBadge`·`SourceStatus`의 VARIANT 맵과 span 래퍼 삭제 | `result-badge.tsx` · `source-status.tsx` · `event-detail:127` |
| **FieldError** | ux-drift T22가 `form-group.tsx`에서 뗀 오류 줄 — 규약(§3 a11y)만 맞춘다 | — |
| **Link** | 문장 안 인라인 링크 형(파랑 + 링) — 상수 `DOC_LINK`(`components/docs/classes.ts:7`)를 프리미티브로 | `text-blue-600` 인라인 16곳 |
| **sr 상태 줄** | 프리미티브가 아니라 glob 테스트(`loading.tsx`마다 `role="status"` 한 줄) | 13곳 |

⚠️ **POSTMORTEM 2026-09-15🔁 · 09-14**: 형제 export마다 소비자를 따로 세고, 슬롯 유무에 따라 여백이 갈리는 곳은 코드 조건으로 쓴다. 표의 "흡수" 열이 곧 전수 목록이고
T0 재조사가 갱신한다.

## 5. 그물 (테스트)

- **새 프리미티브마다 "ui 밖 사본 0" 소스 스캔**(관용구: `icon-tile.test.tsx:41,62`) + 메모리 카나리아 + 스캔 대상 수 하한(POSTMORTEM 2026-09-18·09-14).
- **API 규약 스캔** — §3 표의 행마다: `components/ui/*.tsx`의 export props에 금지 이름(`statusTone`·`describedBy`·`*ClassName`·`subtitle` …) 0,
  rest props 전달(렌더해 `data-x`가 루트에 붙는지), `data-tone` 존재.
- **렌더 계약 테스트 공백 메우기**: Select · Input · Textarea · Radio · ListRow · BannerLine · EmptyState(placement 셋) · Badge variant · Button(size·variant·busy).
- **토큰 스캔**(`visual-system.test.ts` 확장): 같은 값 두 철자 0, 확정 토큰 값의 raw 사용 0, `lib`·`messages`도 스캔, 접두 `border-t-`·`placeholder-`·`caret-`·`accent-` 포함.
- **이메일 hex 대조**: `lib/invitation-email/template.ts`의 hex가 `globals.css` 토큰 값과 같다(생성기 없이 대조만 — CSS 변수를 못 쓰는 매체라서).

## 6. 토큰 · 문서 교정

### 6.1 값 변화 0 (철자 접기)
foreground 알파 `/2`·`/3` 11건 → 괄호 철자 · `border-foreground/[0.06]`·`ring-foreground/6` 10건 → `divider` · `leading-[1.5]` 3 → `leading-normal` ·
`rounded-[4px]` → `rounded` · 토큰 자간 재기술 `tracking-[..]` 8 삭제 · `[overflow-wrap:anywhere]` 14 → `wrap-anywhere` · 중복 `<style>body{…}`(`public-shell:46` · `auth-layout:48`) 하나로.

### 6.2 토큰 후보 (§7 C5에서 확정)
`--color-link`(파랑 31) · 회색 3단(neutral-300/400/600, 51) · `--leading-body`/`--leading-tight`(1.6 33 · 1.7 15 · 1.55 7) · 행 패딩(`py-[13px]` 25 · `[11px]` 12) ·
두 줄 간격(`gap-[3px]` 19) · 모달 gutter(`calc(100svh-96px)` 24) · 컨테이너(`@max-[640px]` 36 · `[1016px]` 12 · `[850px]` 8) · 셸 최소폭 1280(3).

### 6.3 값이 바뀌는 곳 (규칙 위반 교정 — ux-drift가 이미 고친 것은 T0이 뺀다)
`event-dialog.tsx:63` `100vh` → `100svh` · 팝오버 shadow 두 형 → 하나 · 닫기 버튼 3형(ux-drift `CloseButton`이 흡수했는지 T0 확인) ·
Sources 행 hover `/2`·`/5` · `source-detail-modal:168` 배지 글리프 · 외부 링크 버튼 포커스 링 6곳.

### 6.4 문서 교정
DESIGN: 체크리스트 bare `rounded` = 12(실제 4px) · `:35` Breadcrumb 소비자 · `:672` RowCard 소비자·치수 · `:673` EntityCard 소비자 · `:675` Avatar 프로젝트 형 ·
`:651` danger disabled hover · `:681` EmptyState 대기 초대 · `rounded-3xl` 개수 · §2.1(accent=secondary=muted — 토큰 정리 결과로 갱신).
`globals.css` 주석: `#e2e8f0`(두 곳) · "소비자 66곳". DIRECTORY: 새 프리미티브·이동 파일. (줄 번호는 1e0a5f57 기준 — ux-drift T29 뒤 재확인.)

## 6.5 스키마 · 환경변수 · 불변식

- **스키마·환경변수 없음.**
- **불변식 영향 없음** — export 결정성·blob SHA·인증 경계를 건드리지 않는다. `lib/` 판정 함수는 이름을 바꾸지 않는다(`StateTone` 소비만).
- **클라이언트 그래프** — `components/ui/`의 새 파일이 `lib/`를 물면 `lib/status/canon.ts`처럼 잎만(POSTMORTEM 2026-09-07). `client-graph.test.ts`가 센다.

## 7. 확인 필요 (spec "사용자 결정"에 답을 적는다)

| # | 질문 | 추천 | 이유 |
|---|---|---|---|
| C1 | `PanelCard`·`RowCard`를 하나(`Card`)로 합치나, 둘을 두고 슬롯 이름만 맞추나 | **합친다** | 껍데기·머리가 같고 슬롯만 갈려 소비자가 없는 슬롯을 Alert로 우회한다 |
| C2 | `OnboardingModal`을 `LargeModal`로 개명하고 wizard 바닥을 떼나 | **뗀다** | 소비자 6/7이 온보딩이 아니고 wizard prop 9개는 한 곳만 쓴다 |
| C3 | 보관 표시 모양 — 전면(`project-archived`) · 머리 배지+카드 · 인라인 Alert 중 무엇으로 하나 | 확인 필요 | 제품 판정이다(DESIGN §6.69) — 화면 성격(전면 거부 vs 읽기 전용)으로 두 형이 맞을 수도 있다 |
| C4 | 소비자 0 — `Breadcrumb` · `SegmentedLinks` · `Avatar square` · `@theme` 색 7개 — 지우나 | **지운다** | 이 기능의 목적이 정리다. CLAUDE.md "dead code는 언급만"은 무관한 변경에서의 규칙이다 |
| C5 | 토큰 후보(§6.2) 중 무엇을 토큰으로 올리나 | **3파일 이상 같은 값만** | 화면 고유 치수까지 토큰화하면 이름만 늘어난다 |
| C6 | Button의 행 확장 용법(3곳)을 `ListRow`로 옮기나 | **옮긴다** | Button의 크기·radius·padding을 전부 덮어 쓰는 것은 다른 역할이다 |
