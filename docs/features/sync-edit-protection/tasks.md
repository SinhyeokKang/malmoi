# tasks — Sync 편집 보호와 PR 인계

3차 검수로 범위를 **토큰 축 + 거친 보류**로 축소했다(25 → 20태스크, 스키마 6 → 1필드, 운영 drain 제거). 체크박스는 구현 완료 상태가 아니다.
순서는 선행 독립 수정 → 순수 계약 → 데이터/껍데기 → UI → 실물 검증이다. 각 경계의 테스트는 구현보다 먼저 red를 확인한다.
Commit 구분은 작업 단위다. 실제 배포는 **T0 단독 → 호환 A → 보호 B** 세 번이며(design §6.1), A에 사용자에게 보이는 변화를 섞지 않는다.

**검증 줄의 규칙** (2026-09-14 "방어선 셋 다 지워도 green"):
- "0회/없음"을 단언하는 줄은 **같은 픽스처의 허용 경로에서 N > 0**을 짝으로 단언한다. 경로가 아예 안 돌아도 참인 단언은 검증이 아니다.
- 자동(`pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck`)과 수동(`/bugshot-qa` · `/design-sync` · `/l10n-roundtrip`)을 줄마다 구분한다. 이 리포엔 e2e 프레임워크가 없다.
- PG 통합 테스트는 **`lib/keys/__tests__/sync-edit-protection.integration.ts` 한 파일**에 모은다. 코드 위치와 맞아서가 아니라
  `vitest.projects.config.ts`의 include가 `lib/keys/__tests__/*.integration.ts`로 **디렉터리가 박혀 있어서**다 —
  `lib/sync/__tests__/`에 만들면 조용히 0건 수집된다(2026-09-10 "그 스위트는 애초에 안 돌아간다").

## Commit 0 — 1층 스킵 정렬 (스키마 없음, 단독 배포)

- [x] T0. (2026-09-17 완료 — `lib/keys/unpublished.ts`의 where 조각을 `countUnpublished`와 1층이 공유; dev DB EXPLAIN: 2,721행 프로젝트에서 `Translation_projectId_updatedAt_idx` Index Scan·3행, `lastPulledAt` null인 첫 pull만 전 행) `lib/pull/plan.ts`의 `shouldSkipPull`이 `max(updatedAt)` 대신 기존 미전달 술어(`updatedBy IS NOT NULL ∧ updatedAt > lastPulledAt`)로 판정하게 한다.
  push가 전 행의 `updatedAt`을 올려 사람 편집 없이도 cron이 PR을 갱신·되돌리는 문제(spec 문제 2·3)를 스키마 없이 먼저 닫는다.
  - 검증(자동): `lib/pull/__tests__/run.test.ts`에 "push 직후(전 행 `updatedAt` 상승, `updatedBy` 전부 null) → GitHub 호출 0회" 추가, **같은 픽스처에서 셀 하나에 `updatedBy`를 세우면 호출 > 0**. 기존 "1층 스킵의 API 0회" 테스트 green 유지.
  - 검증(자동): dev DB에서 새 1층 쿼리의 `EXPLAIN` — push 직후 프로젝트에서 `[projectId, updatedAt]` 범위 스캔 행 수를 기록한다(schema 주석의 audit #45가 이 쿼리의 매일 비용을 경고한다). Seq Scan이면 T0에서 멈추고 보고한다.

## Commit 1 — Pure protection contracts

- [ ] T1. design §7 표의 순수 함수 아홉의 인터페이스 테스트를 작성한다. 결과 union과 거부 순서를 타입으로 고정한다.
  - 검증(자동): 표의 "필수 반례" 열 전부가 red. 최소 구현 후 green. 특히 `planSyncProtectionView`의 **출구 필드가 빈 출력에서 red**, `planProtectedImport`의 pending 1 + 자동에서 `apply`가 나오면 red.
- [ ] T2. spec 완료 조건 ↔ 태스크 대응을 이 문서 끝 표로 확정하고, 순수 판정 가능한 조건을 T1 테스트 이름에 조건 번호로 남긴다.
  - 검증(수동): 표의 13행 모두 담당 태스크가 있고, "순수" 표시된 조건마다 T1 테스트 이름에 `[C#]`가 1개 이상 grep된다.

## Commit 2 — Additive schema and compatible writers (배포 A)

- [ ] T3. `Translation.pendingEditToken String?` additive migration과 pending 술어 인덱스를 작성한다(`/db`).
  - 검증(자동): `/db` SQL 검토, 생성 클라이언트 typecheck, 기존 코드가 nullable 컬럼과 호환.
  - 검증(자동): dev DB에서 새 술어(③ raw SQL과 1층 스킵)의 `EXPLAIN` 결과를 인덱스 없음 / 일반 복합 / partial 셋으로 기록하고 design §2 판정 기준으로 택한다. partial을 택하면 마이그레이션 SQL 수기 사실과 근거를 T14 대상에 올린다.
  - 검증(자동): 마이그레이션 뒤 `anon` 권한 0 확인(`/db` 5단계).
- [ ] T4. 호환 writer: `app/(edit)/actions.ts`의 저장 dual-write(값이 실제로 바뀔 때만 새 UUID), `lib/import/`·`lib/push/apply.ts`의 적용 셀 토큰 정리, `lib/sync/`·`lib/pull/`의 기존 Publish 성공 시 캡처 토큰 조건부 UPDATE. **판정·집계·UI는 기존 그대로다.** 저장 잠금·거부는 넣지 않는다(B).
  - 검증(자동, PG): 저장 → 토큰 생김 / no-op 저장 → 토큰 불변 / 적재 → 적용 셀만 null, 실패 파일 셀은 유지 / Publish 성공 → 캡처 토큰만 null이고 **Publish 도중 같은 셀 재저장은 토큰 유지**(barrier). 각 "유지" 단언에 같은 픽스처의 "변경" 대조.
  - 검증(자동): `lib/keys/**`·`lib/push/apply.ts`를 건드렸으므로 `pnpm test:projects:postgres` green.

## Commit 3 — Backfill

- [ ] T5. `scripts/backfill-pending-edit-token.ts`와 순수 `backfillPredicate`를 작성한다. 멱등, 0행이 두 번 연속 나올 때까지 반복하는 모드를 둔다.
  - 검증(자동, PG): backfill 전/후 **활성 셀 집합이 기존 술어 ①②③④⑤와 동일**(양방향 — 토큰 없는 기존-미전달 0, 기존-미전달 아닌데 토큰 있는 행 0). orphan 키/로케일 행의 값·저자 불변 + 토큰 신규 발급 0(**같은 픽스처의 활성 셀에서는 발급 > 0**). 이미 토큰 있는 행 재발급 0. 두 번째 실행 0행.
  - 검증(자동, PG): A/B 두 프로젝트 격리 — A에만 대상이 있을 때 B의 행 불변.
- [ ] T6. 배포 B용 precondition 마이그레이션을 작성한다(스키마 변경 없음, `DO $$ … RAISE EXCEPTION`). 선례 `20260914070000_finalize_translation_surfaces`.
  - 검증(자동, PG): backfill 안 한 DB에서 마이그레이션이 **실제로 예외를 던진다**(주입 테스트). backfill 뒤에는 통과한다.

## Commit 4 — Protected imports (배포 B)

- [ ] T7. `app/api/push/route.ts`와 `lib/import/`에 `planExecutionLease`·`planProtectedImport`를 연결한다. 프로젝트 전체 pending > 0이면 `deferred`, 0이면 기존 strict. 저장 경로(`saveTranslation`)에 Project 잠금·활성 import 확인·재시도 가능한 거부를 넣는다.
  - 검증(자동, PG): 표면 A에 편집 + 표면 B로 CI 요청 → `deferred`, **Translation 쓰기 SQL 0회**(Prisma `$extends` 쿼리 훅으로 센다) + `TranslationSurface.lastCommitAt`·`Project` 불변. **같은 픽스처에서 편집을 비우고 같은 요청 → `applied`, 쓰기 > 0.**
  - 검증(자동, PG): 두 표면 CI 요청 동시(barrier) — 둘 다 `deferred`. 저장과 CI 요청 교차 — 저장이 먼저 커밋되면 CI는 `deferred`.
  - 검증(자동): `planProtectedImport`의 pending 판정을 `>= 0`으로 뮤테이션하면 red.
  - 검증(자동): 저장 경로 잠금 전후 왕복 실측(warm p50) — design §4.2 상한(+150ms) 초과면 멈추고 보고.
- [ ] T8. `shouldSkipPull`을 토큰 기반으로 바꾸고(T0의 시각 술어 교체), §1의 사본 다섯을 토큰 술어로 전환한다. `isUnpublished`의 `surfaceArchivedAt`을 required로 좁힌다. 뒤집는 기존 주석(`lib/keys/query.ts`의 "활성 로케일 필터를 덧붙이지 않는다")을 같은 커밋에서 갱신한다.
  - 검증(자동): `pnpm test:projects:postgres` — 기존 `list-aggregates.integration.ts`의 동등성 단언에 **④ `lib/publish/read.ts` 사본과 ⑤ 메모리 하네스를 추가**해 다섯이 같은 행을 센다. orphan 키/로케일 편집이 다섯 모두에서 제외되고 활성 편집은 누락 0.
  - 검증(자동): 신규 키 `?state=new`의 `lastPulledAt` 의미 유지 회귀.
  - 검증(자동): pending 0 프로젝트 1층 스킵 GitHub 호출 0회 + **pending 1에서 > 0**.
- [ ] T9. 수동 Sync 폐기 승인 HMAC(`exp` 포함, `secret` 인자)과 실행권을 `lib/import/`에 연결한다. 표면별 부분 결과와 자기 표시 정리를 유지한다. `planImportConfirmation`에 `canPublish`를 더한다.
  - 검증(자동, PG): OWNER 승인 → 적용 / EDITOR 직접 호출 → 거부 / 같은 N 다른 토큰 → reconfirm / `exp` 경과 → 거부 / Dialog 뒤 새 저장 → reconfirm / 설정 변경 → 거부 / 부분 성공 뒤 재사용 → 거부. **각 거부 줄에 같은 픽스처의 성공 대조.**
  - 검증(자동): 승인 재검사를 Project 잠금 **앞**으로 옮기는 뮤테이션에서 경합 테스트 red(2026-09-13).

## Commit 5 — Publish safety and handoff (배포 B)

- [ ] T10. Publish 스냅샷에 편집 토큰을 싣고 `planProtectedPublish`를 연결한다. writer 경고 사전 중단, 성공 시 토큰 조건부 UPDATE, unknown 재시도, D2 cron 정책, pending 0 no-op. 사용자 승인 no-change 정리는 유지한다. `lib/pull/trigger.ts`의 기각 주석을 갱신한다.
  - 검증(자동, PG): Publish 중 같은 셀 새 저장 → 성공 뒤에도 pending(동일 ms 포함) / 응답 유실·DB 완료 실패 → 토큰 보존 / 실제 PR 확인 후 재시도 → 해제. 다른 활성 셀을 보내도 orphan 셀의 값·저자·잔존 토큰 불변(**같은 픽스처의 활성 셀은 해제됨**).
  - 검증(자동): Publish→Sync→cron에서 GitHub 쓰기 0회(**pending 1에서 > 0**) / Publish→편집 원복→승인 재Publish에서 no-change 정리 실행 / 열린 PR + cron + pending 1 → 쓰기 0회 / 검사 SHA = tree/parent SHA.
  - 검증(자동): T4·T7·T10의 조건부 UPDATE에서 `AND "pendingEditToken" = $x`를 지우면 red(뮤테이션).
- [ ] T11. 열린 PR 대비 파일 diff와 preview snapshot HMAC(`malmoi:publish-preview:v1`)을 `lib/publish/`에 추가한다. `read.ts`의 `take: PREVIEW_LIMIT` 절단을 snapshot 묶인 커서로 바꾼다. **T12의 핸드오프가 페이지 구조를 확정한 뒤 착수한다.**
  - 검증(자동): Sync 후 새 편집 재Publish에서 이전 PR 삭제분·사람의 주석/일반 파일 수정이 diff에 포함 / preview 이후 편집·PR head·설정·base SHA 각각 변경 → 쓰기 전 `preview-stale`(**변경 없음 → 쓰기 진행 대조**) / 코드만 바뀐 base도 새 승인 후 진행 / 200셀 초과·긴 단일 파일이 페이지로 전부 도달 / 누락 페이지·읽기 실패·예산 초과 → 쓰기 0회(**전 페이지 수신 → 쓰기 > 0 대조**) / 열린 PR 없음 → diff 구역 없음·1페이지 즉시 활성.

## Commit 6 — Design handoff and UI (배포 B)

- [ ] T12. Publish 모달 PR diff 구역과 Sync Dialog 확장의 **Claude Design 핸드오프를 받는다**(`design_handoff_publish_modal`에 새 아트보드). design §5.1 "핸드오프가 반드시 정해야 하는 것" 6항목과 §5.2 결과 상태 표의 갈래를 전부 포함해야 수용한다.
  - 검증(수동): 6항목 각각에 대해 아트보드에 px 값 또는 명시적 선택이 있다. 줄 단위 hunk 칠을 택했으면 **DESIGN §6.2 "초록·빨강을 이 두 자리 밖으로 넓히지 않는다" 문장을 먼저 고친다** — 고치지 않은 채 T13에 들어가지 않는다. Sync Dialog가 360px 안에서 스크롤 없이 서는지 판정하고, 안 서면 `components/ui/dialog.tsx`의 `max-h` + 본문 스크롤을 T13에 포함한다.
- [ ] T13. 핸드오프대로 Publish 모달·Sync Dialog·번역 화면·Home을 구현한다. `EditLossBanner`를 design §4.3대로 교체한다(문구 `automatically` 제거, `info`, 닫기 키 = pending `max(updatedAt)`). 수동 Sync 확정 버튼은 N=0 `Sync from repository` / N>0 `Discard changes and sync`.
  - 검증(수동, `/design-sync`): 핸드오프 아트보드와 computed style + CDP 접근성 트리 대조가 일치할 때까지 루프. 두 diff 구역의 접근 이름 분리, 페이지 이동 포커스, live 영역 알림과 danger 갈래 `quiet` 충돌 없음.
  - 검증(자동, DOM): 보호 상태 배너에 `can be lost`·`automatically` 없음 / 새 편집 뒤 닫힌 배너가 다시 열림(**닫기 키 불변이면 안 열림 대조**) / EDITOR에게 Sync CTA 없음·Publish 출구 있음 / Publish 막힘 → Sync 확인에 `Send changes first` 없음(**Publish 가능 → 있음 대조**) / 버튼 라벨 N=0·N>0 / 취소 무변경 / 승인 버튼 활성 조건(열린 PR 유무 둘 다).
  - 검증(수동, `/bugshot-qa`): 키보드 페이지 이동·승인 버튼까지 스크롤 도달, 실행 중 저장 거부 시 미저장 입력 보존, **refresh 뒤 결과 유지**(2026-09-07 — jsdom으로는 판정 불가).

## Commit 7 — Verification and canonical documentation

- [ ] T14. 정본을 구현 결과로 갱신한다. **대상**:
  - `docs/ARCHITECTURE.md` §5.5.2(spec 첫 절의 근거로 판정 교체) · §5.6.35(표시 전용 → 실행 게이트·토큰 해제 입력) · §5.6.1(partial index를 택했으면 드리프트 감수 근거와 EXPLAIN) · §2·§3 · `AUTH_SECRET` 회전 영향.
  - `CLAUDE.md` 코어 원칙 절("push는 덮는다 / 대가는 편집 손실 창") + `pnpm test:projects:postgres` 행(트리거 경로에 `lib/pull/**`·`lib/publish/**`·`lib/import/**`·`app/(edit)/actions.ts` 추가, "미발송 술어가 세 벌" → 다섯).
  - `AGENTS.md`(`pnpm sync:agents`로 미러), `.claude/commands/audit.md`·`.agents/skills/source-command-audit/SKILL.md`의 "편집 손실 창 완화 코드" 감사 항목.
  - `docs/PRODUCT.md` §3·§4.1(과 "넷째 벌" 서술), `docs/DESIGN.md`(새 구역·§6.2·§6.646 갈래 수), `docs/ACTIONS.md`(deferred 응답), `docs/DIRECTORY.md`(새 스크립트·모듈), `docs/OPERATIONS.md`(A→backfill→B 절차), `.env.example`(`AUTH_SECRET` 영향).
  - POSTMORTEM 2026-09-14의 재발 방지 grep 패턴에 `can be lost|automatically`를 더하는 것은 `/postmortem` 소관이므로 **제안으로만 남긴다**(append-only).
  - 검증(자동): `grep -rn "완화는 pull 주기\|편집 손실 창을 완화하려는\|표시 전용이다\|세 벌" CLAUDE.md AGENTS.md docs .claude .agents` 결과가 새 판정으로 바뀐 문장만 남음. **갱신 전 같은 grep이 N > 0이었음을 커밋 메시지에 기록**. `pnpm sync:agents:check` green.
- [ ] T15. 전체 게이트와 뮤테이션을 실행한다.
  - 검증(자동): `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres` green. 마지막 출력에 `sync-edit-protection.integration.ts`와 T4·T5·T6·T7·T9·T10의 테스트 이름이 실제로 찍힌다.
  - 검증(자동): T7·T9·T10에 적은 뮤테이션 각각을 적용 → red 확인 → 되돌림. ⚠️ 되돌림은 **파일 단위 `git checkout -- <파일>`**로 한다(2026-09-16 디렉터리 단위가 미커밋 작업을 지웠다). 결과를 PR 본문 대신 커밋 메시지에 남긴다.
- [ ] T16. CLI(`scripts/push-local.ts`)가 `deferred`에서 Actions `::warning`과 "imported" 아닌 문구를 내게 하고, 새 action 태그 릴리스를 Claude Code 배포 경로에 인계한다. **배포 B와 순서 의존 없음** — 구 태그도 본문에 `"status":"deferred"`가 찍히고 exit 0이다.
  - 검증(자동): deferred 응답 → exit 0 + `::warning` 1줄, 실제 오류 → exit 1, 토큰·원문 비노출.
- [ ] T17. `/l10n-roundtrip`으로 `bugshot-i18n-test`에서 편집→코드 커밋(로케일 무변경)→보류→Publish→적재 재개, 편집→로케일 변경 커밋→보류→OWNER 폐기→적재를 실물 검증한다. **어댑터 코드를 바꾸지 않으므로 5어댑터 매트릭스는 돌지 않는다** — 흐름은 어댑터 독립이다.
  - 검증(수동): 각 단계의 API 응답 `status`, DB 토큰 수, PR head SHA 변화 유무, Publish 커밋 parent = 검사 SHA를 기록. Publish→Sync→cron 반복에서 PR head 불변.

## 배포 순서 및 종료

- [ ] T18. 세 번의 배포를 CLAUDE.md 브랜치 흐름대로 완주한다(design §6.1).
  1. T0: `/push` → `/merge`.
  2. A(Commit 1–3): `/db`(dev) → `/push` → **dev backfill 0행 2회** → `/merge`(1단계 `db:status:prod` + `db:deploy`) → 롤아웃 완료 조건 경과 → **prod backfill 0행 2회**.
  3. B(Commit 4–7): `/push`(dev에서 T6 precondition 통과) → preview에서 T13 수동 검증 → `/merge`(prod `db:deploy`가 precondition 게이트).
  - 검증(자동): 각 `/merge` 직전 `pnpm db:status:prod`. B의 prod `db:deploy`가 precondition을 통과한 출력.
  - 검증(수동): A 배포 후 저장 1건 → 토큰 생김(prod), B 배포 후 편집 + CI push 1건 → `deferred`(dev). precondition 실패 시 backfill 재실행 후 재시도했고 **편집을 버리거나 pending을 비우지 않았음**.
- [ ] T19. 완료 결론을 정본에 올린 뒤 이 feature 디렉터리를 제거한다. 빈값·누락 셀 strict 보완의 별도 spec 필요를 PRODUCT 또는 새 `/feature` 착수 메모로 남긴다.
  - 검증(수동): 정본만으로 정책·운영 절차를 찾을 수 있음. 미완일 때 디렉터리를 제거하지 않음.

빌드는 `/push` 게이트에서 수행한다. 이 feature 문서 검수에서는 문서만 수정·커밋하며 코드·스키마·환경변수 변경과 테스트 실행은 하지 않는다.

## 완료 조건 ↔ 태스크

| spec 조건 | 담당 | 순수 판정 가능 |
|---|---|---|
| 1 편집 유지 | T7, T17 | ✓ `planProtectedImport` |
| 2 보류 시 전부 불변·쓰기 0회 | T7 | ✓ |
| 3 pending 0이면 기존 strict | T7 | ✓ |
| 4 OWNER 승인만 폐기 | T9 | ✓ `planDiscardConfirmation` |
| 5 pending 0 Publish GitHub 0회 | T0, T8, T10 | ✓ `shouldSkipPull` |
| 6 PR head 불변 (승인 재Publish 제외) | T10, T17 | ✓ `planProtectedPublish` |
| 7 동일 ms 재저장 보존 | T4, T10 | ✓ `pendingEditIdsToAcknowledge` |
| 8 applied/deferred/failed 구분 | T7, T13, T16 | — |
| 9 orphan 제외 | T5, T8, T10 | ✓ `backfillPredicate` |
| 10 부분 실패 숨기지 않음 | T10 | ✓ |
| 11 PR diff 페이지·base 재승인·Publish 막힘 시 권유 없음 | T11, T13 | ✓ `planImportConfirmation`, `planSyncProtectionView` |
| 12 배너가 손실 예고 안 함·재오픈 | T13 | — |
| 13 격리·경합 실제 PG | T4, T5, T7, T9, T10, T15 | — |
