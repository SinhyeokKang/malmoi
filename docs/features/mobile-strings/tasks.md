# mobile-strings — tasks

모바일 세 어댑터 스펙(arb → apple-strings → android-strings) **앞에** 하는 코어 사전 작업이다(결정 2026-10-19 사용자). 순서: M0 → M1(사람 판정이라 M2·M3와
병렬로 진행해도 된다) → M2 → M3. M2·M3는 기존 4포맷에 닿는 코어 변경이라 **각자 `/push`**로 내보내 회귀 원인을 좁힌다. `/merge`는 세 어댑터 스펙까지
끝난 뒤 한 번이다(android-strings T5). 표기 규칙("검증: red"·(수동)·테스트 커밋 합치기)은 arb tasks 머리와 같다. design-brief 없음 — 화면 변경이 없다.

## M0·M1 기준선과 코퍼스

- [x] **M0 기준선 보고서 + SHA 고정** — 변경 전 dev HEAD로 학습·홀드아웃 survey를 `--json --out`으로 떠 `.scratch/adapter-survey-baseline/`에 둔다.
      25차 표는 집계값뿐이라 리포별 1순위를 견줄 수 없다. 이후 모든 재측정의 "기존 리포 1순위 불변"은 이 보고서와의 리포별 1순위 경로 diff 0이다.
      ⚠️ survey는 매번 외부 리포의 최신 HEAD를 clone하고 지운다(`lib/survey/run.ts:31·37·51·75`) — 상류 변경만으로 diff가 난다. 기준선 때 **리포별 SHA를
      기록하고 이후 재측정이 같은 SHA로 돌게** 한다(survey에 SHA 고정 입력이 없으면 그 배선이 이 태스크다 — 테스트 먼저, `pnpm gate` green,
      커밋 `feat(survey): pin corpus repos to recorded commits`). 25차 표와의 차이는 상류 변경으로 따로 설명하고, 새 기준선이 회귀 비교의 기준이다.
      검증: 같은 SHA로 두 번 돌린 보고서가 리포별로 같다. 보고서 자체는 커밋 없음(`.scratch/`).
- [ ] **M1 모바일 코퍼스** — 2026-10-19 표본에서 **보유 기준**(그 포맷 파일을 가진 리포 — spec의 "순증"과 다르다) ARB 9 · Apple 35 · Android 24 리포를
      후보로, 학습/홀드아웃을 나눠 `docs/adapter-survey/`에 `repos-mobile.txt`·`repos-mobile-heldout.txt`·판정 JSON을 만든다. 정답 경로는 사람이
      원문을 보고 판정한다(23차 관행). Android 정답은 템플릿(`values-{locale}`)과 `basePath`(`values/`)의 쌍이라 판정 JSON에 `basePath` 필드를 둔다
      (survey 비교 배선은 android-strings T3.2). 함께 센다: UTF-16 `.strings` 리포 수, `Base.lproj/Localizable.strings` 리포 수, xcstrings 원문 셀 없는 키 비율.
      세 어댑터 스펙이 같은 코퍼스를 쓴다.
      검증: `pnpm adapter-survey docs/adapter-survey/repos-mobile.txt` 가 clone 실패 0으로 돈다(새 어댑터 전이라 탐지 0이 정상), 세 건수가 기록됐다.
      커밋: `docs(adapter-survey): add mobile corpus`

## M2 `basePath` (자체 `/push`)

- [ ] **M2a base 경로 자리 전수 + 테스트** (`/tdd`) — design §2의 읽는 자리·쓰는 자리·지문 자리를 grep으로 확정해 목록을 고정하고,
      `baseFilePath`(`basePath ?? 치환`) 단위 테스트 + "basePath 표면에서 base를 치환으로 만드는 자리 0" 소스 테스트 + "쓰는 자리가 `basePath`를 기록" 테스트 +
      옛 CLI 페이로드(`basePath` 없음)가 기존 4포맷 표면에서 `format mismatch`가 아님(null 대 undefined) + 언어 제거가 `basePath`를 delete로 만들지 않음.
      검증: red(새 테스트만, 확정 목록 N개를 소스 테스트가 정확히 고정).
- [ ] **M2b `basePath` 스키마** (`/db`) — `TranslationSurface.basePath String?` additive. SELF-HOSTING §3 체크리스트(버전 건너뛴 업그레이드 안전).
      검증: `pnpm db:status` clean, dev `has_schema_privilege` false. prod 반영은 android-strings T5.6(`/merge` 1단계). 커밋: `feat(db): add translation surface base path`
- [ ] **M2c `basePath` 배선** — `DetectedFormat.basePath`, push 스키마(zod)·`checkFormat` 비교·경로 안전 두 경계, M2a의 자리들(화면 자리는 android-strings T3.2b). 기존 어댑터는 null이라
      동작 변화 0. 검증: `pnpm gate` green(격리 postgres 스위트 포함), 기존 2코퍼스 25차 표와 같고 M0 기준선과 리포별 1순위 diff 0.
      커밋: `feat(sources): carry an explicit base file path`

## M3 `.strings` 인코딩 경계 (자체 `/push`)

- [ ] **M3a 인코딩 테스트** (`/tdd`) — `decodeFileBytes`·`encodeFileContent` 왕복(5 인코딩) · `.strings` 아닌 경로는 판별 안 함 ·
      `encodeFileContent(s, "utf-8")`가 `Buffer.from(s, "utf8")`와 바이트 같음 · UTF-8 BOM이 문자열에 남음 · UTF-16 신호 없는 입력(BOM 없는 짧은 ASCII)은 UTF-8 ·
      비가역 입력(BOM + 짝 없는 서로게이트 `FF FE 00 D8`·BOM 뒤 홀수 길이·유효하지 않은 UTF-8)은 **명시 실패**(U+FFFD로 바뀌지 않음) · 인코딩한 바이트 기준 `blobSha` · `planPullChanges`(`lib/pull/plan.ts:252-283`)에
      변경 없는 UTF-16 파일을 넣으면 upsert 0 · 소스 테스트 "`.strings`를 UTF-8로 직접 읽는 로케일 리더 0곳". 검증: red.
- [ ] **M3b 인코딩 경로** — `AdapterFile.encoding`, 리더 넷(GitHub `lib/github.ts:322·409` · GitLab `lib/gitlab/plan.ts:93` · CLI `scripts/format.ts:25`) +
      survey `lib/survey/run.ts:63` NUL 스킵 교체, GitHub UTF-16 파일의 `POST /git/blobs`(base64) · GitLab `encoding: "base64"`, `blobSha` 바이트 기준
      (호출자 `lib/pull/plan.ts:266` · `scripts/ingest.ts:147`), 렌더 출력의 인코딩 상속.
      검증: `pnpm gate` green, 기존 2코퍼스 25차 표와 같고 M0 기준선과 리포별 1순위 diff 0(UTF-8 리포 회귀 0).
      커밋: `feat(repo): read and write strings files in their original encoding` → `/push`

## 문서

- 이 스펙의 결론(기준선 SHA 고정, `basePath`, 인코딩 경로·API 예산)은 각 어댑터 스펙 T5의 `docs(ARCHITECTURE)`에서 정본으로 올린다.
- 폴더 정리는 android-strings T5.5가 네 폴더(`mobile-strings`·`arb`·`apple-strings`·`android-strings`)를 함께 지운다.

## 확인 필요 (착수 전)

- ~~사전 작업 분리~~ → **mobile-strings로 코어를 먼저, 그다음 ARB → Apple → Android**(2026-10-19 사용자).
- ~~`basePath`~~ → **별도 컬럼**(2026-10-19 사용자, design §2). ~~UTF-16~~ → **`.strings` 경로에만, 비가역 입력 명시 실패**(2026-10-19 사용자, design §3).
