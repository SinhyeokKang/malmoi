# design — multi-surface projects, 2라운드 (다중 후보 선택)

범위는 `spec.md`다. ②의 행 형은 1라운드 spec §5.7을 따르고, 신규 생성의 적재 의미론은
이번 리뷰에서 확정한 All-or-Nothing 규칙으로 대체한다.

## 0. 한 줄 요약

**생성·첫 적재는 All-or-Nothing이다.** 모든 표면의 데이터를 준비한 뒤 프로젝트 생성과 전체 적재를
한 트랜잭션으로 커밋한다. 일부 파일 실패도 전체 거부다(2026-09-14 사용자 확정).

## 1. 영향 받는 흐름

| 층 | 지금 | 2라운드 |
|---|---|---|
| ② 후보 목록 | `RadioGroup` + `picked` | Checkbox의 `checked`와 미리보기 `detail` 분리 |
| ③ 기준 언어 | 단일 `baseLocale` | 체크한 표면별 `baseLocales` |
| 생성 | 프로젝트·표면 생성 후 별도 첫 적재 | 모든 표면 준비 후 생성·적재를 한 트랜잭션으로 커밋 |
| ④ | 생성 뒤 적재 대기·성공·실패 | 전체 적재가 끝난 성공 결과·토큰·YAML |

`/api/push`·pull·기존 Settings의 첫 적재 재시도·Add surface의 부분 실패 정책은 바꾸지 않는다.
이번 All-or-Nothing 규칙은 **신규 프로젝트 생성**에 적용하며 표면 하나도 예외가 아니다.

## 2. 기존 코드를 재사용하는 경계

현재 `runFirstIngest`는 `project.defaultSurface`만 조회하고, readiness에는 이미 `surfaces: [surface]`를
넘긴다. “다른 표면의 성공 때문에 가드가 막힌다”는 이전 원인 설명은 잘못됐다.
새 생성 흐름에서는 그 Action을 N번 호출하지 않으므로 `surfaceSlug` 추가와 별도 적재 대상 가드도 필요 없다.
`planProjectReadiness`는 유지한다. 신규 프로젝트는 전체 커밋 직후 모든 표면에 `lastCommitSha`가 있다.

- `lib/onboarding/ingest.ts`의 **`prepareFirstSnapshot`**: 파일·스냅샷 값을 받아 payload와 실패 수를 준비한다.
  GitHub·DB I/O가 없는 준비 단계이며 호출은 트랜잭션 밖이다. `payload === null` 또는 `result.failed > 0`이면
  전체 생성 거부다. 중복 키는 `errors`가 비어 있어도 `failed`로 거부한다.
- `lib/push/apply.ts`의 **`applyPushInTransaction`**: 열린 `Prisma.TransactionClient`로 순차 저장한다.
  새 생성 트랜잭션 안에서 표면마다 호출한다. `applyPush`·`ingestFirstSnapshot`은 내부에 별도 트랜잭션을
  열 수 있으므로 그 자리에서 호출하지 않는다. 런타임 속성으로 TransactionClient를 구별하지 않는다.
- `lib/surfaces/create.ts`는 열린 트랜잭션에서 표면 생성과 적재를 묶는 기존 예다. 다만 그 함수는 기존
  프로젝트의 Add surface이고 부분 실패를 허용하므로 새 프로젝트 생성에 그대로 호출하거나 정책을 바꾸지 않는다.

## 3. 순수 함수로 분리 가능한 부분 — `/tdd` 진입점

**기존 디렉터리에 둔다. 새 디렉터리를 만들지 않는다.**

| 함수 | 자리 | 무엇 | 왜 순수한가 |
|---|---|---|---|
| `planSurfaceSelection(candidates, checked, baseLocales)` | `lib/onboarding/select-surfaces.ts` (신설, **잎**) | 체크된 인덱스 집합 → `{ formats, defaultIndex, conflicts }`. 각 format의 `baseLocale`은 해당 인덱스의 사용자 선택이다. `planSurfaceSlug`를 누적 호출해 slug 충돌을 피하고, 후보의 `outputPaths`를 `surfaceOwnership`에 넘겨 충돌을 판정한다 | 후보 요약·체크 집합·표면별 언어 선택이 전부 값이다 |
| `prepareFirstSnapshot(input)` | `lib/onboarding/ingest.ts` (기존) | 표면별 payload·count·failed 준비. `payload === null` 또는 `failed > 0`을 새 생성 경로가 거부한다 | GitHub와 DB를 호출하지 않고 전달받은 값을 처리한다 |

새 `surfaceIngestGuard`·`planFirstIngestTargets`·`summarizeIngestResults`는 만들지 않는다.
④에는 성공 결과만 오므로 표면별 적재 상태 머신과 tone 집계도 필요 없다.

⚠️ **`planSurfaceSelection`은 클라이언트가 값으로 부른다 — 잎이어야 한다.**
`lib/onboarding/message.ts`가 `slug` → `lib/pull/trigger` → `lib/adapters` → `ts-morph`로 **7.2MB 청크**를
끌고 온 전례가 있다(ARCHITECTURE §0 말미). `planSurfaceSlug`는 `lib/onboarding/slug`만 import하므로
안전하지만 `surfaceOwnership`이 사는 `lib/surfaces/plan.ts`가 같은 파일에 있으니 **`client-graph.test.ts`로
확인하고 넣는다.** T4에서는 신설 모듈을 직접 그래프 진입점으로 검사하고, T9에서는 실제
클라이언트 import 배선으로 다시 검사한다. 연결 전의 전역 검사 green을 신설 모듈 검증으로 간주하지 않는다.
무거워지면 충돌 판정만 별도 잎으로 내린다.

## 4. Server Action 계약

### 4.0 후보 응답의 출력 경로 목록

- 후보 응답에 필수 `outputPaths: string[]`를 추가한다. `CandidateSummary`의 서버 응답 생산자와
  테스트 fixture를 함께 갱신한다. 수동 후보도 같은 응답 타입을 사용하면 서버에서 값을 채운다.
- 탐지 Action이 이미 가진 snapshot의 전체 경로와 각 확정 포맷으로 계산한다. 기존 `templatePaths`·
  `ingestTargets`·`resolveLocalePaths`의 경로 규칙을 재사용해 현재 파일과 해당 로케일의 출력 경로를
  포함하고, 중복 제거 후 코드포인트 순으로 정렬한다. 미리보기용 표본 경로로 대신하지 않는다.
  이 목록을 위해 blob을 추가로 읽거나 별도 snapshot을 만들지 않는다.
- 서버 계산 코드는 어댑터를 사용할 수 있지만 클라이언트는 문자열 목록만 받는다. `CandidateSummary`는
  타입으로만 import하고, 선택 판정은 `lib/surfaces/plan.ts`의 순수 함수로 목록을 비교한다.
- 임시 소유자 id는 서로 다른 후보 인덱스로 구별한다. 같은 후보의 중복 경로는 자기 충돌이 아니고,
  서로 다른 체크 후보가 같은 경로를 소유하면 경고한다. 미체크 후보는 비교 대상에서 제외한다.
- `createProject` 입력에는 `outputPaths`를 요구하지 않는다. 생성 서버는 §4.2의 새 snapshot과
  준비된 payload로 경로를 재계산한다. 탐지 응답의 목록을 서명·인가·저장 경로의 근거로 삼지 않는다.

### 4.1 `createProject` — 생성·적재를 한 요청으로

```ts
createProject({
  owner, repo, slug, name, baseBranch,
  surfaces: [{ adapter, pathTemplate, baseLocale }, ...],
})
```

성공 반환은 `{ ok: true, slug, pushToken, baseBranch, surfaces, count, yaml }`이다.
`surfaces`에는 서버가 확정한 `{ surfaceSlug, pathTemplate, adapter, baseLocale }`를 담는다.
`count`는 커밋한 전체 키 수이고, `yaml`은 그 확정값으로 서버에서 `renderProjectWorkflowYaml`을 호출한 결과다.
수동 입력의 adapter·베이스 언어는 유실하지 않는다. 표면별로 선택한 베이스 언어가 CI 첫 push에서도
유지되도록 필요한 `base-locale` 줄을 포함한다. 탐지 기본값을 유지한 기존 단일 표면 성공 YAML은
변경 전 기대 문자열을 기준으로 회귀 검증한다(새 렌더 함수끼리 비교하는 검사로 대체하지 않는다).

표면별 실패 응답에는 **실패 표면의 `pathTemplate`·기존 오류 코드·`failed`·진단**을 담는다.
인가·이름 충돌·프로젝트 한도 등 프로젝트 전체 실패는 기존 오류 계약을 유지한다.
서버가 확인한 거부와 응답 유실은 화면에서 구별한다(spec §5.2).

### 4.2 DB 쓰기 전 준비

1. 기존 세션·리포 접근 검사, 프로젝트 한도 선조회, slug·브랜치 검사를 유지한다.
2. `reader.snapshot(baseBranch)`은 **한 번** 호출한다. 모든 표면이 같은 SHA·tree·커밋 시각을 사용한다.
3. 표면마다 `templatePaths`가 정한 시도 대상과 `ingestTargets`의 합집합을 추적하고 `readFiles`·
   `planConfirmedFormat`·`prepareFirstSnapshot`으로 데이터를 준비한다. 못 받은 파일을 대상에서 빼지 않는다.
4. 포맷 불일치·다운로드 누락·파싱 오류·중복 키·0키·예산 초과는 전체 거부다. 새 생성 경로에서만
   `payload !== null && result.failed === 0`을 요구한다. 기존 첫 적재와 Add surface의 정책은 유지한다.
5. 서버가 확정한 포맷·스냅샷·payload 로케일로 출력 경로를 계산해 `surfaceOwnership`을 검사한다.
   클라이언트 충돌 검사는 사전 안내일 뿐이며 서버 거부를 대체하지 않는다.
6. 표면 slug·기본 표면·합산 결과·YAML을 준비한다. Project·Surface id와 `startedAt`은 서버에서 준비해
   같은 값을 저장에 사용한다. 기본 표면은 **체크된 후보 중 탐지 순서가 가장 앞선 표면**이다.

`prepareFirstSnapshot`이 요구하는 입력은 메모리에서 준비할 수 있다. 파싱·GitHub 읽기·YAML 렌더가
DB 트랜잭션 안으로 들어가지 않게 한다. 토큰은 원문을 저장하지 않고 해시만 저장한다.

### 4.3 원자적 저장

- 기존 생성 Action의 **User 행 잠금과 OWNER 프로젝트 한도 재집계**를 유지한다.
- 한 callback transaction에서 Project → OWNER·Surface N개 → 기본 표면 포인터 → 각 표면의
  `applyPushInTransaction`을 실행한다. Project id는 기존처럼 `randomUUID()`로 명시한다.
- 모든 DB 쿼리는 서버가 생성한 projectId·surfaceId 범위를 사용한다. 각 적재에 `previousBaseLocale: null`,
  준비한 `startedAt`, `importOutcome: null`을 넘긴다. 기존 쓰기 함수가 SHA·로케일·키·번역·refs를 함께 저장한다.
- 중간 표면·마지막 포인터/관계 저장·타임아웃 등 **어느 DB 실패든 예외를 트랜잭션 밖으로 전파**해 전체 롤백한다.
  callback 안에서 오류를 잡고 정상 반환해 앞 표면을 커밋하지 않는다.
- 커밋 성공 뒤 관련 캐시를 무효화하고 성공 결과를 반환한다. 커밋 이후 오류나 응답 유실을
  “전체 롤백”으로 표현하지 않는다. ④ 결과는 클라이언트 상태로 보존한다.

### 4.4 시간 제한과 응답 유실

직접 진입과 인터셉트 모달은 현재 `maxDuration = 60`이다. GitHub 읽기·파싱·전체 DB 쓰기가 이제
요청 하나에 들어오므로 표면별 예산 통과만으로 완료 시간을 보장하지 않는다. 트랜잭션에는 기존 Add surface의
명시적 `maxWait: 10_000`·`timeout: 30_000`을 출발점으로 사용하고 실제 다중 표면 적재 시간을 검증한다.
한도 미충족 시 부분 생성이나 별도 적재로 우회하지 않는다. 전체 읽기 시간과 DB 저장 시간을 나눠 보고한다.

All-or-Nothing은 **DB 상태의 원자성**이다. 커밋 뒤 응답만 유실될 수 있으므로 생성이 실패했다고
단정하거나 자동 재제출하지 않는다. 기존 목록 확인·Settings 토큰 재발급으로 복구하며 새 작업 큐나
토큰 원문 저장을 추가하지 않는다. 모달 닫기를 서버 취소로 취급하지 않는다.

## 5. 화면

### 5.1 ② 후보 행 — Radio → Checkbox + 형제 button

1라운드 spec §5.7이 형을 정했다. **DESIGN §6.7의 "① 리포 목록"과 같은 행 형을 유지한다** —
`padding:12` · gap 12 · 컨트롤 16 + 글리프 칩 40 r10 + 텍스트열 `gap-0.5`.

```
<li>                                   ← bg-muted 는 "상세 대상"일 때만
  <div class="p-3 flex gap-3">
    <Checkbox aria-label="Include {path}" />       ← 체크 축
    <button aria-label="Preview {path}">          ← 상세 축 (형제)
      [글리프 칩 40] [경로 15/500 + 보조 14]
    </button>
  </div>
</li>
```

- ⚠️ **`bg-muted`가 말하는 것이 바뀐다.** 지금은 "선택됨"인데 2라운드에서는 **"지금 오른쪽에 보이는 것"**이다.
  체크는 체크박스가 말한다. 두 축을 한 색으로 겸하면 "체크했는데 왜 값이 안 바뀌지"가 된다.
- ⚠️ **중첩 인터랙티브를 만들지 않는다.** 지금 `Radio`는 행 전체를 `<label>`로 감싸는데, 그대로 두고
  안에 button을 넣으면 클릭 대상이 둘인 한 요소가 된다.
- ⚠️ **이것은 프리미티브 치환이 아니다.** 지금은 행 아무 데나 누르면 선택인데, 바뀐 뒤에는 **누른 자리가
  하는 일을 정한다**(체크박스=포함 / 텍스트=상세). 클릭 영역이 하나에서 둘로 갈리는 것이 이 변경의
  실체이고, 동그라미가 네모가 되는 것은 그 결과다 — 시안 대조를 건너뛴 판정(tasks "확정된 결정")이
  덮는 범위가 여기까지임을 기록해 둔다.
- ⚠️ **`<ul>`의 list role을 덮지 않는다** — `RadioGroup`을 걷어내도 `<ul>`은 남는다. 2026-09-13에
  `asChild`가 list role을 덮어 `<li>`가 고아가 된 전례가 있고, 2026-09-14에는 **접근성 방어선 셋을
  세웠는데 셋 다 지워도 green**이었다(POSTMORTEM). 테스트 단언은 유지한 채 구현의 접근 이름·list role
  방어선을 하나씩 제거했을 때 **red가 나는지** 확인하고 복원한다.
- **초기 체크는 탐지 1순위 하나**, 초기 상세도 같은 행이다. 전부 체크하면 `examples/` 픽스처와 검색
  인덱스가 기본 적재 표면이 된다(1라운드 spec §5.7).
- **탐지 선택에서 체크 0개면 [Next]가 비활성이다.** 수동 지정은 현재 입력의 검증 성공 여부로 판정한다.
  껍데기가 [Next]의 활성 상태를 소유한다(DESIGN §6.7).

### 5.2 ⚠️ `Checkbox` 프리미티브가 리포에 없다

`components/ui/`의 프리미티브 **19개에 checkbox가 없다.** 신설하고, `radix-ui`에서 가져오는 컴포넌트가
**넷에서 다섯이 된다**(DropdownMenu·Dialog·Slot·RadioGroup + Checkbox).

- **`radix-ui`의 `Checkbox`를 쓴다** (2026-09-14 확정). `radio.tsx`를 형으로 삼는다 — 같은 크기(16)·
  같은 포커스 링·같은 disabled 처리여야 ② 행이 ①과 같아 보인다. native `<input>`로 가면 같은 화면에
  선 Radix Radio(①·③)와 그 셋이 두 벌이 된다.
- ⚠️ **`label`을 필수로 만들지 않는다.** 이 화면의 체크박스는 접근 이름을 `aria-label`로 받고 시각 라벨이
  형제 button 안에 있다. `radio.tsx`의 `label` 필수 계약을 그대로 복사하면 이 쓰임이 안 들어간다.
- 갱신 대상: `docs/DESIGN.md` §6.4(공통 형)와 프리미티브 수, `CLAUDE.md`의 UI 행, `docs/DIRECTORY.md`.

### 5.3 ③의 생성 대기·실패와 ④의 완료

- ③에서 생성·첫 적재 완료를 함께 기다린다. 입력·Back·생성 버튼을 잠그고 `role="status"`로 처리 중임을 알린다.
  닫기나 브라우저 이동이 서버 작업을 취소한다고 안내하지 않는다.
- 확인된 거부는 ③에 입력을 유지하고 `danger` Alert로 실패 경로·사유와 전체 미생성을 표시한다.
  중복 키처럼 상세 오류 배열이 비어 있어도 `failed`를 근거로 실패를 표시한다. 재시도는 전체 요청이다.
- 전송 오류는 결과 미확인으로 표시하고 프로젝트 목록 확인을 안내한다. 확인된 롤백과 같은 문구를 쓰지 않는다.
- ④는 전체 저장 성공 후에만 진입한다. 설명 줄은 `Imported N keys.`이고 성공 Alert는 없다.
  토큰·서버가 반환한 YAML·[Start translating]을 제공한다. 적재 중·부분 실패·표면별 재시도 UI는 없다.
- `revalidatePath`가 성공 결과·토큰을 씻어내지 않도록 ④ 상태는 클라이언트가 소유한다.

### 5.4 ③ 표면별 베이스 언어 선택

- `new-project.tsx`가 후보 인덱스별 `baseLocales`를 소유한다. 후보 목록을 받을 때 각 후보의
  `baseLocale`로 초기화한다. `detail`·미리보기 언어와 독립이며, 상세 전환은 이 값을 바꾸지 않는다.
- `steps/naming.tsx`는 체크한 후보만 탐지 순서로 받는다. 프로젝트 이름·주소 입력 아래에 각 경로와
  기존 베이스 언어 선택 UI를 묶어 표시하고, 접근 이름도 경로로 구별한다. 선택 가능한 언어는 각 후보의
  `locales`다. 후보 하나면 기존 단일 선택 UI를 유지한다.
- 체크 해제 시에는 제출 대상에서만 제외하고 언어 선택은 유지한다. 리포·브랜치 변경 또는 재탐지 시에는
  후보 목록과 함께 초기화한다. 마지막으로 미리 본 후보의 언어를 다른 표면에 복사하지 않는다.
- ③의 생성 게이트는 체크한 모든 표면의 언어 선택을 검사한다. `planSurfaceSelection`은 그 선택을
  `formats`에 싣고, `createProject`는 기존처럼 표면마다 `planConfirmedFormat`으로 유효성을 재검증한다.
  저장된 각 표면의 베이스 언어를 첫 적재에 사용한다.

### 5.5 수동 지정은 단일 포맷으로 제출한다

- 기존 `ManualEntry`·`manualCandidate`·현재 입력에 대한 검증 흐름을 유지한다. 수동 후보를
  `checked` 집합에 추가하지 않으며 다중 수동 후보 등록 UI도 만들지 않는다.
- `nextEnabled`는 탐지 선택과 수동 지정을 구별한다. 탐지는 체크 수·충돌을, 수동은 `manualMatched`를
  확인한다. 수동 입력·리포·브랜치 변경 시 이전 검증과 늦은 응답이 진행을 열지 못하게 한다.
- 생성 입력은 두 갈래다. 탐지는 `planSurfaceSelection`의 포맷 배열을, 수동은 현재 검증된 포맷과
  ③의 베이스 언어로 만든 배열 하나를 보낸다. 이전 탐지 체크나 상세 후보를 수동 요청에 섞지 않는다.
- 서버에서는 두 갈래 모두 같은 포맷 재확정·All-or-Nothing 생성 계약을 따른다.

## 6. 스키마 변경

**없다.** `TranslationSurface`·`Project.defaultSurfaceId`·복합 FK가 1라운드에서 이미 섰고, 이 기능은
같은 테이블에 행을 더 만들 뿐이다. 마이그레이션 0건 → `/db`를 지나지 않는다.

## 7. 새 환경변수

**없다.**

## 8. 불변식 영향

| 불변식 | 보존 방법 |
|---|---|
| 4 (export 결정성) | export 로직은 유지. 표면 순서는 탐지/slug의 기존 규칙을 사용한다 |
| 5 (범위·인가) | 기존 생성 인가·User 잠금·한도 재검사 유지. 새 ID 범위 안에서만 적재한다 |
| 8 (ready는 실제 적재 성공) | 생성 성공 시 모든 표면의 `lastCommitSha`와 번역이 같은 트랜잭션으로 저장된다 |
| 9 (버린 값을 숨기지 않는다) | 신규 생성은 `failed > 0`이면 전체 거부. 실패 경로·사유를 ③에 남긴다 |
| 10 (경로는 서버가 정한다) | 같은 서버 스냅샷에서 포맷·출력 경로를 재확정하고 충돌을 거부한다 |

## 9. POSTMORTEM에서 소환한 것

- **2026-09-07 — 재검증이 적재 결과를 씻어냄**: 커밋 뒤 재검증에도 ④ 결과·토큰을 유지한다.
- **2026-09-13 — 모달의 이전 검증·늦은 응답 재사용**: 체크·상세·베이스 언어의 무효화와 A→B→A 응답 역전 검증.
- **2026-09-13 — 임포트 종료 소유권**: 새 생성의 시작·종료 상태도 동일 트랜잭션에서 저장한다.
  기존 `runFirstIngest`의 `finally`·실패 캐시 무효화는 변경하지 않는다.
- **2026-09-13 — Radix DOM 테스트 지연**: `user-event`를 쓰는 파일에만 필요한 테스트 시간 제한을 둔다.
- **2026-09-14 — 접근성 검사에 도달하지 않는 결함**: 테스트 단언을 유지하고 구현의 접근 이름·list role
  방어선을 하나씩 제거해 red를 확인한다. 테스트 단언 자체를 삭제하는 검증이 아니다.
- **2026-09-14 — Project.id NULL**: 새 Project id를 명시하고 실제 생성 Action을 격리 PG에서 검증한다.
- **2026-09-14 — TransactionClient 자기 잠금**: 외부 읽기·파싱은 tx 밖, 생성·적재는
  `applyPushInTransaction(tx, ...)`로 같은 연결에서 실행한다. 기존 Add surface의 정책은 바꾸지 않는다.

## 10. 정본 갱신 (완료 시점)

- `docs/PRODUCT.md` §7.1 — "표면 보관·복원과 다중 후보 일괄 추가는 다음 라운드다"에서 **다중 후보 일괄
  추가를 뺀다**(보관·복원은 남는다).
- `docs/DESIGN.md` §6.7 — ②의 "후보 `Radio`"를 체크박스 + 형제 트리거로 고치고, `bg-muted`의 뜻이
  "상세 대상"임을 적는다. ③의 표면별 베이스 언어 선택을 적고, §6.4에 `Checkbox` 등재.
- `docs/DIRECTORY.md` — 선택 판정 잎 모듈과 `components/ui/checkbox.tsx`.
- `CLAUDE.md` — 프리미티브 19 → 20, `radix-ui` 넷 → 다섯.
- `docs/ARCHITECTURE.md` §3.1(온보딩) — 신규 생성은 준비 후 전체 적재까지 한 트랜잭션임을 적는다.
- `docs/PRODUCT.md`·`docs/DESIGN.md`의 신규 생성 정책도 갱신한다: 일부 파일 실패까지 전체 거부,
  ③에서 완료 대기, ④는 성공만 표시. 기존 Settings·Add surface의 정책과 구별한다.
