# B1 fix1 — 비-base 참조·`translatable="false"`는 셀 보류 (리뷰 Y1, 사용자 결정 D9)

먼저 `git rebase dev`(B3·B5·B2가 dev에 들어갔다 — `lib/pull/run.ts`·`locales.ts`가 바뀌었다). B3는 끝났으므로 **`lib/pull/undeliverable.ts`는 이제 B1 소유**다.

리뷰 원문: 이 워크트리의 `.scratch/review-B1.md` (Y1·Y2·W2·W4).

## 할 일

- **Y1** — `lib/pull/undeliverable.ts` `classify`에서 per-locale·키 있음·**비-base 파일**의 `write-slot-not-string-literal`(참조·`translatable="false"`)을 **셀 보류**(`{ kind: "cell" }`, ts-dict `write-slot-missing`과 같은 형)로 보낸다.
  - 결과: 편집이 없는 낡은 DB 값은 토큰이 없어 아무 효과가 없고, 편집은 토큰을 남긴 채 그 셀만 빠진다(Publish의 나머지는 나간다). 미리보기도 같은 판정이어야 한다.
  - `key-shadowed`(같은 이름 둘 — aapt2 빌드 오류)는 **프로젝트 차단 그대로** 둔다.
  - 다른 어댑터의 `write-slot-not-string-literal` 분류가 바뀌지 않게 범위를 좁힌다(어댑터·layout·비-base 조건). 바뀐다면 그 이유를 테스트로 고정하고 인계에 적는다.
- **테스트를 먼저**(red):
  - 리뷰 Y1 경로 그대로: DB ko 값이 있고(토큰 없음) ko 파일 그 줄이 참조/`translatable="false"`로 바뀐 상태 + 다른 키 편집 → Publish가 막히지 않고 다른 편집이 전달된다.
  - 그 셀을 편집한 경우 → 그 셀만 보류(토큰 유지), 나머지는 전달.
  - 같은 이름 둘은 여전히 프로젝트 차단.
  - 기존 통합 시나리오(`android-strings-publish.integration.ts`)의 기대를 새 판정에 맞게 갱신(참조·translatable=false는 blocked → 셀 보류).
- **W2**: 셀 보류로 바뀌면 값 비교 순서의 결이 사라지는지 확인하고, 남는다면 주석으로 "왜"를 남긴다.
- **Y2**: `docs/ARCHITECTURE.md` §1.46에 쓰기 쪽 동작을 적는다(비-base: 참조·translatable=false → 셀 보류, 같은 이름 둘 → 키가 붙은 실패로 프로젝트 차단 / base: read가 키를 내지 않아 보류). 커밋은 `docs(ARCHITECTURE): …`로 따로.
- POSTMORTEM 새 항목(`13881190`)의 "대가" 서술이 이제 틀리면, append-only이므로 고치지 말고 인계에 적는다(지휘자가 판단).
- 게이트: `pnpm gate --base dev`. 지금은 다른 구현 워커가 없어 부하가 낮다.
- `.scratch/handoff-B1.md`에 fix1 절을 덧붙이고 `worker_done` 한 번.
