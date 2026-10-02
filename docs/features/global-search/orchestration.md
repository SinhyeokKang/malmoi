# global-search orchestration

## 결정 기록

- 2026-10-03: 사용자가 `/orchestrate docs/features/global-search` 실행을 요청했다. spec의 기존 사용자 결정과 2026-10-03 멤버십 재조회 결정을 유지한다. 새 제품 결정 없음.
- component-unify 디렉터리 없음, LargeModal 상수·Input icon·NoMatch·SearchInput·hand-copies·슬롯 규약 존재 확인. T0에서 모든 참조를 실물과 다시 대조한다.
- 시작 dev: `dac8bcf2643d95b888240d9d55fa113d5ef83beb`. 원격 쓰기는 지휘자만, 최종 목적지는 dev다.
- 구현은 Codex gpt-6.1-sol/high, SQL 성능과 독립 리뷰는 Codex gpt-6-astra/high를 우선한다. 현재 런타임의 모델 ID를 사용하며 시작 receipt의 effective를 확인한다. 패밀리 교차 없음.
- 겹치는 파일을 동시에 편집하지 않는다. 각 구현은 dev 기반 child worktree에서 수행한다. 지휘자의 dev 통합·리뷰 체크아웃과 구현 체크아웃의 충돌을 피하기 위한 격리다.

## 배치 · 소유권 · 게이트

| 배치 | 항목 | 주요 소유 파일 | 선행 | 모델/effort | 차단·검증 | 상태 |
|---|---|---|---|---|---|---|
| GS1 | T0, A 전체 | feature 참조, lib/search 순수 함수, lib/keys/search 순수 부분, nav.ts, layout.tsx, client-graph tests | 없음 | Sol high | 필수; TDD·뮤테이션·pnpm gate --base dev | 로컬 통합 49f62133, 리뷰 2회/수정 1회 |
| GS2 | B, C | lib/keys/search, 통합·성능 tests, app/search, api/search-index, loaders, entry-points/client-graph tests, design 측정값 | GS1 | Astra high | 필수; 테넌트·성능·gate, B4 조건부 | 대기 |
| GS3 | D | ui primitives, 두 셸 header, project-list/switcher, 관련 tests, DESIGN D7 | GS2 | Sol high | 필수; 접근성·포커스·사본 스캔·gate | 대기 |
| GS4 | E, F6 자동 검증 | search UI, messages/en.tsx, layout/headers, workspace, docs hash helper, 관련 tests | GS3 | Sol high | 필수; 레이스·이탈·착지·gate | 대기 |
| GS5 | F, 문서 마무리 | PRODUCT, DESIGN, ARCHITECTURE, CLAUDE+미러, DIRECTORY, README, guide | GS4 | Sol high | 필수; 사실 대조·미러·가이드 검증 | 대기 |
| GS6 | G | 읽기 전용 QA, handoff | 통합·push | Sol high | 필수; ego-browser·BugShot·1280/1440/1890 | 대기 |

## 파일 겹침 행렬

- GS1↔GS2: lib/keys/search.ts, client-graph.test.ts, design.md → 직렬.
- GS1↔GS3: layout 테스트·client graph 전이 그래프, GS3 Command의 GS1 keys 의존 → 직렬.
- GS2↔GS3: client graph·feature 문서 및 gate 출력 소유권 → 직렬.
- GS3↔GS4: 두 header·ui primitive 소비자·hand-copies·messages → 직렬.
- GS4↔GS5: 문서의 코드 값 검증 → 직렬. GS6 동안 dev cherry-pick/build 금지.
- 독립 리뷰는 해당 구현 완료 후 별도 읽기 전용 Dispatch. 지적은 소유 워커의 새 Dispatch로 수정한다.

## 완료 증거

각 배치의 커밋·gate 결과·리뷰·런타임 (b) 항목은 인계 문서에서 확인한 뒤 이 표와 정본에 반영한다. 완료 후 기능 문서의 결론을 정본으로 옮기고 이 디렉터리는 삭제한다.

### 2026-10-03 독립 UI 부분의 병렬 분리

GS1의 T0가 끝난 뒤 실제 파일 집합을 다시 대조했다. GS3a = D1·D2·D6만 따로 실행한다. 소유 경로는 kbd.tsx·highlight.tsx·project-switcher.tsx·project-list.tsx·header-bar.tsx·두 header와 해당 hand-copies/focus/visual/projects-screen/shell-layout/shell-header/public-shell 테스트다. GS1 수정의 lib/search/highlight.ts 및 GS2의 SQL/Action/route/client-graph와 겹치지 않는다. GS3a는 client-graph·layout.tsx·messages·DESIGN·feature 문서를 편집하지 않는다. GS3는 나머지 D3·D4·D5·D5a·D7만 GS2와 GS3a 통합 뒤 수행한다. GS3a Sol/high, gate와 독립 리뷰 필수. 기존 행의 광범위 GS2↔GS3 충돌을 피하려는 실제 파일 분리다.

GS1 증거: 원본 최종 255bf325, 전체 10410 passed + 기존 1 skipped, 격리 PG 521 passed, gate exit 0. 독립 리뷰 공백 스니펫 yellow1은 수정·재리뷰 red0/yellow0. 한 줄 표시는 E 소비자의 normal/nowrap 계약으로 검증한다.

GS3a 증거: 원본 6ae19606, 전체 10385 passed + 기존 1 skipped, gate exit0, 독립 리뷰 red0/yellow0 및 집중196건 통과. dev e143a126까지 통합. 실제 헤더 rect는 GS6. 전용 highlight-kbd.test.tsx 소유권을 승인했다. GS2는 34b8cbd7 기반 Astra/high로 진행 중.
