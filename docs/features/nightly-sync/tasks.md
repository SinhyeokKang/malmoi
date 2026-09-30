# nightly-sync — 태스크

순서: 순수 판정 → (스키마) → 적재 껍데기 → CI 게이트 → 야간 루프 → UI → 문서. 커밋 경계는 `──` 줄이고, **각 경계에서 `pnpm typecheck` · `pnpm test` · `pnpm test:projects:postgres`가 green**이다.

- `lib/import/**`·`lib/protection/**`·`lib/pull/**`·`lib/events/**`·`lib/push/apply.ts`·`lib/onboarding-run/**`·`lib/surfaces/**`·`app/(edit)/actions.ts`·`app/api/push/route.ts`·`prisma/migrations/**`를 건드리므로 **각 커밋 전 `pnpm test:projects:postgres`를 손으로 돌린다**(`pnpm test`에 없다).
- ⚠️ **선행 조건: `schema-debt-cleanup` ② `/merge` 완료 전에는 B 이후를 시작하지 않는다** — 그 기능의 스키마 동결 창(`db:migrate` 금지). A는 스키마 없이 먼저 갈 수 있다.
- **UI 검증은 수동이다** — 이 리포에 e2e가 없다. DOM 테스트(jsdom)는 자동, `pnpm dev`·`/runtime-test`로 보는 것은 수동으로 적는다.

## A. 순수 판정

- [x] **A1** `planOpenPrGate` 신설(`lib/protection/plan.ts` 옆). `planProtectedImport`는 손대지 않는다.
  — 검증: `openPr: undefined → defer pr-check-failed` · `null → apply` · `url → defer open-pr` · 기존 `lib/protection/__tests__/plan.test.ts` 무수정 green · `pnpm test` green.
- [x] **A2** `planNightly` 신설(`lib/nightly/plan.ts`). 테스트 먼저.
  — 검증: design "야간 판정 순서"의 갈래마다 한 테스트(publish · notReady · base-unreadable(throw) · base-unreadable(`sha: null`) · upToDate · pr-check-failed · open-pr · unprocessed(마감 초과) · import) · "pending > 0이면 head를 요구하지 않는다(`need` 없음)" · "비교 대상 중 하나라도 lastCommitSha가 다르면 import 쪽" · 비교 대상에서 보관·포맷 불완전·`lastCommitSha` null 표면 제외 · **비교 대상 0개 → `notReady`**(빈 배열의 `every`가 `upToDate`로 새지 않는다) · `pnpm test` green.
- [x] **A3** `triggerOf`·`triggerWhere` 신설(subtype 기준), `parseLogFilter`의 `actor`에 `ci`·`nightly`(옛 `automation` 읽기 유지). `IMPORT_SOURCES`에 `"nightly"`, IMPORT 페이로드에 `deferReason`·`changedValues`(nullable), 결과어 `upToDate`와 그 라벨·톤·결과 필터 메뉴 항목·`Record<EventResult,…>` 다섯 곳(`lib/events/view.ts:45,58,168` · `components/logs/log-filters.tsx:355,376`)·`messages/en.tsx`, `lib/events/query.ts:243-248` `RESULTS`를 `EVENT_RESULTS`에서 파생, `readPayload` 대응.
  — 검증: `triggerOf` 표 — IMPORT×USER×{`import.run`, `import.first`} → manual · IMPORT×AUTOMATION×{`import.ci`} → ci · IMPORT×AUTOMATION×{`import.nightly`, `nightly.skip`} → nightly · PUBLISH×AUTOMATION → nightly · PUBLISH×USER → manual · 기타 kind×USER → manual · `readPayload`가 `"nightly"`를 `"ci"`로 폴백하지 않는다 · filter 왕복: `?actor=ci`·`?actor=nightly`·옛 `?actor=automation` · `hasNarrowing`·`filterChanged` 단위 테스트 · `upToDate`가 `nothingToSend`와 다른 키·라벨 · `pnpm typecheck` green · `pnpm test` green.

── 커밋: `feat(nightly): add pure decisions for nightly publish/import/skip and open-PR gate`

## B. 스키마 (선행 조건 충족 뒤)

- [x] **B1** `/db` — `Project.lastNightlyAt DateTime?` (additive). `--create-only`로 SQL을 눈으로 본 뒤 dev 적용 · dev·prod `has_schema_privilege` false 확인. **prod `db:deploy`는 `/merge` 1단계다 — `/push` 시점으로 당기지 않는다.** dev 드리프트가 보이면 보고 후 리셋(dev는 `push:local`로 복구된다).
  — 검증: `pnpm db:status` clean · `pnpm typecheck` green.

── 커밋: `feat(db): add Project.lastNightlyAt for nightly ordering` (스키마+마이그레이션만)

## C. 서버 적재 자동화 갈래

- [x] **C1** `runRepositoryImportFromReader` 입력을 `actor` 합으로 가른다. `acquire`·`current`의 USER 전용 판정을 갈래 안으로. `source`·subtype을 입력으로. AUTOMATION이면 `finishSurface` 트랜잭션 안 **사후 재집계**, `resource-limit` → `deferred` · `too-large`(표면 `lastImportError` 무기록). `vitest.projects.config.ts` include에 `lib/import/__tests__/*.integration.ts`·`lib/nightly/__tests__/*.integration.ts`를 더한다(안 더하면 새 통합 테스트를 어느 스위트도 안 돌린다 — POSTMORTEM 2026-09-10).
  — 검증: 기존 수동 Sync 테스트 전부 green(행동 불변) · `lib/import/__tests__/automation.integration.ts`: pending 0에서 적재 · 적재된 표면마다 `lastCommitSha`·`lastCommitAt`이 head로 전진 · 표면 둘 중 두 번째 트랜잭션 전에 편집 저장 → 첫 표면만 커밋 + 결과 `partial` · 첫 표면 전에 저장 → `deferred` `pending-edits` · 토큰 있는 셀을 덮지 않는다 · `resource-limit` → `deferred` `too-large` + `lastImportError` null 유지 · `already-running` → 사건 0행 · 사건 actor `AUTOMATION` + subtype `import.nightly` + `source: "nightly"` · `pnpm test:projects:postgres` 출력에 새 파일이 잡힌다.

── 커밋: `feat(import): run server-side import as automation`

- [x] **C2** `changedValues` 관측 — `applyPushInTransaction`에서 세고, 생산자 다섯이 싣는다: CI `onApplied`(`app/api/push/route.ts:241`) · 수동/야간 `close`(`lib/import/run.ts:217`) · 첫 적재(`lib/surfaces/create.ts:110` · `lib/onboarding-run/create.ts:302` · `app/(edit)/projects/actions.ts:720`).
  — 검증: 통합 테스트 — 같은 값 재적재 0 · 값 2개 변경 2 · 새 셀 삽입 포함 · description만 바뀐 셀은 세지 않는다 · 토큰 있어 안 덮인 셀은 세지 않는다 · 생산자 다섯의 사건에 값이 있다 · 1446키 픽스처(`repository-import.integration.ts:70` 경로)에서 `ANALYZE` 전·후 `EXPLAIN (FORMAT JSON)`의 `Index Name`이 `Translation_keyId_localeCode_key`(선례 `lib/keys/__tests__/source-counts.integration.ts:80-81`)이고 시간이 그 테스트의 기존 상한 안 · **판정 코드가 이 값을 읽지 않는다**: `rg changedValues lib/protection lib/nightly lib/pull` 0건.

── 커밋: `feat(import): record changed value count on every import event`

## D. CI 게이트

- [x] **D1** `/api/push`: 사전 집계 0 뒤 열린 PR 삼상태 조회(`installationId`·`repositoryId` null → `null`) → `planOpenPrGate` → `deferred` 사유. `PushResponse`를 사유별 union으로, `deferred()` 생산자에 타입, 사건 `deferReason`. 기존 테스트 갱신: `lib/keys/__tests__/sync-edit-protection.integration.ts`·`concurrent-import.integration.ts`·`repository-import.integration.ts`·`app/api/__tests__/surface-boundary.test.ts`·`route-diagnostics.test.ts`에 열린 PR 조회 mock(`null`)과 새 select 필드.
  — 검증: 라우트 테스트 — PR 있음 → 200 `open-pr`(`pendingCount` 없음) · 조회 throw → `pr-check-failed` · 마감 초과 → `pr-check-failed` · PR 없음 → applied · `repositoryId` null → applied(조회 0회) · 무효 토큰은 GitHub을 부르지 않는다(가짜 client 호출 0회) · 보류 갈래에서 `markImportStarted`·번역·키·`surface.updateMany` 0회 · 사건 `deferReason` 값 · 위 다섯 파일의 기존 applied 단언 green.
- [x] **D2** CLI `reportPushResponse`가 `reason`별 경고, `action.yml:157` 열린 PR 경고 문구 정정.
  — 검증: `lib/cli/__tests__/push-response.test.ts`에 `open-pr`·`pr-check-failed` 응답의 경고 문구 · 옛 모양(`pendingCount`만) 응답이 v2 동작 그대로 · 수동 `pnpm push:local` 1회(열린 PR 있는 dev 프로젝트) — **수동**.

── 커밋: `feat(push): defer CI import while a Malmoi pull request is open`

## E. 야간 루프

- [x] **E1** `selectPullTargets` 정렬 키를 `lastNightlyAt`로(구 A4), `NIGHTLY_IMPORT_START_MS`, `runNightly` 껍데기 + `/api/pull` 루프 교체. `lastNightlyAt`은 방문 머리 단독 update. `PullItem`에 `action`. 요약 로그 카운터 확장. `pull-budget.test.ts:22`·`route-diagnostics.test.ts:46`의 `@/lib/sync/run` mock을 `runNightly` 경계로 옮긴다.
  — 검증: `lib/pull/__tests__/targets.test.ts` "null이 맨 앞 · 오래된 순 · 동점 slug" green · `app/api/pull` 테스트(가짜 `lib/pull/__tests__/fake-client.ts`의 `record`) — publish 갈래: `createGitClient` 0회 + `runSync`가 `trigger: "cron"`으로 불림 · upToDate: `getRefSha` 1회 · `findOpenPr` 0회 · 트리·blob 0회 · head 조회 뒤에만 PR 조회(순서 단언, `Promise.all` 없음) · PR 조회 마감 초과 → `pr-check-failed` · head throw → `base-unreadable` · 적재 시작 마감 초과 → 사건 0행 + `unprocessed` · 실패 방문도 `lastNightlyAt` 기록 · 한 프로젝트 실패가 나머지를 안 막는다 · 요약 로그 한 줄에 카운터 전부.
  — 검증(통합, `lib/nightly/__tests__/nightly.integration.ts`): **방문마다 사건 최대 1행**(갈래별 subtype·결과·사유) · 편집 없는 밤에 `SyncRun` 0행 · `[skip-malmoi-i18n]` 머지 커밋으로 head가 앞선 프로젝트(열린 PR 없음) → `import.nightly` 갈래(완료 조건 13) · 닫힌 PR만 있음 → 적재(완료 조건 6 — `findOpenPr`의 `state: "open"` 파라미터는 `lib/pull/__tests__/client.test.ts`에서 단언) · 함수 사망으로 남은 `running` 적재 행을 다음 방문의 만료 닫기가 닫는다.
- [x] **E2** Logs 결과·주체 술어: `deferred` 사유 넷과 `upToDate`가 `eventResult`·`resultWhere`에서 같은 어휘로 떨어지고, `triggerWhere`가 `triggerOf`와 같은 행을 고른다.
  — 검증: `lib/events/__tests__/query.integration.ts`에 사유별·주체별 한 행(`source` 없는 옛 CI 행 포함) · 필터 `deferred`가 넷 다 잡는다 · `upToDate` 행의 `eventResult`가 null이 아니다 · `actor=ci`/`nightly`/옛 `automation` 각각이 기대 행만 낸다 · 모든 행에서 `triggerOf(row)`와 `triggerWhere` 소속이 일치.

── 커밋: `feat(pull): decide nightly publish, import or skip per project`

## F. UI

- [x] **F1** Logs: `actorLabel`(event-row.tsx·event-detail.tsx 세 곳)의 **AUTOMATION 분기만** `triggerOf`로 — 사람 이름 경로 유지. `eventMeta`도. 행위자 메뉴의 `automation` 항목 → `CI`·`Nightly` 둘. `deferredReason` 사유별 분기 · `nightly.skip`·`import.nightly` 문장(행위자 머리 문법) · 자동화 행 보조줄의 주체 낱말 제거 · 상세 `changedValues`(부재 `—`).
  — 검증: DOM 테스트(event-row·event-detail·log-filters, jsdom) — 야간 행 `Nightly` · CI 행 `CI` · 사람 행 마스킹 이름 그대로 · `open-pr` + `pendingEdits: 0` 행이 "0 unsent edits"를 안 낸다 · 메뉴 `CI`·`Nightly` 선택이 URL `?actor=`로 왕복 · `changedValues` 없음 → `—` · `no-korean-ui` green · 문구는 `messages/en.tsx` · 버튼 이름을 부르는 문구는 terminology 테스트에 사전 참조.
- [x] **F2** Home 요약: 기존 `Promise.all` 안에서 최근 적재·PUBLISH 사건 조회(행위자 비선택) → `metaRows`에 `trigger`·`heldByOpenPr` → `12 hours ago · nightly` · `· held until the pull request is merged`.
  — 검증: `lib/home/__tests__/meta.test.ts` 갈래 — manual · nightly · CI · null(사건 없음) · 실패 행 순서 `1d ago · nightly · failed 10m ago` · 최근 적재가 `deferred open-pr` → 보류 한 줄 · `partial`/`deferred`/`superseded`가 주체를 잘못 가리키지 않는다 · 새 jsdom 테스트(메타 열 렌더) · `components/__tests__/home-screen.test.ts`(소스 스캔) green · **수동**: `/runtime-test`로 로컬 Home 확인.

── 커밋: `feat(ui): show manual, nightly or CI trigger on home summary and logs`

## G. 문서 (`/implement`·`/push` 신선도 단계)

각 G 태스크의 검증은 공통으로 **`/push` 4단계 문서 신선도 통과**이고, 아래는 대조할 문장이다.

- [ ] **G1** `docs(PRODUCT)`: §4.1 "야간 자동 Publish" → 야간 동기화(판정 표) · §4.3 ②(일 단위는 야간이 채운다, 실시간이 필요할 때 연다) · §7.4("계속 받으려면 워크플로" → 커밋 즉시 받는 선택지) · §7.6(편집 0인 프로젝트도 ref를 읽는다).
  — 검증: `rg "워크플로를 붙이" docs/PRODUCT.md`가 새 판정과 모순되지 않는다.
- [ ] **G2** `docs(ARCHITECTURE)`: §3.05(판정·정렬 키·적재 시작 마감) · §5.5.2(보류 사유 넷, 대가 둘 — fail-closed 포함) · §3 "손실 창" 서술(열린 PR 게이트로 닫힘) · §6.45(MCP `list_events` 새 필드) · §5 `pendingEditToken` 절은 불변.
- [ ] **G3** `docs(ACTIONS)`: "열린 PR 경고는 차단이 아니다" 절 개정(반전과 병합이 아닌 이유) · `deferred` 사유 `open-pr`·`pr-check-failed`와 할 일(PR을 머지하거나 닫는다) · v3와 v2 소비자 동작(경고 없이 green).
- [ ] **G4** CLAUDE.md 코어 원칙 "보류 판정은 리포를 보지 않는다" 문장 + `pnpm sync:agents`.
  — 검증: `pnpm sync:agents:check` green.
- [x] **G5** (2026-10-01 `ux-drift-unify` T1이 흡수 — ` · nightly` 꼬리와 `upToDate` slate 등재는 **적지 않는다**: 메타 열은 배지 먼저, `upToDate`는 neutral 칸) ~~`docs(DESIGN)`: §6.64 메타 열 ` · nightly` · 보류 한 줄 · §6.68 행위자 메뉴(CI·Nightly) · 행 문장 규칙에 CI/Nightly 기준 · `upToDate`의 글리프·톤(slate). §6.2 새 raw 색 없음.~~
- [ ] **G6** `/guide`: `guide/sync/nightly.md`(야간에 무엇을 하나, 언제 건너뛰나, "CI = your repository's workflow") · `guide/sync/push.md`(보류 사유) · `guide/sync/logs.md`(행위자 메뉴, 편집 없는 밤의 행이 Imports로) · `guide/translate/publish.md` · `guide/AUTHORING.md` IA 표 · 온보딩 ④ 설명 문구(`messages/en.tsx`) · README 야간 서술.
  — 검증: `pnpm test`(가이드 게이트) green · `pnpm guide:check` stale 목록 인용.
- [ ] **G7** action v3 릴리스 — **`/merge`로 서버가 프로덕션에 나간 뒤** `malmoi-i18n-push-v3` 태그 → 사용 리포 전환(ACTIONS 순서).
  — 검증: 태그가 서버 배포 커밋 뒤를 가리킨다 · 수동: 사용 리포 한 곳에서 열린 PR 상태로 push → run 요약에 `open-pr` 경고.
- [ ] **G8** 기능 종료 시 결론을 정본으로 올리고 `docs/features/nightly-sync/` 삭제.

## 결정 기록 (orchestrate)

- **2026-09-30 사용자 — 야간 적재의 서버 전용 한계는 표면 실패 상태를 쓰지 않는다.** 스펙 6b(resource-limit)의 근거("야간이 CI로 건강한 프로젝트를 실패로 뒤집지 않는다")를 서버 전용 한계 전부로 넓힌다. 영구 한계(resource-limit · 트리 잘림)는 `deferred` · `too-large`, 일시·자격 실패(스냅샷 unavailable · installation 토큰 · blob 다운로드 · 표면 tx 예외)는 사건 `failed` + errorCode만 남기고 `lastImportError`를 쓰지 않는다. 어댑터 파싱 실패·0키·`partial-import`는 CI도 같이 실패하므로 그대로 쓴다. 수동 Sync는 불변.
- **2026-09-30 지휘자 — Home 보류 한 줄은 "held until the pull request is merged or closed"** (스펙 14a의 "merged"는 반만 참 — 닫아도 풀린다).
