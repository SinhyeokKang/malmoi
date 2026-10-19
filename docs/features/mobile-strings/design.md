# mobile-strings — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. 이 기능은 복수형을 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
  ARB의 ICU 문자열을 통짜 문자열로 다루는 것은 i18next `{{name}}`을 raw로 보여 주는 지금의 관행과 같다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T-doc).
- **불변식 1·2(병합 없음)**: 세 어댑터 모두 값을 원본에서 가져오지 않는다. ARB `@key` 메타데이터를 원본에서 나르는 것은 **값이 아니라 소스 키
  메타데이터**이고 소유자가 코드다(§2.1) — B3.4 "원본에만 있는 키는 원본 엔트리 그대로"와 같은 형이라 견줘 고르는 코드가 없다.
- **불변식 4(결정성)**: §4.

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지 · locale-add(create) · survey. 편집 UI는 저장 검증 하나(Android 인라인 태그, §3)만 붙는다.

## 2. 어댑터 셋 (+ 넷째)

| 어댑터 | layout | writeStrategy | 템플릿 예 | create(언어 추가) |
|---|---|---|---|---|
| `arb-catalog` | per-locale | regenerate | `lib/l10n/app_{locale}.arb` | 기준 언어 파일 표현 + `@@locale` |
| `apple-strings` | per-locale | surgical | `ios/App/{locale}.lproj/Localizable.strings` | 기준 언어 파일 복제 후 값 치환 |
| `android-strings` | per-locale | surgical | `app/src/main/res/values-{locale}/strings.xml` | 기준 언어 파일 복제 후 값 치환 |
| `apple-xcstrings` (마지막 배치) | multi-locale | surgical(JSON offset) | `ios/App/Localizable.xcstrings` | 비지원 — ts-dict와 같다 |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 **마이그레이션이 없다.** `ADAPTERS` 배열·`z.enum(ADAPTER_NAMES)`·
사전의 어댑터 라벨 `Record`가 typecheck로 따라온다.

### 2.1 ARB

- read: 최상위 `"key": "string"`만 엔트리다. `@@`로 시작하는 전역 항목(`@@locale`·`@@last_modified`·`@@x-*`)과 `@key` 객체는 엔트리가 아니다.
- write(regenerate): 엔트리 순서는 `LocaleEntry.order`(§1.1). **`@key`는 같은 로케일 원본 파일에서 그 키 바로 뒤 자리로 그대로 나른다**
  (원본에 없으면 안 쓴다). 원본의 `@@*`도 원본 위치(대개 맨 앞)를 지킨다. `@@locale` 값은 경로의 로케일 코드로 **생성**한다 — 원본 값과
  견주지 않는다(복제된 새 파일이 기준 언어 코드를 들고 나가는 것을 막는다).
- 표현: `json-style.ts` 재사용(들여쓰기·이스케이프·끝 개행).
- 탐지 보조: 리포 루트 `l10n.yaml`의 `arb-dir`·`template-arb-file`이 있으면 경로·기준 언어 후보를 그것으로 좁힌다. 없으면 경로 신호만.
- ⚠️ chrome `placeholders`는 DB에 넣었다(POSTMORTEM 2026-09-24 — Prisma JSON null). ARB `@key`는 넣지 않는 이유: 번역자가 로케일별로 고치는
  내용이 아니라 개발자가 템플릿에 쓰는 소스 키 메타데이터다(**결정 2026-10-19 사용자 — 원본에서 나른다, 스키마 0**). 대가: 새로 만든 언어 파일
  (create)에는 `@key`가 없다 — gen-l10n은 템플릿의 메타만 읽으므로 동작에 영향이 없다.

### 2.2 Apple `.strings`

- 문법: `/* … */`·`//` 주석, `"key" = "value";`. 따옴표 없는 키(ASCII 식별자)도 받는다. 이스케이프 `\" \\ \n \t \r \UXXXX`.
- read: 토크나이저(순수 함수, 의존성 없음)가 엔트리마다 **값 리터럴의 바이트 범위**를 낸다. 값은 이스케이프를 풀어 저장한다.
- write(surgical): 값 범위만 다시 이스케이프한 리터럴로 치환한다. 원본에 없는 키는 쓰지 않는다(기존 수술적 어댑터와 같다 — `write-slot-missing`).
- 인코딩: **UTF-8과 UTF-16(LE·BE, BOM 유무)을 지원한다**(결정 2026-10-19 사용자). 원본 인코딩·BOM을 그대로 돌려쓴다 — 아래 §2.4.
- `.stringsdict`는 읽지 않는다(복수형 비범위). 같은 `.lproj`의 다른 테이블은 각자 소스다.
- `Base.lproj`는 로케일 코드가 아니다 — Localizable.strings는 보통 `en.lproj`에 있으므로 `Base`를 후보 로케일에서 뺀다.

### 2.3 Android `strings.xml`

- **파서는 읽기·offset 전용, 쓰기는 문자열 치환이다.** XML 직렬화는 들여쓰기·주석·속성 따옴표·엔티티를 바꿔 고정점을 깬다(`yaml`이 CST라서
  고른 것과 같은 이유). 위치는 **`saxes`**(순수 JS SAX, 위치 제공, 빌드 스크립트 없음)가 준다(결정 2026-10-19 사용자). exact 고정하고
  CLAUDE.md 스택 표에 "읽기·offset 전용, 직렬화에 쓰지 않는다"를 함정으로 남긴다. ⚠️ SAX의 offset 단위(UTF-16 코드 유닛인지)를 T3.0에서 실측한다.
- 엔트리: `<resources>` 직속 `<string name="…">`만. `translatable="false"`는 엔트리가 아니고 보존된다. `<plurals>`·`<string-array>`·`<item>`은
  읽지 않고 보존된다(unmanaged 보고 — 다음 Publish에서 살아남으므로 `partial-import`가 아니다, `ERROR_KIND` 규칙).
- 값 표현: §3.
- **기준 언어 경로 문제 — 이 기능의 최대 설계 지점.** 기준 언어 파일은 `values/strings.xml`이라 `{locale}` 치환으로 표현되지 않는다.
  `pathTemplate.replaceAll("{locale}", code)`가 `lib/` 비테스트 소스 **22줄**에 흩어져 있다(2026-10-19 grep `replace(All)?("{locale}"`)(`lib/pull/*`·`lib/push/payload.ts`·`lib/locales/*`·
  `lib/projects/remote-plan.ts`·어댑터·survey). 안:
  - **(결정 2026-10-19 사용자) Android base만 별도 필드** — `DetectedFormat.basePath`(탐지가 관측한 base 파일 경로, 예
    `app/src/main/res/values/strings.xml`)와 additive 컬럼 `TranslationSurface.basePath String?`. 다른 어댑터는 항상 null이다.
    기존 22줄의 `{locale}` 치환은 그대로 두고, **base 로케일 경로가 필요한 자리만** `basePath ?? 치환`으로 분기한다.
    - 분기가 필요한 자리를 전수로 고정한다: base 원본 읽기(pull B3.4 base 키 집합) · base 쓰기 · push 페이로드의 파일 목록 ·
      `remote-plan`의 존재 대조 · locale-add의 표현 출처(base 파일) · survey. 목록은 T0.2가 grep으로 확정하고 테스트가 센다
      (`basePath`가 있는 표면에서 base 경로를 치환으로 만드는 자리가 남으면 red).
    - 외부 계약: CLI가 리포에서 다시 탐지하므로 `basePath`도 CLI 탐지가 내고 `checkFormat` 비교 항목에 든다 — 등록된 값과 다르면
      `format mismatch`(경로 이전과 같은 취급). action 입력은 늘리지 않는다(`path-template`만으로 후보를 고르고 basePath는 그 후보에 딸려 온다).
    - 경로 안전: `basePath`에도 `isPathSafeRepoPath`를 push 스키마·`resolveLocalePaths` 두 경계에서 건다(POSTMORTEM 2026-09-09).
    - 마이그레이션: nullable 컬럼 추가 하나라 버전을 건너뛴 업그레이드에서도 안전하다(SELF-HOSTING §3). `/db`가 dev → `/merge` 1단계가 prod.
  - (기각) 22줄을 `localePath` 하나로 모으기 — 분기가 한 곳이지만 이관 범위가 넓다(사용자 선택).
  - (기각) 디렉터리 이름 전체를 로케일 코드로(`values-ko`) — `isLocaleShaped`(`lib/locale-code.ts`)가 거부한다. 보안 경계를 풀어야 한다.
  - (기각) `values{locale}` + 코드 `-ko`·`""` — 빈 코드가 `isPathSafeLocale`에 걸린다.
- 로케일 코드: 디렉터리 그대로(`ko`·`zh-rCN`) — "파일명이 코드의 진실" 규칙(`types.ts`)을 지킨다. `b+…`는 후보에서 뺀다.
  `zh-rCN`의 표시 이름·텍스트 방향(`text-direction.ts`)은 `r` 접두 지역을 풀어 읽는 순수 함수가 필요하다 — 저장 코드는 바꾸지 않는다.
- 기준 언어 코드: `values/`에는 코드가 없다 → 기존 **기준 언어 선언**(sources `updateBaseLocale`)으로 받는다. 선언 전에는 온보딩이 선언을 요구한다.

### 2.4 파일 인코딩 경로 (Apple `.strings` 배치에 딸린 코어 변경)

지금 블롭은 무조건 UTF-8로 읽고 쓴다 — 읽기 `lib/github.ts:322·409` · `lib/gitlab/plan.ts:93`, 로컬 `lib/cli/walk.ts`, 쓰기 GitLab commit
`encoding: "text"`(`lib/gitlab/plan.ts:20`), 해시 `lib/githash.ts` `blobSha(content)`(UTF-8 바이트로 잰다). UTF-16 파일을 그대로 두면 깨진
문자열을 파싱하고, 쓴 파일은 UTF-8로 바뀌어 **파일 전체가 diff**가 된다.

- 순수 함수 둘: `decodeFileBytes(bytes) → { content, encoding }`(BOM 우선, BOM 없으면 NUL 바이트 패턴으로 UTF-16 판별, 그 밖은 UTF-8)와
  `encodeFileContent(content, encoding) → bytes`(원본 BOM 유무 포함). `encoding`은 `"utf-8" | "utf-8-bom" | "utf-16le" | "utf-16le-bom" | "utf-16be" | "utf-16be-bom"`.
  ⚠️ 지금 UTF-8 BOM은 문자열 안의 `﻿`로 어댑터가 다룬다(`json-style`·B7a) — **기존 동작을 바꾸지 않도록** UTF-8 계열은 지금처럼
  BOM을 문자열에 남기고 `encoding: "utf-8"`로 둔다. 새 판별은 UTF-16에만 실질 분기를 만든다.
- `AdapterFile`에 `encoding?`(없으면 UTF-8)을 싣는다. 리더 셋(GitHub·GitLab·CLI walk)이 `decodeFileBytes`를 지나고, 렌더 출력은 그 파일의 원본
  인코딩을 물려받는다(새 파일은 기준 언어 파일 인코딩 — 불변식 4의 "표현은 기준 언어 파일 하나에서만 빌린다").
- 쓰기: GitHub은 UTF-16이면 blob을 base64로 만든다, GitLab은 그 파일만 `encoding: "base64"`. **`blobSha`는 인코딩한 바이트로 잰다** — 문자열로 재면
  변경 감지(`lib/pull/plan.ts:266`)가 매번 "변경됨"을 뱉는다(불변식 4·CLAUDE.md "export는 결정적").
- 어댑터는 문자열만 본다 — 인코딩은 I/O 경계의 일이다. survey 껍데기도 같은 디코더를 지난다.
- 결정성 테스트: 모든 인코딩에서 `encode(decode(b)) === b`, 같은 DB + 같은 원본 → 같은 바이트 · 같은 `blobSha`.

### 2.5 Apple `.xcstrings` (마지막 배치)

모든 언어가 든 JSON 하나다(결정 2026-10-19 사용자 — 이 spec의 마지막 배치로 둔다). `ts-dict`와 같은 multi-locale이라 **언어 추가·제거는 비지원**이다.

- 기준 언어: 파일의 `sourceLanguage`. 로케일 집합: `strings.*.localizations`의 키 합집합 + `sourceLanguage`.
- 엔트리: `localizations.<code>.stringUnit.value`가 있는 셀. `shouldTranslate: false`인 키는 엔트리가 아니고 보존된다. `variations`(복수형·기기별)는
  읽지 않고 보존된다(unmanaged). `extractionState`는 해석하지 않는다 — 파일에 있는 키는 `stale`이어도 엔트리다(키 존재의 정본은 파일).
- write(surgical, JSON 텍스트 offset 치환): 값이 있는 셀은 `value` 리터럴 범위만 바꾼다. **셀이 없는 로케일**(번역되지 않음)은
  `"<code>" : { "stringUnit" : { "state" : "translated", "value" : "…" } }` 블록을 **삽입**한다 — 위치는 `localizations` 안 코드 유닛 순,
  서식은 Xcode 출력(2칸 들여쓰기, `" : "`, 콤마 규칙)과 같게 한다. 그래야 다음 Xcode 저장이 diff를 다시 만들지 않는다.
- `state`: Malmoi가 새로 쓴 셀은 `translated`. 기존 셀의 값을 바꿀 때 `state`는 건드리지 않는다(`needs_review`를 Malmoi가 풀지 않는다).
- ⚠️ **Xcode 서식 고정점은 실물로만 잰다** — Malmoi 출력을 Xcode로 열어 저장해도 바이트가 같은지를 T4.3 `/roundtrip`이 본다. 다르면 그 차이를
  골든 테스트로 고정하고 삽입 서식을 맞춘다.

## 3. 값의 표현 (세 포맷 공통 결정)

| 포맷 | 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|---|
| ARB | JSON 문자열 | JSON 이스케이프를 푼 문자열(ICU 그대로) | 없음 |
| `.strings` | `"…"` 리터럴 | 이스케이프를 푼 문자열(`%@`·`%1$s` 그대로) | 없음 |
| Android | `<string>` 안쪽 | `\'`·`\"`·`\n`·`\@`·`\?`·`&amp;`·`&lt;`를 **푼** 문자열. 자식 태그(`<xliff:g>`·`<b>`)는 **태그 문자열 그대로** | 자식 태그가 원문(base)과 같은 집합인지·잘 닫혔는지 — 깨지면 저장 거부 |

- 추천 근거: 비개발자에게 `Don\'t`를 보여 주지 않는다. 태그는 풀 방법이 없으므로 그대로 두되 깨뜨리는 저장을 막는다.
- Android 인코더: 값 → 파일 표기. `'`·`"`는 백슬래시, 선행 `@`·`?`는 백슬래시, `&`·`<`(태그 밖)는 엔티티. **원본이 따옴표로 감싼 값
  (`"…"`)이었으면 그 형을 유지한다.** `formatted="false"`는 값 표현에 영향이 없다(속성 보존만).
- **결정 2026-10-19 사용자** — 위 표 그대로(이스케이프는 풀고 자식 태그는 유지, 태그 불일치 저장 거부).

## 4. 결정성

- ARB(regenerate): `orderedEntries` + 원본에서 나른 `@`항목의 위치. 같은 DB + 같은 원본 → 같은 바이트. 다음 Publish가 자기 출력을 원본으로
  읽어도 diff 0(고정점) — survey가 잰다.
- `.strings`·Android(surgical): 값 범위 밖 바이트를 건드리지 않는다. 인접한 두 범위 치환이 같은 위치를 두 번 쓰지 않는다
  (**POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄**). 치환은 뒤에서 앞으로 한다.
- 인코더는 순수 함수이고 **decode(encode(v)) === v** 와 **encode(decode(원본 리터럴)) === 원본 리터럴(정규형일 때)** 을 속성 테스트로 고정한다.
  원본이 비정규형(`A` 같은 불필요 이스케이프)이면 그 셀이 **바뀌었을 때만** 다시 쓴다 — 안 바뀐 셀은 원본 바이트 그대로다.

## 5. 탐지

- 버킷: 세 어댑터는 `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. **경로 모양이 겹치지 않는다**(`.arb`·`.lproj/`·`res/values-`)라
  기존 리포의 1순위를 뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 재측정으로 확인한다.
- ⚠️ 탐지가 경로만으로 끝나는가: 세 포맷 모두 **경로 신호가 강해** 1패스 후보를 낸다(ts-dict·code-dict처럼 probe 씨앗이 필요 없다). probe는
  내용 검증(`<resources>` 루트, `.strings` 문법, ARB가 객체인가)에만 쓴다.
- `.github/`·`fastlane/`(스토어 메타데이터 `.strings`)·`Pods/`·`build/`는 곁가지(`aside`)다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `baseFilePath(format, baseLocale)` | `lib/adapters/shared.ts` 인근 | `basePath ?? 치환` — base 경로가 필요한 자리 전용 |
| `parseArb` / `writeArb` | `lib/adapters/arb-catalog.ts` | `@key`·`@@*` 운반, `@@locale` 생성, 고정점 |
| `tokenizeStrings` / `decodeStringsLiteral` / `encodeStringsLiteral` | `lib/adapters/apple-strings.ts` | 범위·왕복·UTF-16 판별 |
| `tokenizeAndroid` / `decodeAndroidValue` / `encodeAndroidValue` | `lib/adapters/android-strings.ts` | 범위·왕복·태그 보존·따옴표 형 유지 |
| `androidInlineTagsMatch(base, value)` | 같은 파일 | 저장 검증(§3) |
| `androidLocaleDisplay(code)` | `lib/i18n/locales.ts` 인근 | `zh-rCN` → `zh-CN` 해석(표시·방향 전용) |
| `decodeFileBytes` / `encodeFileContent` | `lib/file-encoding.ts`(잎) | 6 인코딩 왕복, UTF-8 계열 기존 동작 불변 |
| `blobSha(bytes)` | `lib/githash.ts` | 인코딩한 바이트로 잰다 |
| xcstrings `tokenize`·`insertLocalization` | `lib/adapters/apple-xcstrings.ts` | 값 범위 · 삽입 위치·Xcode 서식 |
| 각 어댑터 `detectCandidates` | 어댑터 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

- 스키마: **additive 하나** — `TranslationSurface.basePath String?`(Q1, Android만 채운다). `adapterName`은 문자열이라 어댑터 추가에는
  마이그레이션이 없다. ARB 메타는 DB에 넣지 않는다(Q2).
- 환경변수: 없음.
- 패키지: **`saxes` 하나**(Q4) → SELF-HOSTING §3 체크리스트, `pnpm-workspace.yaml`의 `minimumReleaseAge`(24시간 지난 버전)·
  `onlyBuiltDependencies`(빌드 스크립트가 없으므로 목록에 넣지 않는다). 버전은 명시해 깐다.

## 8. 외부 계약

- action `malmoi-i18n-push`는 자기 체크아웃의 CLI를 돈다(`github.action_path`) — 새 어댑터를 CI가 쓰려면 **action 태그 릴리스**가 필요하다
  (`@malmoi-i18n-push-v3`을 옮길지 v4를 낼지 — 기존 소비자의 1순위 불변(완료 조건 3)이 확인되면 v3 이동이 가능하다). GitLab CI 원본 태그
  `malmoi-i18n-push-gitlab-vN`도 같은 축. 절차는 OPERATIONS.
- `docs/ACTIONS.md`의 `adapter` 입력 허용값 표.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 새 어댑터의 파일을 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-09 검증이 탐지 경로에만 있었다 — 경로 안전 판정(`isLocaleShaped`·`isPathSafeRepoPath`)을 `localePath` 결과에도 건다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로(`renderProjectWorkflowYaml`)가 새 어댑터 이름을 박는지.
- 2026-09-16 YAML range 치환 — §4.
- 2026-09-24 chrome placeholders null — §2.1.
- 2026-10-03 단일 언어 탐지가 조상 승격으로 설정 파일을 앞세움 — Android `values/`만 있는 단일 언어 리포에서 같은 판정을 본다.
