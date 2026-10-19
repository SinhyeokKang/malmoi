# arb — tasks

모바일 세 스펙의 첫째다(arb → apple-strings → android-strings). 배치마다 `pnpm gate` green + 학습·홀드아웃 **둘 다** 재측정(ARCHITECTURE §1.9
재측정 트리거)으로 닫는다. **`/merge`는 세 스펙이 다 끝난 뒤 한 번**이다(spec 머리). design-brief 없음 — 새 UI 표면이 없다.

## 0. 공통 (모바일 세 스펙 공용)

- [ ] **T0.1 모바일 코퍼스** — 2026-10-19 표본에서 ARB 9 · Apple 35 · Android 24 리포를 후보로, 학습/홀드아웃을 나눠 `docs/adapter-survey/`에
      `repos-mobile.txt`·`repos-mobile-heldout.txt`·판정 JSON을 만든다. 정답 경로는 사람이 원문을 보고 판정한다(23차 관행).
      apple-strings·android-strings가 같은 코퍼스를 쓴다.
      검증: `pnpm adapter-survey docs/adapter-survey/repos-mobile.txt` 가 clone 실패 0으로 돈다(새 어댑터 전이라 탐지 0이 정상).
      커밋: `docs(adapter-survey): add mobile corpus`

## 1. ARB (`arb-catalog`)

- [ ] **T1.1 테스트** — read(`@key`·`@@*` 제외), write(`@key` 원본 위치 운반 · `@@locale` 생성 · 고정점), detect(`l10n.yaml` 보조 · `aside`),
      `contract.ts` 매트릭스 편입, `create`(기준 언어 표현 + `@@locale`). 검증: red.
- [ ] **T1.2 구현** — `json-style.ts` 재사용. 검증: `pnpm test` green. 커밋: `feat(adapters): add ARB catalog adapter`
- [ ] **T1.3 껍데기 배선** — `ADAPTERS`·온보딩 `probeTargets`·survey `select.ts`·`renderProjectWorkflowYaml`·사전 3벌 어댑터 라벨(`/translate` 모드 ①).
      검증: 껍데기 테스트가 `.arb`를 내려받는다(POSTMORTEM 2026-09-02), `pnpm gate` green.
- [ ] **T1.4 재측정** — 모바일 + 기존 2코퍼스. 검증: 기존 표 회귀 0 · 기존 리포 1순위 불변 · ARB 고정점 100%.
- [ ] **T1.5 실물** — `/roundtrip`으로 폐기용 Flutter 리포 왕복. 검증: 고친 셀 외 diff 0, `flutter gen-l10n` 통과.

## 5. 문서 (문서별 커밋)

- [ ] **T5.1 `docs(PRODUCT)`** — §2 포지셔닝 문구, §4.1 지원 포맷, §7.2 언어 추가·제거 지원 포맷 목록에 ARB.
- [ ] **T5.2 `docs(ARCHITECTURE)`** — §1.9에 재측정 표·판정, 값 표현(design §3), `@key` 운반 규칙.
- [ ] **T5.3 `docs(ACTIONS)`·`docs(DIRECTORY)`·README·가이드**(`/guide` — en·ko·es 같은 커밋) — 지원 포맷 목록.
- [ ] **T5.4 정리** — 결론을 정본으로 올린 뒤 `docs/features/arb/` 삭제.
- action·GitLab CI 원본 태그 릴리스는 이 스펙에서 하지 않는다 — android-strings T5에서 세 스펙 합동으로 한 번.

## 확인 필요 (착수 전)

- ~~**Q2** ARB `@key` 메타데이터~~ → **원본에서 나른다**(2026-10-19 사용자, design §2).
- ~~스펙 분할~~ → **arb · apple-strings · android-strings 셋, 출시·태깅은 한 번**(2026-10-19 사용자, `/feature-review`).
