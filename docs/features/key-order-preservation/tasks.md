# 키 순서 보존 — tasks

**순서: 측정 → 순수 함수 → 스키마 → 껍데기 → 검증 루프 → 재측정 → 문서.**
커밋 경계는 `⎯ 커밋 ⎯`으로 표시했다.

## 🔒 결정 필요 — 태스크 0 착수 **전에** 못 박는다

숫자를 본 뒤에 경계를 정하면 측정이 아니라 사후 합리화다. 아래는 이미 합의된 값이고, 태스크 0은
이 경계에 대고 판정만 한다.

| 항목 | 확정값 |
|---|---|
| **로케일 간 순서 일치율의 정의** | 리포별 일치율 = (base와 **공통 키 순서가 완전히 같은** 비-base 파일 수) / (전체 비-base 파일 수). base에 없는 키는 제외하고 공통 키만 비교한다 |
| **A안 / 대안 E 판정 경계** | 리포별 일치율의 **중앙값 ≥ 0.9** → A안(`StringKey.sortIndex`) 확정. **< 0.9** → 대안 E(`Translation.sortIndex`)로 승격하고 design.md를 고친다 |
| **들여쓰기 별기능 판정 경계** | 재생성 어댑터 리포 중 **2칸 비율 ≥ 0.8** → 순서 보존만으로 진행. **< 0.8** → 들여쓰기 보존을 별 기능으로 확정하고 완료 조건 1·2의 목표 수치를 그 비율로 재산한다 |
| **완료 조건 게이트 ②의 N** | diff > 0.10인 리포 비율 **≤ 20%** |
| **표본 상한 병기** | `MAX_PER_SHAPE_GROUP = 12`·`LOCALE_CODE_PER_DIR = 12` 때문에 mastodon(106로케일)·jellyfin-web(107)의 일치율은 **12개 표본 값**이다. 결과 표에 상한을 함께 적는다 |

## 0. 측정 먼저 — 설계 두 갈래를 숫자로 닫는다

**지표는 섰고 실측은 아직이다.** 아래 0-1(지표 구현)은 끝났고, 0-2(129개 실행과 판정)가 남았다 —
그때까지 A안/대안 E는 미결이고 태스크 1 이후를 시작할 수 없다.

### 0-1. 지표 구현 ✅ (2026-09-02)

- [x] **새 순수 모듈 + 단위 테스트** — `lib/survey/json-shape.ts`. 원본 JSON 텍스트에서 키 등장
      순서·들여쓰기·diff 원인을 뽑는다. `RepoSurvey`·`SurveyMetrics`에 필드 추가
  - 검증 통과: `pnpm test` green (`json-shape.test.ts` 31건, `order-metrics.test.ts` 21건)
  - ⚠️ `read`도 `JSON.parse`도 못 쓴다 — 전자는 정렬해 돌려주고 후자는 정규 정수 키를 끌어올린다
- [x] **로케일 간 키 순서 일치율** (정의는 🔒 표) — `localeOrderAgreement` / `localeOrderCompared`
  - 검증 통과: 실물 2개 리포(excalidraw·siyuan)에서 중앙값 **0.700**이 나온다 — 0도 null도 아니다
- [x] **잔여 diff 원인 분해** — 들여쓰기 / 비ASCII 이스케이프 / 빈 값 낀 배열 / 정수형 키 /
      **chrome `placeholders`·비-base `description`**
  - 검증 통과: 실물 2개 리포에서 `{"indent":1,…,"integerKeys":1,…}`
- [x] **비-base 로케일 파일의 diff** — `diffRatioNonBase`. `one.ts:297`의 `diffRatio`는 base
      하나만 잰다
  - 검증 통과: 실물 중앙값 0.920 (base 0.921과 따로 나온다)
- [x] **`not-run` 리포 수를 지표에 올린다** — `roundtrip.notRun`
- [x] **어댑터별 diff 중앙값을 `--json`으로** — `diff.byAdapter`. 목표 초과 비율(`overTarget`)도 함께
- [x] **표에도 싣는다** — 포맷별 표에 `비-base diff`, 리포별 표에 `순서 일치`·`들여쓰기` 열.
      태스크 0의 결과는 `docs/ADAPTER-COVERAGE.md`에 **표로** 기록되므로 표에 없으면 문서로 못 간다
- [x] **`configFiles` 배선 수리** — 껍데기가 구조 분해에서 버려 `configFileRepos`가 구조적으로 항상
      0이었다. `SurveyInput.configFiles`를 필수로 만들어 컴파일러가 막게 했다
      (`docs/POSTMORTEM.md` 2026-09-02)

⎯ 커밋 ⎯ `feat(survey): measure key order, indentation, and what else moves the diff` (완료)

### 0-2. 실측 실행과 판정 (남음)

- [ ] `pnpm adapter-survey`를 **학습 109개와 홀드아웃 20개에 따로** 돌린다 (합치지 않는다)
  - ⚠️ 캐시가 없어(`adapter-survey.ts:110`의 `rmSync`) 매 실행이 리포를 새로 clone한다. 학습
    109개가 ~3분 26초이고 그중 순수 판정은 20.9초다 — **네트워크·GitHub 가용성에 묶이므로 이
    실행은 `/push` 1단계 게이트에 넣을 수 없다.** 그래서 태스크 5의 L2가 있다
- [ ] **A안 / 대안 E 판정** — 일치율 중앙값 ≥ 0.9면 `StringKey.sortIndex` 확정, 미만이면
      `Translation.sortIndex`로 승격하고 design.md를 고친다
- [ ] **들여쓰기 별기능 판정** — 2칸 비율 ≥ 0.8이면 순서 보존만으로 진행, 미만이면 별 기능 확정 +
      완료 조건 1·2의 목표 수치를 그 비율로 재산
- [ ] **기준선을 `docs/ADAPTER-COVERAGE.md`에 표로 남긴다** — 일치율·들여쓰기 분포·원인 분해·
      `not-run` 수·`.`-키 리포의 손실 기준선(siyuan·musicblocks). 안 남기면 태스크 6의 "지금과 같은
      값을 유지하는지"를 대조할 대상이 없다
  - ⚠️ 표본 상한(`MAX_PER_SHAPE_GROUP` = 12)을 결과에 병기한다 — mastodon(106로케일)의 일치율은
    12개 표본 값이다

## 1. 순수 함수 — 순서 관측

- [ ] `LocaleEntry.order?: number`를 `lib/adapters/types.ts`에 추가 (계약 주석: 평탄화 순서, 첫 등장)
- [ ] `observeOrder` — `json-catalog.flatten`의 순회에 카운터를 얹어 `order`를 채운다
  - 검증: `pnpm test` — **새 테스트가 red → green.** 중첩 `{b:{y,x},a}`를 읽으면 `b.y=0, b.x=1, a=2`
- [ ] `chrome-locales.read`도 `order`를 채운다 (flat이라 `Object.entries` 순서 그대로)
  - 검증: `pnpm test` — 키 3개 파일에서 `order`가 `0,1,2`
- [ ] **`read`가 배열을 계속 정렬해서 돌려주는지** 확인 — 호출부가 그걸 전제한다
  - 검증: 기존 테스트 전부 green + `pnpm typecheck`
  - ⚠️ **"기존 테스트 green"은 회귀 없음만 말한다.** 이 기능은 끝까지 기존 테스트를 하나도 red로
    만들지 않는다(`order` 없는 픽스처는 전부 폴백 경로다) — `plan.test.ts:120-137`도
    `render.test.ts:66-70`도 green으로 남는다. **"동작함"은 새 테스트만 말한다**

⎯ 커밋 ⎯ `feat(adapters): read observes the key order it used to discard`

## 2. 순수 함수 — 순서대로 재조립

- [ ] `orderedEntries`가 `usableEntries`를 대체 — `order` 있는 것 먼저 오름차순, 없는 것은 뒤에
      코드 유닛 순, **동률은 코드 유닛으로 갈라 결정적**
  - 검증: `pnpm test` — order 섞임·전부 없음·동률·일부만 있음 네 경우
- [ ] **`json-catalog.ts:300`의 `sortedByKey(converted)` 호출을 제거**하고 `sortedByKey`를 삭제
      (호출부 0 = 내 변경이 만든 고아). `normalizeArrays`의 나머지는 안 건드린다
  - 검증: `pnpm test` — 중첩 파일 왕복이 **바이트 동일**(원본이 우리 순서를 안 따르는 픽스처로)
  - 검증: `grep -c "sortedByKey" lib/adapters/json-catalog.ts` → 0
- [ ] `chrome-locales.write`·`json-catalog.write`가 **둘 다** `orderedEntries`를 부르는지 확인
  - 검증: `grep -n "usableEntries" lib/adapters/*.ts` → 재생성 어댑터에 남아 있지 않다
- [ ] **수술적 어댑터가 이 변경에 닿지 않는지 확인** — `yaml-catalog.ts:274`·`code-dict.ts:300`의
      `missing.sort(compareKeys)`(없는 키 삽입 경로)는 `usableEntries`를 안 지나지만 정렬 규칙을
      공유한다
  - 검증: `pnpm test` — 수술적 어댑터 테스트 전부 green, 삽입 순서가 변하지 않는다
- [ ] **계약 테스트를 "추가"가 아니라 "교체"한다** — `__tests__/contract.ts:188-193`이 재생성
      writer에 **코드 유닛 정렬을 assert**하고 있어 이 기능이 반드시 깬다
  - `CONTRACT_KEYS`와 다른 순서의 `order`를 실은 **두 번째 픽스처**를 추가
  - 재생성 분기: 그 `order` 순서를 assert. 폴백 경로용 코드 유닛 assert는 **유지**
  - 수술적 분기: `order`를 줘도 **원본이 보존되는지** assert
  - `:163`의 "입력 배열 순서 무관"을 **"배열 순서가 아니라 `order` 필드에만 의존"** 으로 재작성
  - `:10`의 "`layout`으로 갈린다" 주석을 `writeStrategy`로 정정 (코드는 `:150`·`:177`)
  - 검증: `pnpm test` — 규칙을 어기는 가짜 어댑터가 잡힌다. `formatFor`의 `AdapterName` union 전수
    `switch`(`:97-125`)가 새 어댑터를 자동으로 잡는 성질을 깨지 않는다
  - 검증: `pnpm typecheck`

⎯ 커밋 ⎯ `feat(adapters): regenerate writers keep the original key order`

## 3. 스키마 — additive (껍데기보다 먼저)

**3이 4보다 앞이다.** `apply.ts`에 `sortIndex` 컬럼을 넣으려면 Prisma 클라이언트에 필드가 있어야
하고(없으면 `pnpm typecheck`가 즉시 red), 다음 단계의 `pnpm push:local` 실 DB 왕복도 컬럼이
배포된 뒤에만 된다. additive-first(스키마를 먼저 넓힌다)와도 이 순서가 맞다.

- [ ] `/db`로 진행한다. `StringKey.sortIndex Int?` + 마이그레이션 생성
  - 검증: `pnpm db:status` 드리프트 없음, 생성된 SQL이 `ADD COLUMN ... NULL` 하나
  - ⚠️ **`migrate dev`의 리셋 제안은 절대 승인하지 않는다** — dev DB가 prod DB다
- [ ] `pnpm db:deploy`로 프로덕션에 컬럼을 먼저 넓힌다
  - 검증: 프로덕션에 컬럼이 있고 배포 후 기존 조회가 죽지 않는다

⎯ 커밋 ⎯ `feat(db): add StringKey.sortIndex` (`/db`가 자기 규약대로 만든다)

## 4. 껍데기 — push가 저장, pull이 읽는다

### 4-1. push 방향

- [ ] 페이로드 `IncomingKey.order?: number` (`lib/push/plan.ts`). **optional이되 폴백은 null**
  - 검증: `pnpm test` — order 없는 페이로드가 통과하고 `sortIndex`가 **null로 남는다**
  - ⚠️ **배열 인덱스로 채우지 않는다.** `read`가 이미 정렬해 돌려주므로 구 CI의 인덱스 = 코드 유닛
    순위이고, 그걸 박으면 "모름"이 "코드 유닛이 원본 순서다"로 DB에 굳는다(바이트가 같아 조용하다)
- [ ] `withSortIndex` → `PlannedKey.sortIndex`, `lib/push/apply.ts`의 벌크 upsert에 컬럼 추가
  - 검증: `pnpm test` (순수 판정) + `pnpm typecheck`
- [ ] `scripts/push-local.ts`가 `order`를 실어 보낸다 (`baseEntries.map`)
  - 검증: `pnpm push:local <대상>`의 응답 요약에 키 수가 그대로, 실 DB에 `sortIndex`가 채워진다

### 4-2. pull 방향 — **값 전달 경로 넷. 하나만 빠져도 조용히 죽는다**

design.md §pull (가)의 표 그대로다. 각각이 체크박스인 이유는, 이 중 하나가 빠져도
`orderedEntries`가 `order === undefined`를 보고 폴백으로 떨어지면서 **단위 테스트는 전부 green**
이기 때문이다 (POSTMORTEM 2026-09-02).

- [ ] a. `lib/pull/load.ts:40-47`의 `select`에 `sortIndex` 추가
- [ ] b. `lib/pull/render.ts:13-21`의 `RenderKey`에 필드 추가
- [ ] c. `lib/pull/plan.ts:131-137`의 `PullRow`에 필드 추가
- [ ] d. `lib/pull/plan.ts:148-168`의 `buildWriteEntries`가 `LocaleEntry.order`에 싣는다
      (writer에 넘길 entries의 **유일한** 관문이고 정렬을 하지 않는다 — `plan.ts:147`)
  - 검증(a~d 공통): 태스크 5의 **L1 진입점 테스트**가 유일한 판정 수단이다. 여기서는
    `pnpm typecheck`만 본다
- [ ] `lib/pull/load.ts:39`의 `orderBy`를 `[{ sortIndex: "asc" }, { key: "asc" }]`로
  - ⚠️ **`lib/keys/query.ts:56`은 건드리지 않는다.** `grep`하면 `orderBy: { key: "asc" }`가 두 곳
    잡히고, 그쪽은 **편집 UI 행 순서의 유일한 출처**다
  - 검증: 태스크 5의 L1 orderBy 단언 두 개

⎯ 커밋 ⎯ `feat(push,pull): carry key order through the payload and back out`

## 5. 검증 루프 — 1회성 측정을 상시 게이트로 내린다

**이 단계가 없으면 이 기능이 끝난 다음 날 누가 `orderedEntries`를 되돌려도 아무것도 안 빨개진다.**
`pnpm adapter-survey`는 네트워크 필수라 `pnpm test`에도 CI에도 못 들어간다.

### 5-1. L1 — 진입점 회귀 (`pnpm test`)

- [ ] `runPull`(`lib/pull/run.ts:51`, deps 주입)에 **순서 섞인 DB 상태**를 넣어 출력 파일 바이트를
      단언한다. `lib/pull/__tests__/fake-client.ts` 경로를 쓴다
  - 검증: `pnpm test` — `sortIndex` 순서대로 파일이 나온다. **값 전달 경로 a~d 중 하나를 일부러
    빼면 이 테스트가 red가 된다**(구현 중 한 번 확인)
  - ⚠️ `renderFiles` 단위 테스트로 끝내지 않는다 — POSTMORTEM 2026-09-02가 요구하는 "진입점"은
    어댑터도 render도 아니고 여기다
- [ ] prisma 스텁으로 `findMany`가 받은 인자를 캡처해 `orderBy`를 단언하는 테스트 2개
  - `loadPullState`(`lib/pull/load.ts`) → `[{ sortIndex: "asc" }, { key: "asc" }]`
  - `loadKeys`(`lib/keys/query.ts`) → `{ key: "asc" }` **그대로** (편집 UI 무변경 자동 가드)
  - 검증: `pnpm test`. 둘 다 prisma를 주입받으므로 I/O·DB 0이다

### 5-2. L2 — 골든 픽스처 (`pnpm test`, 네트워크 0)

- [ ] `lib/survey/diff.ts`에 `changedHunks(a, b)` 추가 — 이미 도는 LCS 순회에 비매칭 구간 카운터를
      얹는 순수 함수
  - 검증: `pnpm test` — 알려진 두 문자열에서 hunk 수가 기대값
- [ ] `lib/adapters/__tests__/key-order.test.ts` 신설. 실측 리포 모양 4개를 **인라인 템플릿
      리터럴**로 박는다 (리포에 fixture 디렉터리가 없고 `yaml-catalog.test.ts:14-33`이 그 관례다.
      남의 파일을 통째로 커밋하지 않아 라이선스 문제도 피한다)
  - ① 정렬 안 된 flat JSON ② 중첩 + 배열(excalidraw·open-webui 모양) ③ 점 포함 키가 중첩과 공존
    (siyuan·musicblocks 모양) ④ chrome `_locales`
- [ ] 픽스처마다 단언 셋:
  - ① 값을 안 바꾼 write 출력이 **원본 바이트와 동일**(2칸 픽스처에 한해)
  - ② `lib/survey/diff.ts`의 **프로덕션 함수를 그대로 import**해 `diffRatio === 0` — 코퍼스 지표와
    단위 테스트가 같은 자를 쓰게 한다
  - ③ write → read → write **바이트 고정점**
  - 검증: `pnpm test`
- [ ] 엣지 케이스를 픽스처에 명시: **`sortIndex` 전부 null**(현 동작과 바이트 동일이어야 한다),
      orphaned 키가 order에 구멍을 낼 때, 배열이 든 중첩 파일, 빈 엔트리 목록(`null` 반환),
      로케일마다 키 집합이 다를 때, base에 없고 다른 로케일에만 있는 키
  - 검증: `pnpm test`

### 5-3. L3 — 재측정 트리거를 규칙으로 등재

- [ ] **`lib/adapters/**`·`lib/survey/**`를 바꾼 커밋은 `pnpm adapter-survey`를 학습·홀드아웃 둘 다
      돌리고 `docs/ADAPTER-COVERAGE.md`를 갱신한다**를 CLAUDE.md 문서 신선도 절과
      `.claude/commands/push.md` 4단계에 등재
  - 검증: 두 파일에 그 문장이 있고, 지금의 수동태("재실행하면 갱신한다")가 트리거 문장으로 바뀐다
  - ⚠️ `docs/ADAPTER-COVERAGE.md` §0 3차가 "한 라운드에서 둘 다 돌린 것이 회귀를 잡은 유일한
    이유"라고 이미 적어 놨는데 **그 규칙이 어디에도 강제돼 있지 않다**
- [ ] 정렬 지점 재확인 grep을 규칙에 포함:
      `grep -n "orderBy\|compareKeys\|sortedByKey\|\.sort(" lib/pull/*.ts lib/adapters/*.ts lib/keys/*.ts`
  - 검증: 정렬 지점이 **재생성 경로 넷 + 경로 밖 둘**임을 매번 재확인한다

⎯ 커밋 ⎯ `test(adapters,pull): lock key order at the entry point and in golden fixtures`

## 6. 재측정 — 완료 조건 게이트 (1회성, 수동)

- [ ] `pnpm adapter-survey`를 **학습 109개와 홀드아웃 20개에 따로** 돌린다 (합치지 않는다)
  - 검증: `json-catalog` diff 중앙값 **≤ 0.10** (현재 학습 0.784 / 홀드아웃 0.843)
  - 검증: `chrome-locales` **≤ 0.10** (현재 학습 0.705 / 홀드아웃 **표본 없음**)
  - 검증: **diff > 0.10인 리포 비율 ≤ 20%**
  - 검증: **hunk 수 / 실제 변경 키 수 ≈ 1**
  - 검증: **비-base 로케일 파일의 diff**도 같은 게이트를 통과한다
  - 검증: **수술적 어댑터 3개가 0.000 유지** — 깨지면 "닿으면 회귀"다
  - 검증: **바이트 고정점 100/100 유지** — 깨지면 즉시 중단, 결정성 결함이다
  - 검증: 왕복 의미 동일 **98/100 이상 유지** + **`not-run` 수와 분모를 함께 기록**
  - ⚠️ 목표를 못 맞추면 태스크 0의 **잔여 diff 원인 분해**로 원인을 가른다. **목표를 낮추기 전에
    원인을 숫자로 댄다**
- [ ] **실물 확인 — 선행 셋업** (수동. `ts-dict`가 일회용 private 리포로 이 방식을 썼다 —
      MVP §9)
  - json-catalog 리포 사본 생성 + GitHub App 설치
  - `Project` 행 생성 (`installationId`·`adapterName`·`pathTemplate` — 없으면 `run.ts:66`·
    `plan.ts:59`가 throw한다)
  - `ACTIVE_PROJECT_SLUG` 교체 (단일 테넌트라 push 라우팅이 여기 묶여 있다)
  - 초기 push로 백필
  - ⚠️ **prod DB가 곧 dev DB다.** 남의 리포 키 수천 개를 실 DB에 적재하는 것이 맞는지 먼저 판단한다
    (`docs/TASKS.md` L405 🔒 미결). 부담이 크면 키 수십 개짜리 작은 리포를 고른다
  - ⚠️ `docs/TASKS.md` §6이 "재생성 어댑터 실물 pull"을 ❌ 범위 밖으로 닫아 놨다 — **이 태스크가
    그 판정을 되살리는 것이므로 §6도 같이 고친다**
- [ ] **실물 확인 — 대조군과 본실험** (수동, e2e 프레임워크 없음)
  - **대조군**: 편집 0건으로 pull → `0 files changed`. 재정렬이 없다는 진짜 증거다
  - **본실험**: **키 3개만** 편집 → pull → `git diff --numstat`이 `3 3`, `grep -c '^@@'`가 3
  - ⚠️ **`+N/-N` 대칭으로 판정하지 않는다.** 재정렬은 줄을 *이동*시킬 뿐이라 JSON에서 대칭이 항상
    성립한다(300키 전면 재정렬 실측: `270 insertions(+), 270 deletions(-)`). "전 로케일 편집"도
    하지 않는다 — 전부 바꾸면 순서 보존 여부와 무관하게 줄 수가 키 수로 고정된다
  - 검증: hunk 하나를 실제로 연다(`git diff | head -40`) — 들여쓰기·이스케이프·배열 모양이
    원본과 같은지는 숫자가 못 잡는다

## 7. 문서 — 코드보다 스펙이 먼저 거짓이 되지 않게

- [ ] **`docs/MVP.md` §4.1** — "키 정렬: `<` 비교"를 "`sortIndex` 순, 없으면 `<` 비교"로. 결정성이
      왜 유지되는지(순서가 DB에 있다) 한 줄
  - 검증: 재생성 writer 표와 §4.2 매트릭스가 코드와 일치
- [ ] **`docs/ARCHITECTURE.md` §1.1** — 불변식 표의 "키 정렬" 행 갱신 + 함정 셋 등재:
      **값 전달 경로가 넷**, **정렬 지점이 재생성 넷 + 경로 밖 둘**, **`orderBy: { key: "asc" }`가
      두 곳이고 하나는 편집 UI**
  - 검증: `grep -c "usableEntries" docs/ARCHITECTURE.md`가 0이고 `orderedEntries`가 잡힌다
  - 검증: §1.1의 `+N/-N` 실물 검증 서술에 **"수술적 어댑터 한정"** 단서가 붙는다 (재생성에서는
    대칭이 판별력이 없다)
- [ ] **`docs/ADAPTER-COVERAGE.md`** — 판정 ②를 "해소"로, 재측정 값 기록. **홀드아웃 어댑터별
      집계 표를 추가**한다(지금은 §9에 어댑터별 열이 없어 0.843을 사람이 검증할 수 없다).
      태스크 0의 일치율·들여쓰기·원인 분해·`writeErrors` 기준선·`not-run` 수도 표로 남긴다
  - 검증: spec이 인용한 모든 숫자가 이 문서에서 코퍼스 이름과 함께 확인된다
- [ ] **`docs/TASKS.md`** — §8 후속 2번 체크 + **이 기능의 자기 섹션 등재**(`adapter-generality`
      §8·`pull-to-pr` §6과 같은 형태). 지금은 L430 한 줄뿐이고 `grep "key-order" docs/`가 0건이다.
      §6의 "재생성 어댑터 실물 pull ❌ 범위 밖" 판정도 함께 고친다
- [ ] **`docs/MVP.md` §7 / `docs/TASKS.md` 후속** — **chrome `placeholders`·비-base `description`
      손실**을 별 기능으로 등재 (이번 범위 밖이지만 실제 pull이 대상 확장의 placeholder를 날리는
      경로다)
- [ ] **`docs/POSTMORTEM.md`** — 값 전달 경로를 빼먹어 무효였던 일이 실제로 재발했으면 등재
      (`/postmortem`)
- [ ] `.env.example` — **변경 없음** (새 환경변수 없다)

⎯ 커밋 ⎯ 문서별 별도 커밋 (`docs(MVP): ...` / `docs(ARCHITECTURE): ...` / ...)

## 의존 관계

```
🔒 임계값 확정 → 0 (측정) ─┬─→ 1 → 2 → 3 → 4 → 5 → 6 → 7
                          └─→ (E안 승격 판정 → design.md 수정)
```

- **🔒가 0보다 먼저다** — 경계를 모르면 측정 결과로 아무것도 판정할 수 없다.
- **0이 1보다 먼저다** — 측정이 스키마 모양(A안 vs E안)을 정하고, 그게 3·4의 내용이다. `read`가
  순서를 버리므로 측정은 원본을 직접 파싱해야 하고, 그래서 프로덕션 계약(`LocaleEntry.order`)
  변경 없이 먼저 돌릴 수 있다.
- **2가 3보다 먼저다** — 순수 함수가 없으면 껍데기가 무엇을 부를지 정해지지 않는다.
- **3(스키마)이 4(껍데기)보다 먼저다** — Prisma 필드가 없으면 `apply.ts`가 typecheck를 통과 못 하고
  `push:local` 왕복도 안 된다. additive-first와도 이 순서다.
- **5(검증 루프)가 6(재측정)보다 먼저다** — L1이 red면 값 전달 경로가 끊긴 것이고, 그 상태로 4분짜리
  survey를 돌리는 것은 낭비다.
