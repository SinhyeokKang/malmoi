# sync-lock — tasks

순서: 순수 판정 → 서버 거부 → MCP → Dialog → 문서. `[commit]`마다 `pnpm gate` green(파이프 금지).

- **S1** `planWriteLock` 잎 모듈(`lib/sync/` 옆) + Revert `busy` 술어 교체. 테스트: lease 없음 · 활성 · 경계 정각(활성) · 301초(만료) · `reopensBy`.
  검증 [자동]: `pnpm exec vitest run lib/sync lib/keys` · `client-graph.test.ts` green.
  `[commit] feat(sync): one write-lock judgment for an importing project`
- **S2** `applyKeySave`/`applyKeySaveBatch`가 잠금 안에서 lease를 읽어 거부(`sync-running`, 행 불변). 격리 postgres 행 둘(활성 거부 · 만료 성공) + 순서 두 갈래
  (저장 먼저 → 적재 `reconfirm` · 적재 먼저 → 저장 거부).
  검증 [자동]: `pnpm gate`(트리거 `lib/keys/`로 postgres 스위트가 붙는다).
- **S3** MCP `set_translations`·`revert_to_last_sent` 거부 매핑(C4) + 도구 테스트.
  `[commit] feat(keys): refuse translation writes while a sync holds the project`
- **S4** 번역 화면: 저장 거부 Dialog(초안 유지) · 착지 시 lease 활성이면 Save 끔 + Dialog 한 번. 페이지가 lease 두 컬럼을 읽는다(`loadProject` select).
  검증 [자동]: DOM 테스트(거부 → Dialog · 초안 그대로 · 닫힌 뒤 포커스 저장 버튼).
- **S5** Sync Dialog 진행 → 결과(Home·번역 화면 공용) · 진행 중 닫기 불가 · 결과는 `sync-result` 형 · Home 결과 Alert 제거(C3).
  검증 [자동]: DOM 테스트(확정 → 진행 · Escape 무시 · 결과 · 닫기 · 포커스 트리거 복귀). [수동]: 브라우저로 진행 → 결과 → 닫힘 포커스.
  `[commit] feat(sync): the sync dialog carries progress and result`
- **S6** 문서(design §6) · 가이드 · `/privacy` 영향 없음 확인.
  `[commit]` 문서별
- **S7** 기능 종료 — 결론을 정본으로 올리고 디렉터리 삭제.
