# sidebar-projects 지휘 계획

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)(2026-10-09 feature-review 반영본). 이 문서는 실행·결정·검증 증거만 기록한다.

## 시작점·권한

- 시작 dev: `f76952b1`(feature-review 반영 커밋, 로컬) · origin/dev `b92cb6b0`.
- 사용자: `/orchestrate sidebar-projects` — 구현·리뷰·dev push·CI·QA·가이드 컷까지. `/merge`·prod DB 없음.
- 지휘자: Claude Code(Opus 5.5). 워커 패밀리는 **Claude Code / Sonnet·Opus만**, effort ≤ high.
- 스키마·마이그레이션 없음 → `/merge` 1단계 prod `db:deploy` 불필요.

## 결정 기록

| ID | 결정 | 근거 |
| --- | --- | --- |
| D1 | ctx `projects?` 선택 필드(생략 → `[]`) | 사용자(feature-review) |
| D2 | 프로젝트 행 이동 뒤 포커스 → 새 구역 Home(`aria-current`)에 `landFocus` | 사용자(feature-review) |
| D3 | 구역 `aria-label` 새 키 `common.nav.yourProjects` = `Your projects` (ko·es는 `/translate` 모드 ①) | 사용자(feature-review) |
| D4 | 목록 = 아바타 메뉴와 같은 `menuProjects`(slug 순 앞 5) | 사용자(feature-review) |
| D5 | 멤버십 0 실물 검증은 단위 테스트로 갈음, T3 미검증 명시 | 사용자(feature-review) |
| D6 | 구현은 배치 하나(A = T1+T2) | 지휘자 판단 — T1·T2가 `nav.ts`·`sidebar.tsx`·`sidebar-work-zone.test.tsx`를 함께 고쳐 병렬 이득이 없다 |
| D7 | T4 정본 문서(PRODUCT·DESIGN·responsive-app·가이드 본문 확인)는 지휘자가 통합 단계에서 문서별 커밋 | 지휘자 판단 — orchestrate §4 "문서 신선도는 지휘자가 문서별 커밋" |
| D8 | T5 범위 = **프로젝트 밖** 셸 컷 전부(`create-repository`·`create-files`·`create-name`·`create-ready` 포함) + `inbox-page`·`inbox-open`·`account`·`preferences-language`·`mcp-*` 등 — 컷마다 판정. `create-ready`는 SHOOTING 벽 절 절차(일회용 프로젝트 → id로 삭제)로 찍는다. 프로젝트 라우트 컷·README(`hero`·`logs`)는 완료 조건 6(프로젝트 라우트 불변)이라 재촬영하지 않는다 | 지휘자 판단 — 선례 2026-10-09 inbox-page D3(셸 변경 → 셸 컷 전부, `create-ready` 일회용 프로젝트 포함) · SHOOTING:153 |
| D9 | 모델: A Opus 5.5 high · R Opus 5.5 medium · Q Opus 5.5 medium · G Sonnet 5.5 high | 지휘자 판단 — 아래 표 |

## 배치·파일 소유권

| 배치 | 항목 | 소유 파일 | 선행 | 모델 / effort · 이유 | dev 완료 차단 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| A 구현 | T1·T2 | `lib/shell/nav.ts`·`switcher.ts`(주석) · `lib/search/nav-index.ts`(주석) · `components/shell/sidebar.tsx` · `components/ui/project-thumbnail.tsx`(주석) · `messages/{en,ko,es}.tsx` · 테스트(`lib/shell/__tests__/nav.test.ts` · `components/__tests__/{sidebar-work-zone,client-graph}.test.*` · 신규 `sidebar-projects-zone.test.tsx`) | — | Opus 5.5 high — 재마운트 포커스 착지 + jsdom fixup observer(POSTMORTEM 09-20·09-24가 두 번 공회전한 부류) | 필수 | 대기 |
| R 리뷰 | A diff | 읽기 전용, `.scratch/review-sidebar-projects-A.md` | A 인계 | Opus 5.5 medium — 독립 리뷰 | 필수 | 대기 |
| Q 런타임 | T3 + A 인계의 (b) | main 체크아웃, 코드 수정 없음 | A dev 통합 | Opus 5.5 medium — ego-browser 실측·판정 | 필수(0개 상태 제외) | 대기 |
| T4 문서 | T4 | PRODUCT · DESIGN · responsive-app spec/design-brief · (필요 시) guide 본문 | A dev 통합 | 지휘자 | 필수 | 대기 |
| G 컷 | T5 | `public/guide/*.webp` · `guide/SHOOTING.md` | Q 완료(dev 서버 직렬) | Sonnet 5.5 high — SHOOTING 절차가 정본인 기계적 촬영 | 필수 | 대기 |

## 파일 겹침·실행 순서

A → R(→ 수정 라운드) → 통합·push·CI → Q ∥ T4(지휘자 문서는 main 체크아웃 커밋 — Q의 dev 서버 중에는 코드 cherry-pick·build만 금지, 문서 커밋은 Q 인계 뒤 몰아서) → G. 병렬 구현 배치 없음.

## 공통 검증·인계

- `/ship bypass`. 임시 브랜치 = dev 등가, **11단계(`/push`) 전에 멈춤**. 워커 `git push`·`/merge`·`/sync`·`db:deploy` 금지. 스키마 변경 금지. `.env.local` 복사 금지.
- 워커 게이트 `pnpm gate --base dev` 하나(출력 파이프 금지).
- 인계 `.scratch/handoff-<batch>.md`: 커밋 SHA · RED/GREEN · 정확한 gate 끝줄 · 계획과 다른 점 · 정본 문서 수정안 · 런타임 (b)만(각 이유).
- 지휘자 통합: cherry-pick → `pnpm gate` → `git push` → 그 HEAD dev CI 결론 확인. red면 소유 워커 수정 전 다음 push 없음.
- QA·컷 결함은 BugShot(`gh issue create` 금지 — BugShot 막힘만 폴백). 커밋은 `Refs #N`.

## 실행 기록

- 2026-10-09: 인테이크. 결정 D1–D5는 feature-review에서, D6–D9는 지휘자 판단.
