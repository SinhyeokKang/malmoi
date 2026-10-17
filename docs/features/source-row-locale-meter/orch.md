# source-row-locale-meter — orch

> 지휘 계획. 항목 정의는 [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)가 정본이고 여기에 복제하지 않는다.
> 시안: [`Source Row Locale Meter.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Source+Row+Locale+Meter.dc.html)

- 착수: 2026-10-17 · 시작 dev `527ad10e`
- 범위: tasks T1–T10 전부(T0 완료)
- 끝: dev push까지. `/merge`는 부르지 않는다. 스키마 변경 없음 → prod `db:deploy` 없음.

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | 상세 Languages 진행률 칸 300 → 200 | 2026-10-17 사용자 (spec 결정 표) |
| D2 | **Codex Astra high 허용** — 패밀리 교차(Claude 지휘 → Codex 워커)와 Astra effort 상한(medium)의 이 런 한정 예외. 필요한 배치에 투입 | 2026-10-17 사용자 |
| D3 | A(데이터 층)는 Codex `gpt-6-astra` high | 지휘자 판단 — 순수 함수·조회가 테스트로 닫히는 범위이고, 토큰을 두 패밀리에 나눈다(D2) |
| D4 | B(화면)·DS·리뷰는 Claude Opus 5.5 high | 지휘자 판단 — 시안 정밀도·DOM 테스트·DesignSync는 Claude Code 쪽이 든다 |
| D5 | A → B 직렬 | 지휘자 판단 — 파일 겹침은 없지만 B가 A의 `LocaleMeterValue`·`loadSources().meters`를 소비한다. 타입을 미리 박아 병렬로 돌리면 인터페이스가 두 곳에서 정의된다 |
| D6 | DS 행을 둔다(기존 화면이지만 이 변경용으로 받은 시안이 있다) | 지휘자 판단 — 선례(search-ux-unify 2026-10-03, orchestrate §0 4.5) |
| D8 | 행 막대는 **작업 언어**(`localeRole === "work"` — orphaned와 제거 예정 REMOVE를 뺀다, ADD는 포함)만 그린다. 기존 `progress`도 지금처럼 작업 언어만 더한다 | 지휘자 판단 — 같은 행의 `N languages`(`loadSurfaceCounts`)가 작업 언어를 세고, `work-locale.ts`가 "진행률·Sources 수는 작업 언어 술어로 센다"를 정본으로 둔다. spec(2026-10-15)은 locale-add의 REMOVE 의도 이전 서술이었다. 상세 모달은 Removing 행을 상태와 함께 계속 보여 준다 (A 질문 msg_6d0651a8bada) |
| D7 | T9(정본 갱신)는 B 워커의 후속 Task, 기능 디렉터리 삭제는 지휘자가 마지막 리포트 직전에 | 지휘자 판단 — 정본 문서는 구현을 아는 워커가 쓰고, orch.md는 런이 끝날 때까지 필요하다 |

## 배치

| 배치 | tasks | 워커 · 모델 | 소유 파일 | 선행 | 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1–T5 | Codex `gpt-6-astra` high · 워크트리 | `lib/keys/view.ts` · `lib/sources/meters.ts`(새) · `lib/keys/query.ts`(`loadLocaleCounts`, `loadProjectListAggregates` 머리 주석) · `lib/sources/query.ts` · 그 테스트들(`lib/keys/__tests__/view.test.ts` · `lib/sources/__tests__/{state,meters,query}.test.ts` · `lib/keys/__tests__/sources-progress.integration.ts`) | — | `pnpm gate --base dev`(격리 postgres 포함) | 대기 |
| RA | A 리뷰 | Claude Opus high · 리포트 전용 | — | A | 🔴 0 | 대기 |
| B | T6–T7 | Claude Opus high · 워크트리 | `messages/{en,ko,es}.tsx` · `lib/i18n/__tests__/helpers/function-args.ts` · `components/locale-meter.tsx` · `components/sources/{sources-screen,languages-card}.tsx` · `app/(edit)/projects/[slug]/sources/loading.tsx` · 그 DOM 테스트 | A가 dev에 | `pnpm gate --base dev` | 대기 |
| RB | B 리뷰 | Claude Opus high · 리포트 전용 | — | B | 🔴 0 | 대기 |
| DS | T8 | Claude Opus high · main 체크아웃 · 리포트 + BugShot | — (불일치는 B가 고친다) | B 통합 뒤 · **push 전** | 실측 일치 · 지적 0 | 대기 |
| B2 | T9 | B 워커 후속 Task | `docs/DESIGN.md` · `docs/DIRECTORY.md` · (있으면) `docs/ARCHITECTURE.md` | DS 끝 | `pnpm gate` · `grep -rn "percent는 완료만" docs/` 0 | 대기 |
| G | T10 | 지휘자 `pnpm guide:check` → stale이면 Claude Opus 워커(main 체크아웃, `/guide`·`/guide-shots`) | `guide/**` · `public/guide/**` · `guide/SHOOTING.md` | DS 끝(ego 세션 공유 — 겹치지 않게) | `pnpm guide:check` 출력 인용 | 대기 |
| F1 | #288 (locale-add 후속 — 다른 세션이 2026-10-17 이 런으로 넘김) | Claude Opus high · 워크트리 `srlm-f` | `messages/{en,ko,es}.tsx`의 `cancelAddDone`만 · 사전/DOM 테스트 | — (A와 겹침 없음, B보다 먼저 통합) | `pnpm gate --base dev` | 진행 |
| F2 | #289 (같은 경로) | F 워커 후속 Task | `components/publish-button.tsx` · `lib/publish/plan.ts` · `messages/*` Publish 절 · DESIGN §6.646 | 사용자 결정 · B 통합 뒤(사전 겹침) | `pnpm gate --base dev` | 결정 대기 |
| QA | 인계 (b) 목록 | Claude Opus · main 체크아웃 · 단일 워커 | — | 전부 push 뒤 | (b) 목록 전부 확인 | 대기 |

- F1·F2는 tasks 밖 이슈다(#288·#289, 근거 `.scratch/followups/rt6-report.md`). B는 A와 F1이 dev에 들어간 뒤 띄운다(F1과 사전 파일 겹침).
- tasks ↔ 배치 대조: T0(완료) · T1–T5 → A · T6–T7 → B · T8 → DS · T9 → B2 · T10 → G. 주인 없는 항목 0.
- `project-row-redesign`은 미착수(T0 열림)라 `components/locale-meter.tsx` 겹침이 지금은 없다. 그쪽이 착수하면 design §6 조율을 따른다.

## 진행 기록

(배치별 push 해시 · 라운드 · 미완을 여기에 쌓는다)
