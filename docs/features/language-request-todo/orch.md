# language-request-todo — orch

> 지휘 계획. 원본은 [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) · [design-brief](./design-brief.md)이고 여기에 복제하지 않는다.
> 착수 2026-10-18 · 시작 dev `1191e41b`(landing-kv-background 런 직후 같은 세션에서 직렬로 이었다 — 사용자) · 지휘자 Claude Code(Opus 5.5) · 끝은 dev push다(`/merge`는 사용자가 부른다).

## 착수 범위

tasks T1–T11 전부(T0 완료). 스키마·마이그레이션·새 환경변수·새 패키지 없음 — 셀프 호스팅 체크리스트 해당 없음.

## 결정 기록

사용자 결정은 design.md "결정"(Q1–Q5 · S1 · D1–D15)과 design-brief "시안 수령 뒤 결정"이 정본이다. 이 런에서 더한 것:

| # | 결정 | 출처 |
|---|---|---|
| O1 | ko·es 낱말(§10.1 "언어 변경 미전달" 행)은 A가 `/translate` 모드 ①로 정한다. ko는 사용자가 `/merge` 전에 일괄 검수하고, es는 에이전트 초안이다 | 지휘자 판단 — CLAUDE.md 워크플로("ko는 사용자가 `/merge` 전 일괄 검수") |
| O2 | `projectTodos` 입력에 `language`가 필수로 들어가 호출부가 깨지면, A는 호출부(`lib/keys/query.ts` · `lib/inbox/load.ts`)에 `language: null`만 넘겨 green을 유지하고, 실제 일괄 읽기 배선은 C(T6)가 한다 | 지휘자 판단 — 배치 경계를 지키면서 커밋마다 gate green |
| O3 | T8 `/design-sync`를 둔다 — 기존 화면 수정이지만 이 기능용으로 사용자가 승인한 시안(`Language Request Todo.dc.html`)이 있다 | 지휘자 판단 — 메모리 "design-sync-when-canon-prepared"(search-ux-unify 선례) |
| O4 | 워커는 Claude Code(Opus 5.5)만 쓴다 | 지휘자 런타임 경계 — 패밀리 교차 허가 없음 |

## 배치

| 배치 | tasks | 소유 파일(쓰기) | 선행 | 워커 · 모델 · effort | 출시 차단 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| A | T1 → T3 → T4 → T5 | `messages/{en,ko,es}.tsx` · `docs/DESIGN.md` §10.1 행 · `lib/i18n/__tests__/terminology.test.ts` · `lib/locales/todo.ts`(새) · `lib/inbox/{project-todos,plan}.ts` · `lib/projects/list.ts` · `lib/home/{attention-view,cards,meta}.ts` · `lib/protection/plan.ts` · `components/home/{count-cards,hold-later}.tsx` · 각 테스트 · (O2) 호출부 `null` | — | 워크트리 · Opus 5.5 high — 2,880 표 · 보류 판정 = 게이트 셋 일치 표 · exhaustive 갈래 | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| B | T2 | `lib/locales/work.ts` · `lib/locales/__tests__/*` (격리 PG 포함) | — | 워크트리 · Opus 5.5 high — 승인 지문·`deliveredForRequests` 불변식(POSTMORTEM 2026-10-14) | 예 | `pnpm gate --base dev`(격리 PG 자동) · 독립 리뷰 | 대기 |
| C | T6 → T7 | `lib/keys/query.ts` · `lib/inbox/load.ts` · Home `page.tsx` · `components/projects/project-list.tsx` · `components/inbox/row-slots.tsx` · Home 카드·메타 열 컴포넌트 · 각 테스트 | A·B 통합 | A 터미널 새 Task · Opus 5.5 high | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| DS | T8 `/design-sync` — `Language Request Todo.dc.html` 프레임 1–8 · 5b | 없음(리포트 전용 · BugShot) | C 통합 · **push 전** | main 체크아웃 QA 워커 · Opus 5.5 medium | 예 | 불일치 0 | 대기 |
| QA | T9 `/runtime-test` — 폐기용 새 프로젝트(D15), 장면 ①②③ | 없음(리포트 전용 · BugShot) | DS 뒤 dev push | DS와 같은 워커의 새 Task | 예 | 이슈 0 또는 수정·재실측 | 대기 |
| DOC | T10 정본 · T11 가이드 + 이 디렉터리 삭제(지휘자) | `docs/{DESIGN,ARCHITECTURE,PRODUCT,DIRECTORY}.md` · `guide/{en,ko,es}/…` | QA 완료(문서는 QA와 병행 가능) | C 터미널 새 Task | 아니오 | `/push` 4단계 · `pnpm guide:check` | 대기 |

| K (곁 배치) | landing-kv-autosweep K1–K3 — `docs/features/landing-kv-autosweep/` | `lib/signin/dot-field.ts` · `components/signin/dot-field.tsx` · 각 테스트 · DESIGN §6.62·§6.615 행 · DIRECTORY dot-field 서술 | — | 워크트리 `lkv-auto` · Opus 5.5 medium | 아니오 | `pnpm gate --base dev` · 지휘자 diff(작은 변경) | 진행 |

K는 이 런과 다른 기능이지만 같은 Run에 붙였다(사용자 2026-10-18 — 랜딩 커서 추종 제거 · 패널 밖 줄바꿈 · 로그인 현행 유지). K4 런타임 확인은 QA 브리프에 얹는다.

### 파일 겹침

A와 B는 쓰기 파일이 겹치지 않는다 → **병렬**. A의 `todo.ts`는 `work.ts`의 `SurfaceLocaleState`를 `import type`으로만 읽는다(이미 있는 타입). C는 A의 호출부(O2)·Home 컴포넌트와 겹치므로 A·B 통합 뒤 직렬이다. `messages/*`는 A만 쓴다 — C·DOC가 새 키가 필요하면 그 배치 안에서 세 사전을 함께 고친다(A 통합 뒤라 겹치지 않는다).

### 주인 없는 tasks 항목 대조

T0(완료) · T1 A · T2 B · T3 A · T4 A · T5 A · T6 C · T7 C · T8 DS · T9 QA · T10 DOC · T11 DOC — 0건.

## 진행 기록

- 2026-10-18 Run `run_a8efa5c8272a`. A = 워크트리 `lrt-a` · Dispatch `ctx_41d443eb1de7` · `term_ddaf926f`. B = 워크트리 `lrt-b` · Dispatch `ctx_4616264251f2` · `term_b24799fd`. 브리프는 main 체크아웃 `.scratch/orch-language-request-todo/brief-{A,B}.md`.
- K(곁 배치) 시작 — 워크트리 `lkv-auto` · Dispatch `ctx_60eb88e004d9` · `term_2fcfec0f`. 스펙 커밋 `395d4373`. DESIGN은 §6.62·§6.615 행만 고친다(A는 §10.1) — 겹침 없음.

