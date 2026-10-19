# android-strings — tasks

모바일 세 스펙의 마지막이다(arb → apple-strings → android-strings). 순서: `basePath` → 어댑터 → 기준 언어 입력·언어 추가 철자 → 저장 검증 →
합동 출시. 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다.
모바일 코퍼스는 arb T0.1이 만든다. design-brief 없음 — 화면 변경은 기존 프리미티브 조립이다(design §3.1).

## 3. Android (`android-strings`)

- [ ] **T3.0a base 경로 자리 전수 + 테스트** (`/tdd`) — design §2.3의 읽는 자리·쓰는 자리·지문 자리를 grep으로 확정해 목록을 고정하고,
      `baseFilePath`(`basePath ?? 치환`) 단위 테스트 + "basePath 표면에서 base를 치환으로 만드는 자리 0" 소스 테스트를 쓴다.
      검증: red.
- [ ] **T3.0b `basePath` 스키마** (`/db`) — `TranslationSurface.basePath String?` additive. 검증: `pnpm db:status` clean, `has_schema_privilege` false(dev).
      커밋: `feat(db): add translation surface base path`
- [ ] **T3.0c `basePath` 배선** — `DetectedFormat.basePath`, push 스키마(zod)·`checkFormat` 비교·경로 안전 두 경계, T3.0a의 자리들. 기존 어댑터는 null이라
      동작 변화 0. 검증: `pnpm gate` green, 기존 survey 2코퍼스 25차 표와 같음. 커밋: `feat(sources): carry an explicit base file path`
- [ ] **T3.0d `saxes` 도입** — exact 버전 고정, SELF-HOSTING §3 체크리스트, offset 단위(UTF-16 코드 유닛 여부·BOM·CRLF) 실측을 `.scratch/`에서.
      검증: `pnpm gate` green, 실측 결과를 design §2.1에 기록. 커밋: `chore(deps): add saxes for Android strings offsets`
- [ ] **T3.1 테스트** — 범위 · 값 decode/encode 왕복 · 따옴표 감싼 값 형 유지 · 자식 태그 그대로 · `translatable="false"`·`<plurals>`·`<string-array>`
      바이트 보존(unmanaged 보고) · `values/` base 경로(`basePath`) · `zh-rCN` 코드 그대로 · `b+` 제외 · `androidInlineTagsMatch` · `create`. 검증: red.
- [ ] **T3.2 구현 + 배선** (arb T1.3 목록) + `androidLocaleDisplay`(표시·방향). 커밋: `feat(adapters): add Android strings adapter`
- [ ] **T3.2b 기준 언어 코드 입력** — 온보딩 ③ Android base 행 + 코드 입력(`manual.baseLocale` Input 재사용, `isLocaleShaped`·관측 코드 중복 거부),
      `next-enabled.ts`·`confirm.ts`, CLI의 Android `--base` 필수, 생성 워크플로(GitHub·GitLab)의 `base-locale`. 사전 3벌(`/translate` 모드 ①).
      검증: 순수 판정 테스트 + `pnpm gate` green + `/runtime-test`로 ③ 입력 확인(수동).
- [ ] **T3.2c 언어 추가 철자** — Android 프리셋 `r` 철자 변환, `judgeAdd`의 `r` 없는 지역 거부(웹·MCP 공통 코어). 검증: `add-plan` 단위 테스트 + `pnpm gate` green.
- [ ] **T3.3 저장 검증** — 편집 저장 Action에서 인라인 태그 불일치 거부(코드 반환, 사전 3벌 문구). 검증: 순수 함수 테스트 + `/runtime-test`.
- [ ] **T3.4 재측정 + `/roundtrip`** (Gradle `assembleDebug` 통과까지).

## 5. 외부 계약·문서 (세 스펙 합동 출시, 문서별 커밋)

- [ ] **T5.1 action·GitLab CI 원본 릴리스** — 세 스펙의 어댑터를 한 번에 싣는 태그 이동/신규(design §8, OPERATIONS 절차). 릴리스는 이것 한 번이다.
      검증: 폐기용 리포 CI가 세 새 어댑터로 각각 green.
- [ ] **T5.2 `docs(PRODUCT)`** — §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록.
- [ ] **T5.3 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, Android base 예외(`basePath`), 값 표현 표(design §3).
- [ ] **T5.4 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록, Android `base-locale` 필수.
- [ ] **T5.5 정리** — 결론을 정본으로 올린 뒤 `docs/features/android-strings/` 삭제.
- [ ] **T5.6 `/merge`** — 세 스펙이 모두 dev에 들어간 뒤 한 번. 1단계에서 `basePath` 마이그레이션 prod 반영(`pnpm db:status:prod`).

## 확인 필요 (착수 전)

- ~~**Q1** Android 기준 언어 경로~~ → **`basePath` 별도 필드**(2026-10-19 사용자, `/feature-review`에서 재확인, design §2.3).
- ~~**Q3** Android 값 표현~~ → **이스케이프는 풀고 자식 태그 유지, 불일치 저장 거부**(2026-10-19 사용자, design §3).
- ~~**Q4** XML 위치 토크나이저~~ → **`saxes`**(2026-10-19 사용자, design §2.1·§7).
- ~~기준 언어 코드~~ → **온보딩 ③ 입력 + CLI `--base` 필수**(2026-10-19 사용자, design §2.4).
- ~~언어 추가 철자~~ → **프리셋 변환 + 서버 검증**(2026-10-19 사용자, design §2.5).
- ~~출시 단위~~ → **세 스펙 합동, 태그·머지 한 번**(2026-10-19 사용자).
