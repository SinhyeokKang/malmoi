# mobile-strings — tasks

순서: 공통 → ARB → Apple `.strings` → Android → (`.xcstrings`). 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9
재측정 트리거)으로 닫는다. design-brief 없음 — 새 UI 표면이 없다(어댑터 라벨은 기존 수동 지정 목록의 행이다).

## 0. 공통 (첫 배치 앞)

- [ ] **T0.1 모바일 코퍼스** — 2026-10-19 표본에서 ARB 9 · Apple 35 · Android 24 리포를 후보로, 학습/홀드아웃을 나눠 `docs/adapter-survey/`에
      `repos-mobile.txt`·`repos-mobile-heldout.txt`·판정 JSON을 만든다. 정답 경로는 사람이 원문을 보고 판정한다(23차 관행).
      검증: `pnpm adapter-survey docs/adapter-survey/repos-mobile.txt` 가 clone 실패 0으로 돈다(새 어댑터 전이라 탐지 0이 정상).
      커밋: `docs(adapter-survey): add mobile corpus`
- [ ] **T0.2 base 경로 자리 전수 + 테스트** (`/tdd`) — `{locale}` 치환 22줄 중 **base 로케일 경로를 만드는 자리**를 grep으로 확정해
      design §2.3 목록을 고정하고, `baseFilePath`(`basePath ?? 치환`) 단위 테스트 + "basePath 표면에서 base를 치환으로 만드는 자리 0" 소스 테스트를 쓴다.
      검증: red.
- [ ] **T0.3 `basePath` 스키마** (`/db`) — `TranslationSurface.basePath String?` additive. 검증: `pnpm db:status` clean, `has_schema_privilege` false(dev).
      커밋: `feat(db): add translation surface base path`
- [ ] **T0.4 `basePath` 배선** — `DetectedFormat.basePath`, push 스키마(zod)·`checkFormat` 비교·경로 안전 두 경계, T0.2의 자리들. 기존 어댑터는 null이라
      동작 변화 0. 검증: `pnpm gate` green, 기존 survey 2코퍼스 25차 표와 같음. 커밋: `feat(sources): carry an explicit base file path`

## 1. ARB (`arb-catalog`)

- [ ] **T1.1 테스트** — read(`@key`·`@@*` 제외), write(`@key` 원본 위치 운반 · `@@locale` 생성 · 고정점), detect(`l10n.yaml` 보조 · `aside`),
      `contract.ts` 매트릭스 편입, `create`(기준 언어 표현 + `@@locale`). 검증: red.
- [ ] **T1.2 구현** — `json-style.ts` 재사용. 검증: `pnpm test` green. 커밋: `feat(adapters): add ARB catalog adapter`
- [ ] **T1.3 껍데기 배선** — `ADAPTERS`·온보딩 `probeTargets`·survey `select.ts`·`renderProjectWorkflowYaml`·사전 3벌 어댑터 라벨(`/translate` 모드 ①).
      검증: 껍데기 테스트가 `.arb`를 내려받는다(POSTMORTEM 2026-09-02), `pnpm gate` green.
- [ ] **T1.4 재측정** — 모바일 + 기존 2코퍼스. 검증: 기존 표 회귀 0 · 기존 리포 1순위 불변 · ARB 고정점 100%.
- [ ] **T1.5 실물** — `/roundtrip`으로 폐기용 Flutter 리포 왕복. 검증: 고친 셀 외 diff 0, `flutter gen-l10n` 통과.

## 2. Apple `.strings` (`apple-strings`)

- [ ] **T2.0a 인코딩 테스트** (`/tdd`) — `decodeFileBytes`·`encodeFileContent` 왕복(6 인코딩), UTF-8 계열 기존 동작 불변(BOM이 문자열에 남는다),
      인코딩한 바이트 기준 `blobSha`. 검증: red.
- [ ] **T2.0b 인코딩 경로** — `AdapterFile.encoding`, 리더 셋(GitHub ×2·GitLab·CLI walk)·survey 껍데기, GitHub base64 blob·GitLab `encoding: "base64"`,
      `blobSha` 바이트 기준, 렌더 출력의 인코딩 상속. 검증: `pnpm gate` green, 기존 survey 2코퍼스 25차 표와 같음(UTF-8 리포 회귀 0).
      커밋: `feat(repo): read and write locale files in their original encoding`
- [ ] **T2.1 테스트** — 토크나이저 범위 · 이스케이프 왕복 속성 · 비정규 리터럴 미변경 · 주석/빈 줄 보존 · `Base.lproj` 제외 ·
      `fastlane/` 곁가지 · `create`(기준 언어 인코딩 상속). 검증: red.
- [ ] **T2.2 구현 + 배선** (T1.3과 같은 목록). 커밋: `feat(adapters): add Apple strings adapter`
- [ ] **T2.3 재측정 + `/roundtrip`** (Xcode 빌드 통과까지).

## 3. Android (`android-strings`)

- [ ] **T3.0 `saxes` 도입** — exact 버전 고정, SELF-HOSTING §3 체크리스트, offset 단위(UTF-16 코드 유닛 여부·BOM·CRLF) 실측을 `.scratch/`에서.
      검증: `pnpm gate` green, 실측 결과를 design §2.3에 기록. 커밋: `chore(deps): add saxes for Android strings offsets`
- [ ] **T3.1 테스트** — 범위 · 값 decode/encode 왕복 · 따옴표 감싼 값 형 유지 · 자식 태그 그대로 · `translatable="false"`·`<plurals>`·`<string-array>`
      바이트 보존(unmanaged 보고) · `values/` base 경로(`basePath`) · `zh-rCN` 코드 그대로 · `b+` 제외 · `androidInlineTagsMatch` · `create`. 검증: red.
- [ ] **T3.2 구현 + 배선** + `androidLocaleDisplay`(표시·방향). 커밋: `feat(adapters): add Android strings adapter`
- [ ] **T3.3 저장 검증** — 편집 저장 Action에서 인라인 태그 불일치 거부(코드 반환, 사전 3벌 문구). 검증: 순수 함수 테스트 + `/runtime-test`.
- [ ] **T3.4 재측정 + `/roundtrip`** (Gradle `assembleDebug` 통과까지).

## 4. Apple `.xcstrings` (`apple-xcstrings`)

- [ ] **T4.0 서식 실측** — 실제 xcstrings 3개(코퍼스)로 Xcode 출력 서식(들여쓰기·`" : "`·키 정렬·끝 개행·빈 객체)을 골든 픽스처로 채록.
      검증: 픽스처가 원본과 바이트 같다.
- [ ] **T4.1 테스트** — `sourceLanguage` 기준 언어 · 값 치환 범위 · 없는 로케일 블록 삽입 위치·서식 · `state` 규칙 · `shouldTranslate:false`·`variations`
      보존 · 언어 추가·제거 비지원 표시(`write-create-unsupported`) · 비울 수 없음(불변식 3 수술적 규칙). 검증: red.
- [ ] **T4.2 구현 + 배선** (T1.3 목록 + locale-add 비지원 화면 분기). 커밋: `feat(adapters): add Apple xcstrings adapter`
- [ ] **T4.3 재측정 + `/roundtrip`** — Malmoi PR 머지 뒤 Xcode에서 열어 저장해도 diff 0인지까지.

## 5. 외부 계약·문서 (마지막 배치와 함께, 문서별 커밋)

- [ ] **T5.1 action·GitLab CI 원본 릴리스** — 태그 이동/신규(design §8, OPERATIONS 절차). 검증: 폐기용 리포 CI가 새 어댑터로 green.
- [ ] **T5.2 `docs(PRODUCT)`** — §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록(`xcstrings` 비지원).
- [ ] **T5.3 `docs(ARCHITECTURE)`** — §1.9에 26차(모바일 코퍼스 포함) 표·판정, `localePath` 규칙, Android base 예외, 값 표현 표(design §3).
- [ ] **T5.4 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록.
- [ ] **T5.5 정리** — 결론을 정본으로 올린 뒤 `docs/features/mobile-strings/` 삭제.

## 확인 필요 (착수 전)

- ~~**Q1** Android 기준 언어 경로~~ → **`basePath` 별도 필드**(2026-10-19 사용자, design §2.3).
- ~~**Q2** ARB `@key` 메타데이터~~ → **원본에서 나른다**(2026-10-19 사용자, design §2.1).
- ~~**Q3** Android 값 표현~~ → **이스케이프는 풀고 자식 태그 유지, 불일치 저장 거부**(2026-10-19 사용자, design §3).
- ~~**Q4** XML 위치 토크나이저~~ → **`saxes`**(2026-10-19 사용자, design §2.3·§7).
- ~~**Q5** `.xcstrings`~~ → **이 spec의 마지막 배치**(2026-10-19 사용자, design §2.5).
- ~~**Q6** UTF-16 `.strings`~~ → **이번에 지원**(2026-10-19 사용자, design §2.4).

결정 6개가 모두 닫혔다. 다음: `/tdd interface`(T0.2부터).
