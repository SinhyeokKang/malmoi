# design — 전달 층 불변식 (audit B1)

## 영향 받는 흐름

| 흐름 | 파일 | 항목 |
|---|---|---|
| **push(수동 Sync)** | `lib/import/run.ts`(`finishSurface`) | #1 (D1) |
| **push(CI·수동 공통)** | `lib/push/apply.ts`(`applyWith`의 translations 필터 :310-316) | #58 (D5) |
| **push(수동 Sync 준비)** | `lib/import/surface.ts`(:33-45 재탐지·재시도) | #59 (D6) |
| **pull(Publish·야간)** | `lib/pull/render.ts` · `lib/pull/run.ts` · `lib/pull/load.ts`(`confirmDelivery`) · `lib/protection/plan.ts` | #3 · C (D3) |
| **pull 결과·기록** | `lib/pull/run.ts`(`PullResult`) · `lib/publish/plan.ts`(`planPublishView`) · `components/publish-button.tsx` · `lib/sync/run.ts`·`lib/sync/plan.ts`(`planSyncFinish`) · `lib/events/*`(Publish payload) · `components/logs/event-detail.tsx` · `messages/en.tsx` | #3 결과 (D3·D7) |
| **pull 미리보기** | `lib/publish/read.ts` | #3 (분류를 실행과 맞춘다) |
| **어댑터** | `lib/adapters/ts-dict.ts` | #4 · C (D4) |
| **편집 UI 저장** | `lib/keys/save-key.ts`(`applyKeySave`) · `lib/keys/save.ts`(`planKeySave`) · `components/translations/workspace/workspace.tsx` · `messages/en.tsx` | #2 (D2) |

push와 pull 두 흐름을 건드린다 — `/ship` 스코프 가드에 걸리므로 `/ship bypass`로 태운다(계획 원본 = 이 디렉터리).

## 설계 결정

### D1. #1 — 이번 적재로 **orphan이 된 승인 셀**의 토큰만 비운다

`finishSurface`(`lib/import/run.ts`)에서 `current(...)`가 `check.ok`를 낸 **뒤**, `payload` 갈래의 `applyPushInTransaction` 직후와 `empty` 갈래의 orphan 처리 직후에 **같은 tx**로:

```sql
UPDATE "Translation" AS t SET "pendingEditToken" = NULL
FROM "StringKey" k, "Locale" l
WHERE t."projectId" = $projectId AND t."surfaceId" = $surfaceId
  AND t."pendingEditToken" = ANY($approvedTokens::text[])
  AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
  AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
  AND (k."orphaned" OR l."orphaned")
```

- **"이번 적재로 orphan이 됐다"를 따로 계산하지 않아도 된다** — 승인 집합은 `loadPendingEdits` = `pendingWhere` 기준이라 승인 시점에 이미 orphan인 셀은 들어 있지 않다(`lib/import/approval.ts:14-23`, `where.ts:17-18`). 그래서 지금 orphan인 승인 셀은 전부 이번 적재가 만든 것이다. 뒤집으면: **배포 전 잔존 유령 토큰은 D1이 못 푼다**(T0에서 0 확인).
- **적용 갈래는 "`check.ok` 뒤 `payload`·`empty`"뿐이다.** `superseded`·`lease-lost`는 `run.ts:134-135`에서 먼저 반환되고, `failed` 갈래와 `invalid-format`(finishSurface를 거치지 않는다, :218-220)은 토큰을 안 건드린다. tx 끝에 공통으로 두지 않는다 — 구현자가 그렇게 옮기면 적재 안 된 표면의 편집이 사라진다(POSTMORTEM 2026-09-09 "일회용 허가를 이벤트로 비웠다").
- **빈 값·실패 파일 승인 셀은 그대로다** — 토큰이 남아 `remainingEdits`로 보인다(`lib/import/result.ts:16`). 기존 계약 [C4]·[C10]과 `repository-import.integration.ts:342-351`이 **그대로 green**이다. "전부 해제"안은 리포에 값이 없던 셀의 편집값이 pending 아닌 채 남아 ① 다른 편집의 Publish가 그 값을 PR에 싣고 ② `BACKFILL_CONDITION_SQL`(`lib/protection/backfill.ts:13-18`)에 들어맞아 backfill로 pending이 되살아나는 두 경로를 열어서 기각했다(`/feature-review` CTO).
- **`updatedAt`을 건드리지 않는다** — `acknowledgeDelivered`(`lib/pull/load.ts:195`)와 같은 이유.
- upsert의 `"pendingEditToken" = NULL`(apply.ts:357)과 합치지 않는다 — 그쪽은 CI 경로에도 있다.
- ⚠️ **§5.8의 "확인 등식을 깨는 쓰기"가 넷이 된다.** 적재의 `importRevision` 증가가 그 표면의 확인을 이미 무효화하므로 등식이 드러나 깨지지는 않지만, 목록(ARCHITECTURE:1476)에 D1을 올린다.

### D2. #2 — 수술적 표면의 비-base 비우기를 **저장 단계에서 거부한다**

| 안 | 판정 |
|---|---|
| **(a) 저장 거부** | **채택** — 도달 불가능한 상태를 만들지 않는다. 오늘도 그 비우기는 리포에 한 번도 닿은 적 없다 |
| (b) 셀 단위 전달 제외 | 기각 — 그 셀은 영영 전달될 수 없어(writer가 지울 줄 모른다) CI가 영구 보류된다. #1을 다른 입구로 다시 만든다 |
| (c) 수술적 writer에 삭제 추가 | 비목표 — §1.4 표현 보존 계약 전체를 건드리고, PRODUCT §10 "명시적 빈값 export"의 영역이다 |

- **순수 함수**: `planClearability({ writeStrategy, isBase, value })` → `"ok" | "cannot-clear"`. `value`는 **정규화 뒤** 값이다(`planSave`가 공백만의 입력을 `""`로 접는다 — `lib/keys/save.ts:21-23`, `save-key.integration.ts:113`). 정규화 전 값을 보면 공백으로 우회된다.
- **자리**: `planKeySave`(`lib/keys/save.ts`)의 로케일별 판정에 넣는다 — 이미 "전부 계획한 뒤에만 쓴다"(`save-key.ts:12`)이고 거부에 `localeCodes`를 단다(`too-long` 형, `save.ts:64-67·78-83`). 그래서 **거부 단위는 키 전체**다: ko 수정 + fr 비우기 저장은 ko도 쓰지 않는다. 문구가 그 사실("nothing was saved")을 말한다.
- **입력 배선**: `applyKeySave`가 잠금 뒤 표면에서 `baseLocale`만 읽는다(`save-key.ts:35`) — 같은 select에 `adapterName`을 더하고, `writeStrategy`는 기존 `formatFromProject` → `adapterFor`(`lib/adapters/index.ts:110` — 이름이 아니라 `DetectedFormat`을 받는다)로 얻는다. **판정은 잠금 안이다.**
- ⚠️ **B2(2026-09-24, dev)가 `save-key.ts`의 구조를 고정했다** — `applyKeySave`는 **function 선언**으로 남는다(`app/__tests__/locked-access.test.ts`가 `getFunction("applyKeySave")`로 찾는다), `lockProjectAccess(tx, {…, surfaceId})`가 `$transaction` 콜백의 **첫 문장**이다(raw 잠금을 앞에 다시 넣지 않는다), `KeySaveResult`의 `error: "not-found" | "forbidden" | "archived"` 갈래를 유지한다. D2의 `adapterName` select는 그 헬퍼 **뒤**의 표면 조회에 더한다.
- ⚠️ **`applyPush`(`apply.ts:111`)의 프로덕션 호출자가 0이 됐다**(B2가 `lib/onboarding/ingest.ts`를 `applyPushInTransaction`으로 옮겼다) — 통합 테스트 다섯과 `flow.test`만 쓴다. 테스트 전용 래퍼로 남길지 이 배치에서 판단한다(지우면 그 테스트들을 `applyPushInTransaction` + 명시 tx로 옮긴다).
- ⚠️ **Revert 경로는 이 판정을 지나지 않는다** — `lib/keys/revert.ts:110-114`가 기준값 `""`로 되돌리는 것은 §5.8의 정당한 복원이다(그 셀은 원래 비어 있었다). `planClearability`를 Save·Revert 공유 경로에 넣지 않는다.
- **화면** (CDO): 기존 저장 오류와 같이 **푸터 Alert**(`variant="danger"` — `role="alert"`, `components/ui/alert.tsx:86`)에 선다. 셀 옆 새 패턴을 만들지 않는다 — `translations-screen.test.ts:110-111`이 live 영역을 workspace 하나로 고정한다. 해당 셀 입력에는 `aria-invalid` + `aria-describedby`(Alert id)만 붙인다. 입력은 그대로 남는다(`lib/translations/draft.ts:87-90`, 실패 경로에 `router.refresh()` 없음 — POSTMORTEM 2026-09-08 비재발).
- **문구** (DESIGN §10 — 제목 조각 + 본문 ≤2문장, 화면에 있는 컨트롤만 가리킨다 — POSTMORTEM 2026-09-14):
  - 제목: `{locales} can't be left empty` (예: `fr can't be left empty`)
  - 본문: `This file format can't remove a translation, so nothing was saved. Enter a value, or discard the change.`
  - "revert"를 쓰지 않는다 — `Revert to last sent`는 OWNER 전용이고 pending일 때만 서며 미저장 변경이 있으면 막힌다(`messages/en.tsx:1891·1896·1899`). "discard"는 이 화면이 이미 쓰는 어휘다.

### D3. #3 · C — 전달 불가 셀을 **좌표로 보류**하고, writer 경고를 두 부류로 가른다

**좌표를 렌더 출력에 싣는다.** 지금 `LocalFile`(`lib/pull/plan.ts:226`)에는 locale이 없고 `p.locale`은 `render.ts:98`에서만 쓰인다. `render.ts`가 두 가지를 더 낸다:
- per-locale 파일에 `locale`(렌더 출력 형 변경 — `content`·`path`는 그대로라 트리 페이로드·blob SHA·결정성에 영향 없다).
- ts-dict write의 새 오류 `write-slot-missing`(wanted인데 로케일 객체에 없는 키 — D4)에 그 write 호출의 `locale`을 붙인다(렌더가 호출 locale을 안다, multi-locale 루프 `render.ts:132`).

```ts
// lib/pull/undeliverable.ts (신규, 잎 모듈 — server-only 없음)
type Rendered = { surfaceId: string; baseLocale: string; files: readonly LocalFile[] };   // run.ts:178-181의 인라인 형에 baseLocale을 더한 것
/** 보류 좌표: 로케일 통째(`${surfaceId}\0${locale}`)와 셀(`${surfaceId}\0${locale}\0${key}`) */
export function withheldCoordinates(rendered: readonly Rendered[]): { locales: Set<string>; cells: Set<string> }
/** reject 대상 오류만 — 비-base per-locale `original-file-missing`과 `write-slot-missing`은 뺀다. base 파일 부재는 남긴다 */
export function blockingErrors(rendered: readonly Rendered[]): { surfaceSlug: string; error: AdapterError }[]
/** 캡처한 편집을 실린 것/보류된 것으로 가른다. `cell`이 없는 편집은 보수적으로 보류 쪽이다(운영 로더는 늘 채운다 — load.ts:117-118) */
export function splitEdits(edits: readonly PendingEdit[], withheld: …, keyOf: (keyId: string) => string | undefined): { delivered: PendingEdit[]; withheld: PendingEdit[] }
```

- `blockingErrors`는 문자열로 접힌 `warnings`(`run.ts:183`)가 아니라 `rendered[].files[].errors`를 받는다. 문자열 조립은 그 뒤에 그대로 한다.
- **base 파일 부재는 blocking이다** (사용자 결정 D) — 사실상 경로 이동·설정 오류이고, 보류로 넘기면 전 셀이 빠져 결과가 "보낼 것 없음"으로 문제를 가린다. `trigger.test.ts:83-115`(빈 트리 + `en.yml` 부재 → writer-warnings + `console.warn`)는 **그대로 green**이다.
- `keyOf`: `PendingEdit.cell`에는 `keyId`만 있고 `write-slot-missing`에는 `key`만 있다. `PullState.surfaces[].keys`(`RenderKey`)에 id가 없으면 `loadState`가 싣는다 — T3에서 확인한다.
- `run.ts` 변경:
  - `planProtectedPublish({ pending, writerWarnings: blockingErrors(rendered).length })` — `planProtectedPublish` 자체는 바뀌지 않는다.
  - `saveLastPulledAt(..., delivered, contexts, withheld)` — `committed`·`no-changes` 두 호출 모두. **`deliveryContexts`는 좁히지 않는다.**
  - **1층은 그대로다** — `unpublished`는 전체 pending 수. 보류 셀이 남으면 매 Publish·매 밤 트리를 읽는다(§3 T10이 감수한 "지속 상태 경고" 비용과 같다).
- **`confirmDelivery`(`lib/pull/load.ts:215`) — 보류 셀의 기준을 새 revision으로 다시 찍는다** (사용자 결정 Revert):
  - 표면 확인은 지금처럼 쓴다. 좁히면 그 표면의 확인이 무효로 남아 표면 안 **모든** 키의 Revert가 `baseline-stale`이 되고 새 Save도 기준을 기록하지 않는다(`lib/translations/baseline.ts:86-97` · `load.ts:136-141`의 프로젝트 전체 무효화). "좁히지 않으면 Sent로 보인다"는 우려는 사실이 아니다 — `DeliveryConfirmation`을 읽는 곳은 `lib/keys/delivery.ts:20`(Save·Revert)뿐이고 "Not sent" 표시는 전부 토큰으로 판정한다(`lib/keys/query.ts:134`, `translation-list.ts:156,274`).
  - 새 revision을 쓴 뒤, **보류 셀 중 기준 행이 이미 있는 셀**의 `revision`만 그 표면의 새 revision으로 갱신한다(`restoreValue` 불변). 기준 행이 없는 보류 셀은 만들지 않는다(그 셀은 원래 unknown이다).
  - 확인 등식("미전달이 아닌 셀은 export 값 = 기준", §5.8:1476)은 pending 셀에 걸리지 않으므로 보류 셀이 등식을 깨지 않는다.
- **결과 형** — 지금 `no-changes`는 `{ status: "skipped"; reason: "no-edits" | "no-changes" }` 한 변형이다(`run.ts:94`). 쪼갠다:
  - `{ status: "skipped"; reason: "no-edits" }`
  - `{ status: "skipped"; reason: "no-changes"; withheld?: number }`
  - `{ status: "skipped"; reason: "withheld"; withheld: number }` — **실린 셀 0 + 보류 > 0**. 파일 변경이 있었더라도 실린 편집이 0이면 이 갈래다(→ D7).
  - `committed`에 `delivered: number`(전달 확인한 편집 수)와 `withheld?: number`.
  - `withheld`는 **경고가 아니라 수**다 — T10이 막은 것은 "버린 값의 토큰을 성공으로 비우는 것"이었고 이 설계는 토큰을 안 비운다.
- **미리보기 정렬**: `lib/publish/read.ts:64-66`의 `withoutFile` 판정(per-locale + surgical + base에 경로 없음)이 실행 쪽과 같은 조건이다. 단 미리보기는 `PREVIEW_LIMIT`(200, `read.ts:23` · `diff.ts:8`) 안의 행만 센다 — **200행 이하에서만 두 수가 같다.** 그 경계를 §5.6.35에 적는다("상한을 넘으면 `truncated`와 같이 읽힌다"). 판정 함수는 합치지 않는다(입력 형이 행 단위 vs 렌더 출력 단위). ⚠️ 미리보기는 base 파일 부재도 `withoutFile`로 센다면 실행(blocking)과 갈린다 → T4가 그 경우를 확인하고, 갈리면 미리보기를 blocking 표시로 맞춘다.

### D4. #4 · C — ts-dict write의 보고를 `wanted`로 맞춘다

- **과보고 제거(#4)**: `pairs()`(`ts-dict.ts:57-73`)가 모든 프로퍼티의 비리터럴을 `errors`에 넣는다. `write`에서는 **wanted에 든 키의 비리터럴**만 보고한다(write 쪽에서 거른다 — `pairs` 시그니처는 read와 공유라 그대로 둔다). `read`는 지금대로 전부 보고한다(적재 시 정보).
- **과소보고 제거(C)**: wanted인데 로케일 객체에 없는 키를 `write-slot-missing`(code-dict·yaml이 쓰는 기존 코드)으로 보고한다. 삽입은 하지 않는다(ARCHITECTURE:328·348이 ts-dict 삽입을 예외로 둔 것은 유지 — 보고까지 면제한 근거는 없었다). 이 오류는 D3에서 **셀 보류**로 분류된다.
- `content`는 바뀌지 않는다 — `contract.ts:326-330`과 `ts-dict.test.ts:162`(read→write 동일성)가 이미 막는다.

### D5. #58 — 비-base 셀은 **이번 페이로드의 base 키 집합**으로 거른다

`applyWith`의 `translations` 필터(`apply.ts:310-316`)에 `payloadKeys.has(t.key)`를 더한다(`payloadKeys = new Set(payload.keys.map(k => k.key))`). `:312` 주석을 참말로 고친다("이번 push의 base 파일에 없는 키 — 기존 orphan 포함 — 의 셀은 적재하지 않는다"). `idByKey`는 refs 매핑에도 쓰이므로 그대로 두고, refs가 orphan 키를 받는 것이 계약인지 T5에서 확인한다.

### D6. #59 — 재탐지 로케일에 **다운로드 실패·재시도 성공 로케일**을 되살린다

원인은 "재탐지 입력이 첫 다운로드분뿐"이다 — `planConfirmedFormat`(`lib/import/surface.ts:34`)이 성공한 파일로만 `detected.locales`를 만들고, 재시도(:43-45)는 `blobs`만 채운다. 그 `format.locales`가 `payload.locales`가 된다(`lib/push/payload.ts:131`).
- **순수 함수**: `localesToKeep({ format, attempted, blobs })` → 재시도 **뒤** `blobs` 기준으로, 템플릿 경로(`attempted`)에서 나온 로케일을 전부 남긴다. 읽힌 로케일은 적재되고, 끝내 못 읽은 로케일은 번역 없이 목록에만 남아 orphan되지 않는다. 경로→로케일은 기존 `templatePaths`(`lib/onboarding/confirm.ts:22`)·`resolveLocalePaths`(`lib/pull/plan.ts:112`)를 재사용한다.
- **자리**: surface.ts:45(재시도 뒤)에서 `confirmed.format`의 `locales`를 이 결과로 바꾼다. `partial-import` 판정은 지금대로(끝내 못 읽은 파일이 있으면).
- CI 경로(`scripts/push-local.ts`·Action)는 대상이 아니다 — 거기서는 못 읽으면 `/api/push/failure`로 가고 적재가 안 된다.

### D7. 결과 화면·기록 — 실린 수로 말하고, 보류는 한 줄

- **Publish 결과**(`lib/publish/plan.ts` `planPublishView` → `components/publish-button.tsx`):
  - 변경 수는 서버가 준 `delivered`를 쓴다 — 지금 `total = result?.total ?? count`(publish-button.tsx:416)는 미리보기 `preview.total`(:70 — `withoutFile`을 안 뺀 미발송 전체)이라 "3 changes are in a pull request" 아래 "1 wasn't sent"가 서는 모순이 된다(CDO).
  - `withheld > 0`이면 기존 `Hint`·`withoutFile`과 같은 `text-xs muted` 형(:282)의 한 줄. 새 raw 색·블록 없음. 결과 패널 높이(DESIGN §6.646 "갈래마다 고정", `PANEL.created` 420~460)는 미실측 — DESIGN §6.646에 "withheld 줄(미실측)"을 등재한다.
  - `skipped/withheld`(실린 0)는 **기존 Not sent 틀**(publish-button.tsx:444)을 쓴다 — "No changes" + CircleCheck + "the two came out identical"(en.tsx:2093·2095)이 거짓이 되기 때문이다. 새 갈래 틀은 만들지 않는다(DESIGN §6.646).
  - `no-changes` + `withheld > 0`(실린 셀도 있었는데 렌더가 base와 같았다)은 `noChangesDescription`에 보류 한 줄을 더한다.
- **문구** — 미리보기(en.tsx:2024-2025)와 **같은 명사·같은 약속**을 쓴다:
  - 공통: `{n} edits weren't sent because the language file isn't in the repository. They stay here until the file exists.`
  - 역할 갈림(`PublishModal`이 `role`을 받는다, :342 — `askOwner`가 EDITOR 갈래인 선례, en.tsx:1234): EDITOR `Ask a project owner.` / OWNER `Add the file to the repository, or use Revert to last sent.`
  - ts-dict 셀 보류(C)는 "the language file" 대신 `their keys aren't in the language file yet`.
- **기록**: Publish 사건(`ProjectEvent`, 야간 cron도 같은 경로 — `lib/sync/run.ts`)의 payload에 `withheld`를 싣고, Logs 상세(`components/logs/event-detail.tsx`)에 한 줄. `lib/events/payload.ts`의 `readPayload`가 새 필드를 `Object.hasOwn`으로 읽는다(옛 사건은 필드 없음 = 0).

## 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치 | 항목 |
|---|---|---|
| `withheldCoordinates` · `blockingErrors` · `splitEdits` | `lib/pull/undeliverable.ts` (신규) | #3 · C |
| `renderLocaleFiles`의 `locale`·오류 locale 태깅 | `lib/pull/render.ts` | #3 · C |
| ts-dict `writeWithErrors` | `lib/adapters/ts-dict.ts` | #4 · C |
| `planClearability` + `planKeySave` 편입 | `lib/keys/save.ts` | #2 |
| `localesToKeep` | `lib/import/` (surface.ts 옆) | #59 |
| `planPublishView`(delivered·withheld 갈래) | `lib/publish/plan.ts` | 결과 |
| `planSyncFinish`(withheld 전달) · `readPayload`(새 필드) | `lib/sync/plan.ts` · `lib/events/payload.ts` | 기록 |

I/O 껍데기(postgres로만 검증): D1 UPDATE · D5 필터 · `confirmDelivery`의 기준 재갱신 · `run.ts`/`load.ts`/`save-key.ts` 배선.

## 스키마 변경

**없음.** 토큰·기준·확인 컬럼은 전부 기존 것이고, 사건 payload는 JSON이다.

## 새 환경변수

**없음.**

## 불변식 영향

- **§0 불변식 1**: 보호 판정 입력은 그대로 **count 하나**다. D1·D5는 "토큰이 남아야 할 셀에만 남는가"를 고치고, 리포 값·DB 값을 견주는 입력이 새로 생기지 않는다. ✅ 병합 아님. D3의 보류 좌표는 "원본 파일이 트리에 있는가"(`render.ts:107`의 기존 판정)와 "그 키의 자리가 파일에 있는가"에서 나온다 — 값을 보지 않는다.
- **§0 불변식 9**: D3·D4는 **강화**다 — 실린 셀만 확인하고, 안 실린 셀은 토큰을 남긴다. D2는 "보낸 적 없는 비우기"가 애초에 저장되지 않게 한다.
- **export 결정성·blob SHA·커밋 전략(§1·2·3)**: 렌더 `content`·트리 페이로드는 **바뀌지 않는다.** `LocalFile`에 `locale`이 붙고 오류가 늘 뿐이다. ✅
- **§5.8 기준·확인**: 표면 확인을 좁히지 않고 보류 셀의 기준만 재갱신 — Revert 계약을 지킨다. D1이 확인 등식을 깨는 넷째 쓰기가 된다(ARCHITECTURE:1476에 등재).
- **인증 경계(§6)**: 없음.
- 정본 갱신(`/push` 4단계): ARCHITECTURE §0-1·§0-9 · **§3 T10 문단**(비-base 파일 부재·ts-dict 빈 자리는 보류, base 부재는 reject) · **§5.5.2**(D1 · D5 · D2) · **§5.6.35**(실행과 같은 판정, 200행 경계) · **§5.8**(보류 셀 기준 재갱신, 등식을 깨는 쓰기 넷) · `apply.ts:133` 주석(#61) · PRODUCT **§3**(편집 규칙 — 임시 규칙으로) · **§7.6**(결과 상태) · DESIGN §6.646(withheld 줄).

## 과거 함정 (POSTMORTEM)

- **2026-09-14 "조건 불일치 0행은 조용하다"** — D1 UPDATE도 0행이면 조용하다. 해제 수를 **N > 0**으로 단언하고, 남아야 할 토큰도 N > 0으로 짝 단언한다.
- **2026-09-09 "일회용 허가를 이벤트로 비웠다"** — D1의 술어는 "승인 Sync가 돌았다"가 아니라 "**이 표면의 적재가 확정됐고 그 셀이 orphan이 됐다**"다.
- **2026-09-18 T10 반전** — 경고를 성공 결과에 싣지 않는 규칙은 유지한다. `withheld`·`delivered`는 수이고 토큰을 비우지 않는다.
- **2026-09-17 "같은 pending이 화면마다 다르게"** — 미리보기 `withoutFile` · 결과 `withheld` · Logs 상세가 같은 수여야 한다. T4·T7이 그 그물이다.
- **2026-09-14 "거부 문구가 화면에 없는 버튼 이름을 가리켰다"** — D2·D7 문구는 역할별로 화면에 있는 컨트롤만 가리킨다.
- **2026-09-02 "writeStrategy 분기를 하나 고치면 전부 찾는다"** — D2·D3이 `writeStrategy`를 새로 읽는다. `layout`으로 판정하지 않는다(단 D3의 좌표 방식 자체는 per-locale/multi-locale로 갈린다 — 그것은 "원본이 필요한가"가 아니라 "좌표가 무엇인가"의 질문이다).
- **2026-09-03 "이름만 정확한 테스트"** — `sync-edit-protection.integration.ts:138-148`(C4)은 `applyPush` 층 테스트라 D1 뒤에도 green이지만 이름("실패 파일은 토큰 유지")은 이제 "`applyPush`는 페이로드 밖 토큰을 안 건드린다"가 정확하다 — 이름을 그 층의 사실로 고친다.
