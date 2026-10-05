# sources-add-remove — tasks

하나의 `/orchestrate`. 배치 **A**(2단계 추가 — 서버 변경 없음)와 **B**(제거·되살림)는 독립이라 병렬 가능. `[C]` = 커밋 경계. 스키마·마이그레이션 0 → `/db` 없음.

## 0. 준비
- [x] T0. design-brief로 Claude Design 시안 수령 — 검증: 프레임 A1–A8·R1–R9·L1 링크가 spec 머리에 붙음 (2026-10-05)
- [ ] T0.1. 정본 계약 먼저(CLAUDE.md "계약이 바뀌면 코드보다 먼저") — ARCHITECTURE §0(편집 버리는 길 셋)·§5.5.x·§5.8·`archivedAt` 서술 · PRODUCT §3·§4.1·§7.1·§7.8 · CLAUDE.md 코어 원칙·데이터 변경 경로 표 · ACTIONS `:162` red 조건 — 검증: `pnpm sync:agents:check` green, 문서별 커밋 `[C] docs(...)`

## A. 2단계 추가
- [x] A-T1. `planAddStep` 분리(`planAddBlock`) — 검증: `lib/sources/__tests__/add-block.test.ts` 갱신 + 새 케이스 green
- [x] A-T2. `NamingStep`에서 소스 블록 추출(`SurfaceBaseLocales`, `disabled`를 Select·RadioGroup에 직접 전달) — 검증: `new-project.test.tsx`·`naming-hint.test.tsx`·`form-help-described.test.tsx`·`parallel-p3-consumers.test.tsx` green + 손 사본 0 소스 스캔 케이스
- [x] A-T3. Add sources 2단계(`token-modal` 형: `transitionKey` + 자체 notice, 현행 버튼 배선 `busy`/`aria-disabled` 유지, 확정 `m.settings.sources.confirm`, ②만 `bodyScroll="auto"`, 공통 셀렉트 제거) — 검증: 새 jsdom 테스트(①→②→① 보존, A→B→A, 늦은 미리보기 응답 역전, 진행 중 Radix `disabled`·`pointerType: "mouse"`) + `long-action-transition`·`action-throws`·`a11y-reasons` 갱신 green
- [x] A-T4. 사전 키(②의 제목·설명) en·ko·es(`/translate` ①) — 검증: `dictionary-consistency`·`no-korean-ui` green `[C] feat(sources): two-step add with per-source base language`
- [ ] A-T5. `/design-sync` A 프레임 대조 — 검증: computed style 차이 0 보고

## B. 제거·되살림
### B-순수
- [ ] B-T1. `planSurfaceRevival` — 최신 보관 행 / 어댑터 불일치 create / 활성 행 대상 아님 — 검증: `pnpm test` green
- [ ] B-T2. `planSurfaceRemoval` + `removalReason` — last-source · archived · importing · slug 승계(동률 없음) — 검증: `pnpm test` green
- [ ] B-T3. `classifyMissingSurface` · `removalFingerprint`(용도 구분 — Sync 지문과 충돌 0 케이스) — 검증: `pnpm test` green `[C] test+feat(surfaces): removal planners`

### B-코어 (실 PG — `lib/surfaces/`·`lib/protection/`·`app/api/push/`가 gate 트리거라 `pnpm gate`가 `test:projects:postgres`를 항상 붙인다)
- [ ] B-T4. `create.ts` 되살림 갈래 — 검증 실 PG 케이스(`lib/keys/__tests__/list-aggregates.integration.ts` 형): ① id·slug 유지 ② 옛 번역·orphaned 키 복귀 ③ 기준 언어 변경 + `previousBaseLocale: null` ④ 옛 `lastCommitAt`이 있어도 `stale-commit` 없음 ⑤ 미전달 토큰(orphaned 포함)이 승인돼 덮이고 리포 값 없는 칸은 남음 ⑥ 제거→다른 어댑터 재추가→제거→원 어댑터 재추가에서 최신 일치 행·slug 무충돌 ⑦ owner 경로 계산이 되살린 행 로케일을 씀
- [ ] B-T5. `remove.ts` — 검증 실 PG: 기본 승계 + 복합 FK 유효 · 남은 활성 둘 동시 제거에서 `last-source` 유지 · `importing` 거부 · `stale-approval` · 사건 실패 시 전부 롤백(`lib/events/__tests__/record.integration.ts:161-178` 형) · 번역 행 변경 0
- [ ] B-T6. 사건 렌더 — `view.ts` `surface.removed` 문장, payload 파서 — 검증: `lib/events/__tests__/view.test.ts` 케이스 green `[C] feat(surfaces): remove and revive sources`

### B-껍데기
- [ ] B-T7. Server Action `removeSource`·`previewSourceRemoval` + `locked-access` `SITES` 등록 — 검증: `app/(edit)/__tests__/sources-actions.test.ts`에 EDITOR `forbidden`·archived·stale-approval·`revalidateAfterCommit` 인자 단언 + `locked-access.test.ts` green
- [ ] B-T8. MCP `preview_source_removal`·`remove_source` + `TOKEN_SITES` — 검증: `catalog.test.ts`(순서 배열·"읽기 n 다음 쓰기 n" 제목) · `registry.test.ts`(`en.mcp.tools` 키) · `tools.integration.ts` 웹 패리티 green
- [ ] B-T9. `/api/push`·`/failure` `surface removed` + `NOT_STARTED_REASONS` 일곱째 + `ApplyGuardError` 분리 — 검증: `surface-boundary.test.ts` 갱신(removed vs missing·foreign) + 경합 실 PG(`pg_sleep` 트리거 형)에서 응답·refusal이 `surface-removed` `[C] feat(push): refuse removed sources distinctly`

### B-UI
- [ ] B-T10. 상세 모달 바닥: `notice` 문구 제거 → [Remove source](OWNER, busy·로딩·실패·`refreshFailed`·마지막 소스 상태), Open 꺼짐 사유 sr-only — 검증: jsdom(OWNER만 보임, last-source 사유 보임, busy 중 aria-disabled, EDITOR 버튼 0)
- [ ] B-T11. 확인 창(sync-button 형: 지문 대기 `busy`·발급 실패·stale 재확인, Alert 하나, 초안 동시 폐기, 성공 뒤 h1 포커스 + 결과 배너 `m.sources.workflow`) — 검증: jsdom(미전달·PR·워크플로 줄 조건부, 초안 있을 때 확인 창 하나, 닫힘 후 포커스)
- [ ] B-T12. Logs 필터 `(removed)` + 제거 소스 행 링크 없음 — 검증: `logs` 페이지 테스트 케이스
- [ ] B-T13. 사전 키 en·ko·es(확인 창·사유·배너·사건 문장·거부 문장·MCP 도구 설명, 복수형) — 검증: `dictionary-consistency`·`registry.test.ts` green `[C] feat(sources): remove a source from the detail modal`
- [ ] B-T14. 소비자 회귀 단언 — 제거 뒤 Home·Inbox·검색·셸 전환·야간·Publish에서 사라짐 — 검증: `test:projects:postgres` 케이스
- [ ] B-T15. `/design-sync` R 프레임 대조 — 검증: computed style 차이 0 보고

## 마무리
- [ ] T20. 가이드 Sources·`ai-agents/permissions.md` 세 벌(`/guide`·`/guide-shots`) — 검증: `pnpm guide:check` stale 0, `pnpm test`(no-korean-ui·brand) green
- [ ] T21. `/runtime-test` — 시각·흐름만(자동 검증된 판정은 반복하지 않음): 2단계 모달, 제거 확인 창, 재추가 후 번역 복귀 눈 확인. CI 거부는 `push:local`로 — 검증: BugShot 이슈 0 또는 리포트 링크
- [ ] T22. 정본 반영 체크(DESIGN 새 패턴 — 바닥 왼쪽 위험 동작) 후 `docs/features/sources-add-remove/` 삭제 — 검증: 결론 항목별 정본 위치 목록
