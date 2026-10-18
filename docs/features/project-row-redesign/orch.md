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
| D9 | G(T12)는 이월 stale 2컷(`inbox-open`·`inbox-page`)과 그 시점 `pnpm guide:check`의 stale 전부를 찍는다 | 지휘자 판단 — `/merge` 전 stale 0 원칙(인수 브리프 · 메모리 guide-shots-before-merge) |

## 배치

| 배치 | tasks | 워커 · 모델 | 소유 파일 | 선행 | 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1–T4 | Codex `gpt-6-astra` high · 워크트리 | `lib/projects/list.ts`(추가만) · `lib/inbox/plan.ts` · (필요하면) `lib/home/attention.ts`·`lib/inbox/load.ts` · `lib/keys/query.ts`(추가만) · 그 테스트(`lib/projects/__tests__/list.test.ts` · `lib/inbox/__tests__/*` · `lib/keys/__tests__/list-rows.test.ts` · `source-remove-consumers.integration.ts` · `list-aggregates.integration.ts`) | — | `pnpm gate --base dev`(격리 postgres 포함) | 대기 |
| RA | A 리뷰 | Claude Opus high · 리포트 전용 | — | A | 🔴 0 | 대기 |
| B | T5–T8 | Claude Opus high · 워크트리 | `messages/{en,ko,es}.tsx` · `components/projects/project-list.tsx` · `app/(edit)/projects/(list)/{page,loading}.tsx` · `components/inbox/*` · `lib/home/attention-view.ts` · `lib/inbox/{plan,load}.ts` · 옛 함수 삭제(`lib/projects/list.ts` · `lib/keys/query.ts` `meters`) · 주석(`lib/shell/switcher.ts` · `components/locale-meter.tsx`) · tasks T5–T8이 이름 댄 테스트 전부 | A가 dev에 | `pnpm gate --base dev` | 대기 |
| RB | B 리뷰 | Claude Opus high · 리포트 전용 | — | B | 🔴 0 | 대기 |
| DS | T9 | Claude Opus high · main 체크아웃 · 리포트 + BugShot | — (불일치는 B가 고친다) | B 통합 뒤 · **push 전** | 프레임 실측 일치 · 지적 0 | 대기 |
| B2 | T11(디렉터리 삭제 제외) | B 워커 후속 Task | `docs/DESIGN.md` · `docs/ARCHITECTURE.md` · `docs/PRODUCT.md` · `docs/DIRECTORY.md` | DS 끝 | `pnpm gate` · T11 `rg`(features 디렉터리 제외) 0 | 대기 |
| QA | T10 + 인계 (b) 목록 + T7 골격 높이 수동 | Claude Opus high · main 체크아웃 · 단일 워커 · BugShot | — | B·B2 push 뒤 | (b) 전부 확인 | 대기 |
| G | T12 | Claude Opus high · main 체크아웃(`/guide` + `/guide-shots`) | `guide/**` · `public/guide/**` · `guide/SHOOTING.md` | QA 끝(ego 세션 공유) | `pnpm test` · `pnpm guide:check` stale 0 | 대기 |

- tasks ↔ 배치 대조: T0(완료) · T1–T4 → A · T5–T8 → B · T9 → DS · T10 → QA · T11 → B2(+ 지휘자 마무리 D7) · T12 → G. 주인 없는 항목 0.
- 겹침: A와 B는 `lib/projects/list.ts`·`lib/keys/query.ts`·`lib/inbox/plan.ts`를 함께 고친다 → 직렬(D4). DS·QA·G는 ego 세션을 공유하므로 서로 겹치지 않는다.
- 이월(이 런 몫 아님): ko 사용자 검수 · prod 확인 목록(`.scratch/orch-source-row-locale-meter/qa-p-plan.md`) · `.scratch/followups/handoff-malmoi-8e-to-d4.md`.

## 진행 기록

(배치별 push 해시 · 라운드 · 미완을 여기에 쌓는다)
