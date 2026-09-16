# publish-modal — design

## 1. 영향 받는 흐름

**편집 UI만이다.** push · pull의 판정은 **한 줄도 안 바뀐다** — `runPull`의 1층 스킵 · 2층 blob
비교 · `captured` · `updateRefForce`가 전부 그대로다. 바뀌는 것은 그 **바깥**이다:

| 층 | 무엇이 바뀌나 |
|---|---|
| `lib/pull/message.ts` | `PullOutcome`의 failed 변형이 **코드와 재시도 가능 여부를 싣는다** · `pullMessage`의 계약이 tone+text에서 **갈래 이름**으로 |
| `lib/sync/run.ts` | `failureOutcome`이 `classifySyncError`의 결과를 **버리지 않고 싣는다** |
| 신규 `lib/publish/*` | diff 목록의 순수 조립 · 갈래 판정 |
| 신규 read Action 하나 | 미발송 diff 목록 + **열린 PR**을 한 번에 돌려준다 (`translation:write`) |
| `components/publish-button.tsx` | `PublishResult`(Alert)가 **모달**로 바뀐다 |
| `components/translations/header.tsx` · `components/home/actions.tsx` | 결과 슬롯이 사라지고 모달의 **마운트 자리**가 그 자리를 잇는다 |
| `components/onboarding/modal.tsx` | 껍데기를 온보딩 밖에서 쓸 수 있게 **일반화** |

**리포에 쓰는 동작은 늘지 않는다** — 이 앱이 하는 최종 액션은 지금도 앞으로도 PR 생성 하나다.

## 2. 상태 계약 — 실행 결과와 모달 상태를 분리

✅ **실행 결과 판정은 8갈래, 모달 상태는 별도 계약이다** (2026-09-16 리뷰 7번 확정).
`planPublishView(outcome)`은 `PullOutcome` 하나만 받는다. 게이트 거부도 이미 이 타입의
failed 변형에 들어 있으므로 별도 `gate` 인자를 받지 않는다. 클라이언트가 만든 응답 유실
outcome도 같은 함수로 처리한다(§2.2).

**모달 본문 상태(`PublishModalState`)**

| 상태 | 화면 | 필요한 값 |
|---|---|---|
| `preview-loading` | `1a`의 스켈레톤 | 조회 중이며 실행 버튼 없음 |
| `preview-ready` | `1a` | 조회에 성공한 `PublishPreview` |
| `preview-error` | `1k` | 목록 조회 실패 표시 |
| `running` | `1c` | 실행 중 표시 |
| `result` | `1d`~`1j` | 완료한 `PullOutcome`을 `planPublishView`로 판정 |

`open`은 이 상태와 분리한다. 닫기는 표시만 끄며 실행과 마지막 결과를 지우지 않는다(§6).
`1b`는 모달 본문 상태가 아니라 `planPublishButton`의 수 0 판정이다. 따라서 아트보드 번호
`1a`~`1k`를 결과 함수의 discriminant 열한 개로 만들지 않는다.

**조회·재시도 전이 — 매번 새 목록으로 확인** (2026-09-16 리뷰 8번 확정)

- 새 `[Publish]`와 닫았던 미리보기 재열기는 항상 `preview-loading`으로 시작해
  `loadPublishPreview`를 새로 호출한다. `1i`·`1k`의 `Try again`도 같은 경로다.
  `1i`의 재시도는 `triggerPullAction`을 직접 호출하지 않는다.
- 새 조회를 시작하면 이전 preview와 실행 가능 상태를 즉시 비운다. 최신 조회 성공만
  `preview-ready`, 실패는 `preview-error`로 전이한다. 로딩·실패에는 발송 버튼이 없으며
  핸들러도 현재 조회가 `preview-ready`인지 검사한다.
- 조회마다 요청 세대를 구분한다. 미리보기 닫기·새 조회·호스트 변경/언마운트에서 이전
  세대를 무효화하며, 늦게 온 성공과 실패 모두 화면·실행 가능 상태를 바꾸지 못한다.
  이 무효화는 **미리보기 조회에만** 적용한다. 실행 중 모달 닫기는 진행 요청을 무효화하거나
  마지막 실행 결과를 버리지 않는다(§6).
- `preview-ready`의 확인 버튼만 새 발송을 1회 시작한다. 실행을 시작하면 그 preview의
  확인 권한을 소비하고 `running`으로 전이한다. 다음 재시도는 다시 조회·확인을 거친다.
- `Publishing…`는 기존 `running`을, `View result`는 보관된 `result`를 다시 보여준다.
  이 둘은 새 발송 진입이 아니므로 preview 조회·발송을 다시 호출하지 않는다.

이 규칙은 **실행마다 조회·확인을 거친다**는 계약이며, 조회 이후 DB가 바뀌지 않는다는
보장은 아니다. 조회와 실행 사이 다른 발송으로 생기는 `no-edits`는 §2.1대로 처리한다.

**실행 결과(`PublishView`) — 다음 8갈래만 반환한다**

`created` · `updated` · `partial` · `no-changes` · `config-error` · `transient-error` ·
`already-running` · `too-soon`. 경고 목록·PR 종류·실패의 `delivery` 등 본문에 필요한 값은
원본 outcome에서 보존한다. 특히 `no-changes`는 `no-edits`도 포함하는 화면 이름이며,
경고가 있는 스킵의 `1g` 블록도 유지한다. 이 이름이 서버의 스킵 사유를 바꾸지는 않는다.

**실행 결과 → 화면 대응**

| # | 입력 (관측 자리) | 값 |
|---|---|---|
| `1d` | `PullResult` | `committed` · `pr: "created"` · `warnings` 없음 |
| `1e` | `PullResult` | `committed` · `pr: "updated"` · `warnings` 없음 |
| `1f` | `PullResult` | `skipped` · `reason: "no-edits"` 또는 `"no-changes"` · `warnings` 없음 |
| `1f`+`1g`블록 | `PullResult` | `skipped` · `reason: "no-changes"` · `warnings > 0` |
| `1g` | `PullResult` | `committed` · `warnings > 0` (**`pr` 둘 다**) |
| `1h` | `PullOutcome` failed | `retryable === false` → `base-unreadable` · `not-installed` · `glob-matched-nothing` |
| `1i` | `PullOutcome` failed | `retryable === true` → `github-error` · `db-unavailable` · `unknown` |
| `1j`좌 | `PullOutcome` failed | `error: "already-running"` (행이 안 생긴다) |
| `1j`우 | `PullOutcome` failed | `error: "too-soon"` + `retryAfterSeconds` |
| `1h`/`1i` | `PullOutcome` failed | **인가·준비 거부** — `unavailable`은 `1i`, 나머지(`unauthorized` · `not-found` · `archived` · `not-ready` · `invalid input`)는 `1h` (§2.2) |

실패의 `1h`/`1i` 선택은 `retryable`로 유지하되, **전송 여부 안내는 별도 `delivery` 값**으로
정한다. 실행 전 명시적 거부는 `not-started`, 실행 중 오류·응답 유실은 `unknown`이다(§2.2).

`stale`는 `runSync`가 이전 RUNNING 행을 정리할 때 기록하는 Logs 코드다. 현재 요청은 새
실행을 시작하므로 그 요청의 결과가 `stale`인 것은 아니다. 코드 전수 매핑을 위해 합성
`stale` 입력을 `1i`로 처리하는 테스트는 가능하지만 실제 도달 경로와 구별한다(리뷰 9번).

### 2.1 `no-edits`와 `no-changes`는 모두 `1f`

버튼의 수는 `countUnpublished`이고 조건이 `updatedBy IS NOT NULL` **AND** `surface.archivedAt IS NULL`
**AND** `updatedAt > lastPulledAt`이다(`lib/keys/query.ts:177`).
1층 스킵은 `max(updatedAt)` **전체**를 본다 — `updatedBy`도, 보관 표면도 안 가린다(`lib/pull/load.ts:65`).

**동일한 DB 시점**에서는 1층의 집합이 `countUnpublished`의 상위 집합이므로, 미발송 수가
양수면 1층이 스킵하지 않는다. 하지만 **미리보기와 실행은 같은 시점이 아니다**. `1a`를 읽는
동안 다른 사용자나 cron이 발송하고 쿨다운까지 지난 뒤 실행하면, 새 `lastPulledAt`을 읽은
`runPull`은 `no-edits`를 반환할 수 있다. 미리보기의 수로 실행 결과를 제한하지 않는다.

✅ **둘 다 보낼 값이 없으므로 `1f`로 표시한다** (2026-09-16 리뷰 2번 확정).
`no-edits`는 마지막 발송 이후 새 편집이 없는 경우, `no-changes`는 렌더한 파일이 base와 같은
경우다. 화면은 둘 다 `No changes to send.`이고, 내부 스킵 이유를 사용자에게 구별하지 않는다.
`no-changes`에 경고가 있으면 기존대로 `1g` 경고 블록을 함께 표시한다.

검증은 두 층이다: 결과 매핑 테스트가 두 이유를 `1f`로 고정하고, 두 소비자의 DOM 테스트가
미리보기 양수 → 다른 발송 완료 → 쿨다운 경과 → 확인 실행 → `no-edits` 응답의 시간차를
재현한다. refresh로 미발송 수가 0이 돼도 이미 열린 `1f` 결과는 남는다.

### 2.2 ⚠️ 캔버스에 없는 갈래가 하나 있다 (결정 필요)

`triggerPullAction`은 `runSync`에 닿기 전에 **여섯 사유로 거부**한다 —
`invalid input` · `unavailable` · `unauthorized` · 인가 상태(`not-found` · `archived` …) · `not-ready`.
이들은 `classifySyncError`를 **지나지 않으므로** `SyncErrorCode`도 `retryable`도 없다.
지금은 `pullMessage`가 `accessErrorMessage`·`onboardErrorMessage`로 문장만 내고 tone은 `danger`다.

캔버스는 `1h`(고쳐야 한다) · `1i`(다시 하면 된다) 둘만 그렸다. **판정이 없으면 이 갈래가 갈 곳이
없다.**

✅ **확정** (2026-09-16 사용자): `retryable`을 **이 여섯에도 부여한다** — `unavailable`만
`true`(→`1i`), 나머지는 `false`(→`1h`)다. 가르는 기준이 **"사람이 다시 해서 통하나"** 하나로
유지된다 — 권한·보관·미준비는 상태가 바뀜어야 풀리고, 그때 재시도 버튼은 거짓말이다.

✅ **`1h`는 하나의 틀이고 제목·본문·바닥 버튼이 사유에서 온다** (2026-09-16 사용자).
`1i`가 이미 그 형이다 — *"사람이 할 일이 같으면 화면도 같다: 제목 한 줄과 `Reference`만 갈린다."*
그렇게 안 하면 **제목이 거짓이 된다** — 세션이 끝난 사람에게 `Couldn't reach the repository`를
말하고 누를 수 없는 [Open project settings]를 넣게 된다.

| 사유 | 제목 | 본문 | 바닥 버튼 | 사실 표 · `Reference` |
|---|---|---|---|---|
| `SYNC_ERROR_CODES` 셋 | `Couldn't reach the repository` | 시안 그대로 | `Open project settings` | **선다** |
| `unauthorized` | 세션 문구 (`m.translations.errors.sessionEnded` 계열) | 같은 사전 | `Sign in` | 없다 |
| `not-found` · `archived` | `accessErrorMessage` | 같은 문장 | 없다 | 없다 |
| `not-ready` | `onboardErrorMessage` | 같은 문장 | 없다 | 없다 |
| `invalid input` | `accessErrorMessage`의 폴백 | — | 없다 | 없다 |

⚠️ **리뷰 5번은 보류다**: 역할별 버튼 분기는 추가하지 않는다. 위 설정 버튼을 공통 전달
안내로 바꾸는 대안은 아직 미확정이며, EDITOR에게 설정 접근권이 있다는 뜻으로 읽지 않는다.

**실행 전 명시적 거부 여섯이 공유하는 것**: danger `Alert` 규격 · 밑바닥
`Nothing was sent. Your edits are safe.`. 이 경로는 `delivery: "not-started"`이며 실행 행이 없다.
`Reference`와 "it is in Logs too"도 함께 뺀다.

✅ **실행 중 오류·응답 유실은 전송 여부를 단정하지 않는다** (2026-09-16 리뷰 1번 확정).
`runPull`은 브랜치 갱신·PR 작성 **뒤에** `saveLastPulledAt`을 호출하고, `runSync`의 종료 기록도
그 뒤다. 이 DB 쓰기가 실패하거나 응답이 유실되면 리포에는 이미 반영됐을 수 있다.

- `failureOutcome`이 반환하는 실행 중 실패는 `delivery: "unknown"`이다. 오류 코드나
  `retryable`만으로 미전송을 추론하지 않는다.
- 클라이언트의 Action reject도 `error: "unavailable", retryable: true, delivery: "unknown"`으로
  구분한다. 서버가 실행 전에 반환한 `unavailable`과 같은 의미로 접지 않는다.
- `unknown`은 기존 `1h`/`1i` 안에서 `We couldn't confirm whether your changes were sent.`를
  표시한다. `Nothing was sent`와 편집 안전 단정은 사용하지 않는다.
- 응답 유실에는 오류 코드·Reference를 만들어 붙이지 않는다. Logs에 기록됐다고도 단정하지
  않는다. 반환받은 Reference는 표시할 수 있지만 오류 코드가 있다는 것만으로 기록 성공을
  보장하지 않는다.

### 2.3 `1g`가 `created`/`updated`를 삼킨다 (결정할 값)

`committed` + `warnings > 0`은 `pr`이 둘 다 올 수 있는데 캔버스의 `1g`는 PR 줄을 **축약형** 하나로
그렸다. `1e`가 존재하는 근거(**PR이 든 수가 이번 실행의 수가 아니다**)는 `warnings`가 있어도 그대로
참이다 — 즉 `1g` + `updated`에서 "얹은 것이 아니라 바꿨다"가 **사라진다.**

✅ **확정: `1e`의 무색 경고 블록을 `1g`에서 그대로 재사용한다** (2026-09-16 사용자).
규칙은 한 줄이다 — **`pr === "updated"`면 그 블록은 항상 선다.** 조건이 `warnings`가 아니라
`pr` 하나이므로 예외를 기억할 것이 없고, 무색이라 `Not written` 목록과 급이 안 섮이며,
문구도 안 늘어난다. 이 규칙은 새 결과 갈래를 추가하지 않는다.

## 3. 순수 함수로 분리 가능한 부분 — `/tdd` 진입점

| 함수 | 입력 → 출력 | 어디에 |
|---|---|---|
| `planPublishView(outcome)` | `PullOutcome` → **실행 결과 8갈래 `PublishView`** (§2). 조회·진행·버튼 상태는 입력도 출력도 아니다 | `lib/pull/message.ts` (또는 신규 `lib/publish/view.ts`) |
| `buildPublishDiff(rows, base)` | 셀 배열 + 리포 측 값 맵 → **파일 그룹 → 키 → 로케일 행** + 키 병합 플래그 + 상한 초과 수 | 신규 `lib/publish/diff.ts` |
| `summarizeWarnings(warnings)` | `["surface: path: message", …]` → 파일별 묶음 + 줄 수 | 신규 `lib/publish/warnings.ts` |
| `planPublishButton({ count, paused, otherPending, publishPending })` | → `{ mode, disabled, badge, hint }`. `mode`는 `preview` 또는 `progress`이며, 진행 중이면 클릭 가능한 `progress`가 우선한다 | 신규 · 두 자리가 같은 판정을 쓴다 |
| `planPublishConfirm({ openPr })` | `OpenImportPr` → `1a`의 열린 PR 줄 판정(있다 · 없다 · 미확인) | `lib/import/confirm.ts`의 `planImportConfirmation` **옆**에 둔다 — 같은 삼상태를 두 화면이 다르게 접으면 안 된다 |

⚠️ **`planPublishView`가 `never` 검사를 잃지 않는다.** 지금 `pullMessage`의 exhaustive `switch`가
"상태를 추가하면 컴파일 에러"를 보장하는 유일한 장치다 — 갈래 이름을 내는 함수도 같은 `switch`
위에 서야 하고, 문구를 화면으로 내리는 것이 그 장치를 없애는 구실이 되면 안 된다.

`PublishModalState` 렌더도 별도 exhaustive switch로 검사한다. 결과 매핑 테스트는
`PullOutcome` → `PublishView` 8갈래를 고정하고, 모달 DOM 테스트는 조회 중 → 성공/실패,
확인 → 실행 중 → 결과, 닫기·재열기 전이를 검사한다. 결과 테스트에 클라이언트 상태를
억지로 넣거나 모달 전이 테스트를 결과 매핑 테스트로 대신하지 않는다.

⚠️ **`buildPublishDiff`에 I/O가 없다.** GitHub 왕복·DB 조회는 Action 껍데기가 하고, 이 함수는
**맵 둘을 받아 표를 만든다.** 여기가 비면 diff 목록 전체가 테스트 불가가 된다.

## 4. 필요한 데이터와 계약 — 새 read Action은 하나

### 4-1. 미발송 diff read Action 🔴 (새 발송의 선행 조건)

⚠️ **`1a`는 우회 없는 필수 관문이다** (2026-09-16 사용자) — `[Publish]`가 언제나 이 목록을 먼저
보이고, "바로 보내기" 경로는 없다. 그래서 이 Action은 **보조 화면의 재료가 아니라 동작의 전제**다.

`1a`가 요구하는 것: 셀 단위(`keyId` × `localeCode`) · **이전 값** · 현재 값 · `updatedBy` ·
`updatedAt` · 표면/파일 경로. 지금 `countUnpublished`는 **수만** 준다.

**결정할 값 셋:**

1. **이전 값(리포 측 값)을 어디서 얻는가.** DB에 없다. base 트리를 읽어야 하고, 그러면
   **모달 열기가 GitHub 호출**이 된다 — `lib/pull/run.ts`의 경로 그대로면 트리 1회 + 파일 수만큼의
   blob(8 병렬)이다. ⚠️ `ARCHITECTURE §1.95`의 실측(24키 프로젝트도 3.29초 · 병목이 행 수가 아니라
   **함수 리전**)이 이 비용을 이미 경고한다.
   - **값이 싼 대안**: before/after를 포기하고 **"나갈 값"만** 보인다 → GitHub 왕복 0.
     대가는 `1a`의 "바뀐 단어만 칠한다"가 **통째로 없어지는 것**이다. ⚠️ **열은 여전히 셋이다**
     (Key · Locale · Value) — 줄어드는 것은 Value 칸이 요구하는 **폭**(두 값 → 한 값)이고,
     그래서 736의 근거(§5)가 약해진다.
   - ⚠️ **어느 쪽을 골라도 목록은 근사다.** 실제 판정은 2층 blob SHA 비교라, 목록에 다섯 줄이 뜨고도
     결과가 `1f`(파일이 같았다)일 수 있다. 비싼 쪽은 그 거리가 짧고, 싼 쪽은 **파일이 바뀌는지조차
     말하지 않는다.**
   - ⚠️ **비싼 쪽은 갈래를 하나 늘린다** — base 트리 조회가 실패했을 때의 `1a`다. 캔버스에 없는
     아트보드이고, `1a`가 **필수 관문**이 되면서 이 갈래의 무게가 커졌다: 목록을 못 읽었을 때
     Publish를 막을지 말지가 곧 **"확인 없이 보낼 수 있는가"**다 → §4-1a.
   - ✅ **확정: 비싼 쪽이다** (2026-09-16 사용자). 근거는 비용이 아니라 **답하는 질문**이다 —
     `1a`가 답할 것은 "내가 무엇을 보내는가"가 아니라 **"내가 무엇을 덮는가"**다. `1a`가 존재하는 진짜 근거가 "**열려 있는 PR을 덮어쓴다**"이고
     그 판단에는 "무엇이 달라지는가"가 필요하다. 다만 **모달 열기와 목록 도착을 분리**한다 —
     모달은 즉시 열리고 표 자리는 스켈레톤이다(핸드오프 §8이 이미 그렇게 정했다).
   - ⚠️ **이 Action은 값을 고르지 않는다.** 리포 값과 DB 값을 **나란히 보이기만** 한다 —
     둘을 견줘 하나를 택하는 코드가 생기는 순간 코어 원칙(병합 없음)이 깨진다. 표의 "before"는
     **표시 전용이고 어떤 판정에도 입력이 아니다**를 주석으로 못 박는다.
2. **상한.** 수백 건일 때 몇 행까지 보내는가. 화면이 초과를 말하는 문장이 필요하다.
   ⚠️ 903키 프로젝트가 실물로 존재한다 — 상한 없이 내면 RSC 페이로드가 번역 값 전체를 든다.
3. **파일 그룹의 정본이 표면인가 경로인가.** `warnings`가 `${surfaceSlug}: ${path}:`로 **둘 다**
   드므로 `1g`와 `1a`가 같은 축을 써야 표 둘이 같은 순서로 읽힌다.

**없으면 지우는 자리**: `1a` 전체. 그래서 기능이 통째로 멈춘다 — `1a`가 필수 관문이므로
이 Action이 없으면 **Publish 자체에 들어갈 문이 없다.**

### 4-1a. 목록을 못 읽었을 때 — **막는다** (`1k`)

base 트리 조회는 실패할 수 있다(설치 취소 · 브랜치 부재 · GitHub 장애 · 타임아웃).
`1a`가 필수 관문이라 이 순간의 판정이 곧 **"확인 없이 보낼 수 있는가"**다.

✅ **확정: 막는다** (2026-09-16 사용자). 모달은 열리고 표 자리가 실패를 말하며 **보내기 버튼이
서지 않는다.** 근거 둘:

1. **"무조건 diff 확인하고 publish"가 규칙이면 확인할 수 없는 순간은 그 규칙이 미치지 않는
   순간이 아니다** — 예외를 두면 규칙이 "보통은"이 된다.
2. **같은 조회가 `runPull` 안에서 또 돈다.** `getRefSha(heads/${baseBranch})`가 `null`이면
   `base-unreadable`로 던진다(`lib/pull/run.ts`) — 지금 못 읽었으면 **보내도 `1h`로 죽을 확률이
   높다.** 막는 것이 헛걸음을 줄인다.

⚠️ **실패로 말하지 않는다** — 보낼 수 있었는데 안 보낸 것이 아니라 **아직 읽지 못한 것**이다.
`1h`의 문구를 그대로 쓰면 "Nothing was sent"가 사실이긴 해도 **끝난 일**처럼 읽힌다.

| 자리 | 값 |
|---|---|
| 제목 | `Couldn't read what would go out` (신규) |
| 본문 | **무색 블록** — `1e`·`1f`와 같은 급(`border #e5e5e5` · `bg #fff` · 글리프 `#737373`). danger가 아니다 |
| 바닥 보조문 | `Nothing was sent. Your edits are safe.` — 실행 전 거부와 같은 문장이다. 미리보기 조회는 쓰기를 하지 않는다 |
| 버튼 | `Try again` **하나**. 보내기 버튼 없음 |

`Try again`은 새 preview 조회만 시작한다. 목록이 도착한 뒤 `1a`에서 다시 확인해야 발송된다.

⚠️ **아트보드 번호를 `1k`로 둔다** — 캔버스에 없는 화면이고, `/design-sync`가 대조할 근거가 없는
자리라는 사실을 번호가 드러내야 한다. **핸드오프가 갱신되면 이 자리가 먼저 충돌한다.**

⚠️ **`1j`(시작 거부)와 헷갈리지 않는다** — `1j`는 서버가 "지금은 안 된다"고 **판정한** 것이고
이쪽은 **판단할 재료를 못 얻은** 것이다. 그래서 `1j`는 `Close`, 이쪽은 `Try again`이다.

### 4-2. 진행 단계 이벤트 (`1c`)

지금 `runPull`은 **끝에 한 번** 답한다. 단계 셋(파일 렌더 → 커밋 → PR)은 **실제 순서**지만
**관측이 아니다.**

**추천: 시간 기반으로 그리고 사실을 주장하지 않는다.** 스트리밍을 넣으려면 `SyncRun`에 단계 컬럼을
쓰거나 폴링을 붙여야 하는데, 얻는 것이 "지금 어디쯤인가" 하나이고 그 값은 실패 시에도 Logs가 답한다.
⚠️ **그 선택의 조건**: 완료 표시가 **무색이고 `done` 낱말이 없다** — 초록 체크는 관측되지 않은 상태를
주장한다. 캔버스가 이미 그렇게 그려져 있다.

**없으면 지우는 자리**: 단계별 완료 표시(색·체크). 단계 목록 자체는 남는다 — **순서는 코드가
보장하는 사실**이다.

### 4-3. `already-running`에 실행자·경과 (`1j` 좌)

지금 `planSyncStart`는 `{ status: "already-running" }`만, `runSync`는
`{ status: "failed", error: "already-running" }`만 준다. 값은 `SyncRun.requestedBy` + `startedAt`에
**이미 있다**(그 행이 거부의 증거다).

**결정할 값**: 이름의 노출 범위. 멤버 목록은 프로젝트 전원이 보므로 **새로 새는 것은 없다** —
다만 `requestedBy`가 `null`인 경로(cron)가 있어 문구가 두 벌이 된다("Someone" vs "Jiwon").
⚠️ **PII 봉투 대상이다** — 이름은 `User` 복호 경로를 지나야 하고 그 모듈은 `server-only`다.

**없으면 지우는 자리**: `1j` 좌측의 `Started by … · … ago` 한 줄. 제목·설명·버튼은 남는다.

### 4-4. PR 메타 (`1d`·`1e`)

지금 `PullResult`는 `prUrl` · `changed: string[]`(경로) · `pr` · `commitSha`뿐이다.

| 시안이 그린 값 | 지금 | 판정 |
|---|---|---|
| PR 번호 | `prUrl`에 들어 있다 | **파싱으로 얻는다** — `checkOpenPullRequest`가 이미 같은 검증(origin · owner/repo · 정수)을 하므로 그 순수 부분을 함수로 분리해 재사용한다 |
| 바꾼 파일 목록 | `changed`가 경로 배열이다 | **있다** |
| 파일별 건수 | 없다 | 렌더 단계에서 셀 수 있는가가 결정할 값. **못 세면 파일 이름만 낸다** |
| reviewer | 없다 | GitHub 호출이 **한 번 더** 붙는다. **추천: 그린 자리를 지운다** — 이 값이 그 왕복만큼 쓸모가 없다 |
| `1e`의 총 건수(`62`) | ⚠️ **없다** | 핸드오프 §10-7이 "렌더 결과에 이미 있다"고 적었는데 **파일 수준까지다**: `changes`는 경로 배열이고, **셀 단위 총 건수는 아무도 세지 않는다**(값 비교를 하지 않으므로). 세려면 4-1의 base 파싱을 성공 경로에서도 돌려야 한다 |

**추천: `1e`는 수 없이 사실만 말한다.** "이번 24가 아니라 미발송 전부가 들어 있다"는 **수 없이도
성립하고**, 없는 수를 만들면 열어 본 사람이 또 다른 수를 본다.
⚠️ **`1a`의 제목 `Publish {n} changes`는 `countUnpublished`를 쓰므로 영향 없다** —
그 수는 이미 있고 프로젝트 전체 기준이다(`translations/page.tsx:158`이 `surfaceId`를 넘기지 않는다).

### 4-5. `PullOutcome` 계약 확장 (위 넷의 전제)

⚠️ **`1h`/`1i`를 가를 값이 클라이언트에 없다.** `failureOutcome`(`lib/sync/run.ts:156`)이
`classifySyncError(error).code`를 **로그에만 쓰고 버린다** — 반환은 `{ status: "failed", error: string }`다.

필요한 것:

```
| { status: "failed"; error: string; delivery: "not-started" | "unknown"; code?: SyncErrorCode; retryable?: boolean; retryAfterSeconds?: number }
```

`delivery`는 실패 생산자가 명시한다. 인가·준비·게이트의 실행 전 거부는 `not-started`,
`failureOutcome`과 클라이언트의 Action reject는 `unknown`이다. 반환 오류가 없는 성공·스킵
계약은 그대로다. `retryable`과 독립된 값이며, 전송 여부를 알아내기 위한 추가 GitHub 조회는
도입하지 않는다.

⚠️ **`/api/pull`의 응답 본문이 함께 넓어진다** — `app/api/pull/route.ts:88`이 outcome을 **그대로
spread**한다. `code`는 이미 `SyncRun.errorCode`로 DB에 남는 안정적 토큰이라 **새로 새는 정보는 없다**.
⚠️ 그 응답은 Vercel 로그로 가고 **대상 리포의 Actions 로그로는 가지 않는다**(그쪽은 `/api/push`다).

## 5. 모달 껍데기 — 온보딩 모달을 일반화해야 한다

시안은 앱의 `Dialog`(`max-w-90` = 360)가 아니라 **온보딩 모달과 같은 껍데기**(`components/onboarding/modal.tsx`)를
쓴다. 근거는 `1a`의 3열 표(Key 220 · Locale 84 · Value)다 — 360에서 값 칸이 두세 낱말이 되어
"바뀐 단어만 칠한다"가 무의미해진다.

**그 컴포넌트는 지금 온보딩에 묶여 있다:**

| 무엇 | 지금 | 필요 |
|---|---|---|
| `step: Step` | **필수** prop이고 바닥 왼쪽에 `m.newProject.modal.step(step)`을 그린다 | 바닥 왼쪽을 **`ReactNode` 슬롯**으로 (`1a`는 `24 changes · 19 keys · 2 files`, `1c`는 `Leaving this page won't stop it.`) |
| 바닥 오른쪽 | `[Next]`를 항상 그리고 `onNext`가 필수다 | **actions 슬롯**을 받는다. 생략하면 온보딩 기본 버튼, 명시적 `null`이면 버튼 없음. Publish는 갈래별 버튼을 전달한다 |
| 닫기 `aria-label` | `m.newProject.modal.close` | 프롭으로 받거나 `m.common.close` |
| 폭 | `max-w-[800px]` 고정 | **736** — 시안 값. 게이트 둘은 **512**(§2 `1j`) |
| 높이 | `min-h-[min(80svh,800px,…)]` | 갈래별 고정(`1a` **620~680** · `1c` 340~380 · `1j` 300~330 — ⚠️ 560~620은 캔버스 갱신 전 값이다). ⚠️ **`min-height`가 `max-height`를 이기므로** 세 값을 `min()` 안에 함께 넣는 기존 관용구를 유지한다 |
| dim | `bg-foreground/32` + `backdrop-blur-[6px]` | 시안은 `rgba(10,10,10,0.32)` — **같다.** blur는 캔버스가 말하지 않으므로 **결정할 값** |
| `[Back]` | `showBack` | `false` 고정 — 모든 갈래가 단일 단계다 |

⚠️ **이 파일을 고치면 온보딩 네 단계가 함께 움직인다.** 그래서 **프롭 추가와 기본값 유지**만 한다 —
`step`을 옵셔널로 내리고 슬롯을 새로 받되, 온보딩 호출부는 한 줄도 안 바뀌는 형이어야 한다.
`components/__tests__/onboarding-modal.test.tsx`가 기존 동작을 재는 자리다.

⚠️ **파일을 옮길지도 결정할 값이다.** `components/onboarding/modal.tsx`에 Publish가 의존하면
디렉터리 이름이 거짓이 된다 — `components/ui/modal.tsx`로 올리는 쪽은 `DIRECTORY.md` 갱신이 붙는다.
**단 `components/ui/dialog.tsx`는 건드리지 않는다**(소비자 일곱이 함께 움직인다 — DESIGN §6.2).

### 5.1 버튼·포커스·낭독 (리뷰 6번 확정)

✅ **온보딩 기본값을 보존하면서 Publish의 버튼 없는 화면과 상태 전이를 지원한다**
(2026-09-16 사용자). actions 슬롯을 전달한 호출부는 온보딩용 `onNext`를 요구하지 않는다.
`step`을 생략해도 전이를 알 수 있도록 Publish가 갈래 전이 키를 전달하고, 온보딩은 기존
`step` 기준을 유지한다. 같은 갈래의 데이터 갱신에는 포커스를 반복 이동하지 않는다.

- 최초 열기·재열기에는 시안대로 모달 컨테이너에 포커스를 둔다. 확인 버튼으로 자동 착지하지
  않아 Enter 한 번으로 실행되지 않는다. 열린 모달의 진행·결과 전이에는 포커스를 본문
  시작으로 이동한다. 닫힌 동안 완료되면 포커스를 빼앗지 않는다.
- 닫을 때는 실제로 모달을 연 버튼(`Publish`·`Publishing…`·`View result`)으로 돌아간다.
  그 버튼이 사라졌거나 disabled라 포커스를 받을 수 없으면 해당 호스트의 제목으로 복귀한다.
  Home·번역 화면 양쪽에 제목 ref와 `tabIndex={-1}`를 둔다.
- 자동 결과 알림의 경로는 갈래마다 하나다. **danger는 기존 Alert의 `role="alert"`**를 쓰고
  같은 오류를 모달의 polite live 영역에도 넣지 않는다. 그 외 갈래는 껍데기의 polite live
  영역 한 곳으로만 전이를 알리고, 본문에 별도 `role="status"`를 중복해서 두지 않는다.
  포커스 대상의 접근 이름과 live 문구도 같은 문장을 중복으로 읽지 않도록 구성한다.
- 온보딩의 기존 포커스·낭독 기본값과 공용 Alert의 danger 계약은 바꾸지 않는다. 최초 열기와
  결과 재열기는 Dialog의 접근 가능한 제목으로 문맥을 제공하고, 같은 결과의 재렌더를 새
  결과 알림으로 처리하지 않는다.

DOM 검증은 버튼 없는 갈래의 Next 0개, 상태 전이 포커스, 닫기 복귀와 제목 폴백, 활성 live
알림 경로 1곳을 확인한다. 실제 키보드·스크린리더 검증은 별도 수동 확인으로 두며 DOM 검사가
실제 낭독까지 보장한다고 쓰지 않는다.

## 6. 결과의 소유 주체 — 자리가 둘이고 규칙은 하나다

**POSTMORTEM 2026-09-07**: *"Server Action이 `revalidatePath`를 부르고 그 결과를 인라인으로 보이는
컴포넌트는, 그 revalidate가 바꾸는 조건부 분기 안에 있어서는 안 된다."*
**POSTMORTEM 2026-09-08**(그 규칙의 확장): *"인라인 결과를 보이는 컴포넌트는 그 결과를 만든 요청이
실패했을 때 라우터 갱신을 부르지 않는다."*

지금 그 규칙이 **두 곳에서 각자** 지켜지고 있다:

| 자리 | 상태 소유 | refresh 조건 |
|---|---|---|
| 번역 화면 | `components/translations/header.tsx`의 `useState` (페이지가 무조건 렌더) | `if (next.status !== "failed") router.refresh()` |
| Home | `components/home/actions.tsx`의 Context Provider (머리와 본문 두 자리를 잇는다) | 같은 규칙이 `SyncButton` 쪽에도 있다 |

**모달로 옮기면 두 자리 모두에서 마운트 주체를 다시 정한다.** 모달도 **무조건 렌더 자리**여야 한다 —
`triggerPullAction`이 `revalidatePath`를 **세 번** 부르고(`/projects/:slug` layout · `/projects` ·
`/projects/new`) 성공 경로에서 `router.refresh()`도 돈다.

**추천: 상태 소유를 지금 자리에 그대로 두고, 모달을 그 자리에서 렌더한다.**
→ 번역 화면은 `TranslationsHeader`가, Home은 `HomeActions` Provider 소비자가 모달을 든다.
근거: 두 자리가 이미 "언마운트되지 않는 곳"으로 **증명돼 있다.** 새 호스트를 만들면 그 증명을
처음부터 다시 해야 하고, 실패 모드가 "한 프레임도 안 보인다"라 테스트가 못 잡는다.

✅ **진행 중에는 버튼이 실행 상태를 들고, 완료 뒤에는 별도 결과 진입점을 남긴다**
(2026-09-16 리뷰 4번 확정). 번역 화면과 Home 모두 같은 규칙이다.

| 상태 | `[Publish]` | 별도 진입점 |
|---|---|---|
| 실행 전 | 기존 조건으로 `1a`를 연다. 수가 0이면 비활성 | 보관 중인 직전 결과가 있으면 `View result` |
| 실행 중 | `Publishing…` + 진행 표시. **클릭 가능**하며 현재 `1c`만 다시 연다 | 숨긴다 — 현재 진행은 왼쪽 버튼으로 연다 |
| 실행 완료 | 진행 표시를 끝내고 기존 미발송 수·잠금 조건으로 복귀 | `View result`가 마지막 결과 모달을 연다. 수가 0이어도 유지 |

- 실행 상태·결과는 기존 호스트가 소유하고, 모달의 열림 상태와 분리한다. 모달을 닫아도
  실행·결과를 지우지 않는다. 닫힌 동안 완료되면 모달은 자동으로 열지 않고 결과 진입점을 표시한다.
- `Publishing…` 클릭과 `View result` 클릭은 **Action을 다시 호출하지 않는다**. 새 실행은
  `1a`의 확인 버튼에서만 시작하며, 실행 중 확인 버튼의 중복 호출도 막는다.
- `Publishing…`를 native `disabled`로 만들면 재열기가 막힌다. 공용 Button의 `loading`이
  클릭을 차단하는 경우 그대로 사용하지 않고, 진행 표시와 실행 차단을 호출부에서 구분한다.
- 마지막 결과는 성공·스킵·실패·시작 거부 모두 보관한다. 같은 호스트가 마운트된 동안 유지하고,
  새 실행이 완료되면 교체한다. 단순 미리보기 열기·닫기는 직전 결과를 지우지 않는다.
  새로고침이나 다른 페이지로 이동한 뒤의 복구 저장소·실행 이력은 추가하지 않는다.
- 결과 모달은 `count > 0` 조건 안에 두지 않는다. 성공 뒤 refresh로 수가 0이 돼도
  열린 결과와 `View result`가 남아 PR 링크와 경고 목록을 다시 볼 수 있어야 한다.

⚠️ **Home의 상호 잠금이 함께 움직인다.** 지금 `publishPending`이 `[Sync]`를 잠그고
`setSyncOpen`이 `open && !publishPending`으로 문을 좁힌다. 모달이 들어오면 **잠금의 시작·해제
시점**이 "버튼 클릭"에서 "모달 안의 실행"으로 옮겨간다.
**결정할 값**: `1a`를 열어 둔 채 아무것도 안 보낸 사이에 `[Sync]`를 잠글 것인가.
**추천: 잠그지 않는다** — 그 순간 리포에 쓰는 것이 없고, 잠그면 읽던 목록을 닫아야 Sync가 풀린다.
⚠️ **반대 방향은 이미 막혀 있다** — Publish 모달이 modal이라 `[Sync]` 트리거에 클릭이 닿지 않는다.
⚠️ **`syncPending`과 `publishPending`을 하나의 `busy`로 접지 않는다**(Sync가 자기 자신을 잠근다 —
`home/actions.tsx`의 주석).
Publish 모달을 닫아도 실행이 끝날 때까지 `publishPending`은 유지하므로 `[Sync]` 잠금도
유지한다. 실행 완료 뒤 결과를 열어 보는 것만으로는 `[Sync]`를 잠그지 않는다.

## 7. 열린 PR 조회 — diff Action이 함께 든다

`1a`가 "열려 있는 PR #128을 덮어씁니다"를 말하려면 번호가 필요하다. 기존 `checkOpenPullRequest`는
`project:settings`(OWNER 전용)라 **EDITOR에게는 언제나 `undefined`**다 (spec §5).

✅ **확정: diff Action이 `translation:write`로 인가하고 PR까지 한 번에 돌려준다** (2026-09-16 사용자).

```
loadPublishPreview({ slug }) : Promise<PublishPreview>   // translation:write · 쓰기 0
  ├ diff      : 파일 그룹 → 키 → 로케일 행 (before/after)
  ├ openPr    : OpenImportPr            // { number, url } | null | undefined
  └ truncated : number                  // 상한 초과 수
```

- `openPr`은 `lib/projects/open-pr.ts`의 `loadOpenPrUrl`을 그대로 부른다 — installation 토큰,
  보관·미연결이 `null`/`undefined`로 이미 갈려 있다.
- URL 검증(origin · owner/repo 대조 · 정수 번호)은 `checkOpenPullRequest` 안에 **인라인으로** 있다 —
  **순수 함수로 분리해 둘이 공유한다.** 두 벌이 되면 한쪽만 고쳐진다.
- ⚠️ **왕복을 둘로 쪼개지 않는다.** 모달을 열 때 base 트리 조회가 이미 GitHub을 부르므로 PR 조회를
  같은 Action에 합친다. 따로 두면 표와 PR 줄이 **따로 도착해** 같은 블록이 두 번 바뀐다.
- ⚠️ **`checkOpenPullRequest`는 손대지 않는다** — `project:settings` 단언이
  `app/__tests__/entry-points.test.ts:727`에 박혀 있고, 낮추면 Sync Dialog의 인가 표면이 함께 움직인다.
- ⚠️ **`OpenImportPr`의 삼상태를 `null`로 접지 않는다** — `undefined`(미확인)와 `null`(없음)이
  화면에서 다른 줄이다. Sync Dialog가 그 구별 위에 서 있다.

## 8. 스키마 변경

**없다.** `SyncRun`(`status` · `errorCode` · `prUrl` · `changed` · `warnings` · `requestedBy` ·
`startedAt` · `finishedAt`)과 `Project.lastPublishedAt`·`lastPrUrl`이 필요한 값을 **전부 이미 든다.**

⚠️ **4-2에서 스트리밍을 고르면 그때 additive 컬럼이 생긴다** — 추천안(시간 기반)이 그것을 피하는
이유 중 하나다.

## 9. 새 환경변수

**없다.**

## 10. 불변식 영향 (ARCHITECTURE §0)

| 불변식 | 판정 |
|---|---|
| 2 (병합 금지) | ⚠️ **가장 가까운 자리다.** `1a`가 리포 값과 DB 값을 **같은 표에** 그린다. 지키는 방법: **표는 표시 전용이고 어떤 판정의 입력도 아니다** — before를 읽은 결과가 export·커밋·PR 어디에도 들어가지 않는다. 4-1에 주석으로 못 박고, diff Action이 **쓰기를 하지 않는 read Action**임을 테스트가 고정한다 |
| 4 (export 결정성) | **영향 없다** — 렌더 경로를 안 건드린다 |
| 5 (`projectId`로 좁힌다) | 신규 read Action 하나가 **인가가 돌려준 `projectId`**로만 조회한다. slug로 다시 찾지 않는다 |
| 9 (버린 값을 숨기지 않는다) | **강화된다** — `<details>`가 펼친 목록이 되고, 제목이 셀 수 없는 것을 세지 않게 된다. ⚠️ 상한을 둘 때(열린 결정 1) **"나머지는 Logs에"를 화면이 말해야** 이 불변식이 유지된다 |
| 3 · 10 · 11 | 영향 없다 |

## 11. POSTMORTEM 소환 (착수 전 grep한 것)

| 항목 | 이 기능에서 어디에 걸리나 |
|---|---|
| **2026-09-07 — `revalidatePath`가 결과를 씻어냈다** | §6 전체. 모달이 조건부 분기 안에 있으면 성공이 자기 결과를 언마운트한다. **그때 놓친 그물이 `pnpm test`·typecheck·build·정적 리뷰 넷이고 잡은 것은 ego-browser였다** — 이 기능도 같다 |
| **2026-09-08 — 실패한 Publish 뒤 `router.refresh()`** | 같은 파일(`translations/header.tsx`)이다. 모달로 옮길 때 `if (next.status !== "failed")` 조건이 **함께 옮겨가야** 한다. grep 근거였던 "`router.refresh()`는 한 곳뿐"이 **두 곳으로 늘어날 수 있다** — 늘리면 그 회고의 grep이 거짓이 된다 |
| 2026-09-08 — `?? 폴백`이 프로토타입 키를 못 막았다 | 4-1의 diff 조립이 **로케일 코드와 파일 경로를 객체 키로 쓴다.** 조회는 `Object.hasOwn`, 대입은 `Object.create(null)`이다 |
| 2026-09-09 — `DialogClose asChild` 자식 옆의 형제 | 모달 바닥의 버튼 배치. 온보딩 껍데기가 이미 `asChild`를 피해 두었다(Close 자신이 버튼이다) |
| 2026-09-08 — 접어 둔 진단이 개행을 잃었다 | `1g`의 목록. `whitespace-pre-wrap`이 필요한 이유가 **YAML 파서의 캐럿 다이어그램**이고, 펼친 목록으로 바꿔도 그 요구는 남는다 |
| 2026-09-13 — 한 화면에 `malmoi`/`Malmoi`가 같이 섰다 | `1e`·`1f`·`1g`의 신규 문구 셋이 이름을 문장 안에 든다 |

## 12. 영향받는 테스트

- `lib/pull/__tests__/message.test.ts` — 갈래 매핑 전수. `created`/`updated`가 **다른 화면**인 것 ·
  `no-edits`/`no-changes` 모두 `1f` · `SKIPPED` + `warnings > 0`의 칸 · §2.2의 여섯 사유가 어디로 가는지
- `lib/sync/__tests__/plan.test.ts` — `already-running`이 `too-soon`보다 앞 · `retryAfterSeconds`가
  올림 · 실패가 `lastSettled`에 안 센다(`1i`의 `Try again`이 그 위에 선다)
- `lib/pull/__tests__/error-codes.test.ts` — 기존 오류 코드 생산자 검사 유지. 화면 매핑 검사는
  `lib/pull/__tests__/message.test.ts`에 추가하며 `stale`는 합성 입력으로 구별한다
- 두 소비자의 DOM 테스트 — §2.1의 미리보기 이후 다른 발송 완료·쿨다운 경과에 따른 `no-edits`
- 신규 `components/__tests__/publish-button.test.tsx` — 결과가 `Alert`가 아니라 모달 본문 ·
  `router.refresh()`가 모달을 언마운트하지 않는다 · `1b`가 Action을 부르지 않는다
  · 실행 중 닫기/재열기에 Action 호출 1회 유지 · 닫힌 동안 완료 후 수가 0이어도 결과 재열기
- `components/__tests__/home-actions.test.tsx` — Provider가 결과를 계속 든다 · 상호 잠금이 모달
  전이 뒤에도 선다
  · 같은 진행/결과 재열기 검증 · 닫아도 Sync 잠금 유지, 완료 후 잠금 해제
- `app/__tests__/screens.test.ts` — `components/publish-button.tsx`의 소유 화면 목록
- `app/__tests__/entry-points.test.ts` — 신규 read Action 하나의 인가 (`translation:write`)
- `lib/i18n/__tests__/` 문구 검사 — 신규 항목 · `publish.partial`의 건수가 제목에서 빠진다 ·
  대체된 키가 **남아 있지 않다**
- `components/__tests__/onboarding-modal.test.tsx` — 껍데기 일반화 후 기존 온보딩 동작 유지
- 신규 — diff Action의 단위 테스트(셀 단위 · 키 병합 정렬 · 상한 · **쓰기 0**)
- 신규 — `1a`의 열린 PR 줄 (`OpenImportPr` 삼상태가 `null`로 접히지 않는다 · EDITOR에게도 번호가 온다)
- 신규 — `1k` (목록 조회 실패에 보내기 컨트롤이 DOM에 0)
- 두 소비자의 지연 Promise DOM 테스트 — 재시도/미리보기 재열기마다 새 조회 · 로딩 중
  발송 컨트롤 0 · A 조회→닫기→B 조회 뒤 A의 늦은 성공/실패 무시 · 최신 목록 확인 전
  추가 발송 0 · 확인 후 발송 1회 · 진행/결과 재열기는 조회/발송 모두 추가 호출 0

⚠️ **`pnpm test` 밖의 하나**: `lib/keys/**`를 건드리면 `pnpm test:projects:postgres`를 손으로 돈다
(미발송 술어 셋이 같은 행을 세는지를 재는 자리다. 미리보기와 실행 사이의 시간차 검증은 별도다).
