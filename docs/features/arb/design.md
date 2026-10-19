# arb — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. 이 기능은 복수형을 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
  ARB의 ICU 문자열을 통짜 문자열로 다루는 것은 i18next `{{name}}`을 raw로 보여 주는 지금의 관행과 같다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 값을 원본에서 가져오지 않는다. ARB `@key` 메타데이터를 원본에서 나르는 것은 **값이 아니라 소스 키
  메타데이터**이고 소유자가 코드다(§2) — B3.4 "원본에만 있는 키는 원본 엔트리 그대로"와 같은 형이라 견줘 고르는 코드가 없다.
- **불변식 4(결정성)**: §4.
- 출시: 모바일 세 스펙을 한 번에 묶는다(spec 머리).

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지 · locale-add · survey. 편집 UI는 바뀌지 않는다.

## 2. 어댑터 `arb-catalog`

| layout | writeStrategy | 템플릿 예 | create(언어 추가) |
|---|---|---|---|
| per-locale | regenerate | `lib/l10n/app_{locale}.arb` | 기준 언어 파일 표현 + `@@locale` |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 **마이그레이션이 없다.** `ADAPTERS` 배열·`z.enum(ADAPTER_NAMES)`·
사전의 어댑터 라벨 `Record`가 typecheck로 따라온다.

- read: 최상위 `"key": "string"`만 엔트리다. `@@`로 시작하는 전역 항목(`@@locale`·`@@last_modified`·`@@x-*`)과 `@key` 객체는 엔트리가 아니다.
- write(regenerate): 엔트리 순서는 `LocaleEntry.order`(§1.1). **`@key`는 같은 로케일 원본 파일에서 그 키 바로 뒤 자리로 그대로 나른다**
  (원본에 없으면 안 쓴다). 원본의 `@@*`도 원본 위치(대개 맨 앞)를 지킨다. `@@locale` 값은 경로의 로케일 코드로 **생성**한다 — 원본 값과
  견주지 않는다(복제된 새 파일이 기준 언어 코드를 들고 나가는 것을 막는다).
- 표현: `json-style.ts` 재사용(들여쓰기·이스케이프·끝 개행).
- 탐지 보조: 리포 루트 `l10n.yaml`의 `arb-dir`·`template-arb-file`이 있으면 경로·기준 언어 후보를 그것으로 좁힌다. 없으면 경로 신호만.
- ⚠️ chrome `placeholders`는 DB에 넣었다(POSTMORTEM 2026-09-24 — Prisma JSON null). ARB `@key`는 넣지 않는 이유: 번역자가 로케일별로 고치는
  내용이 아니라 개발자가 템플릿에 쓰는 소스 키 메타데이터다(**결정 2026-10-19 사용자 — 원본에서 나른다, 스키마 0**). 대가: 새로 만든 언어 파일
  (create)에는 `@key`가 없다 — gen-l10n은 템플릿의 메타만 읽으므로 동작에 영향이 없다.

## 3. 값의 표현

| 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|
| JSON 문자열 | JSON 이스케이프를 푼 문자열(ICU 그대로) | 없음 |

## 4. 결정성

- `orderedEntries` + 원본에서 나른 `@`항목의 위치. 같은 DB + 같은 원본 → 같은 바이트. 다음 Publish가 자기 출력을 원본으로
  읽어도 diff 0(고정점) — survey가 잰다.

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`.arb`)이 기존 포맷과 겹치지 않아
  기존 리포의 1순위를 뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 재측정으로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다(ts-dict·code-dict처럼 probe 씨앗이 필요 없다). probe는 내용 검증(ARB가 객체인가)에만 쓴다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `parseArb` / `writeArb` | `lib/adapters/arb-catalog.ts` | `@key`·`@@*` 운반, `@@locale` 생성, 고정점 |
| `detectCandidates` | 같은 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

없음.

## 8. 외부 계약

- action `malmoi-i18n-push`는 자기 체크아웃의 CLI를 돈다(`github.action_path`) — 새 어댑터를 CI가 쓰려면 **action 태그 릴리스**가 필요하다.
  세 스펙 합동 릴리스로 android-strings T5에서 한 번만 한다.
- `docs/ACTIONS.md`의 `adapter` 입력 허용값 표.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 `.arb`를 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로(`renderProjectWorkflowYaml`)가 새 어댑터 이름을 박는지.
- 2026-09-24 chrome placeholders null — §2.
