# arb — tasks

모바일 세 스펙의 첫째다(arb → apple-strings → android-strings). 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9
재측정 트리거)으로 닫는다. **`/merge`는 세 스펙이 다 끝난 뒤 한 번**이다(spec 머리). design-brief 없음 — 새 UI 표면이 없다.

**표기 규칙(세 스펙 공통)**
- "검증: red"는 **새 테스트가 단언 실패로 red이고 기존 스위트는 green**이라는 뜻이다. import·모듈 부재로 죽는 것은 red가 아니다 — 새 어댑터
  파일이 없으면 `contract.ts`의 exhaustive switch가 typecheck에서 먼저 죽어 단언이 하나도 돌지 않는다(POSTMORTEM 2026-09-02). 빈 스텁을 먼저 둔다.
- **(수동)** 표시는 사람·로컬 도구가 필요한 검증이다(e2e 프레임워크가 없다). 도구가 없으면 통과로 취급하지 않고 미완으로 보고한다.
- 테스트 태스크는 따로 커밋하지 않고 바로 다음 구현 태스크의 커밋에 합친다.

## 0. 사전 작업

기준선(SHA 고정)·모바일 코퍼스는 **mobile-strings** M0·M1이 만든다. 이 스펙은 그것이 끝난 뒤 착수한다.

## 1. ARB (`arb-catalog`)

- [x] **T1.1 테스트** — read(`@key`·`@@*` 제외, 중복 속성 warning, `"__proto__"` 키가 own property로 남음), write(`@key` 원본 구간 바이트 운반 ·
      `@key`가 키보다 앞인 원본 · orphan·DB 전용 키의 `@key` 버림 · 원본에만 있는 키는 `@key`와 함께 · `@@*`·`@@x-*` 순서 · `@@locale`은 원본에 있을 때만 ·
      고정점 · CRLF), 퇴화 입력(`{}`·`@@locale`만 있는 파일)의 왕복, detect(`l10n.yaml` 보조 · `aside` · 진입점 `detectCandidatesAcross` 1순위),
      `contract.ts` 매트릭스 편입(ARB regenerate 예외 행), 새 파일은 `representationSource` 경로 + `@@locale`. 검증: red.
- [x] **T1.2 구현** — `json-style.ts` 재사용. 검증: `pnpm test` green. 커밋: `feat(adapters): add ARB catalog adapter`
- [x] **T1.3 껍데기 배선** — typecheck가 못 잡는 손 목록까지 전수(POSTMORTEM 2026-09-02):
      `ADAPTERS` · `SUPPORTED_ADAPTERS`(`lib/locales/add-plan.ts:13`, 문자열 Set) · `lib/import/empty.ts:25` · 온보딩 `probeTargets`(`lib/onboarding/detect.ts:29-52`) ·
      survey `select.ts` + `select-patterns.test.ts` `SHARED` · `renderProjectWorkflowYaml` · `renderProjectGitlabCiYaml`(`lib/onboarding/gitlab-ci.ts:38`) ·
      `lib/cli/gitlab-ci-input.ts` adapter 검증 · `contract.ts` `formatFor`·`baseFixture`·`fourSpaceDonor` · `contract.test.ts` 이름 목록·layout/writeStrategy 표 ·
      `detect-candidates.test.ts` `cases` · 아이콘 분기(`components/sources/sources-screen.tsx:130`) · `lib/openapi` 스냅숏(adapter enum이 실렸으면) ·
      사전 3벌 `newProject.formats` 라벨·예시(`/translate` 모드 ① — 기존 라벨 형, 내부 이름 미노출) · `unsupported-format` 문구(`messages/en.tsx:4528` 지원 포맷 나열).
      검증: 껍데기 테스트가 `.arb`를 내려받는다, `pnpm gate` green(`banned-terms`·`dictionary-consistency` 포함). 커밋: `feat(adapters): wire the ARB adapter`
- [x] **T1.4 재측정** — 모바일 + 기존 2코퍼스, 전부 고정 SHA로 돈다(`--pins docs/adapter-survey/pins*.json` — 모바일은 `pins-mobile*.json`, 기준선 `.scratch/adapter-survey-baseline/*-1.json`). 검증: 기존 표 회귀 0 · mobile-strings M0 기준선과 리포별 1순위 diff 0 · ARB 고정점 100% · 조용한 손실 0 ·
      `resource-limit` 거부 수 보고. 커밋 없음(결과는 T5.2에 기록).
- [x] **T1.5 실물 (수동)** — `/roundtrip`으로 폐기용 Flutter 리포 왕복. 전제: Flutter SDK 설치, 폐기용 리포는 roundtrip 전제 조건 1의 목록에 없으면 새로 만든다.
      검증: 첫 Publish는 고친 셀 + 허용 정규화(spec 완료 조건 1) 외 diff 0, 두 번째 Publish는 고친 셀 외 diff 0, `flutter gen-l10n` 통과.

## 5. 문서 (문서별 커밋)

- [x] **T5.1 `docs(PRODUCT)`** — §0 포맷 수, §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록에 ARB.
- [x] **T5.2 `docs(ARCHITECTURE)`** — §1.9에 재측정 표·판정, 값 표현(design §3), §0 불변식 2·4에 "소스 키 메타데이터(ARB `@key`)도 원본이 준다",
      `contract.ts` 표 예외 행의 근거. 같은 커밋 밖에서 CLAUDE.md 코어 원칙 문구도 맞춘다(`docs(CLAUDE)`, 미러 `pnpm sync:agents`).
- [x] **T5.3 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록.
- 폴더 정리는 이 스펙에서 하지 않는다 — apple-strings·android-strings가 T1.3·표기 규칙을 계속 참조한다. 네 폴더를 android-strings T5.5에서 함께 지운다.
- T5 공통 검증: `pnpm test`(가이드 게이트·`no-korean-ui`) green · `pnpm sync:agents:check` green.
- action·GitLab CI 원본 태그 릴리스는 이 스펙에서 하지 않는다 — android-strings T5에서 세 스펙 합동으로 처리한다(기능 머지 → 새 태그 → SHA 후속 패치).

## 확인 필요 (착수 전)

- ~~**Q2** ARB `@key` 메타데이터~~ → **원본에서 나른다**(2026-10-19 사용자, design §2).
- ~~스펙 분할·출시~~ → **arb · apple-strings · android-strings 셋, 출시·태깅·머지는 한 번**(2026-10-19 사용자, `/feature-review`).
- ~~`@@locale`·orphan `@key`·새 파일 경로~~ → **원본에 있을 때만 생성 · 버림 · `representationSource`**(2026-10-19 사용자, `/feature-review`).
- ~~첫 Publish 정규화·기준선 입력·완료 조건 1 범위~~ → **`@key` 위치·`@@locale` 값은 첫 Publish만 허용 · 리포별 SHA 고정 · 포맷별 후보와 리포 대표 순위 분리**
  (2026-10-19 사용자, Codex 피어 검수).
