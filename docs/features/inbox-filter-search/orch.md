# inbox-filter-search orchestration

## 범위와 시작점

- 정본: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md). T1a–T6 전체를 dev까지 반영한다. 프로덕션은 별도 `/merge`다.
- 시작 dev: `97ea8678a1b582fbb0da41848078d7d34852fa62` (origin/dev와 동일, 깨끗한 작업 트리).
- 선행 language-request-todo: plan의 union 및 row-slots가 호출하는 attention-view의 language_unsent 렌더를 확인했다.
- Orca Run: `run_ae50d5479fd5`. 원격 쓰기는 지휘자만 수행한다.

## 결정 기록

- 지휘자 판단 — 이미 feature-review를 반영한 spec/design에 제품 결정이 확정되어 있어 추가 질문은 없다.
- 지휘자 판단 — 기존 Inbox 수정이며 시안을 받지 않는다고 spec이 명시한다. DS는 비대상이고 T5의 레이아웃 QA를 수행한다.
- 지휘자 판단 — 어댑터·push/pull 변경이 없어 roundtrip은 비대상이다. 스키마·환경변수 변경 및 prod db:deploy도 없다.
- 사용자: 필요하면 effort high 사용. 로컬 모델 목록에서 gpt-6.1-sol 및 gpt-6-astra와 지원 effort를 확인했다. 구현은 Sol high(회귀·파서·포커스 경계), 사전/문서는 Sol medium, 독립 리뷰는 Astra medium(스킬 상한 유지).
- 구현 워커는 dev에서 갈라진 임시 자식 워크트리다. 독립 커밋·게이트의 작업 트리 충돌을 방지한다. QA는 main 체크아웃 단일 워커다.

## 배치와 소유권

모든 행은 출시 차단이며 통과 증거가 있어야 완료한다. 각 배치는 `/ship bypass`를 11단계 전까지 수행한다.

| 배치 | tasks 항목 | 소유 파일 | 선행 | 모델/effort | 검증 | 상태 |
|---|---|---|---|---|---|---|
| A | T1a, T1b와 모든 하위 검증 | lib/query-list.ts, lib/events/filter.ts, lib/inbox/filter.ts, lib/inbox/__tests__/filter.test.ts, components/__tests__/client-graph.test.ts | 없음 | gpt-6.1-sol/high | 파서·전수 종류·검색·실효 필터·순서·unread 및 gate | 실행 중 |
| B | T2와 모든 하위 검증·동일 커밋 문서 | components/ui/filter-menu.tsx, Logs 필터, translations/workspace 필터 및 호출부, visual-system/hand-copies 테스트, CLAUDE.md와 생성 미러, DESIGN §6.4, DIRECTORY | 없음 | gpt-6.1-sol/high | 기존 소비자 회귀·직속 버튼·미러 및 gate | 실행 중 |
| C | T3와 모든 하위 검증 | messages/en·ko·es.tsx, i18n function-args 및 동일 값 허용 목록 | 없음 | gpt-6.1-sol/medium | translate 모드 ①, 사전·용어 및 gate | 실행 중 |
| R1 | A/B/C 독립 리뷰 | 리포트만 | A/B/C 완료 | gpt-6-astra/medium | 인계 주장·diff·POSTMORTEM·시나리오 분류 | 대기 |
| D | T4와 모든 하위 검증 | inbox-filters, inbox page/loading/list, lib/routes.ts, page/scenario/loading-parity/entry-points 및 새 DOM 테스트 | A/B/C dev 통합 | gpt-6.1-sol/high | DOM·읽음·헤더 불변·골격 3언어 및 gate | 대기 |
| R2 | D 독립 리뷰 | 리포트만 | D 완료 | gpt-6-astra/medium | 인계·포커스·라우팅·경계 검토 | 대기 |
| E | T6 정본 및 가이드 본문 | PRODUCT, DESIGN, DIRECTORY, guide/en·ko·es/translate/edit.md | D 통합 | gpt-6.1-sol/medium | guide 규칙·문서별 커밋·신선도 | 대기 |
| Q | T5 전체 + 공통 레이아웃 QA | 코드 수정 없음, main 체크아웃, DB fixture 원복표 | D/E 통합·gate·push | gpt-6.1-sol/high | 축/조합/탐색/키보드·375/1280/1440/1890·3언어×2테마·높이 0px, BugShot 즉시 제출 | 대기 |
| S | T6 inbox-page.webp 재촬영 | public/guide, guide/SHOOTING.md | Q 완료 | gpt-6.1-sol/medium | guide-shots·guide:check stale 0 | 대기 |
| F | T6 계획 정리·최종 push | 기능 폴더 삭제, 최종 신선도 문서 | 전 항목·수정·재검증 완료 | 지휘자 | pnpm gate, dev CI green, 워크트리 정리 | 대기 |

## 겹침과 순서

- A/B/C 파일 겹침은 0이므로 병렬. A의 client-graph와 B의 visual-system/hand-copies는 서로 다른 파일이다.
- D는 A/B의 새 모듈 및 C 사전을 소비하므로 dev 통합 후 시작한다. 기다리는 워커를 띄우지 않는다.
- E는 B의 DESIGN/DIRECTORY와 겹치므로 B/D 뒤 직렬이다. 사전 후속 수정은 C 또는 D의 새 Dispatch로 소유권을 명시한다.
- Q/S는 브라우저 세션을 공유하므로 직렬이다. QA 중 main cherry-pick/build 금지. 결함 수정은 소유 워크트리에서 진행하고 QA 뒤 통합한다.
- 검증 체크리스트 T1a/T1b/T2/T3/T4/T5/T6의 모든 하위 항목은 위 담당 행에 포함한다. DS·roundtrip 비대상 판정도 기록했다. 주인 없는 항목 0.

## 완료 증거

착수 전. 배치별 커밋, 리뷰 라운드, gate, CI, QA, 미완 항목을 진행 중 기록한다.

- A: task_c2e742929cd0 / ctx_fb12de2b66f1 / ifs-a / Sol high, activity working 확인.
- B: task_c3e51e771d34 / ctx_b54b9b22c5bb / ifs-b / Sol high, activity working 확인.
- C: task_b11d264c8251 / ctx_0db408f14b5e / ifs-c / Sol medium, activity working 확인.
- 지휘자 판단 — T1b의 `CLIENT_LIB_FILES` 등재는 실제 클라이언트 소비자가 생기는 D 커밋으로 이관한다. 정확 일치 검사를 완화하지 않는다. A는 독립 잎 그래프 검증을 수행한다. A가 지시 수신·적용을 확인했다.
- 지휘자 판단 — T2의 parallel-p3-search-filter-consumers 테스트 import/JSX 이름 변경은 호출부 개명에 포함한다. 동작 단언 변경·호환 alias는 없다.
- 검증 런타임: 시스템 Node26 대신 B가 저장소 밖에 마련한 `/tmp/malmoi-node24/node-v24.15.0-darwin-arm64/bin`을 PATH 선두에 둔다. 의존성·환경 파일 변경 없음.
