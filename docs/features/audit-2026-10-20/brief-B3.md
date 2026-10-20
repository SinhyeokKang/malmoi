# B3 — survey가 프로덕션 파일 선택을 지나게 + 경로 계산 사본 정리 (🟡6, ⚪10)

먼저 `brief-common.md`와 `orch.md`를 읽는다.

## 결함

- 🟡6: `lib/survey/one.ts:184-200`의 `surveyLocalePath`·`filesForFormat`가 프로덕션 `selectLocaleFiles`(`lib/push/payload.ts:43-54`)를 부르지 않고 basePath 분기를 따로 구현했다. 정렬도 다르다(프로덕션은 `format.locales` 순서, survey는 `compareKeys`). `base-path-sites.test.ts`는 분기 자리의 **개수**만 세서 내용이 갈라져도 못 잡는다. 근거: POSTMORTEM 2026-09-02 "지표가 반년째 0" — 측정은 프로덕션 판정 함수를 써야 한다.
- ⚪10: `lib/pull/locales.ts:270`, `lib/pull/run.ts:368`이 경로를 `pathTemplate.replaceAll("{locale}", …)`로 직접 만든다. 이미 있는 경로 계산 함수(`localeFilePath` 등 — 찾아서 쓴다)로 바꾼다. 근거: POSTMORTEM 2026-09-09 경로 보간 부류.

## 할 일

- survey가 `selectLocaleFiles`(또는 그것이 쓰는 같은 판정)를 지나게 한다. 정렬 차이가 측정 출력에 영향을 주면 그 영향을 테스트로 고정하고 인계에 적는다.
- `base-path-sites.test.ts`가 개수만 세는 문제는, survey가 프로덕션 함수를 부르게 된 뒤에도 필요한지 판단해 갱신한다.
- 경로 계산 사본 두 곳을 기존 함수로 바꾼다. 결과 바이트가 같아야 한다(결정성) — 기존 테스트가 지켜보는지 확인하고 없으면 단언을 더한다.
- `pnpm adapter-survey`는 돌리지 않는다(네트워크 4분).

## 소유 파일

`lib/survey/**` · `lib/pull/locales.ts` · `lib/pull/run.ts`(경로 계산 부분만) · 관련 테스트 · 필요 시 `lib/push/payload.ts`(export만).

**건드리지 않는다**: `lib/adapters/**`, `lib/publish/**`(B1), `lib/onboarding/**`(B2·B4·B5).

## 모델

Claude Sonnet · effort medium.
