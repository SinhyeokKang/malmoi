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

## 0. 측정 먼저 — 설계 두 갈래를 숫자로 닫는다 ✅ (2026-09-02)

**끝났다.** 판정 3개가 확정됐고(A안 · 들여쓰기 별기능 · 게이트 분모 축소) **chrome 필드 보존이
범위로 들어왔다.** 결과 전문은 `docs/ADAPTER-COVERAGE.md` §10에 있다. 태스크 1부터 진행 가능하다.

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

### 0-2. 실측 실행과 판정 ✅ (2026-09-02)

- [x] `pnpm adapter-survey`를 **학습 109개와 홀드아웃 20개에 따로** 돌렸다 (합치지 않았다)
  - 결과 전문: `docs/ADAPTER-COVERAGE.md` **§10**
- [x] **판정 ① A안 확정** — 일치율 중앙값 **1.000**(학습·홀드아웃 둘 다) ≥ 0.9 →
      `StringKey.sortIndex`. 실질 근거는 **악화 후보 0건**
  - ⚠️ 한계 기록: 분포가 이중 최빈이라 **31%(22/71)가 일치율 0.5 미만**이다. 나빠지지 않을 뿐
    좋아지지도 않는다 — 그런 리포가 실제 도입 대상이 되면 대안 E로 승격
- [x] **판정 ② 들여쓰기 → 별 기능 확정** — 2칸 비율 학습 **69.0%**(49/71) · 홀드아웃 75.0%로
      경계 0.8 미달. 재생성 리포 71개 중 **30개**가 갖는 최대 잔여 원인이다
- [x] **판정 ③ 게이트 분모를 좁혔다** — 순서 외 원인이 없는 리포가 **23/71(32%)** 뿐이라 전체
      코퍼스에 diff 게이트를 걸면 68%가 다른 이유로 초과한다. spec 완료 조건 1·2를 그 부분집합으로
      다시 썼다
- [x] **chrome 필드 보존을 범위로 끌어왔다** — `chrome-locales` 33개 중 순서 외 원인이 없는 것이
      **5개(15%)** 뿐이고, 20개가 비-base `description`을, 12개가 `placeholders`를 잃는다.
      우리 도입 대상이라 순서만 고치면 첫 PR이 여전히 안 읽힌다
- [x] **기준선을 `docs/ADAPTER-COVERAGE.md` §10에 표로 남겼다** — 일치율 분포·들여쓰기 분포·
      원인 분해·`not-run`(학습 9 / 홀드아웃 4)·설정 파일(20 / 6)·손실 기준선·표본 상한 12

## 1. 순수 함수 — 순서 관측 ✅ (2026-09-03)

- [x] `LocaleEntry.order?: number`를 `lib/adapters/types.ts`에 추가 (계약 주석: 평탄화 순서,
      첫 등장, **파일 스코프**, 수술적 어댑터는 채우지 않는다)
- [x] `json-catalog.flatten`이 `order`를 채운다 — **별도 순회를 두지 않는다.** `out.length`가
      곧 평탄화 순서이고, 정렬은 호출부에서 **뒤에** 일어난다
  - 검증 통과: 중첩 `{b:{y,x},a}` → `b.y=0, b.x=1, a=2`
- [x] `chrome-locales.read`도 `order`를 채운다 (flat이라 `Object.entries` 순서 그대로)
  - 검증 통과: 키 3개 파일에서 `order`가 `0,1,2`
- [x] **`LocaleEntry.placeholders?: unknown`** 추가 + `chrome-locales.read`가 원본 블록을
      **해석하지 않고 그대로** 싣는다
  - 검증 통과: `placeholders`가 든 픽스처에서 read 결과가 원본과 deep-equal, 블록 **안의 키
    순서도 보존**
  - ⚠️ **모양이 이상해도 버리지 않는다.** 처음엔 객체가 아니면 걸렀는데 그게 이 기능이 없애려는
    바로 그 손실이었다 — 원본에 있던 것이 우리 PR에서 조용히 사라진다. 에러로 보고하는 것도
    답이 아니다: read 에러는 `pnpm push:local`을 exit 1로 막아 남의 리포가 우리 규칙으로
    실패한다 (POSTMORTEM 2026-09-02). `undefined`와 `null`은 `in`으로 가른다
- [x] **`read`가 배열을 계속 정렬해서 돌려주는지** 확인 — 호출부가 그걸 전제한다
  - 검증 통과: 기존 테스트 전부 green + `pnpm typecheck`. 순서는 **배열 위치가 아니라 필드로**
    나르므로 `contract.ts`의 "입력 배열 순서 무관" 불변식이 그대로 산다
- [x] **`.`-키 공존(`a.b` + `a.b.c`) 특성 테스트** — order가 접두 충돌 판정을 바꾸지 않는다
      (POSTMORTEM 2026-09-02)
- [x] **소비 층에 여분 필드가 새지 않는지 확인** — `scripts/push-local.ts`가 페이로드 필드를
      명시적으로 골라 담고, `survey`의 `sameMeaning`은 key·message만 본다. write는 안 건드려서
      출력이 바이트 동일하다

⎯ 커밋 ⎯ `feat(adapters): read observes the key order and chrome fields it used to discard` (완료)

## 2. 순수 함수 — 순서대로 재조립 ✅ (2026-09-03)

- [x] `orderedEntries`가 `usableEntries`를 대체 — `order` 있는 것 먼저 오름차순, 없는 것은 뒤에
      코드 유닛 순, **동률은 코드 유닛으로 갈라 결정적**
  - 검증 통과: order 섞임·전부 없음·동률·일부만·음수·order 0 여섯 경우 + 입력 무변형
  - ⚠️ **`if (e.order)`로 보지 않는다** — 0이 falsy라 파일의 첫 키가 맨 뒤로 밀린다
- [x] **`json-catalog.ts`의 `sortedByKey(converted)` 호출을 제거**하고 `sortedByKey`를 삭제
      (호출부 0 = 내 변경이 만든 고아). `normalizeArrays`의 나머지는 안 건드렸다
  - 검증 통과: 중첩 2·3층 왕복이 **바이트 동일**(원본이 우리 순서를 안 따르는 픽스처로),
    배열 인덱스 순서 유지, write→read→write 고정점
  - `setDeep`이 `orderedEntries` 순서로 트리를 만들고 `Object.keys`가 그 삽입 순서를 주므로
    **각 층은 이미 첫 등장 순**이다 — 계산할 것이 없었다(`levelOrder`를 안 만든 이유)
- [x] **`chrome-locales.write`가 `placeholders`를 되돌린다**
  - 검증 통과: 블록 **안의 키 순서까지** 바이트 동일, 객체가 아닌 값도 그대로, 없으면 필드 없음
- [x] `chrome-locales.write`·`json-catalog.write`가 **둘 다** `orderedEntries`를 부른다
  - 검증 통과: `grep -n "usableEntries" lib/adapters/*.ts` → **0건**
- [x] **수술적 어댑터가 이 변경에 닿지 않는다** — `yaml-catalog.ts:274`·`code-dict.ts:300`의
      `missing.sort(compareKeys)`는 그대로다
  - 검증 통과: 계약 테스트가 수술적 3개에 **"order를 줘도 출력이 같다"** 를 단언한다
- [x] **계약 테스트를 교체했다** — `contract.ts`가 코드 유닛 정렬을 단언하던 자리에 order 규칙이
      들어갔다
  - `CONTRACT_FILE_ORDER`(코드 유닛 순과 다른 배치)로 두 번째 픽스처를 만들었다.
    **키 집합은 `CONTRACT_KEYS`와 같게 뒀다** — 수술적 writer는 없는 키를 삽입하므로 집합이
    다르면 order가 아니라 집합 때문에 출력이 갈린다
  - 재생성: order 순서 assert + **폴백 경로용 코드 유닛 assert 유지**
  - 수술적: order를 줘도 원본이 보존되는지 assert
  - "입력 배열 순서 무관"을 order를 실은 배열에도 적용하도록 확장
  - 헤더 주석을 `layout` → `writeStrategy`로 정정
  - `ignoreOrder` 네거티브 추가 — order를 무시하는 가짜 어댑터가 잡힌다
  - ⚠️ **위치 검사에서 `"1"`을 뺐다.** 정규 배열 인덱스 키는 JS가 앞으로 끌어올려 삽입 순서를
    지운다 — 통과 불가능한 검사가 된다. spec 비목표 "정수형 키의 순서 보존"이 그 근거다
  - 검증 통과: `pnpm test` 681건 + `pnpm typecheck`
- [x] **진입점에서 확인했다** — 어댑터 단위 테스트가 아니라 실물 코퍼스로.
      **excalidraw 첫 write diff `0.843` → `0.000`** (57로케일 614키). siyuan은 0.999 유지 —
      tab 들여쓰기 + 정수형 키라 **둘 다 기록된 비목표**다
  - survey 테스트 3건의 기대값이 뒤집혔다: "정렬 안 된 원본은 diff가 난다"가 이제 거짓이다.
    지표(`diffRatioNonBase`)가 계속 유효하도록 픽스처를 **순서 외 원인(들여쓰기)** 으로 바꿨다

### 태스크 4로 미룬 것 — `description`

`chrome-locales.write`는 **아직 base에만 `description`을 낸다.** `buildWriteEntries`가 키 단위
`StringKey.description`을 **모든 로케일**의 엔트리에 싣기 때문에, 지금 `isBase` 가드를 풀면 pull이
비-base 파일에 **원본에 없던 description을 만들어 넣는다** — 잃는 것보다 나쁘다.
`Translation.description`이 생기는 태스크 4에서 함께 푼다. 그 상태를 테스트로 고정해 뒀다.

⎯ 커밋 ⎯ `feat(adapters): regenerate writers rebuild files in the original key order` (완료)

## 3. 스키마 — additive (껍데기보다 먼저) ✅ (2026-09-03)

**3이 4보다 앞이다.** `apply.ts`에 컬럼을 넣으려면 Prisma 클라이언트에 필드가 있어야 하고(없으면
`pnpm typecheck`가 즉시 red), 다음 단계의 `pnpm push:local` 실 DB 왕복도 컬럼이 배포된 뒤에만
된다. additive-first와도 이 순서가 맞다.

- [x] `/db`로 진행했다. **컬럼 셋을 한 마이그레이션에** —
      `20260903001247_add_key_order_and_chrome_fields`
  - 검증 통과: 착수 전 `pnpm db:status` 드리프트 없음(5개 전부 적용), 생성된 SQL이
    **`ADD COLUMN` 셋뿐** — `DROP`·`ALTER COLUMN`·NOT NULL 승격 없음
  - `--create-only`로 만들어 SQL을 먼저 읽었다 — dev DB가 곧 prod DB라 `migrate dev`로 바로
    밀지 않는다
  - 검증 통과: `pnpm db:generate` → `pnpm typecheck` → `pnpm test` 681건
  - ⚠️ **`Translation.description`은 `StringKey.description`과 다른 것이다.** 저쪽은 소스 키
    메타데이터, 이쪽은 **그 로케일 파일이 실제로 갖고 있던 값**이다. 하나로 합쳐 base 값을
    비-base에 쓰면 원본에 없던 내용을 만드는 것이라 병합이다 — 태스크 2가 `isBase` 가드를 못 푼
    이유가 이 컬럼이 없어서였다
  - `placeholders`는 `Json`이고 **해석하지 않는다** (`LocaleEntry.placeholders`와 같은 계약)
  - `sortIndex`에 **인덱스를 안 붙였다** — pull이 `projectId`로 좁힌 뒤 정렬하고 이 규모에서 키가
    수천 개다. 필요해지면 `@@index([projectId, sortIndex])`로 그때
- [x] `pnpm db:deploy`로 프로덕션에 컬럼을 먼저 넓혔다
  - 검증 통과: `pnpm db:status`가 6개 마이그레이션 전부 적용, `Database schema is up to date!`
  - **지금은 순서를 어겨도 안전하다** — 코드가 아직 세 컬럼을 조회하지 않는다. **태스크 4가
    조회를 넣는 순간부터는 아니다**

⎯ 커밋 ⎯ `feat(db): add StringKey.sortIndex and Translation description/placeholders` (완료)

## 4. 껍데기 — push가 저장, pull이 읽는다 ✅ (2026-09-03)

### 4-1. push 방향

- [x] 페이로드 `IncomingKey.order?: number`. **optional이되 폴백은 null**
  - 검증 통과: order 없는 페이로드가 통과하고 `sortIndex`가 null로 남는다. 음수는 거부
  - ⚠️ **배열 인덱스로 채우지 않는다** — `read`가 이미 정렬해 돌려주므로 구 CI의 인덱스 = 코드
    유닛 순위이고, 박으면 "모름"이 "코드 유닛이 원본 순서다"로 DB에 굳는다(바이트가 같아 조용하다)
- [x] `translations[]`가 **로케일별** `description`·`placeholders`를 받는다.
      `placeholders`는 `z.unknown()` — 모양을 검사하지 않는다
- [x] **`planPush`가 `order` → `sortIndex` 매핑을 한다** — 껍데기가 아니라 순수 함수 안이다.
      `apply.ts`에서 map하면 이 홉을 테스트가 못 덮는다
  - 검증 통과: `pnpm test`. order 0을 안 빠뜨리고, order 변경만으로 `needsReview`가 서지 않는다
- [x] `lib/push/apply.ts`의 벌크 SQL에 컬럼 셋 추가. `Translation` upsert의 `DO UPDATE`가
      `description`·`placeholders`도 덮는다 (strict — 리포가 이긴다)
  - ⚠️ **`::jsonb[]`로 바로 못 받는다** — Prisma가 배열을 `text[]`로 보내므로 text로 받아
    `SELECT v."placeholders"::jsonb`로 행마다 캐스팅한다. 그래서 `SELECT *`가 아니라 컬럼을
    이름으로 세운다
- [x] `scripts/push-local.ts`가 세 필드를 실어 보낸다
- [x] **실 DB 왕복** — `pnpm push:local ~/code/bugshot-2` → `200`.
      **단위 테스트가 원리적으로 못 보는 층**이고(SQL 문법은 런타임에만 드러난다), CI도 실 DB를
      안 치고 배포 뒤에 돈다

### 4-2. pull 방향 — 값 전달 경로 넷

- [x] a. `lib/pull/load.ts`의 `select`에 `sortIndex` + `translations`에 두 필드
- [x] b. `lib/pull/render.ts`의 `RenderKey`에 `sortIndex`, `cells`에 두 필드
- [x] c. `lib/pull/plan.ts`의 `PullRow`에 셋 다
- [x] d. `buildWriteEntries`가 `sortIndex → order`로 싣는다 (`order` 0을 안 빠뜨린다)
- [x] `lib/pull/load.ts`의 `orderBy`를 `[{ sortIndex: "asc" }, { key: "asc" }]`로
  - ⚠️ **가독성·디버깅 목적이다, 결정성의 근거가 아니다** — `orderedEntries`가 전순서를 만든다
  - ⚠️ `lib/keys/query.ts`의 같은 `orderBy`는 **안 건드렸다** (편집 UI 행 순서의 유일한 출처)
- [x] **`chrome-locales.write`의 `isBase` 가드를 풀었다** (태스크 2에서 미룬 것).
      `rowsForLocale`이 **base만** 키 단위 description으로 폴백하므로 비-base가 없던 값을 얻지 않는다
- [x] **실 DB로 배선 확인** — 읽기 전용 probe로 `load → rowsForLocale → buildWriteEntries` 전 구간:
      `sortIndex` 0~3이 파일 순서 그대로 나오고, **비-base(ko) 엔트리에 한국어 description이 실렸다**

⎯ 커밋 ⎯ `feat(push,pull): carry key order and chrome fields through the payload and back out` (완료)

### 이 단계가 밟은 별건 — `--adapter ts-dict`가 죽어 있었다

실 DB 검증 push가 chrome-locales를 1순위로 잡아 bugshot-2의 ts-dict 903키를 orphan시켰는데,
되돌리려니 `--adapter ts-dict`가 **한 번도 동작한 적이 없었다** — `detect`가
`detectCandidates()[0]`이고 그게 빈 배열이었다. `detect`와 `detectCandidates`를 갈라 고치고
DB를 원상복구했다 (`fix(adapters)` 커밋 + POSTMORTEM 2026-09-03).

## 5. 검증 루프 — 1회성 측정을 상시 게이트로 내린다 ✅ (2026-09-03)

**이 단계가 없으면 이 기능이 끝난 다음 날 누가 `orderedEntries`를 되돌려도 아무것도 안 빨개진다.**
`pnpm adapter-survey`는 캐시가 없어 리포 129개를 매번 clone하고(~4분) 네트워크 필수라 `pnpm test`
에도 CI에도 못 들어간다.

### 5-1. L1 — 진입점 회귀 ✅ (`lib/pull/__tests__/entry-order.test.ts`)

- [x] `runPull`(deps 주입)에 **순서 섞인 DB 상태**를 넣어 **커밋에 실린 파일 바이트**를 단언
  - 검증 통과: base·비-base 둘 다 `sortIndex` 순. `sortIndex`를 지운 입력은 코드 유닛 순으로
    떨어지고, **두 출력이 다르다는 것**을 별도 케이스가 단언한다 — 픽스처가 코드 유닛 순이면
    배선이 끊겨도 green이 되므로 그게 이 테스트의 판별력 증명이다
  - ⚠️ 어댑터·`renderFiles` 단위 테스트로는 **원리적으로 못 보는 층**이다
- [x] `orderBy` 두 곳을 갈라 고정
  - `loadPullState` → prisma 스텁으로 `[{ sortIndex: "asc" }, { key: "asc" }]` + **세 컬럼 select**
  - `lib/keys/query.ts` → **소스를 읽어** `orderBy: { key: "asc" }`가 그대로인지. `server-only`라
    테스트가 import할 수 없고, **보호를 떼서 검사를 강하게 만드는 것은 거꾸로다**
  - `lib/pull/load.ts`에 그 문자열이 **없는지**도 단언 — grep하면 둘 다 잡히던 함정을 여기서 가른다

### 5-2. L2 — 골든 픽스처 ✅ (`lib/adapters/__tests__/key-order-golden.test.ts`, 네트워크 0)

- [x] `lib/survey/diff.ts`에 **`changedHunks`** 추가 — 같은 Hunt–Szymanski 순회에 역추적을 얹었다
      (알고리즘을 하나 더 들이지 않는다)
  - 검증 통과: `lib/survey/__tests__/hunks.test.ts` 10건
  - 예산 초과 시 **`undefined`** — 근사로 세면 과소평가인데 이 지표는 "작을수록 좋다"로 읽혀서
    과소평가가 곧 거짓 안심이다
- [x] 실측 리포 모양 **3개**를 인라인 픽스처로: 정렬 안 된 flat(gitea·zulip) / 중첩+배열
      (excalidraw·open-webui) / chrome `_locales`(placeholders + description)
  - 형태만 옮기고 문자열은 우리 것으로 바꿨다 — 재는 것은 **구조**이지 남의 문구가 아니다
- [x] 픽스처마다 단언 넷: **바이트 동일** / **`roundtripDiffRatio === 0`**(프로덕션 함수를 그대로
      import) / **`changedHunks === 0`** / write→read→write **고정점**
  - ⚠️ 다른 구현으로 재면 **여기가 green인데 실측이 red**인 상태가 가능하다
- [x] "값 하나를 바꾸면 hunk가 1이다" — 재정렬이면 여러 군데로 흩어진다
- [x] 엣지 케이스: order 전부 없음(개정 전과 바이트 동일) / orphaned·빈 값이 order에 구멍 /
      낼 것 0개면 `null` / 로케일마다 키 집합이 다름
- [x] **알려진 한계를 기준선으로 박았다** — 점 포함 키가 중첩과 공존하면 `"menu.open"`이 경로로
      쪼개진다. **순서 보존과 다른 축**(`.`가 조인 구분자)이고, 키 구분자 계약을 빼는 별 기능이
      고치면 이 테스트가 red가 된다

### 5-3. L3 — 재측정 트리거를 규칙으로 등재 ✅

- [x] **`lib/adapters/**`·`lib/survey/**` 변경 → `docs/ADAPTER-COVERAGE.md` + 재측정**을
      `.claude/commands/push.md` 4a 트리거 목록과 **새 4d 절**에, 그리고 CLAUDE.md 문서 신선도에 등재
  - **학습·홀드아웃 둘 다** 돌린다 — §0 3차에서 수정 4건 중 2건이 수정이 만든 회귀였고 그중
    하나는 학습 코퍼스에서만 나타났다
  - **게이트가 아니라 판단 지점이다** — 네트워크 ~4분이라 푸시를 막는 데 쓸 수 없다.
    "안 걸렸다"와 "걸렸는데 미뤘다"를 리포트에서 구분한다
- [x] **정렬 지점 grep과 세 층의 대응표를 `docs/ARCHITECTURE.md` §1.1에 등재**
  - 순서를 고칠 때 셋 다 red가 아니면 **고친 층이 프로덕션 경로가 아니었을 가능성**을 먼저 의심한다

⎯ 커밋 ⎯ `test(pull,adapters): lock key order at the entry point and in golden fixtures` +
문서 3건 (완료)

## 6. 재측정 — 완료 조건 게이트 ✅ (2026-09-03)

- [x] `pnpm adapter-survey`를 **학습 109개와 홀드아웃 20개에 따로** 돌렸다 (합치지 않았다)
  - 결과 전문: `docs/ADAPTER-COVERAGE.md` **§11**
  - 검증 통과: **clean 부분집합 중앙값 0.000** (학습 19개 / 홀드아웃 4개)
  - 검증 통과: **clean 목표 초과 5.3%(1/19) / 0.0%(0/4)** ≤ 20%
  - 검증 통과: **수술적 3개 0.000 유지** / **바이트 고정점 100/100 · 16/16** /
    **왕복 의미 98/100 · 16/16** / **`not-run` 9 · 4 기준선 유지**
  - 참고(게이트 아님): `json-catalog` **0.784 → 0.022**(학습) · **0.843 → 0.000**(홀드아웃),
    `chrome-locales` **0.705 → 0.096**, 전체 중앙값 **0.613 → 0.001**
- [x] **목표를 못 맞춘 건들의 원인을 숫자로 댔다** — 4차에서 clean 초과로 보이던 것들이 전부
      다른 축이었고, 그 과정에서 **원인 셋이 새로 이름을 얻었다**:
  - `emptyValues`(21) — 미번역 제외로 줄이 사라진다. zulip 2285줄 → 1378줄. **고쳐서도 안 된다**
  - `dottedWithNested`(8) — `"music.restForBeats"`가 경로로 쪼개진다. 키 구분자 계약이 담당
  - `compactContainer`(4) — `"k": { "message": … }`를 2칸으로 편다. button-stealer는 **순서
    일치율 100%에 diff 0.964**였다
  - ⚠️ 이름이 없던 동안 이들은 **순서 보존의 실패처럼 보였다.** 원인 분해의 목적이 정확히 그걸
    가르는 것이다
- [x] **chrome 두 필드를 `diffCauses`에서 뺐다** — 태스크 2·4가 보존하게 만든 뒤로 diff 원인이
      아닌데 남아 있어서 **chrome 리포 13개가 clean 분모에서 부당하게 빠졌다**(그 13개의 diff
      중앙값은 0.032로 목표 통과였다). `RepoSurvey.chromeFields` 관측치로 옮겼다
- [x] **clean에 남은 1건의 원인도 밝혔다** — Midnight-Lizard는 **엔트리 안의 필드 순서**다
      (원본이 `description`을 `message`보다 먼저 쓴다). 키 순서는 100% 맞다. 관측 1건이라 지표를
      늘리지 않고 §11.5에 서술로 남겼다

⎯ 커밋 ⎯ `feat(survey): …` 3건 + `docs(ADAPTER-COVERAGE): record the 5th run …`

### 남음 — 실물 확인 (수동)

- [ ] **선행 셋업**: json-catalog 리포 사본 + GitHub App 설치 + `Project` 행 +
      `ACTIVE_PROJECT_SLUG` 교체 + 초기 push
  - ⚠️ **prod DB가 곧 dev DB다.** 남의 리포 키 수천 개를 실 DB에 적재하는 것이 맞는지 먼저 판단
  - ⚠️ `docs/TASKS.md` §6이 "재생성 어댑터 실물 pull"을 ❌ 범위 밖으로 닫아 놨다 — 되살리는
    것이므로 §6도 함께 고친다
- [ ] **대조군**: 편집 0건으로 pull → `0 files changed`
- [ ] **본실험**: 키 3개만 편집 → pull → `git diff --numstat`이 `3 3`, `grep -c '^@@'`가 3
  - ⚠️ `+N/-N` 대칭으로 판정하지 않는다 (재생성에서는 판별력이 없다)

**이 확인이 답하는 것은 "GitHub PR 화면에서 사람이 읽을 수 있는가"뿐이다** — 바이트 수준은 L1이
진입점에서(`runPull`이 커밋에 실은 내용), 코퍼스 수준은 §11이 이미 답했다.

## 7. 문서 ✅ (2026-09-03)

- [x] **`docs/MVP.md` §4.1** (태스크 2에서 당겨왔다 — 코드에 없는 함수를 가리키는 문서를 배포할 수
      없다) — "키 정렬"이 "`order` 오름차순, 없으면 `<` 비교, 동률은 키로"가 됐고, 결정성이 왜
      유지되는지(순서가 DB에 있다)와 중첩 각 층 규칙을 붙였다
- [x] **`docs/MVP.md` §4.1 chrome 항목 + §5 스키마** — `description`이 **로케일마다** 되돌아간다는
      것으로 개정했다. 옛 근거("복제하면 바이트만 늘고 읽는 쪽이 없다")는 **DB가 키 단위 값 하나만
      들고 있을 때만 참**이었고, `Translation.description`이 생긴 뒤로는 안 내는 것이 **보존이
      아니라 손실**이다(실측 33개 중 20개). `placeholders` 왕복 계약과 새 컬럼 셋도 스키마에
- [x] **`docs/ARCHITECTURE.md` §1.1** — 불변식 표의 "키 정렬"·"재조립" 행, **정렬 지점 여섯**,
      `orderBy` 두 곳, `+N/-N`의 "수술적 한정" 단서, chrome 두 필드 서술,
      **값 전달 경로 넷과 그것을 지키는 L1 테스트**
  - 검증 통과: `grep -c "usableEntries" docs/ARCHITECTURE.md`가 0
- [x] **`docs/ADAPTER-COVERAGE.md`** — §11(5차 측정)과 완료 조건 판정. **판정 ②를 "개정 완료"로**
      바꿨다. **홀드아웃 `json-catalog` 개별 diff 값을 표로 남겨** spec이 인용하는 0.843을 사람이
      검증할 수 있게 했다(전에는 §9에 어댑터별 열이 없어 불가능했다)
- [x] **`docs/TASKS.md`** — §9(이 기능의 자기 섹션)에 태스크별 결과, §8 후속 2번 해소.
      §6의 "재생성 어댑터 실물 pull ❌"에 각주를 달았다 — 그 판정은 **같은 프로젝트로** 두 표면을
      다루는 것에 대한 것이고, 별도 프로젝트 검증은 걸리지 않는다
- [x] **`docs/TASKS.md` 후속** — "들여쓰기·공백 보존"을 **"원본 포맷 보존"** 으로 넓혔다.
      들여쓰기(30) · 한 줄 컨테이너(4) · 이스케이프(2) · 엔트리 필드 순서가 전부 `serialize`의
      결정성 규칙이 만드는 차이라 **한 기능이 묶어서 다루는 것이 맞다**
- [x] **`docs/POSTMORTEM.md`** — 값 전달 경로 재발은 **없었다**(태스크 4의 체크박스 넷과 L1이
      막았다). 대신 **다른 축의 함정**을 등재했다: 고쳐 놓고도 지표가 낡아서 성공을 실패로 읽은 일
      (chrome 필드가 `diffCauses`에 남아 13개 리포를 부당 제외, 이름 없는 원인 셋이 순서 보존의
      실패로 보임)
- [x] `.env.example` — **변경 없음** (새 환경변수 없다)

⎯ 커밋 ⎯ 문서별 별도 커밋 (완료)

## 의존 관계

```
🔒 임계값 확정 → 0 (측정) ✅ → 1 → 2 → 3 → 4 → 5 → 6 → 7
                            └─ 판정 3개 확정: A안 · 들여쓰기 별기능 · 게이트 분모 축소
                               + chrome 필드 보존을 범위로 편입
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
