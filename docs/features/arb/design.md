# arb — design

## 0. 범위·원칙 대조

- **PRODUCT §4.2**: "ICU 복수형"이 비범위다. 이 기능은 복수형을 **편집하지 않고 보존만** 하므로 비범위 안으로 들어가지 않는다.
  ARB의 ICU 문자열을 통짜 문자열로 다루는 것은 i18next `{{name}}`을 raw로 보여 주는 지금의 관행과 같다.
- **PRODUCT §2 포지셔닝**: "JSON·YAML·TS/JS 딕셔너리"를 못박고 있다 → 갱신이 산출물이다(tasks T5).
- **불변식 1·2(병합 없음)**: 값을 원본에서 가져오지 않는다. ARB `@key` 메타데이터를 원본에서 나르는 것은 **값이 아니라 소스 키
  메타데이터**이고 소유자가 코드다(§2) — B3.4 "원본에만 있는 키는 원본 엔트리 그대로"와 같은 형이라 키마다 출처가 하나이고 견줘 고르는
  코드가 없다. ⚠️ 다만 **키별 내용을 write 시점에 원본에서 가져오는 첫 regenerate 어댑터**다(chrome `description`·`placeholders`는 DB에서 온다,
  `lib/adapters/chrome-locales.ts:215-217`). `contract.ts:12-24` 표는 regenerate가 원본에서 **표현만** 가져온다고 규정하므로 예외 행을 더하고,
  불변식 2·4와 CLAUDE.md 코어 원칙의 문구도 넓힌다(tasks T5.2).
- **불변식 4(결정성)**: §4.
- 출시: 모바일 세 스펙을 한 번에 묶는다(spec 머리).

## 1. 영향 받는 흐름

push(적재·CI) · pull(Publish 렌더) · 온보딩 탐지 · locale-add · survey. 편집 UI는 바뀌지 않는다.

## 2. 어댑터 `arb-catalog`

| layout | writeStrategy | 템플릿 예 | 새 언어 파일 |
|---|---|---|---|
| per-locale | regenerate | `lib/l10n/app_{locale}.arb` | `Adapter.create`가 아니라 기존 `representationSource` 경로(§5.10.4) + `@@locale` |

`AdapterName`은 DB에서 `String?`(`TranslationSurface.adapterName`)이라 **마이그레이션이 없다.** `ADAPTERS` 배열·`z.enum(ADAPTER_NAMES)`·
사전의 어댑터 라벨 `Record`가 typecheck로 따라온다. typecheck가 못 잡는 손 목록은 tasks T1.3이 전수로 든다.

- read: 최상위 `"key": "string"`만 엔트리다. `@@`로 시작하는 전역 항목(`@@locale`·`@@last_modified`·`@@x-*`)과 `@key` 객체는 엔트리가 아니다.
  중복 속성은 기존 JSON 규칙(`duplicate-property` warning)을 따른다. 키 대입은 `Object.create(null)`(CLAUDE.md 프로토타입 규칙).
- write(regenerate): 엔트리 순서는 `LocaleEntry.order`(§1.1).
  - **`@key`는 같은 로케일 원본 파일의 그 텍스트 구간을 바이트 그대로 그 키 바로 뒤 자리로 나른다**(원본에 없으면 안 쓴다, 다시 직렬화하지 않는다).
    원본에서 `@key`가 키보다 앞에 있었어도 출력은 키 바로 뒤다(첫 Publish에서 한 번 이동하고 그 뒤 고정점).
  - **출력하지 않는 키의 `@key`는 버린다** — orphaned 키·DB에만 있는 보류 키의 `@foo`가 짝 없이 남지 않는다. **원본에만 있는 키**(B3.4)는
    원본 엔트리와 `@key`를 함께 그대로 낸다.
  - 원본의 `@@*`도 원본 위치(대개 맨 앞)와 순서를 지킨다.
  - **`@@locale`은 원본에 그 줄이 있을 때만** 값을 경로의 로케일 코드로 생성한다 — 원본 값과 견주지 않는다. 원본 값이 경로 코드와 다르면
    (`app_ko.arb`의 `ko-KR`) 첫 Publish에서 한 번 고쳐지고 그 뒤 고정점이다(spec 완료 조건 1의 허용 정규화). 원본에 없으면 넣지 않는다
    (첫 Publish에 셀 밖 diff를 만들지 않는다). **새로 만드는 파일에는 항상 넣는다**(복제된 표현이 기준 언어 코드를 들고 나가는 것을 막는다).
- ⚠️ regenerate 계약 충돌: `contract.ts`의 regenerate 분기는 "원본이 있고 쓸 값이 0이면 출력이 `{}`"를 요구한다. ARB는 원본의 `@@*`를 나르므로
  `{}`가 아니다 — 매트릭스에 ARB 예외 행("쓸 값 0이면 `@@*`만 남은 객체")을 둔다.
- 표현: `json-style.ts` 재사용(들여쓰기·이스케이프·끝 개행·CRLF).
- 탐지 보조: 리포 루트 `l10n.yaml`의 `arb-dir`·`template-arb-file`이 있으면 경로·기준 언어 후보를 그것으로 좁힌다. 없으면 경로 신호만.
- ⚠️ chrome `placeholders`는 DB에 넣었다(POSTMORTEM 2026-09-24 — Prisma JSON null). ARB `@key`는 넣지 않는 이유: 번역자가 로케일별로 고치는
  내용이 아니라 개발자가 템플릿에 쓰는 소스 키 메타데이터다(**결정 2026-10-19 사용자 — 원본에서 나른다, 스키마 0**). 대가: 새로 만든 언어 파일
  에는 `@key`가 없다 — gen-l10n은 템플릿의 메타만 읽으므로 동작에 영향이 없다.
- 선례(2026-10-19 조사): Weblate는 `@key`를 값 바로 뒤에 쓰고 `@@locale`을 고쳐 쓰지 않는다. Tolgee는 `@key`를 기준 언어 파일에만 쓰고
  `@@locale`을 항상 생성하며 키를 이름순으로 재정렬한다 — 원본 순서·`@@x-*`를 잃는다.

## 3. 값의 표현

| 파일 표기 | DB·화면 값 | 저장 검증 |
|---|---|---|
| JSON 문자열 | JSON 이스케이프를 푼 문자열(ICU 그대로) | 없음 |

## 4. 결정성

- `orderedEntries` + 원본에서 나른 `@`항목의 위치. 같은 DB + 같은 원본 → 같은 바이트. 다음 Publish가 자기 출력을 원본으로
  읽어도 diff 0(고정점) — survey가 잰다. 퇴화 출력(`{}`, `@@locale`만 남은 파일)도 다음 read·write의 입력으로 왕복한다(POSTMORTEM 2026-09-29).

## 5. 탐지

- 버킷: `rest` 버킷에서 기존 4포맷과 같은 `rankTemplates`를 지난다. 경로 모양(`.arb`)이 기존 포맷과 겹치지 않아
  기존 리포의 1순위를 뺏을 경로가 원리적으로 좁다. 그래도 완료 조건 3이 기준선 대조로 확인한다.
- 경로 신호가 강해 1패스 후보를 낸다(ts-dict·code-dict처럼 probe 씨앗이 필요 없다). probe는 내용 검증(ARB가 객체인가)에만 쓴다.

## 6. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치(안) | 계약 |
|---|---|---|
| `parseArb` / `writeArb` | `lib/adapters/arb-catalog.ts` | `@key` 구간 운반·orphan 버림, `@@*` 순서, `@@locale` 조건부 생성, 고정점 |
| `detectCandidates` | 같은 파일 | `detect-candidates.test.ts` 계약 + `contract.ts` 매트릭스 편입 |

## 7. 스키마 · 환경변수 · 패키지

없음.

## 8. 외부 계약

- action `malmoi-i18n-push`는 자기 체크아웃의 CLI를 돈다(`github.action_path`) — 새 어댑터를 CI가 쓰려면 **action 태그 릴리스**가 필요하다.
  세 스펙 합동으로 android-strings T5에서 새 태그(v4·gitlab-v3)와 GitLab SHA 후속 패치로 낸다(그 design §8).
- `docs/ACTIONS.md`의 `adapter` 입력 허용값 표.

## 9. 과거 함정 (POSTMORTEM)

- 2026-09-02 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았다" — 온보딩 `probeTargets`·survey `select.ts`가 `.arb`를 내려받는지
  껍데기 테스트로 확인한다.
- 2026-09-02 순위 픽스가 자기 단위 테스트만 통과 — 진입점(`detectCandidatesAcross`)에서 1순위를 단언한다.
- 2026-09-14 설정 YAML이 확정 어댑터를 생략 — 생성 워크플로(`renderProjectWorkflowYaml`·`renderProjectGitlabCiYaml`)가 새 어댑터 이름을 박는지.
- 2026-09-24 chrome placeholders null — §2.
- 2026-09-29 빈 `{}` 로케일 파일 — §4 퇴화 출력 왕복.
