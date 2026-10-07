# Principle 정적 감사 — 2026-10-07

실행 검증은 미완이다. 요청에 따라 테스트·typecheck·빌드·DB 접속·브라우저·GitHub 왕복을 실행하지 않았다. 아래 실패 시나리오는 실제 실행 결과가 아니라 소스의 조건과 호출 순서로 확정한 경로다. 코드·문서·설정·커밋·원격 변경은 없으며 이 보고서만 작성했다.

## 기준과 범위

- 시작 시 `git rev-parse HEAD origin/dev`: 둘 다 `bc8b204f18fa1aa88a0423e28f0789876f1fbf54`.
- 최근 diff로 좁히지 않고 값 소유권·보호·도메인 수명을 감사했다.
- `source-command-audit` 적용. 오래된 스킬의 pending 수 하나·UI 생성물 제외 설명은 쓰지 않고 현재 정본을 우선했다. 자동 보호는 pending·열린 PR·조회 실패·publish-raced를 함께 확인했다.
- 하위 탐색 3개를 같은 Codex 계열로 병렬 실행: merge_free(push/import/nightly/protection/pull), write_owners(keys/edit/events/sources), scope(prisma/scripts/PRODUCT).
- CLAUDE는 부모의 초기 출력과 잘린 중간 구간 재열람으로 읽었다. PRODUCT는 scope 담당이 1–1120행 전문을 읽었다. ARCHITECTURE는 §0·§3·§5.5–5.9·§7 등 담당 관련 절을 읽었으며 4,007행 전체 완독을 주장하지 않는다.
- POSTMORTEM은 `rg -c '^### 20' docs/POSTMORTEM.md`로 **143항목**을 확인했다. 전문 1–2706행을 팀 분담으로 읽었다: merge_free 1–900, write_owners 901–1800, scope 1801–2706. 출력 잘림 구간은 재열람했다. 관련 항목의 재발방지 검사는 아래에 헤딩별로 기록했다.

## 발견

### 1. 🟡 [principle] 보관을 완료한 프로젝트에서 야간 Publish가 새로 시작될 수 있다

**위치:** `lib/sync/run.ts:114` · `lib/nightly/run.ts:109`.

`app/api/pull/route.ts:55`에서 전체 대상 행을 먼저 수집하고, `:77`에서 보관 여부를 판정한 뒤 프로젝트별로 순회한다. 그 사이 OWNER가 `runArchive`를 완료해도 cron 실행권 획득은 Project 잠금만 잡고 최신 `archivedAt`을 읽지 않는다. `lib/sync/run.ts:138`의 재조회도 import lease만 읽으며 `:173`에서 새 RUNNING 행을 만든다. `lib/pull/load.ts:49`의 스냅샷도 프로젝트 보관을 확인하지 않고, `lib/protection/where.ts:13`은 소스 보관만 제외한다.

**실패 시나리오:** 활성·미전달 편집이 있는 프로젝트가 cron 대상으로 캡처된다 → 앞 프로젝트 처리 중 OWNER가 프로젝트 보관을 커밋한다(`lib/projects/archive.ts:27–39`) → 뒤늦게 해당 target의 방문이 시작된다 → pending이 남아 Publish 갈래로 들어가 새 SyncRun과 PR 생성/갱신을 수행한다. 보관 전에 시작한 Publish를 완료하는 상황이 아니라, 보관 완료 후 실행권을 새로 받는 상황이다.

**기준:** PRODUCT §7.9(`docs/PRODUCT.md:1028`, `:1059`)의 보관 시 편집·Publish·야간 중단. ARCHITECTURE §5.6.4. POSTMORTEM 2026-09-23의 잠금 뒤 활성 상태 재확인 원칙과 같은 누락이다.

**기존 테스트가 놓치는 이유:** `lib/pull/__tests__/targets.test.ts:133–145`는 선정 시점에 이미 보관된 객체만 검사한다. `lib/nightly/__tests__/nightly.integration.ts:226`은 프로젝트가 아니라 소스 보관을 검사한다. 선정→보관 완료→cron 실행권 획득 순서가 없다.

**수정 방향:** cron 실행권도 Project 잠금 뒤 최신 프로젝트 보관 여부를 검사한다.

### 2. 🟡 [principle] 오래된 야간 브랜치 부재 관측이 새 적재 성공 상태를 실패로 덮는다

**위치:** `lib/nightly/run.ts:143`.

야간의 `branchMissing` 갈래는 최초 target에서 캡처한 소스 id만으로 `lastImportError`와 `lastImportFailedAt`을 쓴다. Project 잠금, 현재 리포/브랜치, `importRevision`, 현재 보관 상태 대조가 없다. 반면 일반 적재의 `lib/import/run.ts:197–213`은 Project→Surface 잠금 뒤 설정·revision·lease·보관을 재검사한다.

**실패 시나리오:** cron이 baseBranch=old인 target을 수집하거나 old head를 조회한다 → OWNER가 존재하는 new 브랜치로 설정을 바꾸고 Sync/CI가 성공하여 소스 오류를 지운다 → 기존 target의 old 브랜치 조회가 null로 끝난다 → 야간은 new에서 이미 정상 적재된 소스를 다시 `import-failed`로 만든다. 실패 사건이 과거 관측으로 남는 것과 현재 소스 건강성을 덮는 것은 별개다. Home·Sources가 성공한 소스를 실패로 보이며 불필요한 재시도를 요구한다.

**기준:** ARCHITECTURE §5.5.7의 실행 소유권·revision 검사, §5.7의 사실에 맞는 상태/사건. POSTMORTEM 2026-09-13 ‘임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다’의 늦은 종료가 새 상태를 덮는 형태다.

**기존 테스트가 놓치는 이유:** `lib/nightly/__tests__/nightly.integration.ts:226–254`는 부재 방문이 끝난 후 복구 방문을 실행한다. 오래된 응답/target이 새 설정과 성공 뒤 도착하는 역순 경합을 만들지 않는다.

**수정 방향:** 소스 상태 변경은 잠금 뒤 캡처 설정·revision과 최신 상태가 여전히 일치할 때만 적용한다.

### 3. 🔴 [principle] no-changes 전달 확인이 자동 적재 경합 표식을 전진시키지 않아 편집이 다시 덮인다

**위치:** `lib/pull/run.ts:405` · `lib/pull/load.ts:219` · `lib/push/apply.ts:157`.

no-changes는 전달된 편집 토큰을 해제하지만 published 인자가 undefined여서 lastPublishedAt은 그대로다. 자동 적재가 대조하는 완료 표식은 lastPublishedAt 하나이므로, 사전 검사 뒤 일어난 이 전달 확인을 감지하지 못한다. `lib/pull/load.ts:295–296`의 토큰 해제는 실행되고, 그 뒤 `lib/push/apply.ts:151–162`는 표식 동일·pending 0을 보고 strict 적재한다.

**실패 시나리오:** (1) DB 마지막 적재 커밋은 C다. (2) C보다 새 커밋 A의 CI가 pending 0/열린 PR 없음 검사까지 끝내고 `app/api/push/route.ts:248` 뒤, `:257` 진행 표시 이전에 대기한다. (3) 리포 base는 B로 전진했지만 B는 아직 DB에 적재되지 않았다. (4) 사용자가 목표 로케일 셀을 B의 값으로 편집한다. 다른 모든 export 값은 base와 같다고 둔다. (5) Publish가 base B와 바이트 동일해 no-changes로 끝나며 편집 토큰을 해제한다. (6) 대기 CI A가 재개해 그 셀을 A 값으로 덮는다. (7) 다른 셀을 편집하고 Publish하면 DB 전체 스냅샷이 해당 셀의 A 값을 B 위로 내보낸다. 이전 sync 브랜치가 없어도 성립하며, 있으면 no-changes reset 경로에서도 같다.

**역행 가드가 못 막는 이유:** `lib/push/apply.ts:189`는 A와 DB의 `surface.lastCommitAt=C`만 비교한다. `lib/push/guard.ts:133–138`은 A≥C이면 통과한다. Publish는 surface.lastCommitAt을 B로 바꾸지 않고, CI도 현재 원격 head B와 payload A를 대조하지 않는다. `lastPulledAt`과 `DeliveryConfirmation.revision`은 이 자동 적재 가드의 입력이 아니다.

**기준:** POSTMORTEM 2026-10-07 ‘허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다’의 방어 목적이 no-changes 전달 확인에는 닿지 않는다. ARCHITECTURE §5.8도 no-changes를 전달 확인으로 정의한다. 표시용 lastPublishedAt을 스킵에서 바꾸지 않는 옛 계약 자체를 위반이라고 하는 것이 아니라, 그 컬럼을 모든 전달 확인의 경합 감지자로 쓰는 불완전성을 지적한다.

**기존 테스트가 놓치는 이유:** `lib/keys/__tests__/sync-edit-protection.integration.ts:202–211`은 no-changes의 토큰 해제와 lastPublishedAt null을 각각 정답으로 검증한다. `:646–660`의 단조 표식 검사는 prUrl이 있는 published만 부른다. `lib/pull/__tests__/run.test.ts:345–354`도 reset이 published를 넘기지 않는지만 확인한다. 전달 확인과 이미 사전 검사를 통과한 CI를 이어 실행하는 이 조합은 없다.

**수정 방향:** 표시용 lastPublishedAt과 별도로 no-changes 전달 확인에서도 전진하는 완료 표식을 자동 적재 경합 가드가 비교한다.

## 확인한 정상 계약

- strict upsert는 값 비교로 승자를 고르지 않는다. `lib/push/apply.ts:480`의 충돌 갱신은 리포 값으로 덮고 `updatedBy`를 비우며, pending token/승인 token 조건을 따른다. changedValues는 관측값이다. `rg -n 'changedValues' lib/protection lib/nightly -g '!**/__tests__/**'` 결과 0건.
- 키·로케일은 orphaned, 소스·프로젝트는 archivedAt이다. `translation/stringKey/projectEvent delete/deleteMany`, 해당 테이블 `DELETE FROM`을 app/lib/scripts/prisma 비테스트 소스에서 검색해 도메인 삭제 경로를 찾지 못했다. 기준선·자격증명 삭제와 혼동하지 않았다.
- 저장은 `lib/keys/save-key.ts:58,86,105,181`의 잠금·저장·사건 tx를 공유한다. 같은 값은 noop이고 새 값만 새 토큰을 만든다. Revert는 `lib/keys/revert.ts:120–159`에서 잠금 뒤 권한·활성·지문을 재확인하고 값·토큰·사건을 함께 쓴다.
- 소스 제거는 `lib/surfaces/remove.ts:42,84`에서 orphan 포함 해당 소스 전체 토큰을 지문에 담고, `:88–100`에서 논리 보관·기본 승계·사건을 원자적으로 쓴다. 되살림은 `lib/surfaces/create.ts:73,87–134`에서 같은 id/slug와 승인 토큰으로 첫 strict 적재를 수행한다.
- `lib/pull/load.ts:257–266`은 캡처 토큰 CAS이며 활성 소스·키·로케일만 해제한다. `confirmDelivery`는 Project→정렬된 Surface 잠금, 실행권·context 확인 후 baseline/confirmation을 쓴다. 승인 Sync의 orphan token 해제도 승인 집합으로 제한된다.
- 저장의 stale RUNNING `publishInFlight`는 ARCHITECTURE §5.8에 명시적으로 남겨 둔 감수이므로 새 결함으로 올리지 않았다.
- PRODUCT의 현재 허용 범위(소스 제거/재추가, MCP, 시간대, 기본 System 등)를 옛 비범위 문구와 구별했다. PRODUCT:443의 System 기본값 비범위 문구는 :391 최신 결정과 충돌하는 debt 참고사항이며 principle 코드 결함 통계에는 넣지 않았다.

## POSTMORTEM 재검 기록

아래는 실제 실행한 검색 또는 읽기 명령이다. `재발 없음`은 정적 검사 대상에서 알려진 패턴을 찾지 못했다는 뜻이며 테스트 통과를 뜻하지 않는다. 동일 헤딩의 추가 재발 문단도 포함한다. 인증·UI 스타일·포커스·어댑터 표현 통계 등 나머지 항목은 전문 읽기 후 principle 비대상으로 분류했고, 다른 감사 차원의 통과로 간주하지 않았다.

### 2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red

검사: `rg -n '\benv\(|requireEnv\(' scripts prisma.config.ts`

근거·판정: config:44–49 조건부 datasource, smoke/backfill은 함수 안. 재발 없음; 환경 없는 실행 미완.

### 2026-08-31 — process.exit()이 파이프 stdout을 잘라먹고, exitCode로 바꾸니 조기 종료가 사라짐

검사: `rg -n 'process\.exit\(' scripts`

근거·판정: push-local 마지막은 exitCode, ingest/scan 자연 종료. 대량 파이프 실측 미완.

### 2026-08-31 — 외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다

검사: `rg -n 'buildPushPayload|PushPayloadType|previousBaseLocale|sourceHash' lib/push lib/import scripts/push-local.ts -g '!**/__tests__/**'`

근거·판정: payload.ts:101,114 생산자 타입, push-local.ts:223 공유 생산자. 재발 없음.

### 2026-09-02 — 구분자가 데이터에도 있어서 중첩 복원이 값을 조용히 삼켰다

검사: `rg -n 'nestedByPath|segmentsOf|key-shadowed|function (locate|resolveLast|findScalar|insertPath|insert)\b' lib/adapters/json-catalog.ts lib/adapters/code-dict.ts lib/adapters/yaml-catalog.ts lib/adapters/ts-dict.ts lib/survey/one.ts`

근거·판정: JSON structure.paths의 segmentsOf, key-shadowed 및 payload nestedByPath 전달 유지. 어댑터 의미·바이트 왕복은 미완.

### 2026-09-02 — 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다"

검사: `rg -n 'isBase|writeStrategy|multi-locale|currentFiles|sourceText' lib/pull/plan.ts lib/pull/render.ts`

근거·판정: render.ts:159,184가 원본 공급, multi-locale 직전 출력 전달. 담당 값 전달 재발 없음.

### 2026-09-02 — `pnpm <script> --json | jq`는 이 리포에서 한 번도 동작한 적이 없다

검사: `rg -n 'process\.exit\(' scripts`

근거·판정: 자연 종료 정적 확인. pnpm 파이프 대량 실행은 금지로 미완.

### 2026-09-02 — 지표 하나가 반년째 구조적으로 0이었고, 그 사실을 단위 테스트가 가려 줬다

검사: `rg -n 'buildPushPayload|PushPayloadType|previousBaseLocale|sourceHash' lib/push lib/import scripts/push-local.ts -g '!**/__tests__/**'`

근거·판정: 값 전달 생산자 연결 유지. changedValues는 커밋된 표면만 합산하는 관측값. survey 통계 자체는 invariant/debt.

### 2026-09-03 — 주석이 "명시 지정은 동작한다"고 단언했고, 그걸 검사하는 테스트의 **이름만** 그랬다

검사: `sed -n '345,354p' lib/pull/__tests__/run.test.ts`

근거·판정: 테스트가 실제 reset을 부르지만 CI 경합 연결은 없음. 발견 3의 조합 공백.

### 2026-09-03 — 실패한 조회를 "없음"으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다

검사: `rg -n '2>/dev/null|\|\| true' .github scripts`

근거·판정: 삼키는 실행문 없음, action.yml:137 경고 주석. PR undefined는 pr-check-failed로 보류. 재발 없음.

### 2026-09-03 — 값이 맞으면 통과하는 검증이 스타일 손실을 못 봤다 (인용 부호)

검사: `rg -n 'replaceWithText\(JSON.stringify|initializer: JSON.stringify|addPropertyAssignment|doc\.toString|setIn\(' lib/adapters/json-catalog.ts lib/adapters/code-dict.ts lib/adapters/yaml-catalog.ts lib/adapters/ts-dict.ts lib/survey/one.ts`

근거·판정: 위험 패턴 0, pull 원본 공급 유지. 표현 실물 검증 미완.

### 2026-09-05 — 테스트 가짜가 실제 제약보다 관대해서 결함 하나를 원리적으로 못 봤다

검사: `rg -n '@@unique|@unique' prisma/schema.prisma; rg -n 'P2002|throw' 'app/(edit)/__tests__/harness.ts'`

근거·판정: harness:505,639,684,1237 unique 및 :1223,1235 composite FK 존재. PG 실행은 미완. 발견의 시간 순서 조합은 기존 테스트에 없음.

### 2026-09-08 — `?? 폴백`이 프로토타입 키를 못 막아 문자열 자리에 **함수**가 왔다

검사: `rg -n 'Object\.hasOwn|nestedByPath' lib/adapters/json-catalog.ts`

근거·판정: JSON own-property, pull render rowsForLocale own-property, 슬롯 null-prototype 맵. 담당 값 조회 재발 없음.

### 2026-09-09 — 일회용 허가를 "다음 push에서 비운다"로 구현해, 흔한 경로에서 기능이 조용히 무력화됐다

검사: `rg -n 'DELETE|deleteMany|delete\(|ON CONFLICT|updatedBy|pendingEditToken|declaredBaseLocale|needsReview' lib/push/apply.ts lib/import/run.ts lib/protection`

근거·판정: apply.ts:385 baseChanged에만 선언 소비. 승인 upsert 및 승인+orphan만 token 해제. 재발 없음.

### 2026-09-09 — 번역자가 셀 하나를 비우면 키가 사라질 수 있었다, 그리고 되돌린 편집이 PR에 남아 있었다

검사: `rg -n 'isBase|writeStrategy|multi-locale|currentFiles|sourceText' lib/pull/plan.ts lib/pull/render.ts; sed -n '350,410p' lib/pull/run.ts`

근거·판정: base 빈값 원문 폴백, no-changes sync ref reset/PR close 유지. 옛 증상 재발 없음, 새 자동 적재 경합은 발견 3.

### 2026-09-09 — 화면을 라우트 밖으로 옮겼는데 그 화면을 무효화하던 경로가 따라가지 않았다

검사: `rg -n 'lastImportStartedAt|markImportStarted|finishImportRun|revalidatePath' lib/projects lib/push/apply.ts 'app/(edit)/projects/actions.ts' app/api/push/route.ts -g '!**/__tests__/**'`

근거·판정: route.ts:307–309, actions.ts:821–823,848–850 프로젝트 하위/목록/신규 무효화. 재연결 settings/actions.ts:241,243. 재발 없음.

### 2026-09-09 — 프로토타입 키의 **조회** 자리만 닫고 **대입** 자리 다섯을 1년 가까이 남겨 뒀다

검사: `rg -n 'Object\.hasOwn|nestedByPath' lib/adapters/json-catalog.ts; cat lib/pull/load.ts`

근거·판정: load Object.fromEntries, render null-prototype 슬롯 등 조회와 대입 모두 확인. 담당 전달 재발 없음.

### 2026-09-09 — 검증이 **탐지** 경로에만 있었고 **적재** 경로에 없어, 페이로드가 리포 경로를 정했다

검사: `sed -n '147,194p' lib/push/apply.ts`

근거·판정: 잠금 뒤 프로젝트·표면·포맷·역행 재검사. 임의 경로로 값 쓰기 우회 없음. 전체 경로 안전은 boundary/invariant 담당.

### 2026-09-12 — 저장 중 서버 값을 수신 처리했지만 실패 후 취소 기준은 옛 값이었다

검사: `rg -n 'mergeServerRows|inFlight.sent|state.order|beforeunload' lib/translations components/translations --glob '!**/__tests__/**'`

근거·판정: 초안/서버 응답 배선 확인. 저장 실패 후 DOM 입력 상태 실행 검증은 미완.

### 2026-09-13 — 원격 신호 하나의 실패가 워커 풀의 동시 제한을 풀었다

검사: `rg -n 'Promise.all\(' lib/keys lib/events lib/sources lib/surfaces -g '*.ts' -g '!**/__tests__/**'`

근거·판정: 담당 조회 조립에 원격 풀 조기 반납 형 없음. nightly head→PR 순차. 원격 풀 전체는 담당 외.

### 2026-09-13 — 임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다

검사: `rg -n 'lastImportStartedAt|markImportStarted|finishImportRun|revalidatePath|finally' lib/projects/import-status-store.ts 'app/(edit)/projects/actions.ts' app/api/push/route.ts`

근거·판정: 일반 종료 token CAS/Sync lease·revision·settings 확인. nightly branchMissing는 우회: 발견 2, 늦은 종료 상태 덮기 재발.

### 2026-09-13 — 일회용 연결 요청을 락 전에 읽어 재사용 결과가 달라졌다

검사: `cat lib/import/approval.ts lib/protection/fingerprint.ts lib/keys/revert.ts`

근거·판정: 실행 지문은 잠금 뒤 재계산, 사용자·프로젝트·리포/브랜치·표면·토큰에 바인딩. 승인 선조회 재사용 없음.

### 2026-09-14 — 확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다

검사: `rg -n 'ensureUserToken' lib/pull lib/push; rg -n 'checkArchived|archivedAt' lib/push/guard.ts lib/pull/targets.ts lib/auth/access.ts`

근거·판정: pull/push 사용자 토큰 0. 보관 사전 제외는 있지만 cron 최신 재검사 없음(발견 1). 소스 제거는 세는 토큰=승인 토큰.

### 2026-09-14 — nullable 경계 추가만으로 옛 upsert의 소유권 충돌이 사라지지 않는다

검사: `rg -n 'ON CONFLICT' lib app --glob '*.ts' --glob '!**/__tests__/**'`

근거·판정: apply.ts:249 Locale (projectId,surfaceId,code), :480 Translation 키/locale, 현재 복합 FK. B단계 소유권 반영.

### 2026-09-14 — 표면 복합 FK 추가 뒤 새 프로젝트 생성이 Project.id NULL로 실패했다

검사: `rg -n 'project\.create\(' app lib scripts --glob '*.ts' --glob '!**/__tests__/**'; sed -n '210,255p' lib/onboarding-run/create.ts`

근거·판정: create.ts:232 id 명시, OWNER 동일 tx. 재발 없음.

### 2026-09-14 — TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다

검사: `rg -n '\$transaction.*in|in.*\$transaction' lib app --glob '*.ts' --glob '!**/__tests__/**'`

근거·판정: 런타임 속성 client 판별 없음. applyPushInTransaction에 열린 tx 전달. 재발 없음.

### 2026-09-14 — 컬럼을 뗀 마이그레이션이 스모크 스크립트를 죽였고, typecheck가 `select`를 안 본다

검사: `rg -n 'select:|adapterName|pathTemplate|lastCommitSha' scripts/smoke-github.ts scripts/credentials.ts scripts/finalize-credentials.ts`

근거·판정: smoke:58 defaultSurface 아래 조회, 사라진 Project 열 조회 없음. prisma-select-columns.test.ts 소스도 열람.

### 2026-09-15 — 읽힌 엔트리 0개를 정상 빈 카탈로그로 판정하면 기존 키를 전부 고아로 만든다

검사: `rg -n 'entries\.length|errors\.length|verifyEmptyCatalog|empty' lib/import/surface.ts lib/import/empty.ts lib/onboarding/ingest.ts`

근거·판정: surface:70 empty는 verifyEmptyCatalog 통과 필요, empty:28,33 구조 검사. 재발 없음.

### 2026-09-15 — 설정 변경으로 Sync 적용을 거부한 뒤 자기 진행 표시가 남았다

검사: `rg -n 'lastImportStartedAt: null|lastImportToken|repositoryImportToken|importOutcomeFields' lib/import/run.ts lib/projects/import-status-store.ts lib/push/apply.ts`

근거·판정: run:403–406 자기 lease/token만 해제. superseded 종료 표시 해제 존재. 재발 없음.

### 2026-09-15 — `needsReview`와 `updatedBy`를 같은 행에서 찾아 화면 문구가 영영 안 뜰 뻔했다

검사: `rg -n 'needsReview|updatedBy' lib/keys/query.ts; sed -n '615,640p' lib/keys/query.ts`

근거·판정: 활성 값 셀 partition review count와 대표 저자 선택 별도. 재발 없음.

### 2026-09-15 — 컬럼을 더하며 쓰는 자리를 전수로 안 세서 종료 경로 다섯 중 둘에만 붙었다

검사: `rg -n 'lastImportError:' lib app --glob '*.ts' --glob '!**/__tests__/**'`

근거·판정: importOutcomeFields 공유, 외부 실패·되살림 초기화는 별도 의미. 실패 시각 누락 없음, 늦은 상태 덮기는 발견 2.

### 2026-09-16 — Publish 미리보기가 로케일을 무시하고 첫 파일을 골랐다

검사: `rg -n 'matches\[0\]|paths\[0\]|localeCode.*path' lib/publish`

근거·판정: read.ts:103 locale+key own-property, :109 한 경로 요구. 첫 파일 임의 선택 없음.

### 2026-09-16 — 같은 요청의 `Promise.all`이 토큰 회전을 둘로 겹쳤고, 내가 단 주석이 그것을 "안전하다"고 정당화했다

검사: `rg -n 'Promise.all\(' lib/keys lib/events lib/sources lib/surfaces -g '*.ts' -g '!**/__tests__/**'`

근거·판정: 저장·Revert·전달 확정 tx 쓰기는 순차. token 회전 전체는 boundary 담당.

### 2026-09-17 — 번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다

검사: `rg --hidden -n 'head_commit' .github lib docs --glob '!docs/POSTMORTEM.md' --glob '!docs/features/**'; rg -n 'PR_TITLE|SKIP_MARKER|withSkipMarker' lib/pull/payload.ts lib/pull/run.ts`

근거·판정: 커밋/PR 제목 마커, 재사용 보정, roundtrip 머지 방식 인자 유지. 실제 merge 왕복 미완.

### 2026-09-18 — 관계 필터 count가 대량 적재 직후 5.5초였다 (Prisma LEFT JOIN × 낡은 통계)

검사: `rg -n 'count\(\{ where: pendingWhere|findMany\(\{ where: pendingWhere|LEFT JOIN "Translation"|LATERAL|AS MATERIALIZED' lib app --glob '!**/__tests__/**'`

근거·판정: where:37,55,74 토큰 선행 count, translation-list:152,155 MATERIALIZED. 성능 실측 미완.

### 2026-09-19 — 개인정보처리방침이 코드와 어긋난 문장 셋을 실은 채 green이었다

검사: `rg -n 'projectInvitation.delete|session.deleteMany|verificationToken.delete' app lib --glob '*.ts' --glob '!**/__tests__/**'`

근거·판정: 도메인 초대 삭제 0, credential/session challenge 삭제와 구분. 방침 전체 대조는 boundary/debt.

### 2026-09-20 — 소스 추가 커밋 뒤 캐시 오류가 전체 롤백으로 보고될 수 있었다

검사: `rg -n 'revalidatePath|settleRevalidate' 'app/(edit)/projects/actions.ts' 'app/(edit)/projects/[slug]/settings/actions.ts'`

근거·판정: 10/7 재발 네 경로 settleRevalidate, addSurfaces 직접 호출 별도 catch. 재발 없음.

### 2026-09-20 — 활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다

검사: `rg -n 'pendingEdits !== null|finishedAt: row.finishedAt|PROJECT_WIDE|before: project\.' lib/events components/logs app`

근거·판정: query:203 종료시각 조인, :240 import running, filter:78 특수값, query:334 범위. 변경 before 잠금 뒤, 사건 동일 tx. 알려진 재발 없음.

### 2026-09-23 — Revert가 잠금 대기 중 회수된 OWNER 권한으로 실행됐다

검사: `rg -n 'FOR UPDATE|projectMember\.(delete|update)' 'app/(edit)/projects' lib/keys; rg -n '"Project" WHERE "id" = .* FOR UPDATE' app lib -g '!**/__tests__/**'`

근거·판정: Revert/save/수동 Publish 잠금 뒤 인가·보관 확인. cron 보관 재확인 누락은 발견 1, 같은 방어 원칙 재발.

### 2026-09-23 — 번역 화면의 부분 응답과 낙관적 상태가 다음 작업을 가렸다

검사: `rg -n 'mergeServerRows|inFlight.sent|state.order|beforeunload' lib/translations components/translations --glob '!**/__tests__/**'`

근거·판정: 호출 배선 확인, 부분/늦은 응답/탭 이동 DOM 동작은 실행 금지로 미완.

### 2026-09-24 — 비리터럴 값 하나로 904키가 다 들어간 소스가 "Last sync failed"가 됐다

검사: `rg -n 'errors\.length' lib/onboarding lib/import lib/surfaces lib/push -g '!**/__tests__/**'`

근거·판정: ingest:135–145 adapterErrorKind로 걸러 집계. 재발 없음.

### 2026-09-24 — chrome `"placeholders": null`이 push→pull 왕복에서 사라졌다 (Prisma가 JSON null과 SQL NULL을 같게 읽는다)

검사: `rg -n 'Json\?' prisma/schema.prisma; rg -n 'jsonb_typeof' lib/pull/load.ts`

근거·판정: Json? 둘, load:99 JSON null 좌표 같은 스냅샷 읽기와 placeholders 복원. PG 왕복 미완.

### 2026-09-27 — 경로 **안전**만 검사해 경로가 **옳은지**를 안 봤고, 토큰을 받는 사람이 리포에 쓸 수 있는지도 안 봤다 (sec-audit-3 발견 1)

검사: `sed -n '1731,1773p' docs/ARCHITECTURE.md; sed -n '147,194p' lib/push/apply.ts`

근거·판정: 적재 잠금 뒤 저장 포맷/표면 재검사. 값 쓰기 우회 발견 없음. 전체 입력 경로 안전은 boundary/invariant.

### 2026-09-27 — base 파일을 못 읽어 거부된 야간 Publish가 Logs에 "Nothing to send"로 섰다

검사: `rg -n 'withheld > 0|withheld: \{ gt|warnings: \{ gt|warnings > 0' lib/events/query.ts`

근거·판정: query:248,366 warnings/withheld/reconfirm 술어 일치. 알려진 notSent→nothing 접기 없음.

### 2026-09-29 — 사건 목록의 행위자 라벨이 사건 2개 이상인 사람의 원문 이메일을 실었다 ([malmoi#146](https://github.com/SinhyeokKang/malmoi/issues/146))

검사: `rg -n 'maskedEmailLabels\(' lib app components --glob '!**/__tests__/**'`

근거·판정: events/query:177–187 people Map, loadEventActors distinct, auth/query:189 주소 distinct. 자기충돌 없음.

### 2026-09-30 — 손으로 조립한 게이트가 29건 red를 dev에 push했다

검사: `rg -n 'pnpm (-s )?(test|typecheck|build|gate)[^\n]*\| *(grep|head|tail)' .claude/commands .agents/skills scripts CLAUDE.md docs --glob '!docs/POSTMORTEM.md'; rg -n 'fullmatch' .claude/commands`

근거·판정: 파이프 히트 경고/테스트 주석, 실행 예시 0. fullmatch 0. 게이트 실행 금지.

### 2026-10-02 — 테스트가 전부 통과했는데 PR CI가 `EnvironmentTeardownError`로 red였다 — 게이트 재시도가 진짜 결함을 가렸다 (PR #171)

검사: `rg -n 'setTimeout\(\(\) => resolve\(late' app lib components`

근거·판정: github-wait 및 공유 fast-github-wait 둘. 새 손 사본 없음. CI/타이머 실행 미완.

### 2026-10-05 — 지휘자가 dev CI red를 두 push 동안 몰랐다 — 로컬 `gate: ok`·CI red인 jsdom 사전 로드 대기

검사: `rg -n 'fullmatch|gh run watch' .claude/commands`

근거·판정: orchestrate:92 exact commit watch 존재. 이 감사는 push/CI를 수행하지 않는다.

### 2026-10-07 — 허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다

검사: `rg -n 'lastPublishedAt|applyProtectedPush|runAutomationImport' lib/push/apply.ts lib/nightly/run.ts lib/import/run.ts app/api/push/route.ts; sed -n '350,410p' lib/pull/run.ts`

근거·판정: committed는 표식 전달/비교/+1ms 유지. no-changes 전달 확인은 표식 미전진: 발견 3, 다른 종료 경로의 재발.

### 2026-10-07 — 파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다

검사: `rg -n 'writeEmpty|propertyNamed|write-empty-unsupported|planClearability' lib/adapters lib/pull/run.ts lib/keys/save.ts; rg -n 'planDelivery' lib/publish/read.ts lib/pull/run.ts`

근거·판정: save:73,107 거부, run:233,344 및 publish/read:130 동일 planDelivery. withheld 분리 뒤 빈값 경고. 재발 없음.

### 2026-10-07 — 비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다

검사: `rg -n 'oauth-server|lib/mcp' scripts/gate-plan.ts vitest.projects.config.ts`

근거·판정: gate-plan:42–43 구현→MCP PG 트리거 연결. network 완료 경계는 boundary 담당.

관련 재검 항목은 아래 보충 3개를 포함해 총 53개다. 교차 영역은 검사한 부분과 미완 범위를 구분했다.

### 2026-09-05 — 검증은 했는데 검증한 값을 저장하지 않아 두 주소가 갈릴 뻔했다

검사: `rg -n 'plan[A-Z].*\(' lib/keys/save-key.ts lib/keys/revert.ts lib/surfaces/remove.ts lib/import/run.ts`

근거·판정: 판정 결과 plan.writes를 실제 저장과 Revert에 사용한다(save-key:135–158, revert:79–102). 검사한 값 대신 다른 원시 입력을 쓰는 단절 없음.

### 2026-09-14 — 설정 YAML이 확정 어댑터를 생략해 CI가 다른 포맷을 보냈다

검사: `rg -n 'adapter:|adapterName|with:' lib/onboarding/workflow.ts; sed -n '118,144p' lib/onboarding/workflow.ts`

근거·판정: workflowSurfaceOf가 저장 adapterName을 adapter로 반환하고 YAML 생산자가 명시 adapter를 싣는다. 확정 포맷을 탐지 순위에 다시 맡기지 않는다.

### 2026-09-16 — 부분 실패 결과가 "임포트가 끝나지 않았다"고 말했다 (끝났고 18키가 들어갔다)

검사: `cat lib/import/result.ts; rg -n 'summarizeRun|partial|halted' lib/import/automation.ts lib/import/run.ts`

근거·판정: summarizeImport는 partial 수 별도, summarizeRun:50–51은 중간 halted일 때 앞 적재가 있어도 partial이다. 부분 성공을 전체 미완/전체 성공으로 접지 않는다.

## 검사 파일 목록

전문·핵심 실행부·관련 줄을 읽거나 검색으로 호출/조건을 대조한 파일을 합쳤다. 각 파일 전체를 완독했다는 목록이 아니다. 전수 rg의 무관한 일치 파일은 제외했다.

```text
.agents/skills/source-command-audit/SKILL.md
.github/actions/malmoi-i18n-push/action.yml
CLAUDE.md
app/(edit)/__tests__/harness.ts
app/(edit)/actions.ts
app/(edit)/projects/[slug]/settings/actions.ts
app/(edit)/projects/[slug]/sources/actions.ts
app/(edit)/projects/actions.ts
app/api/pull/route.ts
app/api/push/route.ts
components/translations/workspace/workspace.tsx
docs/ARCHITECTURE.md
docs/POSTMORTEM.md
docs/PRODUCT.md
lib/adapters/code-dict.ts
lib/adapters/json-catalog.ts
lib/adapters/shared.ts
lib/adapters/ts-dict.ts
lib/adapters/types.ts
lib/adapters/yaml-catalog.ts
lib/auth/access.ts
lib/auth/lock.ts
lib/auth/query.ts
lib/events/filter.ts
lib/events/query.ts
lib/events/record.ts
lib/import/apply-plan.ts
lib/import/approval.ts
lib/import/automation.ts
lib/import/confirm.ts
lib/import/empty.ts
lib/import/locales.ts
lib/import/plan.ts
lib/import/prepare.ts
lib/import/read.ts
lib/import/refusal.ts
lib/import/result.ts
lib/import/run.ts
lib/import/surface-status.ts
lib/import/surface.ts
lib/keys/__tests__/delivery-baseline-fk.integration.ts
lib/keys/__tests__/delivery-invariants.integration.ts
lib/keys/__tests__/revert-key.integration.ts
lib/keys/__tests__/save-key.integration.ts
lib/keys/__tests__/source-remove.integration.ts
lib/keys/__tests__/sync-edit-protection.integration.ts
lib/keys/delivery.ts
lib/keys/query.ts
lib/keys/revalidate-readers.ts
lib/keys/revert-translation.ts
lib/keys/revert.ts
lib/keys/save-key.ts
lib/keys/save-translation.ts
lib/keys/save.ts
lib/keys/translation-list.ts
lib/nightly/__tests__/nightly.integration.ts
lib/nightly/__tests__/plan.test.ts
lib/nightly/plan.ts
lib/nightly/run.ts
lib/onboarding-run/create.ts
lib/onboarding/ingest.ts
lib/onboarding/workflow.ts
lib/projects/archive.ts
lib/projects/import-status-store.ts
lib/projects/import-status.ts
lib/projects/list.ts
lib/protection/__tests__/where.test.ts
lib/protection/backfill.ts
lib/protection/fingerprint.ts
lib/protection/plan.ts
lib/protection/release-orphaned.ts
lib/protection/where.ts
lib/publish/fingerprint.ts
lib/publish/read.ts
lib/pull/__tests__/load.test.ts
lib/pull/__tests__/render.test.ts
lib/pull/__tests__/run.test.ts
lib/pull/__tests__/targets.test.ts
lib/pull/load.ts
lib/pull/plan.ts
lib/pull/render.ts
lib/pull/run.ts
lib/pull/targets.ts
lib/pull/trigger.ts
lib/pull/undeliverable.ts
lib/push/apply.ts
lib/push/assemble.ts
lib/push/guard.ts
lib/push/payload.ts
lib/push/plan.ts
lib/settings/update.ts
lib/sources/actions.ts
lib/sources/base-locale.ts
lib/sources/query.ts
lib/surfaces/create.ts
lib/surfaces/plan-removal.ts
lib/surfaces/remove.ts
lib/survey/one.ts
lib/sync/__tests__/plan.test.ts
lib/sync/plan.ts
lib/sync/run.ts
lib/translations/baseline.ts
lib/translations/context.ts
prisma.config.ts
prisma/__tests__/schema-contract.test.ts
prisma/maintenance/backfill-surfaces.sql
prisma/migrations/20260914070000_finalize_translation_surfaces/migration.sql
prisma/migrations/20260917170000_pending_edit_token_precondition/migration.sql
prisma/schema.prisma
scripts/__tests__/prisma-select-columns.test.ts
scripts/backfill-pending-edit-token.ts
scripts/credentials.ts
scripts/finalize-credentials.ts
scripts/gate-plan.ts
scripts/local.ts
scripts/push-local.ts
scripts/smoke-github.ts
vitest.projects.config.ts
```

## 통계 및 미완

- 감사 범위: principle 전체 경로 및 호출 연결, 최근 diff 한정 아님.
- 탐색 에이전트: 3개 + 부모 교차검증.
- 검사 파일 목록: 118개.
- POSTMORTEM: 143항목 전문 분담 열람, 관련 53개 헤딩별 정적 재검 기록.
- 발견: 🔴 1 · 🟡 2 · ⚪ 0, 합계 3건. 알려진 방어 원칙의 다른 경로 재발 3건(각각 발견 1–3).
- 미완: 실제 DB 잠금 경합 재현, GitHub 왕복, 어댑터 바이트/의미 실측, DOM 상태 전이, 테스트/typecheck/빌드 전부 미실행. ARCHITECTURE 전체 전문 완독은 아님(관련 절 감사).
- 보고서 외 수정 없음.
