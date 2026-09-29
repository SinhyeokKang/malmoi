# nightly-sync — 설계

## 영향 받는 흐름

| 흐름 | 무엇이 바뀌나 |
|---|---|
| pull (`/api/pull`) | 프로젝트마다 `planNightly`가 Publish / 적재 / 스킵을 고른다. Publish는 기존 `runSync` 그대로 |
| push (`/api/push`) | 사전 집계가 0일 때 열린 PR 조회 → `planOpenPrGate` → `deferred` 사유 둘 추가 |
| 서버 적재 (`lib/import/run.ts`) | 사용자 없는 자동화 실행 갈래(`actor: automation`) + 표면별 사후 재집계 |
| 적재 코어 (`lib/push/apply.ts`) | `changedValues` 관측 |
| action / CLI | 사유별 응답·경고 → `malmoi-i18n-push-v3` |
| 편집 UI | Home 요약 주체 · 보류 한 줄 · Logs 행위자/Trigger 라벨 · 행위자 메뉴 |

## 야간 판정 순서

```
runNightly 머리: Project.lastNightlyAt = now (단독 update — 방문 기록)
        │
countPending(projectId) > 0 ──────────────────────────► Publish (runSync, 지금 그대로)
        │ 0
        ▼
비교 대상 표면(활성 · 포맷 완전 · lastCommitSha 있음) 0개 ─► 사건 없음 · 카운터 notReady
        │
        ▼
createGitClient → getRefSha(base)
  throw · null ─────────────────────────────────────► nightly.skip · failed · base-unreadable
  비교 대상 전부 lastCommitSha == head ──────────────► nightly.skip · upToDate
        │ 다름
        ▼
열린 PR 조회 (findOpenPr + withinGithubWait — 삼상태) → planOpenPrGate
  undefined(실패·마감) ───────────────────────────────► nightly.skip · deferred · pr-check-failed
  url ─────────────────────────────────────────────► nightly.skip · deferred · open-pr
  null ─┬─ 경과 > NIGHTLY_IMPORT_START_MS ────────────► 사건 없음 · 카운터 unprocessed
        └─────────────────────────────────────────► 서버 적재 (import.nightly)
```

**방문마다 사건이 최대 하나다** (사용자 판정 2026-09-29 — "무엇을 했고 왜 안 했는지가 남아야 한다", 검수 2026-09-29 — "정확히 하나"에서 "최대 하나"로):

| 결과 | 사건 | 비고 |
|---|---|---|
| Publish | `PUBLISH` · `publish.run` · AUTOMATION | 지금 그대로. `runPull`의 스킵·보류·경고도 이 행의 결과로 선다 |
| 적재 | `IMPORT` · **`import.nightly`** · AUTOMATION · `source: "nightly"` | 결과: `imported` · `partial` · `failed` · `deferred`(`pending-edits` — 적재 중 저장 / `too-large` — 서버 적재 예산) |
| 스킵 | `IMPORT` · **`nightly.skip`** · AUTOMATION · `source: "nightly"` | 결과: `upToDate`(새 결과어) · `deferred`(`open-pr` · `pr-check-failed`) · `failed`(`base-unreadable`) |
| 사건 없음 | — | `already-running`(다른 실행이 이미 자기 사건을 쓴다) · 예산 미방문 · 비교 대상 0. 요약 로그 카운터에만 선다 |

- **결과 어휘는 조건별로 기존 것을 재사용한다** (검수 2026-09-29 — POSTMORTEM 2026-09-27, 같은 조건이 두 소비자에서 다른 어휘로 섰다). 같은 `open-pr`이 CI와 야간 양쪽에서 `deferred` + `deferReason`이다. **새 결과어는 `upToDate` 하나**이고, 키·라벨은 기존 `nothingToSend`("Nothing to send")와 따로 둔다. 결과 필터 그룹은 "Both"다(Sync·Publish 둘 다 할 일이 없었다).
- 스킵을 `IMPORT` 종류에 두는 이유: 편집이 0인 밤에만 서므로 Publish가 할 일은 이미 없고, 남은 질문은 "리포에서 받았나"다. **새 `EventKind`를 만들지 않는다**(enum 변경·필터 축 증가).
- ⚠️ **한 밤에 둘이 서지 않는다** — `runNightly`가 판정 뒤 정확히 한 갈래를 부르고, 그 갈래가 자기 사건을 쓴다.
- 대가: 프로젝트마다 하루 한 행이 Logs에 쌓인다(보존 기간 없음 — 불변식 3의 확장). 지금도 "nothing to send"가 매일 서므로 행 수는 같고, 종류만 Publish → Imports로 옮겨 간다.

- **Publish가 먼저이고 GitHub을 부르지 않는다** — 1층 스킵의 "API 0회"(ARCHITECTURE §3)를 편집 있는 프로젝트에 그대로 둔다. 미전달이 0인 프로젝트만 GitHub에 닿는다.
- **head 비교가 PR 조회보다 앞이고 순차다** — 아무 커밋도 없던 밤에 PR 목록을 부르지 않는다. `Promise.all`로 묶지 않는다(POSTMORTEM 2026-09-13). head 비교는 변경 감지가 아니라 "적재할 새 커밋이 있나"이고 값을 보지 않는다(blob SHA 스킵과 같은 부류). **base head 대비**다 — sync 브랜치 상태와 섞지 않는다(POSTMORTEM 2026-09-09).
- **비교 대상을 좁히는 이유**: `lastCommitSha`가 null이거나 포맷이 불완전한 표면은 적재해도 전진하지 않는다. 그것을 비교에 넣으면 `upToDate`가 영원히 안 서서 매일 전 표면을 다시 적재하고 매일 `partial`/`failed`가 선다. 적재 자체는 수동 Sync와 같은 표면 집합을 돈다.
- **GitHub 호출의 실제 모양**: `createGitClient`가 installation 토큰 발급 + `GET /repos/{owner}/{repo}`(identity)를 먼저 부르고(`lib/github.ts:343-356`), 그다음 `getRefSha`다. 완료 조건은 "하지 않는 호출"(트리·blob·PR 목록 0회)로 적는다. 적재는 `openRepoReader`(자체 토큰 발급, `lib/github.ts:258`)를 쓰므로 `GitClient`를 재사용하지 않는다 — 타입이 다르다.
- **자동화의 리포 신원**: 수동 경로는 `checkRepoAccess`(user-to-server)로 확인하지만 자동화엔 사용자가 없다. `repositoryId`에 고정된 installation 토큰 범위와 `acquire`의 `repo-replaced` 판정이 그 자리를 대신한다.
- **판정과 적재 사이 경합**: 판정은 잠금 밖이다. 적재는 `Project` → `TranslationSurface` 잠금 안에서 `planProtectedImport({ mode: "auto" })`로 다시 세고, 표면마다 사후 재집계가 0이 아니면 그 표면을 롤백한다. PR은 판정 뒤에 열릴 수 있다 — 그 Publish가 토큰을 비운 뒤라면 잠금 안의 재집계도 0이라 그 적재는 덮는다. 창은 적재 한 번(수 초)이고, 덮인 값은 이미 커밋된 PR 스냅샷에 남아 **다음 Publish 전에 PR이 머지되면 복구된다.** 허용한다. **잠금 안에서 PR을 다시 조회하지 않는다** — 트랜잭션 안에서 GitHub을 부르지 않는다(`lib/sync/run.ts` `startRun` 주석).
- **적재 시작 마감**: 예산 판정은 루프 머리(`app/api/pull/route.ts:403`)뿐이고 남은 15초는 Publish 하나와 요약의 몫이다. 서버 적재는 표면 트랜잭션 timeout 30s(`lib/import/run.ts:33`)이라 45초 가까이 시작하면 `maxDuration=60`을 뚫는다. 적재 갈래만 더 이른 마감(`NIGHTLY_IMPORT_START_MS = 20_000`, `lib/pull/targets.ts`의 `PULL_TIME_BUDGET_MS` 옆)을 둔다. 그래도 함수가 죽어 남은 `running` 행은 다음 방문의 기존 만료 닫기(`run.ts`의 `import:` 접두 `updateMany`)가 처리한다.

## 순수 함수 (`/tdd` 진입점)

| 함수 | 위치(안) | 입력 → 출력 |
|---|---|---|
| `planOpenPrGate` | `lib/protection/plan.ts` 옆(같은 파일 또는 형제) | `openPr: string \| null \| undefined` → `{ action: "apply" } \| { action: "defer", reason: "open-pr" \| "pr-check-failed" }`. **route 사전 판정과 `planNightly`가 공유한다.** `planProtectedImport`는 손대지 않는다 — `apply.ts:151`의 트랜잭션 안 재판정이 늘 `null`을 박는 호출자가 되거나, optional이면 `undefined`로 모든 CI가 조용히 보류되는 것을 구조적으로 막는다(검수 2026-09-29) |
| `planNightly` | `lib/nightly/plan.ts` | 단계 입력을 받는 **한 함수**: `{ pending, surfaces: { active, formatComplete, lastCommitSha }[], head?: { ok: true, sha: string \| null } \| { ok: false }, openPr?: string \| null \| undefined, elapsedMs? }` → `{ action: "publish" } \| { action: "need", input: "head" \| "open-pr" } \| { action: "import" } \| { action: "skip", outcome: "upToDate" \| "deferred" \| "failed", reason } \| { action: "none", counter: "notReady" \| "unprocessed" }`. 껍데기는 `need`를 받을 때마다 조회해 다시 부른다. 테스트가 `undefined → pr-check-failed` · `sha null → base-unreadable` · "pending > 0이면 head를 요구하지 않는다" · 비교 대상 0 → `notReady` · 마감 초과 → `unprocessed`를 고정한다 |
| `triggerOf` | `lib/events/view.ts` | `{ actorKind, kind, subtype }` → `"manual" \| "nightly" \| "ci"`. USER → manual(MCP 포함). AUTOMATION ∧ (PUBLISH ∨ subtype ∈ {`import.nightly`, `nightly.skip`}) → nightly. 그 밖의 AUTOMATION(`import.ci`, 생산자 0곳인 `reported-failure` 포함) → ci. **`subtype` 컬럼만 본다** — `payload.source`와 `oneOfRaw(...) ?? "ci"` 폴백(`lib/events/payload.ts:196`) 함정이 판정에서 빠진다. `actorLabel`의 AUTOMATION 분기 · `eventMeta` · 상세 Trigger · Home이 이 하나를 쓴다 |
| `triggerWhere` | `lib/events/query.ts` 옆 순수 모듈 | `"ci" \| "nightly"` → Prisma `where`. ci = `AUTOMATION ∧ kind IMPORT ∧ subtype ∉ {import.nightly, nightly.skip}` · nightly = `AUTOMATION ∧ (kind PUBLISH ∨ subtype ∈ {import.nightly, nightly.skip})`. `triggerOf`와 같은 컬럼을 본다. **같은 행을 가르는지는 E2 통합 테스트의 실제 행으로 잰다** — 같은 모듈끼리의 순수 비교는 근거가 아니다(POSTMORTEM 2026-09-14) |
| `parseLogFilter` 확장 | `lib/events/filter.ts` | `actor`에 `"ci"`·`"nightly"` 값. 옛 `"automation"`은 읽기만 하고 둘 다를 뜻한다(`actorKind: AUTOMATION` 그대로). 메뉴 항목은 없다 |
| `selectPullTargets` 정렬 키 | `lib/pull/targets.ts` | `syncRuns[0].startedAt` → `lastNightlyAt`. 기존 테스트의 "한 번도 안 돈 프로젝트가 맨 앞 · 동점 slug"를 그대로 옮긴다 |
| `metaRows` 확장 | `lib/home/meta.ts` | `lastSync`·`lastPublish` 행에 `trigger: Trigger \| null`, `lastSync`에 `heldByOpenPr: boolean`. 사건이 없으면 `null` → 주체 없음 |

## 껍데기

- **`/api/pull` 루프** — `runSync` 직행을 `runNightly(prisma, project, elapsedMs)`로 바꾼다. `runNightly`는 머리에서 `lastNightlyAt`을 단독 `update`로 쓰고(쓰기 자리 1곳 — 사건과 같은 트랜잭션에 두려면 Publish·적재·스킵 세 트랜잭션에 흩어진다, POSTMORTEM 2026-09-15), `countPending` → (0이면) 비교 대상 → `createGitClient` 한 번 → `getRefSha(base)` → `findOpenPr` + `withinGithubWait`(`loadOpenPrUrl`은 자체 클라이언트를 만들고 `installationId` null을 `null`로 읽어 쓰지 않는다) → `planNightly` → 실행. 결과는 `PullItem`에 `action` 필드로 싣고 요약 로그를 `[pull] targets= published= imported= skipped= deferred= failed= notReady= unprocessed=`로 늘린다.
  - ⚠️ **`PullItem` 계약을 타입으로 늘린다** — POSTMORTEM 2026-08-31(외부 계약을 리터럴로 조립).
  - 시간 예산: 기존 `PULL_TIME_BUDGET_MS`(45초)·`PULL_BATCH_LIMIT`(50) + 적재 전용 `NIGHTLY_IMPORT_START_MS`(20초). 넘친 프로젝트는 `unprocessed`로 세고 다음 밤 `lastNightlyAt` 정렬이 앞으로 가져온다. 방문 기록은 실패 방문도 포함하므로 매일 실패하는 프로젝트가 맨 앞을 차지하지 않는다.
- **서버 적재의 자동화 갈래** — `runRepositoryImportFromReader`의 `ImportRunInput`을 `actor: { kind: "USER"; userId; approval; credential } | { kind: "AUTOMATION" }`로 가른다.
  - `acquire`: AUTOMATION은 `lockCredential`·OWNER 검사·`readDiscardApproval`을 건너뛰고 `planProtectedImport({ mode: "auto", pending })`로 판정한다. `defer`면 사건 `deferred`(`pending-edits`)로 닫고 반환한다. `already-running`·`no-surfaces`는 사건 없이 반환한다(`recordImportRefusal`은 손대지 않는다 — 그 함수의 USER·manual 하드코딩은 수동 경로 전용이다). 보관은 `selectPullTargets`가 이미 뺐지만 잠금 뒤 다시 본다(수동 경로와 같은 순서).
  - `current`: `authorized`를 AUTOMATION이면 `true`로 둔다. 나머지 판정(토큰·revision·설정·보관·superseded)은 그대로다.
  - `approvedTokens: []` — upsert 가드가 토큰 있는 셀을 한 줄도 안 덮는다.
  - ⚠️ **표면별 사후 재집계** — 지금 사후 재집계는 `applyProtectedPush`(`lib/push/apply.ts:155-156`)에만 있고 `finishSurface`(`lib/import/run.ts:158-199`)에는 없다. AUTOMATION이면 `finishSurface` 트랜잭션 안에서 `applyPushInTransaction` 뒤 `countPending`을 다시 세고 >0이면 던져 그 표면을 롤백하고, 뒤 표면은 시작하지 않는다. 앞 표면이 커밋됐으면 사건 결과 `partial`, 없으면 `deferred`(`pending-edits`). 이미 커밋된 표면은 `approvedTokens: []` + 토큰 가드로 편집을 덮지 않았으므로 되돌릴 이유가 없다.
  - `resource-limit`(`lib/import/run.ts:194`): AUTOMATION이면 사건 `deferred` · `too-large`로 닫고 표면 `lastImportError`를 쓰지 않는다.
  - `recordRun`·`finishRun`: `source` 하드코딩(`"manual"`, run.ts:111·223)과 subtype `import.run`(run.ts:106)을 입력으로 옮긴다(AUTOMATION → `import.nightly`, `source: "nightly"`). 사건 닫기는 `finishRun`의 `closed` 검사를 지난다(POSTMORTEM 2026-09-14 — 0행 갱신은 조용하다).
- **`changedValues`** (사용자 판정 2026-09-29 — CI · 야간 · 수동 Sync · 첫 적재, 검수 2026-09-29 유지) — 세는 자리는 공유 코어 `applyPushInTransaction`이지만 **사건에 싣는 생산자는 따로 배선한다**: CI `onApplied`(`app/api/push/route.ts:241`) · 수동/야간 `close`(`lib/import/run.ts:217`) · 첫 적재 셋(`lib/surfaces/create.ts:110` · `lib/onboarding-run/create.ts:302` · `app/(edit)/projects/actions.ts:720`).
  - 정의: `Translation.value`가 실제로 바뀐 셀 수(삽입 포함). description·placeholders는 세지 않는다.
  - `ON CONFLICT DO UPDATE ... RETURNING`은 old 값을 못 보므로 CTE로 기존 값을 먼저 읽고 `IS DISTINCT FROM`으로 센다. `$executeRaw` → `$queryRaw`가 된다(`lib/push/apply.ts:335-367`).
  - ⚠️ **판정에 쓰지 않는다 — 관측값이다.** 이 수로 무엇을 덮을지 고르는 순간 병합이다.
  - ⚠️ 비용은 번역 upsert 1문장당 기존 행 읽기 하나다 — 1446키 벌크에서 `maxDuration` 안인지 `pnpm test:projects:postgres`의 대량 픽스처로 잰다(POSTMORTEM 2026-09-18 — 낡은 통계에서 인덱스를 버렸다. `Translation_keyId_localeCode_key`를 타는지 `EXPLAIN (FORMAT JSON)`으로 본다).
- **`/api/push`** — `countPending === 0` 뒤, `markImportStarted` 앞에 열린 PR 조회 → `planOpenPrGate`. 프로젝트 행 `select`에 `repoOwner`·`repoName`·`installationId`·`repositoryId`를 더한다. `installationId`·`repositoryId`가 null이면 `openPr = null`(게이트 없음 — 검수 2026-09-29, `loadOpenPrUrl`의 `repositoryId null → undefined`를 따르면 옛 행이 영구 보류된다). 사건은 `record({ result: "deferred", deferReason })`.
  - ⚠️ **`PushResponse`를 사유별 union으로 가른다** — `{ status: "deferred", reason: "pending-edits", pendingCount }` | `{ status: "deferred", reason: "open-pr" | "pr-check-failed" }`. 생산자 `deferred()`에도 이 타입을 붙인다(POSTMORTEM 2026-08-31). v2 CLI(`lib/cli/push-response.ts:21-30`)는 `pendingCount`가 정수일 때만 경고하므로 새 사유는 **경고 없이 green**이다 — 거짓 "0 unsent translation changes"보다 낫다.
  - ⚠️ **installation 토큰 GET이다** — `lib/github.ts`를 지나므로 자격증명 분리(`credential-separation.test.ts`)와 충돌하지 않는다.
  - ⚠️ **인증 뒤에 둔다** — 무효 토큰이 GitHub 왕복을 유발하면 안 된다(route 머리 주석 "JSON·스키마 검사가 인증 뒤로 왔다"와 같은 이유).
  - ⚠️ `applyProtectedPush` 안의 재판정은 바뀌지 않는다 — 트랜잭션 밖 사전 판정이 이미 봤고, 안에서 GitHub을 부르지 않는다.
- **action v3** — CLI `reportPushResponse`가 `reason`별 경고를 낸다. `action.yml:157`의 열린 PR 경고("이 push가 그 PR의 편집을 덮는다")를 게이트 이후 사실("적재가 PR 머지까지 보류된다")로 고친다. 태그 `malmoi-i18n-push-v3`. 순서: **서버 배포(`/merge`) → 태그 릴리스 → 사용 리포 전환**(ACTIONS).
- **Home** — `page.tsx`가 최근 적재 사건(`imported`·`partial`·`deferred`)과 최근 성공 PUBLISH 사건 하나씩을 읽는다(`projectId` + `kind` + `occurredAt desc`, `take: 1`, 기존 인덱스 확인). **기존 `Promise.all` 한 라운드 안에 넣는다**(`app/(edit)/projects/[slug]/(home)/page.tsx:135` — v1.1.2에서 빠르게 만든 자리). `select`는 `actorKind`·`kind`·`subtype`·`payload`(결과·`deferReason`)만 — 행위자 이메일을 싣지 않는다(POSTMORTEM 2026-09-29 #146). `triggerOf` → `metaRows`.
  - 주체는 **최근 성공 적재**(`imported`·`partial`)의 것이고, 성공 술어는 `lastImportedAt`을 전진시키는 집합과 같게 고정한다(`resultWhere` 재사용). 두 집합이 갈리면 "12시간 전 수동 Sync"에 `nightly`가 붙는다.
  - 보류 한 줄은 **최근 적재 사건**이 `deferred` · `open-pr`일 때만 선다.
  - ⚠️ **`lastSyncAt`(표면 `lastImportedAt` 최대)과 사건 시각을 대조하지 않는다** — 트랜잭션 경계가 달라 밀리초가 갈리고, 대조가 실패하면 주체가 조용히 사라진다.
  - 렌더: `12 hours ago · nightly`(기존 메타 열의 ` · ` 연쇄, DESIGN §6.64). 낱말은 `m.logs.meta`에 `nightly`·`ci`를 더해 Logs 보조줄과 한 사전에서 뽑는다.
- **Logs** — `actorLabel`(event-row.tsx:111-112 · event-detail.tsx:233·256·294 중복)의 **AUTOMATION 분기만** `triggerOf`로 바꾼다 — 사람 행의 마스킹된 이름(`emailLabel`) 경로는 그대로다. `eventMeta`(view.ts:456)의 `source === "ci" ? automatic : manual`도 `triggerOf`로. 행위자가 문장 머리에 선 자동화 행에서는 보조줄의 주체 낱말을 뺀다(주체를 두 번 말하지 않는다).
  - 문장: 행위자로 시작하는 기존 문법(DESIGN §6.68 · `messages/en.tsx` `sentence`)을 따른다 — 예: `{who} found nothing to publish or sync` · `{who} held the sync — a Malmoi pull request is still open`. `deferredReason`(view.ts:458 · en.tsx:1064 "N unsent edits are being protected")은 **`deferReason`으로 분기**한다 — 그대로면 `open-pr`에서 "0 unsent edits"가 선다. 버튼 이름을 부르는 문구는 terminology 테스트에 사전 참조로 묶는다(POSTMORTEM 2026-09-14 · 2026-09-24).
  - 상세 패널에 `changedValues`("N values changed", 단복수·`en-US` 구분자는 기존 `meta.keys`·`files`와 같은 형, 부재는 `—`).
  - **필터** (검수 2026-09-29 사용자 — 행위자 메뉴에 합침): 행위자 메뉴(`components/logs/log-filters.tsx:152-168`)의 "Automation" 머리 아래 `automation` 한 항목을 `CI` · `Nightly` 두 항목(`actor=ci` · `actor=nightly`)으로 쪼갠다. 단일 선택 그대로라 새 축·AND 조합·빈 교집합이 생기지 않는다. `Manual` 항목은 없다 — 사람별 선택이 그 자리다.
  - 결과 어휘 `upToDate`가 `Record<EventResult,…>` 다섯 곳(`lib/events/view.ts:45,58,168` · `components/logs/log-filters.tsx:355,376`)과 결과 필터 메뉴에 들어간다. ⚠️ `lib/events/query.ts:243-248`의 `RESULTS`는 `EVENT_RESULTS`에서 파생되지 않은 손 사본이라 타입이 못 잡는다 — **`EVENT_RESULTS`에서 파생시킨다**(빠지면 `asResult`가 null을 줘 결과 칸이 조용히 빈다).

## 스키마 변경

**additive 하나**: `Project.lastNightlyAt DateTime?`. 야간 판정이 프로젝트를 방문할 때마다(스킵·실패 포함) `runNightly` 머리에서 쓴다. `selectPullTargets` 정렬 키다.

- ⚠️ **선행 조건: `schema-debt-cleanup` ② `/merge` 완료** (검수 2026-09-29 사용자). 그 기능이 "B1.2 스키마 수정부터 ② `/merge`까지 다른 스키마 작업 동결, 창 안 `db:migrate` 금지"를 확정했다. 스키마가 필요 없는 순수 판정(태스크 A)은 먼저 갈 수 있다.
- 근거: 편집 없는 프로젝트가 더는 `SyncRun`을 만들지 않으므로 지금 정렬 키(`syncRuns[0].startedAt`)가 그 프로젝트를 영원히 "한 번도 안 돈 것"으로 맨 앞에 둔다. 50개 상한에서 그 프로젝트들이 앞을 채우면 편집 있는 프로젝트가 잘린다 — 7단계가 정렬로 푼 아사가 되살아난다.
- `ProjectEvent`에서 파생하지 않는 이유: 방문마다 사건이 서지 않는 갈래가 있고(완료 조건 8), 정렬에 쓰려면 전 프로젝트의 최근 야간 사건을 매 밤 조인해야 한다. 컬럼은 **정렬 힌트이지 이력이 아니다** — 사건과 같은 트랜잭션에 묶지 않는다.
- 배포: dev `/db`(`--create-only`로 SQL을 눈으로 보고 적용) → `/push`, prod `db:deploy`는 `/merge` 1단계. 컬럼이 null이면 기존 정렬의 `-Infinity`와 같다 — 코드가 먼저 나가도 안전하다.
- `ProjectEvent.payload`는 JSON이라 `source: "nightly"`·`deferReason`·`changedValues`는 스키마 변경이 아니다. `subtype`도 문자열 컬럼이다(`prisma/schema.prisma:467`).
- `IMPORT_SOURCES`에 `"nightly"`를 더하고 `readPayload`를 늘린다(`oneOfRaw` 폴백이 `"ci"`라 **새 값을 빠뜨리면 야간 사건의 source가 CI로 읽힌다** — 테스트로 고정). 주체 판정은 subtype을 보므로 이 폴백에 기대지 않는다.

## 새 환경변수

없다.

## 불변식 영향

- **병합 없음(§0)**: 판정 입력은 편집 토큰 수 · head SHA 동일성 · PR 열림 여부 셋이고 **리포 값과 DB 값을 견주는 코드가 없다.** 열린 PR 게이트는 셀을 고르지 않고 적재 전체를 보류한다. `changedValues`는 적재 뒤 관측값이다.
- **보류 판정의 입력이 늘어난다** — CLAUDE.md "보류 판정은 리포를 보지 않는다 — 입력은 미전달 편집 수 하나"와 ACTIONS "열린 PR 경고는 차단이 아니다"를 뒤집는다(검수 2026-09-29 사용자). 문서 갱신은 G 태스크.
- **strict 적재**: 한 줄도 안 바뀐다. 게이트가 "언제 돌리나"만 늘린다.
- **편집 보호**: 자동 경로의 `approvedTokens`는 언제나 빈 배열이고 표면마다 사후 재집계가 선다 — 편집을 버리는 길은 여전히 OWNER 지문 승인 수동 Sync와 Revert 둘뿐이다.
- **export 결정성·blob SHA**: 건드리지 않는다.
- **인증 경계**: `/api/push`의 GitHub 호출은 프로젝트 토큰 인증 뒤, installation 토큰으로만. `/api/pull`은 `CRON_SECRET` 그대로.
- **자격증명 셋**: installation 토큰만 쓴다.
- **외부 계약**: `/api/push` 응답이 union으로 넓어지고 action v3가 나간다. MCP `list_events`가 새 subtype·결과·필드를 그대로 싣는다(`lib/mcp/tools/project.ts:89-90`, ARCHITECTURE §6.45).
- **개인정보 방침**: 새 목적·전송처·쿠키·보존 없음(GitHub은 이미 전송처).

## 과거 함정 (POSTMORTEM)

- **2026-08-31 외부 계약을 리터럴로 조립** — `PullItem`·`PushResponse`는 타입으로 늘리고 생산자에도 붙인다.
- **2026-09-03 실패한 조회를 "없음"으로 읽었다** — 바로 이 열린 PR 경고에서. 삼상태(`undefined` = 확인 못 함)를 그대로 쓰고, `planOpenPrGate`·`planNightly` 테스트가 `undefined`를 `null`과 다른 갈래로 고정한다.
- **2026-09-06 전면 장애가 성공과 같은 관측값** — cron 응답은 200 배열이고 본문이 버려진다. 새 skip·보류 사유·적재 실패도 요약 로그 한 줄의 카운터에 실린다.
- **2026-09-09 되돌린 편집이 PR에 남았다 / "변경 0건"이 무엇 대비인가** — head 비교는 **base head 대비**다. sync 브랜치 상태와 섞지 않는다.
- **2026-09-13 원격 신호 하나의 실패가 동시 제한을 풀었다** — head·PR 조회를 `Promise.all`로 묶지 않는다(순차, head 먼저).
- **2026-09-14 0행 갱신은 조용하다** — 자동화 적재의 사건 닫기도 `finishRun`의 `closed` 검사를 지난다.
- **2026-09-14 같은 모듈끼리 비교한 테스트는 공허하다** — `triggerOf`·`triggerWhere` 대조는 실제 행(E2)으로.
- **2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셌다** — `lastNightlyAt` 쓰기 자리는 `runNightly` 머리 한 곳이다.
- **2026-09-17 merge commit 마커** — 야간 적재가 Malmoi PR 머지 커밋을 다시 적재하는 것은 루프가 아니다: 야간 Publish는 편집이 있을 때만 PR을 만들고, 적재는 편집 토큰을 만들지 않는다.
- **2026-09-18 관계 조인이 낡은 통계에서 인덱스를 버렸다** — `changedValues` CTE는 `EXPLAIN`으로 인덱스를 확인한다.
- **2026-09-27 야간 Publish가 Logs에서 다른 어휘로 섰다** — 같은 조건은 CI·야간 모두 같은 결과어(`deferred` + `deferReason`)다. `eventResult`·`resultWhere`·`RESULTS` 파생, `triggerOf`와 `triggerWhere`가 같은 행을 가르는지 `query.integration.ts`에 행을 심는다.
- **2026-09-29 행위자 라벨이 원문 이메일을 실었다(#146)** — Home의 새 사건 조회는 행위자를 `select`하지 않는다.
