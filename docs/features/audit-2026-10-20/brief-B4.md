# B4 — base-input 테스트 + Android 기준 경로 규칙 하나로 (🟡7)

먼저 `brief-common.md`와 `orch.md`를 읽는다. **B1이 dev에 통합된 뒤** 시작한다(`android-strings.ts`가 겹친다) — 워크트리가 B1 커밋을 포함하는지 `git log`로 확인한다.

## 결함

- `lib/onboarding/base-input.ts`(새 순수 모듈)에 직접 테스트가 없다. 특히 `manualBasePath`의 정규식 분기(`app/(edit)/projects/actions.ts:588`에서만 쓰임)에 단위 단언이 없다. CLAUDE.md 테스트 우선 규칙 위반.
- Android 기준 경로 규칙이 세 벌이다: `lib/adapters/android-strings.ts:26`(`ANDROID_STRINGS_FILE`, `res|composeResources` 요구) · `lib/surfaces/plan.ts:13` · `lib/onboarding/base-input.ts:12`(디렉터리 제한 없음). 지금은 `lib/onboarding/confirm.ts:95`의 재탐지 대조(`template-mismatch`)가 fail-closed로 막는다.

## 할 일

- `/tdd`로 `validBaseInput`·`manualBasePath` 단위 테스트를 먼저 쓴다(현재 동작 고정 + 세 규칙이 갈리는 입력 — 예: `res/` 밖의 `values/strings.xml`).
- 규칙을 한 곳(어댑터 쪽 정의가 정본일 가능성이 높다 — 판단해서)으로 모으고 나머지 둘이 그것을 쓰게 한다. 규칙이 실제로 달라야 하는 이유(사용자 입력 단계는 더 느슨해야 하는 등)를 찾으면 합치지 말고 그 이유를 주석으로 남긴 뒤 인계에 적는다.
- 사용자에게 보이는 거부 동작이 바뀌면 인계의 "계획과 다른 점"에 적는다.

## 소유 파일

`lib/onboarding/base-input.ts` · `lib/surfaces/plan.ts` · `lib/adapters/android-strings.ts`(기준 경로 규칙 부분만) · 관련 테스트.

**건드리지 않는다**: `lib/onboarding/gitlab-ci.ts`(B2), `lib/onboarding/ingest.ts`(B5), `docs/DIRECTORY.md`(지휘자).

## 모델

Claude Sonnet · effort medium.
