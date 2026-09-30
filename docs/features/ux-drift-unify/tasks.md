# ux-drift-unify — tasks

순서: **정본 문서 → 순수 판정 → 프리미티브 → 사전 → 화면 → 불변식 테스트 → 문서 마무리.** 정본을 코드보다 앞에 두는 이유는 화면 태스크가
맞춰 볼 기준이 먼저 서야 해서다(조사 문서 §1.1 — 기준이 없어서 화면마다 톤을 새로 골랐다).
`[commit]`이 커밋 경계이고 **경계마다 `pnpm gate` green**이다(출력을 파이프로 거르지 않는다 — POSTMORTEM 2026-09-30). 라벨: **[자동]** `pnpm test`·`pnpm typecheck`·`pnpm exec vitest run` · **[수동]** 브라우저 확인·문서 대조.

**선행 순서(spec)** — `translation-filter-scope` T12가 들어간 뒤 T20에 착수한다. `nightly-sync` G5는 T1이 흡수한다.

항목 ID는 2026-09-30 전수조사의 차원별 원본을 가리킨다(`1`=상태 · `2`=문구 · `3`=동작 · `4`=구조 · `5`=시각 토큰 · `6`=판정 · `7`=가이드,
`R`=🔴 · `Y`=🟡 · `W`=⚪). 🔴 문자는 spec의 통합 목록(A1~N)이다. 원본 파일은 세션 스크래치패드에 있었고 커밋하지 않는다 — 근거 줄은 각 태스크에 옮겨 적었다.
**이 문서에 적힌 ID가 이 기능의 닫힌 범위다**(spec 완료 조건 13). 뺀 항목은 맨 아래 "제외 ID" 표에 있다.

⚠️ **T1은 미래형 정본이다** — T1부터 T29까지 DESIGN과 코드가 어긋난 채 중간 push가 일어나고, `/push` 4단계가 문서 신선도 경고를 낼 수 있다. 그 경고는
이 기능의 T29 재대조가 받는다(차단 아님).

## A. 정본 문서

- ✅ **T1** (U1) `docs/DESIGN.md`
  - §2.4 상태 표: `unpinned`(설치 있음·리포 미고정) → Disconnected 행(D1) · "알려진 틈"에 넷 — App 제거 · `installation-changed` · `repo-replaced` · 목록(`lastPrUrl` 번호)/Home(sync 브랜치) PR 조회 대상 차이(D2) ·
    **예외 둘**(번역 화면 `pending-edits` 배너 neutral · Logs 성공 neutral — D3①·D3③) · §2.4가 `lib/status/canon.ts`를 코드판 정본으로 가리키는 한 줄 ·
    **글리프 열**(실패 `CircleX` · 경고 `TriangleAlert` · 필드 오류 `CircleAlert` · 검토 대기 `Eye`, 5-Y4·5-Y5) ·
    **동작 규칙 두 줄**(확정이 `danger`면 트리거도 `danger` — Sync 예외 · 독립·행 링크의 파랑 = 새 탭 외부만, 문장 안 인라인 링크는 파랑 허용, 3-Y2·4-R2) ·
    Q1(Logs 결과 배지는 종류를 빼고 "Failed") · Q2(칩 순서 Disconnected > Sync failed > Partially synced > …) · Q5("Unavailable" 행) ·
    Q6(보류 행에 "PR 조회 실패 → Held + couldn't check for an open pull request", 목록 띠 warning) · Unsent = `Badge neutral`(Q3) · 국기 글리프 면제(D3②).
  - §6.2: 보류 배너 neutral 행(:438)과 옛 "paused" 문구 → warning + 번역 화면 예외(D3①) · orphaned `danger` 문장(:417 근거 포함) → `missing`(D3②) ·
    Logs 글리프 "별도 축" → 결과 칩은 §2.4 칸, 종류 칩만 별도(D3③) · :423(Logs Sent muted · "Running…" · `Badge danger`) · :421·427("amber는 Disconnected 하나뿐"·칩 5종) ·
    :416(`Badge muted` "Not yet sent") · :521("초록·빨강을 두 자리 밖으로 넓히지 않는다") · PR 카드 green-800 문장 삭제(5-Y15) · "Publish 성공 둘은 무색 블록" 등재 삭제(Q10) ·
    :445 `IconTile` 소비자 목록.
  - §5: radius 크기 급 — 확인 Dialog 12 · 1024 모달·이력 상세 16(Q8) · 누를 수 있는 행 hover 2%(카드 안)·3%(캔버스·모달) 구분과 철자 `/[0.0N]` 하나(5-Y8).
  - §6.4 Dialog 행: Cancel `default`(D3④) · 확정 뒤 절차 (a) 기본 + (b) 행이 사라지는 확인(토큰 폐기·연결 앱)만 예외(3-Y3) · 1024 바닥 규칙(3-Y6) ·
    :619 X 버튼 → 원형 `CloseButton` · 초기 포커스 = 푸터 Cancel 규칙(3-Y4).
  - **§6.67:1701**: 로그아웃 확인 없음, "Sign out everywhere"만 확인(Q4). §6.64: Home 할 일 행 보조줄은 아래(Q9). §6.68:1727: Logs ResultBadge 성공 neutral 유지(D3③ 예외).
  - 1766행: 결과 배지는 행 오른쪽(D3⑤). :1113 nightly 표기 → 배지 먼저(nightly G5 흡수). :1103·:1209 "paused". :1356 Logs `Not sent` → 사전과 맞춤("Held back").
  - §6.8: 검색 0건 `SearchX`·프로젝트 0개 `Box`(5-W3), 소스 0개 = `EmptyRowCard inset`(5-Y18 — :628의 "Sources 빈 카드 = `IconTile lg`" 교체). §4: "`Not sent` 알약" → Unsent(2-W10).
  - §10.1: design §5의 개념 행을 올린다(개념 색인). Home 카드 제목 To send/review/translate(동사형)와 상태 낱말의 품사 차이를 한 줄로 등재(1-W8).
  - 원본 ID 대응(D3로만 다뤄지던 것): 1-W1(D3①) · 1-W2(D3②) · 1-Y16(D3③) · 3-Y5(D3④) · 4-W12(D3⑤) · 5-W6(Q8).
  - :137 "목록은 행마다 GitHub을 부르지 않는다" → "목록의 **연결 판정**은 GitHub을 보지 않는다"(원격 신호는 이미 부른다).
  검증 [수동]: 아래 체크리스트를 §2.4와 나란히 읽어 전부 ✓ — D3① · D3② · D3③ · D3④ · D3⑤ · Q1 · Q2 · Q3 · Q4(§6.67) · Q5 · Q6 · Q8 · Q9 · Q10 · 예외 둘 · 알려진 틈 넷 · 글리프 열 · 동작 규칙 둘.
  DESIGN을 읽는 자동 테스트는 **지금 없다**. [자동] `pnpm test` green(문서만 바뀌므로 회귀 없음 확인).
  `[commit] docs(DESIGN): state table owns tone, word, glyph and action rules`
- ✅ **T2** (U1) `guide/AUTHORING.md` `#labels` 표: 미전달 = 화면 상태 낱말 **Unsent**, 산문 "unsent edits" · 보류 산문 "held"(CI 로그 인용 `deferred` 예외) (7-#5·#4).
  검증 [수동]: `#labels` 표의 상태 낱말이 §2.4 낱말과 한 줄씩 대조해 모순 0.
  `[commit] docs(guide): align the authoring vocabulary with the state table`

## B. 순수 판정 (테스트 먼저) — 커밋 넷

- ✅ **T3** (U2) 연결 — 🔴 C · 6-Y6 · D1.
  - `lib/github-connect/health.ts` `unpinned` 갈래 · `lib/github.ts:167` `repositoryId === null`이면 probe 생략 · `lib/home/state.ts` `connectionProblem`·`planHomeState` ·
    `components/settings/repository-card.tsx`가 `connectionProblem`을 부름(`isDisconnected` 삭제, `unpinned` 버튼 Reconnect).
  - 적재 거부 경로(`lib/import/run.ts:89` · `lib/onboarding-run/import.ts:49` · `lib/import/plan.ts:19`)의 `repositoryId null` 갈래 문구 → Disconnected 낱말(코드 값 불변).
  - MCP 출력 경계 `lib/mcp/tools/project.ts:60`: `unpinned → "not-connected"` 매핑(spec Q12 — 출력 불변).
  - Reconnect(`connectRepository`, `settings/actions.ts:241`)에 `revalidatePath("/projects")` 추가.
  - 뒤집는 테스트: `health.test.ts:147`, `state.test.ts:106`.
  - 신규 테스트: **`unpinned` × probe 3종(`ok`·`not-installed`·`error`) → 항상 `unpinned`**, `repositoryId null`이면 probe 미호출, Settings 배지·버튼 표(`unpinned`+`error` 포함),
    거부 문구 키, `read-tools.test.ts`에 `repositoryId null` → `connection: "not-connected"`, `connectRepository`의 `revalidatePath` 인자 단언.
  검증 [자동]: `pnpm exec vitest run lib/github-connect lib/home lib/import lib/mcp components/__tests__/*repository* app/\(edit\)/projects` green.
  `[commit] refactor(connection): unpinned projects read as disconnected everywhere`
- ✅ **T4** (U2) 실패 집계 — 🔴 E · 6-Y7 · 6-⚪15 · Q2.
  - `projectSyncFailure(surfaces)` 신규 · `lib/keys/query.ts:349-350`의 행 조립을 **순수 함수로 떼고** 평탄화 제거(표면 배열을 넘김) · 칩·띠·`meterSlot`·Home 배너(`page.tsx:224`)가 부름.
  - **칩 순서만 고친다**(`project-list.tsx:246-249`, 끊김 먼저). 공유 우선순위 표는 두지 않는다.
  - 테스트: A 동기화 중 + B 실패 → failing · A partial + B failed → failed · 전부 동기화 중 → null · 빈 배열 → null · `repositoryId null` + 실패 → 칩·띠 모두 Disconnected ·
    행 조립 함수 단위 테스트. `test:projects:postgres`에 "A 동기화 중 + B 실패" 행 추가.
  - 뒤집는 테스트: `projects-screen.test.ts:130-139`(`STATUS_CHIP` — 칩 순서 단언이 없으면 신규). `list.test.ts`에 칩·띠 일치 신규.
  검증 [자동]: `pnpm exec vitest run lib/projects lib/keys components/__tests__/projects-screen.test.ts` green + `pnpm test:projects:postgres` green(`pnpm gate`가 `lib/keys/` 트리거로 붙인다 — 손으로 판정하지 않는다).
  `[commit] fix(projects): pick the worst surface failure and put disconnection first on the chip`
- ✅ **T5** (U2) 행동 가용성 — 🔴 F(순수). `planActionAvailability` 신규, Home `page.tsx:243`이 부름. 테스트: 보관 · 보관+끊김(꺼짐) · not_connected 넷 · `unpinned` · `unknown`(켜짐).
  검증 [자동]: `pnpm exec vitest run lib/home` green.
- ✅ **T6** (U2) 결과 톤 — 🔴 B. `TONES` export · `summarizeImport.tone` ← `TONES[summarizeImportEvent]`, 타입 `EventTone`으로 확장(소비자 `sync-result.tsx:82`).
  `result.test.ts:11` 뒤집기 + 합치 테스트(입력원 `view.test.ts:293-319`, `finishSurface` 모양만 — POSTMORTEM 2026-09-16, 일부 superseded + 일부 partial 포함).
  검증 [자동]: `pnpm exec vitest run lib/import lib/events components/__tests__/sync-result.test.tsx` green.
- ✅ **T7** (U2) 표면 적재 상태 — 🔴 A1 · 6-Y8 · 6-⚪13. `planSurfaceImportStatus` → `{ state, tone, labelKey, at: lastImportedAt }`. 테스트: partial → warning, imported → success.
  뒤집는 테스트: `surface-status.test.ts:8-9`.
  검증 [자동]: `pnpm exec vitest run lib/import` green.
- ✅ **T7a** (U2) 보류 표시 — 6-Y9 · 6-Y10 · Q6.
  - `planHoldNotice({ pending, openPr, gateApplies, archived, connection })` 신규 — **`lib/protection/plan.ts` 안**(잎, `client-graph.test.ts:405-411` 그대로).
    테스트: 보관·끊김 → null · 편집 > 0 → pending-edits · 편집 > 0 + PR 조회 실패 → pending-edits · `gateApplies=false` + 편집 > 0 → pending-edits ·
    편집 0 + PR 열림 → open-pr · 편집 0 + PR 조회 실패 → pr-check-failed · 편집 0 + `gateApplies=false` → null.
  - `lib/home/cards.ts`·`meta.ts`의 **순수 부분**이 `planHoldNotice`를 읽는다(화면 배선은 T18).
  - `lib/projects/remote.ts` PR 신호 삼상태화 — **네 경로**: ① `Promise.allSettled`로 PR·compare 분리 ② catch → `undefined` ③ `withDeadline` 마감 → 전 행 `undefined`
    ④ `lib/keys/query.ts:344`가 `undefined`를 보존. 설치·리포 없음·보관·PR 번호 없음 → `null`. `remote.ts:15-17` 주석 갱신. `rowBanner`에 "Couldn't check" 띠(`pr_open` 자리, warning).
    테스트: 네 경로 각각 `openPr === undefined` · compare만 거부되면 PR 결과 보존 · compare 거부는 기존대로 없음 · `null` 갈래 넷 · 띠 순서.
  - 뒤집는 테스트: `cards.test.ts:83-84` · `meta.test.ts:27,91,93,135,153,167,190` · `runs.test.ts:42` · `sync-time.test.ts:37` · `runs.integration.ts:72,82`.
  검증 [자동]: `pnpm exec vitest run lib/protection lib/home lib/projects` green + `pnpm test:projects:postgres` green(④가 `query.ts`).
  `[commit] refactor(status): one judgment for actions, run tone, surface status and holds` (T5–T7a) — `pnpm gate` green.
- ✅ **T8** (U2) `lib/status/canon.ts` 신규 — design §3.6. `StateTone`(EventTone 어휘) · 행마다 `{ tone, variant, label }` · **소비자가 쓰는 키만**.
  테스트: 전 키의 `label`이 사전 값 · `danger` 톤 → `missing` variant · `client-graph.test.ts`의 `CLIENT_LIB_FILES`(93-)에 등재 + 잎 테스트(363-447 관례). **DESIGN 행 수 대조는 두지 않는다.**
  검증 [자동]: `pnpm exec vitest run lib/status components/__tests__/client-graph.test.ts` green.
- ✅ **T9** (U2) `isExpired(expiresAt, now)` — 6-⚪14. 초대·MCP 토큰 사본 여섯(design §3.7)을 교체, 경계(정각 = 만료) 테스트. OAuth 5곳은 제외(spec Q14).
  검증 [자동]: `pnpm exec vitest run lib/auth lib/invitation-email lib/mcp` green.
- ✅ **T10** (U2) Logs 판정 `lib/events/view.ts` — 1-Y2/2-Y2(Sync `Syncing…`/Publish `Publishing…`) · 4-Y20(IMPORT 인라인 결과 낱말 제거, 소스는 배지) · Q1(Sync 실패 결과 배지는 "Failed" 유지) ·
  **성공 톤 `muted`(D3③ 예외, 1-Y16)** · 2-W9 일부(`view.ts:118` `NIGHTLY_CLAUSE` 리터럴 사본 → 사전) · `notSent`는 그대로(Q14) · `view.test.ts:31-33` 전제를 "(종류, 결과)마다"로. 결과 칩 톤을 `STATE`에서(D3③).
  검증 [자동]: `pnpm exec vitest run lib/events` green.
  `[commit] refactor(status): state canon, expiry and Logs judgment` (T8–T10) — `pnpm gate` green.

## C. 프리미티브

- ✅ **T11** (U3) `IconTile tone` · `StatusBadge` 신규 · `Badge`의 `danger` variant 삭제와 `missing`의 `gap-1.5` 삭제(D3② · 1-W2 · 5-Y19).
  - **같은 커밋에서** 유일한 `danger` 소비자 `components/translations/locale-badge.tsx:80` → `missing`(🔴 K — T20에서 당겨옴, 국기 면제).
  - `visual-system.test.ts` `REGISTERED`(`:97` amber · `:116` green)에 `icon-tile.tsx` 등재.
  - 테스트: tone별 클래스 = §2.4 칸 열, `StatusBadge` 전 `StateKey` 렌더(variant = `STATE[k].variant`).
  - 뒤집는 테스트: `status-badges.test.tsx:15` · `label-weight.test.ts:18` · `translations-screen.test.ts:283` · `icon-tile.test.tsx:18-33`.
  검증 [자동]: `pnpm typecheck` green(`danger` 참조 0) + `pnpm exec vitest run components/__tests__/{status-badges,label-weight,translations-screen,icon-tile,visual-system}*` green.
- ✅ **T12** (U3) `CountBadge` 신규 — 0이면 null, `aria-hidden` 숫자 + sr 문장. `PanelCard`·`RowCard`·`PanelHeader`에 **`count` prop 신설**(`badge` 슬롯은 그대로). 🔴 M · 4-Y5 · 5-W5(`surface-selector` 기본 `muted`).
  **소비자 전부 교체(spec Q13)**: `attention-card:61` · `sources-screen:72,78` · `source-detail-modal:144` · `tree-panel:41` · `key-list:50` · `workspace:585` · `project-list:145` ·
  `sidebar:206` · `segmented-control:77` · `surface-selector:26` · `publish-button:134`. ⚠️ `key-list`·`workspace`·`tree-panel`은 `translation-filter-scope` 뒤에(선행 순서).
  뒤집는 테스트: `members-cards.test.tsx:67,263` · `card-head.test.ts:20` · `panel-header.test.tsx` · `account/__tests__/structure.test.tsx:290`.
  검증 [자동]: `pnpm exec vitest run components` green + 소비자 목록 grep(`<Badge[^>]*>{` 꼴 손 조립 0).
- ✅ **T13** (U3) `CloseButton`(`modal.tsx:205`에서 추출, X 다섯 형 전부 채택) · 수제 스피너를 `Button busy`/`loading`으로(새 prop 없음 — design §4) · `DialogContent` 초기 포커스 = 푸터 Cancel 표식(조건부, `log-filters:299` opt-out, 수동 지정 3곳 대체). 5-Y9 · 3-⚪13·⚪16 · 5-Y14 · 3-Y4.
  뒤집는 테스트: `primitive-focus.test.tsx:26,48,114,142,164` · `dialog-layer.test.tsx:7`.
  검증 [자동]: `pnpm exec vitest run components` green.
  검증 [수동]: design §4의 13곳 Dialog를 브라우저로 열어 첫 포커스가 Cancel(`log-filters`는 첫 날짜 입력)·닫힌 뒤 트리거 복귀(POSTMORTEM 2026-09-20·24).
- ✅ **T14** (U3) `PanelCard` — 머리 아래 선은 머리가 긋고(notice 아래), 자식 `border-t` 금지 · `PanelHeader`(`components/shell/content-panel.tsx:76`) `notice` 슬롯(`description` 아래) + `min-h-9`, 수동 `min-h-9` 4곳 제거. 4-Y1 · 4-Y7 · 4-Y8 · 4-W1(카드 제목 자간·머리 gap 한 벌).
  소비자 14곳 표(design §4)와 `settings/page.tsx:62` Alert 순서 변경.
  뒤집는 테스트: `card-head.test.ts:19-23` · `panel-card.test.tsx:27` · `panel-header.test.tsx`.
  검증 [자동]: `pnpm exec vitest run components app` green. 검증 [수동]: 소비자 14곳 카드를 하나씩 열어 머리 아래 선 1개·중복 0.
  `[commit] feat(ui): status, count and close primitives carry the state table` (T11–T14)

## D. 사전 (messages/en.tsx) + 개념 색인

- ✅ **T15** (U4) 상태 낱말 — design §5 표의 상태 행 전부. 1-Y1/2-Y1 · 1-Y2/2-Y2 · 2-Y3 · 🔴 H(1-Y3/2-R2) · 🔴 I(1-Y4/2-R3) · 1-Y5 · 1-Y6/2-W8 · 1-Y11/2-Y4 · 1-Y13/2-Y8 ·
  1-Y17("Never" → "Not synced yet" — **동기화 문맥 키만**, MCP 연결 앱 "Never"는 유지) · 2-Y5 · 2-Y6 · 2-Y7(cells) · 1-W6 · 🔴 A2 문구(partial 제목·attention 문장) · 🔴 C 띠 문장(`unpinned`에서 참인 문장, "stop") ·
  열린 PR 조회 실패 문장("Couldn't check for an open pull request") · "Superseded" 보조 문장.
  - `terminology.test.ts`: `BANNED`에 §5 금지 목록 추가 + **`ALLOWED` 판정식 확장**(접두 허용 · 한 키에 금지어 여럿) + 판정식 메타 테스트.
  - **같은 커밋에서 가이드의 굵은 라벨을 새 낱말로**(`content.test.ts:71-77`): `guide/sync/logs.md:20` **Held because**·**Unsent edits** · `guide/translate/publish.md:33,36` 외 게이트가 잡는 줄.
  - 뒤집는 테스트: `sync-result.test.tsx:48,66,73,87,108` · `publish-button.test.tsx:64,158,160,185` · `dictionary.test.ts:21,37-38,43` · `edit-loss-banner.test.tsx:21,29` ·
    `a11y-reasons.test.tsx:53,115`(키 이름 `repositorySync.paused`를 바꾸면 소스 검사도) · `unmanaged-entries.test.tsx:37` · `home-vocabulary.test.ts:299-300`.
  검증 [자동]: `pnpm exec vitest run lib/i18n lib/guide components` green, 금지 목록 0건.
- ✅ **T16** (U4) 일반 문구(**사전만** — 컴포넌트 변경은 화면 커밋으로) — 2-Y10/3-Y11(Remove·Upload) · 2-Y11/1-W5(revoked) · 2-Y12(App 호칭) · 2-Y13(Account) · 2-Y14(Settings 대문자) · 2-Y15(축약형) ·
  2-Y16/4-W10("Go to your projects") · 2-Y17/3-Y9("Open on GitHub") · 2-Y20 · 2-Y21 · 3-Y10(확정 = 동사+목적어) · 4-Y21(상세 종류 낱말) · 2-Y9(Q5: "Unavailable" 하나) ·
  2-W2 · 2-W3 · 2-W4 · 2-W7(base branch).
  - **같은 커밋에서 가이드 굵은 라벨**: `guide/account.md:10` **Image upload** → **Upload** 외 게이트가 잡는 줄.
  - 뒤집는 테스트: `new-project.test.tsx:475,522,1124` · `oauth/authorize/__tests__/page.test.tsx:107`(`not.toContain` 방향 반전). `BANNED`에 축약형·호칭 항목 추가.
  - 2-Y18(`repo.tsx:174-175` placeholder·label 분리)·2-W9(`files.tsx:564,574` 리터럴 → 사전)는 **T22**로 옮긴다(컴포넌트 변경).
  검증 [자동]: `pnpm exec vitest run lib/i18n lib/guide components app` green, 금지 목록 0건, `brand-spelling` green.
  `[commit] fix(copy): one word per concept across the dictionary` (T15–T16)

## E. 화면

각 태스크는 **상태 키·tone을 넘기고 variant·색 문자열을 고르지 않는다**. 뒤집는 테스트는 클래스 문자열 대신 상태 키·`data-tone`으로 단언을 옮긴다.
**화면 태스크의 공통 검증** — [자동] 그 화면 스위트 + 뒤집은 단언이 상태 키·`data-tone`으로 옮겨졌는지 `pnpm exec vitest run <파일들>` green. [수동]은 태스크별로 적는다.

- ✅ (U6) **T17 Sources** — 🔴 A1(행 칸 `IconTile tone`) · 🔴 J(결과 행 `BannerLine tone`, 상세도) · 5-Y6(성공 칸 초록) · 4-Y6(총계 카드에만) · 4-Y11(chevron muted) ·
  4-Y14(0개 = `EmptyRowCard inset`) · 4-Y16(골격 설명 줄·버튼 제거) · 4-Y23(`ArrowRight` → `ChevronRight`) · 5-Y7(선택 면 0.07) · 5-Y10(사라짐 띠 → `BannerLine danger`) ·
  5-Y14(수제 원 스피너) · 5-Y18(Meter 막대 — `LocaleMeter`와 공유) · 5-Y19(배지 글리프) · 5-W4(`Plus` 16) · 6-⚪13(`statusAt` 인라인 제거) ·
  4-Y24·5-Y1(Sources 보관 화면 — 머리 Archived 배지 = `StatusBadge archived`, 출구 낱말 하나) · 4-W13(`sources/loading.tsx:31,45` 골격 카운트 원).
  뒤집는 테스트: `sources-screen.test.tsx:201` · `sibling-loading.test.tsx:101-102` · `screens.test.ts:402`(소스 문자열 확인).
  검증 [자동]: `pnpm exec vitest run components/__tests__/sources-screen.test.tsx app` green. [수동]: partial 소스 행이 호박·"Partially synced".
- ✅ (U7) **T18 Home** — 🔴 A2(메타 "failed" → partial은 warning 배지 · 실패만 Sync failed) · 🔴 B(Sync 결과 neutral) · 1-Y7/5-Y1(보관 `StatusBadge`) · 1-Y14(미연결 거부 neutral / 끊김 warning) ·
  4-Y4(행 선 RowCard 규칙) · 4-Y19·4-W11(메타 배지-먼저, `[Nightly sync] 1d ago`, 색 글자 → 배지) · 5-Y3(호박 글자 700) · 5-Y4(`CircleX`) · 5-Y5(`Eye`) ·
  5-Y12(카드 셋 → `PanelCard`) · 3-⚪15(Try again 글리프) · 4-Y10(Q9: 할 일 행 보조줄 아래로) · D3⑤/4-W12(Recent logs 배지 오른쪽) · 1-W4(메타 꼬리 소문자 — 배지화로 소멸) ·
  4-Y14(Home 부분 — `attention-card.tsx:66`·`logs-card.tsx:37` 카드 안 빈 상태를 Sources와 같은 형) ·
  Q6(**`pending > 0`이면 PR 조회 생략**, 아니면 `loadOpenPrUrl` promise를 보조줄·메타에 **Suspense 스트리밍**, `pr-check-failed` = Held + 사유).
  측정 [수동]: T20과 같은 방식·판정선으로 Home 착지.
  뒤집는 테스트: `home-meta-trigger.test.tsx:32,40,41,46-58` · `sync-result.test.tsx:161`(거부 tone, 1-Y14) · `home-vocabulary.test.ts:137` · `home-screen.test.ts:244,248` · `home-landmarks.test.tsx`.
  검증 [자동]: `pnpm exec vitest run lib/home components/__tests__/home-* components/__tests__/sync-result.test.tsx` green. [수동]: PR 열림·편집 0 프로젝트 Home에서 Held 보조줄이 늦게 도착하고 본문은 막히지 않음.
- ✅ (U7) **T19 /projects** — 🔴 N(내부 이동 foreground + chevron, 외부만 파랑) · 1-Y8(`text-neutral-600` 덮개 제거) · 4-Y9(보조줄 13) · 5-Y4(띠 실패 `CircleX`) ·
  4-Y15(좁힌 0건 = Logs 형) · 4-Y17(loading 낭독 줄) · 4-W13(골격 카운트 원) · Q6(PR 조회 실패 띠 "Couldn't check for an open pull request" 렌더).
  뒤집는 테스트: `projects-screen.test.ts:151-152`.
  검증 [자동]: `pnpm exec vitest run components/__tests__/projects-screen.test.ts` green.
- ✅ (U7) **T20 번역 화면** — 🔴 F(**DB 판정으로 첫 렌더부터 끔** + `loadConnectionHealth` promise를 Suspense로 내려 나머지 갈래, `memo` 없음, 워크스페이스가 `planActionAvailability`) ·
  1-Y9/5-Y2(Unsent `Pill`(`key-list.tsx:99,112`·`locale-panel.tsx:250`) → `StatusBadge unsent`, Q3) · 보류 배너 `pending-edits` neutral(D3① 예외) ·
  3-Y2(Revert 트리거 `danger`) · 3-⚪13(스피너) · 5-Y17(팝오버 `shadow-md`).
  측정 [수동]: 기준 SHA = **T17 직전 커밋**, 로컬 production 빌드에서 번역 화면 착지의 `loadEventEnd`·`responseEnd`를 전후 **5회씩 중앙값** — +150ms 또는 +15% 초과면 멈추고 보고한다(spec Q7).
  preview(`dev.mal-moi.com`)에서 1회 교차 확인. 결과를 ARCHITECTURE §1.95 표에 추가(T29).
  검증 [자동]: `pnpm exec vitest run components/__tests__/translations-screen.test.ts lib/github-connect/__tests__/probe-memo.test.ts` green(memo 호출부 불변).
  [수동]: 선택 행·hover 행 위의 Unsent 배지 대비 · `repositoryId null` 프로젝트에서 Publish·Sync 첫 렌더부터 꺼짐.
- ✅ (U6) **T21 Logs** — D3③/1-Y16(결과 칩 §2.4 칸, 성공 neutral) · 4-Y2/5-Y11(`rounded-lg`, 골격도) · 4-Y3(첫 행 선) · 4-Y21(상세 머리 `[종류][결과]` 배지) · 3-Y6(상세 바닥 `lg`) · 3-⚪16(`CloseButton`) · 4-W9(골격 chevron 칸).
  뒤집는 테스트: `visual-system.test.ts:199,225`.
  검증 [자동]: `pnpm exec vitest run components/__tests__/logs-* components/__tests__/visual-system.test.ts` green.
- ✅ **T22** (U8) **Settings · Account · MCP · Members · 온보딩** — 3-Y10 나머지(확정 = 동사+목적어 — `members.remove`·`settings.account.disconnect`·`link.methods.disconnect`의 확정용 키, U4에서 넘어옴) · 🔴 L(MCP rotate 확정 `danger`, 트리거 "Rotate token") · 3-Y2(push rotate 트리거 `danger`) · 3-Y3(sessions → (a)) ·
  3-Y6(CI "Close", 초대 모달 Cancel) · 3-Y7(Publish 재로그인 새 탭) · 3-Y9(`ExternalLink` 제거 — `repository-card.tsx:4` 한 곳) · 3-⚪14(Retry `primary lg w-full`) ·
  3-⚪17(sessions `busy`) · 3-Y8(Q4: `/account` 로그아웃 Dialog 제거, "Sign out everywhere"는 유지) · 1-Y15(Repository 칸 tone) · 4-Y12(CI 행 hover) · 4-Y13(초대 띠 indent) · 4-Y22(사실 라벨 muted) · 5-Y10(MCP 로드 실패 → `Alert inset danger`) ·
  5-Y13(push 토큰 칸 — 온보딩·설정 한 형) · 5-W1(필드 오류 줄 — `FormGroup`의 줄을 떼어 넷이 공유) · 2-Y19(보관 `utcDay`, 방침 개정 이력 `utcDay`, 가입 `utcMonth` 신규 in `lib/utc-time.ts`) ·
  2-Y18(`repo.tsx:174-175` placeholder `…` + label 분리 — 번역 트리는 비목표) · 2-W9(`files.tsx:564,574` 리터럴 → 사전) — T16에서 옮김.
  뒤집는 테스트: `account/__tests__/structure.test.tsx:299-333`.
  검증 [자동]: `pnpm exec vitest run components app lib/utc-time` green. [수동]: 로그아웃이 확인 없이 되고 "Sign out everywhere"는 확인 · sessions 폐기 뒤 포커스 복귀(POSTMORTEM 2026-09-20·24).
- ✅ (U10) **T23 앱 셸 · 공통** — 3-⚪12(`publish-button.tsx:434,593` 내부 `<a>` → `ButtonLink` — T22에서 옮김, 파일 소유) · 4-Y24(project-archived 화면 — 출구 낱말을 T17과 하나로) · 4-Y18(`app/(edit)/error.tsx` = Logs 경계 형) · 4-W6(404 아이콘) · 4-Y17(`account/loading.tsx` 낭독 줄) · 4-W7·1-W7·2-W10(낡은 주석) ·
  4-W3(행 padding `py-[13px]`) · 4-W4·5-Y8(hover·선 철자 하나) · 4-W8(px 골격 → `SkeletonLine`) · 5-W2(`RotateCcw` = Clear filters만, Retry·재발급 글리프 정리) · 4-W2(Publish 경고 카드 radius·개수 배지) ·
  5-Y16·1-Y5(Q10: Publish 결과 `Notice` → `Alert` success·neutral·warning, 일부 보류 글리프에 톤) · IconTile 색 덮기 잔여(`onboarding/steps/{naming:256,files:178,repo:247}` · `token-grant-fields.tsx:134,173,220` — 면 색은 T28 허용 목록).
  뒤집는 테스트: `projects-screen.test.ts:269,301` · `sidebar-selection.test.ts:27` · `public-shell.test.tsx:218`(hover — T19에서 옮김).
  검증 [자동]: `pnpm exec vitest run components app` green.
- ✅ (U6) **T24 랜딩 목업** — 🔴 G(PR 카드 실물 `PrCard` 또는 같은 variant) · 1-Y10(미번역 muted) · 5-Y7(선택 면) · Unsent 표식(`mockup/translations.tsx:42`의 `Pill` 사본 → T20과 같은 형). 가능하면 실물 컴포넌트·상수를 import한다.
  뒤집는 테스트: `visual-system.test.ts:104-106,111,117`(등재 목록에서 목업 줄 제거).
  검증 [자동]: `pnpm exec vitest run components/__tests__/visual-system.test.ts components/__tests__/*landing*` green + `Pill` export 0(고아 없음).
  `[commit]` 화면마다 하나(T17–T24, 8개) — `fix(sources): …` 꼴. 각각 `pnpm gate` green.

## F. 가이드

- ✅ **T25** (U9) 본문 — 7-#3(축 이름 대신 보이는 기본값) · 7-#4(보류 산문 held, CI `deferred`는 "Logs shows it as **Held**"로 잇기) · 7-#5(unsent edits) ·
  7-#6(배지 → 동작 짝: Disconnected → Reconnect, Not connected → Connect, Wrong repository → 새 프로젝트, Couldn't check → 새로고침; D1 반영) ·
  7-#7(Malmoi is ready = 마지막 단계) · 7-⚪16(CI `deferred` ↔ Logs Held 잇는 문장 = 7-#4와 같은 줄) · 7-⚪8(번역 화면 필터 순서 — `translation-filter-scope`가 끝난 뒤의 순서를 따른다, 선행 순서로 보장) · 7-⚪9~15.
  (굵은 라벨 중 사전 변경에 걸린 줄은 이미 T15·T16이 고쳤다 — 여기는 산문.)
  검증 [자동]: `pnpm exec vitest run lib/guide lib/i18n` green(`brand-spelling`이 가이드 md도 본다 — "the app" 소문자 문맥 주의).
- ✅ **T26** (U9) 게이트 — design §5.1 · 7-#1(state-filter 컷) · 7-#2(home-paused 컷 · SHOOTING.md:71).
  - `lib/guide/__tests__/content.test.ts:72-76`이 **`ARIA_ONLY` 키 목록**을 빼고 굵은 라벨을 대조(aria 전용 축 이름 red) + 목록 경로 실재 메타 테스트.
  - 가이드 산문에 §5 금지 동의어 0.
  - `lib/guide/stale.ts` 새 소스 종류 `dict:<키 경로>`(기준값 = 키 값 SHA-1) + `guide/SHOOTING.md` 매핑에 키 행(`state-filter.webp` → `translations.workspace.filters.state` 등) · SHOOTING.md:71 컷 설명 "held".
  검증 [자동]: `pnpm test` green · `pnpm guide:check`가 `state-filter.webp`·`home-paused.webp`를 stale로 낸다 · `dict:` 소스의 stale/정상/삭제 판정 단위 테스트.
  `[commit] docs(guide): state words match the screens and stale shots catch word changes` (T25–T26)

## G. 화면 간 불변식 테스트

- ✅ **T27** (U5) 신규 `lib/status/__tests__/cross-screen.test.ts` — design §3.8, spec 완료 조건 3의 행렬 전 칸(N/A 칸은 "받지 않음" 단언).
  입력은 `finishSurface`·조회가 실제로 만드는 모양만.
  검증 [자동]: `pnpm exec vitest run lib/status` green. 카나리아: 한 판정(예: `connectionProblem`의 `unpinned`)을 메모리에서 바꾸면 red.
- ✅ **T28** (U11) `components/__tests__/visual-system.test.ts` 확장 + DOM 테스트.
  - **위반표 먼저** — 규칙마다 "지금 위반 목록 → 해소 태스크"를 표로 두고, 해소되지 않는 항목은 사유와 함께 허용 목록:
    | 규칙 | 지금 위반 | 해소 |
    |---|---|---|
    | `ExternalLink` import 0 | `repository-card.tsx:4` | T22 |
    | `ui/` 밖 `animate-spin` 0(`[&_.animate-spin]` 선택자 제외) | 11곳(design §4 `Button` 행) | T13 · T17 · T20 · T22 · T23, 나머지 허용 목록 |
    | 셸 안 카드 `rounded-xl` 0 | Logs(T21) | T21 |
    | `"partial-import"` 비교 0(`import-failure.ts` 밖 · `app`·`components`·`lib` · 테스트·사전 키 제외 · `===`/`!==`만) | `sources-screen.tsx:103` 등 | T7 · T17 |
    | `IconTile` tone 색(green·amber·destructive) `className` 0 | 4곳 + `token-grant-fields.tsx:173` | T17 · T18 · T21 · T23 (면 색 `bg-muted`·`bg-background` 허용) |
    | `TriangleAlert`가 danger tone 옆에 서지 않는다 | — | T17 · T18 |
  - 각 grep 규칙에 **메모리 카나리아**(`visual-system.test.ts:272-279` 관용구 — 실제 소스 문자열을 메모리에서 위반으로 바꿔 red) + **스캔 대상 수 하한**.
  - **동작 규칙 둘은 DOM 테스트** — "확인 Dialog 확정이 `danger`면 트리거도 `danger`"(Sync 예외)는 Dialog 트리거 목록을 렌더해 variant 짝을 센다.
    "셸 안 독립·행 링크의 `text-blue-600`은 `target=_blank`"는 렌더 결과의 링크를 센다(문장 안 인라인 링크 예외 — 부모가 문단인 링크).
  - 뮤테이션은 **커밋 뒤에 걸거나 파일 사본으로 복원**한다 — `git checkout -- <디렉터리>` 금지(POSTMORTEM 2026-09-16).
  검증 [자동]: `pnpm exec vitest run components/__tests__/visual-system.test.ts` green + 카나리아 전부 red→green 확인. [수동]: 규칙 하나씩 실제 소스에 위반을 넣어 red(사본 복원).
  `[commit] test(status): cross-screen invariants for tone, word and actions` (T27–T28)

## H. 문서 마무리

- ✅ **T29** (U11) `docs/DIRECTORY.md`(신규 `lib/status/`·`components/ui` 프리미티브) · `docs/ARCHITECTURE.md`(`unpinned` 연결 갈래 · §1.95에 T18·T20 측정 행 · 번역 화면 연결은 DB 판정 + 스트리밍) ·
  T1에서 미래형으로 적은 문장이 구현과 맞는지 재대조. (MCP §6.45는 출력 불변이라 고치지 않는다 — spec Q12.)
  검증 [수동]: `/doc-check` 대상 DIRECTORY·ARCHITECTURE·DESIGN을 이 기능 diff와 대조해 틀린 단언 0.
- ✅ **T30** (U11) (Q11) `.claude/commands/ux-audit.md` 신설 — 리포트 전용, `/audit`과 같은 레인. 입력은 2026-09-30 조사 프롬프트(차원 7개 병렬), 기준은 DESIGN §2.4 +
  이번에 세운 불변식 테스트. 주기: `/merge` 전 또는 새 화면 핸드오프 뒤. 🔴는 이슈로, 정본 제안은 §2.4 후보로. ·
  `.claude/commands/implement.md`에 "새 사전 키를 만들기 전 같은 개념의 기존 키를 grep(DESIGN §2.4·§10.1 표)" 한 줄.
  **Codex 미러 포함**(리포트 전용이라 미러 제외 일곱에 들지 않는다) — `pnpm sync:agents` · CLAUDE.md 스킬 수 21 → 22와 워크플로 절(`/audit` 옆에 `/ux-audit`).
  검증 [자동]: `pnpm sync:agents:check` green · `.agents/skills/source-command-ux-audit/SKILL.md` 존재.
- **T31** 기능 종료 — 결론을 정본(DESIGN·ARCHITECTURE)으로 올린 것을 확인하고 `docs/features/ux-drift-unify/`를 지운다.
  검증 [자동]: `test ! -d docs/features/ux-drift-unify` · `pnpm gate` green.
  `[commit] docs: close ux-drift-unify`

## 제외 ID (닫힌 범위 밖)

| ID | 사유 |
|---|---|
| 6-Y11 | `role === "OWNER"` 손 비교 15곳 — `Permission` 확장은 PRODUCT §4.2 비범위 |
| 4-Y15(번역 화면 부분) | 번역 화면 검색 0건 빈 상태는 `translation-filter-scope`가 다시 설계한다 |
| 1-Y17(MCP 연결 앱 "Never") | 마지막 사용 시각이라 동기화 낱말이 틀린 문장이 된다(spec Q14) |
| 6-⚪14(OAuth 5곳) | 원본 6-⚪14는 초대·토큰 사본만 나열했다 — OAuth 인라인 비교는 spec Q14 범위 경계로 뺀다 |
| 1-W3 | "Sent" vs "Sent for review" — 감사가 허용 범위로 판정(문맥이 다르다) |
| 2-W1 | MCP 토큰 결과만 "Done" — 감사가 유지 판정(발급 결과를 확인하는 동작이라 "Close"와 뜻이 다르다) |
| 2-W5 | "Privacy Policy" Title case — 문서 고유명 예외 |
| 2-W6 | Logs 행 시각 "09:42" UTC 라벨 없음 — 날짜 머리 `utcDay`가 맥락을 주고 접근 이름은 `utcMinute`다 |
| 4-W5 | 이름 줄 배지 배치 두 형 — 렌더 결과가 같다 |
| 5-W7(Archived·만료 neutral-400 덮개) | 등재된 이탈(`status-badges.test.tsx:29`가 고정). neutral-600 덮개는 T19(1-Y8)가 해소한다 |
| 6-Y12 | 미전달 술어 손 사본 셋 — 감사 정본 제안이 현 상태 유지이고 `test:projects:postgres`가 대조한다 |
| 2-Y18(`tree-panel.tsx:51-52`) | 번역 트리는 `translation-filter-scope`가 설계한 자리라 비목표(T22 주석) |

원본 181건(중복 합쳐 157) 전수 대조는 2026-10-01 `/orchestrate` 인테이크에서 마쳤다 — 태스크에 없던 24건을 위 태스크 ID 표기 또는 이 표로 옮겼다.

## 런타임 검증 (2026-10-01 사용자 — 이 기능 안으로 당겼다, `/orchestrate` 마지막 단계)

- `/runtime-test` — 🔴 15건을 브라우저로 한 번씩 밟는다(특히 C·E·F: 픽스처가 필요하다 — `repositoryId` null 프로젝트, 표면 둘 중 하나 실패) + 각 배치 인계의 (b) 목록 + T18·T20 측정.
- `/guide-shots` — **전 컷 재촬영**(2026-10-01 사용자 — 직전 병합 때 촬영을 건너뛰었다): `public/guide/` 앱 화면 컷 전부 + README 전용 둘(`docs/assets/readme/hero.webp` · `logs.webp`) + 지난번 남은 `create-ready`. GitHub 화면 둘(`push-token-secret` · `actions-policy`)은 이 기능이 바꾸지 않은 GitHub UI라 SHA 대조만. runtime-test가 찾은 결함이 dev에 들어간 뒤.

## 오케스트레이션 (2026-10-01 `/orchestrate`)

### 배치 표

| 단계 | 배치 | 태스크 | 선행 | 워커 모델 · effort | 이유 |
|---|---|---|---|---|---|
| 1 | U1 정본 문서 | T1 · T2 | — | Opus · medium | 모든 화면이 맞춰 볼 정본이라 모순 판별이 핵심 |
| 1 | U2 순수 판정 | T3–T10 | — | Opus · high | 보호 게이트 옆·`query.ts`(postgres)·MCP 출력 경계 |
| 2 | U3 프리미티브 | T11–T14 | U2(`canon.ts`) | Opus · medium | 소비자 전수 교체, 포커스 규칙 |
| 2 | U5 교차 테스트 | T27 | U2 | Opus · medium | 새 테스트 파일 하나, 판정 결함은 U2로 돌린다 |
| 3 | U4 사전 | T15–T16 | U3 | Opus · medium | `terminology` 판정식 확장 + 테스트 뒤집기 다수 |
| 4 | U6 화면 A | T17 · T21 · T24 | U4 | Opus · medium | Sources · Logs · 랜딩 목업 |
| 4 | U7 화면 B | T18 · T19 · T20 | U4 | Opus · high | Suspense 스트리밍 배선 둘(Home PR · 번역 연결) |
| 4 | U8 화면 C | T22 | U4 | Opus · medium | Settings·Account·MCP·Members·온보딩 |
| 4 | U9 가이드 | T25 · T26 | U4 | Opus · medium | `stale.ts` 새 소스 종류(코드) 포함 |
| 5 | U10 공통 정리 | T23 | U6 · U7 · U8 | Opus · medium | 여러 화면에 걸친 일괄 치환 |
| 6 | U11 불변식·문서 | T28 · T29 · T30 | 전부 | Opus · medium | 위반표·카나리아·DOM 규칙 |
| 7 | QA | `/runtime-test` + T18·T20 측정 → `/guide-shots` | 전부 | Opus · medium | main 체크아웃(`.env.local`) |
| 8 | U11 이어서 | §1.95 측정 행 · T31 | QA | — | |

**겹침**: `messages/en.tsx`를 고치는 배치(U2·U3·U4·화면)는 단계를 나눴다. 4단계 병렬 넷은 자기 화면 키만 고치고 인계 전 `git rebase dev`.
`project-list.tsx`는 U2(칩 순서 줄만)·U3(카운트)·U7(T19)·U10(hover)이 순서대로 든다.

### 결정 기록

- 2026-10-01 사용자: **`/runtime-test`·`/guide-shots`까지 이 오케스트레이션의 마지막 단계로 돈다**(원래 "후속").
- 2026-10-01 지휘자: T18·T20의 전후 측정은 로컬 production 빌드 + DB가 필요해 워크트리(`.env.local` 없음)에서 못 잰다 — 7단계 QA 워커가 main 체크아웃에서 잰다.
  기준 SHA = U6·U7·U8 중 **첫 화면 커밋 직전 dev 해시**(인테이크 시점 기록). 판정선 초과면 멈추고 사용자에게 올린다(spec Q7).
- 2026-10-01 지휘자: 원본 대조로 빠진 24건을 흡수·제외했다(위 "제외 ID" 표와 각 태스크 ID 표기). 감사 자체가 허용·유지로 판정한 것만 제외했다.
- 2026-10-01 지휘자(U1 리뷰): **`TONES`의 성공은 `success` 그대로**이고 D3③ 예외(Logs 성공 neutral — Sent·Synced 둘 다)는 Logs 표시 층에서 건다.
  Home **Recent logs**는 같은 스트림·행 컴포넌트라 neutral을 따른다. Home 카드·메타·Sync 결과 Alert·Sources·목록은 success. 그래야 spec 완료 조건 6의
  합치 테스트(`TONES[summarizeImportEvent(x)] === summarizeImport(x).tone`)가 성공을 포함한 전 조합에서 선다.
- 2026-10-01 지휘자(U1 해석 승인): Logs **설정** 종류 칩(slate)은 D3③("별도 축은 blue·teal·violet만")에 따라 neutral 칸으로 간다 — 최종 보고에 알린다.
- 2026-10-01 지휘자(U2 리뷰 r1): 리포 id 미고정 거부는 자기 코드 `unpinned`(Disconnected 문구·Reconnect), `not-connected`는 사용자 GitHub 계정 미연결(ConnectError) 문구로 되돌렸다. MCP `sync_repository`는 `unpinned`를 `not-connected`로 접는다(외부 계약 불변).
- ⚠️ U2 ~ T18 사이 dev에서는 Home 메타의 "held until PR merged" 줄이 서지 않는다(`openPr: null`) — **T18이 dev에 들어가기 전에 `/merge`하지 않는다.**
- 2026-10-01 지휘자(U5): spec 완료 조건 3의 "표면 0개 → Setup"은 표가 틀렸다 — 설치 있고 활성 표면 0이면 `awaiting_first_sync`(목록 Not synced yet · Home not-ready)이고 목록·Home이 일치한다. 판정은 그대로 두고 테스트가 이것을 고정한다.
- 2026-10-01 U3: `PanelHeader`에는 `count` prop을 두지 않았다(제목 슬롯이 없다) — 머리 개수 두 곳이 `CountBadge`를 직접 쓴다. `Button` `loading`/`busy`는 `aria-hidden` 앞 글리프를 교체한다(지금 Logs 둘).
- 2026-10-01 U9: 가이드 원고의 축약형(could not 등 55건)은 원고 금지 목록에서 뺐다 — DESIGN §10은 화면 문체 규칙이고 감사 항목이 아니다(범위 밖, 후속 후보). `dict:` 소스는 보이는 문자열 잎 키만.
- 2026-10-01 사용자: `/guide-shots`는 stale 목록이 아니라 **전 컷 + README 두 장** 재촬영(직전 병합 때 건너뜀).
- 2026-10-01 지휘자(U6 리뷰): 지문 재확인으로 멈춘 Publish도 Logs 결과 배지는 "Held back" 그대로(필터·Publish 결과 낱말 일치) — 사유는 보조줄. DESIGN §2.4 Held back 행에 적는다(T29).
- 2026-10-01 지휘자(U7 리뷰): **번역 화면도 probe 메모를 켠다**(Home과 같은 `PROBE_MEMO_TTL_MS`) — 메모 없이 키 선택·저장마다 GitHub probe 1–2회가 나가 설치 rate limit을 번역자 수만큼 태운다. 메모를 끄는 이유(Settings는 고치러 가는 자리, MCP는 판정 근거)는 번역 화면에 없고, 버튼 클릭은 서버가 다시 판정한다. design §3.3의 "memo 없음"을 뒤집는다. 스트리밍 도착은 `use()`가 아니라 effect 구독(직전 값 유지) — 전환 중 `use(새 promise)`가 이동을 GitHub 대기에 묶는다.
- 2026-10-01 U7: Home 메타 열은 `<aside>`(랜드마크 테스트) 그대로 두고 `PanelCard`로 옮기지 않았다 — §6.64 이탈 표에 올린다(T29). 스트리밍 판정은 `useArrived(promise, identity)`(프로젝트·소스가 바뀌면 옛 값 즉시 폐기).
- 2026-10-01 지휘자(U11): `/ux-audit`는 🔴를 이슈로 직접 내지 않고 **이슈 후보 목록**으로 낸다(리포트 전용 레인 — `/audit`과 같다). spec Q11에서 벗어남, 수용.
- 2026-10-01 사용자(U12): **페이지 수준 Alert는 본문의 첫 블록이고 본문과 함께 스크롤한다** — Settings·Home·Account·`/projects`. POSTMORTEM 2026-09-06의 "머리에 둔다"를 뒤집었다. `PanelHeader`의 `notice` 슬롯은 지웠다. 번역 화면은 머리·본문 스크롤 구조가 없어 배너가 고정 띠에 남는다.
- 2026-10-01 QA1: 이슈 #159–#166(전부 BugShot). 측정은 Home 편집 0(PR 조회 스트리밍) 갈래가 판정선 초과 — 사용자 판단 대기.
