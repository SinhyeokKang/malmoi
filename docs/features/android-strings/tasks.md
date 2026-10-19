# android-strings — tasks

모바일 세 스펙의 마지막이다(arb → apple-strings → android-strings). 순서: `basePath` → 파서 → 어댑터 → 기준 언어 입력·변경 거부·언어 추가 철자 →
저장 검증 → 합동 출시. 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9 재측정 트리거)으로 닫는다.
모바일 코퍼스는 mobile-strings M1이 만들었고, **회귀 기준선은 커밋된 `docs/adapter-survey/baseline/`이다**(앞 스펙이 갱신한다 — 머신을 옮겨도 같다).
표기 규칙("검증: red"·(수동)·테스트 커밋 합치기)은 arb tasks 머리와 같다. arb 런에서 넘어온 지휘 메모(손 목록 정정 · 리뷰 리듬 · 가이드는 라벨이 dev에 들어간 뒤 ·
MCP로 대체한 실물 단계 · App 설치 범위)는 apple-strings tasks 머리와 같다.
design-brief 없음 — 화면 변경은 기존 프리미티브 조립이다(design §3.2).

**apple-strings 런에서 넘어온 것(2026-10-19, `docs/features/apple-strings/orch.md`)** — 인테이크 때 배치 계획에 반영한다:
- **Android가 이겨야 할 리포 둘** — 모바일 코퍼스 `jesther-ai/open-u60-pro`·`rosuH/EasyWatermark`는 정답이 Android인데 apple-strings 뒤 1순위가 실제 iOS 카탈로그(`.strings`)다(apple 결정 12 — 보고 대상).
  T3.4 재측정에서 이 둘의 1순위가 Android 정답으로 바뀌는지 본다. 기준선은 apple-xcstrings 뒤 커밋된 `docs/adapter-survey/baseline/`이다.
- **완료 조건 3의 문구가 완화됐다**(apple 결정 12) — "정답을 빼앗지 않는다. `-`·오탐이 새 후보로 바뀐 것은 보고 대상". 이 스펙의 같은 조건도 같은 기준으로 판정한다.
- **리뷰가 잡은 결함 부류**(apple R·R2·RX): 플랫폼 파서와 다른 이스케이프 해석(키까지 틀리게 적재 — `aapt2`로 채록한 기대값을 쓴다) · CRLF·EOF 삽입 바이트 · 같은 offset 두 번 쓰기 ·
  DB 행에서 멈춘 시나리오 · 강등 분기를 안 밟는 `detectFormats` 테스트 · 가려진 중복 사본의 자료형 · 큰 파일 하나가 탐지 전체를 `resource-limit`으로 만듦(apple 결정 16 — 크기를 아는 씨앗만 건너뛴다).
  Flutter 셸 강등(`isFlutterShell`, `lib/adapters/index.ts`)이 `android/`에도 걸려야 하는지 T3.1에서 정한다.
- **중복 키는 플랫폼 의미 + `duplicate-property` 경고가 선례다**(apple 결정 10·14) — T3.1의 "중복 `name`(`duplicate-key`)"을 착수 전에 다시 판정한다(대상 CI가 영구 red가 되는지 코퍼스로 본다).
- **언어 추가·제거는 빌드 설정 등록을 개발자 몫으로 문서화했다**(apple 결정 13 — Xcode `project.pbxproj`). Android는 `values-<qualifier>/`가 자동으로 잡히지만 `resConfigs`·`localeFilters`로 좁힌 앱은 같은 부류다.
- **GitLab 로케일 blob은 `/raw`로 읽는다**(POSTMORTEM 2026-10-19) — 호스트 가짜에 새 엔드포인트를 더하면 실제 응답을 채록해 변환을 흉내 낸다.
- 실물은 이번에도 MCP로 프로젝트·언어 작업을 했다. Q 워커 하나를 GitHub·GitLab·후속 포맷 왕복에 재사용했다(컨텍스트 여유).

## 3. Android (`android-strings`)

- `basePath` 컬럼·배선은 **mobile-strings** M2가 든다 — 2026-10-19 dev에 들어갔다(dev DB 적용, prod는 T5.6). 아래는 그 위의 Android 작업이다.
- M2가 이 스펙으로 넘긴 것: 실제 어댑터로만 닿는 시나리오 테스트(비-null basePath가 탐지 → 생성 → 표면 → Publish 경로까지 — M2는 stub 탐지로만 고정했다)는 T3.1에,
  화면 자리·표시 전용 select는 T3.2b에 붙인다.
- [x] **T3.0d `@xml-tools/parser` 도입·실측** — exact 버전 고정, SELF-HOSTING §3 체크리스트, `minimumReleaseAge`·빌드 스크립트 확인, offset 단위(JS 문자열
      인덱스 여부·BOM·CRLF)·주석·CDATA·self-closing 노드 위치를 `.scratch/`에서 실측. 검증: 실측 결과를 design §2.1에 기록. 의존성 추가는 쓰는 곳이 생기는
      T3.2 커밋에 합친다(쓰는 곳 없는 의존성만 dev에 나가지 않게).
- [x] **T3.1 테스트** — 범위 · 값 decode/encode 왕복 속성 · 공백 규칙(앞뒤·연속 공백·개행이면 따옴표로 감쌈) · 따옴표 감싼 값 형 유지 · CDATA 유지 · 자식 태그 그대로 ·
      `translatable="false"`·`<plurals>`·`<string-array>` 바이트 보존(unmanaged 보고) · 주석 속 `<string>`·`tools:` 속성·self-closing·`<resources/>`·`&#8230;`·`%%`·
      이스케이프 안 된 `'` 원본 · 중복 `name`(`duplicate-key`) · `name="__proto__"` · 빈 값 쓰기(`planClearability`) · CRLF(T3.0d 실측 반영) · 퇴화 출력 왕복 ·
      `values/` base 경로(`basePath`) · `zh-rCN` 코드 그대로 · `b+`·`values-night`·`values-car`·`values-en-rGB-v21` 제외(진입점 `detectCandidatesAcross`) ·
      단일 언어(`values/`만) 후보 · 멀티 모듈·flavor 1순위·`path-conflict` · `create`(XML 선언·`<resources>` 뼈대만, 주석·`translatable=false`·`<plurals>`·기준 값 미복사) ·
      **비기준 파일 누락 키 삽입**(기준 순서상 앞 키 뒤·없으면 `</resources>` 앞, 이웃 들여쓰기, `basePath` 파일에는 삽입 안 함) · **생성 → 다른 키 번역 → 두 번째 Publish**
      왕복(렌더 + `undeliverable` 분류에서 blocking 없음) ·
      `contract.ts` 매트릭스 편입 · 실 어댑터 basePath 공급 고리(탐지 → `create_project`/`add_sources` → `TranslationSurface.basePath` → `formatFromProject`·원격 상태 →
      Publish의 base 경로). 검증: red.
- [x] **T3.2 구현 + 배선** — arb T1.3 손 목록 + "실측 정정"(`SUPPORTED_ADAPTERS` 추가, 사전 라벨 — MCP `add_locale` 설명·`unsupported-format`·랜딩 본문의 포맷 나열 포함) + `languageName`·`flagFor`의 `-r` 정규화 + survey 판정 비교가 `basePath`를 읽음
      (mobile-strings M1 판정 JSON). 검증: `pnpm test` green → 껍데기 테스트가 `values/`·`values-*/strings.xml`을 내려받는다 → `pnpm gate` green.
      커밋: `feat(adapters): add Android strings adapter`
- [x] **T3.2b 기준 언어 코드 입력** — `BaseLocaleState`와 두 소비자(온보딩 ③ · Add sources 모달 `components/sources/add-sources-modal.tsx:195-198`)에 Android
      base 행 + 코드 입력(`manual.baseLocale` Input 재사용, `isLocaleShaped`·관측 코드 중복 거부),
      ③ 근거 경로·`naming.info`의 `basePath` 표시, 수동 지정의 `basePath` 유도, `next-enabled.ts`·`confirm.ts`, CLI의 Android `--base` 필수,
      생성 워크플로(GitHub·GitLab)의 `base-locale`, Sources "Path pattern"의 base 줄. 사전 3벌(`/translate` 모드 ①).
      M2 소스 테스트가 화면 자리로 고정한 곳(`components/onboarding/steps/base-locales.tsx` · `naming.tsx`·`new-project.tsx`의 `naming.info` ·
      `source-detail-modal.tsx`·`sources-screen.tsx`)과 표시 전용 select 둘(`lib/mcp/tools/project.ts` MCP 소스 목록 · `lib/sources/query.ts`)에 basePath를 싣는다.
      검증: 순수 판정 테스트 + `pnpm gate` green + `/runtime-test`로 ③ 입력·Add sources 입력(기존 프로젝트에 `values/`만 있는 소스 추가, 제거 후 재추가 복구)·
      Sources 표시 확인 **(수동)**. 커밋: `feat(onboarding): ask for the Android base language`
- [x] **T3.2c 기준 언어 변경 거부·언어 추가 철자** — `planBaseLocaleChange`의 `android-strings` 거부 코드 + 문구, Android 프리셋 `r` 철자 변환(레거시 표 `he→iw`·`id→in`·`yi→ji`),
      `judgeAdd`의 `r` 없는 지역 거부(웹·MCP 공통 코어). 검증: `change-plan`·`add-plan` 단위 테스트 + `pnpm gate` green.
      커밋: `feat(locales): use Android resource spelling for new languages`
- [x] **T3.3 저장 검증** — `lib/keys/save.ts` 코어에서 인라인 태그 불일치 거부(design §3.1): `KeySavePlan` 새 코드, 워크스페이스 footer Alert·셀 `aria-invalid`,
      사전 3벌, MCP 영어 응답. 검증: 순수 함수 테스트 + 코어 테스트(웹·MCP 두 껍데기) + `pnpm gate` green + `/runtime-test`로 거부 표시 확인 **(수동)**.
      커밋: `feat(translations): reject saves that break Android inline tags`
- [x] **T3.4 재측정** — 모바일 + 기존 2코퍼스, 전부 고정 SHA로 돈다(`--pins docs/adapter-survey/pins*.json` — 모바일은 `pins-mobile*.json`, 기준선은 커밋된 `docs/adapter-survey/baseline/` — 명령·비교는 그 README). 착수 전 `composeResources`(Meshtastic)를 범위에 넣을지 정한다. 검증: 기존 표 회귀 0 · 기준선과 리포별 1순위 diff 0(모바일은 그 포맷이 정답인 리포만 바뀐다) · Android 고정점 100% · 조용한 손실 0 · 정답 `basePath` 일치 ·
      `resource-limit` 거부 수 보고. 커밋 없음.
- [x] **T3.5 실물 (수동)** — `/roundtrip`. 전제: Android SDK·JDK, 폐기용 리포. 검증: 고친 셀 외 diff 0, Gradle `assembleDebug` 통과.
      ⚠️ 2026-10-19 한 머신에는 JDK·Android SDK가 없었다 — 착수 때 머신을 확인하고 설치는 사용자 승인 뒤(arb는 Flutter를 brew cask로 설치했다). 폐기용 리포는 새로 만들어
      roundtrip 전제 조건 1의 목록에 올린다(`basePath` · `values/`만 있는 언어 · `translatable="false"` · `<plurals>` · 인라인 태그를 픽스처에 심는다).

## 5. 외부 계약·문서 (세 스펙 합동 출시, 문서별 커밋)

순서는 design §8이다: 문서(T5.2~T5.4) → 기능 `/merge`(T5.6) → 새 태그(T5.1) → SHA 후속 패치(T5.7) → 폴더 정리(T5.5).

- [ ] **T5.0 출시 전 확인** — 기능 `/merge` 전에 **prod에 등록된 표면들의 리포**에 새 탐지를 읽기 전용으로 돌려 기존 `adapterName`·`pathTemplate`가 여전히
      1순위인지 확인한다(`adapter`를 박지 않은 기존 워크플로의 영구 red는 코퍼스가 아니라 실제 소비자에서 일어난다). 커밋 없음. 검증: prod 표면 1순위 불변.
- [ ] **T5.1 새 태그 발행** — 기능 `/merge`의 squash 커밋에 `malmoi-i18n-push-v4`·`malmoi-i18n-push-gitlab-v3`를 만든다. 기존 v3·gitlab-v2는 옮기지 않는다
      (OPERATIONS 절차). 커밋 없음. 검증: 폐기용 GitHub 리포 CI가 세 새 어댑터로 각각 green **(수동)**. GitLab 실물은 T5.7 뒤에 본다.
- [ ] **T5.2 `docs(PRODUCT)`** — §0 포맷 수, §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록·Android 철자·기준 언어 변경 거부.
- [ ] **T5.3 `docs(ARCHITECTURE)`** — §1.9 재측정 표·판정, Android base 예외(`basePath`), 값 표현 표(design §3), §0 불변식 3의 수술적 표면 목록에 `android-strings`.
      CLAUDE.md 코어 원칙 두 줄(수술적 치환 목록 · 언어 되살림 목록)에 `android-strings`.
      CLAUDE.md 스택 표에 `@xml-tools/parser`(읽기·offset 전용) 함정(`docs(CLAUDE)`, 미러 `pnpm sync:agents`).
- [ ] **T5.4 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록, Android `base-locale` 필수,
      인라인 태그 안내("기준 언어의 태그를 그대로 두고 그 사이 글만 번역한다").
- [ ] **T5.5 정리** — 네 스펙의 결론이 정본에 올라갔는지 확인한 뒤 `docs/features/mobile-strings/`·`arb/`·`apple-strings/`·`android-strings/`를 **함께** 삭제한다
      (서로 참조하므로 따로 지우지 않는다). 커밋: `docs(feature): remove mobile specs after promotion`
- [ ] **T5.6 기능 `/merge`** — 세 스펙이 모두 dev에 들어간 뒤 한 번. GitHub 생성기는 이미 `@malmoi-i18n-push-v4`를 가리킨다. 1단계에서 `basePath` 마이그레이션
      prod 반영(`pnpm db:deploy` + prod `has_schema_privilege` false). ⚠️ 머지 전에 사용자가 M1 모바일 판정 중 애매한 것을 검수한다
      (`docs/adapter-survey/repos.md` "모바일 코퍼스" → "검수 대기 판정").
- [ ] **T5.7 GitLab SHA 후속 패치** — T5.1 태그 커밋의 40자 SHA를 `GITLAB_CI_RELEASE`(tag `-gitlab-v3`·sha)와 ACTIONS §5 `<!-- gitlab-ci -->` 블록에 함께 넣고
      (`lib/onboarding/__tests__/gitlab-ci.test.ts`가 줄 단위 대조) `/push` → 패치 `/merge`. 검증: `pnpm gate` green, 폐기용 GitLab 프로젝트 CI가 새 어댑터로 green **(수동)**.
      커밋: `chore(release): pin the GitLab CI source to malmoi-i18n-push-gitlab-v3`
- T5 공통 검증: `pnpm test`(가이드 게이트·`no-korean-ui`) green · `pnpm sync:agents:check` green.

## 확인 필요 (착수 전)

- ~~**Q1** Android 기준 언어 경로~~ → **`basePath` 별도 필드**(2026-10-19 사용자, `/feature-review`에서 재확인, design §2.3).
- ~~**Q3** Android 값 표현~~ → **이스케이프는 풀고 자식 태그 유지, 불일치 저장 거부**(2026-10-19 사용자, design §3).
- ~~**Q4** XML 위치 토크나이저~~ → **`@xml-tools/parser`**(2026-10-19 사용자, `/feature-review`에서 `saxes` 대신, design §2.1·§7).
- ~~기준 언어 코드·변경~~ → **온보딩 ③ 입력 + CLI `--base` 필수, 변경 거부**(2026-10-19 사용자, design §2.4).
- ~~언어 추가 철자~~ → **프리셋 변환 + 서버 검증**(2026-10-19 사용자, design §2.5).
- ~~태그 검증 위치~~ → **코어에서 거부**(2026-10-19 사용자, design §3.1).
- ~~create~~ → **뼈대만 복제, 값 있는 키만**(2026-10-19 사용자, design §2).
- ~~출시 단위~~ → **세 스펙 합동, 기능 머지 한 번**(2026-10-19 사용자).
- ~~출시 순서·태그~~ → **기능 머지 → 새 태그 v4·gitlab-v3(기존 태그 미이동) → GitLab SHA 후속 패치**(2026-10-19 사용자, Codex 피어 검수, design §8).
- ~~누락 키·Add sources~~ → **비기준 파일에 삽입 · Add sources 모달에도 코드 입력**(2026-10-19 사용자, Codex 피어 검수).
