# B1 fix2 — 문서 정정 두 건 (재리뷰 Y1·Y2, 결정 D10·D11)

재리뷰 원문: 이 워크트리의 `.scratch/review-B1-2.md`. 코드 변경 없음.

1. **POSTMORTEM 새 항목(`f181ae2e`가 추가한 항목) 정정 — D11.** 아직 push 전이라 append-only 위반이 아니다. 그 항목 안의 "그물"·"대가" 서술을 fix1 결과에 맞게 고친다(참조·`translatable="false"` → 셀 보류, 같은 이름 둘만 프로젝트 차단). 다른 기존 항목은 한 글자도 건드리지 않는다 — `git diff`로 그 항목 범위 밖 변경 0을 확인한다. 커밋 `docs(postmortem): correct the android entry after cell-level withholding`.
2. **ARCHITECTURE §1.46 알려진 한계 — D10.** 보류된 참조·`translatable="false"` 셀에도 기존 키 보류 문장("키가 언어 파일에 없다")이 그대로 나가 사유가 부정확하다는 것을 사용자 결정(사전 유지)과 함께 한두 줄로 적는다. 재리뷰 W2(미리보기가 실행보다 넓게 막는 기존 두 경로)도 같은 절에 한 줄로 남긴다. 커밋 `docs(ARCHITECTURE): …`.
3. `pnpm sync:agents:check` + 문서 관련 테스트만 돌린다(코드 무변경이라 gate 전체는 생략 가능 — 돌렸다면 끝줄을 적는다).
4. `.scratch/handoff-B1.md`에 fix2 절을 덧붙이고 `worker_done` 한 번.
