# language-request-todo — spec

> 2026-10-18 착수 · 같은 날 `/feature-review` 반영 · malmoi#290. project-row-redesign(2026-10-18 dev)이 미룬 예외를 닫는다. 그 기능의 원 설계는 `git show d9768746^:docs/features/project-row-redesign/design.md` §1("동기화의 뜻")·§4("언어 요청 자체는 할 일 종류가 아니다")에 있고, 지금 정본의 예외 서술은 DESIGN §6.63 띠 항(`bf8ad857`)이다.

## 사용자

**둘 다다.** Publish는 `translation:write`라 EDITOR도 누를 수 있다(`lib/auth/permission.ts:7`). 언어를 추가·제거하는 사람은 OWNER지만, 그 요청을 리포로 보내는 Publish는 두 역할 모두의 일이다. 보류를 푸는 길은 Publish와 제거 취소 둘인데, 띠·Inbox는 두 역할 모두 할 수 있는 Publish 하나만 가리킨다(취소는 Sources Languages 카드가 든다).
- 개발자(OWNER)의 질문: "왜 리포의 새 키가 앱에 안 들어오지?" — 전달 전 언어 제거가 **CI 적재**를 통째로 보류한다(`locale-change-pending`, `app/api/push/route.ts:252`). 야간 실행은 이 게이트를 부르지 않고 언어 작업이 있으면 Publish한다(`lib/nightly/plan.ts:70`). 보류는 보통 다음 야간 실행까지 가지만, 그 Publish가 실패하거나 보류되면 더 길어진다. 그 사실을 보이는 글자로 말하는 화면이 없다.
- 편집자(EDITOR)의 질문: "보낼 게 있나?" — 셀 편집이 0이고 언어 변경만 남았으면 [Publish]가 켜지고 그 `title`·sr 설명(`There are language changes to publish.`, `messages/en.tsx:3339`)만 이유를 말한다. 보이는 글자로 말하는 화면은 없다.

## 문제 (관측된 사실)

**언어 변경 작업**(`countLocaleWork` — 소스별 현재 효과 목록 ≠ 전달 목록, ARCHITECTURE §5.10.1)만 남은 프로젝트를 세 화면이 모두 놓친다.

1. **`/projects` 행** — 칩 `Active` · 그룹 `All set` · 띠 없음. 할 일 판정(`projectTodos`, `lib/inbox/project-todos.ts`)이 `LocaleChange`를 읽지 않는다. 메타의 `synced …`만 보류 동안 오래돼 간다.
2. **Home** — [Publish]는 `languageWork`로 켜진다(`app/(edit)/projects/[slug]/(home)/page.tsx:187`). 그런데 `To send` 카드는 셀 수 0에 보조 줄 `nothing to send`(`nothingPending`)이다. 이 줄은 두 경로로 나온다 — 서버가 바로 정하는 `sublineFor`(`lib/home/cards.ts`)와, 보류 결론이 PR 조회 뒤 늦게 도착하는 `HoldLater`(`components/home/hold-later.tsx:22` — 도착 전과 결론 `null`일 때 `nothingPending`). 보류 판정(`planHoldNotice`, `lib/protection/plan.ts:75`)에도 `locale-change-pending`이 없어서, CI 적재가 실제로 멈췄는데 Home은 보류를 말하지 않는다. 게이트(`planLocaleImportGate`, `lib/push/locale-gate.ts`)와 Home 표시가 갈린다.
3. **Inbox** — 항목이 `projectTodos`에서 나오므로 같은 이유로 비어 있다. 배지도 늘지 않는다.

같은 사실을 한 화면만 말하게 고치면 DESIGN §2.4(같은 개념은 화면마다 같은 말)를 어긴다. 그래서 세 화면을 한 기능으로 묶는다(#290 본문). 상태가 보통 하루 남짓이어도 세 화면을 다 고친다(2026-10-18 사용자 — 리뷰 S1).

## 완료 조건 (검증 가능한 문장)

1. **할 일 판정이 언어 변경 작업을 안다** — `projectTodos`가 새 종류 `language_unsent`(수 · 대표 소스 · 시각 · 보류 여부)를 낸다. 언어 변경 작업이 0이면 내지 않는다. 단위 표 테스트로 센다.
2. **행** — 언어 변경 작업만 남은 프로젝트의 행에 띠가 선다. 칩은 `Active`, 그룹은 `All set` 그대로다(칩은 건강, 띠는 할 일 — DESIGN §6.63). 띠 우선순위는 미발송 편집 다음이고 링크 목적지는 프로젝트 Home이다. DOM 테스트로 확인한다.
3. **보류를 말한다** — 전달 전 제거가 있으면(게이트가 `locale-change-pending`으로 보류) 행 띠·Inbox 항목·Home `To send` 보조 줄·Home 메타 열 Sync 탭의 `Held` 배지가 보류를 말한다. Home의 보류 판정이 게이트와 같은 순서(미전달 편집 → 언어 변경 → 열린 PR)를 지난다. 표 테스트가 **보관·끊김을 뺀 모든 입력 조합에서** `planHoldNotice`와 게이트 셋(`planProtectedImport` auto · `planLocaleImportGate` · `planOpenPrGate`)의 결론이 같음을 센다. 보관·끊김은 표시가 `null`인 별도 행으로 고정한다(게이트는 그때도 보류하지만 화면은 연결·보관 상태를 먼저 말한다).
4. **Home `To send`** — 셀 편집 0 · 언어 변경 작업 > 0이면, **어느 렌더 경로에서도**(`sublineFor` · `HoldLater` 도착 전 · `HoldLater` 결론 `null`) 보조 줄이 `nothing to send`가 아니다. 단위 테스트와 DOM 테스트로 확인한다.
5. **Inbox** — `language_unsent` 항목이 두 역할 모두에게 서고 목적지는 프로젝트 Home이다. 같은 프로젝트 fixture에서 행 띠의 종류가 Inbox 항목에 있다(project-row-redesign 완료 조건 6의 표 테스트에 이 종류를 더한다). 배지 경로가 리포 호스트 API를 부르지 않는다(소스 단언 — 대상에 새 파일을 더한다).
6. **수가 한 정의다** — 행·Inbox·Home이 세는 언어 변경 작업 수가 `countLocaleWork`와 같다. 확인보다 뒤에 낸 요청 규칙(`deliveredForRequests`)도 같이 따른다. 격리 PostgreSQL 교차 테스트로 같은 fixture에서 셋을 견준다.
7. **목록 조회 비용** — 목록·Inbox 로더가 새로 붙이는 조회는 전부 `projectId in ids`로 좁힌 일괄 조회이고, 프로젝트 수에 비례해 늘지 않는다. mock 단위 테스트가 Prisma 호출 수를 프로젝트 1개와 N개에서 같게 센다.

## 비목표

- **언어 변경의 상세 표시** — 어느 언어가 추가·제거 중인지는 Sources의 Languages 카드가 이미 든다. 띠와 Inbox는 수와 다음 수만 말한다.
- **보낸 뒤의 상태** — 언어 변경을 실은 PR/MR이 열려 있으면 기존 `pr_open` 띠와 `open-pr` 보류가 말한다. 전달 뒤 결말을 기다리는 창(`awaitsResolution`)은 작업 0이라 이 기능이 말하지 않는다.
- **칩·그룹 변경** — 언어 변경 보류도 건강으로 올리지 않는다. 미전달 편집 보류(`pending-edits`)가 칩을 바꾸지 않는 것과 같다.
- **Home Attention 카드** — Attention은 `collectAttention` 그대로다. Home에서는 `To send` 카드가 이 사실을 든다(미발송 편집과 같은 자리).
- **Home `To send` 카드 링크** — 지금처럼 번역 화면 `Unsent` 필터다. 셀 0이면 0건 목록이지만 카드의 단위는 셀이고, 다음 수인 [Publish]는 같은 Home 머리에 있다(리뷰 D9).
- **Sources·번역 화면** — Languages 카드의 `Adding`·`Removing` 표시와 [Publish]는 이미 있다. 손대지 않는다.
- **MCP** — `get_project`가 이미 `languageChangesToSend`를 싣는다(`lib/mcp/tools/project.ts:75`).
- **거둘 것만 남은 항목의 시각** — 보낸 뒤 취소해 거둘 것만 남으면 요청 행이 없어 Inbox 시각이 `null`이다. 항목과 띠는 서지만 읽음 워터마크가 있으면 안 읽음으로 세지 않는다(`needs_reconnect`의 `null` 규칙과 같다, 리뷰 D11).
- **스키마 변경** — 없다. 이미 저장된 `LocaleChange`·`DeliveryConfirmation`만 읽는다.

## 시안

받는다(2026-10-18 사용자). 브리프는 `design-brief.md`. 구현이 dev에 들어가기 전까지만 SoT이고, 그 뒤로는 코드 + DESIGN §6.63·§6.64가 정본이다.

**수령: `Language Request Todo.dc.html`**(2026-10-18, 프레임 1–8 · 5b). 1차 검토의 지적 셋이 반영된 판을 받았다 — design-brief "시안 수령 뒤 결정".
