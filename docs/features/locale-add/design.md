# Add and remove languages — 설계

작성: 2026-10-13 · 개정: 2026-10-14. spec의 추가·제거·취소 계약을 구현하는 설계다. 옛 `Locale.proposedAt` 하나로 제안을 표현하고 전달 때 지우는 안을 대체한다.

## 1. 상태 — 변경 의도와 전달 확인을 분리

`Locale.orphaned`는 비활성 보존을 계속 담당한다. **제거 요청 시 바로 orphan하지 않는다.** base에는 파일이 있고 취소하면 편집을 복구해야 한다. 대신 별도 언어 변경 상태로 작업 대상·렌더 대상을 가른다.

구현안은 소스·로케일당 현재 변경 한 행인 `LocaleChange`다. 일반 로케일은 이 행이 없다. 별도의 범용 작업 큐나 이력 테이블을 만들지 않는다. 이력은 기존 ProjectEvent에 남긴다.

| 필드 | 의미 |
|---|---|
| `projectId, surfaceId, localeCode` | Locale의 복합 키/FK, 한 언어당 한 행 |
| `operation` | `ADD`(새 파일 제안), `REMOVE`(파일 제외), `RESTORE`(전달된 제거를 취소해 파일 유지) |
| `origin` | `repository` 또는 `proposal`. 전달된 추가의 취소와 기존 언어 제거의 취소를 구분 |
| `token` | 현재 요청의 UUID. 동작 전환마다 재발급 |
| `deliveredToken` | 원격 스냅샷 전달이 확인된 token. 일치하면 전달됨, 불일치/null이면 미전달 |
| `requestedAt` | 요청 시각, UI·승인 지문 입력 |
| `deliveredOperation` | 마지막으로 확인된 원격 의도. token이 바뀌어도 deliveryRunId와 함께 유지 |
| `deliveryRunId` | 실제 확인된 SyncRun 참조. 그 실행의 PR/MR·대상 브랜치·커밋과 연결해 종료를 판정 |

이 행은 **현재 의도**라 종료 시 지울 수 있다. Locale·Translation·ProjectEvent는 지우지 않는다. `deliveredToken`을 현재 token으로 바꾸는 것과 변경 행을 제거하는 것은 다른 동작이다.

### 전이 표

| 현재 | 입력 | 다음 / 결과 |
|---|---|---|
| 일반 활성 | 제거 승인 | REMOVE 미전달. 편집 잠금, 값·토큰 보존 |
| 없음/orphan | 추가 | ADD 미전달, 활성화. 되살림의 값 있는 활성 셀에 토큰 재발급 |
| ADD 미전달, 외부 쓰기 없음 | 개별 취소 승인 | orphan, 변경 행 종료. 해당 셀 토큰은 승인 폐기로 해제, 값 보존 |
| ADD 미전달 | 번역 0 | 그대로. 파일 생성 없음, 자동 적재 전체를 막지 않음 |
| ADD 미전달 | Publish 성공 | ADD 전달됨. base 반영 전까지 제안 정보를 유지 |
| ADD 전달됨 | 추가 취소 승인 | REMOVE 미전달, origin=proposal. 다음 스냅샷에서 새 파일 제외 |
| REMOVE 미전달, 원격 삭제 이력 없음 | 제거 취소 | repository면 일반 활성, proposal이면 ADD로 복귀. 원격 갱신 필요 여부는 마지막 확인된 의도로 판정 |
| REMOVE 전달됨 또는 미전달이지만 마지막 확인 의도가 REMOVE | 제거 취소 | repository면 RESTORE 미전달, proposal이면 ADD 미전달. 원격 diff 갱신 필요 |
| REMOVE 미전달 | 삭제/제외 스냅샷 확인 | REMOVE 전달됨. 의도 유지 |
| RESTORE 미전달 | 유지 스냅샷 확인 | 일반 활성으로 종료. 기존 셀의 실제 전달 여부는 별도 판정 |
| ADD/REMOVE 전달됨 | 같은 PR/MR이 열려 있고 재Publish | 같은 파일 집합 의도를 다시 적용. 새 실행의 확인 정보로 갱신 |
| 전달됨 | 해당 PR/MR 종료 + 성공한 최신 base 관측/적재 | 파일 있음이면 활성, 없음이면 orphan. 실제 관측과 함께 의도 종료 |
| 모든 변경 | 지문 승인한 수동 Sync 성공 | 리포로 맞추고 변경 종료. 실패하면 의도 유지 |

**반복 취소의 전달 문맥:** operation/token을 바꿀 때 마지막 확인된 `deliveredOperation`·`deliveredToken`·`deliveryRunId`는 유지한다. REMOVE → RESTORE → REMOVE → 취소처럼 반복해도 원격에 마지막으로 삭제를 보냈다는 사실을 잃지 않는다. 원격 의도와 현재 의도가 달라지면 항상 미전달이다. proposal-origin REMOVE를 전달 전에 취소해 ADD로 돌아온 경우도 새 token으로 보수적으로 다시 확인하며, 값 0개여도 이전 PR diff 수렴이 필요하면 Publish 작업이다. 범용 전환 이력은 만들지 않고 이 마지막 확인과 ProjectEvent만 사용한다.

**원격 결과가 불명인 실행은 “미전달, 외부 쓰기 없음”이 아니다.** 기존 전달 무효화/실행 복구 경로로 실제 브랜치·PR 상태를 확인하기 전에는 개별 취소·다음 변경을 `publish-unresolved`로 거부한다. HTTP 실패만 보고 제안을 로컬에서 없애지 않는다.

### 종료 관측과 strict 적재

- **PR/MR 관측이 먼저다.** 미해결 전달 문맥이 있으면 야간의 `pending > 0 → Publish`와 동일 head의 `upToDate` 스킵 전에 연결된 PR/MR의 상태를 확인한다. 수동·MCP Publish도 스냅샷을 만들기 전에 같은 종료 판정을 지난다. 순서는 원격 PR/MR·필요한 base 관측 → Project→Surface 잠금 뒤 token·revision·설정 재대조 → 일치하는 의도 복구/종료 → 셀 편집·언어 변경 재집계 → Publish/적재/스킵이다. 이 관측은 strict 값 적재와 분리해, 편집 보호가 적재를 보류해도 종료 판정에 도달하게 한다.
- 미머지 종료는 base SHA를 바꾸지 않아도 다음 야간 방문에서 처리한다. 다른 언어에 미전달 편집이 있는 경우에도 종료된 ADD/REMOVE를 새 PR/MR에 그대로 재전송하지 않는다. 조회 실패·불명은 보류하며 과거 의도를 싣는 Publish로 진행하지 않는다. 미해결 전달 문맥이 없는 프로젝트는 기존 조회·스킵 순서를 유지한다.
- 자동 적재는 pending REMOVE/RESTORE가 있으면 전체 보류한다. pending ADD는 orphan 대상에서만 제외하고 셀 편집이 있으면 기존 보호가 전체를 막는다.
- 전달된 REMOVE의 셀 토큰은 남지만 자동 보호의 활성 편집 수에서는 제외한다. 열린 PR 보호가 그 기간을 맡는다. 닫힌 뒤에는 성공한 base 관측으로 파일 존재를 확인하고, **없을 때만** 해당 토큰을 `locale-removed` 사유로 해제한다.
- PR이 닫혔어도 base에 파일이 남으면 제거 미반영이다. 보존한 편집을 활성 복구한 뒤 다시 보호 판정한다. 미전달 셀이 있으면 그 적재의 strict 덮어쓰기는 보류한다. “닫혔다”만으로 값을 덮지 않는다.
- ADD 전달 뒤 base에 없고 PR이 종료됐으면 orphan한다. 미전달 셀은 삭제 전달 성공으로 처리하지 않고 비활성 보존한다. 재추가 시 새 토큰을 발급한다.
- 조회 실패·다른 PR·다른 브랜치·설정 변경·관측 뒤 새 Publish 경합이면 종료하지 않는다. Project→Surface 잠금 뒤 token과 DeliveryConfirmation revision/대상 설정을 재대조한다. 원격 결과를 잠금 밖에서 읽었어도 과거 결과가 새 요청을 닫지 못한다.
- 변경 중 source 제거·base branch/경로/연결 변경은 기존 승인 흐름에 변경 의도와 전달 맥락을 포함한다. 안전하게 폐기/수렴할 수 없는 변경은 `locale-change-pending`으로 거부한다. 다른 저장소에 이전 삭제를 보내지 않는다.

## 2. 어댑터·경로·파일 계약

초기 지원은 `json-catalog`·`chrome-locales`(`writeStrategy=regenerate`, `layout=per-locale`). 추가·제거·취소의 포맷 범위를 동일하게 한다. `yaml-catalog`·`code-dict`는 개별 파일이어도 이번 범위 밖이고, `ts-dict` 공유 파일의 로케일 객체 제거도 구현하지 않는다.

- 추가 입력: `isPathSafeLocale` ∧ `isLocaleShaped`, Chrome 지원 목록, `localeCollisionKey = code.toLowerCase().replace(/[-_]/g, "")`, 활성 200개 상한. 제거 예정·취소 중 행도 완료 전까지 상한에서 빼지 않는다.
- 경로는 서버의 소스 `pathTemplate`에서 계산하고 `isPathSafeRepoPath`와 기존 소스 간 경로 소유 판정을 지난다. MCP/Action은 임의 파일 경로를 받지 않는다.
- 제거는 현재 base의 정확한 대상 경로만 계획한다. 심볼릭 링크·비정규 파일·소유 겹침·소스 설정 불일치는 거부한다. 디렉터리 통째 삭제나 glob 삭제 없음. Chrome의 같은 디렉터리 다른 파일도 건드리지 않는다.
- 사용자 승인 지문은 로컬 token·셀 토큰·소스 설정에 묶는다. Publish 미리보기는 base head·대상 blob·삭제 경로에도 묶고, 실행에서 달라지면 재확인한다. 야간 자동 실행도 동일 소유/형식 판정을 적용한다.
- 현재 base에서 파일이 이미 없으면 삭제 API를 만들지 않는다. 다만 열린 sync PR의 과거 추가/삭제 diff 정리가 필요할 수 있어 `no-changes` 수렴까지 실행한다. 조회 실패는 파일 부재가 아니다.
- 동일 경로에 upsert·delete가 함께 있으면 계획 오류. 파일 정렬과 결과 정렬은 기존 결정적 비교를 사용한다.

`PullChange`/`SnapshotChange`를 upsert(내용·SHA)와 delete(경로)의 판별 union으로 바꾼다. GitHub 트리 payload와 GitLab commit actions 모두 명시적인 삭제를 지원한다. API 세부 계약은 구현 전 기존 host 코드와 공식 문서로 검증한다. 렌더 결과에서 언어를 제외하는 것만으로 삭제가 되었다고 판정하지 않는다.

**리포 파일 삭제는 DB 번역 삭제가 아니다.** 기준 언어 제거는 거부하고, 기준 변경 후보에서 ADD·REMOVE·RESTORE를 제외한다. base 변경과 제거는 같은 잠금 뒤 다시 판정한다.

## 3. 순수 판정과 쓰기 코어

| 자리(제안) | 역할 |
|---|---|
| `lib/locales/add-plan.ts` | 코드/충돌/상한/포맷과 create·revive·거부 판정 |
| `lib/locales/change-plan.ts` | 위 전이 표, 권한·기준·보관·실행 중·오래된 token 거부 |
| `lib/locales/chrome-codes.ts` | 출처·확인일 있는 지원 목록. 모든 코드가 두 검증을 통과하는 생성 테스트 |
| `lib/locales/publish-plan.ts` | 상태 × base 경로 → 생성·유지·삭제·보류·확인 대상 |
| `lib/locales/reconcile-plan.ts` | 전달 실행·PR 상태·base 관측 → 유지·활성 복구·orphan·보류 |
| `lib/locales/change.ts` | Action/MCP 공통 I/O 코어. 순수 판정 뒤 DB 변경과 사건 |

순수 함수는 클라이언트 잎으로 필요한 것만 노출하고 I/O 코어는 server-only다. 입력 코드를 객체 프로퍼티로 쓰지 않고 Map/배열을 쓴다. Chrome 지원 목록 ⊆ `isLocaleShaped` ∧ `isPathSafeLocale`를 검증한다.

쓰기는 `lockProjectAccess(project:settings)` → Surface 잠금 → 상태 재조회 → 판정 → Locale/LocaleChange/토큰/ProjectEvent를 같은 tx에서 변경한다. 미리보기는 읽기 전용이고 `revalidatePath` 없음. 성공한 웹 쓰기 뒤에만 revalidate한다.

제거·추가 취소 미리보기는 대상 파일, 값 있는 번역 수, 해당 언어의 미전달 수, 전달 상태와 서버 지문을 돌려준다. 실행은 같은 입력으로 지문을 다시 확인한다. 다른 언어의 편집은 승인 폐기에 포함하지 않는다.

**Publish 경합:** 기존 live SyncRun 예약과 언어 변경 Action/MCP가 Project 잠금 아래 상호 확인한다. 살아 있는 Publish 중 구성 변경은 `publish-running`, 원격 결과 미확정은 `publish-unresolved`다. 네트워크 동안 DB 잠금을 길게 유지하는 설계는 쓰지 않는다. 실행 스냅샷은 `(locale, operation, token)`을 캡처하고 확인 tx는 일치한 요청만 갱신한다. 기존 번역 셀 동시 저장은 기존 캡처 토큰 계약을 유지한다.

## 4. 추가 렌더와 제거/취소 Publish

### 추가의 기존 합의 유지

- 원본 없는 재생성 경로는 같은 소스의 base 원본을 표현 전용 입력(`styleFrom` 등)으로 받는다. 들여쓰기·CRLF·BOM·이스케이프·Chrome 필드 순서를 빌린다.
- `originalStructure`나 base 키 구조를 복제하지 않는다. 새 파일 구조는 소스의 `nested`·`nestedByPath`로 정한다.
- 미전달 ADD 경로가 이미 base에 있으면 해당 언어만 `proposal-path-exists`로 보류. 다른 편집은 전달할 수 있다. 성공한 적재가 실제 코드 존재를 받아들이는 길은 그대로다.
- 값 0개 ADD는 `null`, 상태 유지. 제안은 base 후보가 아니다. 재추가는 같은 행을 살리고 값 있는 활성 셀에 새 편집 토큰, `updatedBy`·값 유지, 새 TranslationBaseline 생성 없음.

### 파일 집합의 목표

1. 활성 일반 언어·ADD·RESTORE는 기존 렌더 대상으로, REMOVE는 렌더에서 제외한다.
2. REMOVE 경로가 base에 있으면 명시적 delete를 추가한다. 없으면 diff 항목은 없지만 sync 브랜치 수렴 대상으로 유지한다.
3. **전달된 REMOVE도 매 스냅샷에 다시 적용**한다. base 위에서 매번 재생성하므로 한 번 보낸 뒤 의도를 지우면 삭제가 사라진다.
4. RESTORE는 정상 렌더와 함께 이전 삭제 diff를 없앤다. 전달된 추가의 취소는 새 경로를 제외한 스냅샷으로 수렴한다. `changes=0`이어도 sync reset/불필요 PR 닫기가 끝나기 전에는 취소를 확인하지 않는다.
5. 전달 확인은 커밋 생성만으로 끝나지 않는다. 기존 Publish 성공 경계(브랜치·PR/MR까지)에 도달한 뒤 캡처 token을 확인한다. 실패·응답 유실·부분 완료는 의도를 유지한다.
6. 멱등 실행: base에 이미 없는 제거는 검증된 부재 및 sync 수렴이 확인되면 완료 가능하다. 이 `no-changes` 확인과 API 무호출 스킵은 구분한다.

### 집계·보호·전달 확인

`unpublished`를 가짜 Translation 토큰으로 늘리지 않는다. 셀 편집 수와 **미전달 언어 변경 수**를 별도로 싣고, `hasPublishWork`가 둘을 본다. REMOVE/RESTORE는 셀 0개여도 작업이고, 외부 전달 이력 없는 빈 ADD는 안내만 한다. 취소를 반복해 ADD로 돌아온 요청은 전달 문맥상 수렴이 필요하면 셀 0개여도 작업이다. 전달된 REMOVE는 단독 재실행을 만들지 않지만 다른 Publish의 스냅샷에는 계속 포함된다.

- `shouldSkipPull`, `planProtectedPublish`, `split.delivered=0 && withheld>0` 조기 종료도 언어 변경 작업을 고려한다. 모든 번역 셀이 보류여도 안전한 제거만 전달할 수 있다.
- `Translation` 행 자체가 없어 `maxUpdatedAt=null`이어도 REMOVE/RESTORE를 실행·확인할 수 있어야 한다. 번역 캡처 시각의 존재를 언어 작업의 전제로 두지 않고, 셀 전달 확인과 언어 token 확인을 분리한다.
- `pendingWhere`의 편집 가능 대상과 언어 변경 보호를 함께 갱신한다. REMOVE 셀은 활성 편집 집계에서 빼되, 미전달 REMOVE가 적재 전체를 보류한다. RESTORE 셀은 복구된 미전달 편집으로 센다.
- `publishFingerprint`, 수동 Sync 폐기 지문, 제거 소스 재등록 승인 지문에 변경 operation/token·전달 문맥을 넣는다. 오래된 승인은 거부한다.
- 삭제 대상 셀은 `split.delivered`/번역 baseline 확인 대상에 넣지 않는다. 파일 제거 성공으로 셀 편집을 전달했다고 기록하지 않는다.
- 사건·응답은 번역 전달 수, 삭제 파일 수, 취소 수, 보류 사유를 구분한다. API `/api/push`의 새 deferred 사유가 필요하므로 ACTIONS·수동/야간 결과 문구를 함께 갱신한다. 옛 설계의 “외부 계약 영향 없음”은 폐기한다.

## 5. Sync·수명주기·화면 영향

| 자리 | 변경 |
|---|---|
| 자동 CI·야간 적재 | 빈 ADD 제외 보존; REMOVE/RESTORE 미전달 보호; 열린 PR 보호; 종료 후 관측/복구 재판정 |
| 수동 Sync | 셀 편집과 언어 변경 목록을 함께 승인. 성공한 strict 적재만 의도 정리. 실패/재확인은 유지 |
| 소스 제거·재등록 | 제안/삭제/취소도 소스 지문에 포함. 이전 삭제가 새 설정/연결로 새어 나가지 않음 |
| Revert | 셀 복원 계약 유지. REMOVE 중 쓰기 거부, 취소 시 복구. 언어 삭제의 취소를 셀 Revert로 구현하지 않음 |
| 완료율·Home·Keys 검색·Inbox | ADD 포함, REMOVE 작업 대상 제외. RESTORE는 편집 가능, “취소 전달 필요” 표시 |
| Sources | REMOVE 행 유지, 읽기 전용 열기·취소. orphan은 Inactive로 표시하고 지원 포맷은 Add language 재추가, 비지원은 리포 복구 후 Sync 안내 |
| 기준 언어 후보 | ADD·REMOVE·RESTORE 제외, 서버에서도 판정 |
| Publish 미리보기·결과 | 파일 add/update/delete, 언어 변경, 빈 ADD, 보류 이유, PR 갱신 필요를 표시 |
| MCP 조회 | 상태와 전달 여부를 싣고 편집 불가 이유 노출 |
| 로그 | 요청·취소·전달·리포 반영/미반영 구분. 실제 관측 없이 “삭제 완료”를 남기지 않음 |

Sync는 기존 열린 PR 처리 계약을 유지한다. DB의 의도를 지웠다고 원격 diff까지 사라졌다고 말하지 않는다. 열린 PR과 충돌하는 강제 폐기가 허용되는 기존 경로라면 그 원격 영향도 승인에 표시하고, 안전한 수렴을 확인할 수 없으면 보류한다.

## 6. UI·MCP·사건

소스 상세 Languages 카드의 Add language와 행별 Remove language/Cancel addition/Cancel removal. 상세 프레임은 design-brief.md가 정본이다. OWNER만 변경하고 EDITOR는 상태·이유를 볼 수 있다. 비지원 소스는 추가·제거 모두 이유와 함께 비활성화한다.

**열린 번역 화면의 미저장 입력:** 서버 갱신은 이동이 아니므로 기존 이탈 확인만으로 처리하지 않는다. REMOVE로 바뀐 언어의 draft를 목록 필터링·서버 재검증으로 지우지 않고 읽기 전용으로 유지한다. 저장 payload는 편집 가능한 활성 언어의 dirty 셀만 담으며, 저장 성공도 그 셀만 갱신한다. 보존 입력은 선택·복사 가능하고 해당 언어만 명시적으로 폐기할 수 있다. 제거 취소로 다시 활성화되면 보존 입력을 편집 가능한 draft로 복구하되 자동 저장하지 않는다. 보존 입력도 미저장 판정·기존 복구 사본·이탈 확인에 포함한다. 저장 도중 제거 경합으로 서버가 거부하면 입력을 유지하고 최신 상태를 반영한다. DB의 미전달 편집 토큰과 이 로컬 입력은 별개다.

orphan의 Inactive 표시는 발생 원인을 단정하지 않는다. 영구 출처 필드를 새로 만들지 않고 기존 사건이 요청·취소·리포 반영 이력을 설명한다. 지원 포맷 OWNER에게 Add language 복구 경로를 제공하고 EDITOR에게는 OWNER가 재추가할 수 있음을 안내한다.

MCP 도구는 `add_locale`, `preview_locale_removal`, `remove_locale`, `cancel_locale_change`다. 추가 제안 취소도 미리보기 지문을 사용한다. preview는 READ, 나머지는 WRITE이며 모두 `project:settings`를 요구한다. 토큰의 READ/WRITE 권한과 프로젝트 역할을 교차 검증한다. 코어는 Action을 부르지 않는다. 응답·오류는 영어 코드다.

SURFACE 사건 subtype은 `surface.localeAdded`, `surface.localeRemovalRequested`, `surface.localeChangeCancelled`, `surface.localeChangeResolved`를 사용하고 payload에 locale·operation·outcome·revived 등 해당 사건의 필드를 명시한다. 기존 SURFACE 폴백이 “소스 추가”로 잘못 읽지 않게 분기한다. 전달 사건은 기존 Publish 실행 결과에 연결한다. 옛 payload는 새 필드 없이도 읽힌다.

## 7. 스키마·정본·배포

- `LocaleChange`와 필요한 enum/FK는 additive. Locale 복합 FK는 Restrict, 기존 행 백필 없음. 기존 `orphaned` 의미를 재사용하고 영구 데이터를 삭제하지 않는다.
- 기존 DELIVERY/SyncRun 참조의 보존 수명과 FK를 확인한다. 완료 기록을 찾을 수 없으면 상태 불명으로 보류한다. 전송 토큰 원문은 클라이언트에 노출하지 않는다.
- SELF-HOSTING §3: 중간 앱 버전을 거치지 않는 업그레이드, migration/runtime 롤 권한, 새 테이블 접근을 검증한다. 새 env·패키지·cron 없음.
- DB 마이그레이션 뒤 새 앱 배포. 언어 변경을 만들기 시작한 뒤 구버전 앱으로 단순 롤백하면 기존 적재가 의도를 무시할 수 있다. 미해결 변경을 수렴/승인 폐기하기 전 구버전 롤백 금지를 운영 문서에 남긴다.
- PRODUCT §7.2, ARCHITECTURE 불변식 1·4·9와 Publish/적재 절, DESIGN Sources·Publish, ACTIONS deferred 계약, CLAUDE 데이터 경로, DIRECTORY, MCP 가이드·세 언어 원고를 구현 태스크로 갱신한다.

## 8. 과거 함정과 구현 전 확인

- POSTMORTEM 2026-09-27 `package.json` 재생성: 코드 모양과 경로 안전을 따로 검증. 삭제에도 같은 경계를 적용한다.
- 같은 날 값 축 검증 불일치: Chrome 목록 생성 테스트.
- 수술적 파일 부재 은폐: 새 파일 없음·보류·삭제 없음의 이유를 UI/MCP가 구분한다.
- 일회용 승인 조기 해제: 성공한 적재/전달 확인에서만 상태를 정리한다.
- translation-rework의 마운트 시점 로케일 목록: 추가·제거·취소 후 열린 번역 화면의 편집 가능 상태를 DOM 테스트한다.
- sync 브랜치 잔류: `changes=0`인 취소도 기존 원격 diff가 사라졌는지 검증한다.

구현 전 확인: Chrome 공식 지원 목록·목록 밖 디렉터리 동작, GitHub/GitLab 삭제 계약, 기존 SyncRun/DeliveryConfirmation으로 전달 PR·대상 설정을 식별 가능한지, `pendingWhere` 전 소비자 및 Sync 강제 폐기 경로. 모호한 원격 관측을 성공으로 접어 설계를 단순화하지 않는다.
