# language-request-todo — design

## 영향 받는 흐름

**편집 UI 셋** — `/projects` 목록 · Home · Inbox(`/inbox` + 헤더 배지). push·pull·export 경로와 게이트 자체는 건드리지 않는다. 게이트 판정(`planLocaleImportGate`)을 **읽어 표시에 쓰기만** 한다.

| 층 | 파일 | 변경 |
|---|---|---|
| 상태 접기(순수) | `lib/locales/work.ts` | `readLocaleStates`의 접기 부분(`work.ts:133-152`)을 순수 함수 `foldLocaleStates`로 뽑는다. 기존 조회·스냅샷·`surfaceId` 좁힘은 그대로다 |
| 일괄 읽기 | `lib/locales/work.ts` | `readLocaleStatesByProject(db, projectIds)` — `in ids` 조회 뒤 프로젝트별로 같은 `foldLocaleStates`를 부른다. 값 수 raw는 일괄 전용을 따로 둔다 |
| 언어 할 일 재료(순수) | `lib/locales/todo.ts`(새) | `SurfaceLocaleState[]` → `LanguageTodo \| null`. **서버 로더에서만** 부른다 |
| 할 일(순수) | `lib/inbox/project-todos.ts` | 새 종류 `language_unsent`. `import type { LanguageTodo }`만 한다(클라이언트 그래프) |
| Inbox 계획·렌더 | `lib/inbox/plan.ts`(`InboxItem` union · `:50` rank · `:53` 동점 · `:65-69`) · `lib/home/attention-view.ts`(`TILE` · `attentionHref` · `title` · `body` · `tail`) · `components/inbox/row-slots.tsx` | 종류 하나를 갈래마다 더한다 |
| 행 판정·렌더(순수 + 화면) | `lib/projects/list.ts` `planProjectRow` · `components/projects/project-list.tsx`(`ProjectBanner` 글리프 · `BannerAction` 목적지, `:450-482`) | 띠 우선순위와 목적지 |
| 보류 표시(순수) | `lib/protection/plan.ts` `planHoldNotice` · `HoldReason` | `locale-change-pending` 갈래 — 게이트와 같은 순서 |
| Home 카드·메타 | `lib/home/cards.ts`(`sublineFor` · `holdSubline` · `planHomeHold`) · `components/home/count-cards.tsx`(`sublineText` · `:125-130`) · `components/home/hold-later.tsx` · `lib/home/meta.ts`(`homeLate` `:279` · Sync 탭 `Held` `:216`) | 언어 변경 보조 줄 · 보류 사유 · 늦은 갈래의 기본 줄 |
| 로더 | `lib/keys/query.ts` `loadProjectList`(`Promise.all` `:336`) · `lib/inbox/load.ts`(`Promise.all` `:33`) · Home `page.tsx`(`readLocaleWork` `:187`) | 일괄 상태 읽기를 기존 `Promise.all`에 붙인다 |
| 사전 | `messages/{en,ko,es}.tsx` | 아래 §6 |

## 1. 무엇을 "언어 변경 작업"으로 세나

**새 정의를 만들지 않는다.** 작업은 `readLocaleStates`의 `work`(소스별 현재 효과 목록 ≠ 전달 목록, ARCHITECTURE §5.10.1)이고, 수는 `countLocaleWork`와 같다. 셋 다 포함한다.
- 아직 PR/MR로 안 나간 **제거**(`current: delete`, `delivered ≠ delete`) — 이것만 **CI 적재**를 보류한다(`planLocaleImportGate`, `app/api/push/route.ts:252`). 야간 실행은 이 게이트를 부르지 않고 언어 작업이 있으면 Publish로 간다(`lib/nightly/plan.ts:70`). 야간 쪽 게이트는 적재 중 경합을 잡을 때만 돈다(`lib/import/run.ts:156,312`).
- 값이 하나 이상인 **추가**(`create`)가 아직 안 나갔다 — 보류는 없다(`keptAddLocales`로 적재한다).
- 보낸 뒤 취소해 **거둘 것**(`current: null`, `delivered ≠ null`) — Publish가 PR에서 거둔다.

값 0개 ADD는 효과 목록에 없어 작업이 아니다. 그 언어는 이미 `never_filled` 띠·Inbox 항목이 말한다(project-row-redesign §4). 확인 안 된 전달 목록(`delivered: null`)은 빈 목록으로 본다 — 현재 효과 전부가 작업이다(`localeWork`, `work.ts:74`).

⚠️ **확인보다 뒤에 낸 요청의 효과는 전달로 세지 않는다**(`deliveredForRequests`, POSTMORTEM 2026-10-14). 일괄 읽기도 이 규칙을 그대로 지나야 한다 — §2.

## 2. 일괄 읽기 — 접기만 순수 함수로 (리뷰 D5)

`readLocaleStates`는 Publish 캡처(RepeatableRead, `lib/pull/load.ts:129`) · 잠금 안 만료·적재·승인 지문(`lib/locales/expire.ts:49` · `lib/push/apply.ts:196` · `lib/import/run.ts:156,312` · `lib/import/approval.ts:29,50`) · CI 게이트 · 야간(`lib/nightly/run.ts:89`) · Sources·MCP(`lib/sources/query.ts:73` · `lib/mcp/tools/keys.ts:46` · `lib/mcp/tools/sync.ts:36`)가 쓴다. 표시 기능 하나 때문에 이 경로의 조회를 바꾸지 않는다. 규칙이 두 벌로 갈릴 수 있는 자리는 조회가 아니라 접기다.

- **`foldLocaleStates(changes, confirmations, valueCounts)`**(순수): 지금 `work.ts:133-152`의 본문 — 소스별 행 모으기, `deliveredOf`, `deliveredForRequests`, `localeEffects`, `localeWork`, 소스 id순 정렬(승인 지문이 이 순서에 기댄다, `work.ts:141`). `readLocaleStates`는 조회를 그대로 두고 이 함수를 부른다.
- **`readLocaleStatesByProject(db, projectIds)`**: `LocaleChange` findMany와 `DeliveryConfirmation` findMany를 `projectId in ids`(보관 소스 제외 `archivedAt: null` 관계 필터 그대로)로 `Promise.all`에 묶고, ADD 행이 있을 때만 일괄 값 수 raw(`projectId = ANY(...)`, `readLocaleValueCounts`와 같은 술어 — 원본은 `lib/locales/change.ts:110`의 RepeatableRead 미리보기가 쓰므로 넓히지 않는다)를 부른다. 그 뒤 프로젝트별로 `foldLocaleStates`를 부른다. 반환 `Map<projectId, SurfaceLocaleState[]>`.
- **호출 수**: Prisma 호출 2(ADD 행이 있으면 3). `relationJoins` 미사용(`prisma/schema.prisma:4`)이라 관계 select(`locale.orphaned` · `syncRun.startedAt`)가 별도 SQL이 되어 **SQL 왕복은 최대 4(5)**다. 목록·Inbox 로더의 기존 `Promise.all`에 함께 넣는다(리뷰 D13).
- **보관 프로젝트는 ids에서 뺀다**(리뷰 D6) — `projectTodos`가 보관이면 빈 목록이라 쓸 곳이 없다. 목록 로더는 보관 프로젝트까지 읽으므로(`lib/keys/query.ts:294`) 비보관 id만 넘긴다.

## 3. 할 일 재료 — `languageTodo(states, slugOf)` (순수, 새 `lib/locales/todo.ts`)

```ts
type LanguageTodo = { count: number; surfaceSlug: string; at: Date | null; held: boolean };
function languageTodo(states: readonly SurfaceLocaleState[], slugOf: ReadonlyMap<string, string>): LanguageTodo | null;
```

- `count` = `states`의 `work.length` 합. 0이면 `null`.
- `held` = `planLocaleImportGate(states).action === "defer"` — **게이트 함수를 그대로 부른다.** 술어를 다시 쓰지 않는다.
- `surfaceSlug` = 작업이 있는 소스 가운데 slug가 가장 작은 것(코드 단위 비교).
- `at` = 작업이 있는 코드의 요청 행 `requestedAt` 가운데 가장 늦은 것. 거둘 것만 남아 행이 없으면 `null`(spec 비목표).
- ⚠️ **클라이언트 그래프**: `components/shell/attention-inbox.tsx` → `lib/inbox/plan.ts` → `project-todos.ts`가 클라이언트 그래프다(`components/__tests__/client-graph.test.ts:676-688`). `todo.ts`는 `lib/push/locale-gate.ts`를 값으로 부르므로 **서버 로더(`query.ts` · `inbox/load.ts` · Home)에서만** 부르고, `project-todos.ts`는 `import type { LanguageTodo }`만 한다. `todo.ts`가 `SurfaceLocaleState`를 가져올 때도 `import type`이다.

## 4. 할 일 · 행 띠 · Inbox

`projectTodos` 입력에 `language: LanguageTodo | null`을 더하고, `count > 0`이면 `{ kind: "language_unsent", ...language, ownerRetries: false }`를 낸다. 역할 필터는 없다 — Publish가 `translation:write`라 두 역할 모두의 일이다. **끊긴 프로젝트도 기존 `unsent`와 같이 낸다**(리뷰 D7) — 재연결 항목이 함께 서고, 행 띠는 끊김이 이긴다. 이 기능에서 끊김 예외를 따로 만들지 않는다.

**행 띠 우선순위**(`planProjectRow`, DESIGN §6.63): 미발송 > **언어 변경** > 열린 PR · PR 조회 실패 > 리포 앞섬 > 검토 > 빈 언어.
- 미발송 편집 다음인 이유: 같은 [Publish] 한 번이 둘을 함께 보내고, 셀 편집 띠가 이미 Publish로 데려간다.
- 열린 PR보다 앞인 이유: 언어 변경이 미전달이면 PR이 열려 있어도 그 변경은 아직 PR에 없다. 다음 수는 Publish다. 이때 Home `To send` 보조 줄은 PR 보류 사유를 말해 두 자리가 다른 사실을 앞세운다 — **허용한다**(리뷰 D10): 띠는 다음 수, 보조 줄은 적재 보류 사유에 답한다. 미발송 편집 + 열린 PR도 지금 같은 모양이다.
- 칩·그룹은 바뀌지 않는다(`active` · `all_set`). 띠 톤은 All set 띠라 muted다.
- 글리프 `GitPullRequestArrow`(미발송과 같다 — 같은 다음 수는 같은 모양, 사용자 Q2).
- 링크: 라벨 `Go to Publish`(기존 `projects.banner.action.send`), 목적지 **프로젝트 Home**(사용자 Q1). 행 띠 링크는 `BannerAction`(`project-list.tsx:450-482` — `bannerTranslationsHref`)이, Inbox 링크는 `attentionHref`(`attention-view.ts:45-53`)가 따로 만든다 — **두 자리 모두** 이 종류 갈래를 더한다.

**Inbox**: 렌더는 `unsent` 항목 형을 따른다(`TILE.unsent` — `IconTile` muted + `GitPullRequestArrow`, 보조줄 = 대표 소스 slug). 본문은 ① 통짜(`unsent`처럼 꼬리 `""`), ② `—`에서 나눈 두 조각(`needs_reconnect` 선례, 사용자 D4). 정렬 rank는 `unsent`와 같은 1이고 `:53` 동점 분기에도 넣는다. **값 있는 ADD는 `unsent`와 `language_unsent` 두 항목이 선다**(리뷰 D8) — 셀 값과 파일 집합은 다른 사실이고 Home도 따로 말한다. 행 띠는 하나(미발송이 이긴다).

**같은 판정인지**: project-row-redesign 완료 조건 6 표 테스트(`lib/inbox/__tests__/project-todos.test.ts` — `:69-70` `DB` 집합에 이 종류)에 `language_unsent` 축(0/양수 × held)을 더한다.

## 5. Home

Home 페이지는 이미 `readLocaleWork`(`page.tsx:187`)로 상태를 읽는다. **새 조회 없이** 그 읽기가 `states`를 함께 돌려주게 넓혀 `languageTodo`를 같은 결과에서 만든다.

**보류 사유**(`planHoldNotice`): 입력에 `localeHeld: boolean`을 더한다. 순서는 `/api/push`와 같다 — 미전달 편집(`:240`) → 언어 게이트(`:252`) → 열린 PR(`:265`).
```
보관 · 끊김 → null
편집 > 0 → pending-edits
localeHeld → locale-change-pending      ← 새
게이트 없음 → null
열린 PR 갈래 → open-pr / pr-check-failed / null
```
- `locale-change-pending`이면 PR을 조회하지 않는다 — `planHomeHold`가 `pr-check-failed`일 때만 조회하므로(`cards.ts:167-168`) 언어 갈래가 PR 앞에 서면 저절로 지켜진다(malmoi#107).
- **보류 사유가 늘면 Home 메타 열 Sync 탭의 `Held` 배지가 함께 선다**(`lib/home/meta.ts:216`, `components/home/meta-column.tsx:193-200`) — 네 번째 표면이다(리뷰 D14). `homeLate`(`meta.ts:279`)·`sublineText`(`count-cards.tsx:153`)의 switch와 `m.home.cards.held` 사전이 이 사유를 받아야 typecheck가 green이다(§7 커밋 경계).
- 언어 보류 중에는 PR을 조회하지 않아 메타 열 PR 상태가 `absent`가 된다(`page.tsx:291`) — 미전달 편집 보류 때와 같은 동작이라 수용하고 테스트로 고정한다(리뷰 D12).

**언어 변경 보조 줄**: 셀 편집 0 · 보류 아님 · 언어 변경 작업 > 0이면 `nothing to send`가 아니라 `N language changes to publish`(새 `CardSubline` 종류 `languageChanges`, 사용자 D3). 카드 수치는 셀 수 그대로다(사용자 Q4).
- ⚠️ **늦은 갈래도 같은 줄을 받는다**(리뷰 R1). 편집 0이고 PR 게이트가 걸리면 `planHomeHold`가 promise를 돌려주고 카드는 `HoldLater`를 그린다(`count-cards.tsx:125-130`). `HoldLater`는 도착 전과 결론 `null`에서 `nothingPending`을 쓴다(`hold-later.tsx:22`). 그래서 서버가 정한 **기본 보조 줄**(`languageChanges` 또는 `nothingPending`)을 `holdSubline`·`HoldLater`에 prop으로 넘겨, 결론이 `null`이거나 아직 오지 않았을 때 그 줄을 쓴다. 보류 결론이 도착하면 보류 사유가 이긴다.

**표 테스트**:
- `lib/protection/__tests__/hold-notice.test.ts`(`:50-58` — 지금 정상 연결 12조합)를 넓힌다: **보관·끊김을 뺀** 편집 0/양수 × localeHeld × gateApplies × openPr 삼상태에서 `planHoldNotice` = 게이트 셋을 `/api/push` 순서로 지난 결론. 보관·끊김은 `null` 행으로 따로 둔다.
- `lib/home/__tests__/cards.test.ts`(`:213-222`)의 표에 `localeHeld` 행 — PR 조회 0회.

## 6. 화면 낱말 (사용자 D2·D3·D4)

| 자리 | ① 보류 아님 | ② 전달 전 제거(보류) |
|---|---|---|
| 행 띠 | `N language changes to publish.` + `Go to Publish` | `A language removal isn't published yet — repository updates are held.` + `Go to Publish` |
| Inbox 본문 · 꼬리 | 본문 = ① 띠 문장, 꼬리 `""` | 본문 `A language removal isn't published yet` · 꼬리 ` — repository updates are held.` |
| Home `To send` 보조 줄 | `cells · N language changes to publish` | `cells · held — a language removal isn't published yet` |

- **보류 낱말은 `held` 하나다** — §10.1 보류 행의 정본 낱말이고 Home 보류 줄과 같다. 언제 풀리는지 약속하지 않는다 — Publish 뒤에도 열린 PR 보류가 이어받는다(ARCHITECTURE §5.10.3). `held`는 `terminology.test.ts`의 `ALLOWED`에 등재된 키에서만 쓸 수 있으므로 새 키를 등재한다.
- **`to publish`** 는 [Publish] 힌트(`There are language changes to publish.`, `messages/en.tsx:3339`)와 같은 낱말이다. ⚠️ ko `미게시`·es `sin publicar`는 금지어(`banned-terms.ts`)다 — **DESIGN §10.1에 "언어 변경 미전달" 행(en·ko·es)을 사전 커밋보다 먼저 정해** `/translate`에 넘긴다(T1 사전 태스크의 첫 단계). 기존 Logs 문장 `a language removal is still unsent`(`messages/en.tsx:1483,1587`)와도 대조한다.
- ②는 수를 말하지 않는다 — 제거가 여럿이어도 보류라는 사실은 하나다.
- 언어 상태 낱말(`Adding`·`Removing`)은 Languages 카드의 상태어라 쓰지 않는다. `pending`도 쓰지 않는다(코드 이름이다).
- 새 en 키: 행 띠 ①② · Inbox ② 본문·꼬리(①은 띠 문장 재사용) · Home `languageChanges(n)` · Home `held["locale-change-pending"]`. ko·es는 같은 커밋.

## 7. 커밋 경계 (리뷰 R3)

새 종류·보류 사유는 사전과 exhaustive 자리(`TILE` Record · `homeLate`·`sublineText` switch · `m.home.cards.held`)를 같이 깨므로, **사전을 순수 판정 앞의 독립 커밋**으로 올린다(쓰이지 않는 키를 막는 테스트는 없다). 순수 판정 커밋은 그 종류·사유를 받는 렌더 갈래(`attention-view.ts` · `plan.ts` · `meta.ts` · `count-cards.tsx` · `hold-later.tsx`)를 같이 고쳐 typecheck를 green으로 둔다. 순서는 tasks.md.

## 순수 함수 (`/tdd` 진입점)

1. `foldLocaleStates` — 기존 `readLocaleStates` 결과와 같다(기존 통합 테스트) + `readLocaleStatesByProject`가 프로젝트별로 `readLocaleStates`와 같다(격리 PG).
2. `languageTodo` — 수 · held(게이트 결과와 같음) · 대표 slug · `at`(행 없는 거둘 것 → `null`).
3. `projectTodos`의 `language_unsent` — 0이면 없음, 두 역할 모두, 끊김에서도 선다.
4. `planProjectRow` 띠 우선순위 — 2,880 표 테스트에 축을 더한다.
5. `planHoldNotice` ↔ 게이트 셋 일치 표(보관·끊김 제외) · 보관·끊김 `null` 행.
6. `sublineFor`·`holdSubline` `languageChanges` 갈래 · `HoldLater` 기본 줄.

## 스키마 변경

**없다.** `LocaleChange`·`DeliveryConfirmation`·`SyncRun.startedAt`만 읽는다.

## 새 환경변수

없다.

## 불변식 영향

- export 결정성 · blob SHA · 인증 경계 · 병합 없음(§0) — 무관하다(읽기 화면). 게이트는 바꾸지 않고 판정 함수를 표시에 재사용만 한다.
- **모든 쿼리는 `projectId`로 좁힌다** — 일괄 읽기는 `projectId in ids`다. 셸 로더 `loadMemberships`에는 얹지 않는다(DESIGN §6.63 끝 문단).
- ⚠️ **project-row-redesign의 "새 왕복을 만들지 않는다"를 완화한다**(리뷰 D13, 사용자 수용). 목록·Inbox·배지 경로에 Prisma 호출 2–3(SQL 최대 4–5)이 늘고, 배지 Action(`loadAttentionBadgeAction` → `loadAttentionInbox`, `app/inbox/actions.ts:37`)이 매 헤더에서 이 경로를 부른다. 같은 리전(ARCHITECTURE §1.95 — 홉 비용)이라 기존 `Promise.all`에 합쳐 직렬 홉을 늘리지 않는다. 호스트 API는 부르지 않는다.

## 과거 함정 (POSTMORTEM)

- **2026-10-14 — 전달 목록이 "어느 요청의 효과인가"를 몰랐다**: 작업 수는 `deliveredForRequests`를 지나야 한다. 일괄 읽기가 그 규칙을 따로 쓰면 같은 결함이 목록·Inbox에서만 돌아온다 → 접기를 한 함수로 둔다(§2). 회귀 fixture에 "같은 언어의 두 번째 요청"을 넣는다.
- **2026-09-27 — 거부된 Publish가 "Nothing to send"로 섰다**: 할 일이 있는데 "보낼 것 없음"을 말하는 부류다. Home `To send`의 `nothing to send`가 지금 두 경로(`sublineFor` · `HoldLater`)에서 같은 거짓을 말한다 → §5.
- **ux-drift-unify Q6(2026-10-01) — Home 보류 표시가 게이트와 갈렸다**(PR 보류 동안 "nothing pending"): 이번에는 언어 갈래에서 같은 일이 났다. 표 테스트를 게이트 셋 기준으로 넓힌다(§5).

## 결정

2026-10-18 사용자. `/feature` Q1–Q5, `/feature-review` S1 · R1–R4 · D1–D15(추천안 채택).

1. **Q1** 행 띠·Inbox 링크 목적지 = 프로젝트 Home.
2. **Q2** 띠·Inbox 글리프 = `GitPullRequestArrow`(미발송과 같다).
3. **Q3 → D2** 보류면 원인을 먼저 말하고 언제 풀리는지 약속하지 않는다. 보류 낱말은 `held` 하나.
4. **Q4** Home `To send` 수치는 셀 수 그대로, 보조 줄만 언어 변경을 말한다.
5. **Q5** Claude Design 시안을 받는다 — `design-brief.md`.
6. **S1** 상태가 보통 하루 남짓이어도 세 화면을 다 고친다.
7. **D1** 보류 대상은 CI 적재뿐이다(야간은 Publish한다).
8. **D3** 보류 아닌 문장은 `to publish` 형. §10.1 "언어 변경 미전달" 행을 사전보다 먼저 정한다.
9. **D4** Inbox 본문 — ① 통짜, ② `—`에서 나눔.
10. **D5** 일괄 읽기 = 접기만 순수 함수(`foldLocaleStates`)로 뽑고 기존 조회는 그대로.
11. **D6·D7** 보관 프로젝트는 읽기에서 뺀다. 끊김은 `unsent`와 같은 동작.
12. **D8** 값 있는 ADD는 Inbox 항목 둘(`unsent` + `language_unsent`).
13. **D9** Home `To send` 카드 링크는 그대로.
14. **D10** 열린 PR + 미전달 언어에서 행 띠(언어)와 Home 보조 줄(PR 보류)이 갈리는 것을 허용한다.
15. **D11** 거둘 것만 남은 항목의 `at = null`을 수용한다.
16. **D12** 언어 보류 중 메타 열 PR 상태 `absent`를 수용하고 테스트로 고정한다.
17. **D13** 목록·배지 경로의 호출 증가를 수용하고 기존 `Promise.all`에 합친다.
18. **D14** 메타 열 Sync 탭 `Held` 배지를 네 번째 표면으로 다룬다.
19. **D15** 런타임 확인은 폐기용 새 프로젝트로 한다.
