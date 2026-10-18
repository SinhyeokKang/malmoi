# inbox-filter-search — design

> 2026-10-18 `/feature-review` 반영 — §2(묶음·어휘)·§5(MarkSeen)는 사용자가 결정했다.

## 영향 받는 흐름

**편집 UI 하나** — `/inbox` 페이지. push·pull·export·게이트 무관. 조회(`loadAttentionInbox`)는 바꾸지 않는다. Logs·번역 화면은 필터 트리거 이관만 받는다(동작 불변).

| 층 | 파일 | 변경 |
|---|---|---|
| 쿼리 목록 규칙(순수, 잎) | `lib/query-list.ts`(새) | `lib/events/filter.ts`의 비공개 `list()`·`text()`와 `encodeList`·`MAX_TEXT`·`MAX_ITEMS`를 글자 그대로 옮긴다. events가 이것을 import한다(동작 불변) |
| 필터 모델(순수, 잎) | `lib/inbox/filter.ts`(새) | `InboxFilter` · `InboxKindFilter` · `inboxKindOf(item)` · `parseInboxFilter(params)` · `inboxQuery(filter)` · `inboxFilterOptions(plan)` · `effectiveInboxFilter(filter, options)` · `hasNarrowing(filter)` · `filterInbox(plan, filter)`. `lib/inbox/plan.ts`는 `import type`만 한다 |
| 필터 트리거 프리미티브 | `components/ui/filter-menu.tsx`(새, 이관) | Logs `log-filters.tsx`의 지역 `Filter`와 번역 화면 `components/translations/workspace/filter-menu.tsx`의 `FilterMenu` 껍데기를 하나로 모은다(§7) |
| 필터 줄 | `components/inbox/inbox-filters.tsx`(새, `"use client"`) | 종류 · 프로젝트 · Clear · SearchInput. `router.push(routes.inbox(query))` |
| 페이지 | `app/(edit)/inbox/page.tsx` | `searchParams` → `parseInboxFilter` → 계획 → `inboxFilterOptions` → `effectiveInboxFilter` → `filterInbox` → `InboxList`. 빈 결과면 `NoMatch`. `MarkSeen`은 늘 렌더 |
| 골격 | `app/(edit)/inbox/loading.tsx` | 필터 줄 예약(§6) |
| 목록 | `components/inbox/inbox-list.tsx` | 받은 계획을 그린다(변경 최소) |
| 경로 | `lib/routes.ts` | `routes.inbox(query = {})` — `withQuery("/inbox", query)`. "쿼리가 없다" 주석을 고친다. 기존 호출부 `routes.inbox()`는 그대로 동작한다 |
| 사전 | `messages/{en,ko,es}.tsx` | `inbox.filters.*` · `inbox.search.*` · `inbox.noMatch.*`(§2·§6의 새 키) |

## 1. 필터 모델 — Logs와 같은 형

```ts
type InboxKindFilter = "publish" | "review" | "untranslated" | "sync_failed" | "partial" | "disconnected" | "setup";
type InboxFilter = { kind: InboxKindFilter | null; projects: string[]; q: string | null }; // null = All items
```

- **URL이 정본**(Logs 결정과 같다) — `?kind=review` · `?project=web-app,docs` · `?q=ja`. 프로젝트는 **slug**다(사람이 읽고 공유하는 자리 — Logs `sources`와 같은 판단). `?q=`를 URL에 싣는 것은 Logs·Translations 선례를 따른다 — 페이지 안의 좁힘이라 공유·뒤로 가기가 목적이다(전역 검색의 "검색어를 URL에 남기지 않는다"와 다른 자리다).
- 목록·글자 규칙은 `lib/query-list.ts` 하나다 — 반복 파라미터는 첫 값, 목록은 쉼표 · 정렬 · 중복 제거 · 개수 상한 `MAX_ITEMS`(50) · 항목·`q` 길이 상한 `MAX_TEXT`(200) · trim 후 빈 문자열은 `null`. inbox가 `lib/events/*`를 import하지 않는다(도메인 분리).
- `kind`는 `INBOX_KIND_FILTERS` 배열의 `includes`로만 받는다. 알 수 없는 `kind`는 `null`이다.
- ⚠️ 남이 정한 키는 **slug**다 — 계획 묶음과의 대조는 `Set`/배열 `includes`로 하고, `Record<slug, …>` 평범한 객체 조회를 쓰지 않는다(CLAUDE.md 코드 컨벤션). slug 대조는 정확 일치(대소문자 구별)다.
- **실효 필터** — `effectiveInboxFilter(filter, inboxFilterOptions(plan))`가 원래 계획에 없는 종류·프로젝트를 뺀다. `hasNarrowing`·트리거 라벨·`Clear filters` 노출·`filterInbox`가 전부 **실효 필터**를 받는다. 그래서 `?project=gone`이면 화면도 라벨도 Clear도 "좁힘 없음"으로 일치한다.

## 2. 종류 축의 값 (사용자 결정 2026-10-18)

Inbox 항목 종류(`InboxItem["kind"]` — language-request-todo 뒤): `unsent` · `language_unsent` · `review` · `never_filled` · `import_failed` · `needs_reconnect` · `setup`.

- **`unsent`와 `language_unsent`는 한 값으로 묶는다** — 다음 수(Publish)가 같고 행 글리프·톤·rank도 같다. 값이 있는 ADD는 두 항목이 함께 서므로(language-request-todo D8) 따로 거르면 같은 Publish 한 번으로 끝나는 일이 둘로 갈라진다.
- **`import_failed`는 둘로 가른다** — 실패와 일부 반영(`importFailureTone(reason) === "warning"`, `lib/home/attention-view.ts`의 `PARTIAL_TILE`)은 낱말·톤이 다르다(DESIGN §2.4).
- **라벨은 DESIGN §2.4의 상태 낱말이다** — 같은 앱의 Translations 상태 필터와 같은 품사다. 할 일 낱말(`To send`·`To review`)을 쓰지 않는다(§10.1 각주의 품사 구분).

| 필터 값(URL) | 항목 | 라벨(en) | 기존 출처 |
|---|---|---|---|
| `publish` | `unsent` · `language_unsent` | `Unsent` | 번역 상태 필터 `state.unsent` |
| `review` | `review` | `Needs review` | 번역 상태 필터 `state.review` |
| `untranslated` | `never_filled` | `Untranslated` | 번역 필터 `missing` |
| `sync_failed` | `import_failed`(실패) | `Sync failed` | `STATE.syncFailed` |
| `partial` | `import_failed`(일부 반영) | `Partially synced` | Home `syncFailed` 형제 `title` |
| `disconnected` | `needs_reconnect` | `Disconnected` | `STATE.disconnected` |
| `setup` | `setup` | `Setup` | `projects.status.setup` |

- 사상은 **항목 → 필터 값** 한 방향이다. `inboxKindOf(item: InboxItem): InboxKindFilter`가 `switch (item.kind)` + `never` 검사로 전수를 강제한다(종류가 늘면 typecheck red). 반대 방향 표(`Record<InboxKindFilter, kind[]>`)는 새 종류를 빠뜨려도 통과하므로 쓰지 않는다.
- 라벨 값은 출처 키를 import해 재사용할지 새 키로 둘지 T3(`/translate`)이 정하되, en 낱말은 위 표와 같아야 한다(`terminology` 테스트).
- **선택지는 원래 계획에 있는 값만이다**(프로젝트 축과 같은 규칙) — 0건을 만드는 선택지가 없다(EDITOR에게 `Setup`이 서지 않는다). 순서는 위 표 순서다.

## 3. 검색

- 대상 글자: 프로젝트 이름 · 소스 slug(`surfaceSlug`) · 언어 이름(DB `Locale.name` — `item.name`, `lib/inbox/load.ts`) · 언어 코드(`item.code`). 보조줄에 보이는 언어 이름은 화면 언어 사전이 아니라 DB 값이라 화면 언어마다 결과가 갈리지 않는다. **언어 코드는 화면에 보이지 않지만 화면 언어와 무관해서 넣는 예외다**(`?q=ja`).
- 본문 문장(사전 문장)은 넣지 않는다 — `import_failed` 보조줄은 사전 문장(`importFailed.title(slug)`)이지만 대상은 원값 `surfaceSlug`다.
- 종류별 재료: `review`·`never_filled` = slug·name·code · `import_failed`·`unsent`·`language_unsent` = slug(언어 코드가 없다 — `ja`로는 걸리지 않는다) · `needs_reconnect`·`setup` = 프로젝트 이름만.
- 판정은 `filterInbox(plan, filter)` 안의 고정 순수 함수다 — 재료가 전부 데이터라 주입 없이 사전 없이 테스트한다.
- 대소문자 무시, 공백 정규화(질의와 대상 **양쪽**), 부분 일치. 한글 자모 분해·퍼지 매칭 없음.

## 4. 판정 순서와 빈 상태

`filterInbox(plan, effective)`: 프로젝트 → 종류 → 검색 순으로 항목을 거르고, 항목이 0이 된 프로젝트 묶음은 뺀다. 묶음·항목 순서(`planInbox` — 안 읽은 묶음 먼저)는 바꾸지 않는다. 반환은 `InboxPlan`이고 `unread`는 남은 항목으로 다시 센다(페이지는 쓰지 않지만 낡은 값을 들고 다니지 않는다).
- 원래 계획이 비면 → 기존 빈 상태 `Nothing needs you`(`m.home.attention.empty.title`). 필터 줄은 그대로 선다(§6).
- 원래 계획은 있는데 좁힌 결과가 비면 → `NoMatch`(`placement="card"` — 같은 화면의 빈 상태와 같은 자리·기하) + 출구 `ButtonLink` default · `RotateCcw` · `Clear filters`(Logs와 같다). 제목은 §10.1 형으로 둘 — 필터만이면 `No items match these filters`, 검색어가 있으면 `No items match "{q}"`.
- 선택지(`inboxFilterOptions`) = **원래 계획**(좁히기 전)의 프로젝트와 종류 값. 고른 값이 계획에서 사라졌으면(할 일이 다 끝남) URL에 남아도 실효 필터에서 빠진다(§1).

## 5. 읽음 기록 (사용자 결정 2026-10-18)

- **좁힘이 있어도 `MarkSeen`을 늘 렌더한다.** 읽음은 "Inbox를 열었다"이다(PRODUCT "Attention inbox" — 드롭다운도 다 보지 않은 채 기록한다). 좁힌 화면만 기록하지 않으면 같은 워터마크에 셋째 정의가 생기고, 좁힌 URL로 들어온 사람의 사이드바·헤더 배지가 꺼지지 않는다(PRODUCT "같은 탭의 두 배지는 이동 없이 함께 0"). 항목별 읽음은 §4.2 비범위다. ARCHITECTURE §6.365 계약은 바뀌지 않는다.
- **필터 이동은 새 방문이다.** 필터를 고를 때마다 `router.push`로 서버가 다시 그리고, `planInbox`가 `MarkSeen`이 올린 워터마크로 `unread`를 다시 계산한다(`lib/inbox/load.ts` → `plan.ts`의 `isUnread`). 그래서 이번 방문의 점은 첫 필터 조작에서 사라진다. 사용자가 수용했다 — 기준 시각을 들고 다니는 장치를 만들지 않는다. PRODUCT "이번 방문의 점은 화면에 남고"와 DESIGN §6.545에 이 단서를 단다(T6).
- 재렌더마다 `now`가 새로 잡혀 `MarkSeen`(deps `[at]`)이 다시 기록한다. 쓰기가 단조(`updateMany` 조건부)라 해가 없다.

## 6. 화면 — Logs 패턴

- **머리**: Logs처럼 `PanelHeader` 안에 둔다 — `flex flex-col gap-3` → 제목 행(`PANEL_HEAD_ROW`, `h1`은 서버 페이지가 그대로 든다) → 필터 줄. 필터 줄은 `flex flex-wrap items-center gap-2`(Logs `data-log-filter-row`와 같은 클래스, 표식 `data-inbox-filter-row`), 검색은 `SearchInput className="ml-auto" width={320}`. `PanelHeader`·`PanelBody`는 `components/shell/content-panel.tsx`다. 0건이어도 머리와 필터는 남는다(DESIGN의 Logs 규칙과 같다).
- **종류 메뉴**: 단일 선택 — `All items`(새 키, Logs `All activity`와 같은 형) + §2 표의 값 중 계획에 있는 것.
- **프로젝트 메뉴**: `ProjectMenuItem`은 쓰지 않는다 — 내부가 `<Link href={routes.project(slug)}>`로 고정돼 있다(`components/shell/project-menu-item.tsx`). `DropdownMenuCheckboxItem` 안에 `ProjectThumbnail size="xs"` + `span.min-w-0.flex-1.truncate` 이름을 조립한다(사용자 메뉴와 같은 행 기하 · 소비자 하나라 새 프리미티브 없음). 고른 것이 있으면 끝에 `Clear projects`(새 키, Logs `clearSources` 형). 계획이 비면 메뉴 항목이 0이다 — 트리거는 `Any project`로 서고 메뉴는 빈 채 열린다(`disabled`로 둘지는 Logs의 빈 축 처리를 따른다).
- **트리거 라벨**: 고른 것이 없으면 `Any project`(새 키, Logs `Any source`와 같은 형 — `All projects`는 MCP 토큰 범위 낱말이라 섞지 않는다), 있으면 이름 목록(`, `). 프로젝트 이름은 길 수 있어 트리거에 최대 폭 + `truncate`를 두고 **접근 이름 `Project: …`에는 전체 목록**을 싣는다.
- **좁은 폭**: Logs 필터 줄과 같이 감긴다(`flex-wrap` — 375에서 본문 폭 343이라 검색 320이 둘째 줄 오른쪽에 선다). `lg` 미만 별도 형 없음.
- **로딩 골격**(`app/(edit)/inbox/loading.tsx`): Logs 형(`logs/loading.tsx`)을 따른다 — 기본 라벨(`All items` · `Any project`)을 그린 `FieldTrigger invisible disabled tabIndex={-1}` 위에 Skeleton 막대, 숨긴 `Input width={320}`으로 감김까지 예약한다. 제목 막대에는 `left-0`(POSTMORTEM #202). 선택값·`Clear filters`는 로딩 때 알 수 없어 기하 보장 밖이다(Logs와 같다).
- **포커스**: Logs처럼 `go`에 transition을 두지 않고, 필터 줄 인스턴스가 재렌더에 유지되는 데 기댄다 — 단일 선택 뒤 트리거로 복귀, 체크박스는 메뉴가 열린 채 다음 항목, 검색 Enter 뒤 입력 칸 유지, Clear는 `busy`.

## 7. 필터 트리거 프리미티브 — 손 사본 셋을 하나로 (사용자 결정 2026-10-18)

- 지금 같은 껍데기(FieldTrigger + DropdownMenu, 접근 이름 `축: 값`, `active`, `shrink-0`)가 두 벌이다: Logs `log-filters.tsx`의 지역 `Filter`와 번역 화면 `components/translations/workspace/filter-menu.tsx`의 `FilterMenu`(options·size·align·disabled·hint를 더 가진다). Inbox가 셋째 소비자다.
- `components/ui/filter-menu.tsx`의 `FilterMenu`는 **children을 받는 껍데기**다 — `axis` · `label` · `on` · `size` · `align` · `disabled` · `triggerRef` · `onCloseAutoFocus` · `children`(메뉴 내용). 단일·다중 선택 항목은 호출부가 children으로 넣는다(단일·다중의 Radix 프리미티브가 다르다).
- 번역 화면의 options형은 같은 파일에서 그 껍데기 위의 얇은 래퍼(`OptionsFilterMenu`)로 바꾸고 호출부 이름을 고친다 — 이름 `FilterMenu`는 프리미티브 하나만 쓴다.
- ⚠️ **트리거를 감싸는 요소를 두지 않는다** — `loading-parity.test.tsx`가 Logs 실물 행의 `:scope > button`이 정확히 5개인지 센다.
- ⚠️ 트리거에 `id`를 넘기지 않는다(Radix `aria-labelledby`) — `log-filters.tsx` 머리 주석을 프리미티브 머리로 옮긴다.

## 순수 함수 (`/tdd` 진입점)

1. `lib/query-list.ts` — events에서 옮긴 그대로의 규칙(기존 events 필터 테스트가 green이면 동작 불변).
2. `parseInboxFilter` · `inboxQuery` 왕복 — 알 수 없는 값 무시 · 프로젝트 목록 정렬·중복 제거·상한 · `q` trim·상한.
3. `inboxKindOf` — 일곱 종류 전부(일부 반영 갈래 포함).
4. `inboxFilterOptions` · `effectiveInboxFilter` · `hasNarrowing` — 계획에 없는 값 제거.
5. `filterInbox(plan, filter)` — 축마다 · 조합 · 빈 묶음 제거 · 순서 불변 · `unread` 재계산 · 검색 재료(종류별).

## 성능

체크박스 토글·종류 선택마다 `router.push` → 서버 재렌더 → `loadAttentionInbox` 재조회(멤버십 + 집계 + 검토 + actors, language-request-todo 뒤엔 언어 상태 일괄 읽기)다. Logs와 같은 형이고 검색은 Enter 제출이라 키 입력마다 돌지 않는다. 거르기는 메모리 안 한 번 훑기다(가상화 없음 — ARCHITECTURE §1.95).

## 스키마 변경

없다.

## 새 환경변수

없다.

## 불변식 영향

없다 — 읽기 화면의 표시 거르기다. 조회·`projectId` 좁힘·인가 경계(`isProtectedPath` + `requireUser` + 멤버십 조회)는 그대로다. 프로젝트 필터는 slug로 DB를 조회하지 않고 이미 멤버십으로 좁힌 계획 안에서만 대조하므로 비멤버 slug를 넣어도 무시될 뿐 존재 여부가 새지 않는다. 헤더 배지 경로는 건드리지 않는다.

## 과거 함정 (POSTMORTEM · 코드 주석)

- Logs 필터의 함정들을 프리미티브 이관 때 그대로 가져간다 — 트리거에 `id`를 넘기지 않는다(Radix `aria-labelledby`), 단일·다중 선택의 프리미티브가 다르다(접근성 트리 상태), 필터가 바뀌면 URL 조립은 한 함수가 한다(`log-filters.tsx` 머리 주석).
- `SearchInput`은 IME 조합 확정 Enter를 거른다 — 손으로 만든 폼을 쓰지 않는다(같은 주석, 2026-09-24).
- 2026-10-08 #201·#202 — 필터 줄 골격이 줄바꿈을 예약하지 않았고, 제목 막대의 절대 위치가 숨긴 제목 뒤에서 시작했다. jsdom 통과를 실측으로 치지 않는다(§6 골격, T5 실측).
- client-graph `CLIENT_LIB_FILES`는 정확 일치다 — 새 잎은 목록에 한 줄 더하고 검사를 완화하지 않는다(2026-10-08 수량 항목).
