# 태스크 — 어댑터 범용성 측정 실험

**착수 시점: MVP 6단계 완료 후 — 7단계와 독립이다** (2026-09-02 정정: 지표 ④의 실물 대조 근거는 6단계의 7회 루프 실측에서 이미 나왔고, 이 실험은 앱·DB·Actions를 쓰지 않는다). **자율 루프로 무인 실행한다** (spec §실행 방식) — 모든 검증 줄은 자동 판정 가능해야 하고, 착수 전 결정(구 🔒)은 전부 확정돼 아래에 박혀 있다.

순서는 **순수 함수 → 껍데기 → 실행 → 판정**이다. `——`가 커밋 경계다. 순수 함수의 자리는 `lib/survey/`(테스트 가능, `server-only` 없음), 껍데기는 `scripts/adapter-survey.ts`다.

---

## 0. 대상 리포 선정 (코드 없음)

- [ ] `docs/features/adapter-generality/repos.md`에 **50개 이상** 리포 URL + 예상 포맷 라벨 (2026-09-02 상향 — 자율 루프 목표. 30개는 최소 성립선)
  - 검증: 포맷 **5종 이상** 분포(chrome `_locales` / flat JSON / 중첩 JSON / YAML / 코드 딕셔너리), 스타 수 구간 **3개**(<100, 100~2k, >2k)에 각각 5개 이상, **스타터·템플릿 리포가 절반 이하**
- [x] **리포 수집 방식 확정: 로컬 `git clone --depth 1`** (2026-09-02) — 토큰 불요, rate limit 없음, 실제 pull이 보는 것과 같은 파일 트리. tarball로 뒤집으면 design.md §새 환경변수의 조건부 함정 2건(requireEnv 기본값 인자·이중 인코딩)이 소환된다
- [ ] **verdicts 파일 스키마 확정 기록** — `docs/features/adapter-generality/verdicts.json`: 리포당 `{ repo, correctCatalogPath: string | null, note }`. **판정 단위는 포맷 라벨이 아니라 경로다** (관측된 오탐 전례가 "포맷은 맞고 경로가 틀린" 형태 — `public/search/`). 1순위 오탐·2순위 정답 여부는 이 정답 경로와 후보 목록의 대조로 `summarize`가 **자동 계산**한다 — 판정 입력이 리포당 1건으로 줄고, detect를 고쳐 재실행해도 판정이 살아남는다
  - 검증: 스키마 예시 3건이 repos.md 또는 verdicts.json에 있다

——

## 1. `detect`가 후보 목록을 반환 (테스트 먼저)

**완료 조건 ②(오탐률)를 측정 가능하게 만드는 유일한 프로덕션 변경이다** (+ 태스크 8의 계약 주석 1건 — spec §프로덕션 변경).

- [ ] `/tdd` — 2순위 후보가 노출되는 테스트, 기존 우선순위가 1순위로 유지되는 테스트
  - 검증: 새 테스트가 red
- [ ] `Adapter`에 `detectCandidates(paths, probe): DetectedFormat[]`(순위순, 빈 배열 = 못 찾음)를 **병존 추가** — 메서드 교체가 아니다 (2026-09-02 표기 확정). 기존 `detect`는 내부에서 `[0]`을 쓰도록 재구현하고 시그니처 유지
  - **기존 `detect`·`detectFormat`·`detectFormatWith` 시그니처를 유지한다** — 호출부(`scripts/ingest.ts`·`scripts/push-local.ts`)를 건드리지 않는 additive 변경이어야 한다. `DetectedFormat` 구조체도 불변
  - 검증: `pnpm test` green (기존 어댑터 테스트 전부 포함), `pnpm typecheck` green

——

## 2. 어댑터 계약 테스트를 `ADAPTERS` 순회로 (design.md §불변식)

- [ ] `adapters.test.ts`의 **"writer 결정성" describe 블록**(이름으로 참조 — 라인 번호는 썩는다)을 `ADAPTERS` 순회 구조로 전환. **규칙 적용은 design.md의 layout 매트릭스를 따른다** (2026-09-02 정정 — "공통 규칙 전부 적용"은 ARCHITECTURE §1.4와 모순이었다):
  - 재생성(`per-locale`)에만: 정렬·2칸·끝 개행 1개·orphaned 출력 제외·빈 값 제외
  - 전부에: 입력 순서 무관(결정성), "orphaned 키의 **DB 값**이 출력에 나타나지 않는다"(의미 수준 — ts-dict는 원본 값이 남는 게 정답이다)
- [ ] **규칙 위반 가짜 어댑터를 영구 네거티브 테스트로 남긴다** (2026-09-02 — 일회성 "끼웠다 되돌리기"는 재현이 안 된다): 공유 단언 헬퍼를 가짜 어댑터에 돌려 실패를 `expect`하는 테스트. "4번째 어댑터가 규칙을 안 지켜도 green"이라는 원래 문제의식이 이걸로 상시 검사된다
  - 검증: `pnpm test` green + 네거티브 테스트가 가짜 어댑터의 규칙 위반을 실제로 잡는다

——

## 3. `roundtripDiffRatio` 순수 함수 (`lib/survey/`)

- [ ] `/tdd` → 구현. **원본과 1차 write 출력**의 변경 줄 비율 (지표 ④의 "첫 write 변경 줄 비율" 축)
  - 검증: 동일 문자열 → `0`, 전체 재정렬된 파일 → `0.9` 이상, 한 줄만 바뀐 파일 → `1/전체줄수` 근사

——

## 4. `surveyOne` + 보조 순수 함수 (`lib/survey/`)

- [ ] `/tdd` — 픽스처 4개(정상 flat / 오탐 유발 검색 인덱스 / read 에러 포함 / **어댑터 간 경합 — chrome-locales와 ts-dict가 공존하는 bugshot-2 형태**)
- [ ] `mergeCandidates(perAdapter)` — 어댑터별 후보 목록 → 글로벌 순위(`ADAPTERS` 순서 → 어댑터 내 순위)
  - 검증: **`[0]`이 현 `detectFormat` 결과와 항상 같다**는 불변식 테스트 (design.md §detect 확장)
- [ ] `selectSurveyFiles(paths)` — 물리화할 파일 선별(후보 카탈로그 + 설정 파일, `.git`·바이너리·대용량 제외). 껍데기에 로직이 스미는 걸 막는 함수다
- [ ] `surveyOne({repo, paths, files})` → `RepoSurvey`
  - **파일 내용을 인자로 받는다** — 네트워크·디스크 없음
  - **어댑터 read/write 호출을 try로 감싼다** — ts-dict의 `createSourceFile` throw가 `ReadResult.errors`로 오지 않으므로(design.md §함정) surveyOne이 "파싱 실패" 유형으로 흡수한다. 실패한 리포 하나가 전체를 멈추지 않는 경계가 여기다
  - `RepoSurvey`에 담을 것: 후보 목록(글로벌 순위별), 로케일 수, 키 수, `read` 에러 유형별 건수, **키 충돌 건수**, **무증상 skip 건수(spread·shorthand·computed)**, **왕복 2층 판정**(의미 게이트: 2차 read 키·값 집합 = 1차 read / 바이트 고정점: 2차 write = 1차 write — spec 완료 조건 ④), `roundtripDiffRatio`, 구분자가 `.`이 아닌지, 설정 파일 존재 여부, (코드 어댑터일 때) **읽힌 키 수 vs 파일의 문자열 리터럴 수**, 리포당 소요 시간
  - **`ts-dict`의 왕복은 파일 × 로케일 이중 루프다** (ARCHITECTURE §3 함정) — 직전 write 결과를 다음 로케일 호출의 원본으로 넘긴다. 파일 축만 돌면 나머지 로케일이 원본으로 남아 왕복이 거짓 통과한다
  - **생산자에 타입을 명시한다** (`const survey: RepoSurvey = ...`) — POSTMORTEM 2026-08-31 리터럴 조립 항목
  - 검증: `pnpm test` green

——

## 5. `summarize` 순수 함수 (`lib/survey/`)

- [ ] `/tdd` → 구현. `summarize(surveys, verdicts)` → 지표 4개 + 마크다운 표 2층(포맷별 요약 + 리포별 상세 — 태스크 7)
  - **verdicts(정답 카탈로그 경로 목록)를 입력으로 받는다** — 오탐률은 정답 경로 vs 후보 목록 대조로 계산 (자동 판정 불가인 것은 "정답이 무엇인가"이고, 그건 태스크 0의 verdicts 파일에 있다)
  - **지표 ①은 분모 2개를 모두 낸다** (지원 포맷 대상 / 전체 — spec 완료 조건 2-①)
  - 검증: 픽스처 4건 + verdicts 픽스처로 성공률·오탐률(1순위 오탐, 2순위 정답 케이스 포함) 계산이 맞는지

——

## 6. `scripts/adapter-survey.ts` CLI 껍데기

- [ ] 리포 목록을 읽어 clone → 파일 트리(리포 상대 POSIX 경로로 정규화) → `selectSurveyFiles` → `surveyOne` → `summarize`
- [ ] **`process.exit()` 금지, `process.exitCode`만 세운다** (POSTMORTEM 2026-08-31 — 파이프 stdout 잘림)
- [ ] `--json` 분기를 **early return으로 명시**한다 (같은 항목의 2차 원인 — 문서가 둘 나왔다). **`--json`일 때 stdout은 JSON 단독, 사람용 출력은 stderr** (`ingest.ts` 관례)
- [ ] **exit code 계약: 측정 층이므로 항상 0** (`pnpm scan` 선례 — 남의 리포 상태를 우리 exit code로 판정하지 않는다. 사용법 오류만 2)
- [ ] `package.json`에 `adapter-survey` 스크립트 + CLAUDE.md 명령어 표 갱신
  - 검증: 리포 3개로 스모크 통과, `... --json | jq . > /dev/null` 통과 — **단 3개 출력은 64KB를 못 넘을 수 있으므로 이 검증은 태스크 7 전체 실행에서 반복해야 유효하다** (POSTMORTEM: 작은 출력에선 잘림이 재현되지 않는다)
  - 검증: 실패한 리포 하나가 전체를 멈추지 않는다 — **clone 실패·빈 트리·서브모듈 안 로케일(depth-1이라 미초기화)·비UTF-8/바이너리 read·거대 파일·로케일 100개+ 리포**를 결과에 기록하고 계속한다

——

## 7. 전체 실행 + `docs/ADAPTER-COVERAGE.md`

- [ ] 50개 이상 실행. **1순위 후보 판정: 실행 에이전트가 리포별 정답 카탈로그 경로를 verdicts.json에 기록**(근거 note 포함 — 사후 감사용, spec §실행 방식) 후 `summarize` 재실행
  - 검증: 지표 4개가 전부 숫자로 있고(①은 분모 2개), 오탐률에 판정 주체 표시가 붙어 있다
  - 검증: **전체 실행 출력으로 `--json | jq . > /dev/null` 통과** (64KB 초과 조건에서의 파이프 검증 — 태스크 6의 유예분)
- [ ] **표는 2층이다** (2026-09-02 확정): 포맷별 요약 표(지표 4개 + 판정 근거) + 리포별 상세 표(1순위 후보 경로·판정 ✅/❌·실패 유형·리포 링크). 상세 표의 행이 곧 **실패 재현 경로**다
- [x] 파일 위치 확정: `docs/ADAPTER-COVERAGE.md` (루트) — 장기 참조 문서이고, `docs/features/`는 착수 전 준비물 자리다 (2026-09-02)
- [ ] CLAUDE.md **문서 신선도 목록**에 ADAPTER-COVERAGE.md 추가 ("문서가 6개뿐이라" 전제가 낡는다 — 명령어 표 갱신과 같은 커밋)

——

## 8. 판정 4개 기록 (spec 완료 조건 3과 동일 목록 — 2026-09-02 정렬)

- [ ] **지원 선언 포맷 목록** — 무엇을 "동작한다"고 말할 수 있는가
- [ ] **MVP §4.1 "키 정렬" 개정 필요 여부** — 지표 ④ 기준. 필요하면 "원본 키 순서 보존" 기능을 별 `/feature`로 뺀다
- [ ] **`ts-dict` 자동 탐지 제외 여부** — 무증상 skip·부분 읽기 비율 기준. "제외"면 온보딩이 `--adapter ts-dict` 명시로 바뀐다는 하류(spec §사용자)를 판정문에 함께 적는다
- [ ] **자동 포맷 탐지의 무인 신뢰 가능 여부** — 오탐률 30%(잠정값 — 표본 구성과 함께 재검토) 기준
- [ ] `lib/adapters/types.ts`에 "파일명 그대로가 로케일 코드의 진실" 계약 주석 (spec §프로덕션 변경 ② / design.md §함정)
  - 검증: 네 판정이 `docs/ADAPTER-COVERAGE.md`에 근거 숫자와 함께 적혀 있다
- [ ] `docs/MVP.md`·`docs/ARCHITECTURE.md` 갱신은 **여기서 하지 않는다** — `/feature` 규칙대로 필요만 남기고 `/implement` 또는 `/push` 신선도 단계에서 반영한다

---

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
