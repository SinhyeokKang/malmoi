# tasks — 전달 층 불변식 (audit B1)

계획 원본은 `spec.md`·`design.md`다. `/ship bypass`로 태운다(push·pull 두 흐름). **체크박스는 구현 완료 상태가 아니다.**

**읽는 법**
- 감사 발견은 정적 읽기다 — **각 태스크의 첫 검증은 재현(red)이다.** 재현이 안 되면 태스크를 닫고 적는다.
- PG 통합 테스트는 `lib/keys/__tests__/*.integration.ts`(또는 `lib/events`·`lib/invitation-email`)에만 둔다 — `vitest.projects.config.ts:9` include 밖은 조용히 0건 수집된다.
- "0건"을 단언하는 검증은 같은 픽스처의 허용 경로에서 N > 0을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- 작업 중인 파일에 `git checkout -- <경로>`를 쓰지 않는다.

## T0 데이터 실측 (읽기 전용, 코드 전)

- [ ] dev·prod에서 세 수를 센다(`.scratch/` 스크립트, `DIRECT_URL`·`DIRECT_URL_PROD`를 스크립트 안에서만 로드 — 출력하지 않는다):
  1. orphan 키 또는 orphan 로케일 위의 `pendingEditToken IS NOT NULL` 셀 수 (#1이 이미 일어났는가)
  2. 수술적 표면(`adapterName IN ('ts-dict','yaml-catalog','code-dict')`)의 비-base `value = ''` + 토큰 보유 셀 수 (#2)
  3. 보관 안 된 표면 중 CI 보류가 연속으로 난 표면(최근 `ProjectEvent` IMPORT `deferred` 연속) — 참고용
- 검증: 수를 이 파일에 기록한다. **1이 0이 아니면** T9(데이터 정리)를 연다. 2가 0이 아니면 그 셀은 Revert 대상으로 남긴다(D2 주석).
- ✅ **2026-09-24 실측 (`.scratch/t0-delivery.mjs`, 읽기 전용 세션)** — dev·prod 모두 **1 = 0 · 2 = 0**(수술적 비-base 빈 값은 토큰 유무와 무관하게 0) · 전체 미전달 토큰 0 · 최근 14일 IMPORT 사건에 `deferred` 없음(dev 4건·prod 1건 전부 `imported`). → **T9 불필요, D2 이전 데이터 없음.** 결함은 아직 운영 데이터에서 일어나지 않았다.

## T1 순수 함수 — 테스트 먼저 (커밋 #0 `test:`)

- [ ] `lib/pull/__tests__/undeliverable.test.ts` — `undeliverableLocales`·`blockingWarnings`·`deliverableEdits`
  - per-locale 수술적 `original-file-missing` → 좌표 `(surface, fr)` · blocking 0
  - multi-locale `original-file-missing` → 좌표 없음 · blocking 1
  - json-catalog 접두 충돌 → blocking 1
  - `deliverableEdits`: 좌표 안 편집 제외 · 좌표 밖 편집 유지(**N > 0 짝**) · `cell` 없는 편집 제외
- [ ] `lib/adapters/__tests__/ts-dict.test.ts:328-332` **뒤집기** — 비편집 비리터럴 경고 0 / 편집 대상 비리터럴 경고 1
- [ ] `planClearability` 테스트(D2 — (a)로 결정됨) — surgical·비-base·`""` → `cannot-clear` / base → `ok` / regenerate → `ok`
- [ ] `localesToKeep` 테스트 — 다운로드 실패 경로의 로케일이 남는다 · 트리에 없는 로케일은 안 남는다
- [ ] `lib/pull/message.ts` — `withheld > 0`이면 결과 문구에 한 줄이 붙는다(0이면 없다)
- 검증: 새 테스트가 전부 **red**(함수 없음·동작 다름), 기존 `pnpm test` 나머지 green.

## T2 순수 함수 구현 (커밋 #1 `fix:`)

- [ ] `lib/pull/undeliverable.ts` 신규(잎 모듈 — `server-only` 없이, 클라이언트 그래프에 안 들어간다)
- [ ] ts-dict `writeWithErrors`가 `wanted` 키만 보고
- [ ] `planClearability` · `localesToKeep` · message
- 검증: T1 green · `pnpm typecheck`

## T3 pull 배선 — #3 (커밋 #1에 포함 가능)

- [ ] `lib/pull/run.ts`: `planProtectedPublish`에 blocking 수 · `saveLastPulledAt`에 `deliverableEdits` · `deliveryContexts`를 제외 좌표 표면에서 뺀다 · 결과에 `withheld`
- [ ] `lib/pull/run.ts`의 `PullResult` 주석(T10 문단)을 새 규칙으로 고친다
- 검증: `lib/pull/__tests__/run*.test.ts`에 케이스 — ko·fr 편집, `fr.yml` 없음 → `committed`, `saveLastPulledAt`에 ko 편집만 · `withheld: 1`. 기존 writer-warnings 케이스(접두 충돌) 그대로 `skipped`.

## T4 미리보기 정렬 — #3

- [ ] 같은 픽스처로 `readPublishPreview`의 `withoutFile`과 `runPull`의 `withheld`가 같은 수를 낸다는 테스트
- 검증: 테스트 green. 판정 함수는 합치지 않는다(design D3).

## T5 push 배선 — #58 · #59 · #1

- [ ] `apply.ts` translations 필터에 이번 페이로드 base 키 집합(D5) · 주석 참말로 · refs가 orphan 키를 받는 것이 계약인지 확인
- [ ] `lib/import/surface.ts`: `localesToKeep`으로 `payload.locales` 구성(D6)
- [ ] `lib/import/run.ts` `finishSurface`: `payload`·`empty` 갈래 뒤 같은 tx에서 승인 토큰 해제(D1) — `failed` 갈래는 안 한다
- 검증 (`pnpm test:projects:postgres`, `sync-edit-protection.integration.ts` 옆 또는 새 파일):
  - **#1 재현→해결**: 편집 → 리포에서 키 제거 + 폐기 승인 Sync → 키 복구 CI push → `applied` · `countPending` 0. (지금 `sync-edit-protection.integration.ts:194`가 잔존을 고정하고 있다 — 그 단언을 먼저 뒤집는다)
  - 승인 뒤 저장한 셀은 토큰이 남는다(**N > 0 짝**)
  - `failed` 표면의 승인 토큰은 남는다
  - #58: 비-base 파일에만 있는 기존 orphan 키 셀이 upsert되지 않는다
  - #59: fr blob 실패 → fr `Locale.orphaned = false` · `partial-import`

## T6 저장 배선 — #2 (D2 (a))

- [ ] `lib/keys/save-key.ts`가 `planClearability`로 거부 · `messages/en.tsx`에 문구 · 번역 화면이 그 오류를 셀 옆에 보인다
- 검증: `save-key.integration.ts`에 케이스(surgical 비-base `""` → 거부 · base `""` → 기존대로) · `/bugshot-qa`로 셀 옆 문구 확인

## T7 `/code-review` → `/refactor` (커밋 #2)

- 검증: 🔴 0 · `pnpm test` · `pnpm test:projects:postgres` green

## T8 정본 갱신 (커밋 `docs(ARCHITECTURE)`·`docs(PRODUCT)` 따로)

- [ ] ARCHITECTURE §0-1·§0-9 · §3 T10 문단 · §5.5.2 · §5.6.35 · `apply.ts:133` 재집계 주석(#61 — 존재 이유가 "저장 경로엔 잠금이 없다"가 아니게 됐으면)
- [ ] PRODUCT — 번역 편집 규칙에 "ts-dict·yaml-catalog·code-dict 표면의 비-base 셀은 비울 수 없다(파일에서 키를 지울 줄 모른다)"를 올린다(D2)
- [ ] `docs/features/audit-report/tasks.md` B1 체크 · 끝나면 이 디렉터리 삭제는 `/push` 뒤
- 검증: `/push` 4단계 신선도 게이트 통과

## T9 데이터 정리 (T0의 1이 0이 아닐 때만) — ⏭ 2026-09-24 T0 결과 0이라 불필요

- [ ] 사용자 승인 뒤 한 번 도는 스크립트: orphan 키·로케일 위 토큰을 NULL로(`updatedAt` 불변). dev 먼저, prod는 `/merge` 뒤.
- 검증: T0 쿼리 1이 0

## 검증 게이트 (배치 끝)

`pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:projects:postgres` · `/l10n-roundtrip`(`i18n-order-check` + yaml 폐기용 리포에서 `fr.yml` 삭제 시나리오)
