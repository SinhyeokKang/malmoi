# android-strings — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. `<plurals>`를 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 값을 원본에서 가져오지 않는다.
- **불변식 3**: 수술적 표면의 비울 수 없음(`cannot-clear`) 목록에 든다(tasks T5.3).
- **불변식 4(결정성)**: §4.
- 출시: 모바일 세 스펙 합동 출시가 이 스펙의 T5다.

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지·기준 언어 입력 · locale-add(create·철자) · 기준 언어 변경 거부 · survey ·
번역 저장 코어(인라인 태그 검증 — 웹·MCP 공통, §3).

## 2. 어댑터 `android-strings`

| layout | writeStrategy | 템플릿 예 | 새 언어 파일(create) |
|---|---|---|---|
| per-locale | surgical | `app/src/main/res/values-{locale}/strings.xml` | 기준 파일의 **뼈대만**(XML 선언·`<resources>` 루트와 네임스페이스 속성) + 값 있는 활성 키만 |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 어댑터 이름에는 마이그레이션이 없다(`basePath` 컬럼은 §2.3).

### 2.1 파서

- **파서는 읽기·offset 전용, 쓰기는 문자열 치환이다.** XML 직렬화는 들여쓰기·주석·속성 따옴표·엔티티를 바꿔 고정점을 깬다(`yaml`이 CST라서
  고른 것과 같은 이유). 선례 둘(Weblate lxml·Tolgee DOM)이 모두 다시 직렬화해 빈 줄·들여쓰기·떠 있는 주석을 잃는다.
- 위치는 **`@xml-tools/parser`**(SAP, `@prettier/plugin-xml`의 파서)가 준다(결정 2026-10-19 사용자, `/feature-review`에서 `saxes` 대신). CST의 모든 노드
  (요소·내용·주석·CDATA·속성)에 `startOffset`·`endOffset`이 있어 `<string>`의 **안쪽 내용 범위**를 바로 얻는다 — SAX는 이벤트 뒤 위치만 줘서 닫는 태그
  시작을 역산해야 했다. 의존성 `chevrotain` 하나가 딸려 온다. exact 고정하고 CLAUDE.md 스택 표에 "읽기·offset 전용, 직렬화에 쓰지 않는다"를 함정으로
  남긴다. ⚠️ offset이 JS 문자열 인덱스인지·CRLF·BOM에서 어긋나지 않는지를 T3.0d에서 실측해 T3.1 테스트로 옮긴다.
- 엔트리: `<resources>` 직속 `<string name="…">`만. `translatable="false"`는 엔트리가 아니고 보존된다. `<plurals>`·`<string-array>`·`<item>`은
  읽지 않고 보존된다(unmanaged 보고 — 다음 Publish에서 살아남으므로 `partial-import`가 아니다, `ERROR_KIND` 규칙). 주석 안의 `<string>`은 엔트리가 아니다.
  `tools:` 네임스페이스 속성은 보존만 한다. self-closing `<string name="x"/>`는 빈 값 엔트리다. 빈 `<resources/>`는 0엔트리다.
- 중복 `name`은 aapt 오류다 — read가 `duplicate-key` failure로 거부한다. 키 대입은 `Object.create(null)`(`name="__proto__"`).
- **비기준 파일의 누락 키는 삽입한다**(결정 2026-10-19 사용자, Codex 피어 검수). create는 값 있는 키만 쓰므로 언어 파일을 만든 뒤 다른 키를 번역하면
  그 파일에 자리가 없고, per-locale `write-slot-missing`이 blocking이라(`lib/pull/undeliverable.ts:31`) Publish 전체가 거부된다. 그래서 비기준 `values-*/strings.xml`에서는
  기준 파일의 키 순서상 바로 앞 키의 `<string>` 뒤(없으면 `</resources>` 앞)에 `<string name="…">…</string>`을 삽입하고, 들여쓰기·줄바꿈은 이웃 엔트리에서
  빌린다. **기준 파일(`basePath`)에는 삽입하지 않는다.** 삽입도 뒤→앞 적용에 든다(§4).

### 2.2 로케일 코드

- 디렉터리 그대로(`ko`·`zh-rCN`·`iw`) — "파일명이 코드의 진실" 규칙(`types.ts`)을 지킨다. `b+…`와 지역 외 한정자(`values-night`·`values-car`·
  `values-en-rGB-v21`)는 후보에서 뺀다 — `isLocaleShaped`가 이들을 통과시키므로 탐지(`hasStrongLocale`·`detectCandidatesAcross`)에서 거른다.
- 표시: `languageName`·`flagFor`가 `zh-rCN`에 RangeError·null을 낸다. **어댑터를 묻지 않는 범용 정규화(`-r` 지역만 푼다)를 그 두 함수 안에** 넣는다 —
  어느 어댑터의 코드인지 모르는 소비자(`base-locales.tsx:116·162`, `add-locale-dialog.tsx:69`, `lib/events/view.ts:433`, `LocaleFlag`)가 한 번에 따라온다.
  텍스트 방향(`text-direction.ts`)도 같은 정규화를 지난다(`iw`는 이미 있다). 저장 코드는 바꾸지 않는다.

### 2.3 기준 언어 경로 — `basePath` 컬럼

사전 작업 스펙 **mobile-strings** design §2가 정본이다(컬럼·읽는 자리·쓰는 자리·지문 자리·외부 계약·경로 안전·마이그레이션). 이 스펙은 그 위에서
Android 어댑터가 `DetectedFormat.basePath`를 채우고, 언어 제거·화면 표시가 그 값을 쓴다.

### 2.4 기준 언어 코드

`values/`에는 코드가 없다. 지금 온보딩 ③은 탐지된 로케일 안에서만 고르고(`components/onboarding/new-project.tsx:175-176`,
`lib/onboarding/confirm.ts`의 `base-locale-missing`), `updateBaseLocale`은 프로젝트 생성 뒤의 Action이라 이 코드를 받을 길이 없다.
선례: Weblate는 컴포넌트 설정 "Source language", Tolgee는 `unknown`으로 둔 뒤 사용자가 고른다. 둘 다 `tools:locale`을 읽지 않는다.

- **(결정 2026-10-19 사용자) 온보딩 ③에서 코드를 입력받는다.** Android 소스가 있으면 ③ 라디오 목록 맨 위에 "base 파일 행 + 코드 입력"을 둔다.
  수동 지정 폼의 `manual.baseLocale` Input을 재사용한다. 서버 검증은 `isLocaleShaped`이고, 관측된 다른 로케일과 겹치면 거부한다.
  `next-enabled.ts:46`·`confirm.ts`가 따라 바뀐다. 수동 지정에서는 `values-{locale}` → `values` 관례로 서버가 `basePath`를 유도하고 입력란은 늘리지 않는다.
- **기존 프로젝트의 소스 추가에도 같은 입력을 둔다**(Codex 피어 검수, 2026-10-19 사용자). Add sources 모달은 공통 `SurfaceBaseLocales`에 adapter·`basePath` 없이
  `pathTemplate`·`locales`·`baseLocale`만 넘긴다(`components/sources/add-sources-modal.tsx:195-198`). 그대로면 `values/`만 있는 소스를 기존 프로젝트에 추가할 길이
  없고, 아래 "잘못 넣으면 제거 후 재추가" 복구도 같은 모달을 지난다. `BaseLocaleState`와 두 소비자(온보딩 ③·Add sources)에 같은 Android 분기를 배선한다.
- **단일 언어 리포**(`values/`만 있다)도 후보로 낸다 — v1.1.8부터 다른 포맷은 단일 언어 카탈로그를 받는다. 코드는 같은 ③ 입력으로 받는다.
  조상 승격이 설정 파일을 앞세우지 않는지 본다(POSTMORTEM 2026-10-03).
- **CLI는 Android 표면에서 `--base`가 없으면 거부한다** — 지금은 `pickBaseLocale`(`lib/push/assemble.ts:50`, en 우선)이 `values/`의 실제 언어와
  무관한 코드를 고를 수 있다. 생성 워크플로(`renderProjectWorkflowYaml`·`renderProjectGitlabCiYaml`)가 `base-locale`을 박는다.
- **기준 언어 변경은 거부한다**(결정 2026-10-19 사용자) — `basePath`는 항상 기준 언어 코드에 매핑되므로, en→ko로 바꾸면 ko 값이 `values/`에 쓰이고 en은
  없던 `values-en/`으로 간다. `values/`의 언어는 리포가 정한다. `planBaseLocaleChange`가 `android-strings`면 거부 코드를 돌려준다. 온보딩에서 코드를
  잘못 넣었으면 소스를 제거하고 다시 추가한다.

### 2.5 언어 추가의 코드 철자

추가 Dialog 프리셋은 `pt-BR`·`zh-CN` 꼴이고(`lib/locales/presets.ts:10-12`) 서버는 `looksLikeLocale`만 본다(`lib/locales/add-plan.ts:62`). 그대로면
`values-pt-BR/`이 PR로 나가는데 Android 리소스 시스템은 `pt-rBR`만 인식해 번역이 조용히 반영되지 않는다.

- **(결정 2026-10-19 사용자) 프리셋 변환 + 서버 검증** — chrome의 `isChromeLocaleCode`(add-plan.ts:63) 분기처럼 Android 분기를 둔다. 프리셋을
  `pt-rBR`·`zh-rCN` 철자로 바꿔 보여 주고, `judgeAdd`가 `r` 없는 `-지역` 자유 입력을 거부한다. 웹 Action과 MCP `add_locale`이 같은 코어를 지나므로 한 곳이다.
- 레거시 코드 예외 표(Weblate `ANDROID_CODES` 선례): `he → iw` · `id → in` · `yi → ji`. 프리셋 변환이 이 표를 먼저 적용한다.

## 3. 값의 표현

| 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|
| `<string>` 안쪽 | 런타임 규칙대로 **푼** 문자열(`\'`·`\"`·`\n`·`\t`·`\@`·`\?`·`\uXXXX`·엔티티, 따옴표 밖 연속 공백 접기). 자식 태그(`<xliff:g>`·`<b>`)는 **태그 문자열 그대로** | 자식 태그가 원문(base)과 같은 집합인지·잘 닫혔는지 — 깨지면 저장 거부 |

- 추천 근거: 비개발자에게 `Don\'t`를 보여 주지 않는다. 태그는 풀 방법이 없으므로 그대로 두되 깨뜨리는 저장을 막는다.
- 인코더: 값 → 파일 표기. `'`·`"`는 백슬래시, 선행 `@`·`?`만 백슬래시(중간 글자는 이스케이프하지 않는다 — translate-toolkit #5064), `&`·`<`(태그 밖)는 엔티티,
  개행은 `\n`. **앞뒤 공백이 있거나 공백이 둘 이상 이어지면 값 전체를 `"…"`로 감싼다**(Weblate 규칙 — 안 그러면 aapt가 접어 재적재 때 값이 달라지는
  조용한 손실이 된다). **원본이 따옴표로 감싼 값이었으면 그 형을 유지한다.** CDATA 원본은 CDATA로 둔다. `%%`·`formatted="false"`는 값 표현에 영향이 없다.
- 이스케이프 안 된 `'`가 있는 원본(aapt 오류 원본)은 읽되 그 셀이 바뀔 때만 정규형으로 다시 쓴다(§4).
- **결정 2026-10-19 사용자** — 위 표 그대로(이스케이프는 풀고 자식 태그는 유지, 태그 불일치 저장 거부).

### 3.1 인라인 태그 검증 (결정 2026-10-19 사용자 — 코어에서 거부)

- 판정 `androidInlineTagsMatch(base, value)`는 저장 코어 `lib/keys/save.ts`의 `planClearability`(:73 인근) 옆에 둔다 — 웹 저장 Action과 MCP
  `set_translations`(`lib/mcp/batch.ts`·`lib/mcp/tools/translations.ts`)가 같은 코어를 지나 함께 막힌다. 선례: Weblate는 `xml-tags` 검사로 경고만 하고,
  Tolgee는 `<xliff:g>`를 텍스트로 바꿔 태그를 잃는다.
- 기준 언어 셀 자체의 저장은 검증하지 않는다(비교 기준이 그 셀이다).
- push로 기준 언어의 태그가 바뀌어 기존 번역이 불일치가 된 경우: Publish를 막지 않고 그대로 낸다(병합·보류 없음). 그 셀을 다음에 저장할 때 거부된다.
- 화면: 새 코드(예: `inline-tags-mismatch`, `localeCodes` 포함)를 `KeySavePlan` union에 더한다 — 지금 `workspace.tsx:593-610`은 모르는 코드를 `save-failed`로
  뭉갠다. footer `ALERTS`(`workspace.tsx:1229-1262`)에 `danger` 행, `cannot-clear`처럼 해당 셀에 `invalid={{locales, describedBy}}`(`workspace.tsx:1120`)로
  `aria-invalid`·`aria-describedby`. 제목은 `cannotClear.title(locales)`처럼 언어 이름을 받는 형, 본문은 "기준 언어의 태그를 그대로 두고 그 사이 글만
  번역한다". 사전 3벌 `translations.workspace.footer.*`. MCP 응답은 영어 고정 문구.

### 3.2 화면 영향

새 프리미티브·토큰 없이 기존 조립으로 끝난다(design-brief 없음). 태그 하이라이트는 비목표다(§4.1 mono 예외·`surface-rules.test.ts`가 막는다).

- 온보딩 ③과 Add sources 모달의 기준 언어 코드 입력(§2.4) · ③ 근거 경로와 `naming.info`가 base 행에서 `basePath`를 보여 준다.
- Sources "Path pattern"에 `basePath`가 있으면 base 파일 줄을 하나 더 둔다. `surface-selector.tsx:20-26` `surfaceLabel`이 Android 소스 둘(`app`·`feature`)을
  같은 라벨로 접지 않는지 본다.
- 언어 추가 Dialog의 Android 프리셋 철자(§2.5) · 언어 이름·국기의 `-r` 정규화(§2.2).
- 인라인 태그 불일치 저장 거부(§3.1). 기준 언어 변경 거부 문구(§2.4).
- 포맷 라벨은 기존 형("… file")을 따르고 내부 이름을 내지 않는다. 문구는 모두 사전 3벌(`/translate` 모드 ①).

## 4. 결정성

- surgical: 값 범위 밖 바이트를 건드리지 않는다. 인접한 두 범위 치환이 같은 위치를 두 번 쓰지 않는다
  (**POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄**). 치환은 뒤에서 앞으로 한다.
- 인코더는 순수 함수이고 **decode(encode(v)) === v** 와 **encode(decode(원본 리터럴)) === 원본 리터럴(정규형일 때)** 을 속성 테스트로 고정한다.
  원본이 비정규형이면 그 셀이 **바뀌었을 때만** 다시 쓴다 — 안 바뀐 셀은 원본 바이트 그대로다.
- 빈 값은 불변식 3의 수술적 규칙을 따른다(`planClearability`). CRLF 원본은 CRLF로, 퇴화 출력(`<resources/>`)은 다음 read·write의 입력으로 왕복한다.

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`res/values-`)이 겹치지 않아 기존 리포의 1순위를
  뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 기준선 대조로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다. probe는 내용 검증(`<resources>` 루트)에만 쓴다.
- 멀티 모듈(`app/`·`feature/*/`)은 모듈마다 후보이고, 다중 표면으로 등록하면 `basePath` 간 `path-conflict`를 본다. flavor(`src/debug/res`)·라이브러리 모듈의
  순위를 진입점 테스트로 고정한다. 모듈 수가 많으면 첫 적재 예산(`resource-limit`)에 먼저 닿는다(POSTMORTEM 2026-10-07).
- `.github/`·`build/`는 곁가지(`aside`)다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `baseFilePath` | mobile-strings M2 | 이 스펙은 소비만 한다 |
| `tokenizeAndroid` / `decodeAndroidValue` / `encodeAndroidValue` | `lib/adapters/android-strings.ts` | 범위·왕복·태그 보존·따옴표 형 유지·공백 규칙 |
| `androidInlineTagsMatch(base, value)` | 같은 파일(판정) + `lib/keys/save.ts`(호출) | 저장 검증(§3.1) |
| `-r` 지역 정규화 | `languageName`·`flagFor` 안 | `zh-rCN` → `zh-CN` 해석(표시·방향 전용) |
| Android 프리셋 철자·코드 판정 | `lib/locales/presets.ts`·`add-plan.ts` | `pt-BR` → `pt-rBR`, 레거시 표, `r` 없는 지역 거부(§2.5) |
| 기준 언어 변경 거부 | `planBaseLocaleChange` | `android-strings`면 거부 코드 |
| `detectCandidates` | 어댑터 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

- 스키마: 없음 — `TranslationSurface.basePath`는 mobile-strings M2가 더한다(이 어댑터만 채운다).
- 환경변수: 없음.
- 패키지: **`@xml-tools/parser` 하나**(+ 전이 `chevrotain`) → SELF-HOSTING §3 체크리스트, `pnpm-workspace.yaml`의 `minimumReleaseAge`(24시간 지난 버전)·
  `onlyBuiltDependencies`(빌드 스크립트가 없으면 목록에 넣지 않는다 — 설치 전에 둘 다 확인). 버전은 명시해 exact로 깐다.

## 8. 외부 계약 (세 스펙 합동)

- action `malmoi-i18n-push`는 자기 체크아웃의 CLI를 돈다(`github.action_path`) — 세 스펙의 새 어댑터를 CI가 쓰려면 **action 태그 릴리스**가 필요하다.
- **순서(결정 2026-10-19 사용자, Codex 피어 검수)**: GitLab 생성 job은 태그 clone의 HEAD를 박힌 40자 SHA와 대조하고(`lib/onboarding/gitlab-ci.ts:15-18·66-74`),
  SHA는 태그 커밋 자신에 들어갈 수 없어 "main 머지 → 태그 → SHA 후속 커밋 → 다음 앱 릴리스"가 구조적으로 필요하다(OPERATIONS "GitLab CI 원본 릴리스" 1~3).
  그래서 "머지 한 번"은 **기능 머지 한 번**이다.
  1. 세 스펙이 dev에 다 들어간 뒤 기능 `/merge`. GitHub 생성기(`renderProjectWorkflowYaml`)는 이 머지에서 미리 `@malmoi-i18n-push-v4`를 가리킨다
     (태그 발행까지 수 분 공백 — 그 사이 새로 생성한 워크플로는 태그가 없어 실패할 수 있다).
  2. 그 squash 커밋에 **새 태그** `malmoi-i18n-push-v4`·`malmoi-i18n-push-gitlab-v3`를 발행한다. **기존 v3·gitlab-v2는 옮기지 않는다** — GitLab은 옮기는 순간
     옛 SHA를 박은 기존 job이 전부 red이고(OPERATIONS 3항), GitHub은 기존 소비자가 곧바로 새 코드를 받는다. 새 어댑터는 새 소비자만 필요하다.
  3. 후속 커밋 하나로 `GITLAB_CI_RELEASE`(tag·sha)와 ACTIONS §5 `<!-- gitlab-ci -->` 블록을 함께 갱신 → 패치 `/merge`. 이 릴리스가 나가야 GitLab 화면이 템플릿을 낸다.
- `docs/ACTIONS.md`의 `adapter`·`base-locale` 입력 설명(Android는 `base-locale` 필수).

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 `strings.xml`(base 포함)을 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-02 순위 픽스가 자기 단위 테스트만 통과 — 한정자 오탐·멀티 모듈을 진입점에서 단언한다.
- 2026-09-09 검증이 탐지 경로에만 있었다 — 경로 안전 판정(`isLocaleShaped`·`isPathSafeRepoPath`)을 `basePath`에도 건다.
- 2026-09-13 샘플 검증 테스트가 실제 트리에 없는 경로만 공격 — 온보딩 샘플 확인이 base 파일을 `templatePaths` 밖으로 떨어뜨리지 않는지.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로가 어댑터 이름과 `base-locale`을 박는지. 다중 선택 화면이 첫 경로만 들었다 — `naming.info`.
- 2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셌다 — §2.3 쓰는 자리 목록.
- 2026-09-16 YAML range 치환 — §4.
- 2026-10-03 단일 언어 탐지가 조상 승격으로 설정 파일을 앞세움 — §2.4 단일 언어 리포.
- 2026-10-07 소스별 파일 예산 — §5 멀티 모듈.
