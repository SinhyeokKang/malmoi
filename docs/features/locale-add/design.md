# Add and remove languages — 설계

작성: 2026-10-13 · 개정: 2026-10-14(2차 검수 반영). spec의 추가·제거·취소 계약을 구현하는 설계다. 1차 개정의 RESTORE·origin·전달 문맥 필드(`deliveredToken`·`deliveredOperation`·`deliveryRunId`)와 전용 reconcile 판정을 대체한다.

## 0. 현재 코드의 공백

- Locale의 생산자는 적재다(`lib/push/apply.ts`). 페이로드에 없는 언어는 `orphaned`, 돌아온 언어는 같은 행을 되살린다.
- 재생성 writer는 원본 없는 새 파일을 만들지만, `PullChange`·`SnapshotChange`와 GitLab commit actions에는 파일 삭제가 없다(`lib/pull/plan.ts`의 “삭제를 내지 않는다”, origin/dev `lib/gitlab/plan.ts`). 출력에서 빼는 것만으로 base 파일이 삭제되지 않는다.
- Publish 조기 종료와 보호 집계는 번역 셀 토큰만 본다. 조기 종료 자리는 `lib/pull/run.ts`의 `split.delivered.length === 0 && withheld > 0`, `lib/pull/plan.ts`의 `shouldSkipPull`, `lib/nightly/plan.ts`의 `upToDate`다.
- PR/MR 조회는 “sync 브랜치에 열린 PR/MR이 있는가”만 안다(`isPullRequestOpen`, GitLab `state === "opened"`). sync 브랜치는 프로젝트당 하나(`syncBranchFor(slug)`)이고 매 Publish가 base에서 다시 만들어 force-update한다.

## 1. 상태 — 현재 의도와 마지막 전달

`Locale.orphaned`는 비활성 보존을 계속 담당한다. **제거 요청 시 바로 orphan하지 않는다.** base에 파일이 있고 취소하면 편집을 다시 허용해야 한다.

`LocaleChange`는 소스·로케일당 현재 의도 한 행이다. 일반 로케일은 이 행이 없다.

| 필드 | 의미 |
|---|---|
| `projectId, surfaceId, localeCode` | Locale의 복합 키/FK, 한 언어당 한 행 |
| `operation` | `ADD`(새 파일 제안) 또는 `REMOVE`(파일 제외) |
| `requestedAt` | 요청 시각. UI 표시와 승인 지문 입력 |

소스별 전달 확인(`DeliveryConfirmation`, 소스당 행)에 **`deliveredLocaleChanges`** 를 additive로 둔다. 마지막으로 PR/MR 경계까지 확인된 Publish가 실은 파일 집합 변경의 정규화 목록이다. 원소는 `(localeCode, effect)`이고 effect는 `create`(값 있는 ADD) 또는 `delete`(REMOVE)이며 코드순으로 정렬한다. 목록 자체를 저장해 언어별 `Unsent`를 표시할 수 있게 한다. **위치: `DeliveryConfirmation`의 jsonb 컬럼** (2026-10-14 결정). 근거: revision을 새로 찍고 확인을 되살리는 upsert(`lib/pull/load.ts:354-363`, `confirmDelivery` 성공 tx)에서 같이 쓰므로, 첫 외부 쓰기 전 무효화(`invalidatePublishDelivery` `load.ts:194-207`, 호출 `run.ts:419`·`:447`)와 성공 경계(`run.ts:439` no-changes · `:479` PR/MR 뒤)를 그대로 따른다. 새 테이블은 같은 동기화를 따로 맞춰야 한다. ⚠️ 그 upsert는 `delivery.contexts`(`load.ts:305`)에 든 소스만 덮는다 — **언어 변경만 있는 소스도 캡처 컨텍스트에 넣어야** 행이 생긴다. 무효화 동안(`invalidatedAt` ≠ null) 전달 목록은 "확인 안 됨"으로 읽는다. 미확정 실행 장벽은 `publish-unsettled`(`lib/sync/run.ts:138-143`, `planPublishBarrier` `lib/sync/execution.ts:20`)를 재사용한다.

**현재 효과 목록**은 같은 규칙으로 `LocaleChange`에서 계산한다. 값 0개 ADD는 파일을 내지 않으므로 목록에 들어가지 않는다. **언어 변경 작업 = 현재 효과 목록 ≠ 전달 목록.** 전이 이력이나 실행 참조를 따로 두지 않는다. sync 브랜치를 매번 base에서 다시 만들므로 “이전에 무엇을 보냈나”는 이 목록 하나로 충분하다.

### 전이 표

| 현재 | 입력 | 결과 |
|---|---|---|
| 일반 활성 | 제거(미리보기 지문 승인) | REMOVE 행 생성, 그 언어 미전달 편집은 승인 폐기, 편집 잠금 |
| 없음/orphan | 추가 | ADD 행 생성, 활성화. 되살림의 값 있는 활성 셀에 토큰 재발급 |
| ADD | 제거(= 추가 취소, 지문 승인) | ADD 행 삭제, orphan, 그 언어 미전달 편집 승인 폐기. 전달된 적 있으면 목록 차이로 Publish 작업이 생김 |
| REMOVE | 제거 취소 | REMOVE 행 삭제, 편집 허용. 전달된 적 있으면 목록 차이로 Publish 작업이 생김 |
| 어느 행이든 | Publish가 PR/MR 경계까지 성공 | 스냅샷 때 캡처한 효과 목록을 전달 목록으로 기록. 행은 유지 |
| 어느 행이든 | 만료(아래) | 행 삭제. base 관측으로 orphan/활성 결정 |
| 어느 행이든 | 지문 승인한 수동 Sync 성공 | 행 전부 삭제, 전달 목록 비움, 리포대로 활성/orphan |

전달 전 취소는 현재 목록이 전달 목록으로 돌아가 작업이 저절로 0이 된다. 전달 후 취소는 목록이 달라져 다음 Publish가 정리한다. 스냅샷이 base와 같으면 기존 `no-changes` 경로(PR 닫기 + sync 브랜치 reset)가 맡는다.

**결과 미확정 Publish 중에는 언어 변경을 거부한다.** 응답이 유실된 실행은 원격에 새 파일·삭제를 실었을 수 있는데 전달 목록은 갱신되지 않는다. 그 사이 전달 전 취소를 허용하면 PR에 stale diff가 남는다. 새 사유 코드를 만들지 않고 기존 `publish-unsettled` 장벽(`lib/sync/run.ts`)과 RUNNING 실행권을 재사용한다.

### 만료와 strict 적재

- **만료 조건**: 열린 sync PR/MR이 없다고 성공한 조회로 확인됨 ∧ 현재 효과 목록 = 전달 목록 ∧ 그 base head의 파일 트리를 관측함.
  - **ADD 행은 추가 조건이 하나 더 있다** (2026-10-14 R-A1 🔴 R1 · 지휘자 판단): 자기 `create` 효과가 전달 목록에 있거나 자기 경로가 base에서 관측될 때만 만료한다. 값 0개 ADD는 효과 목록에 없어서, 이 조건이 없으면 첫 값 저장 전의 적재·야간 방문이 곧바로 만료·orphan시킨다. 경로가 관측되면 결과는 관측 그대로 active다 — 리포에 직접 만든 파일이 보류된 ADD(`proposal-path-exists`)를 푸는 길도 이것이다.
  - **관측된 로케일 파일이 0개면 만료하지 않고 보류한다** (같은 리뷰 Y2) — 0개는 "비었다"는 증거가 아니다(POSTMORTEM 2026-09-15). strict 적재도 빈 목록을 받지 않는다.
  - **포맷이 비지원으로 바뀐 소스에서도 추가 취소·제거 취소는 허용한다** (같은 리뷰 Y3) — 둘 다 리포로 새로 보내는 것이 없는 축소 방향이다. Project→Surface 잠금 뒤 목록·대상 설정을 다시 대조하고, 행을 삭제하며 사건을 남긴다.
- **존재 판정은 적재와 같은 순수 함수를 쓴다.** “관측된 파일 집합에 경로가 있으면 활성, 없으면 orphan”을 strict 적재와 공유한다. 의도와 리포 관측을 비교해 고르는 코드는 없다.
- **자동 적재가 만료를 겸한다.** 적재 시점에 위 조건이 서면 같은 잠금 안에서 만료한다. 같은 base SHA라 적재를 건너뛰는 야간 방문은 `LocaleChange` 행이 있는 소스에 한해 PR/MR 조회와 만료를 먼저 돈다. 수동·MCP Publish도 스냅샷 전에 같은 판정을 지난다. 행이 없는 프로젝트는 기존 순서를 유지한다.
- **fail-closed 비용**: 행이 있는 프로젝트에서 야간 PR/MR 조회가 실패하면 그 밤의 Publish 전체가 보류된다(종료된 요청을 다시 싣지 않기 위해). 결과는 기존 `pr-check-failed` 사유로 Logs에 남긴다.
- **보류**: 전달 목록과 다른 REMOVE가 있으면 자동 적재 전체를 새 deferred 사유 `locale-change-pending`으로 보류한다. ADD만 있으면 그 언어를 orphan 대상에서 빼고 적재한다. 전달 후에는 기존 열린 PR 보호가 보류를 맡는다.
- **`pendingWhere`는 바꾸지 않는다.** REMOVE 동안 편집이 잠기고 폐기 승인으로 토큰이 0이므로, 셀 편집 집계에 언어 변경을 섞지 않는다. 언어 변경 작업은 목록 비교로 따로 센다.
- 변경 중 source 제거·base branch/경로/연결 변경은 기존 승인 흐름에 언어 변경 행을 포함한다. 안전하게 폐기할 수 없으면 `locale-change-pending`으로 거부한다. 다른 저장소에 이전 삭제를 보내지 않는다.

## 2. 어댑터·경로·파일 계약

초기 지원은 `json-catalog`·`chrome-locales`(`writeStrategy=regenerate`, `layout=per-locale`). `yaml-catalog`·`code-dict`는 개별 파일이어도 이번 범위 밖이고, `ts-dict` 공유 파일의 로케일 객체 제거도 구현하지 않는다.

- 추가 입력: `isPathSafeLocale` ∧ `isLocaleShaped`, Chrome 지원 목록, `localeCollisionKey = code.toLowerCase().replace(/[-_]/g, "")`. 로케일 수 상한은 두지 않는다. 그 결과 리포가 `/api/push`의 `MAX_LOCALES`(200)를 넘으면 기존 페이로드 검증이 그대로 거부한다.
- 경로는 서버의 소스 `pathTemplate`에서 계산하고 `isPathSafeRepoPath`와 기존 소스 간 경로 소유 판정을 지난다. MCP/Action은 임의 파일 경로를 받지 않는다.
- 제거는 현재 base의 정확한 대상 경로만 계획한다. 비정규 파일·링크된 상위 디렉터리는 `renderProject`의 기존 `GitFileKindError` 판정에 삭제 경로를 태워 거부한다. 디렉터리 통째 삭제·glob 삭제 없음. Chrome의 같은 디렉터리 다른 파일도 건드리지 않는다.
- 사용자 승인 지문은 언어 변경 행·그 언어 셀 토큰·소스 설정에 묶는다. Publish 미리보기는 base head·대상 blob·삭제 경로에도 묶고, 실행에서 달라지면 재확인한다.
- base 파일을 읽지 못하면 파일 부재가 아니다. 삭제·만료를 수행하지 않고, 결과·사건은 실패/보류로 남긴다(“삭제 완료”·`no-changes` 금지).

### Chrome 지원 목록 (확인일 2026-10-14)

- 출처: https://developer.chrome.com/docs/extensions/reference/api/i18n#locales — 55개.
  `ar am bg bn ca cs da de el en en_AU en_GB en_US es es_419 et fa fi fil fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nl no pl pt_BR pt_PT ro ru sk sl sr sv sw ta te th tr uk vi zh_CN zh_TW`
- Chromium은 이 55개가 아니라 ICU 지원 목록(`GetSupportedIcuLocales`)과 대조하며, 그 목록이 더 넓을 수 있다. **추가 입력은 문서의 55개로 좁힌다** — 보수적인 쪽이고, 목록 밖 언어는 리포에서 직접 추가하면 기존 적재가 받는다.
- 목록 밖 디렉터리(unpacked): 거부·경고 없이 건너뛴다(`extension_l10n_util.cc` `GetValidLocales`, 릴리스 빌드에선 로그도 없음). 문서도 "unsupported locale은 무시"라고 쓴다.
- 로드가 실패하는 경우: 지원 locale 디렉터리에 `messages.json`이 없을 때, 유효 locale이 하나도 없을 때, `default_locale`이 목록 밖이거나 디렉터리가 없을 때(`file_util.cc` `LoadMessageBundle`). → 기준 언어 제거 금지(§2 끝)가 마지막 경우를 막는다. 제거는 디렉터리가 아니라 `messages.json` 파일을 지우므로, **같은 디렉터리에 다른 파일이 남으면 빈 locale 디렉터리가 아니라 "카탈로그 없는 지원 locale"이 되어 로드가 실패할 수 있다** — 구현에서 실측한다(§9 왕복).
- 웹스토어 업로드의 목록 밖 디렉터리 처리는 공식 출처를 찾지 못했다(`/docs/webstore/i18n` 404). 같은 Chromium 로직이라면 무시로 추정, 미확인.
- 리포에는 Chrome locale 목록이 없다. 구현 때 목록 파일을 새로 만들고 머리 주석에 위 출처 URL·확인일을 적는다.

### Publish 변경 union

`SnapshotChange = { kind: "upsert", path, content, inBase } | { kind: "delete", path }`. delete는 경로가 base에 있을 때만 만든다. 세 가드를 함께 고친다. (현행 `PullChange = { path, content }`·`SnapshotChange = PullChange & { inBase }`에는 sha가 없고 소비자도 읽지 않는다 — blob SHA는 `planPullChanges` 안에서만 계산한다. 그래서 union에 sha를 두지 않는다. 2026-10-14 §0 조사로 정정)

- 타입: GitHub `TreeEntry`가 `content: string`·`mode: "100644"` 고정이다. 삭제는 `base_tree` 위의 `sha: null` 항목으로 낸다.
- 빈 변경: GitHub(`lib/pull/payload.ts`)·GitLab(`buildCommitActions`) 모두 변경 0이면 던진다. 삭제만 있는 변경도 통과하고, 변경 0은 기존 `no-changes` 경로로 간다.
- 중복 경로: 같은 경로의 upsert·delete는 계획 오류다. 정렬은 기존 결정적 비교를 쓴다.

GitLab은 `{action: "delete", file_path}`를 쓴다. blob SHA 비교(`planPullChanges`)는 delete를 “base에 있을 때만 변경”으로 다룬다. 렌더 결과에서 언어를 빼는 것만으로 삭제됐다고 판정하지 않는다.

**소비자·가드 위치** (2026-10-14 조사, 줄 번호는 착수 시점 dev 기준):

| 자리 | 현재 | 변경 |
|---|---|---|
| `lib/pull/plan.ts:239` `PullChange` · `lib/pull/client.ts:21` `SnapshotChange` | upsert만 | union |
| `lib/pull/plan.ts:248-261` `planPullChanges` (유일한 생산자) | `content===null`은 건너뜀, base SHA 같으면 건너뜀, `compareKeys` 정렬(:260) | delete 의도를 **별도 입력**으로 받는다(`content===null`을 삭제로 읽지 않는다). base에 있을 때만 delete. 같은 경로 upsert·delete 계획 오류를 여기서 던진다 — GitHub 쪽엔 중복 검사가 없다 |
| `lib/pull/plan.ts:244-246` · `lib/gitlab/plan.ts:22` | "삭제를 내지 않는다" 주석 | "명시적 의도만 삭제, `null`은 그대로 둠"으로 고침 |
| `lib/pull/payload.ts:49-55` `TreeEntry` · `:66-80` `buildTreePayload` | `content: string` 고정 | 가드(a): delete → `sha: null` 항목. 가드(b) `:72` 빈 변경 throw는 유지(삭제만 있어도 통과) |
| `lib/gitlab/plan.ts:19` `GitLabCommitAction` · `:26-35` `buildCommitActions` | create/update, `:27` 빈 변경 throw, `:28-32` 중복 throw(가드 c), `:30` 경로 안전 | delete 분기 `{action:"delete", file_path}`, 세 검사는 두 종류 모두 |
| `lib/pull/run.ts:258` `renderProject` | `planPullChanges` 호출 | delete 의도 전달. `:215-225` 파일 종류 가드에 삭제 경로도 태운다 |
| `lib/pull/run.ts:444 → 498-516` `countChangedValuesOf` | `.content` 읽음 | delete를 건너뛴다(번역 전달 수가 아니다 — §4) |
| `lib/pull/run.ts:449`(:210) `inBase` 부착 · `:445` 요약 · `:465` PR 본문 · `:488` `changed` | 모든 change에 spread | kind로 좁힘. 본문·결과에 삭제 파일 구분 |
| `lib/publish/read.ts:138` `changedFiles` | 경로만 | 미리보기에서 `Removed` 구분 |
| `lib/github.ts:415` 주석 · `lib/gitlab/client.ts:167-175` | 통과 | 주석만 |
| 테스트 fake: `lib/gitlab/__tests__/fake-repo.ts:136-149` | delete가 오면 `undefined`를 쓴다 | delete 처리(없는 파일 400, 있으면 제거) |
| 테스트: `payload.test.ts`·`gitlab/plan.test.ts`·`pull/plan.test.ts`·`github-app.test.ts:195,221` | upsert만 | delete·삭제만·같은 경로 혼합 케이스. `Parameters<GitClient["publishSnapshot"]>[0]`로 타입을 건 테스트(edit-flow:65, entry-order:11·78, run.test:1393)는 kind로 좁혀야 컴파일된다 |

**리포 파일 삭제는 DB 번역 삭제가 아니다.** 기준 언어 제거는 거부하고, 기준 변경 후보에서 ADD·REMOVE를 제외한다. base 변경과 제거는 같은 잠금 뒤 다시 판정한다.

## 3. 순수 판정과 쓰기 코어

| 자리(제안) | 역할 |
|---|---|
| `lib/locales/add-plan.ts` | 코드/충돌/포맷과 create·revive·거부 판정 |
| `lib/locales/change-plan.ts` | 위 전이 표, 권한·기준·보관·미확정 실행·오래된 지문 거부 |
| `lib/locales/effects.ts` | 행 + 값 수 → 정규화 효과 목록, 목록 비교 |
| `lib/locales/chrome-codes.ts` | 출처·확인일 있는 지원 목록. 모든 코드가 두 검증을 통과하는 생성 테스트 |
| `lib/locales/publish-plan.ts` | 의도 × base 경로 → 생성·삭제·보류 |
| `lib/locales/change.ts` | Action/MCP 공통 I/O 코어. 순수 판정 뒤 DB 변경과 사건 |

만료의 존재 판정은 새 모듈을 만들지 않고 적재가 쓰는 함수를 재사용한다. 순수 함수는 클라이언트 잎으로 필요한 것만 노출하고 I/O 코어는 server-only다. 입력 코드를 객체 프로퍼티로 쓰지 않고 Map/배열을 쓴다(`__proto__`를 모든 plan과 MCP 입력의 표 테스트에 포함).

쓰기는 `lockProjectAccess(project:settings)` → Surface 잠금 → 상태 재조회 → 판정 → Locale/LocaleChange/토큰/ProjectEvent를 같은 tx에서 변경한다. 미리보기는 읽기 전용이고 `revalidatePath` 없음. 성공한 웹 쓰기 뒤에만 revalidate한다.

**폐기는 값을 마지막 전달 값으로 되돌린다** (2026-10-14 사용자 — R-B1 Y1). 토큰만 비우면 값이 DB에 남아, 제거를 취소한 뒤 다음 Publish에 추적 없이 실린다. 그래서 폐기는 Revert와 같은 의미다 — `TranslationBaseline`의 복원값으로 되돌리고 토큰을 비운다. 그 언어에 전달 기록(baseline)이 없는 미전달 셀이 있으면 제거를 거부한다(fail-closed, 먼저 Publish 또는 Revert). **이 되돌림은 제거(REMOVE)에만 적용한다** — 추가 취소는 언어를 orphan으로 돌려 렌더에서 빠지므로 값이 새지 않고, 재추가가 값 있는 셀에 토큰을 다시 발급해 되살린다(spec 보존 행). 그래서 추가 취소는 토큰만 비우고 값은 유지한다(2026-10-14 정정 — 처음 문장이 추가 취소까지 덮어 새 언어의 입력을 지웠다).

**확인이 무효화된 동안(`delivered: null`)은 취소를 거부한다** (2026-10-14 R-B1 🔴 R1 · 지휘자 판단). 대상 행의 효과가 현재 목록에 있으면 추가 취소·제거 취소를 `publish-unsettled`로 거부한다. 무효화는 시간으로 풀리지 않고 다음 성공 확인만 푼다 — 그 사이 취소를 받으면 작업이 0으로 접혀 열린 PR의 stale 파일이 남는다. 새 요청(추가·제거 요청)은 작업을 늘리는 쪽이라 막지 않는다. 값 0개 ADD의 취소는 보낸 파일이 없어 허용한다.

제거·추가 취소 미리보기는 대상 파일, 값 있는 번역 수, 그 언어의 미전달 수, 전달 상태와 서버 지문을 돌려준다. 실행은 같은 입력으로 지문을 다시 확인한다. 다른 언어의 편집은 폐기에 포함하지 않는다.

**Publish 경합:** 실행 스냅샷은 그때의 효과 목록을 캡처하고, 확인 tx는 그 캡처를 전달 목록으로 쓴다. 실행 중 새 요청·취소는 현재 목록을 바꾸므로 확인 뒤에도 작업으로 남는다. CI push 적재와 언어 변경은 같은 Project→Surface 잠금 순서를 쓴다.

## 4. 추가 렌더와 제거/취소 Publish

### 추가의 새 파일 표현

- 현행 json-catalog는 형제 파일 표현을 일부러 빌리지 않는다(`currentFiles[0]` 회피, 새 파일은 `DEFAULT_JSON_STYLE`). 이 설계는 그 방침을 바꾸므로 **출처를 그 소스의 기준 언어 파일 하나로 고정**한다. 들여쓰기·CRLF·BOM·이스케이프·Chrome 필드 순서만 빌린다.
- `originalStructure`나 base 키 구조를 복제하지 않는다. 새 파일 구조는 소스의 `nested`·`nestedByPath`로 정한다. 기준 파일이 빈 `{}`이어도 중첩 여부는 base 내용으로 정하지 않는다.
- Chrome 새 파일에 기준 파일의 `placeholders`·`description`을 복사하지 않는다. 되살린 로케일의 `placeholders: null`은 유지한다.
- **고정점**: 다음 Publish는 자기 파일을 원본으로 읽는다. 빌린 표현과 자기 파일 표현이 같아 diff 0이어야 한다. `lib/adapters/__tests__/contract.ts` 매트릭스에 “원본 없음 + 표현 출처 있음” 행을 추가한다.
- 미전달 ADD 경로가 이미 base에 있으면 해당 언어만 `proposal-path-exists`로 보류. 다른 편집은 전달할 수 있다.
- 값 0개 ADD는 파일을 내지 않는다. 재추가는 같은 행을 살리고 값 있는 활성 셀에 새 편집 토큰, `updatedBy`·값 유지, 새 TranslationBaseline 생성 없음.

### 파일 집합의 목표

1. 활성 일반 언어·ADD는 기존 렌더 대상, REMOVE는 렌더에서 제외한다.
2. REMOVE 경로가 base에 있으면 delete를 추가한다. 없으면 diff 항목은 없다.
3. **REMOVE는 행이 있는 한 매 스냅샷에 다시 적용**한다. base 위에서 매번 재생성하므로, 한 번 보낸 뒤 의도를 지우면 삭제가 사라진다.
4. 전달된 의도의 취소는 그 언어를 정상 렌더/제외한 스냅샷으로 수렴한다. `changes=0`이어도 sync reset·불필요 PR 닫기가 끝나기 전에는 전달 목록을 갱신하지 않는다.
5. 전달 확인은 커밋 생성만으로 끝나지 않는다. 기존 Publish 성공 경계(브랜치·PR/MR까지)에 도달한 뒤 캡처한 목록을 기록한다. 실패·응답 유실·부분 완료는 기록하지 않는다.

### 집계·보호

`unpublished`를 가짜 Translation 토큰으로 늘리지 않는다. 셀 편집 수와 **언어 변경 작업(목록 차이)** 을 따로 싣는다. 조기 종료 세 자리(§0)가 둘을 함께 본다.

**`pendingWhere`·조기 종료 판정표** (2026-10-14 조사). `pendingWhere`를 직접 부르는 곳은 `lib/protection/where.ts`·`lib/pull/load.ts`·`lib/keys/revert.ts` 셋이고 나머지는 래퍼(`countPending`·`countPendingBySurface`·`loadPendingEdits`)나 손 사본이다. "언어 작업 추가"는 술어를 바꾸는 게 아니라 **그 자리의 판정이 목록 차이를 따로 본다**는 뜻이다.

| 자리 | 판정 |
|---|---|
| `lib/protection/where.ts:13` `pendingWhere` · `:32/46/65` 래퍼 · `lib/protection/release-orphaned.ts:31` | 변경 없음 |
| `lib/keys/query.ts:131`(Translations Unsent) · `:518`(목록 손 사본) · `lib/keys/translation-list.ts:159`(`pending`·`unsent` 필터) · `lib/keys/revert.ts:51` | 변경 없음 — 셀 편집 수다. 언어별 Unsent는 목록 비교로, REMOVE 중 쓰기 거부는 별도 가드로 |
| `lib/pull/load.ts:111` `unpublished` · `:115-118` `pendingEdits` | 수는 변경 없음. 같은 RepeatableRead 스냅샷(`loadSnapshot` :50)에서 현재 효과 목록·전달 목록을 **별도 필드**로 읽는다 |
| `lib/pull/load.ts:37-44` `loadPreviewSnapshot` · `lib/publish/read.ts:28` · `lib/publish/fingerprint.ts:16` | 언어 작업 추가 — `total=0`이어도 New file/Removed 표시, 지문에 언어 행·전달 목록 |
| `lib/protection/fingerprint.ts:25/54` · `lib/import/approval.ts:27` · `lib/surfaces/remove.ts:45` `readRemoval` | 언어 작업 추가 — 수동 Sync 폐기·소스 제거 지문에 언어 행·전달 목록 |
| `app/api/push/route.ts:238` · `lib/push/apply.ts:162/167` · `lib/import/run.ts:122` | 수는 변경 없음. 옆에 `locale-change-pending` 보류 게이트 추가(ADD만이면 orphan 대상에서 뺌). `lib/import/run.ts:265/357/398` 재집계는 변경 없음 |
| `lib/nightly/run.ts:85` → `lib/nightly/plan.ts:57` | 언어 작업이 있으면 Publish를 고른다 |
| 조기 종료 ① `lib/pull/plan.ts:30` `shouldSkipPull` (`run.ts:336`) | 셀 편집 0 **그리고** 언어 작업 0일 때만 `no-edits` |
| `lib/pull/run.ts:341` `maxUpdatedAt === null` → unreachable | 언어 작업이 있으면 통과. `captured`(:344)는 셀 확인용이라 언어 목록 확인과 분리 |
| `lib/pull/run.ts:380` `planProtectedPublish` | 셀 0·언어 작업 > 0에서 동작 확인(테스트) |
| 조기 종료 ② `lib/pull/run.ts:387` 전부 보류 → `skipped/withheld` | 언어 작업도 0일 때만 |
| 조기 종료 ③ `lib/nightly/plan.ts:70` `upToDate` | `LocaleChange` 행이 있는 소스는 이 출구 전에 PR/MR 조회·만료(:74 게이트 앞). 조회 실패는 `pr-check-failed` |

- 모든 번역 셀이 보류여도 안전한 삭제만 전달할 수 있다.
- `Translation` 행 자체가 없어 `maxUpdatedAt=null`이어도 언어 변경을 실행·확인할 수 있어야 한다. 셀 전달 확인과 언어 목록 확인을 분리한다.
- `publishFingerprint`, 수동 Sync 폐기 지문, 소스 제거·재등록 승인 지문에 언어 변경 행과 전달 목록을 넣는다. 오래된 승인은 거부한다.
- 삭제 파일은 `split.delivered`/번역 baseline 확인 대상이 아니다. 파일 제거 성공으로 셀 편집 전달을 기록하지 않는다.
- 사건·응답은 번역 전달 수, 삭제 파일 수, 취소, 보류 사유를 구분한다. `/api/push`의 새 deferred 사유(`locale-change-pending`)가 생기므로 ACTIONS·수동/야간 결과 문구를 함께 갱신한다.
- PR/MR 본문에 삭제 파일이 있으면 “앱 코드의 이 언어 참조를 정리해야 한다” 안내를 붙인다(호스트 공통 본문 생성기).

## 5. Sync·수명주기·화면 영향

| 자리 | 변경 |
|---|---|
| 자동 CI·야간 적재 | 빈 ADD orphan 제외; 전달 전 REMOVE 전체 보류; 열린 PR 보호; 만료 판정 |
| 수동 Sync | 셀 편집과 언어 변경 목록을 함께 승인. 성공한 strict 적재만 의도 정리 |
| 소스 제거·재등록 | 언어 변경 행·전달 목록도 소스 지문에 포함. 이전 삭제가 새 설정/연결로 새어 나가지 않음 |
| Revert | 셀 복원 계약 유지. REMOVE 중 쓰기 거부 |
| 완료율·Home·Keys 검색·Inbox | ADD 포함, REMOVE 작업 대상 제외 |
| Sources | REMOVE 행 유지·취소. orphan은 Inactive(danger 톤 유지, 원인 단정 없음), Open 비활성 유지 |
| 기준 언어 후보 | ADD·REMOVE 제외, 서버에서도 판정 |
| Publish 미리보기·결과 | 파일 `New file`/`Updated`/`Removed`, 빈 ADD, 보류 이유, PR 갱신 필요를 표시 |
| MCP 조회 | 상태와 전달 여부를 싣고 편집 불가 이유 노출 |
| 로그 | 요청·취소·전달·만료(반영/미반영) 구분. 실제 관측 없이 “삭제 완료”를 남기지 않음 |

PR/MR 상태 표시는 서버가 마지막으로 관측한 결과만 쓴다. Sources 진입 시 호스트를 호출하지 않는다. 조회 실패는 기존 `prCheckFailed` 배지를 재사용한다.

## 6. UI·MCP·사건

소스 상세 Languages 카드의 Add language와 행별 동작. 활성·ADD 행은 `Remove language` 하나(Dialog가 상태별 효과를 설명), REMOVE 행은 `Cancel removal`. 상세 프레임은 design-brief.md가 정본이다. OWNER만 변경하고 EDITOR는 상태·이유를 볼 수 있다. 비지원 소스는 추가·제거 모두 이유와 함께 비활성화한다.

**열린 번역 화면의 미저장 입력:** draft는 선택한 키 하나의 로케일별 값이고 저장은 키 단위다(`lib/translations/draft.ts`). 서버 갱신이 REMOVE를 알리면 그 언어의 dirty 셀을 버리지 않고 `readOnly`로 얼리고 save payload에서 뺀다. 버리기는 기존 셀 `reset`을 보이는 버튼으로 노출한다. 제거가 취소되면 얼린 값이 그대로 편집 가능해진다(별도 복구 동작 없음). 이동은 기존 이탈 확인이 dirty 로케일로 처리한다. 상세 데이터(`lib/translations/summary.ts`)에 REMOVE 언어를 읽기 전용으로 싣는다. 렌더와 저장 사이에 제거가 도착해 서버가 키 저장을 거부하면 입력을 유지하고 전용 footer 문구를 띄운다(키 단위라 다른 언어도 저장되지 않았음을 말한다).

orphan의 Inactive 표시는 발생 원인을 단정하지 않는다. 기존 `orphanStrip`의 “was removed from the repository”를 원인 중립 문구로 바꾼다. 영구 출처 필드를 만들지 않고 사건이 이력을 설명한다.

MCP 도구는 `add_locale`(WRITE), `preview_locale_removal`(READ — 제거와 추가 취소 둘 다), `remove_locale`(DESTRUCTIVE — ADD 행이면 추가 취소), `cancel_locale_removal`(WRITE)이다. 모두 `project:settings`를 요구하고 `remove_source`와 같은 `req(...)` 형이다. 코어는 Action을 부르지 않는다. 응답·오류는 영어 코드다.

SURFACE 사건 subtype은 `surface.localeAdded`, `surface.localeRemovalRequested`, `surface.localeChangeCancelled`, `surface.localeChangeResolved`이고 payload에 locale·operation·outcome·revived 등을 명시한다. `lib/events/view.ts`가 모르는 SURFACE subtype을 “source added”로 그리는 폴백을 분기하고, `lib/events/query.ts`의 결과 필터 술어도 대조한다. 옛 payload는 새 필드 없이도 읽힌다.

## 7. 스키마·정본·배포

- `LocaleChange`(operation enum·복합 FK·인덱스)와 `deliveredLocaleChanges`는 additive. Locale 복합 FK는 Restrict, 기존 행 백필 없음(기존 소스는 빈 목록). 기존 `orphaned` 의미를 재사용하고 영구 데이터를 삭제하지 않는다.
- SELF-HOSTING §3: 중간 앱 버전을 거치지 않는 업그레이드, 새 테이블 권한은 `deploy/bootstrap.sql` default privileges로 검증. 새 env·패키지·cron 없음.
- **롤백·재배포**: 구버전은 `LocaleChange`를 모른다. ADD 언어는 다음 적재에서 orphan되고(값 보존), 삭제는 보내지 않는다. 데이터 손실은 없다. 신버전을 다시 배포하면 orphan Locale에 ADD 행이 남는 불일치가 생길 수 있으므로, 신버전은 “orphan인데 ADD 행” 같은 모순 행을 만료로 처리한다(테스트 포함). 구버전 구간에는 locale 사건이 “source added”로 보일 수 있음을 운영 문서에 남긴다.
- **정본 경계 문장(ARCHITECTURE 불변식 1 예외)**: DB 의도는 ① Publish 파일 집합과 ② 자동 적재 보류만 바꾼다. 최종 존재는 의도 만료 뒤 strict 적재와 같은 판정이 정한다. 의도와 리포 관측을 비교해 고르는 코드는 없다.
- PRODUCT §7.2, ARCHITECTURE 불변식 1·4·9와 Publish/적재 절은 tasks §0에서 코드보다 먼저 고친다. DESIGN Sources·Publish, ACTIONS deferred 계약, CLAUDE 데이터 경로, DIRECTORY, MCP 가이드·세 언어 원고는 tasks §8.

## 8. 과거 함정과 구현 전 확인

- POSTMORTEM 2026-09-27 경로 안전 vs 옳음: 코드 모양과 경로 소유를 따로 검증. 삭제에도 같은 경계.
- 2026-09-27 base 파일을 못 읽은 Publish가 “Nothing to send”: base 읽기 실패를 삭제·`no-changes`로 기록하지 않는다.
- 2026-09-16 미리보기가 첫 파일을 고름: ADD 미리보기의 diff 경로 = 서버 계산 경로.
- 2026-09-24 Chrome `placeholders: null`, 2026-09-29 빈 `{}` 중첩: 새 파일 렌더 테스트.
- 2026-10-07 파일 쓰기 성공 ≠ 값 전달: 삭제를 셀 전달로 세지 않는다.
- 2026-10-07 야간 원격 관측을 최신으로 취급: 만료는 잠금 뒤 재대조.
- 2026-10-09 stale 교체: 기존 RUNNING 실행권·`publish-unsettled` 재사용.
- translation-rework의 마운트 시점 로케일 목록: 추가·제거·취소 후 열린 번역 화면의 편집 가능 상태를 DOM 테스트한다.

구현 전 확인(tasks §0): Chrome 공식 지원 목록·목록 밖 디렉터리 동작, GitHub/GitLab 삭제 계약, `deliveredLocaleChanges` 위치, `pendingWhere` 소비자 목록이 이 설계에서 바뀌지 않음, Sync 강제 폐기 경로.
