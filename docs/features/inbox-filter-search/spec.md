# inbox-filter-search — spec

> 2026-10-18 착수(사용자). `/inbox` 페이지(inbox-page, 2026-10-09)에 좁히는 도구를 더한다. **UI는 프로젝트 Logs 페이지의 필터 줄 패턴을 재사용한다**(사용자). 프로젝트도 드롭다운 필터로 고른다(사용자). 코드 착수는 language-request-todo의 T4(`InboxItem` union에 `language_unsent`)와 T7(`components/inbox/row-slots.tsx` 렌더)이 dev에 들어간 뒤다 — 그 기능이 Inbox 항목 종류와 렌더(`lib/inbox/**`·`components/inbox/**`)를 바꾼다. 2026-10-18 `/feature-review` 반영.

## 사용자

**둘 다다.** Inbox는 두 역할 모두의 할 일 목록이다(PRODUCT "Attention inbox"). 프로젝트가 여럿이고 할 일이 쌓인 사람이 "이 프로젝트의 것만", "검토 대기만"을 보려 한다.

## 문제 (관측된 사실)

- `/inbox`는 비보관 멤버 프로젝트의 현재 할 일을 **상한 없이** 프로젝트별 카드로 전부 보인다(`components/inbox/inbox-list.tsx`). 좁히는 도구가 없다 — 프로젝트·항목 종류로 거르거나 이름으로 찾을 수 없다.
- 여러 개가 쌓이는 종류는 `review`·`never_filled`다 — 소스 × 언어마다 하나씩 선다. `unsent`·`setup`·`needs_reconnect`는 프로젝트당, `import_failed`는 소스당 최대 하나다(`lib/inbox/project-todos.ts`·`lib/home/attention.ts`). 그래서 길이는 프로젝트 수 × 소스 × 언어로 자란다.
- 같은 앱의 Logs 페이지는 필터 줄(`FieldTrigger` 드롭다운 + `SearchInput` + `Clear filters`, URL이 상태)을 갖는다. Inbox는 그 형이 없다.

## 완료 조건 (검증 가능한 문장)

1. **필터 줄** — `/inbox`의 `PanelHeader` 안, 제목 행 아래에 Logs와 같은 형의 필터 줄이 선다: 드롭다운 필터 **둘**(종류 · 프로젝트) + `Clear filters`(실효 좁힘이 있을 때만) + 끝에 `SearchInput`. 원래 계획이 비어도 선다. DOM 테스트.
2. **종류 필터** — 단일 선택(`All items` + 종류 값). 값은 DESIGN §2.4의 상태 낱말이고 `unsent`와 `language_unsent`는 한 값 `Unsent`(URL `publish`)로 묶인다. 선택지는 원래 계획에 있는 값만이다. 고르면 그 값의 항목만 남는다. 순수 함수 단위 테스트(같은 프로젝트에 `unsent`·`language_unsent`가 함께 있으면 둘 다 남는다).
3. **프로젝트 필터** — 다중 선택(`DropdownMenuCheckboxItem`, Logs Source 축과 같은 형). 고른 프로젝트의 카드만 남는다. 선택지는 원래 계획에 있는 프로젝트다. 순수 함수 단위 테스트 + DOM 테스트(`role="menuitemcheckbox"`).
4. **검색** — 질의가 항목의 프로젝트 이름 · 소스 slug · 언어 이름(DB `Locale.name`) · 언어 코드에 대소문자 무시 부분 일치하면 남는다. 언어 코드는 화면에 보이지 않지만 화면 언어와 무관해서 넣는 예외다. 순수 함수 단위 테스트.
5. **URL이 상태다** — 좁히는 축은 전부 쿼리(`?kind=` · `?project=` · `?q=`)에 산다. [Apply]가 없고 고를 때마다 URL이 바뀌어 서버가 다시 그린다. 새로고침·뒤로 가기·공유가 그대로 된다. 알 수 없는 값과 계획에 없는 값은 무시한다 — 무시된 값은 트리거 라벨·`Clear filters`에도 반영되지 않는다(실효 필터). 파서 단위 테스트.
6. **빈 결과** — 좁힌 결과가 0이면 `NoMatch`(`placement="card"`)와 `Clear filters`가 선다. 원래 계획이 빌 때의 빈 상태 `Nothing needs you`와 구별된다. DOM 테스트.
7. **헤더 드롭다운·배지는 그대로다** — 필터는 페이지에만 있다. 배지 수·드롭다운 목록은 좁힘의 영향을 받지 않는다. 기존 테스트 green + `filterInbox`를 `planInbox`·`loadAttentionInbox`가 부르지 않는다는 소스 단언.
8. **읽음 기록은 그대로다** — 좁힘이 있어도 `MarkSeen`이 렌더된다(읽음 = "Inbox를 열었다", PRODUCT의 정의). 필터를 바꾸면 서버가 다시 그리고 올라간 워터마크로 점을 다시 계산하므로 **필터 이동은 새 방문이다** — 이번 방문의 점은 필터를 바꾸면 사라진다(사용자 수용 2026-10-18). DOM 테스트로 고정한다.
9. **필터 트리거는 한 벌이다** — Logs의 지역 `Filter`와 번역 화면의 `FilterMenu`(`components/translations/workspace/filter-menu.tsx`)를 `components/ui/`의 프리미티브 하나로 옮기고 Logs·번역 화면·Inbox가 같이 쓴다(손 사본 0). Logs·번역 화면 동작은 그대로다(기존 테스트 green — 소스 문자열 검사는 대상 경로만 갱신).
10. **로딩 골격이 필터 줄을 예약한다** — `app/(edit)/inbox/loading.tsx`가 미필터 필터 줄(기본 라벨 트리거 둘 + 검색 320)의 높이를 예약한다. `loading-parity` DOM 대조(세 언어) + 실측(골격→실물 높이 차 0px).

## 비목표

- **헤더 드롭다운의 필터·검색** — 360 폭 메뉴는 결과 목록 행이고, 거르는 도구는 페이지가 든다.
- **안 읽음 축** — 항목별 읽음은 PRODUCT §4.2 범용 알림 비범위에 든다. 또 페이지를 열면 읽음이 기록되므로(`MarkSeen`) 새로고침 뒤 늘 비게 된다.
- **필터 이동 사이 점 유지** — 첫 방문의 기준 시각을 들고 다니는 장치를 만들지 않는다(완료 조건 8).
- **기간 축** — 항목은 사건이 아니라 지금 상태다(검토 시각은 push가 덮는다 — inbox-list 머리 주석).
- **서버 쪽 좁힘** — 항목은 이미 한 번에 다 읽힌다(`loadAttentionInbox`). 조회를 바꾸지 않고 읽은 계획을 순수 함수로 거른다.
- **새 시각 디자인** — Logs 패턴 재사용이라 Claude Design 시안을 받지 않는다.
- **스키마·환경변수** — 없다.
