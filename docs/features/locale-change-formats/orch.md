# locale-change-formats 지휘 계획

## 착수

- 정본: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md). 모든 T 항목을 아래 배치에 배정한다.
- 시작 dev: `f482c150d86552121b915bf3bb78749fc9724a8b`. origin/dev 일치·클린트리·CI [39135024706](https://github.com/SinhyeokKang/malmoi/actions/runs/39135024706) success 확인.
- Inbox 지휘자 인계 `msg_8de5efe629bd`: guide stale 0, 워커 정리, dev 소유권 해제. 이 런만 dev 통합·push를 한다.
- 범위: T1–T15 전부. dev preview까지. 프로덕션 /merge 없음. 마이그레이션 없음.

## 결정 기록

- 사용자 요청 경로 `locale-format-changes`는 존재하는 `locale-change-formats`로 해석했고 후속 사용자 인계가 이 경로를 확인했다.
- 사용자 허가: 필요하면 Astra high 사용 가능. 기존 스킬의 Astra medium 상한보다 이번 명시 허가를 우선한다.
- 지휘자 판단 — 신규 화면·시안이 없어 design-sync는 해당 없음. T15의 기존 화면 레이아웃 QA는 필수다.
- 지휘자 판단 — T1/T4/T8이 사전을 공유하고 B가 A 계약에 의존하므로 A→B→C 직렬. 워커 안에서 다른 배치를 기다리지 않는다.
- 지휘자 판단 — 구현 브랜치를 독립 리뷰 후 dev에 통합하므로 임시 자식 워크트리를 쓴다. QA·촬영은 main 체크아웃에서 단일 워커가 직렬 수행한다.
- 코드 계약 변경 전 ARCHITECTURE를 A에서 먼저 별도 커밋하고 D가 최종 코드와 대조한다.

## 배치·소유권·검증

| 배치 | 항목 | 소유 파일 | 선행 | 모델/effort | 출시 차단·게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1,T2,T3; T11 계약 선기록 | lib/adapters/**, lib/survey/one.ts·__tests__/classify.test.ts, messages/{en,ko,es}.tsx(writer 경고만), docs/ARCHITECTURE.md | 인테이크 | Codex gpt-6-astra/high — 생성 결정성·루트·AST 계약 | 차단. red→green, 계약 매트릭스, pnpm gate --base dev, 독립 리뷰 | 대기 |
| B | T4,T5,T6 | lib/locales/**, lib/pull/**, lib/publish/**, lib/import 테스트, lib/mcp 테스트, source-languages.test.tsx 비지원 fixture, messages/en.tsx MCP | A 통합 | Codex gpt-6-astra/medium — 미리보기·실행·관측 정합성 | 차단. T4–T6 원자 커밋, preview==execution, 격리 postgres 포함 gate, 독립 리뷰 | 대기 |
| C | T7,T8,T9 | components/sources/**, components/ui/select.tsx, lib/sources/query.ts, 관련 DOM/순수 테스트·SourceDetail fixture, messages/{en,ko,es}.tsx languagesHelp 삭제 | B 통합 | Codex gpt-6.1-sol/medium — 기존 UI·판정 변경 | 차단. 동작·포커스·300px 테스트, gate, 독립 리뷰 | 대기 |
| D | T10,T11 최종 대조,T12,T12-1,T13 본문 | PRODUCT, ARCHITECTURE, DESIGN, CLAUDE/AGENTS 미러, guide en/ko/es, AUTHORING, README, DIRECTORY 영향 | C 통합 | Codex gpt-6.1-sol/medium — 사실·번역 대조 | 차단. 문서별 커밋, guide 스킬, test·미러·문서 신선도 | 대기 |
| R | 각 A/B/C/D 독립 리뷰 | 리포트만; 해당 diff·인계·POSTMORTEM | 각 배치 완료 | Codex gpt-6-astra/medium — 독립 불변식 검증 | 차단. 🔴 0, 🟡 수정/판정 기록; 시나리오/런타임 분류 확인 | 대기 |
| P | 통합 검증·dev push | 지휘자 dev | D·R 완료 | 지휘자 | pnpm gate, /push 나머지 게이트, 정확 SHA CI success | 대기 |
| Q | T14,T15 | main checkout 읽기·QA 픽스처·BugShot 이슈; 제품 코드 수정 없음 | P | Codex gpt-6.1-sol/medium — 실리포 왕복·전체 레이아웃 | 차단. roundtrip 6종·둘째 Publish, runtime-test 전 범위; 1280/1440/1890·극단 데이터 DOM 실측; DB 사전/사후 복구 표 | 대기 |
| S | T13 스크린샷·매핑 | public/guide/**, guide/SHOOTING.md | Q·수정 재실측 완료 | Codex gpt-6.1-sol/medium — guide-shots | 차단. languages-card·preferences-time-zone 육안 판단, guide stale 0, test | 대기 |
| F | 최종 게이트·push·CI·정리 | 계획 체크·정본·워크트리 정리 | S | 지휘자 | 클린트리·origin/dev 일치·CI success·모든 워커 정리. 정본 승격 후 기능 폴더 제거 | 대기 |

## 파일 겹침

| 조합 | 겹침·판정 |
|---|---|
| A/B/C | 사전·source-languages fixture, B가 A create 계약 소비. 모두 직렬 |
| A/D | ARCHITECTURE. A 선기록 후 D 최종 대조 |
| C/D/S | UI 사실·가이드 SHA·Select 컷. C→D→Q→S |
| Q/통합·build | 같은 main dev 서버·브라우저 쿠키. Q 종료 후에만 통합/build |

## 완료 증거

각 배치의 커밋·gate·리뷰·수정 라운드·실측 결과·push SHA를 완료 때 적는다. `.scratch/locale-change-formats/` 인계는 정본으로 승격할 결론을 추출한 뒤 정리한다.

- Run `run_53e84a84963b`; A Task `task_7bd4435fb133`, Dispatch `ctx_8b8d45c6ad76`, branch `SinhyeokKang/locale-formats-a`. 실제 launch Astra/high 및 activity working 확인.

- A 범위 보완: 지휘자 판단 — 새 AdapterErrorCode 전수 맵을 검사하는 `lib/survey/__tests__/classify.test.ts`는 T1의 필수 배선이라 소유 범위에 포함(`msg_7e8933643f13`).

- 사용자 비용 조정(2026-10-18): 진행 중 A만 Astra high 유지. B·독립 리뷰는 Astra medium, C·D·Q·S는 Sol medium으로 하향. 자동 일괄 상향하지 않고 실제 결함의 난이도에 따라 수정 라운드별 판단.
