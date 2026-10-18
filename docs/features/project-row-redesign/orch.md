# project-row-redesign — orch

> 지휘 계획. 항목 정의는 [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) · [design-brief](./design-brief.md)가 정본이고 여기에 복제하지 않는다.
> 시안: [`Project Row Redesign.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Project+Row+Redesign.dc.html) (프레임 1–14)

- 착수: 2026-10-18 · 시작 dev `298d1804` (이전 지휘자 `source-row-locale-meter` 런에서 인수 — `.scratch/prr-orchestrate/brief.md`)
- 범위: tasks T1–T12 전부(T0 완료)
- 끝: dev push까지. `/merge`는 부르지 않는다. 스키마 변경 없음 → prod `db:deploy` 없음.

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | **Codex Astra high 허용** — 패밀리 교차(Claude 지휘 → Codex 워커)와 Astra effort 상한(medium)의 이 런 한정 예외 | 2026-10-18 사용자(인수 브리프) |
| D2 | A(T1–T4, 순수 함수·로더)는 Codex `gpt-6-astra` high | 지휘자 판단 — 테스트로 닫히는 범위이고 토큰을 두 패밀리에 나눈다(D1, 선례 srlm D3) |
| D3 | B(T5–T8 화면·사전·Inbox)·리뷰·DS·QA·G는 Claude Opus 5.5 high | 지휘자 판단 — 시안 정밀도·DOM 테스트·DesignSync·ego는 Claude Code 쪽이 든다 |
| D4 | A → B 직렬, T8(Inbox)은 B가 T5–T7과 한 Dispatch로 한다 | 지휘자 판단 — B가 A의 `planProjectRow`·`projectTodos`·행 필드를 소비하고, T5·T8이 같은 `messages/{en,ko,es}.tsx`를 고친다 |
| D5 | A는 `projectTodos`가 `needs_reconnect`를 내게 하고(단위 테스트로 고정) `planInbox`를 `projectTodos` 위로 옮기되, **Inbox가 `needs_reconnect` 항목을 내는 것은 T8(B)에서 켠다** | 지휘자 판단 — tasks "커밋 경계마다 gate green"·"T1–T4는 더하기만". 렌더(`row-slots`)·사전·목적지(`attentionHref`)가 T8 몫이라 A 경계에서 Inbox 화면 동작이 바뀌지 않아야 한다 |
| D6 | DS 행을 둔다(기존 화면이지만 이 변경용 시안이 있다) | 지휘자 판단 — orchestrate §0 4.5, 선례 search-ux-unify·srlm D6 |
| D7 | T11(정본)은 B 워커의 후속 Task. 기능 디렉터리 삭제와 T11 끝의 `rg` 0건 확인은 지휘자가 마지막 리포트 직전에 | 지휘자 판단 — 정본은 구현을 아는 워커가 쓰고, orch.md는 런이 끝날 때까지 필요하다(srlm D7) |
| D8 | A는 리뷰(RA) 뒤 단독 push한다 | 지휘자 판단 — 더하기만이라 화면 변화가 없고(D5), CI 신호를 B 전에 받는다 |
| D10 | A의 임시 타입 경계: `ProjectRowPlan.banner = RowBanner \| never_filled`, 새 메타는 `ProjectListRow`와의 교차 반환형으로 싣는다 — `RowBanner`·`ProjectListRow` 승격과 컴포넌트 픽스처 넷 갱신은 B(T6). A의 커밋은 green 경계 둘(T1–T3 / T4)이 `/ship`의 red 테스트 커밋보다 우선한다 | 지휘자 판단 — "T1–T4는 더하기만"과 "경계마다 gate green"을 함께 지키는 유일한 형 (A 질문 msg_95a78a28fd8a) |
| D11 | 행과 Inbox의 DB 할 일은 둘 다 `projectTodos` 하나에서 나온다. 목록 경로의 `review`는 시각 재료가 없으므로 `at: null`을 허용하는 `ProjectTodo` 갈래를 둔다(기존 `AttentionItem` 타입과 분리). 시각을 꾸미지 않고 새 왕복을 만들지 않는다 — 같은 쿼리의 select에 더할 수 있는 재료(`Project.createdAt` 등)는 더한다. Inbox 경로는 실제 시각을 넘기므로 출력·정렬이 그대로다 | 지휘자 판단 — spec 완료 조건 6("순수 함수 하나가 내고 행 띠와 Inbox가 둘 다 쓴다")을 문자 그대로 지키는 쪽(A 질문 msg_e1c1e319e94e) |
| D12 | B가 `guide/ko/setup/sources.md:9` 굵은 라벨 하나를 실제 Sources 칩 낱말(`아직 동기화되지 않음`)로 고친다 — 지운 `meter.note.waiting`에만 있던 값이라 가이드 게이트가 red가 된다 | 지휘자 판단 — 커밋 경계 green 우선, 원고가 원래 틀렸다(B 질문 msg_1a7df93460bf) |
| D13 | T11의 `rg` 0건을 예외 없이 지킨다 — `list.test.ts` 이관 주석에서 옛 이름을 걷고, `projects-screen.test.ts`의 옛 함수 이름 부정 단언은 지우거나 이름 없는 꼴로 바꾼다(export가 사라져 typecheck가 이미 막는다) | 지휘자 판단 — RB 🟢2 추천 |
| D14 | #297: 메타 칸은 통째로 다음 줄로 가고, 칸 하나가 이름 칸보다 넓을 때만 그 칸 안에서 낱말 사이로 감긴다 — 말줄임·넘침 없음, 가운뎃점은 앞 칸에 붙은 채 | 지휘자 판단 — PRODUCT §4.1 "감기고 숨지 않는다"를 지키는 유일한 형이고, 시안은 이 경우를 그리지 않았다(DS 지적) |
| D15 | #298: 좁은 그릇 골격의 메타 막대는 메타 상자 하나 안에서 줄 사이 gap 없이 쌓이고, 막대 수는 #297 수정 뒤 325에서 가장 흔한 메타 줄 수다(en 실측으로는 셋이 흔하다) | 지휘자 판단 — srlm D16과 같은 원칙(실제 그릇 · 가장 흔한 모양) |
| D16 | #299: 좁은 그릇(`@max-form`)에서만 메타 줄을 이름 칸 밖으로 빼 행 전체 폭(이름 칸 왼쪽 끝 ~ 행 끝, 칩 묶음 아래)에 둔다. 넓은 그릇은 그대로. D14 칸 규칙 유지, 골격도 따라간다 | 2026-10-18 사용자(추천안 선택) — es 긴 칩에서 이름 칸이 57px까지 줄어 메타 8줄·낱말 넘침이 났다 |
| D9 | G(T12)는 이월 stale 2컷(`inbox-open`·`inbox-page`)과 그 시점 `pnpm guide:check`의 stale 전부를 찍는다 | 지휘자 판단 — `/merge` 전 stale 0 원칙(인수 브리프 · 메모리 guide-shots-before-merge) |

## 배치

| 배치 | tasks | 워커 · 모델 | 소유 파일 | 선행 | 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1–T4 | Codex `gpt-6-astra` high · 워크트리 `prr-a` | `lib/projects/list.ts`(추가만) · `lib/inbox/plan.ts` · (필요하면) `lib/home/attention.ts`·`lib/inbox/load.ts` · `lib/keys/query.ts`(추가만) · 그 테스트(`lib/projects/__tests__/list.test.ts` · `lib/inbox/__tests__/*` · `lib/keys/__tests__/list-rows.test.ts` · `source-remove-consumers.integration.ts` · `list-aggregates.integration.ts`) | — | `pnpm gate --base dev`(격리 postgres 포함) | 완료 `598934f3`·`02913db2` |
| RA | A 리뷰 | Claude Opus high · 리포트 전용 | — | A | 🔴 0 | APPROVE 🔴0·🟡1·🟢5 → B로 이월 |
| B | T5–T8 | Claude Opus high · 워크트리 `prr-b` | `messages/{en,ko,es}.tsx` · `components/projects/project-list.tsx` · `app/(edit)/projects/(list)/{page,loading}.tsx` · `components/inbox/*` · `lib/home/attention-view.ts` · `lib/inbox/{plan,load}.ts` · 옛 함수 삭제(`lib/projects/list.ts` · `lib/keys/query.ts` `meters`) · 주석(`lib/shell/switcher.ts` · `components/locale-meter.tsx`) · tasks T5–T8이 이름 댄 테스트 전부 | A가 dev에 | `pnpm gate --base dev` | 완료 `95160239`·`3d858b73`·`cf07a722` |
| RB | B 리뷰 | Claude Opus high · 리포트 전용 | — | B | 🔴 0 | APPROVE 🔴0·🟡1·🟢6 → B fix1 |
| DS | T9 | Claude Opus high · main 체크아웃 · 리포트 + BugShot | — (불일치는 B가 고친다) | B 통합 뒤 · **push 전** | 프레임 실측 일치 · 지적 0 | 완료 — #297·#298·#299 닫힘(재측정 2회) |
| B2 | T11(디렉터리 삭제 제외) | B 워커 후속 Task | `docs/DESIGN.md` · `docs/ARCHITECTURE.md` · `docs/PRODUCT.md` · `docs/DIRECTORY.md` | DS 끝 | `pnpm gate` · T11 `rg`(features 디렉터리 제외) 0 | 완료 — D16 문구는 fix4가 덧붙인다 |
| QA | T10 + 인계 (b) 목록 + T7 골격 높이 수동 | Claude Opus high · main 체크아웃 · 단일 워커 · BugShot | — | B·B2 push 뒤 | (b) 전부 확인 | 대기 |
| G | T12 | Claude Opus high · main 체크아웃(`/guide` + `/guide-shots`) | `guide/**` · `public/guide/**` · `guide/SHOOTING.md` | QA 끝(ego 세션 공유) | `pnpm test` · `pnpm guide:check` stale 0 | 대기 |

- tasks ↔ 배치 대조: T0(완료) · T1–T4 → A · T5–T8 → B · T9 → DS · T10 → QA · T11 → B2(+ 지휘자 마무리 D7) · T12 → G. 주인 없는 항목 0.
- 겹침: A와 B는 `lib/projects/list.ts`·`lib/keys/query.ts`·`lib/inbox/plan.ts`를 함께 고친다 → 직렬(D4). DS·QA·G는 ego 세션을 공유하므로 서로 겹치지 않는다.
- 이월(이 런 몫 아님): ko 사용자 검수 · prod 확인 목록(`.scratch/orch-source-row-locale-meter/qa-p-plan.md`) · `.scratch/followups/handoff-malmoi-8e-to-d4.md`.

## 진행 기록

(배치별 push 해시 · 라운드 · 미완을 여기에 쌓는다)

- A: `598934f3`(T1–T3)·`02913db2`(T4), 두 경계 모두 `gate: ok`(단위 15,815 · 격리 PG 894). 조회 횟수 6회 유지. 질문 셋 → D10·D11 + 픽스처·client-graph 허용 목록 승인. `projectTodos`는 `lib/inbox/project-todos.ts`. 런타임 (b) 없음. 인계 사본 `.scratch/prr-orchestrate/handoffs/handoff-A.md`.
- RA: APPROVE(`.scratch/prr-orchestrate/review-A.md`). 🟡1(`query.ts` 검토 수가 `foldCells` 손 사본)·🟢1–3(표 테스트 상태 도달 단언 · `lastSync`의 `"unrecorded"` 갈래 · 행 todos 전량 직렬화)은 B의 T6에 싣는다 — 지휘자 판단: B가 같은 파일에서 `rowLocaleProgress`·`meters`를 지우는 자리라 한 번에 정리된다. A 워커는 해제.
- A 통합 `dcd12519`·`9f173902` → main `gate: ok` → push `9f173902`(CI 39091366099). `prr-a` 워크트리 삭제. B 착수(`prr-b`, base `9f173902`). CI 39091366099 success.
- B: `95160239`(T5)·`3d858b73`(T6+T7, RA 이월 포함)·`cf07a722`(T8), 최종 `gate: ok`(단위 15,843 · 격리 PG 894). 계획과 다른 점 10(주요: 행은 `row.plan`만 싣는다 · `<time aria-label>` = `synced <절대 시각>` · `attentionHref(slug, item, reconnect)` + `reconnectDestination(role)`). 런타임 (b) 4. 인계 사본 `handoffs/handoff-B.md`.
- RB: APPROVE(`review-B.md`). 🟡1(골격 칩·chevron 간격 16 vs 실물 12) · 🟢1·2·4·6 → B fix1. 🟢5(`locale-meter.tsx:7` 머리 §6.63) → B2. 🟢3(실물 메타 한 줄 행 ≈87.17, 시안 88) → DS가 잰다.
- B fix1 `3e411fe1`, `gate: ok`(단위 15,846 · 격리 PG 894). 옛 이름 `rg` 0.
- B 통합 `1a2d0296`..`c6a5a8e7` → main `gate: ok`. push는 DS 뒤.
- DS(`ds-report.md`): 프레임 1–14 일치, 불일치 #297·#298. 받아들인 이탈 — 행 높이 87.16(타입 스케일 행간, 시안 88) · `<time aria-label>` = `synced <절대 시각>`(T11에서 design·DESIGN을 이 형으로). 못 잰 것: c `pr_open`(열린 PR 없음) · GitLab d·하위 그룹 · GitLab 만료 재연결 시각. dev DB 임시 쓰기 전부 복구(diff 0).
- B fix2 `bd8b4c21`(#297, D14 — 325 넘침 0, 대신 es `Pendiente de configurar` 행은 메타 9줄 225.8) · fix3 `0efb75fe`(#298, D15 — 좁은 골격 막대 셋, 325 en 16행 중 13행이 세 줄 · 골격 121.81 = 실물 121.81).
- DS 재측정: #298 닫힘(값 댓글) · #297 칸 상자 넘침 0이나 es 긴 낱말(`sincronizado`)이 57px 이름 칸 밖으로 +21.2 → #299 → D16 → B fix4.
- B fix4 `ec072fd3`(#299, D16 — 좁은 그릇에서 행이 grid, 메타 폭 253) + DESIGN `37ee9bdd` · 지휘자 PRODUCT §4.1 문구 `086c3dc8`. DS 재측정 2: 375 en·es 넘침 0 · 두 줄 행 104.48(en 15/20, es 17/20) · 골격 = 실물(375 104.48, 768·1280 87.16) · 접근 이름에 메타 한 번 → #297·#299 닫힘. 메모: 좁은 grid에서 썸네일·칩은 이름+리포 두 줄에 가운데 정렬(행 중심보다 9.67/18.34 위) — D16 의도.
- B2(T11) `e32ae193`(DESIGN)·`05da0c4e`(ARCHITECTURE)·`882b62c6`(PRODUCT)·`59f84a72`(DIRECTORY)·`264a7295`(locale-meter 주석) — T11 `rg` 0. 바꾸지 않은 것: ARCHITECTURE §6.36의 기존 `highlightName` 서술(이 기능 밖 stale), §10.1 새 행의 금지어 칸 비움, README 행 사실 없음.
