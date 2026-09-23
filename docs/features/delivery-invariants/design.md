# design — 전달 층 불변식 (audit B1)

## 영향 받는 흐름

| 흐름 | 파일 | 항목 |
|---|---|---|
| **push(수동 Sync)** | `lib/import/run.ts`(`finishSurface`) · `lib/push/apply.ts` | #1 |
| **push(CI·수동 공통)** | `lib/push/apply.ts`(`applyWith`의 translations 필터) | #58 |
| **push(수동 Sync 준비)** | `lib/import/surface.ts` · `lib/push/payload.ts` 호출부 | #59 |
| **pull(Publish·야간)** | `lib/pull/render.ts` · `lib/pull/run.ts` · `lib/protection/plan.ts` · `lib/pull/load.ts`(`saveLastPulledAt` 입력) | #3 · #2 |
| **pull 미리보기** | `lib/publish/read.ts` | #3 (분류를 실행과 맞춘다) |
| **어댑터** | `lib/adapters/ts-dict.ts` | #4 |
| **편집 UI 저장** | `lib/keys/save-key.ts` · `messages/en.tsx` | #2 (D2 권장안일 때) |

세 흐름 중 **push와 pull 둘**을 건드린다 — `/ship` 스코프 가드에 걸리므로 `/ship bypass`로 태운다(계획 원본 = 이 디렉터리).

## 설계 결정

### D1. #1 — 승인 토큰 해제는 **표면 적재가 확정되는 tx**에서, 승인 집합으로 좁혀서

`finishSurface`(`lib/import/run.ts`)가 `applyPushInTransaction`(또는 `empty` 갈래의 orphan 처리) 직후, **같은 tx**에서:

```sql
UPDATE "Translation" SET "pendingEditToken" = NULL
WHERE "projectId" = $projectId AND "surfaceId" = $surfaceId
  AND "pendingEditToken" = ANY($approvedTokens::text[])
```

- **표면별이다.** 수동 Sync는 표면마다 따로 tx를 연다. `failed` 갈래(적재 안 됨)의 표면은 토큰을 안 비운다 — 그 표면에는 아무 일도 안 일어났으므로 편집이 그대로 살아 있는 것이 맞다.
- **`updatedAt`을 건드리지 않는다** — `acknowledgeDelivered`(`lib/pull/load.ts`)와 같은 이유(1층 `lastPulledAt` 비교).
- **orphan 필터를 걸지 않는다** — `acknowledgeDelivered`는 orphan 셀을 일부러 제외하지만(완료 조건 9), 이쪽은 OWNER가 승인한 폐기라 좌표가 무엇이든 그 편집은 더 이상 없다.
- upsert의 `"pendingEditToken" = NULL`(apply.ts:357)은 그대로 둔다 — 덮인 셀은 거기서 이미 비워지고, 이 문장은 **안 덮인 승인 셀**(orphan·실패 파일·빈 값)만 잡는다. 둘을 합치지 않는다: 앞의 것은 CI 경로에도 있고 이쪽은 승인 경로 전용이다.
- ⚠️ **값은 되돌리지 않는다.** 리포에 값이 없던 승인 셀(빈 값·실패 파일)은 편집된 값이 DB에 **pending 아닌 값으로** 남는다. 다음 CI push가 그 파일을 읽으면 strict 덮기로 리포 값이 된다. **2026-09-24 사용자 결정: 그대로 둔다** — 리포의 빈 값은 "모름"이지 삭제가 아니다(§5.5.2와 같은 규칙).
- **순수 판정은 없다** — SQL 한 문장이고 조건이 승인 집합뿐이다. 검증은 postgres 통합 테스트다.

### D2. #2 — 수술적 표면의 비-base 비우기를 **저장 단계에서 막는다** (2026-09-24 사용자 결정 — (a))

세 안을 봤다:

| 안 | 동작 | 판정 |
|---|---|---|
| **(a) 저장 거부** | `writeStrategy === "surgical"` 표면의 비-base 셀에 `""` 저장을 `cannot-clear` 오류로 거부한다. 화면은 "This file format can't remove a translation. Enter a value or revert." | **권장** — 도달 불가능한 상태를 만들지 않는다. 오늘도 그 비우기는 리포에 **한 번도 닿은 적 없다**(조용히 무효) |
| (b) 셀 단위 전달 제외 | D3의 제외 집합에 "비운 수술적 셀"을 넣어 토큰을 남긴다 | 그 셀은 **영영 전달될 수 없다**(writer가 지울 줄 모른다) → CI가 영구 보류된다. #1과 같은 결함을 다른 입구로 다시 만든다 |
| (c) 수술적 writer에 삭제 추가 | yaml·ts-dict·code-dict가 빈 값 키의 노드를 지운다 | 진짜 해법이지만 §1.4 표현 보존 계약(빈 줄·주석·쉼표) 전체를 건드린다 — 비목표 |

- (a)의 입력: 저장 시점에 표면의 `adapterName` → `adapterFor(...).writeStrategy`, 셀의 로케일이 base인지. **base 셀 비우기는 지금 규칙 그대로다**(`buildWriteEntries`가 sourceText로 폴백한다 — POSTMORTEM 2026-09-09).
- ⚠️ **이미 비워진 채 pending인 셀**(배포 전 데이터)은 (a)가 못 막는다 → T0이 개수를 세고, 0이 아니면 그 셀들은 Revert 대상으로 남긴다(OWNER에게 배너가 이미 보인다 — orphan이 아니므로 `pendingWhere`에 든다).
- **순수 함수**: `planClearability({ writeStrategy, isBase, value }) → "ok" | "cannot-clear"` — `lib/keys/`에 둔다(저장 판정 옆).

### D3. #3 — writer 경고를 **두 부류로 가르고**, 전달 불가 셀을 좌표로 뺀다

`render.ts`의 출력(`LocalFile.errors`)을 그대로 두고, `run.ts`가 판정 전에 **순수 함수 둘**로 가른다.

```ts
// lib/pull/undeliverable.ts (신규, 잎 모듈)
/** 파일이 통째로 없어 그 로케일이 이번 pull에 실리지 않는 좌표. reject 대상이 아니다 (결정 #3). */
export function undeliverableLocales(rendered: readonly RenderedSurface[]): Set<string>  // `${surfaceId}\0${locale}`
/** reject 대상 경고만. `original-file-missing`은 뺀다. */
export function blockingWarnings(rendered: readonly RenderedSurface[]): string[]
/** 캡처한 편집 중 이번에 실제로 파일에 실린 것만. 좌표(`cell`)가 없는 옛 편집은 보수적으로 **뺀다**. */
export function deliverableEdits(edits: readonly PendingEdit[], undeliverable: ReadonlySet<string>): PendingEdit[]
```

- **좌표의 출처**: per-locale 경로는 `resolveLocalePaths`가 `locale`을 들고 있다(`render.ts`의 `p.locale`). `original-file-missing`을 낸 경로의 `(surfaceId, locale)`이 곧 제외 좌표다. **multi-locale의 같은 코드는 제외 좌표를 만들지 않고 blocking으로 남긴다** — 키→파일 대응이 없어 좌표가 로케일 전체로 번지고, 그러면 다른 파일로 전달된 편집까지 pending이 남는다(비목표).
- `run.ts` 변경:
  - `planProtectedPublish({ pending, writerWarnings: blockingWarnings(...).length })`
  - `saveLastPulledAt(..., deliverableEdits(pendingEdits, undeliverable), ...)` — `committed`·`no-changes` 두 호출 모두.
  - ⚠️ **`deliveryContexts`(소스별 전달 확인)도 좁힌다** — 제외 좌표가 있는 표면은 "전부 전달됨" 확인을 쓰지 않는다. 안 좁히면 그 표면이 "Sent"로 보인다.
  - **1층은 그대로다** — `unpublished`는 전체 pending 수다. 남은 fr 편집 때문에 매 Publish·매 밤 트리를 읽는다(§3 T10이 이미 감수한 "지속 상태 경고" 비용과 같다).
- **결과에 제외 수를 싣는다**: `committed`·`no-changes`에 `withheld: number`(0이면 생략). 이것은 **경고가 아니라 수**다 — T10이 막은 것은 "버린 값을 성공 결과에 싣는 것"이 아니라 "버린 값의 토큰을 성공으로 비우는 것"이었고, 이 설계는 토큰을 안 비운다. 화면(`lib/pull/message.ts` → Publish 결과)에 한 줄: "N edits weren't sent — their file isn't in the repository. Ask a project owner." **2026-09-24 사용자 결정: Publish 결과 한 줄만 B1에서 넣는다** — 배너가 파일 존재를 세려면 화면 로드마다 GitHub 트리를 읽어야 해서 뺐다. 배너 문구 정리는 B4.
- **미리보기 정렬**: `lib/publish/read.ts`의 `withoutFile` 판정이 이미 per-locale 수술적 + base에 경로 없음이다 — 실행 쪽 `undeliverableLocales`와 **같은 조건**인지 테스트 하나로 고정한다(같은 픽스처로 둘을 돌려 수가 같다). 판정을 공유 함수로 합치지는 않는다: 미리보기는 행 단위, 실행은 렌더 출력 단위라 입력 형이 다르다.
- ⚠️ **"보류와 거부가 서로를 잠근다"는 이것으로 풀린다** — ko는 나가고, fr 편집만 남는다. fr은 OWNER의 Revert, 파일 복구, 또는 폐기 승인 Sync(D1)로 풀린다. EDITOR의 유일한 출구(Publish)는 fr을 못 푼다 → 배너는 B4.

### D4. #4 — ts-dict 경고를 `wanted` 키로 좁힌다

`pairs()`가 모든 프로퍼티의 비리터럴을 `errors`에 넣는다. `write`에서만 **wanted에 든 키의 비리터럴**만 보고하도록 한다(`read`는 지금대로 전부 보고 — 적재 시 경고는 정보다). code-dict(:340)·yaml-catalog(:386)이 이미 그 모양이다.
- 구현 형: `pairs(obj, path, errors, report?: (key) => boolean)` 또는 write 쪽에서 `errors`를 wanted로 거른다. 후자가 외과적이다.
- `ts-dict.test.ts:328-332`("writeWithErrors가 비리터럴 프로퍼티를 에러로 돌려준다")가 **지금 동작을 고정한다** — 그 테스트를 "편집 대상이 아닌 비리터럴은 경고 0 / 편집 대상 비리터럴은 경고 1"로 **먼저 뒤집는다.**

### D5. #58 — 비-base 셀은 **이번 페이로드의 base 키 집합**으로 거른다

`applyWith`의 `translations` 필터에 `payloadKeys.has(t.key)`를 더한다(`payloadKeys = new Set(payload.keys.map(k => k.key))`). `idByKey`는 refs 매핑에도 쓰이므로 **그대로 둔다** — refs는 orphan 키도 받는 것이 현재 계약인지 T5에서 확인한다(아니면 같이 거른다).
- 주석을 참말로 고친다("base에 없는 키" = 이번 push의 base 파일에 없는 키, 기존 orphan 포함).
- 순수 함수로 뺄 만큼 크지 않다 — 필터 한 줄이다. 검증은 postgres(`push-absent-cells.integration.ts` 옆).

### D6. #59 — 다운로드 실패한 로케일은 **로케일 목록에 남긴다**

`lib/import/surface.ts`의 준비 결과가 페이로드를 만들 때, `targets`에 있었는데 `blobs`에 없는(재시도 후에도 실패) 경로의 로케일을 `payload.locales`에 **포함**한다. 그 로케일의 번역은 페이로드에 없으므로 덮이지 않고, `Locale` 행은 orphan되지 않는다. `partial-import` 표시는 지금대로다.
- **순수 함수**: `localesToKeep({ attempted, read, template }) → string[]` — 경로→로케일은 기존 `templatePaths`/`resolveLocalePaths` 계열을 재사용한다(새 파서를 만들지 않는다).
- ⚠️ **CI 경로(`scripts/push-local.ts`·GitHub Action)는 대상이 아니다** — 거기서는 파일을 못 읽으면 `/api/push/failure`로 가고 적재가 아예 안 된다(CLAUDE.md 데이터 변경 경로).

## 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치 | 항목 |
|---|---|---|
| `undeliverableLocales` · `blockingWarnings` · `deliverableEdits` | `lib/pull/undeliverable.ts` (신규) | #3 |
| `planProtectedPublish` (입력 의미 변경 없음 — 호출부가 blocking 수만 넘긴다) | `lib/protection/plan.ts` | #3 |
| `planClearability` | `lib/keys/` (신규 또는 `save.ts` 옆) | #2 |
| `localesToKeep` | `lib/import/` | #59 |
| ts-dict `writeWithErrors` (어댑터 순수 함수) | `lib/adapters/ts-dict.ts` | #4 |
| Publish 결과 메시지(`withheld`) | `lib/pull/message.ts` | #3 |

I/O 껍데기(postgres로만 검증): D1 UPDATE · D5 필터 · `run.ts`/`load.ts` 배선.

## 스키마 변경

**없음.** 토큰 컬럼·좌표는 전부 기존 것이다.

## 새 환경변수

**없음.**

## 불변식 영향

- **§0 불변식 1(미전달 편집 보호)**: 보호 판정 입력은 그대로 **count 하나**다 — D1·D5가 바꾸는 것은 "토큰이 남아야 할 셀에만 남는가"이고, 리포 값·DB 값을 견주는 입력이 새로 생기지 않는다. ✅ 병합 아님.
- **§0 불변식 9(버린 값을 성공으로 숨기지 않는다)**: D3은 **강화**다 — 지금은 경고 하나에 전체 거부(안전하지만 막힘), 바뀐 뒤엔 실린 셀만 확인하고 안 실린 셀은 토큰을 남긴다. D2(a)는 "보낸 적 없는 비우기"가 애초에 저장되지 않게 한다.
- **export 결정성·blob SHA·커밋 전략(§1·2·3)**: 렌더 출력·트리 페이로드는 **바뀌지 않는다**(D4는 경고만 줄이고 content는 같다). ✅
- **인증 경계(§6)**: 없음.
- 정본 갱신(구현 커밋과 같은 배치 — `/push` 4단계): ARCHITECTURE §0-1·§0-9 문단, **§3 T10 문단**(`original-file-missing` 예외), **§5.5.2**(승인 토큰 해제 · 비-base 필터 · 수술적 비우기 거부), **§5.6.35**(실행과 같은 판정임을 명시), `apply.ts:133`의 재집계 주석(#61).

## 과거 함정 (POSTMORTEM)

- **2026-09-14 "조건 불일치 0행은 조용하다"** — D1의 UPDATE도 0행이면 조용하다. 테스트는 "해제된 행 수 = 승인 토큰 중 안 덮인 셀 수"를 **N > 0**으로 단언한다.
- **2026-09-09 "일회용 허가를 이벤트로 비웠다"** — 술어를 "승인 Sync가 돌았다"가 아니라 "**이 표면의 적재가 확정됐다**"로 쓴다(D1이 `failed` 갈래를 빼는 이유).
- **2026-09-18 T10 반전** — 경고를 성공 결과에 싣지 않는다는 규칙은 유지한다. `withheld`는 경고 문자열이 아니라 수이고, 토큰을 비우지 않는다.
- **2026-09-17 "같은 pending이 화면마다 다르게"** 계열 — 미리보기 `withoutFile`과 실행 `withheld`가 다른 수를 내면 같은 결함이다. D3의 "같은 픽스처로 두 수가 같다" 테스트가 그 그물이다.
- **2026-09-02 "writeStrategy 분기를 하나 고치면 전부 찾는다"** — D2·D3이 `writeStrategy`를 새로 읽는다. `layout`으로 판정하지 않는다.
