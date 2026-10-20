# B1 독립 리뷰 (리포트 전용 — 코드 수정·커밋 금지)

대상: 워크트리 `~/orca/workspaces/malmoi/audit-b1`, 브랜치 `SinhyeokKang/audit-b1`의 `1cd4223e`·`3c57ce71`·`13881190` (`git log $(git merge-base dev HEAD)..HEAD`).
계획: `docs/features/audit-2026-10-20/brief-B1.md`. 인계: 그 워크트리의 `.scratch/handoff-B1.md` — **인계의 주장을 그대로 믿지 말고 코드·테스트로 검증한다.**

## 볼 것

1. **결함이 실제로 닫혔나** — 비-base Android 파일의 중복 이름·`translatable="false"`·`@string/` 참조 셀이 이제 전달로 세지지 않는가. 통합 테스트(`lib/pull/__tests__/android-strings-publish.integration.ts`)가 수정 전 코드에서 red였다는 주장이 테스트 구조상 성립하는가(이름만 정확한 테스트 — POSTMORTEM 2026-09-03).
2. **차단 범위의 대가** — 인계 "대가": 그런 비-base 셀에 편집이 아닌 옛 DB 값이 남아 파일 값과 다르면 프로젝트 Publish 전체(야간 포함)가 `writer-warnings`로 막힌다. 판정해라:
   - 실제로 그 상태가 어떤 경로로 생기나(push strict가 unmanaged 슬롯의 DB 값을 어떻게 다루는지 `lib/push/apply.ts`·read의 `value-not-string`을 따라가 확인). 정상 흐름에서 생기지 않는다면 대가는 이론적이다.
   - 생긴다면 xcstrings·yaml의 같은 차단과 동등한가, 아니면 Android만 더 쉽게 걸리는가.
   - 사용자 결정이 필요한 지점인지(셀 단위 보류로 바꾸려면 `lib/pull/undeliverable.ts`를 고쳐야 한다).
3. **기준 파일 경우를 알리지 않는 판단**(인계 "계획과 다른 점") — base 파일의 세 경우가 정말 `keySlot` `absent` → 보류로 세지는가.
4. **미리보기 정렬** — `lib/publish/read.ts`를 안 고쳐도 미리보기가 실행과 같은 판정인가. 특히 `translatable="false"`.
5. 불변식: 병합 없음(원본 값과 DB 값을 견줘 고르는 분기가 새로 생겼나 — `slot.value === entry.message` 건너뜀은 기존 것), 결정성, 기존 사전 문장 재사용의 적절성.
6. `docs/POSTMORTEM.md` 새 항목이 append-only 형식을 지키고 재발 방지 grep이 실제로 이 결함을 잡는가.

## 산출

`~/orca/workspaces/malmoi/audit-b1/.scratch/review-B1.md`에 🔴/🟡/⚪ + 판정 근거(파일:줄). 2번은 "사용자 결정 필요 / 불필요" 결론을 명시한다. 그 뒤 `worker_done` 한 번. 한국어.
