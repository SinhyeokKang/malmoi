# android-strings — tasks

모바일 세 스펙의 마지막이다(arb → apple-strings → android-strings). 순서: `basePath` → 파서 → 어댑터 → 기준 언어 입력·변경 거부·언어 추가 철자 →
저장 검증 → 합동 출시. 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다.
모바일 코퍼스·기준선은 arb T0.0·T0.1이 만든다. 표기 규칙("검증: red"·(수동)·테스트 커밋 합치기)은 arb tasks 머리와 같다.
design-brief 없음 — 화면 변경은 기존 프리미티브 조립이다(design §3.2).

## 3. Android (`android-strings`)

- [ ] **T3.0a base 경로 자리 전수 + 테스트** (`/tdd`) — design §2.3의 읽는 자리·쓰는 자리·지문 자리를 grep으로 확정해 목록을 고정하고,
      `baseFilePath`(`basePath ?? 치환`) 단위 테스트 + "basePath 표면에서 base를 치환으로 만드는 자리 0" 소스 테스트 + "쓰는 자리가 `basePath`를 기록" 테스트 +
      옛 CLI 페이로드(`basePath` 없음)가 기존 4포맷 표면에서 `format mismatch`가 아님(null 대 undefined) + 언어 제거가 `basePath`를 delete로 만들지 않음.
      검증: red(새 테스트만, 확정 목록 N개를 소스 테스트가 정확히 고정).
- [ ] **T3.0b `basePath` 스키마** (`/db`) — `TranslationSurface.basePath String?` additive. SELF-HOSTING §3 체크리스트(버전 건너뛴 업그레이드 안전).
      검증: `pnpm db:status` clean, dev `has_schema_privilege` false. prod 반영은 T5.6(`/merge` 1단계). 커밋: `feat(db): add translation surface base path`
- [ ] **T3.0c `basePath` 배선** — `DetectedFormat.basePath`, push 스키마(zod)·`checkFormat` 비교·경로 안전 두 경계, T3.0a의 자리들. 기존 어댑터는 null이라
      동작 변화 0. 검증: `pnpm gate` green(격리 postgres 스위트 포함), 기존 2코퍼스 25차 표와 같고 arb T0.0 기준선과 리포별 1순위 diff 0.
      커밋: `feat(sources): carry an explicit base file path`
- [ ] **T3.0d `@xml-tools/parser` 도입·실측** — exact 버전 고정, SELF-HOSTING §3 체크리스트, `minimumReleaseAge`·빌드 스크립트 확인, offset 단위(JS 문자열
      인덱스 여부·BOM·CRLF)·주석·CDATA·self-closing 노드 위치를 `.scratch/`에서 실측. 검증: 실측 결과를 design §2.1에 기록. 의존성 추가는 쓰는 곳이 생기는
      T3.2 커밋에 합친다(쓰는 곳 없는 의존성만 dev에 나가지 않게).
- [ ] **T3.1 테스트** — 범위 · 값 decode/encode 왕복 속성 · 공백 규칙(앞뒤·연속 공백·개행이면 따옴표로 감쌈) · 따옴표 감싼 값 형 유지 · CDATA 유지 · 자식 태그 그대로 ·
      `translatable="false"`·`<plurals>`·`<string-array>` 바이트 보존(unmanaged 보고) · 주석 속 `<string>`·`tools:` 속성·self-closing·`<resources/>`·`&#8230;`·`%%`·
      이스케이프 안 된 `'` 원본 · 중복 `name`(`duplicate-key`) · `name="__proto__"` · 빈 값 쓰기(`planClearability`) · CRLF(T3.0d 실측 반영) · 퇴화 출력 왕복 ·
      `values/` base 경로(`basePath`) · `zh-rCN` 코드 그대로 · `b+`·`values-night`·`values-car`·`values-en-rGB-v21` 제외(진입점 `detectCandidatesAcross`) ·
      단일 언어(`values/`만) 후보 · 멀티 모듈·flavor 1순위·`path-conflict` · `create`(XML 선언·`<resources>` 뼈대만, 주석·`translatable=false`·`<plurals>`·기준 값 미복사) ·
      `contract.ts` 매트릭스 편입. 검증: red.
- [ ] **T3.2 구현 + 배선** — arb T1.3 손 목록(`SUPPORTED_ADAPTERS` 추가, 사전 라벨) + `languageName`·`flagFor`의 `-r` 정규화 + survey 판정 비교가 `basePath`를 읽음
      (arb T0.1 판정 JSON). 검증: `pnpm test` green → 껍데기 테스트가 `values/`·`values-*/strings.xml`을 내려받는다 → `pnpm gate` green.
      커밋: `feat(adapters): add Android strings adapter`
- [ ] **T3.2b 기준 언어 코드 입력** — 온보딩 ③ Android base 행 + 코드 입력(`manual.baseLocale` Input 재사용, `isLocaleShaped`·관측 코드 중복 거부),
      ③ 근거 경로·`naming.info`의 `basePath` 표시, 수동 지정의 `basePath` 유도, `next-enabled.ts`·`confirm.ts`, CLI의 Android `--base` 필수,
      생성 워크플로(GitHub·GitLab)의 `base-locale`, Sources "Path pattern"의 base 줄. 사전 3벌(`/translate` 모드 ①).
      검증: 순수 판정 테스트 + `pnpm gate` green + `/runtime-test`로 ③ 입력·Sources 표시 확인 **(수동)**. 커밋: `feat(onboarding): ask for the Android base language`
- [ ] **T3.2c 기준 언어 변경 거부·언어 추가 철자** — `planBaseLocaleChange`의 `android-strings` 거부 코드 + 문구, Android 프리셋 `r` 철자 변환(레거시 표 `he→iw`·`id→in`·`yi→ji`),
      `judgeAdd`의 `r` 없는 지역 거부(웹·MCP 공통 코어). 검증: `change-plan`·`add-plan` 단위 테스트 + `pnpm gate` green.
      커밋: `feat(locales): use Android resource spelling for new languages`
- [ ] **T3.3 저장 검증** — `lib/keys/save.ts` 코어에서 인라인 태그 불일치 거부(design §3.1): `KeySavePlan` 새 코드, 워크스페이스 footer Alert·셀 `aria-invalid`,
      사전 3벌, MCP 영어 응답. 검증: 순수 함수 테스트 + 코어 테스트(웹·MCP 두 껍데기) + `pnpm gate` green + `/runtime-test`로 거부 표시 확인 **(수동)**.
      커밋: `feat(translations): reject saves that break Android inline tags`
- [ ] **T3.4 재측정** — 검증: 기존 표 회귀 0 · arb T0.0 기준선과 리포별 1순위 diff 0 · Android 고정점 100% · 조용한 손실 0 · 정답 `basePath` 일치 ·
      `resource-limit` 거부 수 보고. 커밋 없음.
- [ ] **T3.5 실물 (수동)** — `/roundtrip`. 전제: Android SDK·JDK, 폐기용 리포. 검증: 고친 셀 외 diff 0, Gradle `assembleDebug` 통과.

## 5. 외부 계약·문서 (세 스펙 합동 출시, 문서별 커밋)

- [ ] **T5.1 action·GitLab CI 원본 릴리스** — 세 스펙의 어댑터를 한 번에 싣는 태그 이동/신규(design §8, OPERATIONS 절차). 릴리스는 이것 한 번이다.
      태그를 옮기기 전에 **prod에 등록된 표면들의 리포**에 새 탐지를 읽기 전용으로 돌려 기존 `adapterName`·`pathTemplate`가 여전히 1순위인지 확인한다
      (`adapter`를 박지 않은 기존 워크플로의 영구 red는 코퍼스가 아니라 실제 소비자에서 일어난다). 커밋 없음.
      검증: prod 표면 1순위 불변 + 폐기용 리포 CI가 세 새 어댑터로 각각 green **(수동)**.
- [ ] **T5.2 `docs(PRODUCT)`** — §0 포맷 수, §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록·Android 철자·기준 언어 변경 거부.
- [ ] **T5.3 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, Android base 예외(`basePath`), 값 표현 표(design §3), §0 불변식 3의 수술적 표면 목록에 `android-strings`.
      CLAUDE.md 스택 표에 `@xml-tools/parser`(읽기·offset 전용) 함정(`docs(CLAUDE)`, 미러 `pnpm sync:agents`).
- [ ] **T5.4 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록, Android `base-locale` 필수,
      인라인 태그 안내("기준 언어의 태그를 그대로 두고 그 사이 글만 번역한다").
- [ ] **T5.5 정리** — 결론이 정본에 올라갔는지 확인한 뒤 `docs/features/android-strings/` 삭제.
- [ ] **T5.6 `/merge`** — 세 스펙이 모두 dev에 들어간 뒤 한 번. 1단계에서 `basePath` 마이그레이션 prod 반영(`pnpm db:deploy` + prod `has_schema_privilege` false).
- T5 공통 검증: `pnpm test`(가이드 게이트·`no-korean-ui`) green · `pnpm sync:agents:check` green.

## 확인 필요 (착수 전)

- ~~**Q1** Android 기준 언어 경로~~ → **`basePath` 별도 필드**(2026-10-19 사용자, `/feature-review`에서 재확인, design §2.3).
- ~~**Q3** Android 값 표현~~ → **이스케이프는 풀고 자식 태그 유지, 불일치 저장 거부**(2026-10-19 사용자, design §3).
- ~~**Q4** XML 위치 토크나이저~~ → **`@xml-tools/parser`**(2026-10-19 사용자, `/feature-review`에서 `saxes` 대신, design §2.1·§7).
- ~~기준 언어 코드·변경~~ → **온보딩 ③ 입력 + CLI `--base` 필수, 변경 거부**(2026-10-19 사용자, design §2.4).
- ~~언어 추가 철자~~ → **프리셋 변환 + 서버 검증**(2026-10-19 사용자, design §2.5).
- ~~태그 검증 위치~~ → **코어에서 거부**(2026-10-19 사용자, design §3.1).
- ~~create~~ → **뼈대만 복제, 값 있는 키만**(2026-10-19 사용자, design §2).
- ~~출시 단위~~ → **세 스펙 합동, 태그·머지 한 번**(2026-10-19 사용자).
