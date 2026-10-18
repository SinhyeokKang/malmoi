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

## 런 뒤 배포 (사용자 2026-10-18)

이 런(+ 곁 배치 K)을 마무리하면 같은 세션에서 `/merge`를 진행한다 — **patch bump**(사용자 지정). inbox-filter-search는 문서(스펙·리뷰 반영 `861953fd`)만 이 push에 함께 실리고 구현은 다음 릴리스다.

## 진행 기록

- 2026-10-18 Run `run_a8efa5c8272a`. A = 워크트리 `lrt-a` · Dispatch `ctx_41d443eb1de7` · `term_ddaf926f`. B = 워크트리 `lrt-b` · Dispatch `ctx_4616264251f2` · `term_b24799fd`. 브리프는 main 체크아웃 `.scratch/orch-language-request-todo/brief-{A,B}.md`.
- K(곁 배치) 시작 — 워크트리 `lkv-auto` · Dispatch `ctx_60eb88e004d9` · `term_2fcfec0f`. 스펙 커밋 `395d4373`. DESIGN은 §6.62·§6.615 행만 고친다(A는 §10.1) — 겹침 없음.
- K `worker_done` — 4c0d06ed · 816961f6 · 41eafdbb · 0d2ac987. 워커 게이트는 병렬 부하(load 17–170)로 test 단계 5s 타임아웃만 red(단언 실패 0, 실패 파일 단독 green). 지휘자 diff 확인 — `overshoot = 0`이면 로그인 출력 동일(`0 - overshoot`로 -0 회피). **K 통합(로컬, 미push)** `b859c058..524a2358` + 기능 폴더 삭제 `7f01aa3a`. main 게이트는 부하가 내려간 뒤 돌린다. K4 런타임 확인은 QA 브리프에 얹는다. K release + `lkv-auto` 삭제.
- A `worker_done` — 0b290236..0ac0461d(5 커밋), `gate: ok`(15958 + 격리 PG 894, 앞 두 번은 B와 겹친 부하로 5s 타임아웃). O2 호출부: `lib/keys/query.ts`·`lib/inbox/load.ts` `language: null`, Home `page.tsx` `localeHeld: false`·`languageChanges: 0` — 화면에는 C(T6) 전까지 아무것도 안 보인다. 계획과 다른 점 7(`HoldLater` 기본 줄은 문자열 prop · `holdSubline(hold, fallback)` · `countCards`는 수만 · slug 모르는 소스만이면 `null` 등). 인계 사본 `handoffs/handoff-A.md`. 리뷰 Dispatch `ctx_24ddf535f670`(Opus high).
- B `worker_done` — bd6681a1(`foldLocaleStates` 분리 + `readLocaleStatesByProject` + 격리 PG 등가 스위트), `gate: ok`(셋째 실행 — 앞 둘은 병렬 부하 타임아웃). 변이(`archivedAt` 제거) red 확인. 인계 사본 `handoffs/handoff-B.md`. 리뷰 Dispatch `ctx_d08e20d2573a`(Opus high).
- 리뷰 A: 🔴 0 · 🟡 3 · ⚪ 5(사본 `handoffs/review-A.md`). 계획과 다른 점 1–7 수용. Y1–Y3(O2 중립값 셋 — Home `languageChanges`는 이미 있는 `languageWork`, `localeHeld`는 `planLocaleImportGate(states)` 직접, 두 로더 모두 배선·테스트) · W1 낡은 주석 셋 → C 브리프. **지휘자 판단** W2(en `isn't published yet` vs Logs `still unsent`) — 사용자가 승인한 시안·design D2·D3 문자열 그대로 유지. W3(시안 프레임 4 노트의 `unsent` 목적지 오기)는 DS 브리프에 적는다.
- 리뷰 B: 🔴 0 · 🟡 2(사본 `handoffs/review-B.md`). Y1 일괄 값 수가 프로젝트 사이 ADD 코드를 섞는다 → B fix1(Dispatch `ctx_14a7f47f46f8`). Y2 호출 수는 ADD 유무로 2/3 → C 브리프.
- **A 통합(로컬, 미push)** `fda8ddfc..b371e8a8`. 게이트는 B fix1 통합 뒤 K·A·B를 한 번에 돈다.
- B fix1 `worker_done` — 626d1631(프로젝트별 ADD 표면×코드로 값 수를 좁힘, 시드 줄로 red 확인), `gate: ok`. **B 통합(로컬)** `d0c27b29..88de295d`. B release + `lrt-b` 삭제. main 게이트(K·A·B) 실행. C Dispatch `ctx_3b6dd8f93c4b`(A 터미널, 브리프 `brief-C.md`).
- main 게이트(K·A·B) `gate: ok`(15972 + 격리 PG 898). **push** `1191e41b..b269cbc8` — 중간 지점(A는 로더 미배선이라 화면 변화는 K뿐). CI run 39120572205 → success.
- C `worker_done` — 5b27bfee · 1d5363e8, `gate: ok`(15998 + 격리 PG 898). O2 넷 모두 배선, 되돌리면 red. 리뷰 C: 🔴 0 · 🟡 1 · ⚪ 5 — Y1 목록 로더 1 vs N 호출 수 테스트 없음 → C fix1(Dispatch `ctx_d066d4119b94`, 테스트만). **C 통합(로컬)** `b5485ab1..227a2c01`, main 게이트 실행 → green이면 DS 시작(C fix1은 테스트만이라 DS 뒤에 통합).
- main 게이트(C) `gate: ok`(15998 + 898). DS 시작 — Dispatch `ctx_9925b2e6b622` · `term_7ab6ac96`(main 체크아웃). C fix1 `worker_done` — a4f1837b(`it.each([1, 5])` 목록 로더 호출 수, 프로젝트별 읽기로 바꾸면 5 사례만 red) + ⚪1–3, `gate: ok`. DS 뒤 통합. A 터미널은 DS 결함 대비로 유지.

