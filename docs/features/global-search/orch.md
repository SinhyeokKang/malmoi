# global-search orchestration

원본 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md).

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
| GS2 | B, C | lib/keys/search, 통합·성능 tests, app/search, api/search-index, loaders, entry-points/client-graph tests, design 측정값 | GS1 | Astra high | 필수; 테넌트·성능·gate, B4 조건부 | 로컬 통합 7863dc0d, 리뷰 1회/수정 0회 |
| GS3 | D | ui primitives, 두 셸 header, project-list/switcher, 관련 tests, DESIGN D7 | GS2 | Sol high | 필수; 접근성·포커스·사본 스캔·gate | D 전체 통합 894cbfaa, 리뷰 지적0 |
| GS4 | E, F6 자동 검증 | search UI, messages/en.tsx, layout/headers, workspace, docs hash helper, 관련 tests | GS3 | Sol high | 필수; 레이스·이탈·착지·gate | 로컬 통합 ccc84462, 리뷰2회/수정1회 |
| GS5 | F, 문서 마무리 | PRODUCT, DESIGN, ARCHITECTURE, CLAUDE+미러, DIRECTORY, README, guide | GS4 | Sol high | 필수; 사실 대조·미러·가이드 검증 | 로컬 통합 66769ac6, 문서 설명 수정 재확인 중 |
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

### GS3b 병렬 분리와 통합 게이트

- dev e1127736의 GS1+GS3a 통합 `pnpm gate` exit0, 마지막 `gate: ok` 확인(Prisma/typecheck/test/격리 PG/build/mirror). 로그 `.scratch/global-search/gate-integration-1.log`.
- GS3b = D3·D4·D5a만 먼저 병행한다. FieldButton·dialog.tsx 형제 CommandDialog·NoMatch 선택 action 및 해당 focus/DOM tests 소유. GS2의 lib/keys·search loaders·Action/route·entry-points·client-graph와 교집합 없음. GS3b는 lib/**·client-graph·messages·문서를 편집하지 않는다. Sol/high, gate 및 독립 리뷰 필수.
- 남은 GS3 = D5·D7이며 GS2·GS3b 모두 통합 후 수행한다. Command가 처음 keys.ts를 소비하는 정확 그래프 등록은 여기다. GS4는 그 뒤다.

GS3b 증거: 원본 feedca23, 전체10444 passed + 기존1 skipped, gate exit0. 독립 리뷰 red0/yellow0, 기존 DialogContent 바이트 동일 확인. LARGE_MODAL_HEIGHT 공유 추출 수용. 로컬 통합 후 다음 통합 gate는 B3 단독 실측 종료를 기다려 실행한다.

GS2 증거: 원본 bfc1f089, 전체10470 passed + 기존1 skipped, 격리PG539 passed, Node24 gate exit0. 독립 Astra 리뷰 red0/yellow0/white0. 최악 중앙값253.221ms, 최대 Translation 방문200100 <400200, 두 통계 상태의 전체 스캔 대조군 거부. B4 생략으로 마이그레이션 없음. 최종 SQL은 멤버별 LATERAL·두 materialization·C 배열 min 집계이며 설계와 동일 결과/권한 경계라는 독립 판정. 측정값은 design에 보존했고 GS5가 ARCHITECTURE로 옮긴다.

2026-10-03 사용자 결정: 지휘 계획을 먼저 문서화·커밋하고 시작하는 방식을 `/orchestrate`의 고정 절차로 채택했다. 파일 이름은 `orch.md`이며 이번 문서도 이름을 맞췄다. 원본 명령 `.claude/commands/orchestrate.md`와 Codex 미러에 반영한다.

통합 증거: dev24a8f2bd의 Node24 `pnpm gate` exit0, db:generate/typecheck/test/격리PG/build/mirror 전부 통과. 로그 `.scratch/global-search/gate-integration-2.log`.

GS3 D5/D7 증거: 원본6a10d83a, Node24 gate exit0, 10489 passed + 기존1 skipped, 집중215건. 독립 Astra 리뷰 red0/yellow0/white0. Command의 실제 client entry 명시·keys.ts 등록 시점, window capture 선택 콜백 편차 수용. E는 닫힘 예약 후 연결된 링크 클릭을 유지하고 실제 이탈 가드/해시 소비자 시나리오를 검사한다.

### GS5a 서버 문서 병렬 분리

- dev f57dd20e의 Node24 통합 `pnpm gate` exit0, db:generate/typecheck/test/격리PG/build/mirror 전부 통과. 로그 `.scratch/global-search/gate-integration-3.log`.
- GS4(E/F6)가 화면 코드를 구현하는 동안 GS5a(F3/F4)는 이미 통합된 B/C의 서버 사실만 문서화한다. 소유 파일은 ARCHITECTURE.md, CLAUDE.md+AGENTS.md, 새 lib/search 문서 트리거 등록용 .claude/commands/push.md+해당 미러다. GS4 코드·테스트와 교집합 없음. Sol/high, 문서별 커밋·gate·독립 Astra 리뷰 필수.
- GS5는 GS4+GS5a 통합 후 F1/F2/F5/F6 최종 대조/F7·가이드를 맡는다. GS5a는 화면이 이미 조립됐다고 서술하지 않는다. 사용자 결정이나 제품 범위 변경 없음.

GS5a 증거: 원본96d7bea4, 문서3커밋을 dev9f7c4eef까지 통합. Node24 gate exit0,10489 passed+기존1 skipped, 독립 Astra red0/yellow0/white0. 최초 의존성 미설치 실패는 frozen-lockfile 설치로 해소. GS4의 격리PG 성능 검사와 겹치지 않도록 다음 지휘자 통합 게이트는 GS4 통합 뒤 함께 실행한다.

### GS4 독립 리뷰 수정 라운드

- GS4 원본0e8a81fb: Node24 gate exit0,10524 passed+기존1 skipped, 격리PG541 passed. 초기 게이트15건 실패(직접 행 클릭 스크롤·검색 초기 마운트)는 작성자가 수정했다.
- 독립 Astra 리뷰 red0/yellow2: 같은 문서 검색 착지 후 목차 aria-current가 이전 절에 남음(실제 소비자 재현), NavigationDim 정상/이탈 차단 pointer·Enter 경로의 결정적 테스트가 scratch에만 있고 저장소에는 없음. GS4는 아직 미통합이다.
- GS4-fix1은 같은 GS4 워크트리의 후속 Sol/high Dispatch가 맡는다. 기존 작성자는 컨텍스트88%↑로 해제했고 인계·로그를 보존했다. 소유권은 목차·공유 착지 helper·필요한 검색 소비자와 회귀 테스트뿐이다. 테스트 red→fix→gate 및 기존 독립 리뷰어의 재검토 후 통합한다. GS5/GS6는 그 뒤다.

GS4 최종 증거: 원본c2083d9d, Node24 gate exit0,10527 passed+기존1 skipped, 격리PG541 passed. fix1 최초 테스트 scrollTo 오버로드 타입 실패를 수정했고 독립 Astra 재검토 red0/yellow0/white0으로 두 지적 해소. dev ccc84462까지8커밋 통합. 실제 브라우저 치수·착지·IME는 GS6 미검증이다. GS5는 이 구현을 기준으로 F1/F2/F5/F6/F7 및 가이드를 수행한다. 지휘자 통합 gate와 문서 작업은 별도 체크아웃에서 병행하고 PG 성능 실행은 겹치지 않는다.

## 최종 QA·정리

- dev dac8bcf2..5116080d push 완료. 최종 Node24 gate exit0,10527 passed+기존1 skipped, 격리PG541 passed, build/mirror 통과. CI37059221943 success. GS5 문서 재리뷰 red0/yellow0/white0.
- GS6 Chromium 여섯 화면: capsule320×36, 중앙 오차0, Dialog top16, 가로 넘침0. 문서 hash/focus/TOC, 키 선택·스크롤, pointer/Enter dirty guard, 긴 문자열, 로그인/익명·멤버십/보관/역할 재조회 통과. 말모이 결함0.
- 미검증: OS 한글IME, Safari, 스크린리더, disabled-origin focus, native 새 탭 modifier, 일시적 navigation-dim 프레임 녹화. CDP 조합 관측을 OS 검증으로 세지 않는다. G1 전체 native PASS는 주장하지 않는다.
- BugShot 첫 crop 회색 틴트1/2 관측과 정상 재시도는 bugshot-2#246으로 별도 제출. 도구 수정은 범위 밖이며 말모이 가짜 제출·gh 폴백 없음.
- QA 임시 데이터·timestamp·쿠키 원복, DB7표 행 수 동일, 생성 fixture 부재 확인. 소유 서버 종료와 tracked tree clean 확인. 지휘자가 TaskSpace23을 finish({keep:[]})1회로 닫고 모든 워커·child worktree를 정리했다.
- guide:check stale25컷50건은 미갱신 경고로 남는다. 새 검색 가이드 본문 완료. 결론을 정본으로 올렸으므로 다음 커밋에서 기능 디렉터리를 제거한다. orch.md 선작성·커밋 규칙은 원본 명령과 미러에 남는다. 마이그레이션·프로덕션 배포 없음.

통합 gate4: dev1ea0dde1, Node24 exit0,10527 passed+기존1 skipped, 격리PG/build/mirror 전부 통과. GS5 원본e5866015의 문서5커밋을 dev6e035b0e까지 통합, gate exit0(10527 passed+기존1 skipped). 가이드 용어 검사 최초1실패는 first sync로 수정했다. 독립 리뷰에서 DIRECTORY의 NoMatch action 필수 설명1건을 발견해 지휘자가 문서 신선도 커밋66769ac6으로 수정했고 재확인 중이다. guide:check stale25컷50건은 보존; 검색 관련 가이드 본문은 갱신했고 스크린샷은 미갱신 경고로 남긴다. G1은 push 후 TaskSpace23에서 검증한다.
