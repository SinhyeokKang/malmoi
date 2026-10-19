# apple-strings — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. `.stringsdict`·xcstrings `variations`를 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 두 어댑터 모두 값을 원본에서 가져오지 않는다.
- **불변식 4(결정성)**: §4. 인코딩 코어 변경이 `blobSha`를 건드린다(§2.2).
- 출시: 모바일 세 스펙을 한 번에 묶는다(spec 머리).

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지 · locale-add(create) · survey · **모든 포맷의 리포 파일 읽기·쓰기 경계**(§2.2).
편집 UI는 바뀌지 않는다.

## 2. 어댑터 둘

| 어댑터 | layout | writeStrategy | 템플릿 예 | create(언어 추가) |
|---|---|---|---|---|
| `apple-strings` | per-locale | surgical | `ios/App/{locale}.lproj/Localizable.strings` | 기준 언어 파일 복제 후 값 치환 |
| `apple-xcstrings` (마지막 배치) | multi-locale | surgical(JSON offset) | `ios/App/Localizable.xcstrings` | 비지원 — ts-dict와 같다 |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 **마이그레이션이 없다.**

### 2.1 Apple `.strings`

- 문법: `/* … */`·`//` 주석, `"key" = "value";`. 따옴표 없는 키(ASCII 식별자)도 받는다. 이스케이프 `\" \\ \n \t \r \UXXXX`.
- read: 토크나이저(순수 함수, 의존성 없음)가 엔트리마다 **값 리터럴의 바이트 범위**를 낸다. 값은 이스케이프를 풀어 저장한다.
- write(surgical): 값 범위만 다시 이스케이프한 리터럴로 치환한다. 원본에 없는 키는 쓰지 않는다(기존 수술적 어댑터와 같다 — `write-slot-missing`).
- 인코딩: **UTF-8과 UTF-16(LE·BE, BOM 유무)을 지원한다**(결정 2026-10-19 사용자). 원본 인코딩·BOM을 그대로 돌려쓴다 — 아래 §2.2.
- `.stringsdict`는 읽지 않는다(복수형 비범위). 같은 `.lproj`의 다른 테이블은 각자 소스다.
- `Base.lproj`는 로케일 코드가 아니다 — Localizable.strings는 보통 `en.lproj`에 있으므로 `Base`를 후보 로케일에서 뺀다.

### 2.2 파일 인코딩 경로 (`.strings`에 딸린 코어 변경)

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

### 2.3 Apple `.xcstrings` (마지막 배치)

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

## 3. 값의 표현

| 포맷 | 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|---|
| `.strings` | `"…"` 리터럴 | 이스케이프를 푼 문자열(`%@`·`%1$s` 그대로) | 없음 |
| `.xcstrings` | JSON 문자열 | JSON 이스케이프를 푼 문자열 | 없음 |

## 4. 결정성

- surgical: 값 범위 밖 바이트를 건드리지 않는다. 인접한 두 범위 치환이 같은 위치를 두 번 쓰지 않는다
  (**POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치와 바깥 빈 줄**). 치환은 뒤에서 앞으로 한다.
- 인코더는 순수 함수이고 **decode(encode(v)) === v** 와 **encode(decode(원본 리터럴)) === 원본 리터럴(정규형일 때)** 을 속성 테스트로 고정한다.
  원본이 비정규형(`A` 같은 불필요 이스케이프)이면 그 셀이 **바뀌었을 때만** 다시 쓴다 — 안 바뀐 셀은 원본 바이트 그대로다.

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`.lproj/`·`.xcstrings`)이 겹치지 않아 기존 리포의 1순위를
  뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 재측정으로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다. probe는 내용 검증(`.strings` 문법, xcstrings JSON 구조)에만 쓴다.
- `.github/`·`fastlane/`(스토어 메타데이터 `.strings`)·`Pods/`·`build/`는 곁가지(`aside`)다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `decodeFileBytes` / `encodeFileContent` | `lib/file-encoding.ts`(잎) | 6 인코딩 왕복, UTF-8 계열 기존 동작 불변 |
| `blobSha(bytes)` | `lib/githash.ts` | 인코딩한 바이트로 잰다 |
| `tokenizeStrings` / `decodeStringsLiteral` / `encodeStringsLiteral` | `lib/adapters/apple-strings.ts` | 범위·왕복·UTF-16 판별 |
| xcstrings `tokenize`·`insertLocalization` | `lib/adapters/apple-xcstrings.ts` | 값 범위 · 삽입 위치·Xcode 서식 |
| 각 어댑터 `detectCandidates` | 어댑터 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

없음.

## 8. 외부 계약

- action·GitLab CI 원본 태그 릴리스는 세 스펙 합동으로 android-strings T5에서 한 번만 한다.
- `docs/ACTIONS.md`의 `adapter` 입력 허용값 표.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 새 어댑터의 파일을 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로(`renderProjectWorkflowYaml`)가 새 어댑터 이름을 박는지.
- 2026-09-16 YAML range 치환 — §4.
