# tasks — Sync 편집 보호와 PR 인계

4차 검수로 범위를 다시 좁혔다 — PR diff·미리보기 지문·D2·저장 잠금·승인 HMAC·`planExecutionLease` 제외. **T11·T12는 `publish-pr-handoff` spec으로 분리돼 비었다**(번호는 launch-readiness L1.5가 T0~T19를 가리키므로 유지). 체크박스는 구현 완료 상태가 아니다.
순서는 선행 독립 수정 → 순수 계약 → 데이터/껍데기 → UI → 실물 검증이다. 각 경계의 테스트는 구현보다 먼저 red를 확인한다.
Commit 구분은 작업 단위다. 실제 배포는 **T0 단독(완료) → 호환 A → 보호 B** 세 번이며(design §6.1), A에 사용자에게 보이는 변화를 섞지 않는다.

**검증 줄의 규칙** (2026-09-14 "방어선 셋 다 지워도 green"):
- "0회/없음"을 단언하는 줄은 **같은 픽스처의 허용 경로에서 N > 0**을 짝으로 단언한다. 경로가 아예 안 돌아도 참인 단언은 검증이 아니다.
- 자동(`pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck`)과 수동(`/bugshot-qa` · `/l10n-roundtrip` · 사람이 돌리는 EXPLAIN·실측·`db:status`)을 줄마다 구분한다. 이 리포엔 e2e 프레임워크가 없다.
- **(자동, PG) = `pnpm test:projects:postgres`.** `pnpm test`에 없으므로 `/push` 로컬 게이트가 자동으로 돌리지 않는다 — **각 `/push` 직전 손으로 돌린다**(T18에 그 실행이 단계로 있다).
- PG 통합 테스트는 **`lib/keys/__tests__/sync-edit-protection.integration.ts` 한 파일**에 모은다. 코드 위치와 맞아서가 아니라
  `vitest.projects.config.ts:9`의 include가 `lib/keys/__tests__/*.integration.ts`로 **디렉터리가 박혀 있어서**다 —
  `lib/protection/__tests__/`에 만들면 조용히 0건 수집된다(2026-09-10 "그 스위트는 애초에 안 돌아간다").
- Radix Dialog를 여는 DOM 테스트는 `user-event` + 파일 머리 `vi.setConfig({ testTimeout: 20_000 })`(POSTMORTEM 2026-09-13).

## Commit 0 — 1층 스킵 정렬 (스키마 없음, 단독 배포)

- [x] T0. (2026-09-17 완료 — `lib/keys/unpublished.ts`의 where 조각을 `countUnpublished`와 1층이 공유; dev DB EXPLAIN: 2,721행 프로젝트에서 `Translation_projectId_updatedAt_idx` Index Scan·3행, `lastPulledAt` null인 첫 pull만 전 행) `lib/pull/plan.ts`의 `shouldSkipPull`이 `max(updatedAt)` 대신 기존 미전달 술어(`updatedBy IS NOT NULL ∧ updatedAt > lastPulledAt`)로 판정하게 한다.
  - 검증(자동): `lib/pull/__tests__/run.test.ts:128-161` "push 직후(전 행 `updatedAt` 상승, `updatedBy` 전부 null) → GitHub 호출 0회", **같은 픽스처(`pushedState`)에서 셀 하나에 `updatedBy`를 세우면 호출 > 0**. 기존 "1층 스킵의 API 0회" 테스트 green 유지.
  - 검증(수동): dev DB에서 새 1층 쿼리의 `EXPLAIN` — 위 결과로 기록됨.

## Commit 1 — Pure protection contracts

- [ ] T1. `lib/protection/`을 만들고 design §7 표의 순수 함수(신규 여섯 + 기존 둘의 입력 확장)의 인터페이스 테스트를 작성한다. 결과 union과 거부 순서를 타입으로 고정한다. 지문 계산은 `lib/protection/fingerprint.ts`(crypto)로 분리한다.
  - 검증(자동): 표의 "필수 반례" 열 전부가 red. 최소 구현 후 green. 특히 `planSyncProtectionView`의 **출구 필드가 빈 출력에서 red**, `planProtectedImport`의 pending 1 + 자동에서 `apply`가 나오면 red, `planSyncStart`·`planRepositoryImport`의 stale 경계가 같은 상수를 쓰지 않으면 red.
  - 검증(자동): `components/__tests__/client-graph.test.ts` — `lib/protection/` 중 `fingerprint.ts`가 `"use client"` 그래프에 들어오면 red.
- [ ] T2. spec 완료 조건 ↔ 태스크 대응을 이 문서 끝 표로 확정하고, 순수 판정 가능한 조건을 T1 테스트 이름에 조건 번호로 남긴다.
  - 검증(수동): 표의 12행 모두 담당 태스크가 있고, "순수" 표시된 조건마다 T1 테스트 이름에 `[C#]`가 1개 이상 grep된다.

## Commit 2 — Additive schema and compatible writers (배포 A)

- [ ] T3. `Translation.pendingEditToken String?` additive migration과 `@@index([projectId, pendingEditToken])`을 작성한다(`/db`).
  - 검증(자동): `/db` SQL 검토, 생성 클라이언트 typecheck, 기존 코드가 nullable 컬럼과 호환.
  - 검증(수동): dev DB에서 새 술어(③ raw SQL과 1층 스킵)의 `EXPLAIN`을 인덱스 없음 / `[projectId, pendingEditToken]` / partial 셋으로 기록하고 design §2 판정 기준으로 택한다. 일반 복합으로 Seq Scan이 사라지면 partial을 쓰지 않는다. partial을 택하면 마이그레이션 SQL 수기 사실과 근거를 T14 대상에 올린다. **`[projectId, updatedAt]`의 거취**(전환 뒤 소비자가 backfill 술어뿐)를 같은 자리에서 정한다.
  - 검증(수동): 마이그레이션 뒤 `anon` 권한 0 확인(`/db` 5단계).
- [ ] T4. 호환 writer: `app/(edit)/actions.ts`의 저장 dual-write(값이 실제로 바뀔 때만 새 UUID — `needsReview`만 바뀌면 no-op), `lib/import/`·`lib/push/apply.ts`의 적용 셀 토큰 정리, **Publish 캡처와 CAS 전부** — `loadPullState`(`lib/pull/load.ts:17`, RepeatableRead)에서 `(translationId, pendingEditToken)`을 싣고 `committed`·**`skipped/no-changes` 둘 다**에서 design §2의 `UPDATE … FROM (VALUES …)` 조건부 해제. **판정·집계·UI는 기존 그대로다.** 저장 잠금·거부는 없다.
  - 검증(자동, PG): 저장 → 토큰 생김 / no-op 저장(같은 값·`needsReview`만 변경) → 토큰 불변(**값 변경 → 토큰 회전 대조**) / 적재 → 적용 셀만 null, 실패 파일 셀은 유지(**적용 셀은 null 대조**) / Publish `committed` → 캡처 토큰만 null / Publish `no-changes`(원복) → 캡처 토큰 null(**캡처 밖 셀은 유지 대조**) / **Publish 도중 같은 셀 재저장은 토큰 유지**(barrier, 동일 ms 포함) / A 이전 편집(토큰 null)은 Publish 성공 뒤에도 값·저자 불변.
  - 검증(자동): `lib/keys/**`·`lib/push/apply.ts`·`lib/pull/**`를 건드렸으므로 `pnpm test:projects:postgres` green.

## Commit 3 — Backfill

- [ ] T5. `scripts/backfill-pending-edit-token.ts`와 `lib/protection/`의 `backfillWhere` 조각을 작성한다. SQL 한 문장(`gen_random_uuid()`), 멱등, 0행이 두 번 연속 나올 때까지 반복하는 모드를 둔다. prod 실행은 명령 한 줄에서 `DATABASE_URL`을 prod pooler로 넘긴다(값은 사람이 붙인다 — `.env.local` 편집 금지). 절차는 T14의 OPERATIONS 항목.
  - 검증(자동, PG): backfill 전/후 **활성 셀 집합이 기존 술어 ①②③④⑤와 동일**(양방향 — 토큰 없는 기존-미전달 0, 기존-미전달 아닌데 토큰 있는 행 0). orphan 키/로케일 행의 값·저자 불변 + 토큰 신규 발급 0(**같은 픽스처의 활성 셀에서는 발급 > 0**). 이미 토큰 있는 행 재발급 0(**같은 픽스처의 토큰 없는 행은 발급 > 0**). 첫 실행 > 0행, 두 번째 실행 0행.
  - 검증(자동, PG): A/B 두 프로젝트 격리 — A에만 대상이 있을 때 B의 행 불변(**A의 행은 변경 > 0**).
- [ ] T6. 배포 B용 precondition 마이그레이션을 작성한다(스키마 변경 없음, `DO $$ … RAISE EXCEPTION`, `backfillWhere`와 같은 조건). 선례 `20260914070000_finalize_translation_surfaces`. **실패 복구 절차를 마이그레이션 SQL 주석에 적는다** — `PRISMA_TARGET=prod prisma migrate resolve --rolled-back <name>` → backfill → `db:deploy` 재시도(OPERATIONS §3의 규칙: 전부 롤백 확인 후에만, 체크섬 수정·무조건 applied·DB reset 금지).
  - 검증(자동, PG): PG 픽스처는 `beforeEach`마다 `prisma/migrations/*/migration.sql` 전부를 재생하므로(`list-aggregates.integration.ts:41-48`) T6이 들어간 뒤 빈 DB에선 항상 통과한다 — **T6 앞에서 멈추는 파라미터**(선례 `beforeSurface`)로 적재 → 토큰 없는 미전달 행 삽입 → T6 SQL 단독 실행 → **실제로 throw** 단언. backfill 뒤 같은 SQL → 통과(대조).

## Commit 4 — Protected imports (배포 B)

- [ ] T7. `app/api/push/route.ts`·`lib/push/apply.ts`에 `planProtectedImport`를 연결한다. **`markImportStarted`를 apply tx 안 pending 판정 뒤로 옮긴다**(design §3). pending > 0이면 `deferred`(쓰기 0), 0이면 strict upsert에 `WHERE "pendingEditToken" IS NULL` 가드 + 적용 뒤 재집계 > 0이면 롤백 → `deferred`. `lib/push/payload.ts`에 `PushResponse` 판별 union을 세우고 라우트가 그 타입으로 반환한다.
  - 검증(자동, PG): 표면 A에 편집 + 표면 B로 CI 요청 → `deferred`, **모든 테이블 쓰기 SQL 0회**(Prisma `$extends` 쿼리 훅으로 센다 — 선례 launch-readiness L7.2 검증 줄) + `TranslationSurface.lastCommitAt`·`lastImportToken`·`lastImportStartedAt`·`Project` 불변. **같은 픽스처에서 편집을 비우고 같은 요청 → `applied`, 쓰기 > 0, 진행 표시가 섰다 정리됨.**
  - 검증(자동, PG): 두 표면 CI 요청 동시(barrier) — 둘 다 `deferred`. 저장과 CI 요청 교차 — 저장이 먼저 커밋되면 `deferred`, **CI가 먼저 커밋되면 `applied` + 저장 성공·토큰 유지**(양쪽 다 편집이 산다). 판정 뒤·upsert 전 저장(barrier) → 재집계 롤백 → `deferred` + 편집 유지.
  - 검증(자동, PG): 보관 프로젝트 + pending 1 → `409`(deferred가 아니다 — 가드가 먼저).
  - 검증(자동): `planProtectedImport`의 pending 판정을 `>= 0`으로 뮤테이션하면 red. 재집계 예외를 지우면 barrier 테스트 red.
- [ ] T8. `lib/keys/unpublished.ts`의 `unpublishedWhere`를 `pendingWhere`(토큰 술어)로 바꾸고(②와 1층이 따라온다), 손 사본 ①③④⑤를 같은 술어로 전환한다. `isUnpublished`의 `surfaceArchivedAt`을 required로 좁히고 셀에 `pending: boolean` 투영만 싣는다(토큰 원문 비노출). 뒤집는 기존 주석(`lib/keys/query.ts:563` "활성 로케일 필터를 덧붙이지 않는다", `unpublished.ts:6` "사본 넷")을 같은 커밋에서 갱신한다. `shouldSkipPull`은 바꾸지 않는다.
  - **갱신 대상(red가 나는 기존 테스트)**: `lib/keys/__tests__/unpublished.test.ts:13-19`(전체 `toEqual`) · `lib/pull/__tests__/load.test.ts:65-67`(`updatedBy: {not: null}` 단언) · `lib/keys/__tests__/list-aggregates.integration.ts:315-341·468-485`(픽스처가 `updatedBy/updatedAt`만 심음) · `run.test.ts:134-140`(`pushedState`) · `app/(edit)/__tests__/queries.test.ts:117-133`(하네스 동등성) · 하네스 `translation.count`(`harness.ts:1102-1123`) · `view.test.ts:170-193`(`surfaceArchivedAt` 다섯) · `list-aggregates.integration.ts:320-323`(`select`에 필드 없음) · `Cell` 타입 소비자(typecheck). `TranslationSurface.archivedAt`은 쓰는 곳이 0이라 픽스처는 `list-aggregates.integration.ts:245`처럼 SQL로 직접 세운다.
  - 검증(자동, PG): `list-aggregates.integration.ts`의 동등성 단언에 **④ `lib/publish/read.ts` 사본과 ⑤ 메모리 하네스, L7.2의 `countUnpublishedBySurface`를 추가**해 전부 같은 행을 센다. orphan 키/로케일 편집이 전부에서 제외되고 활성 편집은 누락 0(**활성 편집 > 0 픽스처**).
  - 검증(자동): 신규 키 `?state=new`의 `lastPulledAt` 의미 유지 회귀.
  - 검증(자동): pending 0 프로젝트 1층 스킵 GitHub 호출 0회 + **pending 1에서 > 0**. 셀 RSC 페이로드에 `pendingEditToken` 문자열이 없음(**`pending: true`는 있음 대조**).
- [ ] T9. 수동 Sync 폐기 승인 지문(서버 발급 digest, `fingerprint.ts`)과 실행권을 `lib/import/`에 연결한다 — Project 잠금 → OWNER 재인가 → 지문 재계산·`timingSafeEqual` → `repositoryImportToken`. 폐기 upsert는 `IS NULL OR = ANY($approved)` 조건. 재집계로 "승인 뒤 남은 편집 N건"을 결과에 싣는다. `planSyncStart`·`planRepositoryImport`에 상호 배제 입력을 연결하고 stale 경계를 통일한다. 표면별 부분 결과와 자기 표시 정리를 유지한다.
  - 검증(자동, PG): OWNER 승인 → 적용 / EDITOR 직접 호출 → 거부 / 같은 N 다른 편집(지문 불일치) → reconfirm / Dialog 뒤 새 저장 → reconfirm / 설정 변경 → reconfirm / 부분 성공 뒤 재사용 → 거부 / 일시 실패 뒤 같은 상태 재시도 → 적용. **각 거부 줄에 같은 픽스처의 성공 대조.** 지문 대조 뒤·upsert 전 저장(barrier) → 그 셀은 새 값·토큰 유지 + 결과 "남은 편집 1건"(**승인 집합 셀은 리포 값으로 덮임 대조**).
  - 검증(자동, PG): Publish 진행 중 수동 Sync → busy / 수동 Sync 진행 중 Publish 시작 → busy / stale 상대 → proceed(**양쪽 같은 경계**).
  - 검증(자동): 지문 재계산을 Project 잠금 **앞**으로 옮기는 뮤테이션에서 경합 테스트 red(2026-09-13). `= ANY($approved)`를 지우면 barrier 테스트 red.

## Commit 5 — Publish safety and handoff (배포 B)

- [ ] T10. `planProtectedPublish`를 `lib/sync/run.ts`·`lib/pull/run.ts`에 연결한다. pending 0 no-op(GitHub 0회), writer 경고 사전 중단(기존 `Warnings` 갈래에 "보내지 않았다"), unknown 재시도는 `findOpenPr`(`lib/pull/run.ts:213`)로 실제 PR head 확인 후 해제. 사용자 승인 no-change 정리는 유지한다. `lib/pull/trigger.ts:58-62`의 주석을 갱신한다. (캡처·CAS는 T4에서 끝났다.)
  - 검증(자동, PG): 응답 유실·DB 완료 실패 → 토큰 보존 / 실제 PR 확인 후 재시도 → 해제(**미확인이면 보존 대조**). 다른 활성 셀을 보내도 orphan 셀의 값·저자·잔존 토큰 불변(**같은 픽스처의 활성 셀은 해제됨**).
  - 검증(자동): Publish→Sync→cron에서 GitHub 쓰기 0회(**pending 1에서 > 0**) / Publish→편집 원복→cron → 2층 되돌림 실행 + 캡처 해제(2026-09-09 방어선 자동 경로 유지) / Publish→편집 원복→승인 재Publish에서 no-change 정리 실행 / writer 경고 → 쓰기 0회(**경고 없음 → 쓰기 > 0**) / 검사 SHA = tree/parent SHA.
  - 검증(자동): T4·T7·T9·T10의 조건부 UPDATE에서 `AND "pendingEditToken" = …` 조건을 지우면 red(뮤테이션).
- [ ] ~~T11.~~ **분리됨 → `publish-pr-handoff` spec**(PR 파일 diff·페이지·미리보기 지문).

## Commit 6 — UI (배포 B)

- [ ] ~~T12.~~ **분리됨 → `publish-pr-handoff` spec**(Claude Design 핸드오프). 이 spec의 UI는 기존 프리미티브의 갈래뿐이라 핸드오프가 없다.
- [ ] T13. design §4.3대로 구현한다: `EditLossBanner` 교체(문구 `Repository updates are paused until N unsent changes are sent.`, `info`, **닫기 없음**, `dismissKey`·`lastPulledAt` 소비 삭제, 액션은 헤더 Publish 버튼으로 포커스 이동, pending 0이면 미렌더, `edit-loss-banner.tsx:15-16` 주석 갱신) · Sync Dialog `repositorySync.unsent` 문구 교체 + 확정 라벨 N=0 `Sync from repository` / N>0 `Discard changes and sync` · Home `CardSubline`에 `repositoryUpdatesPaused` 갈래 · `translations-screen.test.ts:160-161`의 `warning` 고정 반전.
  - 검증(자동, DOM): 보호 상태(pending>0)에서 배너 **렌더됨** + `paused` 문구 있음 + `can be lost`·`automatically` 없음 + Dismiss 버튼 없음 / pending 0 → 배너 없음 / 배너 액션 → 헤더 Publish 버튼에 포커스(둘째 Dialog 트리거 없음) / EDITOR에게 Sync CTA 없음(**OWNER → 있음**) / Sync Dialog 문구에 `discard` 1회·`replace` 1회(중복 없음) / 버튼 라벨 N=0·N>0 / 취소 → 무변경(**승인 → 변경**) / Home 카드 pending>0 → `repository updates paused`(**pending 0 → 기존 갈래**).
  - 검증(자동): `lib/i18n/__tests__/no-korean-ui.test.ts`·`brand-spelling.test.ts` green(새 문구는 `messages/en.tsx`).
  - 검증(수동, `/bugshot-qa`): 배너 액션 키보드 포커스 이동, Sync Dialog 승인 뒤 결과의 "남은 편집 N건", **refresh 뒤 결과 유지**(2026-09-07 — jsdom으로는 판정 불가), Home 카드 갈래.

## Commit 7 — Verification and canonical documentation

- [ ] T14. 정본을 구현 결과로 갱신한다. **대상**:
  - `docs/ARCHITECTURE.md` §5.5.2(spec 첫 절의 근거로 판정 교체) · §0 불변식 1(보류 중 유예 단서) · §5.5.7(`markImportStarted` 위치, L3.7 종결) · §5.6.1(partial index를 택했을 때만 — 감수 근거와 EXPLAIN) · §2·§3(토큰 CAS가 2층 no-op 탐지의 토큰판) · §5.6.35는 **유지**(넓히지 않는다).
  - `CLAUDE.md` 코어 원칙 절("push는 덮는다 / 대가는 편집 손실 창") + `pnpm test:projects:postgres` 행(트리거 경로에 `lib/pull/**`·`lib/publish/**`·`lib/import/**`·`lib/protection/**`·`app/(edit)/actions.ts` 추가, "미발송 술어가 세 벌" → "손 사본 넷 + 공유 조각").
  - `AGENTS.md`(`pnpm sync:agents`로 미러), `.claude/commands/audit.md:110`·`.agents/skills/source-command-audit/SKILL.md:117`의 "편집 손실 창(…)을 완화하려는 코드" 감사 항목.
  - `docs/PRODUCT.md` §3·§4.1("갈래 열하나", `pendingEditToken`이 플래그를 단계로 늘리는 것이 아니라는 구별)·§7.6("일부 값을 파일에 기록하지 못함" 결과 상태 소멸 — writer 경고는 쓰기 전 중단) · 야간 cron 문장은 이 spec이 소유(L2.9 포인터).
  - `docs/DESIGN.md`(§6.2 Alert 표 `info` 0→1·`warning` 소비자 변경, §7 1260행 "배너 tone" 규칙, §6.646 Sync 확정 라벨 갈래, Home 카드 갈래) · `docs/ACTIONS.md`(`deferred` 응답과 구 태그 동작) · `docs/DIRECTORY.md`(`lib/protection/`·새 스크립트 + **:261 "표시 전용이고" 문장 확인·:370 "세 벌" 갱신**) · `docs/OPERATIONS.md`(A→backfill→B 절차, prod backfill의 `DATABASE_URL` 한 줄 실행, precondition 실패 시 `resolve --rolled-back` 절차).
  - `docs/features/launch-readiness/tasks.md`: L3.10·L3.5·L7.2·L3.3·L2.9를 L1.5 포인터로 접는다.
  - POSTMORTEM 2026-09-14의 재발 방지 grep 패턴에 `can be lost|automatically`를 더하는 것은 `/postmortem` 소관이므로 **제안으로만 남긴다**(append-only).
  - 검증(수동): `grep -rn "완화하려는 코드\|표시 전용\|완화는 pull 주기\|세 벌" CLAUDE.md AGENTS.md docs .claude .agents --include='*.md' | grep -v POSTMORTEM | grep -v features/` — **갱신 전 결과(2026-09-18 실측: `완화하려는 코드` 2건 · `표시 전용` 2건 · `완화는 pull 주기` 1건 · `세 벌` 3건)를 커밋 메시지에 기록**하고, 갱신 뒤에는 새 판정으로 바뀐 문장만 남는다. `pnpm sync:agents:check` green.
- [ ] T15. 전체 게이트와 뮤테이션을 실행한다. **Commit 6까지 커밋된 뒤에만** 돌린다(되돌림이 파일 단위 `git checkout -- <파일>`이라 미커밋 작업이 있으면 안 된다 — 2026-09-16).
  - 검증(자동): `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres` green. 마지막 출력에 `sync-edit-protection.integration.ts`와 T4·T5·T6·T7·T9·T10의 테스트 이름이 실제로 찍힌다.
  - 검증(자동): 뮤테이션 각각을 적용 → red 확인 → 파일 단위 되돌림. **대상 파일**: `lib/protection/plan.ts`(T7 `>= 0`) · `lib/push/apply.ts`(T7 재집계 예외 제거, 토큰 가드 제거) · `lib/import/run.ts`(T9 지문 재계산을 잠금 앞으로, `= ANY` 제거) · `lib/pull/load.ts` 또는 CAS가 사는 파일(T4·T10 `= v.token` 제거). 결과를 PR 본문 대신 커밋 메시지에 남긴다.
- [ ] T16. CLI(`scripts/push-local.ts`)가 `deferred`에서 Actions `::warning`과 "imported" 아닌 문구를 내게 하고, 새 action 태그 릴리스를 Claude Code 배포 경로에 인계한다. **배포 B와 순서 의존 없음** — 구 태그도 본문에 `"status":"deferred"`가 찍히고 `process.exitCode = res.ok ? 0 : 1`(`:236`)이라 exit 0이다.
  - 검증(자동, `scripts/__tests__/` — 선례 `push-failure-report.test.ts`): deferred 응답 → exit 0 + `::warning` 1줄(**applied → `::warning` 0줄 대조**), 실제 오류 → exit 1, 토큰·원문 비노출.
- [ ] T17. `/l10n-roundtrip`으로 `bugshot-i18n-test`에서 실물 검증한다. **어댑터 코드를 바꾸지 않으므로 5어댑터 매트릭스는 돌지 않는다** — 흐름은 어댑터 독립이다. `lib/pull/`을 고쳤으므로 `/l10n-roundtrip.md:12`대로 머지 방식은 `--merge`로 한 번 더.
  1. 편집 → 코드 커밋(로케일 무변경) → CI `deferred` → Publish → CI 재요청 `applied`. **정상 결과는 "DB 값 = 리포 값, PR head에 편집 유지"다** — PR 미머지 상태의 적재가 strict로 리포 값을 되돌리는 것이 정상이고 손실이 아니다(편집은 PR에 있다).
  2. `gh pr merge --merge` → 대상 리포 CI가 마커로 skipped → DB 값 = 머지된 값(2026-09-17 재현 경로).
  3. 편집 → 로케일 변경 커밋 → `deferred` → OWNER 폐기 승인 → `applied` → 편집 사라지고 리포 값.
  4. Publish → Sync → cron 반복에서 PR head 불변.
  - 검증(수동): 각 단계의 API 응답 `status`, DB 토큰 수, PR head SHA 변화 유무, Publish 커밋 parent = 검사 SHA를 기록.

## 배포 순서 및 종료

- [ ] T18. 남은 두 번의 배포를 CLAUDE.md 브랜치 흐름대로 완주한다(design §6.1).
  1. A(Commit 1–3): `/db`(dev) → **`pnpm test:projects:postgres`** → `/push` → **dev backfill 0행 2회** → `/merge`(1단계 `db:status:prod` + `db:deploy`) → 롤아웃 완료 조건 경과 → **prod backfill 0행 2회**(`DATABASE_URL` 한 줄 실행).
  2. B(Commit 4–7): **`pnpm test:projects:postgres`** → `/push`(dev에서 T6 precondition 통과 — 실패하면 `resolve --rolled-back` → backfill → 재시도, `migrate dev`의 리셋 제안은 거부) → preview에서 T13 수동 검증 → `/merge`(prod `db:deploy`가 precondition 게이트 — 실패 시 같은 복구 절차).
  - 검증(수동): 각 `/merge` 직전 `pnpm db:status:prod`. B의 prod `db:deploy`가 precondition을 통과한 출력.
  - 검증(수동): A 배포 후 저장 1건 → 토큰 생김(prod), B 배포 후 편집 + CI push 1건 → `deferred`(dev). precondition 실패 시 복구 절차로 재시도했고 **편집을 버리거나 pending을 비우지 않았음**.
- [ ] T19. 완료 결론을 정본에 올린 뒤 이 feature 디렉터리를 제거한다. **별도 spec 둘의 필요를 PRODUCT §10 또는 새 `/feature` 착수 메모로 남긴다** — 빈값·누락 셀 strict 보완, `publish-pr-handoff`(열린 PR 대비 파일 diff·페이지·미리보기 승인 지문·EDITOR의 열린 PR 인가).
  - 검증(수동): 정본만으로 정책·운영 절차를 찾을 수 있음. 미완일 때 디렉터리를 제거하지 않음.

빌드는 `/push` 게이트에서 수행한다. 이 feature 문서 검수에서는 문서만 수정·커밋하며 코드·스키마·환경변수 변경과 테스트 실행은 하지 않는다.

## 완료 조건 ↔ 태스크

| spec 조건 | 담당 | 순수 판정 가능 |
|---|---|---|
| 1 편집 유지 | T7, T17 | ✓ `planProtectedImport` |
| 2 보류 시 전부 불변·쓰기 0회 | T7 | ✓ |
| 3 pending 0이면 기존 strict, 첫 요청 `applied` | T7, T13 | ✓ |
| 4 OWNER 승인만 폐기, 승인 뒤 저장 보존 | T9 | ✓ `planDiscardConfirmation` |
| 5 pending 0 Publish GitHub 0회 | T0, T8, T10 | ✓ `shouldSkipPull` |
| 6 PR head 불변 (승인 재Publish 제외) | T10, T17 | ✓ `planProtectedPublish` |
| 7 동일 ms 재저장 보존 | T4 | — (조건부 UPDATE, PG) |
| 8 API·CLI `applied/deferred`, 화면은 파생 | T7, T13, T16 | — |
| 9 orphan 제외 | T5, T8, T10 | ✓ `pendingWhere`·`backfillWhere` |
| 10 부분 실패 숨기지 않음 | T10 | ✓ |
| 11 배너 반전(상시 `info`·닫기 없음·pending 0 미렌더) | T13 | ✓ `planSyncProtectionView` |
| 12 Home 카드 `paused` 갈래 | T13 | ✓ |
