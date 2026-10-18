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
| A | T1a, T1b와 모든 하위 검증 | lib/query-list.ts, lib/events/filter.ts, lib/inbox/filter.ts, lib/inbox/__tests__/filter.test.ts, components/__tests__/client-graph.test.ts | 없음 | gpt-6.1-sol/high | 파서·전수 종류·검색·실효 필터·순서·unread 및 gate | 완료·dev 통합 (명부 등재 D) |
| B | T2와 모든 하위 검증·동일 커밋 문서 | components/ui/filter-menu.tsx, Logs 필터, translations/workspace 필터 및 호출부, visual-system/hand-copies 테스트, CLAUDE.md와 생성 미러, DESIGN §6.4, DIRECTORY | 없음 | gpt-6.1-sol/high | 기존 소비자 회귀·직속 버튼·미러 및 gate | 완료·dev 통합 |
| C | T3와 모든 하위 검증 | messages/en·ko·es.tsx, i18n function-args 및 동일 값 허용 목록 | 없음 | gpt-6.1-sol/medium | translate 모드 ①, 사전·용어 및 gate | 완료·dev 통합 |
| R1 | A/B/C 독립 리뷰 | 리포트만 | A/B/C 완료 | gpt-6-astra/medium | 인계 주장·diff·POSTMORTEM·시나리오 분류 | A/B/C 모두 통과 |
| D | T4와 모든 하위 검증 | inbox-filters, inbox page/loading/list, lib/routes.ts, page/scenario/loading-parity/entry-points 및 새 DOM 테스트 | A/B/C dev 통합 | gpt-6.1-sol/high | DOM·읽음·헤더 불변·골격 3언어 및 gate | gate 통과·R2 중 |
| R2 | D 독립 리뷰 | 리포트만 | D 완료 | gpt-6-astra/medium | 인계·포커스·라우팅·경계 검토 | 착수 |
| E | T6 정본 및 가이드 본문 | PRODUCT, DESIGN, DIRECTORY, guide/en·ko·es/translate/edit.md | D 통합 | gpt-6.1-sol/medium | guide 규칙·문서별 커밋·신선도 | 대기 |
| Q | T5 전체 + 공통 레이아웃 QA | 코드 수정 없음, main 체크아웃, DB fixture 원복표 | D/E 통합·로컬 gate (push 보류 중에도 진행) | gpt-6.1-sol/high | 축/조합/탐색/키보드·375/1280/1440/1890·3언어×2테마·높이 0px, BugShot 즉시 제출 | 대기 |
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
- 지휘자 판단 — 병렬 전체 스위트에서 스캐너 시간 초과가 발생해 최종 gate만 공유 flock으로 직렬 실행한다. `.scratch/inbox-filter-search/gate.py`는 Node24의 `pnpm gate --base dev`를 그대로 실행하고 종료 코드를 반환한다. 기준·제한 시간은 변경하지 않는다.
- C: 새 Kind 축 사본은 가이드 aria 전용 라벨 검사와 겹쳐 제거했다. D는 기존 `m.logs.filters.axis.kind`를 재사용한다.
- D: 실제 긴 이름 소비자 구현에 필요한 경우 `FilterMenu` 트리거 폭 prop을 최소한으로 추가하는 몫도 D가 소유한다(B 후 직렬). 미사용 확장 prop 선반영은 하지 않는다.
- B 완료: `44d69dc4`, `12dd365b`; Node24 직렬 gate `ok`, 901 files / 16,004 passed / 2 skipped, build·미러 성공. 독립 리뷰 R1을 배치별 Dispatch로 나누어 B부터 시작한다(A/C는 최종 gate 중).
- 범위 밖 미추적 `docs/features/locale-change-formats/` 발견: 이번 세션에서 편집·stage하지 않는다.
- R1-B `ctx_e19c557e8bc3`: Astra medium 독립 리뷰 🔴0/🟡0, DOM 3파일 30건 재검증. B 통합 승인. 런타임 기하/포커스는 Q가 검증한다.
- B 통합: `a6ec73f9`, `bc89b69c`. 추적 미커밋 0·git cherry +0 확인 후 워커 해제·워크트리 삭제. 인계는 main .scratch/inbox-filter-search에 복사. 후속 결함은 D 소유.
- C 완료: `c8a06059`, `8723284f`; Node24 직렬 gate ok, 16,000 tests passed / 2 skipped, build·미러 성공. R1-C 시작. 한국어는 translate 스킬의 "gate green이면 통합하고 사용자가 /merge 전에 모아서 본다"에 따라 초안 검수표를 인계에 보존하며 dev 통합을 차단하지 않는다.
- R1-C `ctx_51333267628f`: Astra medium 🔴0/🟡0, 독립 테스트 98 passed / 1 skipped 및 계약 34 assertions. C 통합 승인.
- 사용자 지시(2026-10-18): `docs/features/locale-change-formats`가 커밋될 때까지 push 보류. 구현·리뷰·로컬 검증은 계속하며 해당 문서는 수정·stage·커밋하지 않는다. 원격 push 직전 이 경로의 커밋 완료 여부를 확인한다.
- C 통합: `372ed639`, `0ea7df8b`. 추적 미커밋 0·git cherry +0 확인 후 워커/워크트리 정리. 인계·ko 표는 main scratch에 보존. 이후 사전 수정은 D에 이관한다.
- A: `718e2754`, `e4008157` 구현 커밋 확정. 단독 재시도 901파일·16,061 tests passed / 2 skipped, 격리 PG 단계 진행 중. 확정 diff로 R1-A를 병행하며 gate 완료 전 통합하지 않는다.
- R1-A `ctx_0c77b2240ec1`: 🔴0/🟡0, 독립 163 tests passed 및 추출 본문 동일성 확인. 참고 1건: query-list.ts 끝 빈 줄(diff --check exit2)은 D에서 제거한다. 최종 gate는 별도 대기.
- A 최종 완료: `718e2754`, `e4008157`, `5c3553ac`. 단위/DOM 16,061 passed, 격리 PostgreSQL 898 passed, build·미러 gate ok. EOF는 A가 마지막 정리 커밋으로 제거했고 대상 163건 재검증. 지휘자가 마지막 whitespace-only diff 확인, D의 EOF 정리 몫은 해소됐다.

- A 통합: fb80f919, 8eff5540, f4e30a78. D 시작 기준 f4e30a78 이후 계획 갱신 커밋. A/B/C 잔여 구현 소유권과 사전 보정은 D로 이관한다.

- D 소유권 추가: 새 Inbox Clear filters의 RotateCcw 실제 소비자 두 경로를 visual-system.test.ts의 CLEAR 정확 명부에 등재한다. 검사 완화는 없다. 사용자 push 보류 동안 Q는 로컬 gate 뒤 진행할 수 있다.

- 사용자 push 보류 해제: locale-change-formats 문서가 0dbb94fa로 커밋됐고 작업 트리가 깨끗함을 확인했다. 최종 gate 후 dev push를 진행한다.

- D 완료: 67a3762c, 1d6dda04; Node24 gate ok (16,082 passed / 2 skipped), build·미러 성공, diff --check·작업 트리 깨끗함. R2 task_3d6349c98f0e / ctx_f1583cfc934c를 기존 Astra medium 리뷰 터미널에서 시작했다.
