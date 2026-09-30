# ux-drift-unify — design

## 1. 영향 받는 흐름

**편집 UI만이다** — `/projects` · Home · Sources · 번역 · Logs · Settings · Account · `/mcp` · Members · 랜딩 목업 · 가이드.
push·pull·export·어댑터는 건드리지 않는다. 적재 거부 경로(`lib/import/run.ts`·`lib/onboarding-run/import.ts`·`lib/import/plan.ts`)는 **문구 키만** 바뀐다.
`/api/mcp`의 `get_project` 출력은 **바뀌지 않는다**(spec Q12 — §3.1).

## 2. 층 — 판정 → 정본 표 → 프리미티브 → 화면

같은 상태를 한 곳이 판정하고, 한 표가 톤·낱말을 주고, 프리미티브가 그 톤을 클래스로 옮기고, 화면은 상태 키만 넘긴다.
**호출부가 variant나 색 문자열을 고르는 자리를 없애는 것이 목표다**(조사 문서 §1.4 — 호출부 수만큼 매핑이 있었다).

| 층 | 자리 | 무엇 |
|---|---|---|
| 판정 | `lib/` (순수) | §3의 함수들. 상태 키를 낸다 |
| 정본 표 | `lib/status/canon.ts` (신규, 잎) | `StateKey → { tone, variant, label }`. **톤의 정본이고 DESIGN §2.4가 이것을 가리킨다** |
| 톤 → 클래스 | `components/ui/` | `IconTile tone` · `StatusBadge state` · `CountBadge` · `BannerLine tone`(기존, `components/ui/row-card.tsx:150`) · `Alert variant`(기존) |
| 화면 | `app/`·`components/` | 상태 키만 넘긴다 |

⚠️ **`lib/status/canon.ts`는 잎이다** — 사전(`lib/i18n`)만 import한다. 클라이언트 컴포넌트가 import하므로 Prisma·`lib/keys/query.ts` 그래프를 물면
`client-graph.test.ts`가 red다(POSTMORTEM 2026-09-07의 7.2MB 청크와 같은 부류). `CLIENT_LIB_FILES`(`client-graph.test.ts:93-`)에 한 줄 등재한다.
⚠️ **`lib/`는 Tailwind를 모른다** — 클래스 맵은 `components/ui/`에 둔다(`components/ui/tone.ts`의 "판정은 `lib/`, 클래스는 여기" 규칙).

## 3. 순수 함수 — `/tdd` 진입점

### 3.1 연결 (🔴 C · 6-Y6 · D1)

- `planConnectionHealth`(`lib/github-connect/health.ts`) — `installationId === null`은 `not-connected` 그대로, **`installationId !== null && repositoryId === null`은
  새 갈래 `{ status: "unpinned" }`**. probe 결과와 무관하게 이것이 먼저다(지금 줄 76의 한 줄을 둘로 가른다). probe는 `ok`·`not-installed`·`error` 셋이다(`health.ts:26-29`).
- `loadConnectionHealth`(`lib/github.ts:167`)는 `installationId === null`**이거나 `repositoryId === null`이면** probe를 건너뛴다 — `unpinned`는 probe 결과를 버리므로 GitHub 3홉이 헛돈다.
- `connectionProblem`(`lib/home/state.ts`) — `unpinned → "disconnected"`. `planHomeState`의 `not_connected` 갈래에도 넣는다.
- Settings의 `isDisconnected`·배지 삼항(`components/settings/repository-card.tsx:50-51,75,77`)을 `connectionProblem`으로 바꾼다. `repo-moved`·`unknown`만 Settings가 덧붙인다.
  `unpinned`의 버튼은 **Reconnect**(D1).
- 목록(`lib/projects/list.ts` `projectStatus`)은 `ready`일 때 `repositoryId === null → needs_reconnect` 그대로다 — 이제 Home과 같은 결론이다. 띠 문장만 바꾼다(§5 H):
  "GitHub App access was revoked"는 `unpinned`에서 거짓이다.
- **적재 거부 경로** — `lib/import/run.ts:89`·`lib/onboarding-run/import.ts:49`·`lib/import/plan.ts:19`가 `repositoryId null`을 `"not-connected"`로 거부하고
  문구가 "Malmoi is not connected to this repository"(`messages/en.tsx:149`)다. 코드 값은 그대로 두고 **`repositoryId null` 갈래의 문구를 Disconnected 낱말로** 가른다
  (Home이 Disconnected라 말하는데 Sync 거부가 "not connected"라 말하지 않게). 교차 테스트(§3.8)의 한 열이다.
- **MCP `get_project.connection`은 출력 불변**(spec Q12) — `lib/mcp/tools/project.ts:60`의 `connection: health.status`에서 `unpinned`를 `"not-connected"`로 매핑한다.
  `repositoryId null` 프로젝트의 `connection`을 단언하는 테스트를 `lib/mcp/tools/__tests__/read-tools.test.ts`에 더한다(지금 `connection` 값 단언 0건).
  ARCHITECTURE §6.45·DESIGN:794·PRODUCT:517의 값 목록은 바뀌지 않는다.
- **Reconnect 무효화** — `connectRepository`는 이미 `revalidatePath(\`/projects/${slug}\`, "layout")`(`settings/actions.ts:241`)로 Home·번역 화면을 덮는다.
  **빠진 것은 `/projects` 목록 하나다.** 호출 인자를 테스트로 단언한다(POSTMORTEM 2026-09-09).

### 3.2 동기화 실패 집계 (🔴 E · 6-Y7 · 6-⚪15)

- 신규 `projectSyncFailure(surfaces: { importError, importing }[]): ImportFailureCode | null`(`lib/projects/import-failure.ts` 옆) —
  표면마다 `failing`을 적용하고 `importFailureTone` 순(danger > warning)으로 가장 나쁜 코드 하나를 고른다. 빈 배열은 `null`.
- `lib/keys/query.ts:349-350`의 행 평탄화(`find` · `some`)를 **표면 배열을 그대로 넘기는 것**으로 바꾸고, 목록 칩·띠·`meterSlot`과 Home 배너
  (`app/(edit)/projects/[slug]/(home)/page.tsx:224`)가 이 함수 하나를 부른다. SQL 형은 그대로이고 JS 조립만 바뀐다.
- **행 조립을 순수 함수로 뗀다** — 🔴 E의 실제 결함은 조립(`query.ts:349-350`)에 있었고 postgres 스위트는 지금 `importError`·`importing`을 단언하지 않는다.
  조립 함수의 단위 테스트 + `test:projects:postgres`에 "표면 A 동기화 중 + 표면 B 실패" 행 하나(POSTMORTEM 2026-09-20 "판정은 통과했지만 조회·렌더에서 사실이 달라졌다").
- **칩 순서만 고친다(Q2)** — `project-list.tsx:246-249`의 칩 매핑을 끊김 먼저로. 띠(`rowBanner`, `list.ts:165-166`)와 `planHomeState`는 이미 끊김이 먼저다.
  세 소비자의 어휘(`ProjectStatus`+실패 · `RowBanner.kind` · `HomeState`)가 달라 공유 우선순위 표는 매핑 층 셋만 만든다 — **표를 두지 않고** 일치는 교차 테스트가 고정한다.

### 3.3 행동 가용성 (🔴 F · spec Q7)

- 신규 `planActionAvailability({ archived, connection })` → `{ publish: boolean; sync: boolean }`(`lib/home/state.ts`).
  Home(`page.tsx:243`의 `paused`)과 번역 화면이 같은 함수를 부른다. `connection`은 `HomeState` 갈래 또는 DB 판정 결과.
- **번역 화면은 DB 판정 + 스트리밍이다.** 페이지(`app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx`)는
  - 첫 렌더: `installationId`·`repositoryId`만으로 `not-connected`/`unpinned`를 판정해 즉시 끈다(GitHub 왕복 0).
  - 나머지 갈래(App 제거 · 설치 교체 · 리포 교체): `loadConnectionHealth(project)` promise를 워크스페이스로 내려 `use()` + Suspense 뒤에서 도착시킨다(Settings가 같은 형).
    **`memo: true`를 켜지 않는다** — `probe-memo.test.ts:86-90`이 memo 호출부를 Home 하나로 고정하고 `lib/github.ts:158`이 그 정책을 적었다.
  - 조회 실패는 `unknown`이고 `unknown`은 버튼을 끄지 않는다(Home과 같다). 클릭하면 서버가 어차피 다시 판정한다.
- ⚠️ ARCHITECTURE §1.95가 이 화면의 병목을 실측으로 적은 자리다 — 스트리밍이라 `responseEnd`는 늘지 않아야 한다. 태스크에 전후 측정(판정선 spec Q7)을 넣는다.

### 3.4 실행 결과 톤 (🔴 B)

- `summarizeImport`(`lib/import/result.ts`)의 `tone`을 **`summarizeImportEvent` 결과 → `TONES`**로 얻는다. 전 표면 superseded는 neutral(`muted`)이다.
  `summarizeImport`는 수치만 계산한다. `TONES`(`lib/events/view.ts:46`)를 export하고, `summarizeImport.tone`의 타입(지금 `"success"|"warning"|"danger"`, `result.ts:45`)을
  `EventTone`으로 넓힌다 — 소비자 `sync-result.tsx:82`.
- `lib/import/__tests__/result.test.ts:11`(`superseded → warning`)과 `lib/events/__tests__/view.test.ts:49`(`superseded → muted`)가 반대 값을 고정하고 있다 —
  앞의 것을 뒤집고, 둘을 한 테스트(`TONES[summarizeImportEvent(x)] === summarizeImport(x).tone`)로 묶는다. 입력원은 `view.test.ts:293-319`의 조합.
- ⚠️ POSTMORTEM 2026-09-16: **테스트 입력은 `finishSurface`가 실제로 돌려주는 모양이어야 한다** — `partial`에 `reason`을 붙인 조합은 서버가 만들지 않는다.
  일부 superseded + 일부 partial 조합(`view.test.ts:304`는 imported+superseded → partial)의 톤도 이 테스트가 정한다.

### 3.5 표면 적재 상태 (🔴 A1 · 1-Y6 · 5-Y6 · 6-Y8 · 6-⚪13)

- `planSurfaceImportStatus`(`lib/import/surface-status.ts`)가 `{ state, tone, labelKey, at }`를 낸다 — `tone`은 `importFailureTone` 경유, `at`은 `lastImportedAt`
  (지금 `lastCommitAt` — `lib/home/sync-time.ts:2-4`가 금지한 쪽).
- Sources 행 칸·배지·상세 칸·상세 보조줄이 전부 이 값을 읽는다. 인라인 사본 둘(`source-status.tsx:12`, `source-detail-modal.tsx:60`)과
  `startsWith("failed")`(`sources-screen.tsx:103`)를 지운다.

### 3.5a 보류·열린 PR (6-Y9 · 6-Y10 · Q6)

- **판정 입력은 게이트와 같다** — `pending`(미전달 수, 게이트와 같은 술어 `lib/protection/where.ts`의 `pendingWhere`로 센 값)과 `openPr`(삼상태 `string | null | undefined`).
  게이트 함수는 둘이고(`planProtectedImport`·`planOpenPrGate`, `lib/protection/plan.ts:19,38` — 그 파일 주석 `:33`이 합치지 말라고 적었다) **합치지 않는다.**
  화면용 순수 함수 하나를 그 둘 위에 얹는다: `planHoldNotice({ pending, openPr, gateApplies, archived, connection })` → `null | { reason: "pending-edits" | "open-pr" | "pr-check-failed" }`.
  - **우선순위: 보관·끊김 → `null`, 그다음 `pending > 0` → `pending-edits`, 그다음 PR.** 게이트도 pending을 먼저 본다(`app/api/push/route.ts:229-240`, `lib/nightly/plan.ts:56`).
  - `gateApplies`(`openPrGateApplies(project)`)는 **PR 갈래에만** 관계한다 — `gateApplies=false`여도 `pending > 0`이면 `pending-edits`다(편집 보류 게이트는 설치 여부와 무관하게 돈다).
  - `pending > 0` + `openPr === undefined` → `pending-edits`.
  - **위치는 `lib/protection/plan.ts` 안이다** — import 0인 잎이라 `client-graph.test.ts:405-411`의 고정 그래프가 그대로다.
    ⚠️ `./fingerprint`를 물면 `node:crypto`가 클라이언트로 온다(그 파일 머리 주석).
- **Home** — `page.tsx`는 **`pending > 0`이면 PR을 조회하지 않는다**(결과가 같다). 조회가 필요할 때만 `loadOpenPrUrl` promise를 카드 보조줄·메타에 내려
  **Suspense로 스트리밍**한다 — 본문 렌더를 막지 않는다(malmoi#107이 메모로 줄인 병목을 되살리지 않는다). 보관이면 이미 `null`을 돌려 GitHub을 안 친다.
  카드 보조줄(`lib/home/cards.ts` — 지금 `toSend` 보류 `repositoryUpdatesPaused` 자리 `:131-137`에 PR 갈래를 더한다)과 메타(`lib/home/meta.ts:132` — 마지막 사건이 아니라
  지금의 판정)가 `planHoldNotice`를 읽는다. **`pr-check-failed`는 Held(warning)이고 사유 문장이 "couldn't check for an open pull request"다**(게이트가 fail-closed라 실제로 보류다).
  ⚠️ Home 착지도 T20과 같은 측정에 넣는다.
- **목록** — `lib/projects/remote.ts`는 "모름"을 "없음"으로 접는 경로가 넷이다. **넷 다 가른다**(spec 7b):
  ① 요청 거부 — `Promise.all` 하나가 PR과 compare를 같이 버린다(`remote.ts:110-113`) → `Promise.allSettled`로 PR·compare를 따로 읽는다.
  ② 클라이언트 생성·토큰 실패의 catch(`:124-131`) → PR `undefined`.
  ③ 전체 마감 `withDeadline`(`:74-78`) → 모든 행 PR `undefined`. **PR 번호가 있는 모든 행에 띠가 서는 것이 정직한 결과다.**
  ④ `lib/keys/query.ts:344`의 `remote.get(...)?.openPr ?? null` → `undefined`를 보존한다.
  `RemoteSignals.openPr`(`NONE`은 `remote.ts:42`)은 `{…} | null | undefined`. 설치·리포가 없거나 보관됐거나 PR 번호가 없는 프로젝트는 `null`(게이트가 서지 않는 쪽).
  `remote.ts:15-17`의 "실패하면 띠를 안 그린다" 주석을 이 결정으로 고친다.
  띠는 warning "Couldn't check for an open pull request"이고 `rowBanner`(`list.ts:160-175`)에서 **`pr_open` 자리**에 선다(같은 신호의 모름이다).
  목록은 여전히 **마지막 Publish PR 번호**(`isPullRequestOpen`, `remote.ts:104`)를 본다 — Home·게이트는 `findOpenPr(sync 브랜치)`(`lib/projects/open-pr.ts:40`)다.
  `lastPrUrl`이 null이거나 옛 값이면 둘이 갈린다 — DESIGN §2.4 "알려진 틈" 넷째 줄(D2).
  ⚠️ `repoAheadFiles`(`remote.ts:120`)의 compare 거부는 기존대로 없음이다(compare 쪽은 "모름"을 말할 자리가 없다).
  ⚠️ `remote.ts`·`list.ts`는 `scripts/gate-plan.ts` postgres 트리거가 아니다 — ④는 `query.ts`라 트리거에 걸린다.

### 3.6 정본 표 (`lib/status/canon.ts`)

```ts
export type StateTone = "success" | "muted" | "warning" | "danger"; // EventTone과 같은 어휘
export type StateKey = /* 실제 소비자(StatusBadge · IconTile · 교차 테스트)가 쓰는 키만 */
  | "synced" | "sent" | "syncing" | "notSyncedYet" | "superseded"
  | "syncFailed" | "partiallySynced" | "held" | "unsent"
  | "prOpen" | "notConnected" | "disconnected" | "wrongRepository" | "couldNotCheck"
  | "unavailable" | "archived" | "setup" | "active";
export const STATE: Record<StateKey, { tone: StateTone; variant: BadgeVariant; label: string }>;
```

- **이름은 `StateTone`이다** — `lib/tone.ts:19`가 이미 `Tone`(아바타 색 여덟)을 export한다. 어휘는 `EventTone`(`lib/events/view.ts:22` — "Badge variant 이름과 같다")에 맞춘다.
- **행이 `variant`를 직접 든다** — `Badge`에 무색이 둘이다(`muted` 글자만 · `neutral` `bg-foreground/5` 면). Superseded·Untranslated는 `muted`, Unsent는 `neutral`(Q3).
  톤만으로는 `StatusBadge`가 어느 쪽을 그릴지 정하지 못한다. `danger` 톤의 variant는 `missing`(D3②).
- `label`은 사전 값을 가리킨다(새 문자열을 만들지 않는다).
- **DESIGN §2.4와의 행 수 대조 테스트는 두지 않는다** — DESIGN.md를 읽는 테스트는 지금 0개이고, 마크다운 표 행 수는 형식이 바뀌면 red·톤이 틀리면 green이다.
  §2.4 한 행이 상태 여럿을 `·`로 묶어(16행) 키와 1:1도 아니다. `Record<StateKey, …>`가 빠진 행을 컴파일 에러로 막는다(`FAILURE_SENTENCE`의 `satisfies`와 같은 관용구).
  위 키 목록은 후보이고 **소비자가 0인 키는 넣지 않는다**(셀 상태 `needsReview`·`untranslated`, 초대 `expired` 등은 소비자가 생길 때 올린다).

### 3.7 그 밖의 순수 조각

- `isExpired(expiresAt, now)`(6-⚪14) — 초대·MCP 토큰의 경계식 사본 여섯(`invitation-email/issue.ts:181` · `auth/invitation.ts:56` · `auth/members.ts:54` · `mcp/token.ts:39` ·
  `mcp/view.ts:34,73`)을 하나로. 결과는 오늘과 같다. **OAuth 인라인 비교 5곳(`lib/oauth/*`·`lib/oauth-server/*`)은 제외한다**(spec Q14).
- Logs 메타(`lib/events/view.ts`) — IMPORT 인라인 결과 낱말 제거(4-Y20), 소스는 항상 배지, `Running…`을 Sync/Publish로 가른다(1-Y2).
  **성공(`sent`)의 톤은 Logs에서 `muted`**(D3③ 예외 — 지금 `success`). Logs "Not sent"(`notSent`, warning)는 Unsent와 다른 개념이라 그대로다(spec Q14).
  ⚠️ `view.test.ts:31-33`은 "라벨 non-null·서로 다름"을 단언한다 — 종류별 낱말을 넣으면 이 전제를 "(종류, 결과)마다"로 바꾼다.

### 3.8 교차 테스트 (`lib/status/__tests__/cross-screen.test.ts`)

spec 완료 조건 3의 행렬을 목록(`projectStatus`·`rowBanner`·칩 매핑)·Home(`planHomeState`·배너 갈래·`planHoldNotice`·`planActionAvailability`)·
Settings(`connectionProblem`)·Sources(`planSurfaceImportStatus`)·적재 거부(`lib/import/plan.ts`의 거부 → 문구 키)에 넣고 `STATE` 키가 같은지 전수 단언.
N/A 칸은 "그 판정이 이 입력을 받지 않는다"를 단언한다(빈 칸이 조용히 green이 되지 않게).

## 4. 프리미티브 (components/ui)

| 프리미티브 | 변경 | 흡수하는 항목 |
|---|---|---|
| `IconTile` | `tone?: StateTone` prop 추가. §2.4 아이콘 칸 열의 클래스를 여기만 든다. `visual-system.test.ts` `REGISTERED`(`:97` amber · `:116` green)와 §6.2:445 소비자 목록에 `icon-tile.tsx`를 등재하고 호출부를 걷는다. 교정 소비자: `attention-card.tsx:34-39` · `logs/glyph.tsx`(자체 `TONE` 맵) · `source-detail-modal.tsx:101` · `sources-screen.tsx:111` | 1-R1, 1-Y15, 5-R1, 5-Y6, Logs 결과 칩(D3③) |
| `StatusBadge` (신규) | `state: StateKey` → `STATE[state].variant` + 낱말 | 보관 세 모양, Not synced yet 글자색, Unsent `Pill`, 사라진 언어 |
| `Badge` | `danger` variant 삭제(D3②), `missing`의 `gap-1.5` 삭제(배지 안 글리프 금지 — 5-Y19). 국기(`locale-badge.tsx:80`)는 상태 글리프가 아니라 면제 | 5-R3, 1-Y12 |
| `CountBadge` (신규) | `{ count, label }` — 0이면 `null`, 숫자 `aria-hidden` + sr 문장. **`PanelCard`·`RowCard`의 `badge` 슬롯은 그대로 두고 `count` prop을 새로 둔다**(`badge`에 개수 아닌 값이 들어가는 곳: `source-detail-modal.tsx:129` 대기 수 warning · `login-methods.tsx:61` "x/y"). `PanelHeader`에도 `count` prop을 새로 둔다. 손 조립 소비자 전부(spec Q13): `attention-card:61` · `sources-screen:72,78` · `source-detail-modal:144` · `tree-panel:41` · `key-list:50` · `workspace:585` · `project-list:145` · `sidebar:206` · `segmented-control:77` · `surface-selector:26` · `publish-button:134` | 4-R1, 4-Y5, 4-Y6, 5-W5, 4-W13 |
| `CloseButton` (신규, `modal.tsx:205`에서 추출) | ghost · 36 · 원형 · hover `foreground/3` · X 20. **X 다섯 형 전부 채택**: `dialog.tsx:115` · `modal.tsx:205` · `alert.tsx:123` · `event-dialog.tsx:70` · `sources-screen.tsx:92`. §6.4:619("Alert와 같은 36 정방")를 원형으로 갱신 | 5-Y9, 3-⚪16 |
| `Button` | **새 prop 없음.** 기존 `busy`(`button.tsx:156-166` — 스피너 + `aria-disabled` + `aria-busy` + 클릭 차단)·`loading`으로 수제 스피너를 흡수한다. 아이콘을 교체하는 형(`log-filters.tsx:116`)은 `loading`의 "아이콘 교체"(§6.4:41)가 든다. Button 안 5곳(`publish-button:132` · `sync-button:215` · `log-filters:117,228` · `workspace:809`)을 옮기고, Button 밖 직접 스피너(`publish-button:350` · `user-menu:109` · `new-project-icon:12` · `new-project-button:31` · `logs/row-chevron:19` · `source-detail-modal:103`)는 `Button`/`ButtonLink`의 `busy`·`loading`으로 옮길 수 있는 것만 옮기고, 못 옮기는 것(행 chevron·타일 아이콘 자리 교체)은 T28 위반표의 허용 목록에 사유와 함께 둔다 — **`Spinner` 프리미티브는 만들지 않는다**(지금 `components/ui/`에 없다) | 3-⚪13, 5-Y14 |
| `DialogContent` | **초기 포커스 = 푸터 Cancel** — 푸터 `DialogClose`(Cancel)에 표식(`data-initial-focus`)을 달고, 호출부가 `onOpenAutoFocus`를 `preventDefault`하지 않았고 안쪽 `autoFocus`가 없을 때만 그리로 보낸다. `log-filters.tsx:299` 기간 Dialog는 opt-out(첫 날짜 입력). 수동 지정 3곳(`archive-card:118` · `sync-button:193` · `connected-apps-card:173`)은 표식으로 대체한다. 모든 푸터가 Cancel이 먼저라 파괴 확정으로 포커스가 가지 않는다. 변화가 생기는 13곳(지금 헤더 X로 떨어짐): `login-methods:167` · `sessions-section:81,126` · `member-list:234,384` · `pending-invitations:248` · `token-card:188` · `push-token-panel:55` · `github-account:44` · `source-detail-modal:186` · `publish-button:660` · (`log-filters:299`는 opt-out) | 3-Y4 |
| `PanelCard` | **머리 아래 선은 항상 머리가 긋는다(notice가 있으면 notice 아래), 자식은 `border-t`를 들지 않는다.** 소비자 14곳을 표로 옮겨 카드별 [수동] 확인(T14): `PanelCard` 11곳(`repository-card.tsx:34-47,63`의 첫 자식 `<Divider/>` 걷기 · inset Alert notice 카드 `sessions-section:50` · `github-section:57` · `login-methods:62` 포함) + Home 손 카드 셋(`attention-card:56` · `logs-card:33` · `meta-column:38` — 규약이 반대라 본문 첫 자식 `border-t`를 머리로 옮긴다. `meta-column`은 `<aside>`, `attention-card` 머리는 `h2` 자체) | 4-Y1, 5-Y12, 4-W1 |
| `PanelHeader` (`components/shell/content-panel.tsx:76`) | `notice` 슬롯 — **`description` 아래**, 제목 블록 뒤. `min-h-9`를 프리미티브가 든다. 수동 `min-h-9` 4곳(`account/page:132` · `settings/page:62` · `mcp/page:58` · `project-list:134`) 제거. `settings/page.tsx:62`의 h1 위 Alert는 notice 슬롯으로 옮겨 제목 아래로 간다(순서 변경 — [수동] 확인). 소비자 23곳(skeleton `loading.tsx` 8곳 포함)은 슬롯을 안 쓰면 변화 없음 — `panel-header.test.tsx`로 고정 | 4-Y7, 4-Y8 |
| `Alert` | 변경 없음 — Publish 결과의 손 조립 `Notice`(`components/publish-button.tsx:171-180`)를 이것으로 교체(Q10) | 5-Y16, 1-Y5 글리프 |

**새 프리미티브는 이 넷(`StatusBadge`·`CountBadge`·`CloseButton`·`IconTile tone`)까지다.** 조사 문서가 제안한 `ListRow`·`NoMatch`·`ArchivedNotice`·`SecretField`·
`ErrorState`·`FactLabel`은 **소비자 교정으로 같은 결과가 나는 한 만들지 않는다** — 확장성 선반영 금지(CLAUDE.md 작업 원칙). 태스크에서 두 곳 이상이 같은 손 조립을
반복하면 그때 올린다.

## 5. 사전 (messages/en.tsx) — 개념 색인

새 네임스페이스를 만들지 않는다. **개념 색인은 `terminology.test.ts`의 금지 목록 + DESIGN §10.1 표**다 — 이미 있는 장치를 넓힌다(§10.1에 아래 개념 행을 올리는 것이 T1).

| 개념 | 정본 | 금지(사전 0건) |
|---|---|---|
| 동기화 실패 | 배지 "Sync failed"(Logs 결과 배지만 "Failed" — 종류 배지가 앞에 선다, Q1), 문장 "The last sync couldn't finish" 하나 | "Sync could not finish", "did not finish", "failed on its first sync" |
| 복호화 실패 이름 | "Unavailable"(Q5) | "Couldn't be read" |
| 일부 반영 | "Partially synced" | partial 문맥의 "could not"·"did not come in"·"failed" |
| 동기화 중 | "Syncing…" (Publish는 "Publishing…") | Sync 문맥의 "Running…" |
| 연결 끊김 결과 | "Syncs and publishes stop until it's reconnected." | "paused", 연결 문맥의 "held" |
| 보류 | "Held" / "Repository updates are held until …" | "on hold", "deferred"(CI 로그 인용 밖) |
| 열린 PR 조회 실패 | "Couldn't check for an open pull request" — 목적어를 붙인다(홀로 서는 "Couldn't check" 금지) | — |
| Publish 일부 보류 | "Held back" | Sync 문장의 "held back" |
| 미전달 | 상태 "Unsent", 명사 "unsent edit(s)" | "unpublished", "unsent change", "not sent yet" |
| 미번역 | "Untranslated" | "Missing only" |
| 연결 확인 실패 · 만료 | "Couldn't check" · "Expired" | "Couldn't load", "Authorization expired" |
| 초대 철회 | "Revoke" / "revoked" | "cancelled an invitation" |
| App 호칭 | 처음 "Malmoi GitHub App", 이어서 "the app" | "Malmoi app" |
| 계정 화면 | "Account" | "account settings" |
| 이미지 제거 | "Remove" / "Upload" | "Delete"(이미지), "Image upload" |
| 축약형 | could not → couldn't 등 | "could not"·"did not"·"cannot"·"is not"(허용 목록: 강조 부정) |
| 밀림 | "Superseded" + 보조 문장(비개발자가 읽는 Home에 선다) | — |

⚠️ **`ALLOWED`는 지금 "정확한 키 경로 하나 → 금지어 이름 하나"다**(`terminology.test.ts:111-126`, 판정 `:130`). "held는 보류 키 아래만"(접두)과
한 키에 금지어 여럿(held + 축약형 예외)을 표현하도록 **판정식을 넓힌다**(T15) — 그 판정식 자체에 메타 테스트(접두 허용이 형제 경로를 새지 않는가).

### 5.1 가이드 게이트 두 장치 (T26 — 새 메커니즘)

- **보이는 라벨만 인정** — `dictionaryStrings`(`lib/guide/dictionary.ts:11-21`)는 aria 문자열과 보이는 문자열을 가르지 않고, 사전 키 이름에도 일관된 가시성 관례가 없다.
  게이트 테스트에 **`ARIA_ONLY` 키 경로 목록**을 두고 그 값을 굵은 라벨 후보에서 뺀다(축 이름 등). 목록의 각 경로가 사전에 실재하는지 메타 테스트 — 키 이름이 바뀌면 red.
- **SHOOTING 소스 = 사전 키 경로** — `stale.ts`는 파일 경로 + blob SHA 모델이라 키 경로를 넣으면 `deleted`로 판정된다(`:31-58`). 새 소스 종류
  `dict:<키 경로>`를 두고 기준값은 **그 키 값(문자열)의 SHA-1**이다. 매핑 표의 기존 행은 그대로, 낱말에 걸린 컷(`state-filter.webp` · `home-paused.webp`)만 키 행을 더한다.

## 6. 스키마 · 환경변수 · 불변식

- **스키마 변경 없음.** `unpinned`는 기존 두 컬럼에서 계산한다. `query.ts`의 SQL 형도 그대로다.
- **새 환경변수 없음.**
- **불변식 2(병합 없음)** — `planHoldNotice`는 게이트와 같은 입력(`pending`·`openPr`)만 받고 리포 값을 보지 않는다. 화면 표시일 뿐 게이트를 대신하지 않는다.
- **불변식 영향 없음** — export 결정성·blob SHA·인증 경계(ARCHITECTURE §1·2·6)를 건드리지 않는다. 인가 판정(`canPerform`·`role`)도 건드리지 않는다(비목표).
- **외부 계약 불변** — MCP `get_project` 출력은 같다(§3.1).
- **병렬 조회의 토큰 안전성** — Settings가 이미 `loadConnectionHealth`·`loadOpenPrUrl`을 동시에 출발시킨다(`settings/page.tsx:48-50`). 둘 다 **installation 토큰**이라
  회전하지 않고, 범위가 달라(비고정 vs `repositoryIds:[pinned]`) 캐시 키가 갈리며 캐시가 비어 있으면 발급이 두 번일 뿐이다. POSTMORTEM 2026-09-16(`Promise.all`이
  토큰 회전을 둘로 겹쳤다)은 **user-to-server refresh 토큰의 1회용 회전**이라 부류가 다르다 — 그 회고의 교훈("안전하다는 주석이 근거 없이 결함을 덮었다")대로 근거를 여기 남긴다.
- **캐시 무효화** — §3.1의 `/projects` 추가(POSTMORTEM 2026-09-09).

## 7. 과거 함정 (POSTMORTEM)

| 회고 | 이번에 걸리는 곳 |
|---|---|
| 2026-09-24 "비리터럴 값 하나로 904키가 다 들어간 소스가 'Last sync failed'가 됐다" | `partial-import`는 데이터가 들어간 상태다 — §3.5·§5의 근거. 🔴 A1·A2가 같은 부류의 잔재다 |
| 2026-09-16 "부분 실패 결과가 '임포트가 끝나지 않았다'고 말했다" | §3.4 — 테스트 입력은 서버가 만드는 모양으로 |
| 2026-09-16 "`Promise.all`이 토큰 회전을 둘로 겹쳤다" | §6 — 이번 병렬 조회는 installation 토큰이라 다른 부류, 근거를 문장으로 |
| 2026-09-09 무효화 경로 | §3.1 — Reconnect의 `/projects` 무효화, 인자 단언 |
| 2026-09-14 "확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다" | 확인 문구를 고칠 때(3-Y10) 문장이 동작과 맞는지 본다 |
| 2026-09-14 "프리미티브의 여백 하나가 그 슬롯을 안 쓰는 소비자에게만 깨졌다" · 09-15 "형제 프리미티브 둘을 함께 옮기며 한쪽 소비자만 셌다" | §4 `PanelCard`·`PanelHeader`·`CountBadge` — 소비자 전수 표 |
| 2026-09-20 · 09-24 포커스 복귀 셋 | `DialogContent` 초기 포커스(3-Y4)·sessions 트리거 `busy`(3-⚪17)·로그아웃 Dialog 제거(Q4) — jsdom 단언만으로 끝내지 않고 브라우저로 한 번 본다 |
| 2026-09-20 "활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다" | §3.2 — 행 조립을 떼어 테스트, postgres 행 |
| 2026-09-18 "인가 방어선이 호출이 아니라 이름을 셌다" · 09-14 "방어선 셋을 지워도 green" | T28 — 규칙마다 카나리아·스캔 하한, 동작 규칙은 DOM |
| 2026-09-16 "`git checkout -- <디렉터리>`가 미커밋 작업을 지웠다" | T28 뮤테이션 복원은 커밋 뒤 또는 사본으로 |
| 2026-09-07 7.2MB 청크 | `lib/status/canon.ts`는 잎, `CLIENT_LIB_FILES` 등재 |
| 2026-09-23 "테마에 없는 `text-link` 클래스로 인라인 링크 셋이 본문 글자로 섰다" | 문장 속 인라인 링크 파랑은 예외로 유지(§2.4 동작 규칙) |

## 8. 고칠 때 함께 뒤집히는 테스트 (불일치를 고정하던 것)

| 테스트 | 고정하던 것 | 항목 | 태스크 |
|---|---|---|---|
| `lib/import/__tests__/result.test.ts:11` | superseded → warning | B | T6 |
| `lib/github-connect/__tests__/health.test.ts:147` · `lib/home/__tests__/state.test.ts:106` | repositoryId null → not-connected | C (D1) | T3 |
| `lib/import/__tests__/surface-status.test.ts:8-9` · `app/__tests__/screens.test.ts:402`(소스 문자열) | `lastCommitAt → at` | 6-Y8 | T7 · T17 |
| `lib/home/__tests__/meta.test.ts:27,91,93,135,153,167,190` · `runs.test.ts:42` · `sync-time.test.ts:37` · `runs.integration.ts:72,82` · `components/__tests__/home-meta-trigger.test.tsx:32,40,41,46-58` | 마지막 사건으로 PR 보류(`heldByOpenPr`) · 시각 → 소문자 주체 순서 | Q6 · A2 · 4-Y19 | T7a(순수) · T18(화면) |
| `lib/home/__tests__/cards.test.ts:83-84` | `toSend > 0`만 보류 | Q6 | T7a |
| `components/__tests__/members-cards.test.tsx:67,263` · `card-head.test.ts:19-23` · `panel-header.test.tsx` · `panel-card.test.tsx:27` · `account/__tests__/structure.test.tsx:290` | 0 카운트 배지 · `h2 + span .sr-only` · 헤더 클래스 정확 일치 | M · 4-Y1 · 4-Y7 | T12 · T14 |
| `components/__tests__/visual-system.test.ts:97,104-106,111,116,117,199,225` | 목업 amber-700·green-800 등재 · emerald/slate 글리프 · Logs `rounded-xl` · `REGISTERED`에 `icon-tile.tsx` 없음 | G · 1-Y10 · D3③ · 4-Y2 | T11 · T21 · T24 |
| `components/__tests__/sources-screen.test.tsx:201` | 목록 성공 칸 `data-tone="default"` | 5-Y6 | T17 |
| `app/(edit)/__tests__/sibling-loading.test.tsx:101-102` | Sources 골격 설명 줄 | 4-Y16 | T17 |
| `components/__tests__/sync-result.test.tsx:48,66,73,87,108,161` | "Sync could not finish" · 축약형 · 거부 tone | 1-Y1 · 1-Y14 | T15 · T18 |
| `components/__tests__/translations-screen.test.ts:283` · `status-badges.test.tsx:15` · `label-weight.test.ts:18` · `icon-tile.test.tsx:18-33` | `orphaned ? "danger"` · `danger` variant 클래스 | K (D3②) | T11 |
| `components/__tests__/projects-screen.test.ts:130-139`(`STATUS_CHIP`, 칩 순서 — 없으면 신규) | 칩 실패 > 끊김 | Q2 | T4 |
| `lib/projects/__tests__/list.test.ts` | (신규) 칩·띠가 끊김 먼저로 일치 · PR `undefined` → Couldn't check 띠 | Q2 · Q6 | T4 · T7a |
| `components/__tests__/projects-screen.test.ts:151-152` | `text-neutral-600` 덮개 | 1-Y8 | T19 |
| `components/__tests__/projects-screen.test.ts:269,301` · `sidebar-selection.test.ts:27` · `public-shell.test.tsx:218` | hover 철자 | 5-Y8 | T23 |
| `components/__tests__/publish-button.test.tsx:64,158,160,185` | "Everything you've edited is already sent." 등 | 2-Y6 | T15 |
| `components/__tests__/new-project.test.tsx:475,522,1124` · `app/oauth/authorize/__tests__/page.test.tsx:107`(`not.toContain("Go to your projects")` — 2-Y16 적용 시 방향이 뒤집힌다) | "Open projects" · "authorization expired" · App 호칭 | 2-Y16 · 2-Y12 | T16 |
| `lib/i18n/__tests__/dictionary.test.ts:21,37-38,43` · `edit-loss-banner.test.tsx:21,29` · `a11y-reasons.test.tsx:53,115`(키 이름 `repositorySync.paused`) · `unmanaged-entries.test.tsx:37` · `home-vocabulary.test.ts:299-300` | paused·held·축약형·"Never" | 🔴 H·I · 2-Y15 · 1-Y17 | T15 |
| `lib/events/__tests__/view.test.ts:31-33` · Logs 성공 톤 단언 | 라벨 non-null·서로 다름 · `sent → success` | 1-Y2 · D3③ 예외 | T10 |
| `primitive-focus.test.tsx:26,48,114,142,164` · `dialog-layer.test.tsx:7` | 초기 포커스가 헤더 X | 3-Y4 | T13 |
| `app/(edit)/account/__tests__/structure.test.tsx:299-333` | `signOut`이 `aria-haspopup="dialog"` 트리거 · 트리거 3개 | Q4 | T22 |
| `home-vocabulary.test.ts:137` · `home-screen.test.ts:244,248` · `home-landmarks.test.tsx` | Recent logs 배지 위치·카드 머리 | D3⑤ · 5-Y12 | T18 |
| `lib/github-connect/__tests__/probe-memo.test.ts:86-90` | memo 호출부 = Home 하나 | — (번역 화면은 memo를 켜지 않으므로 **그대로**) | — |

`components/__tests__/logs-screen.test.ts:193`(이력 상세 `rounded-xl`)은 **그대로 둔다** — Q8에서 크기 급 규칙으로 확정했다.
`mcp-connected-apps.test.tsx:86`("Never", 마지막 사용)은 **그대로 둔다** — Q14.

**뒤집을 때 단언을 클래스 문자열에서 상태 키로 옮긴다** — 조사 문서 §1.3: 클래스 문자열 단언은 한 화면 안의 결정만 지켰다.
