# translation-rework — 기술 설계

상태: 6차 핸드오프까지 대조했다. 5차 화면 계약은 유지되며 6차는 남은 설명 문구를 정리했다. [spec](./spec.md)의 디자인 결정은 닫았으며 기술 실측은 남았다. 아래 타입·함수명은 구현 계약 초안이며 현재 코드에 존재한다는 뜻이 아니다.

## 1. 현재 코드와 변경 지점

| 현재 | 변경 |
|---|---|
| `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx` | 인가 후 트리·요약 목록·선택 키 상세 조회. 기존 maxDuration=60 보존 |
| `lib/keys/query.ts`, `view.ts`, `filters.ts` | 목록/상세 DTO 분리, 집계·URL·선택 순수 판정 |
| `components/translations/{header,filters,filter-chips,key-group}.tsx`, `translation-input.tsx` | 화면 전환 소유자 하나 + 세 패널 + 키 단위 draft |
| `app/(edit)/actions.ts`, `lib/keys/save.ts` | batch Save Action 및 별도 복원 미리보기/실행 Action |
| `lib/pull/{load,run,trigger,render,plan}.ts` | 동일 export 스냅샷에서 전달 기준 캡처, 성공 후 스냅샷 저장 |
| `lib/sync/run.ts` | SyncRun 실행권 전달·조건부 종료, 불확실한 외부 실행의 복원 차단 |
| `lib/push/apply.ts`, import/설정 변경 경로 | strict 적재/소스 의미 변경 시 복원 기준 무효화 |
| `lib/events/*`, Logs 상세 | 복원 사건과 선택 키 링크, 기존 저장 사건 재사용 |
| `lib/routes.ts`, Home/Sources/기본 번역 redirect | 키 선택 URL과 옛 링크 변환 |
| `lib/privacy/collected.ts` | 새 baseline 모델의 개인정보 분류와 MODEL_CLASSES 전수 등재 |

영향은 편집 UI뿐 아니라 **Publish 전달 확인·strict push의 기준 무효화**까지다. 어댑터가 쓰는 값·원본 표현·키 존재 정책은 바꾸지 않는다. Revert가 읽는 값은 DB 전달 스냅샷이며 현재 리포를 읽어 비교하지 않는다.

## 2. 읽기 계약과 집계

새 HTTP Route Handler를 만들지 않는다. RSC가 서버 조회 함수를 호출하고 URL 이동으로 목록/상세를 읽는다. 복원 확인의 동적 읽기만 기존 Publish preview와 같은 읽기 전용 Server Action이다. 서버 함수에는 인가로 얻은 projectId/surfaceId를 넘긴다.

| 계약 초안 | 입력 | 출력 |
|---|---|---|
| `loadTranslationTree` | 인가된 projectId | `projectKeyCount`, 활성 sources의 `id,slug,keyCount,namespaces[{name,keyCount}]`, 실제 base/활성 locale 목록 |
| `loadTranslationList` | 인가된 projectId, route surfaceId, 정규화 Query | `rows[{keyId,surfaceSlug,namespace,key,sourceText,missingCount,totalLocales,hasPending,hasReview,isNew,match?}], matchedKeyCount, incompleteKeyCount, nextCursor?` |
| `loadTranslationDetail` | projectId, 대상 surfaceId, keyId | `key,sourceText,description,refs,locales[{code,name,isBase,value,needsReview,pending,actorLabel,updatedAt}],revertAvailability` 또는 명시적 부재 결과 |

목록에는 전체 `cells`, 저자 레코드, 모든 참조를 싣지 않는다. 상세 하나만 최대 그 소스의 활성 언어 수만큼 읽는다. 사용자 이름은 기존 마스킹 규칙을 통과한 라벨만 전달하고 pending은 boolean만 내보낸다.

집계 계획:

1. 프로젝트의 활성 소스, 활성 키, 활성 로케일을 먼저 제한한다. 각 키의 분모는 그 소스의 활성 Locale 수다.
2. 채워진 수는 `value IS NOT NULL AND value <> ''`인 활성 번역 셀 수다. 결측은 분모−채워진 수. DB의 공백 포함 실제 값은 현재 `translationState` 의미대로 채워짐이다. 입력 저장 정규화와 혼동하지 않는다.
3. review는 값이 있는 활성 셀의 needsReview, pending은 `pendingWhere`와 동일한 관계 술어. 결측과 review의 분리는 3차 시안에서 확정됐다. `Incomplete first`는 결측 또는 review인 키를 앞으로 안정 분할하고 그룹 내부의 기존 순서를 보존한다.
4. 키 집계는 번역/참조 조인 fan-out 전에 만든다. `KeyRef` 때문에 키/셀 수가 배수로 늘지 않게 한다. 트리의 전체 수와 현재 필터 결과 수를 별도로 반환한다.
5. 검색 대상은 spec §7의 확정 계약인 키 이름·원문·활성 로케일의 저장 번역이고 설명은 제외한다. 제한된 SQL EXISTS/집계 조건으로 수행한다. q는 바인딩하고 LIKE의 `%`·`_`·escape 문자를 문자열로 처리한다. 원문/번역 일치 조각은 서버에서 텍스트+범위만 만들고 HTML을 보내지 않는다. 결과에 소스·언어·일치 필드를 함께 표시한다.
6. 첫 판정과 목록/상세의 관련 조회는 같은 읽기 스냅샷을 사용한다. 목록 전 키×전 언어를 브라우저나 서버 메모리에 가져와 검색하는 구현은 피한다.
7. `StringKey(projectId,surfaceId,namespace)`, `(projectId,surfaceId,orphaned)`, Locale 복합 PK, Translation unique/index를 출발점으로 EXPLAIN한다. 신규 인덱스/검색 페이지 크기/결과 상한은 tasks T1 실측 결과로 정한다. 부분 문자열 검색에 기존 btree가 충분하다고 주장하지 않는다.
8. 처음에는 요청 내 읽기만 사용하고 별도 TTL 캐시/집계 저장 컬럼을 추가하지 않는 안이다. 기존 revalidatePath 경로는 유지한다. 공유 캐시가 필요해지면 권한/프로젝트/소스/조건이 키에 포함되어야 한다.

프로젝트 검색은 projectId 안의 활성 surfaceId 집합에서만 수행한다. 결과 상세는 해당 표면을 다시 확인하며, 현재 URL 표면의 id로 타 소스 키를 조회하지 않는다. 저장 Action도 매번 대상 surfaceSlug를 인가한다.

## 3. URL 계약 초안

경로는 기존 `/projects/[slug]/surfaces/[surfaceSlug]/translations`. route 표면은 탐색 트리의 기준점이다. All sources에서 다른 소스 결과를 열 때는 `keySurface`로 상세의 소스를 지정하여 트리 문맥과 전체 결과를 보존한다.

| 쿼리 | 의미/기본값 |
|---|---|
| `ns` | 선택 네임스페이스, `*`는 All namespaces. 원본에 없는 namespace를 자동 다른 곳으로 보내지 않음 |
| `scope` | `namespace` / `source`(기본) / `project` |
| `completion`, `missingLocale` | `all`(기본) / `incomplete` / `missing` / `complete`; missing일 때만 언어 필요 |
| `state` | `unsent` / `review` / `new`, 생략은 Any state. project에서도 동일하게 적용 |
| `q`, `sort`, `cursor` | 검색·정렬·페이지. 정렬의 의미는 spec §3.2를 따르고 URL sort 값/페이지 크기는 tasks T1에서 확정, 조건 변경 시 cursor 해제 |
| `key`, `keySurface` | keyId, 소속 surfaceSlug. 다른 프로젝트/소스에 대한 id는 조회 범위를 넓히는 근거가 아님 |
| `language` | 생략은 전체, `@missing`은 Missing only, 나머지는 활성 locale code. 실제 코드와 충돌하지 않는 예약값 검증 |

허용 목록으로 파싱한다. `constructor` 등 프로토타입 값에 대한 인덱싱을 하지 않는다. 키가 없어도 목록/트리 조회는 살아 있고 상세만 부재다. 인가 실패는 이 빈 상태로 위장하지 않는다.

옛 링크: `state=untranslated`는 completion=incomplete로 변환, 나머지 기존 state는 보존한다. `locales`는 단일 유효 코드일 때 상세 language로 옮기는 안이며 복수는 전체로 연다. `focus`는 종전대로 무시한다. Home의 프로젝트 상태 링크는 `ns=*`/scope=project를 명시하여 프로젝트 전체 상태에 착지시킨다. 키 결과 수와 Home의 셀 집계 수는 단위가 다르므로 동일 숫자라고 주장하지 않는다. 소스 단위 카드 링크는 scope=source를 명시한다.

Logs의 과거 payload에는 keyId 대신 키 이름이 있으므로 인가된 projectId+surfaceSlug+key 이름으로 현재 id를 해석한다. 없음은 부재 안내다. Copy link는 현재 source/key/language를 routes 헬퍼로 직렬화한다. 옛 페이지 redirect·수신 Search 타입·`entry-points.test.ts`도 함께 갱신한다.


### 3.1 완성도 기억값·선택 예외 — 3차 시안 추가

`Missing in ja`에서 ja 없는 단일 소스로 좁히면 실제 필터는 Incomplete, 사용자가 선택했던 ja는 기억했다가 언어가 있는 범위로 넓힐 때 복원한다. 메모리만 쓰면 공유/새로고침 뒤 행동이 달라지므로, **요청한 completion/missingLocale를 URL에 유지하고 effective 필터를 순수 함수로 계산**한다. Clear filters나 다른 완성도 명시 선택은 기억값까지 버린다. 5차 시안에서 이 계약을 확정했다.

선택 판정에는 이유가 필요하다: 트리 클릭, 필터 변경, 초기화, 저장 응답, Saved 보존 행 클릭을 구분한다. 자동 선택을 전역으로 적용하거나 매 revalidate마다 key가 필터에 남는지 검사하면 저장 뒤 문맥을 보존하는 계약이 깨진다. 필터 세대가 바뀔 때 선택 적격을 다시 계산하고, 해당 세대의 Saved 보존 행은 상세로 다시 열 수 있다.

## 4. 키 단위 저장

`saveTranslationKey({slug,surfaceSlug,keyId,changes:[{localeCode,value}]})`.

- 값당 상한은 기존 10,000자, 로케일 개수의 방어 상한은 기존 push 상한 200을 넘지 않는다. 실제 활성 언어 집합의 부분집합이어야 한다. 중복 locale, 빈 changes, 다른 키/표면/미등록 언어를 거부한다. 합계 페이로드 크기와 기존 Server Action body 제한의 관계는 실측 게이트에서 정하며 무조건 상향하지 않는다.
- 결과: `{ok:true,keyId,cells:[{localeCode,value,pending,needsReview,updatedAt,actorLabel}],summary,changedLocales}` 또는 `{ok:false,error,localeCodes?}`. 도메인 거부·unavailable·unauthorized·DB 실패를 구분한다. 서버 에러 원문을 클라이언트에 보내지 않는다.
- `readSession` → 입력 검증 → `getSurfaceAccess(...translation:write)` → readiness → transaction. 잠금은 Project → TranslationSurface, 현재 `maxWait:10_000, timeout:30_000` 유지. 잠금 이후 키/언어 활성 및 권한 변경에 대한 최종 검사.
- **모든 셀을 먼저 검증/계획하고 나서 쓴다.** 여러 셀 loop 도중 return으로 거부하면 앞 셀이 커밋될 수 있으므로 금지한다. 실제 실패는 전체 트랜잭션 롤백.
- `planSave`를 셀마다 재사용한다. upsert마다 UUID 토큰, current actor, needsReview=false. no-op은 값/토큰/사건/needsReview를 변경하지 않는다. 일반 Save에 expectedVersion 비교를 추가하지 않는다.
- 기존 `translation.saved`를 변경 셀마다 같은 tx에서 남긴다. 새 batch 이벤트 모델은 만들지 않는다. before는 잠금 뒤 읽은 값이다.
- `/projects/${slug}` layout, `/projects`, `/projects/new` 무효화를 유지한다. draft 소유 Client 컴포넌트는 필터 결과/선택 행 유무에 따라 언마운트하지 않는다.

클라이언트는 saved 기준, draft, inFlight 제출 스냅샷을 분리한다. 성공 시 요청 당시 문자열과 현재 draft가 같은 셀만 서버 정규화값으로 대체한다. 다른 셀은 saved 기준만 갱신한다. 실패/늦은 응답/다른 키 응답을 서로 적용하지 않는다. 저장 중 도착한 RSC 값과 성공 응답 순서도 순수 reducer 테스트로 고정한다.

저장 결과로 갱신되는 summary와 목록 멤버십/순서를 분리한다. 조건을 바꿀 때 증가하는 목록 세대 안에서는 반환된 saved 행을 기존 위치에 overlay하고, 삭제/권한 상실은 보존 예외다. 목록에 남은 표시 행 수와 현재 조건의 matchedKeyCount가 다를 수 있음을 Saved 라벨과 `+{n} saved`로 드러낸다. 저장 직후에는 자동 선택 해제도 하지 않는다. 같은 필터 세대의 Saved 보존 행은 다시 선택할 수 있다.

## 5. 전달값 스냅샷과 Revert

### 5.1 데이터 모델 — additive 제안

별도 `TranslationDeliveryBaseline` 테이블을 제안한다. Translation 행이 없던 셀도 전달 상태를 가질 수 있어 Translation의 nullable 컬럼만으로는 부족하다.

| 필드 | 목적 |
|---|---|
| `projectId,surfaceId,keyId,localeCode` | 복합 unique/PK, StringKey·Locale·Surface 복합 FK, onDelete Restrict |
| `restoreValue: String` | DB export 입력으로부터 만든 복원값. 전달 당시 base의 부재/빈값은 캡처 sourceText, 비-base 부재는 빈 문자열로 표현 |
| `revision: String` | 서버 생성 UUID. 동일값 재확인도 다른 전달 관측임을 구분 |
| `confirmedAt: DateTime`, `syncRunId` | 전달 확인 시각/실행. SyncRun은 projectId 포함 복합 FK |
| `sourceHash`, `contextFingerprint` | 원문·실제 base·어댑터/경로/리포 정체성/브랜치·소스 importRevision이 다른 복원을 차단 |
| `invalidatedAt: DateTime?` | strict 적재·관련 설정 변경 이후 옛 기준임을 표시. 기록 삭제 안 함 |

`lib/privacy/collected.ts`의 `MODEL_CLASSES`는 `Prisma.ModelName` 전수를 요구하므로 모델 추가와 함께 등재한다. 현 baseline은 사람 식별 필드 없이 번역 작업 상태를 저장하는 `not-personal` 분류를 기준으로 최종 필드와 SyncRun 참조를 검토한다. 개인정보 필드가 추가되면 해당 필드 등재도 함께 갱신한다. Prisma 재생성 후 타입 검사를 T5 완료 조건으로 둔다. 스키마·마이그레이션 전용 커밋과 등재부 앱 코드 커밋은 분리하되 둘을 함께 검증한다.

**과거 데이터 backfill 없음.** 기존 value, updatedAt, lastPulledAt, 이벤트 before/after만으로 전달을 입증하지 않는다. 행 부재는 unknown이다. 리포 재조회로 몰래 채우지 않는다. 최초 확인 전 pending은 정상이며 Revert만 사용할 수 없다.

이 테이블은 마지막 복원 기준만 갱신하는 것이고 전체 번역 히스토리 저장소가 아니다. **시간 기반 보존 기간/TTL 삭제를 추가하지 않는다.** 최신 확인 때 같은 셀 기준을 갱신하고 의미가 달라지면 무효화한다. 감사 이력은 삭제하지 않는 ProjectEvent가 가진다. 새 인덱스는 복합 키 조회와 EXPLAIN 근거만으로 결정한다. 환경변수 추가 없음.

### 5.2 Publish와 기준 저장

1. 기존 `loadPullState`의 RepeatableRead 스냅샷에서 keyId·활성 locale·value/sourceText·sourceHash·context·pending 토큰과 해당 SyncRun 실행권을 함께 캡처한다. UI가 보낸 값을 기준으로 삼지 않는다.
2. 복원값은 **동일 DB export 입력**과 현재 `buildWriteEntries`의 base 폴백에서 유도한다. 실제 렌더 파일에 대응되는 활성 셀만 후보가 된다. 같은 key가 여러 파일에 속한 multi-locale의 전달 범위도 writer 결과와 대조한다.
3. `committed` 및 `no-changes`의 기존 성공 확정 위치에서만 기준을 기록한다. no-changes는 sync 브랜치 원복이 필요한 경우 그것이 성공한 뒤다. no-edits·writer-warnings·거부·실패·응답 미확인에는 기준을 만들지 않는다. cron도 같은 코드 경로다.
4. 전달 기준 갱신·lastPulledAt·기존 `(translationId,pendingToken)` CAS 해제를 한 DB 트랜잭션으로 묶는다. 키/언어가 활성인지 재확인하고 Project → 정렬된 Surface 잠금 순서를 따른다. 여기서 GitHub API를 부르지 않는다.
5. **토큰 CAS와 기준 갱신을 같은 조건으로 묶지 않는다.** A를 보낸 사이 B가 저장됐으면 기준은 A가 되고 B의 pending은 남는다. 현재 DB B를 다시 읽어 기준으로 쓰면 안 된다. 이후 Revert가 A를 복원한다.
6. 완료 기록은 현재 실행권·캡처 context가 유효할 때만 쓴다. stale 실행 교체나 strict 적재/설정 변경 이후 늦은 성공은 새 기준을 덮지 않는다. 외부 쓰기는 끝났을 수 있으므로 pending 유지 + 전달 상태 불확실 결과로 남긴다.
7. 전달 기준 갱신은 Translation.updatedAt을 움직이지 않는다. 전체 활성 키×언어의 기준을 bulk upsert하여 행마다 쿼리하지 않는다. baseline 후보 수의 예산은 **Σ(전달 대상 소스별 활성 키 수 × 활성 언어 수)**로 계산한다. push의 번역 행 200,000개 제한은 희소한 입력 행에 대한 제한이며 baseline 상한이 아니다. 키 20,000개·언어 200개 조합은 소스 하나에서 4,000,000개 후보가 되고, 다중 소스 Publish는 이를 합산한다. 실제 기록 대상은 2번의 렌더 범위로 제한하되, 실측 예산을 기존 Translation 행 수로 대신하지 않는다. T1에서 희소 번역·다중 소스 fixture로 캡처/저장의 전체 시간·메모리·잠금 시간을 측정하고 필요한 chunk 크기를 결정한다. chunking만으로 단일 트랜잭션의 전체 시간이나 잠금 비용이 줄었다고 보지 않는다. 현재 지원 규모에서 성공 확정의 원자성과 실행 시간 제한을 함께 만족하지 못하면, 이를 해결할 설계를 확정하기 전 baseline writer 구현 착수를 보류한다.

**검수 확정 — 외부 쓰기 실패 후 옛 기준 사용 금지:** 첫 GitHub mutation 전에 Project → 정렬된 Surface 잠금 안에서 실행권·context를 확인하고 전달 대상 소스의 기존 baseline 무효화를 커밋한다. 무효화 실패 시 외부 쓰기는 하지 않는다. 기준 재활성화는 위 성공 확정 트랜잭션에서만 가능하다. `no-changes`의 sync 브랜치 원복도 외부 쓰기에 포함한다. 외부 쓰기가 없는 동등 확인은 기존 성공 확정 조건을 따른다. writer-warnings/no-edits 등 mutation 전 종료는 이 무효화를 요구하지 않는다.

GitHub 쓰기 성공 뒤 DB 완료 실패·응답 유실이면 기존 기준은 무효 상태, 편집 토큰은 pending으로 남는다. 실행이 FAILED로 닫혀도 Revert는 열리지 않는다. 재조회만으로 성공을 추정하거나 옛 기준을 재활성화하지 않고, 안전한 다음 전달 확인을 요구한다. 외부 쓰기 전에 실패했더라도 무효화를 이미 커밋했다면 복원이 잠기는 비용을 허용한다.

`runSync`가 runId/실행권을 `triggerPull` 이하에 전달하고 완료도 현재 실행권에 대한 조건부 쓰기로 확정한다. **DB 실행권 검사가 이미 전송된 GitHub 요청을 취소하지는 않는다.** 교체된 실행의 외부 쓰기가 끝났는지 불확실하면 후속 실행의 성공만으로 Revert를 열지 않는다. T1에서 외부 실행 종료를 확인하는 근거와 차단 해제 조건을 정하고, 증명하지 못하면 Revert 개방을 보류한다. 시각 경과나 SyncRun의 FAILED 상태만을 종료 증거로 삼지 않는다.

원본 파일에서 읽는 것은 계속 구조/표현뿐이다. restoreValue는 DB 유래다. 비-base 빈값의 수술적 writer는 원본 값을 남길 수 있으므로, 이 값은 **전달 확인된 DB 번역 상태**이지 임의 원본 문자열의 백업이라는 약속이 아니다. 사용자 문구에서 이 경계를 설명하며, 엄밀한 ‘파일에 있던 마지막 문자열’ 요구로 바뀌면 이 설계를 재검토한다.

### 5.3 무효화와 배포

- 성공한 strict push/수동 Sync는 **그 소스**의 기존 기준을 같은 트랜잭션에서 무효화한다. deferred/rejected/실패는 무효화하지 않는다. repositoryId/baseBranch 변경은 해당 프로젝트 기준, 실제 base/경로/어댑터 변경은 해당 소스 기준을 무효화한다. 원문 변경/키·언어 orphan도 복원 부적격이다.
- 전달 확인 tx가 읽는 context와 무효화 tx의 순서를 잠금으로 고정한다. 선언된 base가 아니라 실제 적용 base를 비교한다. 소스 보관/복구 중 구형 기준이 다시 유효해지지 않게 한다.
- 배포 A: additive 스키마 → 스냅샷 기록/무효화 writer. 배포 B: 새 Save/조회/UI 및 Revert 사용. 프로덕션 배포 B는 T18–T20 통과 뒤에만 개방한다. T20은 preview에서 승인된 실리포로 검증하고 그 결과를 프로덕션 개방 게이트에 포함한다. 기존 writer는 스냅샷을 모르므로 A의 구버전 실행 종료 확인 후 기준 수집을 시작하고 B를 연다. 이를 타임아웃 없는 ‘조용한 동시 가동’으로 두지 않는다.
- 롤백 때 테이블을 삭제하지 않는다. 스냅샷을 모르는 구버전으로 돌아갔다 재진입하면 기존 기준을 무효화하고 새 확인부터 수집한다. dev/prod DB 적용은 `/db` 절차, 원격 배포는 Claude Code 경로다.

### 5.4 복원 Action

`previewTranslationRevert({slug,surfaceSlug,keyId})` → `{status:'ready',locales:[{code,before,after}],confirmation}` 또는 unavailable/forbidden/not-ready/baseline-unknown/baseline-stale/busy.

`revertTranslationKey({slug,surfaceSlug,keyId,confirmation})` → 복원한 셀/summary 또는 reconfirm/거부. 기존 `lib/protection/fingerprint.ts`처럼 서버만 아는 pending 토큰을 포함한 정규 튜플의 SHA-256 지문을 발급하고 잠금 뒤 재계산하여 timing-safe 비교한다. 인가 사용자·프로젝트·소스·키·pending 전체 집합·baseline revisions·context를 바인딩한다. 토큰과 revision 원문은 화면에 내보내지 않으며, 클라이언트가 아는 값만 해시한 문자열을 승인 증거로 삼지 않는다. 기존 방식과 같이 별도 HMAC·암호화 키·환경변수는 추가하지 않는다.

권한은 `project:settings`(OWNER)로 확정했으며 조회·저장과 별도다. 단순히 Save Action의 권한을 복사하지 않는다.

잠금 후 인가/활성/진행 중 Publish·Import/불확실한 외부 실행/대상 전체/지문/기준을 재검사한다. 무효화된 기준이나 외부 실행 종료 미확인은 **쓰기 0건**으로 복원을 차단한다. 지문 불일치하면 **쓰기 0건**으로 reconfirm. 일반 Save는 여전히 마지막 저장 승리다. 복원은 스냅샷이 지정한 값을 명시적으로 쓰는 명령이지 저장값을 병합하는 판정이 아니다.

대상 전체를 계획 후 복원값을 쓰고 해당 토큰을 해제한다. updatedBy는 실행 사용자, needsReview는 현재값 보존. 값이 같아도 pending 해제가 발생했다면 복원 사건이며 일반 Save의 no-op과 구별한다. `translation.reverted` subtype에 before/after·언어·기준 확인 시각을 기록하고 원문 토큰은 남기지 않는다. 기존 TRANSLATION payload 및 목록/상세 렌더 확장을 우선 검토한다. 실패하면 값·토큰·사건 전부 롤백한다.

저장 후 응답 유실과 마찬가지로 복원 응답 유실도 결과 미확인이다. 낡은 confirmation을 무조건 재실행하지 않고 현재 상태를 읽어 재확인한다. 재조회 장애를 ‘이미 성공’으로 접지 않는다.

## 6. 화면 배선·프리미티브

단일 화면 소유자가 draft·전환 요청·목록 세대·Save/Revert 결과를 관리한다. 트리/검색/필터/초기화/키 선택과 셸 내부 링크를 공통 guard에 연결한다. 모든 문서 click을 가로채는 임의 구현 대신 리포가 소유한 이동 진입점을 명시한다. 브라우저 history 전환은 Next 공개 기능/현재 설치 코드로 가능한지 구현 전 spike하고, 검증되지 않은 내부 router API를 약속하지 않는다.

패널 폭은 번역값과 분리하여 사용자×프로젝트 localStorage에 보관하는 안이다. 손상값·다른 창 크기는 clamp, 저장 불가 시 메모리 fallback. 계정 변경 시 다른 사용자 폭 키를 읽지 않는다. 기존 `panelConstraints`/`panelLayout`의 실제 그룹폭−16px 환산을 재사용한다. 3차 시안 기준은 넓을 때 260/392, 하한 208/336이고 목록부터 줄이므로 내부 비율은 고정이 아니다. 카드 영역 980px(208+336+16+420) 아래에서 트리를 접고 772px 아래에서 본문 가로 스크롤을 사용한다. 표의 경계는 카드 외곽/내부 보더 포함 여부를 구현 시 실측한다. 사용자가 저장한 선호 폭은 clamp 결과로 덮어쓰지 않아 넓힐 때 돌아온다. 접힌 트리는 폭 280·최대 높이 320px 오버레이로 열고 Escape/바깥 클릭/트리 버튼 재클릭으로 닫는다. 선택에는 공통 guard를 적용하며 닫으면 트리 버튼으로 포커스를 돌린다. 가로 스크롤은 본문만 소유한다.

기존 Select/DropdownMenu/Input/Textarea/Button/Dialog/Resizable을 재사용한다. 단순 단일 선택은 SelectTrigger에 md/sm을 확장하는 안, 검색 가능한 언어 메뉴는 기존 DropdownMenu 구성으로 검토한다. Radix Select 메뉴 안에 Input을 억지로 넣어 typeahead와 포커스를 충돌시키지 않는다. 새 의존성 없이 키보드 실험으로 구성 하나를 확정한다.

Textarea는 이 호출부에서 최소 2행·62px을 사용하며 전역 기본값은 소비자 조사 없이 바꾸지 않는다. 포커스 링 리터럴은 프리미티브에 남긴다. 빈칸 원문 오버레이는 pointer 입력을 가로채거나 value에 들어가지 않는다. 고정 푸터가 마지막 textarea를 가리지 않아야 한다. 핸들은 키보드로 조절 가능하고 새 선/점 없이도 focus-visible이 보인다.

3차 시안에서 확정된 세션 왕복 draft 복구는 sessionStorage에 **한 키**만 두고 사용자·프로젝트·소스·키를 검증한다. URL·로그·localStorage에 번역문을 넣지 않는다. 저장 성공은 reducer에 응답을 적용한 뒤 dirty 로케일이 0개일 때만 복구 사본을 제거한다. dirty 로케일이 남으면 최신 draft와 갱신된 saved 기준을 다시 기록한다. A 제출 뒤 B를 입력했다면 A 성공 뒤에도 B의 복구 사본이 남아야 한다. 명시적 폐기/로그아웃·다른 계정 로그인 후에는 제거한다. 차단된 storage에서는 보존을 약속하지 않는 문구를 표시한다. 다시 돌아와 인가 후 새 저장 기준과 draft를 분리해 복원한다. 새 서버 draft 테이블은 만들지 않는다.

### 6.1 Publish 미저장 확인·포커스

`Preview saved changes`는 기존 Publish preview를 연다. 실제 pull 실행은 preview의 실행 버튼에 남긴다. draft 소유자는 모달/결과/라우트 재검증 위에서 살아 있고 Publish 중 새 입력도 보존한다. 취소·완료·실패·닫기는 draft를 폐기하지 않는다.

복원 성공 후 Revert가 사라지면 푸터 결과 영역(`tabindex=-1`, live region)으로 포커스를 옮긴다. disabled Save는 그대로 둔다. 복원 버튼이 남는 실패/취소는 버튼으로 복귀한다. 결과 미확인은 `Check current values`로 재조회하기 전 실행을 차단하고 새 확인 지문을 발급받는다.

Copy link는 키 제목 오른쪽 28px 버튼이다. 성공 시 `Copied`를 2초 표시하고 실패 시 읽기 전용 URL을 선택할 수 있게 한다. 상세는 All languages가 기본이며 완료 언어 접기는 이번 범위에 없다.

## 7. 순수 함수와 TDD 진입점

이름은 제안이며 프로젝트 기존 책임에 맞춰 최종 배치한다. 클라이언트가 쓰는 파일은 server-only·Prisma·adapter 런타임·사전을 import하지 않는 잎 모듈이다.

| 함수 묶음 | 검증해야 할 계약 |
|---|---|
| `parseTranslationQuery`, `planTranslationSelection` | 옛 URL, namespace 선택 vs 필터 제거, reset 범위, unknown key, 다른 소스 결과 |
| `summarizeKey`, `orderKeySummaries` | active 집합, null/빈값/review/pending 독립, 동률 순서, 소스별 언어 차이 |
| `planKeySave` | planSave 재사용, 중복/부적격 locale, no-op, 원자적 전체 계획 |
| `reduceKeyDraft`, `planEditorNavigation` | 제출 뒤 재입력, 실패/재검증 교차, dirty 문자열, 다섯 이동, selection 보존 |
| `retainSavedRows`, `describeTranslationFilters` | 목록 세대, 현재 집계 vs 보존 행, 전체 범위 state 적용, 비활성 missingLocale의 effective 설명 |
| `planDeliveryBaselines`, `planKeyRevert` | base 폴백/부재, unknown·invalid 기준, 전체 pending 집합, token 교체와 기준 갱신의 분리 |
| `planTranslationPanelLayout` | 측정 전 null, 확정 폭 계약, 핸들 제외, 저장폭 clamp |

## 8. 제거 명세

UI 교체를 마친 뒤 소비자 `rg`로 확인한 것만 제거한다. `namespaceCountsFor`, `parseLocaleSelection`, `pendingFirst`, 기존 `filterByState/filterRows/groupByNamespace`는 다른 소비자가 있으면 유지하고 번역 페이지 사용만 교체한다. 로케일 다중 선택·옛 칩·KeyGroup 표·셀 blur/Enter 저장·옛 saveTranslation은 전환 완료 후 제거한다. 옛 URL 수신 호환과 새 `planSave` 재사용은 남긴다.

`translation-input.tsx`의 refocus/IME/접근성 회귀를 지우는 것으로 새 UI를 green으로 만들지 않는다. 옛 구조 소스 단언은 대응 행동/DOM 검사로 바꾼다. `common.toast.saved`는 핸드오프 명칭만 믿고 삭제하지 않고 실제 선언/소비자를 확인한다.

신규 문구: Keys/Incomplete keys, `{n} missing`/Complete, All keys/Incomplete/Missing in/All sources, All languages/Missing only, `{n} of {total} languages`, Not saved/Missing, unsaved changes, Revert/기준 없음/재확인/권한 사유, 저장 실패/결과 미확인/세션 만료, Discard/Keep editing, 다섯 빈 상태·사라진 키·검색 출구·필터 설명. 기존 Save/Sync/Publish/Cancel/Needs review/Not yet sent/Source/참조 라벨은 `messages/en.tsx`의 실제 키를 재사용한다. 현재 카탈로그는 `messages/en.tsx` 하나이며 새 UI 언어를 추가하지 않는다. `New from GitHub`는 기존 어휘를 재사용한다. 복원 결과 미확인에 `Your saved values are unchanged`를 쓰지 않는다. Publish 확인은 `Keep editing` / `Preview saved changes`를 사용한다.

## 9. 불변식·과거 함정

- 불변식 1–4: 키/언어 존재는 리포, 현재 편집은 DB. 복원 기준은 전달 확인된 DB 입력만. orphan 보존, export writer/바이트 비교 규칙 유지. 스냅샷 읽기가 값 승자 선택으로 변하지 않게 한다.
- 불변식 5–8·10–11: 모든 조회/Action의 인가·프로젝트/소스 복합 경계·readiness 유지. baseline에도 같은 FK. GitHub 쓰기는 installation token, 정체성은 repositoryId. 새 외부 엔드포인트 없음.
- 불변식 9: 전체 롤백·불확실 응답·writer 경고·기준 미확인을 성공으로 숨기지 않는다. 결과가 재검증으로 언마운트되지 않는다.
- [POSTMORTEM](../../POSTMORTEM.md) 2026-09-09 ‘셀을 비우면 키가 사라짐’: base 빈값 export 폴백을 복원 캡처에서도 검사한다.
- 같은 문서 2026-09-11 ‘입력 28px’: 아트보드 폭에서 LNB/핸들/패딩/보더를 전부 뺀 실제 입력폭을 잰다. 소스 테스트만으로 통과 선언하지 않는다.
- 2026-09-12 ‘저장 실패 후 취소 기준’: 저장 중 RSC 갱신과 실패·성공을 교차 테스트한다. ‘필터 툴바만 잠금’: 모든 이동을 같은 소유자에 연결한다.
- 2026-09-15 ‘상태 링크가 0건 착지’: Home·Logs·기본 redirect의 조합을 실제 페이지에서 검사한다.
- 2026-09-18 미전달 count의 5.5초: SQL 계획/통계 및 0-token 경로를 확인한다. baseline 도입으로 편집 없는 cron의 GitHub 0회 계약을 깨지 않는다.
- 2026-09-20 ‘포커스 복귀’: disabled를 지나는 DOM 단언은 focus fixup을 포함하고 실제 브라우저에서도 재확인한다.
