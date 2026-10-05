# sources-add-remove — design

> 기능 정의는 `spec.md`. 이 문서는 데이터·판정·흐름의 정본이다(구현 전까지). feature-review(2026-10-05) 반영판.

## 0. 현행 사실 (2026-10-05 코드 기준, 리뷰가 대조함)

| 사실 | 위치 |
|---|---|
| 기준 언어 상태는 후보별 `bases` 맵, 컨트롤은 포커스 후보 하나 | `components/sources/add-sources-modal.tsx:31·158` |
| 신규 프로젝트 ③이 소스별 블록을 그린다 — `BaseLocaleFields`는 export되지 않은 지역 함수 | `components/onboarding/steps/naming.tsx:135-148·155` |
| 2단계 모달 선례(`transitionKey` + 자체 `notice` "Step n of 2") | `token-modal.tsx:102·109` |
| `LargeModal step=`은 "Step n of 4" 고정, `WizardFooter`는 진짜 `disabled` | `large-modal.tsx:202`, `lib/onboarding/next-enabled.ts:12`, `wizard-footer.tsx:22` |
| 바닥은 `justify-between`, 왼쪽 = `notice` 슬롯 | `large-modal.tsx:201-207` |
| `TranslationSurface.archivedAt` — 쓰기 0 | `prisma/schema.prisma:118-121` |
| 경로 소유는 보관 행 제외, slug 계획은 포함 | `lib/surfaces/create.ts:59·62-63·66` |
| surfaceId는 잠금 전 `prepared`에서 생성 | `lib/surfaces/create.ts:38-44` |
| 모달 `existing`은 이미 활성만(`archivedAt: null`) | `sources-screen.tsx:126`, `lib/sources/query.ts:34` |
| `/api/push`·`/failure`는 보관 표면을 못 찾아 `409 surface mismatch`, `record()` 없음 | `app/api/push/route.ts:165-168`, `failure/route.ts:94-97` |
| 잠금 뒤 표면 보관이면 `ApplyGuardError("archived")` — 프로젝트 보관과 같은 낱말 | `lib/push/apply.ts:179`, route `:279-282` |
| 미전달 술어는 보관 표면·orphaned를 뺀다 | `lib/protection/where.ts:17-19` |
| 수동 Sync 지문은 프로젝트 전체를 묶는다 | `lib/protection/fingerprint.ts:25-36` |
| 승인 토큰 장치 | `lib/push/apply.ts:107` (`approvedTokens`) |
| Revert는 키 단위 + baseline 필요 — 소스 단위 재사용 불가 | `lib/keys/revert.ts:22·116` |
| `ProjectEvent.kind` enum에 `SURFACE` 있음, `subtype`은 문자열 | `schema.prisma:438-445·474-479` |
| SURFACE 사건 문장은 baseLocale 외 전부 `surface.added` | `lib/events/view.ts:323-328` |
| SURFACE 페이로드 파서는 `{surfaceSlug, adapter, baseLocale}`만 | `lib/events/payload.ts:144·245` |
| 거부 어휘 `NOT_STARTED_REASONS` 여섯 고정 | `lib/events/payload.ts:50-63` |
| 잠금 접근 판정, 보관 표면은 `not-found` | `lib/auth/lock.ts:33-39`, `lib/auth/access.ts:98` |
| 기본 소스 선택 = 후보 배열 첫 항목 | `lib/surfaces/plan.ts:8` |
| 하위 FK 전부 `Restrict`(Locale·StringKey·Translation·TranslationBaseline·DeliveryConfirmation) | `schema.prisma` |
| Logs 소스 필터는 활성만 | `app/(edit)/projects/[slug]/logs/page.tsx:68` |

`archivedAt` 읽기 전수(리뷰 확인 — 전부 "제거됨"으로 읽어도 참): `lib/home/meta.ts:103`, `lib/nightly/run.ts:78-82`, `lib/inbox/load.ts:20`, `lib/keys/search.ts:57·94`, `lib/keys/query.ts`(셸 nav·기본 소스), `lib/pull/load.ts:63·253·304`, `lib/import/plan.ts`·`run.ts`, `lib/onboarding/readiness.ts:24`, MCP `project.ts:129`.

## 1. 영향 받는 흐름

- **편집 UI**: Add sources 2단계, 상세 모달 바닥 재배치 + 제거 확인, Logs 필터.
- **push**: `/api/push`·`/failure` 거부 구분, 되살림 = 같은 행 + strict 첫 적재.
- **pull/Publish**: 이미 활성만 — 변경 없음, 회귀 단언만.
- **MCP**: `remove_source`(미리보기·실행), `add_sources`는 코어에서 되살림을 자동으로 얻는다.

## 2. 순수 함수 (= `/tdd` 진입점)

| 함수 | 입력 → 출력 | 놓일 곳 |
|---|---|---|
| `planSurfaceRevival(picks, surfaces)` | 요청마다 `{ kind: "revive", surfaceId, slug } \| { kind: "create" }`. 규칙: `archivedAt != null && pathTemplate == && adapterName ==` 중 `archivedAt` 최신. 어댑터 다르면 `create` | `lib/surfaces/plan-revival.ts` |
| `planSurfaceRemoval(input)` | `{ target, active[], defaultSurfaceId, projectArchived, importing }` → `{ ok: false, error: "last-source" \| "archived" \| "importing" \| "not-found" } \| { ok: true, nextDefaultId: string \| null }`. 승계 = 남은 활성 중 slug 오름차순 첫째 | `lib/surfaces/plan-removal.ts` |
| `removalReason(m, verdict)` | 사전 차단·서버 거부가 같은 문장 (멤버 `planMemberChange` 형) | 같은 파일 |
| `planAddStep(state)` | ① → ② 가능 여부 + 사유 — `planAddBlock`에서 분리 | `lib/sources/add-block.ts` |
| `classifyMissingSurface` | 활성 표면 미발견 시 `removed`(같은 slug의 보관 행 존재) / `mismatch` | `lib/push/surface-refusal.ts` |
| `removalFingerprint` | `["remove-surface", userId, projectId, surfaceId, 그 소스 토큰[id,token] 정렬]` 해시 | `lib/protection/fingerprint.ts` |

## 3. 서버 코어

### 3.1 `removeSurface(tx…, { slug, surfaceSlug, approval? })` — `lib/surfaces/remove.ts`
트랜잭션 하나.
1. `lockProjectAccess(tx, { permission: "project:settings", surfaceId, credential })`(`lib/auth/lock.ts:33-39`) — Project → TranslationSurface 잠금. `app/__tests__/locked-access.test.ts`의 `SITES`(웹)·`TOKEN_SITES`(MCP)에 등록(POSTMORTEM 2026-09-24 재발 항목).
2. 잠금 뒤 활성 표면·기본 id·`lastImportStartedAt`·그 소스의 미전달 토큰(**`surfaceId` + `pendingEditToken IS NOT NULL` 전부, orphaned 포함**) 읽기.
3. `planSurfaceRemoval` → 거부면 반환.
4. 미전달 > 0이면 `removalFingerprint` 대조. 불일치 `stale-approval`.
5. `archivedAt = now()`. 기본이면 `Project.defaultSurfaceId = nextDefaultId`.
6. `ProjectEvent { kind: SURFACE, subtype: "surface.removed", payload: { surfaceSlug } }` — 같은 tx.
7. **번역은 건드리지 않는다**(편집 폐기는 §3.2 되살림 적재에서).

껍데기:
- 웹: `removeSource` Server Action + 읽기 전용 `previewSourceRemoval`(지문·미전달 수·열린 PR 여부, `revalidatePath` 없음) — `app/(edit)/projects/[slug]/sources/actions.ts`. CLAUDE.md 데이터 변경 경로 표에 행 추가.
- MCP: `preview_source_removal`(읽기) + `remove_source`(쓰기) — `lib/mcp/tools/`, catalog `project:settings`. 수동 Sync 도구 형(`lib/mcp/tools/sync.ts:29·39`).

### 3.2 재추가 = 되살림 — `lib/surfaces/create.ts`
- tx 안에서 `planSurfaceRevival`. `additions`를 만들 때 `prepared`의 `randomUUID()` id를 **보관 행 id로 교체**한다 — 그 id가 owners(:66)·`recordEvent`(:86)·`applyPushInTransaction`(:89)·`recordRun.surfaceIds`(:105)로 흐른다.
- `revive` 갈래 `update`: `archivedAt = null`, `baseLocale`, `lastCommitSha = null`, `lastCommitAt = null`, `lastImportError = null`, `lastImportFailedAt = null`, import 토큰 갱신. `slug`·`id` 유지.
- `applyPushInTransaction(..., { previousBaseLocale: null, approvedTokens: <그 소스의 현재 미전달 토큰 전부> })` — `previousBaseLocale` null = 첫 적재 의미(옛 값을 넘기면 `apply.ts:184`가 잠금 뒤 값으로 덮고, 남은 `lastCommitAt`이 `checkCommitOrder` `stale-commit`을 낼 수 있다).
- slug 계획은 `create` 갈래에만.
- 사건은 기존 추가 사건 그대로(`revived` 필드 없음 — 소비자 없음).

### 3.3 `/api/push`·`/api/push/failure`
- 활성 미발견 → `classifyMissingSurface` → `removed`면 `409 { error: "surface removed" }` + `record(refusal: "surface-removed")`, 그 밖은 현행 `surface mismatch`(기록 없음 유지).
- 잠금 뒤 `ApplyGuardError`를 `archived`(프로젝트) / `surface-removed`(표면)로 분리.
- `NOT_STARTED_REASONS`에 일곱째 `surface-removed` + Logs 문장.
- `docs/ACTIONS.md:162` red 조건 문장 갱신.

### 3.4 Logs
- `view.ts` SURFACE 분기에 `surface.removed` 문장.
- 소스 필터 쿼리가 보관 소스도 싣고 `(removed)` 표시. 제거된 소스 행은 링크 없음.

### 3.5 열린 PR 여부 (확인 창 줄)
- `previewSourceRemoval`이 프로젝트의 열린 Malmoi PR 존재를 기존 조회(보관 확인의 PR 줄과 같은 소스)로 읽는다. 조회 실패는 줄을 "확인할 수 없음"으로 — 제거를 막지 않는다.

## 4. 스키마·환경·불변식

- **스키마 변경 0, 마이그레이션 0.** `archivedAt` 재사용, 사건은 기존 enum + 문자열 subtype. `schema.prisma` `archivedAt` 주석의 "쓰는 곳이 0"을 쓰는 자리 둘(제거·되살림)로 고친다.
- **새 환경변수 없음.**
- **불변식**
  - 불변식 3·사건 보존: 하드 삭제 없음, 되살림이 같은 행 — 보존.
  - 병합 없음: 되살림 첫 적재는 strict + `approvedTokens`(수동 Sync와 같은 장치). 편집을 버리는 길이 셋이 된다 → ARCHITECTURE §0 · CLAUDE.md · PRODUCT 문장을 **코드보다 먼저** 고친다.
  - 결정성·blob SHA: 영향 없음.
  - 인증 경계: 새 Action·MCP 도구 둘 다 `project:settings`, 잠금 판정은 `lockProjectAccess` 하나.

## 5. 남은 확인

- 없음(리뷰에서 전부 닫힘). 구현 중 새 해석이 생기면 여기 적고 묻는다.

## 6. POSTMORTEM 소환

- 2026-09-24 🔁 잠금 접근 재발 → §3.1-1 `SITES` 등록.
- "세는 집합 ≠ 바꾸는 집합"(`:1490-1495`) → 미전달 수·승인 토큰은 `surfaceId` 전체(orphaned 포함) 하나로 센다.
- 2026-09-15 쓰는 자리 전수 → `archivedAt` 주석·`markImportStarted` 경합(§spec B16 `importing`).
- 2026-09-13 🔁 A→B→A·늦은 응답 역전(`:1251-1257`), Radix `disabled` 전파(`:1653-1659`), 선택 소비자 전수(`:1661-1675`) → 2단계 모달 DOM 테스트.
- 2026-09-14 기본 소스 복합 FK(`:1587-1593`) → 승계 실 PG 단언.
