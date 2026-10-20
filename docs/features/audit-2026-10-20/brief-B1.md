# B1 — Android writer가 건너뛴 셀을 전달로 세는 문제 (🔴1, ⚪9)

먼저 `brief-common.md`와 `orch.md`를 읽는다.

## 결함

`lib/adapters/android-strings.ts` `writeWithErrors`(약 780~830행)가 **비-base 언어 파일**에서 아래 세 경우 셀을 `continue`로 건너뛰고 오류를 내지 않는다.

1. 그 파일에서 같은 이름이 두 번 나온다 (`counts.has(entry.key) && !slots.has(entry.key)`)
2. 그 파일의 슬롯이 `translatable="false"`
3. 그 파일의 슬롯 값이 리소스 참조(`slot.reference`)

전달 판정(`lib/pull/run.ts:405-420`, `slotlessCells`)은 per-locale 표면에서 **base 파일만** 읽어 자리 유무를 보므로 이 셀은 `split.delivered`에 남는다. 그래서 `saveLastPulledAt`이 미전달 토큰을 지우는데 값은 PR에 없다.

재현: base `values/strings.xml`에 `<string name="brand">Acme</string>`, `values-ko/strings.xml`에 `<string name="brand">@string/app_name</string>`. ko `brand`를 편집하고 Publish(야간·MCP — 미리보기 없이)를 돌리면 `no-changes`로 끝나고 편집이 전달로 기록된다.

근거: POSTMORTEM 2026-10-07 "파일 쓰기 성공과 요청한 값 전달을 같은 것으로 셌다", 2026-10-14 "Publish 미리보기가 실행 … 어긋나", ARCHITECTURE §1.46. 비교 대상: `apple-xcstrings`는 같은 상황에서 `write-slot-not-scalar` 오류를 낸다.

## 할 일

- 재현 테스트를 먼저 쓴다(red): 세 경우 각각에서 writer가 그 셀을 셀 단위 오류로 알리고, 그 결과 전달로 세지지 않는다(어댑터 단위 + 가능하면 pull 실행 시나리오 한 건).
- 고친다: 세 경우가 xcstrings와 같은 부류의 셀 단위 오류(코드는 기존 코드 중 맞는 것 — 새 코드가 필요하면 `adapterErrorKind` 분류까지)를 내게 한다. 오류가 Publish 전체를 막는지, 그 셀만 보류하는지는 xcstrings `write-slot-not-scalar`의 기존 흐름을 그대로 따른다.
- 미리보기(`lib/publish/read.ts`)가 실행과 같은 판정을 하는지 확인한다. 특히 `translatable="false"` 경우 미리보기가 "보낸다"고 약속하지 않게 맞춘다.
- `orphaned`·빈 값의 건너뜀(불변식 3)은 바꾸지 않는다. 그건 의도된 보존이다.
- ⚪9: `lib/adapters/types.ts:34·124·285·297`의 수술적 어댑터 목록 주석에 `android-strings`를 넣는다.
- 판단이 갈리면(예: 기준 파일의 `translatable="false"`는 키가 아예 안 올라오는지) 실제 read 동작을 테스트로 확인하고 인계의 "계획과 다른 점"에 적는다.

## 소유 파일

`lib/adapters/android-strings.ts`(write 경로) · `lib/adapters/types.ts` · `lib/publish/read.ts` · 그 테스트들 · (오류 코드 분류가 필요하면) `lib/adapters/`의 오류 코드 정의 파일.

**건드리지 않는다**: `lib/pull/**`(B3 소유 — 고쳐야 하면 미룬 항목), `lib/adapters/shared.ts`(B5), `android-strings.ts:26` 부근 기준 경로 규칙(B4가 뒤에 다룬다), `messages/*`(사용자 문구가 필요하면 미룬 항목).

## 모델

Claude Opus · effort high.
