# tasks — 전달 층 불변식 (audit B1)

계획 원본은 `spec.md`·`design.md`다. `/ship bypass`로 태운다(push·pull 두 흐름). **체크박스는 구현 완료 상태가 아니다.**

**읽는 법**
- 감사 발견은 정적 읽기다 — **각 태스크의 첫 검증은 재현(red)이다.** 재현이 안 되면 태스크를 닫고 적는다.
- PG 통합 테스트는 `vitest.projects.config.ts:9` include(`lib/keys`·`lib/events`·`lib/invitation-email`의 `__tests__/*.integration.ts`) 안에만 둔다 — 밖은 조용히 0건 수집된다.
- "0건"을 단언하는 검증은 같은 픽스처의 허용 경로에서 N > 0을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- 자동 검증(`pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck`)과 수동(`/bugshot-qa` · `/l10n-roundtrip`)을 구분한다 — e2e 프레임워크는 없다.
- 작업 중인 파일에 `git checkout -- <경로>`를 쓰지 않는다(POSTMORTEM 2026-09-16).

**커밋 경계** (`/ship`): #0 `test:` = T1 · #1 `fix:` = T2~T7 · #2 `refactor:` = T8 · 문서 = T9.

## T0 데이터 실측 (읽기 전용, 코드 전) — ✅ 완료

- [x] dev·prod에서 센다: 1) orphan 키·로케일 위 토큰 보유 셀 2) 수술적 표면 비-base `''` + 토큰 셀 3) 최근 14일 IMPORT `deferred`
- ✅ **2026-09-24 실측 (`.scratch/t0-delivery.mjs`, 읽기 전용 세션)** — dev·prod 모두 **1 = 0 · 2 = 0**(수술적 비-base 빈 값은 토큰 유무와 무관하게 0) · 전체 미전달 토큰 0 · 최근 14일 IMPORT 사건에 `deferred` 없음(dev 4건·prod 1건 전부 `imported`). → **데이터 정리 불필요, D2 이전 데이터 없음, D1이 못 푸는 기존 유령도 없음.**

## T1 테스트 먼저 — red 확인 (커밋 #0 `test:`)

**새 단위 테스트**
- [ ] `lib/pull/__tests__/undeliverable.test.ts` — `withheldCoordinates`·`blockingErrors`·`splitEdits`
  - yaml·code-dict per-locale, 비-base `fr` 파일 부재 → 로케일 좌표 `(s, fr)` · blocking 0
  - 같은 표면, **base** `en` 파일 부재 → 좌표 없음 · blocking 1
  - ts-dict `write-slot-missing`(fr, `z`) → 셀 좌표 `(s, fr, z)` · blocking 0
  - ts-dict `write-locale-object-missing` → blocking 1 / json-catalog 접두 충돌 → blocking 1
  - `splitEdits`: 좌표 안 편집 → withheld · 좌표 밖 → delivered(**N > 0 짝**) · `cell` 없는 편집 → withheld
- [ ] render 테스트(기존 render 테스트 파일) — per-locale 출력에 `locale`, ts-dict 오류에 호출 locale
- [ ] `lib/adapters/__tests__/ts-dict.test.ts:328-332` **뒤집기** — 비편집 비리터럴 → 경고 0 (**red**) / 편집 대상 비리터럴 → 경고 1 (지금도 green인 짝) / fr 객체에 없는 wanted 키 → `write-slot-missing` 1 (**red**)
- [ ] ⚪ `code-dict`·`yaml-catalog` 테스트에 같은 모양의 "비-wanted 비리터럴은 보고하지 않는다" 짝(지금도 green — 세 어댑터 계약을 대칭으로 고정)
- [ ] `lib/keys/__tests__/save.test.ts` — `planClearability` 편입: surgical·비-base·`""` → 키 전체 `cannot-clear` + `localeCodes` · 공백만 → 같다 · base `""` → ok · 재생성 비-base `""` → ok · ko 수정 + fr 비우기 → 키 전체 거부
- [ ] `lib/import/__tests__/`(surface 옆) — `localesToKeep`: 첫 시도 실패 + 재시도 성공 → fr 포함 · 재시도도 실패 → fr 포함(번역 없음) · 템플릿에 없는 경로 → 불포함
- [ ] `lib/publish/__tests__/plan.test.ts` — `planPublishView`: committed는 `delivered`로 말한다 · `withheld > 0` 한 줄(역할별 문구) · `withheld` 0이면 줄 없음(짝) · `skipped/withheld` → Not sent 틀 · `no-changes` + withheld → 설명에 한 줄
- [ ] `lib/sync/__tests__/plan.test.ts` — `planSyncFinish`가 `withheld`를 사건 payload로 넘긴다 · `lib/events/__tests__/`의 `readPayload`가 새 필드를 읽고 옛 사건은 0
- [ ] `lib/pull/__tests__/run.test.ts` — ko·fr 편집 + `fr.yml` 없음 → `committed` · `saveLastPulledAt`의 delivered에 ko만 · withheld에 fr · contexts는 줄지 않음 · `withheld: 1`. 전부 보류 → `skipped/withheld`. 기존 writer-warnings 케이스(접두 충돌·base 부재) 그대로 `skipped`.

**새 jsdom 테스트**
- [ ] `components/__tests__/publish-button.test.tsx` — created·updated·no-changes·withheld 네 갈래 문구와 수(`delivered`), withheld 0이면 줄 없음
- [ ] 번역 화면 — `cannot-clear`면 푸터 Alert(제목에 로케일) + 그 셀 `aria-invalid`·`aria-describedby` · 다른 오류면 기존 `save-failed` Alert(짝) · 입력값 유지
- [ ] Logs 상세 — 보류 수가 있으면 한 줄, 없으면 없음

**새 postgres 재현 (red 확인)**
- [ ] #1 — 편집 → 리포에서 키 제거 + 폐기 승인 Sync → 키 복구 CI push → 지금은 `deferred`(**red**), 기대 `applied` · `countPending` 0
- [ ] D1 경계 — (a) 표면 A 적재·B `failed`: A의 orphan 승인 토큰 해제 · B 토큰 유지(N > 0) (b) B `superseded`: 유지 (c) orphan 아닌 승인 셀 중 페이로드 미포함(fr 파일에 그 키 없음) → 유지 · `remainingEdits` N (d) 승인 뒤 저장 → 유지
- [ ] #58 — 비-base 파일에 base에 없는 `z`(기존 orphan, 토큰 없음) 번역을 **실은** 페이로드 → `z` 셀 값·`updatedBy`·행 불변(**red**) · 같은 파일 base 키 셀은 덮임(짝). (`push-absent-cells.integration.ts:83`은 페이로드에 k3 번역이 없어 #58을 구별 못 한다 — 새 케이스)
- [ ] #59 — fr 첫 다운로드 실패 + 재시도 성공 → fr 적재·`orphaned=false`(**red**) / 재시도도 실패 → `orphaned=false` · `partial-import`
- [ ] D2 — `save-key.integration.ts`: surgical 비-base `""` → 거부 · 행 불변(**red**) / base `""` 저장 → 기존대로(새 짝 — :150은 update로 심는다)
- [ ] D3 기준 — `delivery-confirm.integration.ts`: 보류 fr이 있는 Publish 뒤 OWNER Revert가 ko·fr 모두 ok(**red** — 지금은 writer-warnings로 Publish가 안 된다)
- [ ] 대가(spec 완료 조건 11) — 보류 fr이 남은 동안 CI push `deferred` → OWNER Revert로 0 → 다음 CI push `applied`

**뒤집거나 갱신할 기존 테스트** (의도된 red — 목록 밖에서 red가 나면 멈춘다)
- `ts-dict.test.ts:328-332` (위)
- 결과 형(`withheld`·`delivered`·`skipped/withheld`)으로 깨지는 정확 단언: `run.test.ts:91,150,191,266,782` · `delivery-wiring.test.ts:92,101,108` · `trigger.test.ts:48` · `app/(edit)/__tests__/edit-flow.test.ts:175` · `sync-run.test.ts:91` · `onboarding.test.ts:1485` · `lib/sync/__tests__/plan.test.ts:141-157`
- `sync-edit-protection.integration.ts:138-148`(C4) — green 유지, **이름만** "`applyPush`는 페이로드 밖 토큰을 안 건드린다"로 고친다(POSTMORTEM 2026-09-03)
- ⚠️ **건드리지 않는 것**: `sync-edit-protection.integration.ts:187-198`(C9 — Publish 확인은 orphan 셀 토큰을 해제하지 않는다)는 **지키는 계약**이다. `repository-import.integration.ts:342-351`(승인 셀 중 fr 파일에 없는 키 → 토큰 유지 · `remainingEdits: 1`)도 **그대로 green**이어야 한다(D1을 orphan 셀로 좁혔다). `trigger.test.ts:83-115`(base 부재 → writer-warnings)도 그대로다.

- 검증: 위 "red" 표시 항목이 전부 red, 짝·유지 항목은 green, 그 밖의 `pnpm test`·`pnpm test:projects:postgres` green.

## T2 순수 함수 구현 (커밋 #1 `fix:`)

- [ ] `lib/pull/undeliverable.ts` 신규(잎 모듈) · `render.ts` 좌표 태깅 · ts-dict `writeWithErrors`(wanted 필터 + `write-slot-missing`)
- [ ] `planClearability` → `planKeySave` · `localesToKeep` · `planPublishView` · `planSyncFinish` · `readPayload`
- 검증: T1의 단위 테스트 green · `pnpm typecheck`

## T3 pull 배선 — #3 · C (커밋 #1)

- [ ] `run.ts`: `blockingErrors` 수로 `planProtectedPublish` · `splitEdits` · `saveLastPulledAt(delivered, contexts, withheld)` · 결과 형 분리(design D3)
- [ ] `PullState.surfaces[].keys`에 key id가 없으면 `loadState`가 싣는다(`splitEdits`의 `keyOf`)
- [ ] `load.ts` `confirmDelivery`: 새 revision 뒤 보류 셀 중 기준 행이 있는 셀의 `revision` 갱신(`restoreValue` 불변)
- [ ] `run.ts`의 `PullResult` 주석(T10 문단)을 새 규칙으로
- 검증: T1 `run.test.ts`·`delivery-confirm.integration.ts` 케이스 green

## T4 미리보기 정렬 — #3 (커밋 #1)

- [ ] 같은 픽스처(pending **200행 이하**)로 `readPublishPreview`의 `withoutFile`과 `runPull`의 `withheld`가 같다 — yaml·code-dict 두 per-locale 어댑터. 두 하네스가 mock db / `fake-client.ts`로 다르므로 픽스처를 공유 모듈로 뺀다
- [ ] base 파일 부재에서 미리보기가 `withoutFile`로 세는지 확인 → 세면 blocking 표시로 맞춘다(design D3 마지막 줄)
- 검증: 테스트 green

## T5 push 배선 — #1 · #58 · #59 (커밋 #1)

- [ ] `lib/import/run.ts` `finishSurface`: `check.ok` 뒤 `payload`·`empty` 갈래에서 D1 UPDATE
- [ ] `apply.ts` translations 필터(D5) · `:312` 주석 · refs가 orphan 키를 받는 것이 계약인지 확인(아니면 같이 거른다)
- [ ] `lib/import/surface.ts:45` 뒤 `localesToKeep`(D6)
- 검증: T1 postgres 재현 #1·D1 경계·#58·#59·대가 green, 유지 목록 green

## T6 저장 배선 — #2 (커밋 #1)

- [ ] `save-key.ts`: 잠금 뒤 select에 `adapterName` · `formatFromProject`→`adapterFor`로 `writeStrategy` · `planKeySave`에 넘긴다. Revert 경로(`revert.ts`)는 건드리지 않는다
- [ ] `messages/en.tsx` 문구(design D2) · `workspace.tsx`의 도메인 오류 매핑(:267-270)에 `cannot-clear` 갈래 · 셀 `aria-invalid`·`aria-describedby`
- 검증: T1 D2 postgres·jsdom green · 수동 `/bugshot-qa`(로컬, yaml 표면에서 fr 비우기 → 푸터 Alert·입력 유지)

## T7 결과·기록 배선 (커밋 #1)

- [ ] `publish-button.tsx`: `delivered` 사용(:416의 `total` 교체) · 보류 줄 · `skipped/withheld` → Not sent 틀 · 역할별 문구
- [ ] `lib/sync/run.ts`·`lib/events/*`: Publish 사건 payload에 `withheld` · `event-detail.tsx` 한 줄 · `messages/en.tsx`
- 검증: T1 jsdom·단위 green · 결과와 Logs가 같은 수

## T8 `/code-review` → `/refactor` (커밋 #2)

- 검증: 🔴 0 · `pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck` green

## T9 정본 갱신 (문서별 커밋 `docs(ARCHITECTURE)`·`docs(PRODUCT)`·`docs(DESIGN)`)

- [ ] ARCHITECTURE §0-1·§0-9 · §3 T10 문단 · §5.5.2 · §5.6.35(200행 경계) · §5.8(보류 기준 재갱신 · 등식을 깨는 쓰기 넷) · `apply.ts:133` 재집계 주석(#61)
- [ ] PRODUCT §3 편집 규칙 — "ts-dict·yaml-catalog·code-dict 표면의 비-base 셀은 비울 수 없다 — **명시적 빈값 export(§10)가 생기기 전까지의 임시 규칙**" · §7.6 Publish 결과 상태(비-base 파일 부재는 부분 전달 + `withheld`, base 부재는 `writer-warnings`)
- [ ] DESIGN §6.646 — withheld 줄(미실측)
- [ ] `docs/features/audit-report/tasks.md` B1 체크 · 이 디렉터리 삭제는 `/push` 뒤
- 검증: `/push` 4단계 신선도 게이트 통과

## 검증 게이트 (배치 끝)

- 자동: `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:projects:postgres`
- 수동 `/l10n-roundtrip` — **먼저 GitHub 콘솔 App 설정의 Repository access에 대상 리포가 있는지 확인한다**(CLAUDE.md "설치 목록을 문서에 적지 않는다"):
  - `i18n-format-check`(yaml-catalog, 프로젝트 `format-check-yaml` — `docs/ACTIONS.md:17`): fr 편집 + `fr.yml`을 base에서 뺀 상태로 Publish → ko만 PR · fr 보류 줄 · 파일 복구 뒤 Publish → fr 전달. 리포에 `fr.yml`이 있는지 먼저 본다(없으면 다른 비-base 로케일로)
  - `bugshot-i18n-test`(ts-dict): 비리터럴 프로퍼티가 있는 파일의 리터럴 키 편집이 PR로 나간다(#4) · fr 객체에 없는 키 번역은 보류 줄(C)
  - `i18n-order-check`: 재생성 어댑터 회귀 없음(D3가 렌더 출력 형을 바꾸므로)
