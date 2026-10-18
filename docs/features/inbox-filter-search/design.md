# inbox-filter-search — design

## 영향 받는 흐름

**편집 UI 하나** — `/inbox` 페이지. push·pull·export·게이트 무관. 조회(`loadAttentionInbox`)는 바꾸지 않는다.

| 층 | 파일 | 변경 |
|---|---|---|
| 필터 모델(순수) | `lib/inbox/filter.ts`(새) | `InboxFilter` · `parseInboxFilter(params)` · `inboxQuery(filter)` · `hasNarrowing` · `clearedInboxQuery` · `filterInbox(plan, filter, haystack)` |
| 필터 트리거 프리미티브 | `components/ui/filter-menu.tsx`(새, 이관) | Logs `log-filters.tsx`의 지역 `Filter`(FieldTrigger + DropdownMenu, 접근 이름 `축: 값`, `active`) 그대로 옮긴다. Logs가 이것을 import한다 |
| 필터 줄 | `components/inbox/inbox-filters.tsx`(새, `"use client"`) | 종류 · 프로젝트 · Clear · SearchInput. `router.push(routes.inbox(query))` |
| 페이지 | `app/(edit)/inbox/page.tsx` | `searchParams` → `parseInboxFilter` → `filterInbox` → `InboxList`. 빈 결과면 `NoMatch` |
| 목록 | `components/inbox/inbox-list.tsx` | 받은 계획을 그린다(변경 최소) |
| 경로 | `lib/routes.ts` | `routes.inbox(query?)` |
| 사전 | `messages/{en,ko,es}.tsx` | `inbox.filters.*`(축 이름 · `All` · `Any project` · `Clear filters`는 Logs 키 재사용 검토) · `inbox.search.*` · `inbox.noMatch.*` |

## 1. 필터 모델 — Logs와 같은 형

```ts
type InboxFilter = { kind: InboxKindFilter; projects: string[]; q: string | null };
// InboxKindFilter = "all" | 항목 종류 키(아래 §2)
```

- **URL이 정본**(Logs 결정과 같다) — `?kind=review` · `?project=web-app,docs` · `?q=ja`. 프로젝트는 **slug**다(사람이 읽고 공유하는 자리 — Logs `sources`와 같은 판단). 목록 인코딩은 `lib/events/filter.ts`의 `encodeList`와 같은 규칙(정렬·중복 제거·상한)을 쓴다 — 공유 조각으로 뺄지는 구현에서 판단하되 규칙을 두 벌로 쓰지 않는다.
- ⚠️ 남이 정한 키 — `searchParams`는 `Object.hasOwn`으로 읽는다(CLAUDE.md 코드 컨벤션).
- 알 수 없는 `kind`·없는 `project`는 무시한다. `q`는 trim 후 빈 문자열이면 `null`, 길이 상한 200(Logs `MAX_TEXT`).

## 2. 종류 축의 값

Inbox 항목 종류(`InboxItem["kind"]` — language-request-todo 뒤): `unsent` · `language_unsent` · `review` · `never_filled` · `import_failed` · `needs_reconnect` · `setup`.
- 라벨은 화면에 이미 있는 낱말을 쓴다(DESIGN §2.4 — 같은 개념은 같은 말). 예: 검토는 Translations 상태 필터의 `Needs review`/`Review`, 미발송은 `Unsent`. 새 낱말이 필요한 종류(재연결·설정·동기화 실패·빈 언어)는 §10.1 표의 기존 행에서 고른다.
- **`unsent`와 `language_unsent`를 한 값으로 묶을지**는 확인 필요(아래). 기본안: 둘을 `To publish` 하나로 묶는다 — 다음 수(Publish)가 같고 행 띠도 같은 글리프다.

## 3. 검색

- 대상 글자 = 화면에 보이는 것만: 프로젝트 이름 · 보조줄(소스 slug · `slug · 언어코드`) · 언어 이름. 본문 문장(사전 문장)은 넣지 않는다 — 화면 언어마다 결과가 갈린다.
- 판정은 `filterInbox`가 받는 `haystack(item, project) → string[]` 함수로 분리한다(순수 — 사전 없이 테스트한다).
- 대소문자 무시, 공백 정규화, 부분 일치. 한글 자모 분해·퍼지 매칭 없음.

## 4. 판정 순서와 빈 상태

`filterInbox`: 프로젝트 → 종류 → 검색 순으로 항목을 거르고, 항목이 0이 된 프로젝트 묶음은 뺀다. 정렬(`planInbox`의 묶음·항목 순)은 바꾸지 않는다.
- 원래 계획이 비면 → 기존 빈 상태(`All clear`).
- 원래 계획은 있는데 좁힌 결과가 비면 → `NoMatch`(Logs와 같은 프리미티브) + `Clear filters`.
- 프로젝트 선택지 = **원래 계획의 묶음**(좁히기 전). 고른 프로젝트가 계획에서 사라졌으면(할 일이 다 끝남) URL에 남아도 무시한다.

## 5. 읽음 기록 — 확인 필요

지금 `MarkSeen`은 페이지를 보면 조회 전 시각으로 워터마크를 올린다. 좁힌 화면에서도 그대로 두면 **보이지 않은 항목도 읽음이 된다.** 기본안: 좁힘이 있을 때는 `MarkSeen`을 렌더하지 않는다(좁히지 않은 화면을 봤을 때만 읽음). 대안: 지금처럼 둔다(배지는 "Inbox 페이지를 열었다"로 꺼진다).

## 6. 화면 — Logs 패턴

- 머리: `PanelHeader` 제목 그대로. 필터 줄은 `PanelBody` 맨 위 `flex flex-wrap items-center gap-2`(Logs `data-log-filter-row`와 같은 클래스), 검색은 `SearchInput className="ml-auto" width={320}`.
- 프로젝트 메뉴 항목은 `ProjectThumbnail xs` + 이름(사용자 메뉴의 `ProjectMenuItem` 조각 재사용을 먼저 검토), 다중 선택이라 `DropdownMenuCheckboxItem`, 고른 것이 있으면 끝에 `Clear projects`(Logs `clearSources` 형).
- 트리거 라벨: 고른 것이 없으면 `Any project`, 있으면 이름 목록(`, `). 접근 이름 `Project: …`.
- 좁은 폭: Logs 필터 줄과 같이 감긴다(`flex-wrap`). `lg` 미만 별도 형 없음.

## 순수 함수 (`/tdd` 진입점)

1. `parseInboxFilter` · `inboxQuery` 왕복 — 알 수 없는 값 무시 · 프로젝트 목록 정렬·중복 제거 · `q` trim·상한.
2. `hasNarrowing` · `clearedInboxQuery`.
3. `filterInbox(plan, filter, haystack)` — 축마다 · 조합 · 빈 묶음 제거 · 정렬 불변 · 사라진 프로젝트 무시.

## 스키마 변경

없다.

## 새 환경변수

없다.

## 불변식 영향

없다 — 읽기 화면의 표시 거르기다. 조회·`projectId` 좁힘·인가 경계(`requireUser` + 멤버십 조회)는 그대로다. 헤더 배지 경로는 건드리지 않는다.

## 과거 함정 (POSTMORTEM · 코드 주석)

- Logs 필터의 함정들을 프리미티브 이관 때 그대로 가져간다 — 트리거에 `id`를 넘기지 않는다(Radix `aria-labelledby`), 단일·다중 선택의 프리미티브가 다르다(접근성 트리 상태), 필터가 바뀌면 URL 조립은 한 함수가 한다(`log-filters.tsx` 머리 주석).
- `SearchInput`은 IME 조합 확정 Enter를 거른다 — 손으로 만든 폼을 쓰지 않는다(같은 주석, 2026-09-24).
