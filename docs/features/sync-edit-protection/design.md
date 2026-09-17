# design — Sync 편집 보호와 PR 인계

상태: D1 프로젝트 전체 보류, D2 열린 PR 수동 갱신과 검수 보완을 반영했다. 아래 계약을 구현 인터페이스와 검증의 기준으로 삼는다.

## 1. 현재 배선과 변경 지점

| 흐름 | 현재 위치 | 변경 |
|---|---|---|
| CI 생산자 | `scripts/push-local.ts`, `lib/push/payload.ts`, composite action | 읽은 리포 원본의 완전한 파일 목록·blob SHA 전달 |
| CI 적재 | `app/api/push/route.ts`, `lib/push/apply.ts` | 잠금 안에서 pending과 기준본 비교, 적용/보존/보류 |
| 최초 적재 | `lib/onboarding/ingest.ts`, 프로젝트 생성, Add surface | 성공한 원본 스냅샷과 함께 기준본 저장 |
| 수동 Sync | `lib/import/run.ts`, `surface.ts`, `confirm.ts`, 관련 Action/UI | 폐기 승인과 실행권, 표면별 결과 |
| 편집 | `app/(edit)/actions.ts`, `lib/keys/save.ts` | 저장마다 편집 토큰 발급, Project 잠금과 인가 재검사 |
| Publish | `lib/sync/run.ts`, `lib/pull/load.ts`, `run.ts` | 실행권 상호 배제, 최신 리포 검사, 정확한 편집 전달 처리 |
| 미리보기 | `lib/publish/read.ts`, Publish 모달 | stale 안내, 기존 PR 대비 교체 내역, 실행 전 재검사 |
| 집계 | `lib/keys/view.ts`, `query.ts`, 목록 raw SQL | 시각 대신 동일한 pending 토큰 술어 |

기존 어댑터의 렌더링과 결정성 계약은 바꾸지 않는다. 내부 변경은 Server Action, 외부 CI만 Route Handler다.

## 2. 기준본: DB 값이 아닌 리포 원본의 지문

`RepositoryBaselineV1`(JSON)은 schema version, repositoryId, baseBranch, adapterName, pathTemplate,
baseLocale, files(`{path, blobSha}`의 정렬 배열)를 가진다. 커밋 SHA는 비교 지문에 넣지 않는다.
파일 경로는 리포 루트 상대 경로이며 중복·탈출·잘못된 SHA·과다 항목을 검증한다.
배열은 UTF-16 코드 유닛 순으로 정렬한다. 같은 입력은 같은 지문이다. 내용은 Git blob 해시이며 JSON 직렬화 값 해시가 아니다.

- 전체 트리에 확정 `pathTemplate`을 적용한다. `templatePaths`와 어댑터별 대상 선택 계약을 재사용/공유해 새 로케일도 찾는다.
- 성공적으로 파싱된 파일 목록이나 DB `Locale` 목록만 사용하지 않는다. 파싱 실패/다운로드 실패 파일도 원래 대상 집합에 있어야 한다.
- 파일 삭제는 경로 집합 차이, 표면 설정/기준 언어 변경은 scope 차이로 판단한다. 선언된 base 변경도 자동 우회하지 않는다.
- 완전 적재와 기준본 저장은 같은 tx다. 부분 적재는 기존 부분 결과를 유지하되 기준본을 null로 무효화한다. 부분 DB를 완전한 원본과 같다고 인증하지 않는다.
- 검증된 정상 빈 카탈로그는 완전한 기준본을 가질 수 있다. 깨진 파싱과 구분하는 `verifyEmptyCatalog`를 유지한다.
- 최초 적재 전/구 클라이언트/기존 행의 null은 unknown이다. 현재 DB 값에서 역으로 기준본을 만들어서는 안 된다.

### CI 계약

`PushPayload`에 optional `repositorySnapshot`을 추가한다. 서버는 포맷·경로·개수·리포 scope를 검사하되
manifest를 리포 쓰기 경로로 사용하지 않는다. push 토큰 소유자가 제출한 값이라는 기존 신뢰 경계는 유지하며
이번 변경을 악성 push 토큰 방어로 주장하지 않는다.

**D1에 따른 기존 결정 변경:** `/api/push`는 현재 GitHub을 부르지 않지만, 프로젝트에 pending이 있으면
installation reader로 **요청 commitSha의 완전한 트리**를 읽어 모든 활성 표면을 비교한다. 표면별 payload만으로는
아직 요청이 오지 않은 다른 표면의 변경을 알 수 없기 때문이다. 리포 id 제한·재대조와 기존 tree 예산을 유지한다.
pending이 없으면 기존 표면별 적재 경로를 유지한다. pending이 판정 도중 새로 생기면 전체 snapshot을 준비해 재판정하거나 보류한다.
다운로드한 번역 값을 DB와 병합하지 않는다. 조회 실패/예산 초과는 확인 불가 보류다.
이번에는 요청 묶음 API·서버 캐시를 새로 만들지 않는다. 다중 표면의 CI 요청마다 트리 조회가 반복되는 비용을 감수한다.

새 CLI는 대상 파일을 동일한 HEAD에서 읽고 manifest와 payload를 함께 만든다. 작업 트리로 파싱한 값에 HEAD의 SHA만 붙이면 안 된다.
안전한 최소 구현은 대상 로케일 파일의 untracked/modified/deleted 상태를 거부하고 Git blob 바이트로 파싱하는 것이다.
대상 경로의 Git 필터·CRLF 변환으로도 manifest와 파서 입력이 달라지지 않게 한다. 일반 코드의 dirty 상태는 이 검증과 별개다.
CLI의 로컬 dirty 로케일 적재 동작 변경은 ACTIONS에 명시한다. 임의 우회 플래그는 만들지 않는다.

구 payload도 수신한다. pending 없음이면 기존 적재 + baseline null, pending 있음이면 `baseline-unavailable`로 보류한다.
그 상태의 Publish는 보호 근거가 없어 막는다. 새 CLI 또는 OWNER의 정상 수동 Sync로 기준본을 확립한다.
불변 action 태그는 자동 이동하지 않는다. 새 버전 릴리스·대상 workflow 갱신이 구현 배포 태스크다.

## 3. 미전달 편집의 식별

추가 제안: `Translation.pendingEditToken String?`. 저장 값이 실제로 바뀔 때 서버가 UUID를 새로 발급하고 값과 함께 쓴다.
no-op 저장은 토큰을 바꾸지 않는다. 저자는 계속 `updatedBy`, 시각은 계속 `updatedAt`이 담당한다.

- pending 술어: 활성 표면, `StringKey.orphaned = false`, `Locale.orphaned = false`, `pendingEditToken != null`. 키·로케일 관계는 같은 projectId·surfaceId로 제한한다. 화면·count·목록 raw SQL·Sync 승인 건수·Publish 대상이 같은 술어를 쓴다.
- Publish는 이 범위의 값과 `(translationId, pendingEditToken)`을 같은 RepeatableRead 스냅샷에서 읽는다. 전체 export 스냅샷과 전달 확인할 편집 집합은 구분한다.
- 전달 성공 후 캡처 집합에 포함되고 현재도 활성 셀이며 토큰이 같은 행만 null로 만든다. 새 저장은 다른 토큰이므로 남는다. orphan 셀은 writer 경고 여부와 무관하게 전달 확인에서 제외하며 값·저자·남아 있는 토큰을 이 경로에서 바꾸지 않는다.
- strict 적재는 실제 덮인/비활성화된 해당 표면 편집의 토큰을 정리한다. 활성 셀의 토큰만 지우고 편집값을 남기지 않는다(§4의 빈값·누락 처리). 실패/미적용 파일의 토큰은 보존한다. pending 상태에서 자동 적재는 금지되므로 수동 폐기 승인 또는 pending 없음일 때뿐이다.
- 프로젝트 전체 시각 watermark를 pending 판정에 더 이상 사용하지 않는다. `lastPulledAt`의 다른 소비자(신규 키/최근 활동 등)는 따로 유지한다.
- writer가 버린 셀을 전달 처리하면 안 된다. 이번 범위에서는 **writer 경고가 있으면 GitHub 쓰기 전에 전체 중단**하는 보수적 정책을 채택한다. 셀별 부분 전달 추적은 만들지 않는다.
- 결과가 base와 동일하면 동등 확인으로 캡처 편집을 해제할 수 있다. 열린 PR의 반대 변경 제거가 필요한 경우에는 승인된 수동 실행에서 실제 branch 갱신 성공 후에만 해제한다.

토큰은 동시 공동 편집 기능이 아니다. 전송 응답이 늦게 도착해 새 저장까지 전달 처리하는 경합을 막는 식별자다.
orphan이 다시 활성화되면 실제 리포 적재에 의한 값·토큰 정리는 strict 계약을 따른다. 비활성 상태에서 전달됐다고 간주하지 않는다.

## 4. 프로젝트 전체 자동 적재 판정과 저장

순서: 인증 scope → 기존 archived/format/stale-commit 검증 → 실행권 → 기준본 비교 + pending → mutation.
Project → Surface 잠금 순서를 지키고 최종 판정과 적용을 같은 tx에 둔다.
원격 조회 전 Project 잠금 아래에서 전체 pending/표면 설정/importRevision/baseline 지문을 캡처하고 잠금을 해제한다.
GitHub I/O 후 같은 잠금을 다시 잡아 모두 재검사한다. 바뀌었으면 준비 결과를 버리고 보류/재시도하며 이전 판정으로 적용하지 않는다.
모든 저장·적재·표면 설정 변경도 Project 잠금에 참여해야 한다. 일부 writer만 참여하면 전체 보류를 보장할 수 없다.
pending은 프로젝트 전체, 비교는 요청 commitSha의 전체 활성 표면이다. 한 곳 changed/unknown이면 요청 표면에 관계없이 보류한다.

- `apply`: 아래 빈값·누락 계약을 보완한 strict SQL과 pending 정리, 완전하면 baseline 갱신, 결과 상태 갱신.
- `preserve`: 키/번역/저자/refs/선언/적재 기준본을 건드리지 않는다. 확인한 commit과 확인 시각만 갱신한다. refs는 마지막 적재 시점 자료로 남는다.
- `defer`: 키/번역/기준본 불변. 보류 사유와 관측 commit 저장. 성공 시각은 그대로다.
- `fail`: 기존 실패 계약. 리포 변경과 조회 실패를 구분한다.

### 완전 적재의 빈값·누락 셀

현재 `lib/push/apply.ts`는 `t.value !== ""`인 번역만 upsert한다. 이 SQL을 그대로 재사용하면
리포가 빈값이거나 셀이 없을 때 앱 편집값이 남으므로, 폐기 승인 계약을 충족하지 못한다.

- 적용 후에도 활성인 키·로케일의 명시적 빈값은 `value = ""`로 저장한다. 완전 적재에서 해당 셀이 리포에 없으면 기존 Translation 행의 값을 `""`로 비운다. 누락 셀마다 새 행을 생성하거나 기존 행을 삭제하지 않는다.
- 값 교체와 `updatedBy = null`, `pendingEditToken = null`, 적재 시각 갱신은 같은 tx에서 실행한다. 리포에서 사라진 셀의 description·placeholders도 정리해 이전 메타데이터가 export에 재등장하지 않게 한다.
- 누락 여부는 전체 대상 파일의 다운로드·파싱 성공이 확인된 표면에서만 판정한다. 구 payload처럼 완전성을 증명하지 못하거나 일부 파일이 실패하면, 들어온 셀의 적용과 별개로 부재를 근거로 한 초기화를 수행하지 않는다. 실패/미적용 파일의 값·저자·토큰은 그대로 남고 baseline은 null이다.
- 키나 로케일 자체가 사라진 경우는 활성 셀의 누락과 구분한다. orphan 번역 값은 비활성으로 보존하며, 정상 빈 카탈로그도 기존 키를 orphan으로 만드는 계약을 유지한다. 실패 파일을 근거로 비활성화하거나 편집을 폐기하지 않는다.
- 이 처리는 `apply`가 허용된 경우에만 수행한다. `preserve`·`defer`에서는 빈값 정리 SQL도 실행하지 않는다. 각 쿼리는 projectId·surfaceId로 제한한다.

### 관측 상태와 응답

`lastCommitSha/At`는 표면별 실제 적재의 증거로 유지한다. 프로젝트에 별도의 전체 관측 SHA/commit 시각/확인 시각을 둔다.
pending 없는 표면별 적재는 프로젝트 전체 확인 시각을 전진시키지 않는다. 해당 표면의 적용 사실만 갱신한다.
보류 사유도 Project가 소유한다. 이를 해제하려면 전체 재검사 또는 pending 0 확인이 필요하며, 한 표면 성공만으로 지우지 않는다.
역행 검사는 마지막 적용과 마지막 수락된 관측 양쪽을 고려한다. 오래된 요청은 보류 상태도 지우지 못한다.
동일 commitAt의 서로 다른 SHA 순서는 증명하지 못하므로 보수적으로 보류한다(기존 시각 기반 가드의 한계).
확인만 성공했다고 `declaredBaseLocale`을 소비하지 않는다.

API: HTTP 200의 닫힌 union `status: applied | unchanged | deferred`, 보류 reason과 surfaceSlug.
deferred는 큐에 넣었다는 의미가 아니므로 202를 쓰지 않는다. 기존 실제 오류는 4xx/5xx 유지.
CLI는 200 deferred에서 exit 0 + Actions warning을 내고 `imported`라고 출력하지 않는다.
실패 보고 endpoint가 늦게 와도 더 최신 관측/적용 상태를 덮지 않도록 기존 실행 토큰 검사를 함께 확장한다.

## 5. 수동 Sync와 경합

확인 정보는 사용자·projectId·활성 표면/설정·현재 pending 셀의 id/token 정렬 지문에 묶는다.
클라이언트의 `discard: true`만 믿지 않는다. 기존 HMAC 확인 패턴을 재사용하고 짧은 유효기간을 적용한다.
토큰은 승인된 편집 집합을 증명할 뿐, 이후 저장을 버릴 포괄 권한이 아니다. 만료는 발급 후 5분이다.

실행권 획득 tx에서 Project 잠금 → OWNER 재인가 → 승인 지문 재검사 → 기존 repositoryImportToken 획득.
수동 Sync 실행 중 `saveTranslation`은 Project 잠금 뒤 활성 import를 확인해 재시도 가능한 거부를 반환한다.
UI는 미저장 입력을 남기며 저장 성공처럼 표시하지 않는다. CI도 활성 수동 import/Publish와 겹치면 보류한다.
Publish 시작도 활성 수동/CI 적재와 상호 배제한다. GitHub I/O 동안 DB 잠금을 유지하지 않는다.
승인 재사용은 실행권·설정/importRevision·현재 pending 지문을 함께 대조한다. 성공/부분 적용/새 편집 뒤에는 거부한다.
아무 데이터도 바뀌지 않은 일시 실패 뒤 같은 상태로 재시도하는 것은 유효기간 내 허용한다. 일회용 소비 저장소를 별도로 만들지 않는다.

기존 수동 Sync의 표면별 적용/부분 성공은 유지한다. 각 표면의 적용 tx에서 실행권·revision·설정을 다시 확인한다.
실패/보류/승인 불일치 모두 자기 실행 표시만 정리하고 캐시를 무효화한다. 다른 실행의 상태를 지우지 않는다.
`lib/import/confirm.ts`의 `recommendSend`는 pending 건수뿐 아니라 Publish 가능 여부를 받는다.
리포 변경·기준본 없음·확인 불가 상태에서는 `Send changes first`를 숨기고 보존 중인 편집과 승인 시 폐기 범위를 설명한다.
EDITOR에게는 OWNER 안내만 제공하며, 실패한 Publish와 Sync 사이를 반복 이동시키지 않는다.
Publish 중 저장은 허용한다. 적재와 설정 변경은 실행권으로 차단하며 추가 저장은 편집 토큰으로 보존한다.
stale 실행권의 종료는 기존 제한을 유지하되 외부 쓰기 직전 소유권을 재검사한다. 네트워크 쓰기와 DB를 하나의 원자 트랜잭션으로 보장하지 않는다.

## 6. Publish 검사와 PR 인계

pending 0이면 모든 트리거에서 즉시 no-edits. `maxUpdatedAt`만으로 실행 여부를 정하지 않는다.
나머지는 같은 스냅샷의 활성 표면 기준본 전체와 GitHub의 단일 base snapshot을 대조한다.
변경/unknown이면 쓰기 0회, pending 해제 0회. 최신 ref를 부모로 다시 읽지 않는다.
쓰기 중 base에 새 commit이 생기는 것은 GitHub PR 검토 영역이다. 검사한 snapshot에 대한 보장만 한다.

미리보기는 실행 허가의 정본이 아니다. 실행 시 조건을 다시 검사한다. 미리보기 이후 pending/기준본/열린 PR head/base SHA가 달라지면
쓰기 전에 `preview-stale`로 돌려주고 새 미리보기를 요구한다. HMAC은 이 네 요소와 표면 설정을 포함한 서버 발급 snapshot 지문·사용자·project·유효기간에 묶는다.
일반 코드만 바뀌어도 PR head 대비 제안 결과가 바뀔 수 있으므로 base SHA를 생략하지 않는다. 새 미리보기에서 승인하면 일반 코드 변경은 정상 통과한다.
미리보기의 기존 base 대비 목록에 더해 **기존 PR head → 제안된 결과**의 파일 diff를 제공한다.
기존 PR의 사람 수정까지 빠뜨리지 않도록 키 목록만으로 대신하지 않는다. 전체 diff를 읽지 못했거나 일부 페이지가 아직 준비되지 않았으면 실행을 허용하지 않는다.

### PR 파일 diff 표시와 큰 변경

- 기존 736px Publish 모달에서 셀 목록은 `Repository base → App translations`, 별도 파일 diff 구역은 `Current pull request → Proposed result`로 제목·접근 이름을 구분한다. 열린 PR이 없으면 후자는 생략한다.
- 파일 경로·추가/수정/삭제와 텍스트 hunk를 표시한다. 주석이나 일반 코드의 사람 수정도 키·로케일 행으로 억지 변환하지 않는다. 기존 mono·상태 토큰을 사용한다.
- 기존 셀 `PREVIEW_LIMIT = 200`을 전체 잘림 한도에서 페이지당 표시량으로 바꾼다. 파일 diff도 경로·hunk 순으로 페이지를 나누며 한 파일이 길면 hunk/줄 단위로 이어서 표시한다. 페이지 크기를 전체 실행 한도로 쓰지 않는다.
- 각 페이지는 같은 DB 편집 snapshot·base SHA·PR head에 묶는다. 페이지 사이 snapshot이 바뀌면 전체 미리보기를 새로 받아야 한다. 서버가 전체 변경 목록과 페이지 완전성을 확인하고 모든 페이지를 제공한 뒤 확인 버튼을 활성화한다. 사람의 실제 독해 여부를 증명한다고 주장하지 않는다.
- 페이지 이동은 키보드로 가능하고 제목으로 포커스를 옮기며 현재/전체 페이지 수를 알린다. 승인 버튼까지 스크롤로 도달할 수 있어야 한다. 로딩·빈 diff·읽기 실패·preview-stale은 모달 내 단일 결과 영역에서 설명하고 재조회 동작을 제공한다.
- 원격 읽기의 기존 자원 예산은 유지한다. 실제 예산 초과는 부분 diff 승인으로 우회하지 않는다. 재조회로도 해소되지 않으면 기존 PR을 GitHub에서 검토·처리한 뒤 새 미리보기를 여는 경로를 안내한다. 일반적인 표시량 초과는 페이지 이동으로 해결한다.

### 실행과 전달 확인

D2 확정: cron은 pending이 있어도 열린 PR이 있거나 조회 불가면 쓰지 않는다. 열린 PR을 갱신하려면 사용자 미리보기 승인이 필요하다.
이 보류는 리포→앱 Sync 보류와 별개다. Sync 보류용 Project 컬럼에 쓰지 않고 Publish 결과의 reason으로 표현한다.
수동 Publish의 재사용 branch 강제 갱신 자체는 유지한다. 사용자가 승인한 교체이며 이전 PR 값을 DB로 합치지 않는다.
새 편집 없는 cron은 PR 조회/force update/되돌림도 하지 않는다.

GitHub write 후 DB 전달 기록 실패는 unknown + pending 유지. 재시도는 실제 PR head/내용을 확인하고,
같은 결과가 이미 전달됐으면 확인 후 해제한다. ‘보냈을 수도 있음’을 ‘아직 보내지 않음’으로 단정하지 않는다.

## 7. 순수 함수 — `/tdd interface` 대상

이름은 제안이며 client-safe 판정과 crypto/I/O 모듈은 분리한다.

| 함수 | 입력 → 출력 | 필수 반례 |
|---|---|---|
| `compareRepositoryBaseline` | scope/정렬 파일 목록 두 개 → same/changed/unknown + 경로 | 신규 로케일, 삭제, 서식, scope 변경, 순서만 다른 목록 |
| `planProtectedImport` | 비교/pending/mode/승인/실행권 → apply/preserve/defer/reject | 동일+pending에서 apply 금지, 수동 승인 우회 |
| `planProtectedPublish` | pending/표면 비교/trigger/PR 상태 → proceed/skip/reject | 표면 하나만 stale, 열린 PR unknown, pending 0 |
| `pendingEditIdsToAcknowledge` | 활성 셀 캡처 집합/현재 활성 여부·토큰 → 해제 대상 | 같은 ms의 새 저장, orphan 키/로케일, 삭제/다른 project |
| `planDiscardConfirmation` | 승인 snapshot/현재 snapshot/인가/유효기간 → proceed/reconfirm/reject | 같은 건수 다른 편집, 설정 변경, 재사용 |
| `planSyncProtectionView` | 보류/unknown/관측·적재 시각/역할/Publish 가능 여부 → 문구·액션 | EDITOR Sync CTA 금지, 막힌 Publish를 다시 권하지 않음 |

DB 조건부 UPDATE가 토큰 판정의 실제 방어선이다. 순수 함수 결과를 선조회한 뒤 무조건 UPDATE하는 구현은 금지한다.

## 8. 스키마·배포

**additive 제안**, 컬럼 삭제 없음. 최종 이름은 TDD 인터페이스에서 고정한다.

| 대상 | 추가 필드 | 의미 |
|---|---|---|
| Translation | `pendingEditToken String?` | 아직 전달 확인되지 않은 마지막 편집 |
| TranslationSurface | `repositoryBaseline Json?` | 완전 적재 원본의 versioned manifest |
| Project | `lastObservedCommitSha String?`, `lastObservedCommitAt DateTime?`, `lastRepositoryCheckedAt DateTime?` | 전체 활성 표면에 대한 최신 수락 관측 |
| Project | `syncDeferredReason String?` | closed code: repo-changed / baseline-unavailable / busy; 실패 컬럼과 분리 |

기존 편집은 전환 직전의 저자·시각 기반 술어에 §3의 활성 셀 조건을 추가해 토큰을 채운다.
기존 술어와의 차이는 orphan 키·로케일 제외분으로 따로 보고하며, 활성 셀의 누락은 0이어야 한다.
orphan 값·저자는 보존하고 토큰을 새로 만들거나 전달 완료로 처리하지 않는다. 이미 dual-write한 토큰은 재발급하지 않는다.

기존 baseline은 null이다. 마지막 적재가 완전했다는 증거와 당시 scope를 확인할 수 있을 때만 그 SHA의 완전 트리에서 복구한다.
최신 리포나 DB 값으로 소급 인증하지 않는다. 미전달 편집이 있는 프로젝트의 활성 표면 전체에 이 근거를 확보하지 못하면 **새 판정 배포를 보류**한다.
기존 편집을 정상 PR 인계한 뒤 pending 0에서 완전 Sync로 기준본을 확립하는 운영 경로는 허용하지만, 전환 스크립트가 편집을 버리거나 Publish 성공을 가정해서는 안 된다.

배포는 기능 플래그 없이 두 번으로 나눈다. 태스크의 Commit 번호는 작업 구분이며 전부 합쳐 한 번에 배포하지 않는다.

1. **호환 배포 A:** additive migration, 저장 토큰 dual-write, 기존 Sync의 실제 적용 셀 토큰 정리, 기존 Publish 성공의 캡처 토큰 CAS, 완전 적재 baseline 기록만 배포한다. 사용자 흐름·미전달 판정은 기존 계약이다. T9 보호 게이트·T11 새 술어·새 승인 UI는 포함하지 않는다.
2. **전환 준비:** 구 배포의 writer와 진행 중 실행을 배제하고, 저장·CI 적재·수동 Sync·cron/수동 Publish를 잠시 차단·drain한다. 이 운영 차단은 새 앱 설정 기능으로 만들지 않는다. null 토큰의 활성 편집만 backfill하고 집계·기준본 전환 조건을 전수 확인한다. 차단을 해제해 호환 코드로 돌아가면 배포 B 직전에 다시 검사한다.
3. **보호 배포 B:** 전환 조건을 만족한 상태에서 T9 이후의 보호 게이트·새 술어·승인 UI를 함께 배포하고 smoke 뒤 쓰기를 재개한다. 배포 B 실패 시 임의로 쓰기를 재개하거나 pending을 비우지 않는다. 호환 배포 A로 복귀할 때도 기존 정책이라는 사실과 재검사 필요를 운영 절차에 남긴다.

혼합 버전이 토큰 없이 편집을 저장하면 pending을 놓치므로 backfill을 먼저 하고 옛 writer를 계속 허용해서는 안 된다.
활성 셀의 기존/신규 술어 동등성과 orphan 제외 차이를 실제 PG로 검증한다. 기준본 없는 미전달 편집은 안내 문구만으로 전환 통과 처리하지 않는다.
구 action은 unknown 안전 경로로 유지하고 새 action 버전/대상 workflows를 이후 갱신한다.
dev DB는 preview 코드 전에, prod DB는 production 코드 전에 적용한다. 배포는 Claude Code 담당이며 이 문서 작업에서 실행하지 않는다.

새 환경변수 없음. `lib/onboarding/sample-confirmation.ts`와 같이 `AUTH_SECRET` 기반 HMAC을 사용하되
`malmoi:discard-sync:v1`과 `malmoi:publish-preview:v1`로 목적을 분리한다. 길이 제한·상수 시간 대조·만료·사용자/scope 바인딩을 검사한다.
`.env.local`은 읽거나 편집하지 않는다.

## 9. 불변식 영향과 회고 근거

- 값 소유권/병합: 리포끼리 파일 식별을 비교한다. DB 값과 리포 값의 승자를 고르지 않는다. 적용 허용 시 strict 유지.
- 결정성/blob SHA: writer 불변. 원본 blob SHA는 안전 게이트이고 출력 해시 비교를 대체하지 않는다.
- 키 보존: 보류 중 키를 갱신하지 않으며 적용 시 기존 orphan 정책 유지.
- 인가: projectId → surfaceId, OWNER 폐기, EDITOR Publish 유지. installation 토큰만 GitHub 쓰기에 사용.
- 결과 전달: 보류는 성공으로 접지 않고, 화면에서 적재 시각과 확인 시각을 혼동하지 않는다.

| POSTMORTEM 항목 | 이번 방어선 |
|---|---|
| 2026-08-31 외부 계약 페이로드 필수 필드 누락 | 생산자 하나, 구/신 payload 계약 테스트 |
| 2026-09-07 revalidatePath가 결과를 씻음 | 결과 호스트 유지, 실행 후 실제 UI 검증 |
| 2026-09-09 일회용 허가의 조기 소비 | 동일 확인 경로가 base 선언/폐기 허가를 임의 소비하지 않음 |
| 2026-09-09 되돌린 편집이 PR에 남음 | 사용자 승인 재Publish의 no-change branch 정리는 유지; 자동 무편집 정리만 금지 |
| 2026-09-13 임포트 종료 소유권 누락 | 적용·결과·표시 정리의 토큰 조건과 캐시 검증 |
| 2026-09-15 정상 빈 카탈로그 오판 | 파일 집합은 파서 출력에서 얻지 않음, empty 검증 유지 |
| 2026-09-15 설정 변경 뒤 진행 표시 잔류 | 거부 경로에도 자기 실행권 정리 |
| 2026-09-16 부분 실패를 미완료로 표현 | 표면별 applied/deferred/failed를 분리해 표시 |

## 10. 남는 한계

바이트 비교라 서식 변경도 중단한다. 리포와 앱이 같은 번역을 수정했을 때 자동 해소는 없다.
소스 경로 이동은 기존 포맷 가드의 제약을 유지한다. 보류 요청은 저장해 재생하지 않는다.
권한 있는 push 토큰이 거짓 manifest/값을 보내는 공격, 외부 GitHub/DB 간 exactly-once, 사람의 PR 수정 보호는 보장 범위가 아니다.
미리보기 이후 외부 PR head 경합은 쓰기 직전 재확인해 줄이되 GitHub의 원자 CAS 보장이 없는 한 완전 제거를 주장하지 않는다.
