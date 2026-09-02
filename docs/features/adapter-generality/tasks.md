# 태스크 — 어댑터 범용성 측정 실험

**착수 시점: MVP 6단계 완료 후 — 7단계와 독립이다** (2026-09-02 정정: 지표 ④의 실물 대조 근거는 6단계의 7회 루프 실측에서 이미 나왔고, 이 실험은 앱·DB·Actions를 쓰지 않는다). **자율 루프로 무인 실행한다** (spec §실행 방식) — 모든 검증 줄은 자동 판정 가능해야 하고, 착수 전 결정(구 🔒)은 전부 확정돼 아래에 박혀 있다.

순서는 **순수 함수 → 껍데기 → 실행 → 판정**이다. `——`가 커밋 경계다. 순수 함수의 자리는 `lib/survey/`(테스트 가능, `server-only` 없음), 껍데기는 `scripts/adapter-survey.ts`다.

---

## 0. 대상 리포 선정 (코드 없음)

- [x] `docs/features/adapter-generality/repos.md`에 **50개 이상** 리포 URL + 예상 포맷 라벨 → **109개** (2026-09-02 완료). 목록은 `repos.txt`(CLI 입력)
  - 검증 통과: 포맷 **5종**(chrome-locales 34 / json-catalog 39 / yaml 17 / ts-per-locale 12 / 신호 없음 7), 스타 구간 **A(>2k) 43 · B(100~2k) 55 · C(<100) 11**(각 5개 이상), **스타터·템플릿 0개**. 부수 관측: 포맷 2종 이상이 공존하는 리포 **24개** — 어댑터 간 오탐의 실제 표본이다
- [x] **리포 수집 방식 확정: 로컬 `git clone --depth 1 --filter=blob:none --no-checkout`** (2026-09-02 — 실측으로 `--filter` 추가). 토큰 불요, rate limit 없음. blobless라 리포당 **0.9초 / 200KB**이고 파일 내용은 `git cat-file`로 지연 fetch한다 — 껍데기 계약(경로 먼저 → 고른 것만 물리화)과 git 수준에서 일치한다. 근거는 repos.md §수집 방식. tarball로 뒤집으면 design.md §새 환경변수의 조건부 함정 2건(requireEnv 기본값 인자·이중 인코딩)이 소환된다
- [x] **verdicts 파일 스키마 확정 기록** — `docs/features/adapter-generality/verdicts.json`: 리포당 `{ repo, correctCatalogPath: string | null, note }`. **판정 단위는 포맷 라벨이 아니라 경로다** (관측된 오탐 전례가 "포맷은 맞고 경로가 틀린" 형태 — `public/search/`). 1순위 오탐·2순위 정답 여부는 이 정답 경로와 후보 목록의 대조로 `summarize`가 **자동 계산**한다 — 판정 입력이 리포당 1건으로 줄고, detect를 고쳐 재실행해도 판정이 살아남는다
  - 검증 통과: 스키마 예시 3건이 repos.md §verdicts.json에 있다(지원 포맷·어댑터 간 경합·미지원 포맷 각 1건)

——

## 1. `detect`가 후보 목록을 반환 (테스트 먼저)

**완료 조건 ②(오탐률)를 측정 가능하게 만드는 유일한 프로덕션 변경이다** (+ 태스크 8의 계약 주석 1건 — spec §프로덕션 변경).

- [x] `/tdd` — `lib/adapters/__tests__/detect-candidates.test.ts` (2026-09-02)
  - 검증 통과: 작성 직후 **30건 red** (`detectCandidates is not a function`)
- [x] `Adapter`에 `detectCandidates(paths, probe): DetectedFormat[]`(순위순, 빈 배열 = 못 찾음)를 **병존 추가**. 기존 `detect`는 `detectCandidates(...)[0]` 한 줄로 재구현 — 두 함수가 같은 관문(순위·probe 검증)을 지나므로 어긋날 수 없다
  - **기존 `detect`·`detectFormat`·`detectFormatWith` 시그니처를 유지한다** — 호출부(`scripts/ingest.ts`·`scripts/push-local.ts`)를 건드리지 않는 additive 변경이어야 한다. `DetectedFormat` 구조체도 불변
  - 검증 통과: `pnpm test` **361건 green**(기존 331 + 신규 30), `pnpm typecheck` green
  - additive 보증을 테스트가 든다: 어댑터 3개 × 입력 8종 = **24건이 `detect === detectCandidates[0]`** 과 "undefined ⇔ 빈 배열"을 매 실행 대조한다

——

## 2. 어댑터 계약 테스트를 `ADAPTERS` 순회로 (design.md §불변식)

- [x] 규칙 본문을 `lib/adapters/__tests__/contract.ts`(`writerContractViolations`)로 빼고 `contract.test.ts`가 **`ADAPTERS`를 순회**한다. `adapters.test.ts`의 손 열거 블록은 **일반화되지 않는 문자 인코딩 2건만 남기고** 걷어냈다 (2026-09-02). **규칙 적용은 layout 매트릭스를 따른다** — "공통 규칙 전부 적용"은 ARCHITECTURE §1.4와 모순이었다:
  - 재생성(`per-locale`)에만: 정렬·2칸·끝 개행 1개·orphaned 출력 제외·빈 값 제외·0개면 null
  - 전부에: 결정성(재실행 동일)·입력 순서 무관·**"orphaned 키의 DB 값이 출력에 나타나지 않는다"**(의미 수준 — ts-dict는 원본 값이 남는 게 정답이다)·**"DB 값이 실제로 반영됐다"**
  - `blobSha` ↔ `git hash-object` 대조도 어댑터 전수로 돌린다(전엔 2개 하드코딩)
- [x] **규칙 위반 가짜 어댑터를 영구 네거티브 테스트로 남긴다** — 9종(localeCompare 정렬·4칸·끝 개행 없음·orphaned 잔류·빈 값 잔류·null 미반환·입력 순서 추종·주석 파괴 수술적 치환·입력 무시 상수) 각각이 검사기에 걸리는지 상시 확인하고, **규칙을 다 지키는 가짜는 통과**하는지도 본다(검사기가 무조건 red를 내는 게 아님을 보장)
  - 검증 통과: `pnpm test` **372건 green**, `pnpm typecheck` green
  - **검사기가 실물을 실제로 밟는지 확인함**: ts-dict 원본 값(`S_*`)과 DB 값(`V_*`)을 갈라 치환 경로를 강제한다 — 같게 두면 "바뀐 게 없다"며 원본을 돌려줘 계약 검사가 한 줄도 안 밟고 통과한다

——

## 3. `roundtripDiffRatio` 순수 함수 (`lib/survey/`)

- [x] `/tdd` → 구현 (`lib/survey/diff.ts`, 2026-09-02). **원본과 1차 write 출력**의 변경 줄 비율 (지표 ④의 "첫 write 변경 줄 비율" 축)
  - 정의: `1 - 2·LCS / (원본 줄 수 + 출력 줄 수)`. 이 식이라야 세 기준이 **정확히** 떨어진다
  - 검증 통과 (10건): 동일 → `0`, 한 줄 변경 → `1/n` 정확히, 전면 재정렬(50줄) → `0.9` 이상, 완전 상이 → `1`, 빈 문자열 양쪽, 줄 추가만, 공통 접두·접미 트리밍이 값을 바꾸지 않음, 끝 개행 차이, 중복 줄, 12000줄
  - ⚠️ **테스트가 설계 오류를 하나 잡았다**: 처음엔 큰 입력에서 "줄 다중집합 교집합"으로 근사했는데 그 근사는 순서를 무시해 **전면 재정렬을 '동일'로 본다**(12000줄 순열에 `0`). 하필 그게 이 지표가 재려는 현상이라 MVP §4.1 개정 판정이 정반대로 뒤집힐 수 있었다. **Hunt–Szymanski(`O(r log n)`, 크기와 무관하게 정확)로 교체**했고, 근사는 매칭 쌍 500만 초과라는 병리적 경우에만 남기고 `usedApproximation`으로 표시한다

——

## 4. `surveyOne` + 보조 순수 함수 (`lib/survey/`)

- [x] `/tdd` — 픽스처 4개(정상 flat / 오탐 유발 검색 인덱스 / read 에러 포함 / **어댑터 간 경합 — chrome-locales와 ts-dict가 공존하는 bugshot-2 형태**). 2026-09-02
  - ⚠️ 픽스처를 쓰면서 알게 된 것: `detect`의 probe는 **정렬상 첫 로케일** 하나만 읽으므로, 에러 유발 값을 `en`에 두면 후보 자체가 걸러져 read 에러를 잴 기회가 사라진다. `zz.json`으로 옮겼다
- [x] `mergeCandidates(perAdapter)` — 어댑터별 후보 목록 → 글로벌 순위(`ADAPTERS` 순서 → 어댑터 내 순위). `candidatesFor(paths, probe)`가 `ADAPTERS` 전수에 돌린다
  - 검증 통과: 픽스처 4종 전부에서 **`[0]`이 `detectFormat` 결과와 같다**. 어댑터 간 경합 픽스처에서 가려진 ts-dict 후보가 목록에 남는 것도 확인
- [x] `selectSurveyFiles(paths)` — 물리화할 파일 선별. 껍데기에 로직이 스미는 걸 막는다
  - ⚠️ **측정 한계를 코드에 명시했다**: ts 후보를 i18n 신호 디렉터리(또는 로케일 이름 파일 2개 이상)로 좁힌다. 안 좁히면 리포당 수천 파일을 ts-morph로 판다. 이 편향은 **한 방향뿐**이다 — ts-dict 탐지를 과소 보고할 뿐 없는 오탐을 만들지 않는다
  - 설정 파일은 **존재만** 세므로 물리화하지 않는다. 선택 결과는 정렬돼 있어 입력 순서에 의존하지 않는다
- [x] `surveyOne({repo, paths, files})` → `RepoSurvey`
  - **파일 내용을 인자로 받는다** — 네트워크·디스크 없음
  - **어댑터 read/write 호출을 전부 try로 감쌌다** — ts-dict의 `createSourceFile` throw가 `ReadResult.errors`로 오지 않으므로(design.md §함정) surveyOne이 `adapter-threw` 유형으로 흡수한다. "실패한 리포 하나가 전체를 멈추지 않는다"의 실제 구현 지점이 여기다
  - `RepoSurvey`가 담는 것: 후보 목록(글로벌 순위별)·1순위, 로케일 수, 키 수, `read` 에러 **7유형**별 건수, **키 충돌 건수**, **무증상 skip 건수**, **왕복 2층 판정**, `diffRatio`+근사 여부, 구분자 분포 5종, **ICU 복수형·치환자 키 수**(MVP §7 비범위라 빈도만 센다), 설정 파일, (코드 어댑터일 때) 읽힌 키 수 vs 문자열 리터럴 수, 잘림 여부, 소요 시간
  - **무증상 skip을 `errors`에 넣지 않고 별도 카운터로 뺐다** — 어댑터가 에러를 안 만드는 경로이고, `errors`는 `push:local`이 exit 1로 막아 orphaned까지 못 가는 반면 무증상 skip은 **그 게이트를 통과하는 유일한 위험 경로**다. 같은 통에 넣으면 판정 ③의 근거가 섞인다
  - **`ts-dict`의 왕복은 파일 × 로케일 이중 루프다** (ARCHITECTURE §3 함정) — 직전 write 결과를 다음 로케일 호출의 원본으로 넘긴다. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남아 왕복이 거짓 통과한다
  - **생산자에 타입을 명시했다** (`const survey: RepoSurvey = ...`) — POSTMORTEM 2026-08-31 리터럴 조립 항목
  - 검증 통과: `pnpm test` **406건 green**, `pnpm typecheck` green. surveyOne이 **결정적**(같은 입력 두 번 → 소요 시간 빼고 동일)인 것도 테스트가 든다

——

## 5. `summarize` 순수 함수 (`lib/survey/`)

- [x] `/tdd` → 구현 (2026-09-02). `summarize(surveys, verdicts)` → 지표 4개 + 마크다운 표 2층
  - **verdicts(정답 카탈로그 경로 목록)를 입력으로 받는다** — 오탐률은 정답 경로 vs 후보 목록 대조로 계산. 자동 판정 불가인 것은 "정답이 무엇인가"이고 그건 태스크 0의 verdicts 파일에 있다. 결과에 `verdictSource`가 붙어 **자동이 아니라 대조**라는 사실이 숫자와 함께 다닌다
  - **지표 ①은 분모 2개를 모두 낸다** (지원 포맷 대상 / 측정된 전체)
  - **지표 ②도 분모 2개다**: 지원 포맷 리포 대상, 그리고 **후보를 낸 전체** 대상 — 후자는 **미지원 포맷(YAML 등)에서 뭔가를 잡은 것도 오탐으로 센다.** 우리 어댑터가 맞을 수 있는 정답이 없는 리포에서 후보를 냈다면 그건 정의상 오탐이고, 판정 ④("무인 신뢰 가능한가")가 봐야 하는 숫자가 이쪽이다
  - **정답 순위 분포**를 낸다 — `detect` 확장(태스크 1)이 없으면 존재 자체를 관측할 수 없던 숫자다
  - **clone 실패는 분모에서 뺀다** — 측정하지 못한 것과 측정해서 실패한 것은 다르다. 대신 `failedCount`로 남기고 리포별 표에도 행이 남아 분모를 검산할 수 있다
  - **정답이 등록되지 않은 리포를 `unjudged`로 노출한다** — 오탐 분모에서 조용히 빠지면 표본을 고른 셈이 된다
  - 검증 통과: 픽스처 5종(1순위 정답 / 2순위 정답 / 미지원인데 탐지 / 미지원이고 미탐지 / clone 실패) + verdicts 픽스처로 지표 계산 13건, 표 생성 4건. `pnpm test` green, `pnpm typecheck` green
  - **결정적이다** — 입력 순서를 뒤집어도 같은 표가 나오는지 테스트가 든다

## 6. `scripts/adapter-survey.ts` CLI 껍데기

- [x] 리포 목록을 읽어 clone → 파일 트리(git이 주는 리포 상대 POSIX 경로 그대로) → `selectSurveyFiles` → **sparse-checkout 일괄 fetch** → `surveyOne` → `summarize` (2026-09-02)
  - ⚠️ **개별 `git cat-file`을 쓰지 않는다.** blobless partial clone에서 blob 하나를 읽을 때마다 네트워크 왕복이 일어나 리포 하나에 수 분이 든다. `sparse-checkout set --no-cone <고른 경로들}` + `checkout`이 **한 번에** 받는다(memos 44파일 0.9초 실측)
- [x] **`process.exit()` 금지, `process.exitCode`만 세운다** (POSTMORTEM 2026-08-31 — 파이프 stdout 잘림). 사용법 오류만 예외로 `exit(2)`
- [x] `--json` 분기를 **early return(if/else)으로 명시**한다 — 같은 항목의 2차 원인. 사람용 출력·진행 로그는 전부 stderr다
- [x] **exit code 계약: 측정 층이므로 항상 0** (`pnpm scan` 선례). 사용법 오류만 2
- [x] `package.json`에 `adapter-survey` + CLAUDE.md 명령어 표 갱신 (+ Codex 미러 동기화)
  - 검증 통과: 리포 3개 스모크 **8.9초**, 3개 전부 detect 성공
  - 검증 통과: 사용법 오류 `exit=2`, 없는 리포를 섞어도 **`exit=0`이고 나머지가 계속 돈다**(clone 실패가 결과 행으로 남는다)
  - 검증 통과: 계속 진행 목록 — clone 실패·빈 트리·**서브모듈(gitlink)**·심볼릭 링크·**바이너리/비UTF-8**(NUL 바이트 검사로 건너뜀)·sparse-checkout 부분 실패를 전부 결과에 기록하고 진행한다
  - ⚠️ **`--json` 파이프 검증에서 하네스 전체의 결함을 하나 찾았다**: `pnpm x --json | jq`는 **항상** 깨진다 — pnpm이 `> tsx scripts/...` 배너를 **stdout에** 찍기 때문이다. 이 스크립트만이 아니라 **`pnpm ingest --json`도 같다**(실측). 우리 출력 자체는 유효한 JSON 한 문서이고(직접 `tsx` 실행·`pnpm --silent` 둘 다 `jq` 통과), 검증 명령을 **`pnpm --silent adapter-survey ... --json | jq`** 로 고정했다
  - ⚠️ **3개 스모크의 파이프 통과는 아직 증명이 아니다** — 출력이 9.6KB로 파이프 버퍼(64KB) 아래다. POSTMORTEM 원문이 경고한 그대로이므로 **진짜 검증은 태스크 7 전체 실행**이다

——

## 7. 전체 실행 + `docs/ADAPTER-COVERAGE.md`

- [x] **109개 실행** (완료 조건 50개 상회). 1순위 후보 판정을 리포별 정답 카탈로그 경로로 `verdicts.json`에 기록(근거 note 포함 — 사후 감사용)한 뒤 재실행. 2026-09-02
  - 실측: **3분 26초 / clone 실패 0 / 1,888 로케일 / 43,613 키**. 판정 로직 자체는 20.9초
  - 검증 통과: 지표 4개가 전부 숫자로 있고(①은 분모 2개), 오탐률에 판정 주체가 붙어 있다
  - 검증 통과: **전체 실행 출력으로 `--json | jq` 통과 — 214KB, JSON 1문서.** 파이프 버퍼(64KB)를 3배 넘겼으므로 이번엔 공허 통과가 아니다 (태스크 6의 유예분 해소)
  - ⚠️ **실행이 지표 정의 결함 하나를 드러냈다**: 처음 판에서 **탐지 실패를 오탐으로 세고** 있었다(오탐률 6.8%로 나옴). "엉뚱한 걸 잡았다"와 "아무것도 못 잡았다"는 고쳐야 할 곳이 다른데 한 숫자로 뭉개진다. 분모를 "후보를 낸 리포"로 좁혀 **1.4%/5.6%**가 됐고, 회귀 테스트를 박았다
  - ⚠️ **실행이 지표 ③의 공백도 드러냈다**: 왕복이 데이터 손실 2건을 잡았는데 `errors`도 충돌 카운터도 **전부 0**이었다. 충돌 검사가 *정확히 같은 키*만 봤기 때문이다. **접두 충돌**(`a.b`와 `a.b.c`)을 세도록 고치니 345건이 나왔고, **충돌이 있는 리포와 왕복이 실패한 리포가 정확히 일치**한다
- [x] **표는 2층이다**: 포맷별 요약(§8) + 리포별 상세(§9). 상세 표의 행 하나가 곧 실패 재현 경로다
- [x] 파일 위치 확정: `docs/ADAPTER-COVERAGE.md` (루트)
- [x] CLAUDE.md **문서 신선도 목록**·**참고 문서 목록**에 ADAPTER-COVERAGE.md 추가 (+ Codex 미러 동기화)

——

## 8. 판정 4개 기록 — 전부 완료 (근거는 `docs/ADAPTER-COVERAGE.md` §5)

- [x] **지원 선언 포맷 목록** → `chrome-locales` · `json-catalog`. 단서 둘: **중첩 JSON에서 키가 `.`을 품으면 값이 사라진다**(범위 밖으로 뺀다), chrome 키 문자 제약은 실제로 걸린다(1,843건)
- [x] **MVP §4.1 "키 정렬" 개정 필요 여부** → **필요하다.** 첫 write 변경 줄 비율 중앙값 **0.705**, 절반 이상 바뀐 리포 **77.8%**, 이미 정렬돼 있던 리포는 72개 중 **4개**뿐. "원본 키 순서 보존"을 별 `/feature`로 뺀다
- [x] **`ts-dict` 자동 탐지 제외 여부** → **제외한다.** 109개에서 후보에 **0회**. 코드 딕셔너리 리포 12개는 **전부 per-locale TS**였다 — "한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가 아니다. 하류로 `--adapter ts-dict` 명시가 공식 온보딩 경로가 된다
- [x] **자동 포맷 탐지의 무인 신뢰 가능 여부** → **조건부 가능.** 오탐률 5.6%로 중단 기준(30% 잠정값)의 1/5이다. 다만 남은 오탐이 전부 **조용한** 종류라 연동 시 1순위 후보 확인 화면 하나를 둔다. 전면 수동의 근거는 없다
- [x] `lib/adapters/types.ts`에 "파일명 그대로가 로케일 코드의 진실" 계약 주석
- [x] `docs/MVP.md`·`docs/ARCHITECTURE.md` 갱신은 **여기서 하지 않는다** — 필요만 남긴다. 반영 대상은 세 곳이다: **MVP §4.1**(키 정렬 개정 — 판정 ②), **MVP §5.1 / ARCHITECTURE §1**(`ts-dict` 자동 탐지 제외 — 판정 ③), **ARCHITECTURE §1.1**(중첩 JSON의 `.` 손실 — §2)

---

## 2차 실행 — 어댑터 5개 (2026-09-02 오후)

**판정을 내린 뒤 그 판정대로 만들고 같은 코퍼스에 다시 돌렸다.** 이 절이 그 결과다 (상세는
`docs/ADAPTER-COVERAGE.md` §0·§4).

- [x] `writeStrategy` 축을 `layout`에서 분리 + pull 배선 (`run.ts`·`render.ts`) — `per-locale` + 수술적 조합이 생겼다
- [x] `.`-키 손실 수리 — `nested`를 파일 단위로, `setDeep` 충돌을 에러로
- [x] `looksLikeCatalog` → `catalogVerdict` 3값 완화 + 샘플 3개(en 우선)
- [x] 후보 순위에 예제·픽스처 감점, **그리고 어댑터 간 순위도 신호로** (2차에서 추가 발견)
- [x] `ts-dict` 자동 탐지 제외 (`tsDictDetectByContent`에 보관)
- [x] **`yaml-catalog`** 신규 — 18개 리포, 왕복 100%, diff 0.000
- [x] **`code-dict`** 신규 — 11개 리포, 왕복 100%, diff 0.000
- [x] 수술적 치환이 **없는 키를 삽입**한다 (안 하면 그 파일에 없던 키는 번역해도 리포에 못 간다)
- [x] `docs/ADAPTER-COVERAGE.md` 2차 결과로 재작성, `verdicts.json` 갱신(신규 지원 28건 + 정정 5건 + `alsoValid` 11건)

**최종 지표**: 탐지 **99.0%**(지원 포맷) / 오탐 **0.0%** / 바이트 고정점 **100%** / **조용한 손실 0**.

⚠️ **어댑터를 만들고 테스트를 통과시킨 뒤에도 실물 코퍼스가 결함 7건을 더 잡았다.** 목록은
ADAPTER-COVERAGE §4. 그중 둘은 검증 층 자체의 결함이었다 — 껍데기가 `.yml`을 안 골라 YAML 어댑터가
**한 번도 실물 검증을 못 받은 상태**였고, `surveyOne`이 원본을 안 넘겨 code-dict 왕복이 `not-run`(=
측정 안 됨)으로 조용히 빠져 있었다. **"먹이지 않으면 어댑터는 없는 것과 같다"** 가 이번 교훈이다.

——

## 이 실행에서 새로 나온 후속 작업 (`docs/ADAPTER-COVERAGE.md` §7)

우선순위대로. 1번이 새로 발견된 데이터 손실이라 §4.1 개정보다 앞선다.

1. **키에 `.`이 든 경우의 손실 수리** — `ReadResult.nested`를 포맷 단위가 아니라 **파일 단위**로, `setDeep`의 문자열↔객체 충돌을 **에러로**
2. **"원본 키 순서 보존" 모드** (판정 ②)
3. **YAML 어댑터** — 미지원 36개 중 17개
4. **per-locale 코드 딕셔너리 어댑터** (TS/JS) — 미지원 12개
5. **`looksLikeCatalog` 완화** — 샘플을 여러 개 보고, 최상위 메타데이터·`null`을 허용 (탐지 실패 3건의 원인)
6. **후보 순위에 "예제·픽스처 디렉터리" 감점 신호** — 오탐 4건 중 2건이 `examples/` 아래였다
7. `ts-dict`를 자동 탐지에서 제외 (판정 ③)
8. ⚠️ **`/postmortem` 대상**: `pnpm <script> --json | jq`가 **항상** 깨진다 — pnpm 배너가 stdout으로 나간다. POSTMORTEM 2026-08-31 항목이 처방한 검증 명령 자체가 성립하지 않는다는 뜻이고, `pnpm ingest --json`도 같다. 이 루프는 문서·스크립트 주석에만 적었다(POSTMORTEM 쓰기는 `/postmortem` 전담)

**하지 않기로 한 것**: 설정 파일 기반 탐지(표본 109개 중 **0개**), ICU 복수형 지원(3개 리포뿐 — MVP §7 유지)

## 착수 전 결정 — 전부 확정됨 (자율 루프 전제: 미결 0)

1. ~~리포 수집 방식~~ → **`git clone --depth 1`** (태스크 0)
2. ~~오탐 판정 범위~~ → **리포당 정답 경로 1건** (verdicts.json — 1순위/N순위 판정은 자동 파생, 태스크 0·5)
3. ~~`ADAPTER-COVERAGE.md` 위치~~ → **`docs/` 루트** (태스크 7)

## 이 실험에서 파생되지만 범위 밖인 것

- **ICU placeholder 검증** — 번역값이 원문의 `{...}` 토큰 집합을 보존하는지. `lib/keys/save.ts`의 `planSave`에 순수 함수 하나면 되고 ICU 파싱이 필요 없다. **다만 `docs/MVP.md` §7 "ICU 복수형"에 걸리므로 별 `/feature`에서 되묻고 §7을 갱신해야 한다**
- **설정 파일 기반 탐지** (`i18next-parser.config.*` 등) — 이 실험은 빈도만 센다
- **`nested: boolean` → `tree: {style, separator}`** 계약 확장 + `Project.nested` 마이그레이션(additive)
- **`mergeCandidates`의 `lib/adapters/` 승격** — 온보딩 UI 등 프로덕션 소비자가 생길 때 (design.md §detect 확장)
- **`ts-dict.write`의 버려지는 `errors` 배열 수리** (design.md §함정 부수 관측)


---

## 3차 실행 — 홀드아웃 검증 (2026-09-02 저녁)

**겹치지 않는 리포 20개를 새로 골라, 어댑터를 손대기 전에 먼저 돌렸다.** 학습 코퍼스 109개의
숫자가 그 코퍼스에 맞춰 고친 뒤의 값이라 일반화를 증명하지 않기 때문이다.

- [x] 목록 선정 + 겹침 확인 (`comm -12` → 0건) — [repos-heldout.txt](./repos-heldout.txt)
- [x] **정답을 어댑터 수정 전에 적었다** — 20개 전부 blobless clone으로 `git ls-tree`를 떠서 눈으로 확인. [verdicts-heldout.json](./verdicts-heldout.json)
  - 검증: 탐지 결과를 정답으로 되쓰면 오탐률이 정의상 0이 된다 — 그 경로를 막았다
- [x] 수정 전 측정: 탐지 50.0% · **오탐 40.0%** · 왕복 10/10 의미·바이트
- [x] 경로 모양 2개 추가 (`{dir}/{locale}/<name>.json` · `{dir}/<prefix><sep>{locale}.<ext>`)
  - 검증: `pnpm test` 582건 green (신규 24건) / `pnpm typecheck` 통과
  - **어댑터를 새로 만들지 않았다** — read·write가 같고 `pathTemplate`만 다르다
- [x] 결함 4건 수리 (`hasStrongLocale` · `PRIMARY_NAMES` · `templateShapeRank` · `liftAncestors`)
- [x] **매 라운드 홀드아웃 + 학습 코퍼스를 둘 다 측정** — 수정 4건 중 2건이 회귀였고 하나는 학습 코퍼스에서만 나타났다
- [x] 수정 후 측정: 홀드아웃 탐지 80.0%(지원 포맷 16/17) · **오탐 6.3%** · 왕복 16/16 · 학습 코퍼스 **무회귀**(100/101 · 0.0% · 98/100 · 100/100, read 에러 유형별 건수까지 동일)
- [x] 문서 갱신: ADAPTER-COVERAGE(§0 3차 + 판정 ④ 갱신 + §9) · ARCHITECTURE §1.3 · MVP §5.1 · TASKS §8 · POSTMORTEM 2건 · CLAUDE/AGENTS

**이 라운드의 교훈**: *학습 코퍼스로 잰 숫자는 일반화가 아니다.* 오탐 0.0%가 처음 보는 20개에서
40%였다. 그리고 *순위 픽스는 파이프라인의 마지막 층에 넣어야 한다* — `liftAncestors`가 자기 단위
테스트만 통과하고 실제 경로에서 죽어 있었다.
