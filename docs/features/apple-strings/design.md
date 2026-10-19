# apple-strings — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. `.stringsdict`·xcstrings `variations`를 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 두 어댑터 모두 값을 원본에서 가져오지 않는다. xcstrings의 셀 삽입은 셀 하나에 출처가 하나라 병합이 아니다(§2.3).
- **불변식 3**: 수술적 표면의 비울 수 없음(`cannot-clear`) 목록에 두 어댑터가 든다(tasks T5.2).
- **불변식 4(결정성)**: §4. 인코딩 경계 변경이 `blobSha`를 건드린다(§2.2).
- 출시: 모바일 세 스펙을 한 번에 묶는다(spec 머리).

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지 · locale-add(create) · survey · **`.strings` 파일의 리포 읽기·쓰기 경계**(§2.2). 편집 UI는 바뀌지 않는다.

## 2. 어댑터 둘

| 어댑터 | layout | writeStrategy | 템플릿 예 | 새 언어 파일(create) |
|---|---|---|---|---|
| `apple-strings` | per-locale | surgical | `ios/App/{locale}.lproj/Localizable.strings` | 기준 파일의 **뼈대만**(인코딩·BOM) + 값 있는 활성 키만 |
| `apple-xcstrings` (마지막 배치) | multi-locale | surgical(JSON offset) | `ios/App/Localizable.xcstrings` | 비지원 — ts-dict와 같다 |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 **마이그레이션이 없다.** `SUPPORTED_ADAPTERS`에는 `apple-strings`만 든다.

### 2.1 Apple `.strings`

- 문법: `/* … */`·`//` 주석, `"key" = "value";`. 따옴표 없는 키(ASCII 식별자)도 받는다. 이스케이프 `\" \\ \n \t \r \UXXXX`.
- read: 토크나이저(순수 함수, 의존성 없음)가 엔트리마다 **값 리터럴의 범위**를 낸다. 값은 이스케이프를 풀어 저장한다. 주석 안의
  `"a" = "b";`는 엔트리가 아니다. 키 대입은 `Object.create(null)`.
- **중복 키**: Apple은 나중 값이 이긴다. read는 나중 값을 엔트리로 삼고 `duplicate-key`를 보고하며, write는 **가려진 앞 리터럴을 고치지 않는다**
  (POSTMORTEM 2026-10-07 — 쓰기 성공과 값 전달을 같게 셌다).
- write(surgical): 값 범위만 다시 이스케이프한 리터럴로 치환한다. 빈 값은 불변식 3의 수술적 규칙을 따른다(`planClearability` — 비울 수 없음).
- **비기준 파일의 누락 키는 삽입한다**(결정 2026-10-19 사용자, Codex 피어 검수). create는 값 있는 키만 쓰므로, 언어 파일을 만든 뒤 다른 키를 번역하면 그 파일에
  자리가 없다. 지금 계약대로면 per-locale `write-slot-missing`이 blocking이라(`lib/pull/undeliverable.ts:31`) Publish 전체가 거부된다 — 원본이 있으면
  create가 아니라 write로 간다(`lib/pull/render.ts:157`). 그래서 비기준 언어 파일에서는 기준 파일의 키 순서상 바로 앞 키의 엔트리 뒤(없으면 파일 끝)에
  `"key" = "value";` 줄을 삽입하고, 줄바꿈·들여쓰기는 그 파일의 이웃 엔트리에서 빌린다. 기준 순서는 `LocaleEntry.order`(렌더가 base `sortIndex`로 싣는다)로
  충분하다 — 새 `WriteInput` 필드를 만들지 않는다. arb가 더한 `WriteInput.untranslated`(비-base에서 값 없는 살아 있는 키)·`orphaned`는 이미 있으니
  필요하면 그것을 읽는다(`lib/pull/render.ts` `untranslatedOf`). **기준 파일에는 삽입하지 않는다**(키 존재는 코드가 정한다 —
  기준 파일에 없는 키는 쓰지 않는다). 삽입도 값 범위 치환과 같은 뒤→앞 적용에 든다(§4).
- create: 기준 언어 파일의 인코딩·BOM만 빌리고 **값·주석은 빌리지 않는다**(§5.10.4). 값 있는 활성 키만 쓴다. 선례: Weblate도 새 파일에 기준 값을
  복사하지 않는다(빈 파일 또는 값을 비운 template).
- 인코딩: **UTF-8과 UTF-16(LE·BE, BOM 유무)을 지원한다**(결정 2026-10-19 사용자). 원본 인코딩·BOM을 그대로 돌려쓴다 — 아래 §2.2.
- `.stringsdict`는 읽지 않는다(복수형 비범위). 같은 `.lproj`의 다른 테이블은 각자 소스다.
- `Base.lproj`는 로케일 코드가 아니다 — Localizable.strings는 보통 `en.lproj`에 있으므로 `Base`를 후보 로케일에서 뺀다. `Base.lproj`가 기준인 리포는
  비목표다(spec).

### 2.2 파일 인코딩 경로

사전 작업 스펙 **mobile-strings** design §3이 정본이다(`.strings` 경로에만 UTF-16 판별, 리더·쓰기·`blobSha`, 비가역 입력 명시 실패).
이 스펙의 어댑터는 문자열만 보고, create는 기준 언어 파일의 인코딩을 물려받는다.

M3로 dev에 들어간 계약(2026-10-19 — 이 스펙은 소비만 한다):
- 리더는 경로를 받아 `decodeLocaleFile`을 지나고 `GitClient.getBlobText(sha, path)`가 `{ content, encoding? }`를 준다. 렌더 출력은 자기 인코딩,
  새 파일은 `baseFilePath`의 기준 파일 인코딩을 상속한다. GitHub은 바뀐 UTF-16 파일만 `POST /git/blobs`(base64), GitLab은 그 action만 `base64`.
- **잘못된 UTF-8은 모든 로케일 경로에서 명시 실패이되, 적재·Publish 대상으로 고른 파일에만 건다**(2026-10-19 사용자, mobile-strings orch 결정 10) —
  CLI `fileProbe`의 `failures` → audit #7 red + `prepare-failed` 보고, 서버 `reader.blob` → `undefined`, Sync·Publish → 파일별 `RenderError parse-failed`
  (미리보기 `blocked`, 실행 `skipped: writer-warnings`). 무관한 예제 파일은 그 후보만 떨어진다. 비가역 UTF-16도 같은 경로다.
- 바이너리 plist(`bplist00`) `.strings`는 NUL 판별로 UTF-16 후보가 됐다가 디코드에서 실패한다(M1 코퍼스 Lifeslice 22파일). 작은 바이너리는 "유효한 UTF-16"으로
  읽힐 수 있으니 어댑터가 매직으로 명시 거부한다(T2.1).

### 2.3 Apple `.xcstrings` (마지막 배치)

모든 언어가 든 JSON 하나다(결정 2026-10-19 사용자 — 이 spec의 마지막 배치로 둔다). `ts-dict`와 같은 multi-locale이라 **언어 추가·제거는 비지원**이다
(화면 분기는 `supportsLocaleChanges`에서 파생되므로 따로 만들 것이 없다 — `lib/locales/add-plan.ts:13-16` → `lib/sources/query.ts:87`).

- 기준 언어: 파일의 `sourceLanguage`. **`DetectedFormat.templateLocale`(arb가 `l10n.yaml` `template-arb-file`용으로 더한 필드, `lib/adapters/types.ts`)에 실어
  요약·확정의 기본 기준 언어로 쓴다**(`lib/onboarding/detect.ts` — `templateLocale ?? pickBaseLocale(locales)`). 새 필드를 만들지 않는다. 로케일 집합: `strings.*.localizations`의 키 합집합 + `sourceLanguage`.
- 엔트리: `localizations.<code>.stringUnit.value`가 있는 셀. `shouldTranslate: false`인 키는 엔트리가 아니고 보존된다. `variations`(복수형·기기별)는
  읽지 않고 보존된다(unmanaged). `extractionState`는 해석하지 않는다 — 파일에 있는 키는 `stale`이어도 엔트리다(키 존재의 정본은 파일).
- **키 = 원문**(결정 2026-10-19 사용자): SwiftUI가 만든 키는 원문 자체이고 `sourceLanguage` 셀이 없는 경우가 흔하다. 이때 **키 문자열을 기준 값으로
  읽는다**. 쓸 때는 **DB의 기준 값이 키 문자열과 같으면 기준 셀을 쓰지 않고**(첫 Publish diff 0), **다르면 원문 셀을 아래 삽입 규칙으로 넣는다**
  (Xcode가 카탈로그에서 원문을 고칠 때 하는 것과 같다 — Codex 피어 검수로 "편집 거부"를 대체, 2026-10-19 사용자). 저장 코어는 실제 원문 셀이 있는 키와
  키로 대신한 키를 구별할 수 없으므로(`lib/keys/save-key.ts:114·124·141`) 거부 판정을 두지 않는다 — 셀 존재 정보를 나를 스키마·오류 코드·UI가 필요 없다.
  같은 DB → 같은 출력이고, 다음 push는 삽입된 셀의 값을 읽는다. 키는 여전히 코드(파일)가 정하므로 gettext와 달리 원칙 충돌이 없다. 선례: Tolgee도 원문 셀이 없으면 키를 원문 값으로 쓴다(`localizations` 자체가
  없는 키는 건너뛴다). `.strings`는 키가 무엇이든 기준 파일에 값이 있어 바뀌는 것이 없다.
- write(surgical, JSON 텍스트 offset 치환): 값이 있는 셀은 `value` 리터럴 범위만 바꾼다. **셀이 없는 로케일**(번역되지 않음)은
  `"<code>" : { "stringUnit" : { "state" : "translated", "value" : "…" } }` 블록을 **삽입**한다 — 위치는 `localizations` 안 코드 유닛 순,
  서식은 Xcode 출력(2칸 들여쓰기, `" : "`, 콤마 규칙)과 같게 한다. 그래야 다음 Xcode 저장이 diff를 다시 만들지 않는다.
  ⚠️ ts-dict는 자리가 없으면 쓰지 않는다(`write-slot-missing`·`write-locale-object-missing`) — multi-locale 어댑터 사이의 규칙 차이라 ARCHITECTURE에 기록한다.
- **전달 판정도 삽입을 따른다**(결정 2026-10-19 사용자, Codex 피어 검수). 지금 경로 선택(`lib/pull/run.ts:388-401`)과 Publish 미리보기(`lib/publish/read.ts:153-156`)는
  multi-locale·surgical 원본에서 자리 없는 셀을 모두 보류로 본다 — 그대로면 `foo.fr`이 PR에는 삽입되는데 미리보기는 "보류"를 말하고 미전달 토큰도 남는다.
  두 판정을 어댑터 성질(셀 삽입 가능)로 갈라, xcstrings는 **키가 파일에 있으면 어느 로케일 셀이든 전달 대상**으로 센다. ts-dict의 기존 보류는 그대로다.
  경로 선택·미리보기·렌더·토큰 해제가 같은 판정을 보는지 통합 테스트가 고정한다.
- `state`: Malmoi가 새로 쓴 셀은 `translated`. 기존 셀의 값을 바꿀 때 `state`는 건드리지 않는다(`needs_review`를 Malmoi가 풀지 않는다).
- ⚠️ **Xcode 서식 고정점은 실물로만 잰다** — Malmoi 출력을 Xcode로 열어 저장해도 바이트가 같은지를 T4.3 `/roundtrip`이 본다. 다르면 그 차이를
  골든 테스트로 고정하고 삽입 서식을 맞춘다.

## 3. 값의 표현

| 포맷 | 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|---|
| `.strings` | `"…"` 리터럴 | 이스케이프를 푼 문자열(`%@`·`%1$s` 그대로) | 없음 |
| `.xcstrings` | JSON 문자열 | JSON 이스케이프를 푼 문자열(원문 셀 없는 키는 키 문자열) | 없음(§2.3 — 기준 값이 키와 다르면 원문 셀 삽입) |

화면 라벨은 기존 형을 따르고 둘을 라벨로 가른다 — 예: "Apple strings file" / "Apple String Catalog"(예시 경로만으로는 구별되지 않는다, 내부 이름 미노출).

## 4. 결정성

- surgical: 값 범위 밖 바이트를 건드리지 않는다. 인접한 두 범위 치환이 같은 위치를 두 번 쓰지 않는다
  (**POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄**). 치환은 뒤에서 앞으로 한다.
- 인코더는 순수 함수이고 **decode(encode(v)) === v** 와 **encode(decode(원본 리터럴)) === 원본 리터럴(정규형일 때)** 을 속성 테스트로 고정한다.
  원본이 비정규형(`A` 같은 불필요 이스케이프)이면 그 셀이 **바뀌었을 때만** 다시 쓴다 — 안 바뀐 셀은 원본 바이트 그대로다.
- CRLF 원본은 CRLF로, 0바이트 파일·퇴화 출력은 다음 read·write의 입력으로 왕복한다(POSTMORTEM 2026-09-29).

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`.lproj/`·`.xcstrings`)이 겹치지 않아 기존 리포의 1순위를
  뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 기준선 대조로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다. probe는 내용 검증(`.strings` 문법, xcstrings JSON 구조)에만 쓴다.
- ⚠️ **probe 예산 밖으로 밀린 정답 후보는 조용히 사라진다**(arb 리뷰 R1). 온보딩은 1패스 순위 상위 `PROBE_LIMITS.jsonLike`(5)개 후보만 내려받고,
  `verifySamples`가 내용 없이 만난 후보를 미검증으로 떨어뜨린다. iOS 리포는 테이블(`Localizable`·`InfoPlist`·`Main`·스토리보드별)과 `fastlane/` 메타데이터로
  `.strings` 후보가 많다 — 정답 `Localizable.strings`가 6번째면 화면에 후보가 없다. survey·CLI는 모든 파일을 읽어 이 실패를 못 본다(코퍼스 통과가 보장이 아니다).
  그래서 후보 순위에서 `Localizable`을 앞세우고, 실제 `detectFormats` + 읽은 경로를 기록하는 가짜 reader로 시나리오 테스트를 둔다
  (본보기 `lib/onboarding-run/__tests__/detect-arb.test.ts`). 예산을 늘려야 하면 합계 바이트 예산은 한 번만 잰다(`readFiles(…, prior)` — arb 재리뷰 Y1).
- 로케일 코드는 `.lproj` 디렉터리 이름 그대로다(`en`·`en-GB`·`zh-Hans`·`pt-BR`, raw 코드 정책). `Base`는 뺀다. ⚠️ arb에서 `looksLikeLocale`이 `app_en`을 통과해
  파일명 해석이 틀렸다(리뷰 R2·재리뷰 Y3) — 디렉터리 이름 해석도 진입점 테스트로 고정한다.
- `fastlane/`(스토어 메타데이터 `.strings`)·`Pods/`·`build/`는 곁가지여야 한다. ⚠️ 지금 `ASIDE_HINT`(`lib/adapters/shared.ts:172-173`)에 셋이 없다 —
  더하면 기존 어댑터 순위에도 닿으므로 완료 조건 3의 재측정 대상이다. 가능하면 이 어댑터의 후보 판정 안에서만 거른다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `decodeFileBytes` / `encodeFileContent` | `lib/file-encoding.ts`(잎) | `.strings`만 UTF-16 판별, 5 인코딩 왕복, UTF-8 기존 동작·바이트 불변 |
| `blobSha(bytes)` | `lib/githash.ts` | 인코딩한 바이트로 잰다, UTF-8 문자열 입력과 같은 값 |
| `tokenizeStrings` / `decodeStringsLiteral` / `encodeStringsLiteral` | `lib/adapters/apple-strings.ts` | 범위·왕복·중복 키·주석 속 가짜 엔트리·비기준 파일 누락 키 삽입 |
| xcstrings `tokenize`·`insertLocalization` | `lib/adapters/apple-xcstrings.ts` | 값 범위 · 삽입 위치·Xcode 서식 · 키 = 원문(기준 값 ≠ 키일 때만 원문 셀) |
| 셀 삽입 가능 판정 | `lib/pull/run.ts`·`lib/publish/read.ts`가 함께 부르는 자리 | xcstrings는 자리 없는 셀도 전달 대상, ts-dict는 보류 |
| 각 어댑터 `detectCandidates` | 어댑터 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

없음.

## 8. 외부 계약

- action·GitLab CI 원본은 세 스펙 합동으로 android-strings T5에서 새 태그(v4·gitlab-v3)와 GitLab SHA 후속 패치로 낸다(그 design §8).
- `docs/ACTIONS.md`의 `adapter` 입력 허용값 표.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 새 어댑터의 파일을 내려받는지
  껍데기 테스트로 확인한다. 같은 부류: survey의 NUL 스킵(§2.2).
- 2026-09-09 검증이 한쪽 경로에만 있었다 — 인코딩 판별을 웹 리더에만 걸고 CI 리더(`scripts/format.ts`)를 빠뜨리지 않는다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로(GitHub·GitLab)가 새 어댑터 이름을 박는지.
- 2026-09-16 YAML range 치환 — §4.
- 2026-10-07 쓰기 성공과 값 전달을 같게 셌다 — 중복 키(§2.1).
- arb 런(2026-10-19, `docs/features/arb/orch.md`)의 리뷰가 찾은 부류 — 다음 어댑터에서 먼저 테스트로 막는다:
  probe 예산 밖 후보 탈락(§5) · 파일·디렉터리 이름의 로케일 오해석(§5) · 설정·표본을 따로 읽어 합계 예산이 두 번 시작됨 · 진입점 시나리오 부재
  (확정 → 첫 적재 → 언어 추가·제거 → Publish 미리보기·바이트를 격리 Postgres로 — 본보기 `lib/pull/__tests__/arb-publish.integration.ts`) ·
  **첫 Publish가 리포에 있던 것을 지움**(arb는 비-base `@key` 수천 줄 — 결정 10·13). 수술적 어댑터는 원리상 지우지 않지만, 누락 키 삽입(§2.1)·xcstrings 셀 삽입(§2.3)이
  기존 줄을 건드리지 않는지 실제 코퍼스 리포로 잰다(T2.3·T4.3).
