# disabled-reasons-revert — 태스크

[스펙](spec.md) · [설계](design.md). 커밋 경계는 굵은 머리 단위.

- [ ] **T1 — 회귀 테스트 먼저(red)** `test(disabled-reasons-revert): …`
  - `a11y-reasons.test.tsx`·`home-actions.test.tsx`·`translation-workspace-*.test.tsx`·`edit-loss-banner` 관련 테스트: 사유 줄 0 · describedby → 자기 sr-only + `title` 같은 문장 · [Try again] 같은 형 · EditLossBanner `blockedReason` 이음/액션 숨김. `disabled-reasons.test.tsx`는 T2에서 삭제 대상.
  - 검증: 새 단언이 지금 코드에서 red.
- [ ] **T2 — 버튼·호스트 되돌림 + 프리미티브 삭제(green)** `refactor(…): restore title + sr-only reasons on disabled Sync and Publish`
  - design §2 표대로 `publish-button.tsx`·`sync-button.tsx`·`workspace.tsx`·`home/actions.tsx`·`edit-loss-banner.tsx` · `components/ui/disabled-reasons.tsx`와 그 테스트 삭제 · `content-panel.tsx` 주석.
  - 검증: `pnpm test` green, `grep -r disabled-reasons components app lib` 0.
- [ ] **T3 — 랜딩 목업 사본 제거** `fix(landing): drop the disabled-reason line from the mockup`
  - `components/landing/mockup/translations.tsx` 사유 줄 · `landing-mockup.test.tsx` 대조 삭제.
  - 검증: `pnpm test` green.
- [ ] **T4 — 게이트** `pnpm gate --base dev` → `gate: ok`.
- [ ] **T5 — 정본 문서**(문서별 커밋): DESIGN(§7·§6.4·§5.15·§6.5·§6.615) · DIRECTORY · CLAUDE.md 프리미티브 개수(+ `pnpm sync:agents`).
- [ ] **T6 — 런타임 확인**(로컬 dev, 번역 화면·Home): 미전달 0·EDITOR·끊김 상태에서 머리에 사유 줄 0 · 꺼진 버튼 hover `title` · 375/768/1280. 
- [ ] **T7 — 가이드 컷** `pnpm guide:check` stale 결과대로 `/guide-shots`(없으면 생략).
- [ ] 끝나면 이 디렉터리를 지운다(결론은 DESIGN §7).
