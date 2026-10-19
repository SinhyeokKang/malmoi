# android-strings — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. `<plurals>`를 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 값을 원본에서 가져오지 않는다.
- **불변식 4(결정성)**: §4.
- 출시: 모바일 세 스펙 합동 출시가 이 스펙의 T5다.

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지·기준 언어 입력 · locale-add(create) · survey. 편집 UI는 저장 검증 하나(인라인 태그, §3)가 붙는다.

## 2. 어댑터 `android-strings`

| layout | writeStrategy | 템플릿 예 | create(언어 추가) |
|---|---|---|---|
| per-locale | surgical | `app/src/main/res/values-{locale}/strings.xml` | 기준 언어 파일 복제 후 값 치환 |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 어댑터 이름에는 마이그레이션이 없다(`basePath` 컬럼은 §2.3).

### 2.1 파서

- **파서는 읽기·offset 전용, 쓰기는 문자열 치환이다.** XML 직렬화는 들여쓰기·주석·속성 따옴표·엔티티를 바꿔 고정점을 깬다(`yaml`이 CST라서
  고른 것과 같은 이유). 위치는 **`saxes`**(순수 JS SAX, 위치 제공, 빌드 스크립트 없음)가 준다(결정 2026-10-19 사용자). exact 고정하고
  CLAUDE.md 스택 표에 "읽기·offset 전용, 직렬화에 쓰지 않는다"를 함정으로 남긴다. ⚠️ SAX의 offset 단위(UTF-16 코드 유닛인지)를 T3.0에서 실측한다.
- 엔트리: `<resources>` 직속 `<string name="…">`만. `translatable="false"`는 엔트리가 아니고 보존된다. `<plurals>`·`<string-array>`·`<item>`은
  읽지 않고 보존된다(unmanaged 보고 — 다음 Publish에서 살아남으므로 `partial-import`가 아니다, `ERROR_KIND` 규칙).

### 2.2 로케일 코드

- 디렉터리 그대로(`ko`·`zh-rCN`) — "파일명이 코드의 진실" 규칙(`types.ts`)을 지킨다. `b+…`는 후보에서 뺀다.
- `zh-rCN`의 표시 이름·텍스트 방향(`text-direction.ts`)은 `r` 접두 지역을 풀어 읽는 순수 함수가 필요하다 — 저장 코드는 바꾸지 않는다.

### 2.3 기준 언어 경로 — `basePath` 컬럼

기준 언어 파일은 `values/strings.xml`이라 `{locale}` 치환으로 표현되지 않는다. `pathTemplate.replaceAll("{locale}", code)`가 `lib/` 비테스트
소스 **22줄**에 흩어져 있다(2026-10-19 grep `replace(All)?("{locale}"`).

- **(결정 2026-10-19 사용자, `/feature-review`에서 재확인) Android base만 별도 필드** — `DetectedFormat.basePath`(탐지가 관측한 base 파일 경로, 예
  `app/src/main/res/values/strings.xml`)와 additive 컬럼 `TranslationSurface.basePath String?`. 다른 어댑터는 항상 null이다.
  기존 22줄의 `{locale}` 치환은 그대로 두고, **base 로케일 경로가 들어가는 자리를** `basePath ?? 치환`으로 분기한다.
- ⚠️ 22줄 대부분은 "모든 로케일" 루프이고 그 안에 기준 언어가 들어 있다 — 기준 언어 전용 자리만 고치면 빠진다. 분기가 필요한 자리는
  리뷰(2026-10-19 CTO)가 찾은 아래 목록이고, T3.0a가 grep으로 확정해 소스 테스트가 센다(**basePath 표면에서 base 경로를 치환으로 만드는 자리가
  남으면 red**). 하나라도 빠지면 기준 경로가 `values-en/strings.xml`로 계산된다 — import는 `base-locale-missing`, Publish 미리보기는
  `PreviewBaseFileMissing`, 최악은 Publish가 없던 `values-en/`에 새 파일을 만든다.
  - **읽는 자리(경로 계산)**: `resolveLocalePaths`(`lib/pull/plan.ts:143` — 호출자 6곳 + Publish 미리보기 `lib/publish/read.ts:94`) ·
    `selectLocaleFiles`(`lib/push/payload.ts:45`) · `templatePaths`·`localeOfTemplatePath`(`lib/onboarding/confirm.ts:22-49` — 기대는 쪽
    `lib/import/surface.ts:33`·`lib/import/locales.ts:18`·`lib/onboarding-run/add.ts:86`·`lib/import/empty.ts`) · `probeTargets`(`lib/onboarding/detect.ts:48`) ·
    `verifySamples`(`lib/adapters/shared.ts:365`) · `loadCandidateSample`(`app/(edit)/projects/actions.ts:535`) · `lib/projects/remote-plan.ts:39`(빠지면
    가장 흔한 변경인 `values/strings.xml` 편집이 0으로 집계된다) · `foreignPaths`·`surfacePaths`(`lib/pull/locales.ts:80`·`lib/locales/change.ts:138` —
    빠지면 다중 표면 겹침을 놓친다) · `observeLocaleFiles`(`lib/pull/locales.ts:241`) · `scripts/ingest.ts:122` · survey 다섯 줄(`lib/survey/one.ts:438` 등) ·
    화면 `components/onboarding/steps/base-locales.tsx:171`(③ 근거 경로 표시).
  - **쓰는 자리(컬럼 기록)**: `applyPush`(`lib/push/apply.ts:465`) · 소스 추가(`lib/surfaces/create.ts:100-114`) · 온보딩 생성(`lib/onboarding-run/create.ts:306`) ·
    제거된 소스 재추가 첫 적재(§5.9) — POSTMORTEM 2026-09-15(쓰는 자리를 전수로 안 셌다).
  - **지문·대조에 드는 자리**: `lib/locales/fingerprint.ts:36` · `lib/publish/fingerprint.ts:43` · `lib/protection/fingerprint.ts:55` ·
    `lib/translations/context.ts:44` · 야간 CAS(`lib/nightly/run.ts:183-187`) · 온보딩 서명(`lib/onboarding/sample-confirmation.ts:11`) ·
    `lib/mcp/confirm.ts:41` · `plan-revival`(`lib/surfaces/plan-revival.ts:16`)의 일치 판정.
- 외부 계약: CLI가 리포에서 다시 탐지하므로 `basePath`도 CLI 탐지가 내고 `checkFormat` 비교 항목에 든다 — 등록된 값과 다르면
  `format mismatch`(경로 이전과 같은 취급). action 입력은 늘리지 않는다(`path-template`만으로 후보를 고르고 basePath는 그 후보에 딸려 온다).
  ⚠️ 옛 CLI가 `basePath` 없이 보낸 페이로드가 기존 4포맷 표면에서 `format mismatch`가 되지 않아야 한다(null 대 undefined).
- 경로 안전: `basePath`에도 `isPathSafeRepoPath`를 push 스키마·`resolveLocalePaths` 두 경계에서 건다(POSTMORTEM 2026-09-09).
- 마이그레이션: nullable 컬럼 추가 하나라 버전을 건너뛴 업그레이드에서도 안전하다(SELF-HOSTING §3). `/db`가 dev → `/merge` 1단계가 prod.
- (기각) 22줄을 `localePath` 하나로 모으기 — 분기가 한 곳이지만 이관 범위가 넓다(사용자 선택).
- (기각) `values-{locale}` → `values` 유도로 컬럼 없애기 — 리뷰 제안, 사용자가 컬럼 유지를 골랐다(2026-10-19).
- (기각) 디렉터리 이름 전체를 로케일 코드로(`values-ko`) — `isLocaleShaped`(`lib/locale-code.ts`)가 거부한다. 보안 경계를 풀어야 한다.
- (기각) `values{locale}` + 코드 `-ko`·`""` — 빈 코드가 `isPathSafeLocale`에 걸린다.

### 2.4 기준 언어 코드

`values/`에는 코드가 없다. 지금 온보딩 ③은 탐지된 로케일 안에서만 고르고(`components/onboarding/new-project.tsx:175-176`,
`lib/onboarding/confirm.ts`의 `base-locale-missing`), `updateBaseLocale`은 프로젝트 생성 뒤의 Action이라 이 코드를 받을 길이 없다.

- **(결정 2026-10-19 사용자) 온보딩 ③에서 코드를 입력받는다.** Android 소스가 있으면 ③ 라디오 목록 맨 위에 "base 파일 행 + 코드 입력"을 둔다.
  수동 지정 폼의 `manual.baseLocale` Input을 재사용한다. 서버 검증은 `isLocaleShaped`이고, 관측된 다른 로케일과 겹치면 거부한다.
  `next-enabled.ts`·`confirm.ts`가 따라 바뀐다.
- **CLI는 Android 표면에서 `--base`가 없으면 거부한다** — 지금은 `pickBaseLocale`(`lib/push/assemble.ts:50`, en 우선)이 `values/`의 실제 언어와
  무관한 코드를 고를 수 있다. 생성 워크플로(`renderProjectWorkflowYaml`·`renderProjectGitlabCiYaml`)가 `base-locale`을 박는다.

### 2.5 언어 추가의 코드 철자

추가 Dialog 프리셋은 `pt-BR`·`zh-CN` 꼴이고(`lib/locales/presets.ts:10-12`) 서버는 `looksLikeLocale`만 본다(`lib/locales/add-plan.ts:62`). 그대로면
`values-pt-BR/`이 PR로 나가는데 Android 리소스 시스템은 `pt-rBR`만 인식해 번역이 조용히 반영되지 않는다.

- **(결정 2026-10-19 사용자) 프리셋 변환 + 서버 검증** — chrome의 `isChromeLocaleCode`(add-plan.ts:63) 분기처럼 Android 분기를 둔다. 프리셋을
  `pt-rBR`·`zh-rCN` 철자로 바꿔 보여 주고, `judgeAdd`가 `r` 없는 `-지역` 자유 입력을 거부한다. 웹 Action과 MCP `add_locale`이 같은 코어를 지나므로 한 곳이다.

## 3. 값의 표현

| 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|
| `<string>` 안쪽 | `\'`·`\"`·`\n`·`\@`·`\?`·`&amp;`·`&lt;`를 **푼** 문자열. 자식 태그(`<xliff:g>`·`<b>`)는 **태그 문자열 그대로** | 자식 태그가 원문(base)과 같은 집합인지·잘 닫혔는지 — 깨지면 저장 거부 |

- 추천 근거: 비개발자에게 `Don\'t`를 보여 주지 않는다. 태그는 풀 방법이 없으므로 그대로 두되 깨뜨리는 저장을 막는다.
- 인코더: 값 → 파일 표기. `'`·`"`는 백슬래시, 선행 `@`·`?`는 백슬래시, `&`·`<`(태그 밖)는 엔티티. **원본이 따옴표로 감싼 값
  (`"…"`)이었으면 그 형을 유지한다.** `formatted="false"`는 값 표현에 영향이 없다(속성 보존만).
- **결정 2026-10-19 사용자** — 위 표 그대로(이스케이프는 풀고 자식 태그는 유지, 태그 불일치 저장 거부).

### 3.1 화면 영향

새 프리미티브·토큰 없이 기존 조립으로 끝난다(design-brief 없음).

- 온보딩 ③ 기준 언어 코드 입력(§2.4) — 문구는 사전 3벌.
- ③ 근거 경로 표시(`base-locales.tsx:171`)가 base 행에서 `basePath`를 보여 준다(§2.3 읽는 자리).
- 언어 추가 Dialog의 Android 프리셋 철자(§2.5).
- 인라인 태그 불일치 저장 거부(§3).

## 4. 결정성

- surgical: 값 범위 밖 바이트를 건드리지 않는다. 인접한 두 범위 치환이 같은 위치를 두 번 쓰지 않는다
  (**POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄**). 치환은 뒤에서 앞으로 한다.
- 인코더는 순수 함수이고 **decode(encode(v)) === v** 와 **encode(decode(원본 리터럴)) === 원본 리터럴(정규형일 때)** 을 속성 테스트로 고정한다.
  원본이 비정규형이면 그 셀이 **바뀌었을 때만** 다시 쓴다 — 안 바뀐 셀은 원본 바이트 그대로다.

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`res/values-`)이 겹치지 않아 기존 리포의 1순위를
  뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 재측정으로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다. probe는 내용 검증(`<resources>` 루트)에만 쓴다.
- `.github/`·`build/`는 곁가지(`aside`)다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `baseFilePath(format, baseLocale)` | `lib/adapters/shared.ts` 인근 | `basePath ?? 치환` — base 경로가 들어가는 자리 전용 |
| `tokenizeAndroid` / `decodeAndroidValue` / `encodeAndroidValue` | `lib/adapters/android-strings.ts` | 범위·왕복·태그 보존·따옴표 형 유지 |
| `androidInlineTagsMatch(base, value)` | 같은 파일 | 저장 검증(§3) |
| `androidLocaleDisplay(code)` | `lib/i18n/locales.ts` 인근 | `zh-rCN` → `zh-CN` 해석(표시·방향 전용) |
| Android 프리셋 철자·코드 판정 | `lib/locales/presets.ts`·`add-plan.ts` | `pt-BR` → `pt-rBR`, `r` 없는 지역 거부(§2.5) |
| `detectCandidates` | 어댑터 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

- 스키마: **additive 하나** — `TranslationSurface.basePath String?`(Android만 채운다).
- 환경변수: 없음.
- 패키지: **`saxes` 하나** → SELF-HOSTING §3 체크리스트, `pnpm-workspace.yaml`의 `minimumReleaseAge`(24시간 지난 버전)·
  `onlyBuiltDependencies`(빌드 스크립트가 없으므로 목록에 넣지 않는다). 버전은 명시해 깐다.

## 8. 외부 계약 (세 스펙 합동)

- action `malmoi-i18n-push`는 자기 체크아웃의 CLI를 돈다(`github.action_path`) — 세 스펙의 새 어댑터를 CI가 쓰려면 **action 태그 릴리스**가 필요하다.
  릴리스는 **한 번**이다(결정 2026-10-19 사용자). `@malmoi-i18n-push-v3`을 옮길지 v4를 낼지 — 기존 소비자의 1순위 불변(완료 조건 3)이 확인되면
  v3 이동이 가능하다. GitLab CI 원본 태그 `malmoi-i18n-push-gitlab-vN`도 같은 축. 절차는 OPERATIONS.
- `docs/ACTIONS.md`의 `adapter`·`base-locale` 입력 설명.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 `strings.xml`(base 포함)을 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-09 검증이 탐지 경로에만 있었다 — 경로 안전 판정(`isLocaleShaped`·`isPathSafeRepoPath`)을 `basePath`에도 건다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로가 어댑터 이름과 `base-locale`을 박는지.
- 2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 셌다 — §2.3 쓰는 자리 목록.
- 2026-09-16 YAML range 치환 — §4.
- 2026-10-03 단일 언어 탐지가 조상 승격으로 설정 파일을 앞세움 — `values/`만 있는 단일 언어 리포에서 같은 판정을 본다.
