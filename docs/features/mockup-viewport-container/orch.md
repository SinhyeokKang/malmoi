# mockup-viewport-container — 지휘 계획 (orch)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)(2026-10-11 `/feature-review` 반영 `c888d83c`). 시안 없음.
착수: 2026-10-11 · 시작 dev `35c14892` · 지휘자 Claude Code(Opus 5.5) → 워커 패밀리 Claude Code / Sonnet·Opus.
**다음 orch**: [disabled-reasons-revert](../disabled-reasons-revert/) — 이 orch가 dev 통합·QA까지 끝난 뒤 직렬로 잇는다(2026-10-11 사용자 "직렬로 이어서").

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | 두 orch를 **직렬**로 잇는다 — 이 orch(목업)가 dev 통합 + QA까지 끝난 뒤 disabled-reasons-revert orch를 연다. 지휘자는 코드를 쓰지 않는다 | 2026-10-11 사용자("목업만" → "번복. 직렬로 이어서 이 세션에서 모두 진행해" → "orch 두개를 이어 붙이라니까") |
| D2 | 배치 하나(**A**)가 tasks T1~T5를 든다 — T5(DESIGN §6.615·§5 · PRODUCT §4.1 정본)도 A가 문서별 커밋으로 쓴다 | 지휘자 판단 — 배치가 하나라 정본 절이 겹칠 상대가 없다 |
| D3 | `components/__tests__/landing-mockup.test.tsx`는 A가 **matchMedia 스텁 기본값(D)과 그릇 폭 단언만** 고친다 — `DisabledReasons` 대조(:722·:731)·`components/landing/mockup/translations.tsx`는 건드리지 않는다 | disabled-reasons-revert design §2.5가 rebase 뒤 그 몫을 든다 |
| D4 | T6 런타임은 단일 QA 워커가 **`/runtime-test`**로 돈다(main 체크아웃 · ego-browser + CDP 리사이즈) — 범위 = tasks T6 + A 인계의 런타임 검증 목록 + 레이아웃 QA(가로 스크롤·겹침·잘림). 결함은 BugShot으로 즉시(`[A]`·`[layout]` 태그), `gh issue create` 금지 | tasks T6 · orchestrate §5 · 메모리 ego-spaces-share-session |
| D5 | 가이드 컷·README 영향 없음 | 지휘자 판단 — SHOOTING 매핑에 랜딩 컷 없음 |
| D6 | 스키마·환경변수·사전 키 추가 없음 | spec 범위 |

## 배치

| 배치 | 항목 | 소유 파일 | 건드리지 말 것 | 모델·effort | 선행 | 상태 |
|---|---|---|---|---|---|---|
| **A** 뷰포트 그릇 | tasks T1~T5 (design §1~§5) | `lib/landing/stage.ts` · `lib/landing/__tests__/stage.test.ts` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` · `lib/shell/breakpoint.ts` · `lib/shell/__tests__/breakpoint.test.ts` · `components/landing/mockup/app-frame.tsx`(주석 :50만) · `components/__tests__/landing-mockup.test.tsx`(D3 범위만) · `docs/DESIGN.md`(§6.615·§5) · `docs/PRODUCT.md`(§4.1) | `components/landing/mockup/translations.tsx` · `publish.tsx` · 앱 컴포넌트 · `components/ui/*` · `messages/*` | Opus 5.5 high — 결정성·리사이즈 보존이 걸린 스크롤 수학 | 없음 | 착수 전 |
| **R** 리뷰 | A diff 독립 리뷰(리포트 전용) | — | 코드 수정 금지 | Opus 5.5 medium | A worker_done | — |
| **Q** QA | `/runtime-test` — tasks T6 + 인계 런타임 목록 + 레이아웃 QA | main 체크아웃(읽기) | 코드 수정 금지 | Opus 5.5 medium | A dev 통합 | — |

겹침: 배치 하나 — 없음.

## 검증 게이트

- 워커: TDD(T1 red → T2 green) · `pnpm gate --base dev`(파이프 금지) · `/ship bypass` 11단계(`/push`) 전 정지.
- 리뷰: 🔴 0까지 수정 라운드.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `&&` push → dev CI 결론.
- 런타임: Q가 `/runtime-test`로 tasks T6 수치 판정 · 결함은 BugShot 즉시 → A 워커가 워크트리에서 TDD 수정 → QA 뒤 통합 · 재실측.

## 진행 기록

- 2026-10-11 orch 작성.
- A `task_909f49a990c3`/`ctx_8146c05177d1`(worktree mvc-a, Opus 5.5 high) 착수 — Run `run_f379e5759e36`, 브리프 `.scratch/brief-mvc-A.md`.
- A `worker_done` — `9d86e4fe`(test red) · `97d518bc`(feat) · `b898f3dc`(docs DESIGN) · `cd6dff42`(docs PRODUCT), gate ok(13476). 계획과 다른 점 7(캡션 상한 = 폭 배율 그릇 폭 · stageTop 1px 문턱 · `Frame.canvasH` 추가 등). 런타임 목록에 **스크롤 앵커링 이중 보정 위험(V-03)**. A 터미널 retain(수정 라운드용). 독립 리뷰 R(Opus medium, 리포트 전용) 착수.
- R 리뷰: 🔴1 R1(보존 `u`를 현재 scrollTop으로 재 브라우저 스크롤 앵커링과 이중 보정 — 경계 안 폭 리사이즈에서 이번 변경이 들인 회귀) · 🟡 Y1(캡션 상한 = 폭만의 그릇 폭 — **지휘자 판단: 수용**, tasks T1 문구 정정·T6 시각 확인 추가) · Y2(ARCHITECTURE §6.358 "넷" 잔재 → A fix1 문서) · Y3(앵커링 항목은 jsdom으로). R 해제. A fix1 `task_3430e53ae06c`/`ctx_c32f36a917af` 착수(직전 칠한 scrollTop 기준 u + 앵커링 흉내 시나리오 + ARCHITECTURE·DIRECTORY 문서) — red 확인.
- A fix1 `aacfe391`(red) · `6403a2dc`(직전 칠한 scrollTop 기준 u) · `7b81b827`(ARCHITECTURE §6.358 다섯째) · `1ae180ec`(DIRECTORY), gate ok — 지휘자 diff 확인, 🔴 0. **dev 통합** `bc0fb64b..dbfd6b8a` · `pnpm gate` ok · push(origin/dev `22d9e427..dbfd6b8a`) · CI run 38142636455 감시. A 터미널 retain 유지(QA 결함 수정용).
- Q `ctx_dddb241e2038`(main 체크아웃, Opus medium) `/runtime-test` 착수 — 브리프 `.scratch/brief-mvc-Q.md`. QA 동안 main 체크아웃 cherry-pick·build 금지.
- dev CI(`dbfd6b8a`) success. #240 [layout] M 그릇 씬 ④ diff Value 열 잘림(표 `min-w-[520px]`, 목업은 스크롤 불가 — M이 <640 방문자의 유일한 그릇이 되며 드러남) → **지휘자 판단**: 실물 배치를 새로 만들지 않고 "실물에서 표를 오른쪽으로 스크롤한 상태"를 좁은 루트에서 정적으로 보인다. A `task_0eb74ecb4eb3`/`ctx_420de672fe79`(소유 확장 `mockup/publish.tsx`, Refs #240).
- Q `worker_done` — 항목 1·2·3·5·8·9 수치 PASS(8 폭 그릇 크기 · 프레임 ⊂ 스크롤러 · 경계/재감김 리사이즈 위치 보존·이중 보정 0 · 배율 표 9/9 · reduced f .8 단절 · 다크 동일 기하), 4는 #240 외 PASS, 6·7 기록. 못 잰 것: 1030 스크롤바(macOS 오버레이 — 대신 clientWidth 1012로 V-01 축 밟음) · 1280→1100 히어로 재감김(어느 언어에서도 안 일어남 — T·M 안 재감김으로 대신 잼). 참고: 812×375 T는 프레임 175px 폭(세로 배율 .223 — 수용한 대가). 낡은 주석 `lib/landing/stage.ts` `MIN_PINNED_SCALE` 근거(D 폭 배율) → #240 뒤 A에게. Q 해제 · `.next/dev` 정리.
- A #240 `e093d8e5`(red) · `31cc7564`(표 `w-full min-w-[520px] self-end` — 오른쪽 끝까지 스크롤한 상태, Key 열 일부 가림), gate ok — 지휘자 diff 확인. 이어서 `MIN_PINNED_SCALE` 주석 정정 Task.
- A `191eb5c5` 주석 정정, gate ok. 세 커밋 dev 통합.
- dev 통합 `a48ba4f3..aaf2faa0`(#240 · 주석) · `pnpm gate` ok · push(origin/dev `dbfd6b8a..aaf2faa0`) · CI run 38144387536. Q2 `ctx_10f9c4c7e81e` #240 재실측 — M 375×812·639×900에서 값 칸 전부 표 안(Geist 두 줄 감김), T·D 행 전체 · **#240 닫힘**. Q2·A 해제 · A 워크트리·브랜치 삭제(미커밋 0 · cherry `+` 0 확인).
