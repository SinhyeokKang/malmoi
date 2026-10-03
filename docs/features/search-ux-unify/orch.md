# search-ux-unify — 지휘 계획 (`/orchestrate`)

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) — 이 문서는 복제하지 않고 배치·소유권·상태만 든다.
시작 dev: `7097f65d` (2026-10-03). 끝은 dev push다 — `/merge`는 사용자가 부른다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| O1 | 스펙 결정 D1~D15·확인 필요 1~4는 spec "결정 기록"이 정본이다. 워커가 도중에 물을 결정은 남아 있지 않다 | `/feature-review` 2026-10-03 |
| O2 | **Safari 검증(T8 IME Esc · T10 포커스 복귀)은 미검증으로 남긴다.** QA는 Chromium(ego-browser)만 잰다. 리포트 "미완·미검증" 맨 앞에 적고 `/merge` 전 사용자가 preview에서 확인한다 | 사용자 2026-10-03 |
| O3 | B2는 T10을 B1과 **병렬**로 먼저 하고, B1이 dev에 들어간 뒤 rebase해 T8·T9를 한다 | 파일 겹침(아래) — T10은 `dialog.tsx`만 건드리고 B1은 `dialog.tsx`를 건드리지 않는다 |
| O4 | T11·T12(정본 문서·가이드)는 **B3 워커**가 B1·B2 통합 뒤에 한다 | 지휘자는 코드를 고치지 않고, T12가 `content.test.ts`를 고친다 |
| O5 | T14의 `/code-review`는 **배치별 독립 리뷰 워커**(R-B1·R-B2·R-B3)로 갈음한다. 전 배치 통합 뒤 `/ux-audit`(일곱 차원)을 리포트 전용 워커로 돈다 | 같은 diff를 두 번 리뷰하지 않는다 |
| O6 | 스키마 변경 없음 — 워커에게 마이그레이션을 허용하지 않는다 | design "스키마 변경: 없음" |
| O8 | 키 검색 하한 판정은 서버·클라이언트 모두 **UTF-16 length 유지**(이모지 1개 = 길이 2 → 검색한다). tasks T3 엣지 "서로게이트 쌍 1글자 → 요청 없음"은 틀린 문장이었다 — 요지는 "서버와 같은 판정" | 지휘자 2026-10-03 (B1 질문) — 서버 의미 변경은 범위 밖 |
| O7 | 워커 모델: Claude Code 지휘 → Opus 5.5·Sonnet 5.5, effort ≤ high. 패밀리 교차 없음 | `/orchestrate` 0단계 |

## 배치

| 배치 | 태스크 | 워커 · 모델/effort (이유) | 배치 위치 | 선행 | 출시 차단 | 상태 |
|---|---|---|---|---|---|---|
| **B1** 검색 UX | T1~T7 | Opus 5.5 high — 커밋 경계 green 재배치·클라이언트 그래프·뷰모델 판단이 많다 | 새 워크트리 `suu-b1` (base dev) | — | 예 | ✅ dev 통합 `39b9f038..a5fb98c8`(10커밋 = T1~T7 + fix1 3) · 라운드 1 |
| **B2** 오버레이 술어 | T10 → (B1 dev 진입 대기) → T8·T9 | Opus 5.5 high — 포커스·IME는 POSTMORTEM 09-20·09-24 영역 | 새 워크트리 `suu-b2` (base dev) | T8·T9는 B1 | 예 | 구현 완료 `58b2d9da`·`05f7c369`·`40bf8e3e` · gate ok · 리뷰 중 |
| **B3** 정본 문서 | T11·T12 | Opus 5.5 medium — 문서 정합이 넓지만 판단은 spec이 이미 했다 | 새 워크트리 `suu-b3` (base dev) | B1·B2 | 예 | 진행 중(B2 리뷰와 병렬 — B2 서술은 브랜치 기준, 끝에 `WAITING FOR B2`) |
| **R-B1·R-B2·R-B3** 리뷰 | 배치 diff 독립 리뷰 | Opus 5.5 high — 리포트 전용 | 해당 배치 워크트리 | 각 배치 완료 | — | 대기 |
| **QA** | T13 | Opus 5.5 medium — `/runtime-test`, ego-browser | main 체크아웃(dev) | B1·B2·B3 dev | 예 | 대기 |
| **UX** | T14 `/ux-audit` | Opus 5.5 medium — 리포트 전용 | main 체크아웃 | QA 인계 뒤 | 🔴만 | 대기 |
| 지휘자 | T14 gate · T15 정리 | — | main 체크아웃 | 전부 | — | — |

## 파일 겹침 → 순서

| 파일 | B1 | B2 | B3 |
|---|---|---|---|
| `messages/en.tsx` | ✔ | (조건부 — IME 문구 없음) | |
| `lib/keyboard.ts` | 생성(T1) | 소비(T8·T9) | |
| `components/ui/command.tsx` | ✔(T4·T5) | ✔(T8 조합 추적) | |
| `components/search/search-dialog.tsx` | ✔(T3) | ✔(T8·T9) | |
| `components/shell/project-switcher.tsx` | ✔(T4·T6·T7) | ✔(T8·T9) | |
| `components/ui/dialog.tsx` | ✗ (건드리지 않는다) | ✔(T8·T10) | |
| `large-modal`·`popover`·`dropdown-menu`·`use-ime-guard` | | ✔ | |
| 일반 클릭 5곳·IME 나머지(`search-input`·`invite-modal`·`draft.ts`) | | ✔ | |
| `components/__tests__/client-graph.test.ts` | ✔(T1·T3) | ✔(T8 `use-ime-guard` 등재 시) | |
| `docs/*`·`guide/*`·`README.md`·`lib/guide/__tests__/content.test.ts` | | | ✔ |

- B1 ∥ B2(T10만). B2는 T10 커밋 뒤 `WAITING FOR B1`으로 멈추고, 지휘자가 B1 통합을 알리면 `git rebase dev` 후 T8·T9.
- B3는 B1·B2가 dev에 들어간 뒤 띄운다.
- B1이 `dialog.tsx`를 고쳐야 하면 멈추고 지휘자에게 묻는다(O3이 깨진다).

## 검증 게이트

- 워커: 커밋 경계마다 `pnpm typecheck && pnpm test` green(C29), 배치 끝 `pnpm gate --base dev`(파이프로 거르지 않는다).
- 지휘자 통합: cherry-pick → `pnpm gate` 끝줄 `gate: ok` → `git push`(dev).
- 런타임: 각 인계 문서의 "(b) 런타임 검증 목록"을 모아 QA가 돈다. Safari는 O2.

## 진행 기록

| 시각 | 사건 |
|---|---|
| 2026-10-03 | orch.md 작성, dev `7097f65d` 기준. Run `run_4e8a93de8a7d` |
| 2026-10-03 | B1 시작(`suu-b1`, Opus high) · B2 시작(`suu-b2`, Opus high) |
| 2026-10-03 | B2 T10 완료 `d20e0e88` → `WAITING FOR B1` |
| 2026-10-03 | R-B2a(T10 리뷰): 🔴0 🟡1 — design·tasks의 `closeAutoFocus(event)` 시그니처가 실제 `(event, consumer?)`와 다름 → **B3 T11에서 DESIGN 기술 시 반영**. ⚪: 기존 "포커스가 이미 안에 있음" 가드에 테스트 없음 → B2 T8 때 테스트 한 줄 추가 지시 |
| 2026-10-03 | B1 worker_done — 7커밋 `ba9cb045..755944d0`, `gate: ok`(10600 tests · projects postgres 34 files · build). 계획과 다른 점 12건(인계 문서) → R-B1 리뷰 시작 |
| 2026-10-03 | R-B1: 🔴1(지우기 X에서 Enter가 결과로 이동) 🟡5(시나리오가 뷰모델 미단언 · `/docs` 개요 제외 미고정 · Kbd 스캐너 구멍 · 상태 줄 live region `empty:hidden` · `PREVIEW_LIMIT` 무효) ⚪7. 인계 다른 점 12건 전부 수용 → B1 fix1 발송(같은 터미널). ⚪6(질의 모드 개요 문서 결과)은 **B3 T11에서 문서화** |
| 2026-10-03 | B1 fix1 완료(`18be5d59`·`0015832d`·`b82ed2b5`, gate ok) — 지휘자가 R1 diff 확인. dev cherry-pick `39b9f038..a5fb98c8` → `pnpm gate` `gate: ok`(10609 · postgres 542 · build) → push. B2에 rebase 신호 |
| 2026-10-03 | B2 worker_done — T10 `58b2d9da`(가드 테스트 amend) · T8 `05f7c369` · T9 `40bf8e3e`, gate ok. R-B2 리뷰 시작. **B3를 B2 리뷰와 병렬로 앞당겨 시작**(문서만 건드려 코드 겹침 없음, O4 변경) |
| 2026-10-03 | R-B2: 🔴0 🟡2(조합 중 닫힘 뒤 재오픈 Esc 막힘 — T8 회귀 · IME 검출기가 단독 `isComposing`을 놓침) ⚪6. 인계 다른 점 7건 수용(7은 부분). B2 fix1 발송(🟡1·2 · ⚪1 주석 · ⚪5·6 런타임 목록). ⚪2·3·4는 소비자 0·의도적 우회라 넘김 |
