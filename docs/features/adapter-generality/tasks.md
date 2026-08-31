# 태스크 — 어댑터 범용성 측정 실험

**착수 시점: MVP 6·7단계 완료 후.** 왕복이 서기 전에 하면 지표 ④(왕복 안정성)를 실물과 대조할 수 없다.

순서는 **순수 함수 → 껍데기 → 실행 → 판정**이다. `——`가 커밋 경계다.

---

## 0. 대상 리포 선정 (코드 없음)

- [ ] `docs/features/adapter-generality/repos.md`에 30~50개 리포 URL + 예상 포맷 라벨
  - 검증: 포맷 **5종 이상** 분포(chrome `_locales` / flat JSON / 중첩 JSON / YAML / 코드 딕셔너리), 스타 수 구간 **3개**(<100, 100~2k, >2k)에 각각 5개 이상, **스타터·템플릿 리포가 절반 이하**
- [ ] 🔒 **리포 수집 방식 결정** — 로컬 `git clone --depth 1` vs GitHub tarball API
  - `clone` 추천: 토큰이 필요 없고 rate limit이 없고 **실제 pull이 보는 것과 같은 파일 트리**를 준다. tarball로 가면 `GITHUB_TOKEN` + `.env.example` 갱신이 붙는다
  - 검증: 결정을 이 파일에 한 줄로 기록

——

## 1. `detect`가 후보 목록을 반환 (테스트 먼저)

**완료 조건 ②(오탐률)를 측정 가능하게 만드는 유일한 프로덕션 변경이다.**

- [ ] `/tdd` — 2순위 후보가 노출되는 테스트, 기존 우선순위가 1순위로 유지되는 테스트
  - 검증: 새 테스트가 red
- [ ] `Adapter.detect` → `detectCandidates(paths, probe): DetectedFormat[]` (순위순, 빈 배열 = 못 찾음)
  - **기존 `detect`·`detectFormat`·`detectFormatWith` 시그니처를 유지한다** — 내부에서 `[0]`을 쓴다. 호출부(`scripts/ingest.ts`·`scripts/push-local.ts`)를 건드리지 않는 additive 변경이어야 한다
  - 검증: `pnpm test` green (기존 어댑터 테스트 전부 포함), `pnpm typecheck` green

——

## 2. 어댑터 계약 테스트를 `ADAPTERS` 순회로 (design.md §불변식)

- [ ] `adapters.test.ts:296` "writer 결정성" 블록을 `describe.each(ADAPTERS)`로 전환
  - `ts-dict`는 `layout: "multi-locale"` + 수술적 치환이라 재생성 규칙(정렬·2칸·끝 개행)이 적용되지 않는다 — **`layout`으로 갈라 재생성 어댑터에만 그 규칙을 적용하고, 공통 규칙(orphaned 제외, 빈 값 제외, 입력 순서 무관)은 전부에 적용**한다
  - 검증: `pnpm test` green. **가짜 어댑터를 하나 끼워 규칙을 어기게 만들면 실패하는지 확인**한다(그게 이 태스크의 요점이다 — 확인 후 되돌린다)

——

## 3. `roundtripDiffRatio` 순수 함수

- [ ] `/tdd` → 구현. 원본과 write 출력의 **변경 줄 비율**
  - 검증: 동일 문자열 → `0`, 전체 재정렬된 파일 → `0.9` 이상, 한 줄만 바뀐 파일 → `1/전체줄수` 근사

——

## 4. `surveyOne` 순수 함수

- [ ] `/tdd` — 픽스처 3개(정상 flat / 오탐 유발 검색 인덱스 / read 에러 포함)
- [ ] `surveyOne({repo, paths, files})` → `RepoSurvey`
  - **파일 내용을 인자로 받는다** — 네트워크·디스크 없음
  - `RepoSurvey`에 담을 것: 후보 목록(순위별), 로케일 수, 키 수, `read` 에러 유형별 건수, **키 충돌 건수**, 왕복 동일 여부, `roundtripDiffRatio`, 구분자가 `.`이 아닌지, 설정 파일 존재 여부, (코드 어댑터일 때) **읽힌 키 수 vs 파일의 문자열 리터럴 수**
  - **생산자에 타입을 명시한다** (`const survey: RepoSurvey = ...`) — POSTMORTEM 2026-08-31 리터럴 조립 항목
  - 검증: `pnpm test` green

——

## 5. `summarize` 순수 함수

- [ ] `/tdd` → 구현. `RepoSurvey[]` → 지표 4개 + 마크다운 표
  - 검증: 픽스처 3건으로 성공률·오탐률 계산이 맞는지. **오탐률은 사람 판정 입력을 받는 구조여야 한다**(자동 판정 불가 — `repos.md`의 라벨과 대조)

——

## 6. `scripts/adapter-survey.ts` CLI 껍데기

- [ ] 리포 목록을 읽어 clone → 파일 트리 → `surveyOne` → `summarize`
- [ ] **`process.exit()` 금지, `process.exitCode`만 세운다** (POSTMORTEM 2026-08-31 — 파이프 stdout 잘림)
- [ ] `--json` 분기를 **early return으로 명시**한다 (같은 항목의 2차 원인 — 문서가 둘 나왔다)
- [ ] `package.json`에 `adapter-survey` 스크립트 + CLAUDE.md 명령어 표 갱신
  - 검증: 리포 3개로 스모크 통과, **그리고 `... --json | jq . > /dev/null`이 통과**한다(TTY로는 잘림이 재현되지 않는다)
  - 검증: 실패한 리포 하나가 전체를 멈추지 않는다 — clone 실패·빈 트리를 결과에 기록하고 계속한다

——

## 7. 전체 실행 + `docs/ADAPTER-COVERAGE.md`

- [ ] 30개 이상 실행, 1순위 후보를 **눈으로 판정**해 오탐 표시
  - 검증: 지표 4개가 전부 숫자로 있고, 오탐률에 "사람 판정" 표시가 붙어 있다
- [ ] 포맷별 성공/실패 표 + **실패 유형별 대표 리포 링크**(재현 경로가 남아야 한다)
  - 🔒 파일 위치: `docs/ADAPTER-COVERAGE.md`(루트) 추천 — 장기 참조 문서이고, `docs/features/`는 착수 전 준비물 자리다

——

## 8. 판정 3개 기록

- [ ] **지원 선언 포맷 목록** — 무엇을 "동작한다"고 말할 수 있는가
- [ ] **MVP §4.1 "키 정렬" 개정 필요 여부** — 지표 ④ 기준. 필요하면 "원본 키 순서 보존" 기능을 별 `/feature`로 뺀다
- [ ] **`ts-dict` 자동 탐지 제외 여부** — 코드 어댑터의 부분 읽기 비율 기준
- [ ] **SaaS 경로 개폐** — 오탐률 30% 초과면 사내 도구로 확정
- [ ] `lib/adapters/types.ts`에 "파일명 그대로가 로케일 코드의 진실" 계약 주석 (design.md §함정)
  - 검증: 네 판정이 `docs/ADAPTER-COVERAGE.md`에 근거 숫자와 함께 적혀 있다
- [ ] `docs/MVP.md`·`docs/ARCHITECTURE.md` 갱신은 **여기서 하지 않는다** — `/feature` 규칙대로 필요만 남기고 `/implement` 또는 `/push` 신선도 단계에서 반영한다

---

## 🔒 착수 전 결정이 필요한 것

1. **리포 수집 방식** (태스크 0) — `clone` 추천
2. **오탐 판정 범위** — 30개 × 후보 3개 = 눈으로 90건. 1순위만 볼지 3순위까지 볼지
3. **`ADAPTER-COVERAGE.md` 위치** (태스크 7) — `docs/` 루트 추천

## 이 실험에서 파생되지만 범위 밖인 것

- **ICU placeholder 검증** — 번역값이 원문의 `{...}` 토큰 집합을 보존하는지. `lib/keys/save.ts`의 `planSave`에 순수 함수 하나면 되고 ICU 파싱이 필요 없다. **다만 `docs/MVP.md` §7 "ICU 복수형"에 걸리므로 별 `/feature`에서 되묻고 §7을 갱신해야 한다**
- **설정 파일 기반 탐지** (`i18next-parser.config.*` 등) — 이 실험은 빈도만 센다
- **`nested: boolean` → `tree: {style, separator}`** 계약 확장 + `Project.nested` 마이그레이션(additive)
