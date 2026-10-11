# mockup-viewport-container — 지휘 계획 (orch)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)(2026-10-11 `/feature-review` 반영 `c888d83c`). 시안 없음.
착수: 2026-10-11 · 시작 dev `35c14892` · 지휘자 Claude Code(Opus 5.5) → 워커 패밀리 Claude Code / Sonnet·Opus.
**다음 orch**: [disabled-reasons-revert](../disabled-reasons-revert/) — 이 orch가 dev 통합·QA까지 끝난 뒤 직렬로 잇는다(2026-10-11 사용자 "직렬로 이어서").

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | 두 orch를 **직렬**로 잇는다 — 이 orch(목업)가 dev 통합 + QA까지 끝난 뒤 disabled-reasons-revert orch를 연다. 지휘자는 코드를 쓰지 않는다 | 2026-10-11 사용자("목업만" → "번복. 직렬로 이어서 이 세션에서 모두 진행해" → "orch 두개를 이어 붙이라니까") |
| D2 | 배치 하나(**A**)가 tasks T1~T5를 든다 — T5(DESIGN §6.615·§5 · PRODUCT §4.1 정본)도 A가 문서별 커밋으로 쓴다 | 지휘자 판단 — 배치가 하나라 정본 절이 겹칠 상대가 없다 |
| D3 | `components/__tests__/landing-mockup.test.tsx`는 A가 **matchMedia 스텁 기본값(D)과 그릇 폭 단언만** 고친다 — `DisabledReasons` 대조(:722·:731)·`components/landing/mockup/translations.tsx`는 건드리지 않는다 | disabled-reasons-revert design §2.5가 rebase 뒤 그 몫을 든다 |
| D4 | T6 런타임은 단일 QA 워커(main 체크아웃, ego-browser + CDP 리사이즈), 결함은 BugShot 즉시 | tasks T6 · orchestrate §5 · 메모리 ego-spaces-share-session |
| D5 | 가이드 컷·README 영향 없음 | 지휘자 판단 — SHOOTING 매핑에 랜딩 컷 없음 |
| D6 | 스키마·환경변수·사전 키 추가 없음 | spec 범위 |

## 배치

| 배치 | 항목 | 소유 파일 | 건드리지 말 것 | 모델·effort | 선행 | 상태 |
|---|---|---|---|---|---|---|
| **A** 뷰포트 그릇 | tasks T1~T5 (design §1~§5) | `lib/landing/stage.ts` · `lib/landing/__tests__/stage.test.ts` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` · `lib/shell/breakpoint.ts` · `lib/shell/__tests__/breakpoint.test.ts` · `components/landing/mockup/app-frame.tsx`(주석 :50만) · `components/__tests__/landing-mockup.test.tsx`(D3 범위만) · `docs/DESIGN.md`(§6.615·§5) · `docs/PRODUCT.md`(§4.1) | `components/landing/mockup/translations.tsx` · `publish.tsx` · 앱 컴포넌트 · `components/ui/*` · `messages/*` | Opus 5.5 high — 결정성·리사이즈 보존이 걸린 스크롤 수학 | 없음 | 착수 전 |
| **R** 리뷰 | A diff 독립 리뷰(리포트 전용) | — | 코드 수정 금지 | Opus 5.5 medium | A worker_done | — |
| **Q** QA | tasks T6 | main 체크아웃(읽기) | 코드 수정 금지 | Opus 5.5 medium | A dev 통합 | — |

겹침: 배치 하나 — 없음.

## 검증 게이트

- 워커: TDD(T1 red → T2 green) · `pnpm gate --base dev`(파이프 금지) · `/ship bypass` 11단계(`/push`) 전 정지.
- 리뷰: 🔴 0까지 수정 라운드.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `&&` push → dev CI 결론.
- 런타임: Q(tasks T6 수치 판정).

## 진행 기록

- 2026-10-11 orch 작성.
