# 원격 dev 전체 감사 통합 보고서 — 2026-10-07

기준 `bc8b204f18fa1aa88a0423e28f0789876f1fbf54` · Orca Run `run_4911271f3763`.

테스트·빌드·typecheck·브라우저·실제 GitHub 왕복은 정적 감사 스킬 범위에 따라 실행하지 않았다. 아래 실패 시나리오는 소스와 기존 테스트의 대조 결과이며 실행 재현 결과가 아니다. dev/prod DB ACL은 읽기 전용 트랜잭션으로 직접 확인했다.

## 동기화와 작업 맥락

- 사용자 지시로 백업 없이 로컬 dev를 origin/dev에 hard reset했다. 로컬 5개 커밋의 변경은 PR #197의 squash 커밋 ec9b3c2e에 전부 포함돼 있음을 먼저 대조했다. 원격 dev와 main은 기준 SHA로 같다.
- 원격 릴리스 2개: v1.2.2(PR #197)의 온보딩·로그인·소스·초대 메일 개선, v1.2.3(PR #198)의 전달 보호·사이드바 상태 저장.
- 진행 중인 기능은 responsive-public와 responsive-app이다. 설계 단계의 미구현을 감사 결함으로 세지 않았다.
- PRODUCT §10 미결은 리포 부재/빈값 strict 적재 계약과 publish-pr-handoff다.


## 결과 요약

발견 **🔴 3 · 🟡 14 · ⚪ 2 = 19건**. 번호는 이 통합 보고서 기준이다.

| 번호 | 시급도 | 도메인 | 발견 |
|---|---|---|---|
| 1 | 🔴 | principle | no-changes 전달 확인이 자동 적재 경합 표식을 전진시키지 않아 편집이 다시 덮인다 |
| 2 | 🔴 | invariant | ts-dict가 마지막 shorthand에 가려진 리터럴을 수정하고 전달 확인한다 |
| 3 | 🔴 | debt | 보류된 옛 CI job 재실행 안내가 머지된 번역을 다시 덮는 경로를 권한다 |
| 4 | 🟡 | principle | 보관을 완료한 프로젝트에서 야간 Publish가 새로 시작될 수 있다 |
| 5 | 🟡 | principle | 오래된 야간 브랜치 부재 관측이 새 적재 성공 상태를 실패로 덮는다 |
| 6 | 🟡 | invariant | Git 심볼릭 링크를 일반 로케일 blob으로 받아 일반 파일로 덮어쓴다 |
| 7 | 🟡 | invariant | 스캐너 상태 문자열과 사용자 문자열이 충돌해 정상 참조를 누락한다 |
| 8 | 🟡 | invariant | 일반 매개변수 shadowing을 무시해 남의 함수를 번역 사용처로 센다 |
| 9 | 🟡 | invariant | 현재 writer가 보존하는 점 키 구조를 survey가 여전히 손실 원인으로 센다 |
| 10 | 🟡 | invariant | 미판정 리포를 미지원 포맷 오탐으로 확정 집계한다 |
| 11 | 🟡 | debt | PostgreSQL 테스트가 검증하는 구현 경로가 로컬 게이트 트리거에서 빠졌다 |
| 12 | 🟡 | debt | MCP list_keys가 반환하는 일치 위치가 Unicode 소문자 확장 후 어긋난다 |
| 13 | 🟡 | debt | 문서 신선도 트리거의 코어 목록에서 실제 lib 디렉터리 15개가 빠졌다 |
| 14 | 🟡 | debt | PRODUCT가 System 기본값을 구현된 기능과 비범위로 동시에 분류한다 |
| 15 | 🟡 | debt | 자동 적재 보류의 상위 설명이 publish-raced 이전 계약에 머물러 있다 |
| 16 | 🟡 | boundary | 설치별 GitHub 401이 재인가 대신 일시 장애로 접힌다 |
| 17 | 🟡 | boundary | 신규 프로젝트 생성은 소스마다 예산을 초기화해 요청 전체 상한을 넘긴다 |
| 18 | ⚪ | debt | ARCHITECTURE가 삭제된 쿠키 속성 모듈을 아직 가리킨다 |
| 19 | ⚪ | debt | 웹 번역 검색은 화면에서 쓰지 않는 match 조각을 추가 조회·직렬화한다 |

## 발견 상세

### 1. 🔴 [principle] no-changes 전달 확인이 자동 적재 경합 표식을 전진시키지 않아 편집이 다시 덮인다

**위치:** `lib/pull/run.ts:405` · `lib/pull/load.ts:219` · `lib/push/apply.ts:157`.

no-changes는 전달된 편집 토큰을 해제하지만 published 인자가 undefined여서 lastPublishedAt은 그대로다. 자동 적재가 대조하는 완료 표식은 lastPublishedAt 하나이므로, 사전 검사 뒤 일어난 이 전달 확인을 감지하지 못한다. `lib/pull/load.ts:295–296`의 토큰 해제는 실행되고, 그 뒤 `lib/push/apply.ts:151–162`는 표식 동일·pending 0을 보고 strict 적재한다.

**실패 시나리오:** (1) DB 마지막 적재 커밋은 C다. (2) C보다 새 커밋 A의 CI가 pending 0/열린 PR 없음 검사까지 끝내고 `app/api/push/route.ts:248` 뒤, `:257` 진행 표시 이전에 대기한다. (3) 리포 base는 B로 전진했지만 B는 아직 DB에 적재되지 않았다. (4) 사용자가 목표 로케일 셀을 B의 값으로 편집한다. 다른 모든 export 값은 base와 같다고 둔다. (5) Publish가 base B와 바이트 동일해 no-changes로 끝나며 편집 토큰을 해제한다. (6) 대기 CI A가 재개해 그 셀을 A 값으로 덮는다. (7) 다른 셀을 편집하고 Publish하면 DB 전체 스냅샷이 해당 셀의 A 값을 B 위로 내보낸다. 이전 sync 브랜치가 없어도 성립하며, 있으면 no-changes reset 경로에서도 같다.

**역행 가드가 못 막는 이유:** `lib/push/apply.ts:189`는 A와 DB의 `surface.lastCommitAt=C`만 비교한다. `lib/push/guard.ts:133–138`은 A≥C이면 통과한다. Publish는 surface.lastCommitAt을 B로 바꾸지 않고, CI도 현재 원격 head B와 payload A를 대조하지 않는다. `lastPulledAt`과 `DeliveryConfirmation.revision`은 이 자동 적재 가드의 입력이 아니다.

**기준:** POSTMORTEM 2026-10-07 ‘허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다’의 방어 목적이 no-changes 전달 확인에는 닿지 않는다. ARCHITECTURE §5.8도 no-changes를 전달 확인으로 정의한다. 표시용 lastPublishedAt을 스킵에서 바꾸지 않는 옛 계약 자체를 위반이라고 하는 것이 아니라, 그 컬럼을 모든 전달 확인의 경합 감지자로 쓰는 불완전성을 지적한다.

**기존 테스트가 놓치는 이유:** `lib/keys/__tests__/sync-edit-protection.integration.ts:202–211`은 no-changes의 토큰 해제와 lastPublishedAt null을 각각 정답으로 검증한다. `:646–660`의 단조 표식 검사는 prUrl이 있는 published만 부른다. `lib/pull/__tests__/run.test.ts:345–354`도 reset이 published를 넘기지 않는지만 확인한다. 전달 확인과 이미 사전 검사를 통과한 CI를 이어 실행하는 이 조합은 없다.

**수정 방향:** 표시용 lastPublishedAt과 별도로 no-changes 전달 확인에서도 전진하는 완료 표식을 자동 적재 경합 가드가 비교한다.

원본: [principle 보고서 발견 3](principle.md).

### 2. 🔴 [invariant] ts-dict가 마지막 shorthand에 가려진 리터럴을 수정하고 전달 확인한다

**근거:** `lib/adapters/ts-dict.ts:82`는 `PropertyAssignment` 외 속성을 무시한다. `:251`의 read 중복 제거와 `:349`의 writer 마지막 자리 선택은 그 필터를 지난 리터럴만 본다. 실제 JavaScript의 마지막 속성이 shorthand이면 앞의 리터럴은 실행값이 아니다.

```ts
const a = 'runtime';
const en = { a: 'hidden', a };
const ko = { a: '원문' };
```

**실패 시나리오:** 위 파일을 `ns/x.ts`, `ts-dict`, `ns/*.ts`로 적재하면 en.a를 `hidden`으로 읽는다. en.a를 `edited`로 저장하고 Publish하면 앞의 `a: 'hidden'`만 `a: 'edited'`로 바뀌고 마지막 shorthand는 남아 실제 en.a는 계속 `runtime`이다. `readSlotFiles`도 동일한 adapter.read를 사용하므로 정상 키 자리로 인식한다(`lib/pull/undeliverable.ts:73`). `planDelivery`는 자리와 빈값만 검사하고 비어 있지 않은 이 편집을 delivered로 남긴다(`lib/pull/run.ts:247`, `:264`). `runPull:451` → `lib/pull/load.ts:296`의 CAS 확인으로 pending 토큰이 해제된다. 실제 요청한 값이 적용되지 않았는데 성공과 전달 기준이 남는다.

**기존 테스트 공백:** `lib/adapters/__tests__/ts-dict.test.ts:420`의 중복 fixture는 양쪽 모두 문자열 리터럴이다. adapter.read와 writer가 같은 잘못된 필터를 쓰므로 자기 왕복 비교도 정상으로 읽을 수 있다. `syntaxError`는 문법 진단이며 대상 리포의 의미 타입 검사를 대신하지 않는다. run층도 런타임 객체 해석을 따로 하지 않는다.

**기준:** ARCHITECTURE §0.9·§1의 실제 마지막 속성 계약. POSTMORTEM 「2026-10-07 — 파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다」에서 code-dict에 닫은 방어가 ts-dict에는 없다.

수정 방향: 마지막 이름 있는 속성을 먼저 확정한 뒤 read/write가 같은 실제 자리를 사용하도록 한다.

원본: [invariant 보고서 발견 1](invariant.md).

### 3. 🔴 [debt] 보류된 옛 CI job 재실행 안내가 머지된 번역을 다시 덮는 경로를 권한다

- 근거: `lib/cli/push-response.ts:20`, `:22`, `:25`는 pr-check-failed·publish-raced·pending-edits에 “Re-run this job”을 안내한다. `docs/ACTIONS.md:234`, `:236`도 재실행을 권하지만, 같은 문서 `:235`는 PR 머지 뒤 옛 job 재실행이 strict 덮어쓰기를 일으키므로 금지한다고 명시한다.
- 실패 시나리오: 마지막 적재 A 뒤 커밋 B의 CI가 pending 등으로 보류된다. 편집을 Publish한 P가 머지되고 마커로 P의 push 적재는 건너뛴다. 안내를 따라 B job을 재실행하면 pending=0·PR 없음이고 시작 전 Publish 시각과 잠금 안 시각도 같아 publish-raced가 아니다. `lib/push/guard.ts:133`의 순서 검사는 마지막 **적재** 시각 A와 B만 비교해 통과하며, B의 옛 번역이 strict 적재된다. 이후 재Publish는 되돌아간 DB 값으로 PR을 만들 수 있다.
- 경계: 임의의 옛 커밋 push를 전부 금지하라는 지적이 아니라, 이미 문서가 인정한 위험 경로를 제품 안내가 권한다는 결함이다. 현재 소스 및 CLI 호출 경로에 대한 정적 증명이다. v3 action 발행·사용 여부와 실제 원격 재현은 확인하지 않았다.
- 기존 테스트 공백: `lib/cli/__tests__/push-response.test.ts`는 사유·exit code·warning 유무만 검사하고 안내대로 재실행한 뒤의 상태를 잇지 않는다. `publish-raced`는 **그 요청 도중** Publish 완료만 보호하므로 이 순차 시나리오를 막지 않는다.
- 제안: 보류 경고와 ACTIONS의 재개 안내를 최신 push 또는 야간 적재로 통일한다.

원본: [debt 보고서 발견 1](debt.md).

### 4. 🟡 [principle] 보관을 완료한 프로젝트에서 야간 Publish가 새로 시작될 수 있다

**위치:** `lib/sync/run.ts:114` · `lib/nightly/run.ts:109`.

`app/api/pull/route.ts:55`에서 전체 대상 행을 먼저 수집하고, `:77`에서 보관 여부를 판정한 뒤 프로젝트별로 순회한다. 그 사이 OWNER가 `runArchive`를 완료해도 cron 실행권 획득은 Project 잠금만 잡고 최신 `archivedAt`을 읽지 않는다. `lib/sync/run.ts:138`의 재조회도 import lease만 읽으며 `:173`에서 새 RUNNING 행을 만든다. `lib/pull/load.ts:49`의 스냅샷도 프로젝트 보관을 확인하지 않고, `lib/protection/where.ts:13`은 소스 보관만 제외한다.

**실패 시나리오:** 활성·미전달 편집이 있는 프로젝트가 cron 대상으로 캡처된다 → 앞 프로젝트 처리 중 OWNER가 프로젝트 보관을 커밋한다(`lib/projects/archive.ts:27–39`) → 뒤늦게 해당 target의 방문이 시작된다 → pending이 남아 Publish 갈래로 들어가 새 SyncRun과 PR 생성/갱신을 수행한다. 보관 전에 시작한 Publish를 완료하는 상황이 아니라, 보관 완료 후 실행권을 새로 받는 상황이다.

**기준:** PRODUCT §7.9(`docs/PRODUCT.md:1028`, `:1059`)의 보관 시 편집·Publish·야간 중단. ARCHITECTURE §5.6.4. POSTMORTEM 2026-09-23의 잠금 뒤 활성 상태 재확인 원칙과 같은 누락이다.

**기존 테스트가 놓치는 이유:** `lib/pull/__tests__/targets.test.ts:133–145`는 선정 시점에 이미 보관된 객체만 검사한다. `lib/nightly/__tests__/nightly.integration.ts:226`은 프로젝트가 아니라 소스 보관을 검사한다. 선정→보관 완료→cron 실행권 획득 순서가 없다.

**수정 방향:** cron 실행권도 Project 잠금 뒤 최신 프로젝트 보관 여부를 검사한다.

원본: [principle 보고서 발견 1](principle.md).

### 5. 🟡 [principle] 오래된 야간 브랜치 부재 관측이 새 적재 성공 상태를 실패로 덮는다

**위치:** `lib/nightly/run.ts:143`.

야간의 `branchMissing` 갈래는 최초 target에서 캡처한 소스 id만으로 `lastImportError`와 `lastImportFailedAt`을 쓴다. Project 잠금, 현재 리포/브랜치, `importRevision`, 현재 보관 상태 대조가 없다. 반면 일반 적재의 `lib/import/run.ts:197–213`은 Project→Surface 잠금 뒤 설정·revision·lease·보관을 재검사한다.

**실패 시나리오:** cron이 baseBranch=old인 target을 수집하거나 old head를 조회한다 → OWNER가 존재하는 new 브랜치로 설정을 바꾸고 Sync/CI가 성공하여 소스 오류를 지운다 → 기존 target의 old 브랜치 조회가 null로 끝난다 → 야간은 new에서 이미 정상 적재된 소스를 다시 `import-failed`로 만든다. 실패 사건이 과거 관측으로 남는 것과 현재 소스 건강성을 덮는 것은 별개다. Home·Sources가 성공한 소스를 실패로 보이며 불필요한 재시도를 요구한다.

**기준:** ARCHITECTURE §5.5.7의 실행 소유권·revision 검사, §5.7의 사실에 맞는 상태/사건. POSTMORTEM 2026-09-13 ‘임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다’의 늦은 종료가 새 상태를 덮는 형태다.

**기존 테스트가 놓치는 이유:** `lib/nightly/__tests__/nightly.integration.ts:226–254`는 부재 방문이 끝난 후 복구 방문을 실행한다. 오래된 응답/target이 새 설정과 성공 뒤 도착하는 역순 경합을 만들지 않는다.

**수정 방향:** 소스 상태 변경은 잠금 뒤 캡처 설정·revision과 최신 상태가 여전히 일치할 때만 적용한다.

원본: [principle 보고서 발견 2](principle.md).

### 6. 🟡 [invariant] Git 심볼릭 링크를 일반 로케일 blob으로 받아 일반 파일로 덮어쓴다

**근거:** `lib/github.ts:389`와 `lib/pull/client.ts:16`은 심링크를 제외한다고 선언하지만, `github.ts:390`은 `type === "blob"`만 확인하고 `:392`에서 mode를 버린다. Git 심링크는 mode `120000`인 blob이며 내용은 링크 대상 경로다(설치된 `@octokit/openapi-types`의 `types.d.ts` Git tree mode 설명에서도 확인). `lib/pull/payload.ts:73`은 출력 mode를 항상 `100644`로 만든다.

**실패 시나리오:** 기존 json-catalog의 활성 fr 로케일에 편집 토큰이 남은 동안 코드에서 `locales/fr.json`을 `en.json`을 가리키는 심링크로 바꾼다. 자동 적재는 편집 때문에 보류된다. cron 또는 미리보기 없이 실행한 Publish가 링크 blob 내용 `en.json`을 원본으로 읽는다. 비-base 경로에는 base 원본 파싱 차단이 없고(`lib/pull/render.ts:164`), `json-catalog.ts:326`은 원본 구조 파싱 실패를 빈 구조로 접어 DB 값으로 JSON을 재생성한다. 트리 쓰기는 기존 심링크를 `100644` 일반 파일로 교체한다. 링크로 공유하던 파일 구조가 경고 없이 사라진다. base 파일에는 파싱 거부가 있어 이 시나리오는 **비-base 재생성 파일**에 한정한다.

**기존 테스트 공백:** fake Git tree는 path/sha만 들며 mode 축이 없다. `lib/pull/__tests__/payload.test.ts`는 `100644` 자체를 기대해 입력 파일 종류 보존 여부를 묻지 않는다. 실제 API 왕복은 이번 감사에서 미실행이다.

**기준:** 심링크 제외라는 실제 GitClient 계약, POSTMORTEM 「2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (`catch`는 오류일 때만 돈다)」의 재발.

수정 방향: tree mode를 보존해 지원하지 않는 파일 종류를 쓰기 전에 명시적으로 거부한다(필터로만 없애면 신규 파일로 다시 생성할 수 있음).

원본: [invariant 보고서 발견 2](invariant.md).

### 7. 🟡 [invariant] 스캐너 상태 문자열과 사용자 문자열이 충돌해 정상 참조를 누락한다

**근거:** `lib/scan/ast.ts:213`의 namespace 함수와 `:196`의 boundName은 실제 문자열과 오류 센티널을 같은 string으로 반환한다. 호출자는 `:147`에서 `"unresolved"`, `:160`에서 `"unsupported"`를 오류로 간주한다.

**실패 시나리오:** 정상 import 아래 `const t = useTranslations("unresolved"); t("title")`는 `unresolved.title`을 내야 하지만 namespace 오류로 버린다. `const unsupported = useTranslations("hero"); unsupported("title")`도 정상 식별자인데 바인딩 오류로 버린다. 사용처 정보만 누락되며 키·번역 값 적재는 망가지지 않는다.

**기존 테스트 공백:** `lib/scan/__tests__/hook-wrapper.test.ts`는 동적 namespace와 지원하지 않는 구조분해를 검사하지만 센티널과 같은 정상 리터럴·지역 이름을 입력하지 않는다. string union은 두 의미를 구별하지 못한다.

**기준:** ARCHITECTURE §4.0의 리터럴 namespace·직접 대입 지원 계약.

수정 방향: 데이터와 상태를 분리하는 판별 union을 사용한다.

원본: [invariant 보고서 발견 3](invariant.md).

### 8. 🟡 [invariant] 일반 매개변수 shadowing을 무시해 남의 함수를 번역 사용처로 센다

**근거:** `lib/scan/ast.ts:88`은 import 이름 문자열만 비교하고, `:230`의 `bindingFor`는 훅에서 얻은 바인딩끼리만 범위를 비교한다. 내부 함수의 일반 매개변수나 일반 변수 선언은 차단 바인딩에 들어가지 않는다.

```ts
import { useTranslations } from 'next-intl';
function outer() {
  const t = useTranslations('hero');
  function inner(t: (x: string) => string) { return t('title'); }
}
```

**실패 시나리오:** inner의 t는 호출자가 주는 다른 함수지만 외부 훅 범위 안이라는 이유로 `hero.title` 참조가 된다. 직접 import한 t를 매개변수 t가 가리는 형태도 동일하다. 번역 화면에 무관한 코드 링크가 표시된다.

**기존 테스트 공백:** `hook-wrapper.test.ts:208`은 훅 바인딩 범위 밖 sibling 함수만 검사한다. 외부 훅 범위 안에서 매개변수가 가리는 입력은 없다.

**기준:** ARCHITECTURE §4.0·§4.1의 스코프 인식 및 이름만으로 래퍼를 매칭하지 않는 계약.

수정 방향: 호출 식별자의 실제 lexical binding을 확인하거나 일반 선언도 shadow 경계에 포함한다.

원본: [invariant 보고서 발견 4](invariant.md).

### 9. 🟡 [invariant] 현재 writer가 보존하는 점 키 구조를 survey가 여전히 손실 원인으로 센다

**근거:** `lib/survey/json-shape.ts:41`은 점 리터럴 키와 중첩의 공존이 구조 변경을 일으킨다고 정의하고 `:104`는 공존 여부만으로 `dottedWithNested`를 켠다. `lib/survey/summarize.ts:273`은 이 flag가 있으면 `diff.clean` 분모에서 제외한다. 현재 writer는 원본 실제 경로를 `originalStructure`로 수집하고 `segmentsOf`가 우선 사용한다(`lib/adapters/json-catalog.ts:263`, `:265`, `:314`). ARCHITECTURE §1.9 24차도 이 수정 뒤 기존 siyuan 손실이 사라졌다고 기록한다.

**실패 시나리오:** 충돌 없는 독립적인 점 리터럴 키와 중첩 키를 가진 20키 이상 JSON을 정상 원본으로 전달한다. writer가 해당 구조를 보존해 diff가 0이어도 survey는 '점 키 구조 변경 원인 있음'으로 분류하고 clean 분모에서 뺀다. raw diff·의미 비교 결과 자체가 틀린다는 주장은 아니다. 원본 경로가 없는 신규 파일 등 실제 손실 가능성이 남은 경우와, 이미 보존되는 원본 관측치를 구분하지 못하는 측정 의미 드리프트다.

**기존 테스트 공백:** `lib/survey/__tests__/json-shape.test.ts`의 점 키 공존 테스트는 예전 flag=true를 고정한다. 현재 writer의 출력과 clean 분모의 의미를 함께 대조하는 검사가 없다.

**기준:** POSTMORTEM 「2026-09-03 — 고쳐 놓고도 지표가 낡아서 \"성공\"을 \"실패\"로 읽었다」의 '수정된 축은 원인에서 관측치로 옮긴다' 규칙.

수정 방향: 단순 원본 관측과 실제 구조 손실 원인을 분리해 clean 분모 정의에 맞춘다.

원본: [invariant 보고서 발견 5](invariant.md).

### 10. 🟡 [invariant] 미판정 리포를 미지원 포맷 오탐으로 확정 집계한다

**근거:** `lib/survey/summarize.ts:199`의 `byRepo.get(s.repo)?.correctCatalogPath == null`은 명시적 미지원(null)과 판정 레코드 부재(undefined)를 같이 잡는다. `:289`는 이를 `misdetect.withCandidate` 분자에 더한다. 같은 모듈의 format 표는 판정 존재 여부를 확인하고 리포 표는 미판정으로 표시하므로 출력 간 의미가 갈린다.

**실패 시나리오:** 후보를 정상 탐지한 새 리포 하나와 빈 verdict 목록을 `summarize`에 전달하면 `misdetect.withCandidate`는 1/1(100% 오탐)이 된다. 실제로는 사람이 아직 판정하지 않았을 뿐이며 다른 표는 ❔로 표시한다. 새 코퍼스를 조사할 때 JSON 집계는 품질 실패라고 잘못 말한다.

**기존 테스트 공백:** `lib/survey/__tests__/summarize.test.ts:158`은 동일한 입력을 만들지만 `misdetect.supported.of === 0`과 `unjudged`만 검사한다. 오판되는 `withCandidate`를 단언하지 않는다.

**기준:** 측정 불가·판정 부재를 실패/성공으로 접지 않는 ARCHITECTURE §1.9와 POSTMORTEM 09/02·09/03 지표 계보.

수정 방향: 명시적인 null verdict만 미지원 오탐으로 세고 미판정은 별도로 유지한다.

원본: [invariant 보고서 발견 6](invariant.md).

### 11. 🟡 [debt] PostgreSQL 테스트가 검증하는 구현 경로가 로컬 게이트 트리거에서 빠졌다

- 근거: `scripts/gate-plan.ts:25`의 projects 목록과 `:57`의 credentials 목록. projects는 `app/(edit)/projects/actions.ts`, `app/(edit)/projects/[slug]/settings/actions.ts`, `app/(edit)/projects/[slug]/sources/actions.ts`, `app/invite/actions.ts`, `app/search/actions.ts`, `app/api/push/failure/route.ts`를 포함하지 않는다. credentials는 `lib/account-connect/`, `lib/login-link/`, `lib/session-revocation/`를 포함하지 않는다.
- 실제 연결: `lib/events/__tests__/locked-access.integration.ts:44`부터 앞의 Project/Settings/Sources Action을 import한다. `lib/invitation-email/__tests__/invitation.integration.ts:10`은 초대 수락 Action, `lib/keys/__tests__/search.integration.ts:5`는 검색 Action을 부른다. `lib/keys/__tests__/source-remove.integration.ts:305`는 push/failure Route를 부른다. `lib/credentials/__tests__/postgres.integration.ts:2`–`:28`은 자격증명 껍데기를 import하고 `:473`–`:479`에서 동시 세션 회수·단일 소비를 단언한다.
- 실패 시나리오: 위 Action 또는 자격증명 구현만 바꾸면 `planGate([그 경로])`가 PG 스위트를 전부 생략한다. 잠금 대기 중 권한 철회·수락 경합 등 mock으로 검증하지 못하는 회귀가 해당 PG 검증 없이 dev에 갈 수 있다. 실제 회귀가 현재 발생했다는 주장은 아니다.
- 기존 테스트 공백: `scripts/__tests__/gate-plan.test.ts:67`은 테스트 **위치**인 include 디렉터리만 대조한다. 구현과 테스트가 다른 디렉터리인 경우는 목록에서 빠져도 통과한다. 일반 `vitest.config.ts:36` include는 `.test.*`이며 `.integration.ts`를 수집하지 않고 CI도 `pnpm test`만 호출한다.
- 회고 재발: POSTMORTEM 2026-09-10 “스위트는 애초에 안 돌아간다”, 2026-10-07 “비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다”의 같은 구조다.
- 제안: 두 PG 스위트가 직접 검증하는 구현 경로를 트리거와 단독 경로 테스트에 포함한다.

원본: [debt 보고서 발견 2](debt.md).

### 12. 🟡 [debt] MCP list_keys가 반환하는 일치 위치가 Unicode 소문자 확장 후 어긋난다

- 근거: `lib/keys/translation-list.ts:234`–`:242`는 `text.toLowerCase().indexOf(needle)`를 원문 `text`의 `start`로 반환하며 번역값도 `:255`–`:257`에서 같다. `lib/mcp/tools/keys.ts:44`는 `keys: page.rows`로 이를 외부에 그대로 반환한다.
- 실패 시나리오: 원문/키 `İabc`, 검색어 `a`. 소문자 문자열 `i\u0307abc`의 위치는 2지만 원문에서 `a`는 1이고 2는 `b`다. ASCII `a` 검색이므로 DB의 터키어 대소문자 규칙에 의존하지 않는다.
- 기존 테스트 공백: `lib/keys/__tests__/translation-list.integration.ts:254`–`:266`은 ASCII·한글만 사용해 소문자화 길이가 늘지 않는다. `lib/search/highlight.ts:4`는 이미 역매핑을 구현하지만 이 경로는 공유하지 않는다.
- 회고 재발: 2026-09-13 “소문자화한 위치로 원래 이름을 잘라 검색 강조가 어긋났다”.
- 제안: 원문 위치 역매핑을 공유하고 MCP 반환값까지 확장 문자 입력을 고정한다.

원본: [debt 보고서 발견 3](debt.md).

### 13. 🟡 [debt] 문서 신선도 트리거의 코어 목록에서 실제 lib 디렉터리 15개가 빠졌다

- 근거: `.claude/commands/push.md:113`의 ARCHITECTURE 후보 목록과 `docs/ARCHITECTURE.md:3`의 목록은 서로 같지만 실제 디렉터리를 다 포함하지 않는다. 명시 규칙은 새 lib 디렉터리를 추가하라는 것이다.
- 누락: `lib/changelog/`, `lib/color-scheme/`, `lib/device-cookies/`, `lib/guide/`, `lib/inbox/`, `lib/landing/`, `lib/mcp/`, `lib/nightly/`, `lib/oauth-server/`, `lib/oauth/`, `lib/onboarding-run/`, `lib/operator/`, `lib/public-doc/`, `lib/seo/`, `lib/status/`.
- 실패 시나리오: 기존 `lib/nightly/plan.ts`나 `lib/inbox/query.ts`의 동작만 고치는 경우 파일 추가·이동 트리거도 없고, 열거된 코어 변경 트리거도 없어 관련 ARCHITECTURE 절 검사가 후보에서 빠질 수 있다. 두 사본이 같은지만 비교해서는 실제 모듈 누락을 못 잡는다.
- 기존 검사 공백: 미러 게이트는 원본/미러 동일성만 검사한다. 두 정본 목록이 함께 낡은 경우를 검증하지 않는다.
- 제안: 실제 디렉터리와 코어 트리거 목록의 대응을 정리한다.

원본: [debt 보고서 발견 4](debt.md).

### 14. 🟡 [debt] PRODUCT가 System 기본값을 구현된 기능과 비범위로 동시에 분류한다

- 근거: `docs/PRODUCT.md:391`은 기본 System과 계정→쿠키→system을 확정하지만 `:443` 비범위에 “System 기본값”이 남았다. `lib/color-scheme/scheme.ts:30`은 실제로 system을 폴백한다.
- 실패 시나리오: 신규 테마 작업이 §4.2를 따라 현재 기본값을 범위 밖으로 오판한다. 사용자는 정본의 비범위 목록을 판단 근거로 쓰도록 지시되어 있어 운영상 혼동을 만든다.
- 기존 테스트 공백: 테마 판정 테스트는 실제 system 반환을 검사하고 PRODUCT 본문의 상반된 정책을 검사하지 않는다.
- 제안: §4.2의 옛 System 기본값 제외를 제거한다.

원본: [debt 보고서 발견 5](debt.md).

### 15. 🟡 [debt] 자동 적재 보류의 상위 설명이 publish-raced 이전 계약에 머물러 있다

- 근거: `CLAUDE.md:34`와 `docs/ARCHITECTURE.md:35`, `:1632`는 입력이 미전달 수와 PR 여부 둘이고 둘 다 비면 strict 적재한다고 단언한다. 같은 ARCHITECTURE `:902`, `:1643` 및 `lib/push/apply.ts:157`, `lib/import/run.ts:106`은 lastPublishedAt 변경을 셋째 보류 근거로 사용한다.
- 실패 시나리오: 회귀 수정이나 새로운 자동 적재 경로 구현이 상위 불변식 설명만 따라 timestamp 경합 방어를 생략할 수 있다. 현재 코드의 경합 방어가 빠졌다는 지적은 아니다.
- 기존 테스트 공백: CI/야간 경합 테스트는 코드 동작을 검증하고 세 문서 문장의 완전성을 검증하지 않는다.
- 같은 절 `docs/ARCHITECTURE.md:1636`의 보류 사유 “넷”도 `lib/events/payload.ts:78` 및 아래 표의 다섯(pending-edits/open-pr/pr-check-failed/publish-raced/too-large)과 어긋난다.
- 제안: 사전 판정 둘과 잠금 안 Publish 완료 표식 재검을 상위 설명에 함께 적고 사유 개수를 맞춘다.

원본: [debt 보고서 발견 6](debt.md).

### 16. 🟡 [boundary] 설치별 GitHub 401이 재인가 대신 일시 장애로 접힌다

- 위치: `lib/onboarding-run/access.ts:79`, `lib/onboarding-run/access.ts:97`, `lib/onboarding-run/access.ts:100`, `lib/onboarding-run/access.ts:109`.
- 근거: `checkRepoAccess`는 `listInstallationRepos` reject를 `{repos: [], error}`로 바꿔 Promise를 성공시킨다. 해당 실패는 바깥 catch의 401→reauthorize 분기로 도달하지 않는다. 전 설치 실패면 상태 코드와 무관하게 `unavailable`; 다른 설치만 성공했으나 요청 리포를 찾지 못하면 `repo-not-installed`다.
- 실패 시나리오: `ensureUserToken`이 아직 유효하다고 판단한 토큰으로 설치 목록을 받은 뒤, 설치별 리포 요청이 401을 받는다(두 요청 사이 인가 회수/만료). 설치가 하나라면 `createProject` 등 공유 코어 소비자는 재연결이 필요한 실패를 `unavailable`로 응답한다. 결과 분류 자체는 정적으로 확정되며 실제 GitHub에서 이 경합을 유발하지는 않았다.
- 정본: ARCHITECTURE §6.00·§6.4·§6.5.1, POSTMORTEM 「2026-09-19 — 인가를 철회한 사용자가 “잠시 뒤 다시”에 갇혔고, 그 자리만 401 규칙을 어기고 있었다」. 같은 파일 `listFailure`(`access.ts:30`)는 401 우선 규칙을 이미 구현하고, `lib/onboarding-run/repos.ts:153`은 이를 사용한다.
- 기존 테스트가 놓치는 이유: `app/(edit)/__tests__/onboarding.test.ts:1210`은 checkRepoAccess 경로의 설치별 전 실패에 **503만** 넣는다. 같은 파일 `:502`의 설치별 401 검사는 형제 `listConnectableRepos` 경로라 서로 다른 분기를 검사한다. 401을 주입해 실제 checkRepoAccess 소비자의 결과가 reauthorize인지 보는 검사가 비어 있다.
- 영향: 실패 폐쇄는 유지된다. 토큰/데이터 유출이 아니라 잘못된 복구 안내이므로 심각 등급으로 올리지 않았다.
- 수정 방향: 요청 리포를 찾지 못한 설치별 실패 목록에서 401을 먼저 분류하고, 기존 부분 성공 허용 정책은 보존한다.

원본: [boundary 보고서 발견 1](boundary.md).

### 17. 🟡 [boundary] 신규 프로젝트 생성은 소스마다 예산을 초기화해 요청 전체 상한을 넘긴다

- 위치: `lib/onboarding-run/create.ts:168`, `:172`, `:183`; `lib/import/read.ts:19` 및 `:20`.
- 근거: `CreateProjectInput.surfaces`는 min(1)만 요구하고(`create.ts:43`), 각 소스에서 `readFiles`를 새로 호출한다. `readFiles`는 매 호출마다 경로 수를 검사하고 `totalBytes=0`으로 시작한다. 생성 요청 전체의 파일 수/바이트를 합치는 검사는 없다. `prepared`가 각 결과 payload를 끝까지 보관한다.
- 실패 시나리오: 쓰기 권한을 가진 자신의 리포에서 겹치지 않는 JSON 소스 둘을 제출한다. 각 소스가 파일당 2MB 미만인 파일 넷으로 약 6MB를 이루면, 두 `readFiles` 호출은 각각 10MB 이하로 통과하지만 생성 요청은 총 12MB를 다운로드·파싱한다. 값/키/행 상한 내의 정상 카탈로그로 구성할 수 있고, 결과 경로가 겹치지 않아 소유권 검사도 이 초과를 막지 않는다. 이는 코드 흐름으로 판정했으며 실물 대용량 요청은 보내지 않았다.
- 같은 결함의 증폭 경로: 동일 소스를 반복 제출해도 `create.ts:205`의 소유권 검사가 다운로드·파싱 **뒤**에 있어 실패 전에 같은 작업을 반복한다. 입력 본문은 경로만 담으므로 Server Action 4MB 본문 제한이 원격 다운로드 합계를 제한하지 않는다. 플랫폼 실행시간 상한은 있으므로 무제한 실행 또는 실제 서비스 장애를 주장하지 않는다.
- 정본: PRODUCT §4.2 첫 적재 200파일/파일당 2MB/합계 10MB; ARCHITECTURE `:1559` 공통 예산. 형제 `lib/onboarding-run/add.ts:81`은 “표면별 다운로드는 상한을 N배로 넓힌다”는 이유로 `:82`에서 선택 파일 합집합을 한 번만 읽는다.
- 기존 테스트가 놓치는 이유: `app/(edit)/__tests__/onboarding.test.ts:1890`의 다중 소스 budget fixture는 두 번째 소스 **파일 하나**를 2,000,001바이트로 만들어 개별 파일 제한만 검사한다. `:1906`의 중복 표면 테스트는 최종 path-conflict/DB 쓰기 0만 단언하며 다운로드 선차단을 보지 않는다. 요청 합산 예산 검사는 `:2178`에 있으나 **addSurfaces** 경로만 검사한다.
- 영향: 요청당 자원 상한 계약 위반. 인가된 리포만 읽으므로 SSRF/테넌시 우회로 분류하지 않는다.
- 수정 방향: create도 소스별 준비 전에 선택 파일 합집합의 예산을 검사하고 한 번 읽어 재사용하며, 중복 선택은 다운로드 전에 거부한다.

원본: [boundary 보고서 발견 2](boundary.md).

### 18. ⚪ [debt] ARCHITECTURE가 삭제된 쿠키 속성 모듈을 아직 가리킨다

- 근거: `docs/ARCHITECTURE.md:2959`는 `lib/color-scheme/cookie-spec.ts`를 가리킨 뒤 다음 줄에 `lib/device-cookies/spec.ts`를 중복 연결한다. 앞 파일은 존재하지 않고 후자의 `deviceCookieSpec`이 실제 공유 구현이다.
- 실패 시나리오: 문서가 가리킨 옛 경로를 열어 계약을 확인할 수 없다. 실행 동작 영향은 없다.
- 기존 검사 공백: 미러·타입 검사는 Markdown의 inline 코드 경로 존재를 검사하지 않는다.
- 제안: 오래된 경로 조각을 걷는다.

원본: [debt 보고서 발견 7](debt.md).

### 19. ⚪ [debt] 웹 번역 검색은 화면에서 쓰지 않는 match 조각을 추가 조회·직렬화한다

- 근거: `lib/keys/translation-list.ts:220`은 검색 시 `matchesFor`를 무조건 호출하고 `:249`의 별도 SQL로 번역값을 읽는다. `components/translations/workspace/key-list.tsx:123`–`:160`은 원문·키·상태만 렌더하고 match를 읽지 않는다. MCP는 이 필드를 실제 반환하므로 전역 dead field가 아니다.
- 발생 시나리오: 키/원문이 아닌 번역값 검색에서 웹이 추가 SQL과 match.text 직렬화를 수행하지만 UI 결과에는 쓰이지 않는다. 체감 시간의 크기는 측정하지 않았다.
- 기존 테스트 공백: translation-list 통합 테스트와 성능 테스트는 match 생산을 요구하지만 웹 소비를 검사하지 않는다.
- 제안: MCP 계약을 유지하면서 웹 조회에 불필요한 일치 조각 생산을 생략할지 정리한다.

원본: [debt 보고서 발견 8](debt.md).

## DB 접근 경계

dev·prod 모두 anon/authenticated의 public USAGE·CREATE가 false이고 현재 테이블 권한은 0건이다. 22개 테이블의 RLS 비활성과 prod supabase_admin 기본 ACL은 문서화된 기존 구조이며 신규 결함으로 세지 않았다. 자세한 SQL과 결과는 [boundary 보고서](boundary.md)에 있다.

## 도메인별 증거

- [불변식·어댑터·전달·스캔·실측 도구](invariant.md)
- [값 소유권·보호·도메인 수명](principle.md)
- [인증·인가·외부 경계·DB ACL](boundary.md)
- [부채·테스트 공백·문서 정합](debt.md)
