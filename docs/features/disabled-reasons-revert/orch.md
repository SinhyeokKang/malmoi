# disabled-reasons-revert — 지휘 계획 (orch)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md). 시안 없음.
착수: 2026-10-11 · 지휘자 Claude Code(Opus 5.5) → 워커 패밀리 Claude Code / Sonnet·Opus.
**앞 orch**: [mockup-viewport-container](../mockup-viewport-container/orch.md) — dev 통합·QA 뒤 직렬로 잇는다(2026-10-11 사용자 "직렬로 이어서"). spec의 선행 조건(목업이 dev에 먼저)은 그 통합으로 충족됐다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | 배치 하나(**B**)가 tasks T1~T5를 든다 — T3(목업 정합성)도 바로 한다(목업 orch가 dev에 들어가 선행 충족). T5 정본 문서(DESIGN §7·§6.4·§5.15·§6.5·§6.615 · DIRECTORY · CLAUDE.md 프리미티브 개수 + `pnpm sync:agents`)도 B가 문서별 커밋으로 | 지휘자 판단 — 겹칠 다른 배치가 없다 |
| D2 | `/feature-review`를 다시 돌지 않는다 | 지휘자 판단 — 되돌림 대상이 git 대조(`69844b74^`·`def752f0`·`bc8b204f^`)로 확정됐고 범위는 사용자 확정 문장(spec "확정")이 정한다 |
| D3 | T6 런타임은 단일 QA 워커가 **`/runtime-test`**로(main 체크아웃 · ego-browser). 결함은 BugShot 즉시(`[B]`·`[layout]`), `gh issue create` 금지 | orchestrate §5 · 목업 orch D4와 같다 |
| D4 | T7 가이드 컷은 `pnpm guide:check` stale 결과대로 — QA가 끝난 뒤 **같은 main 체크아웃에서 `/guide-shots` 워커 하나**(ego 세션 공유 때문에 QA와 동시에 돌리지 않는다). stale 0이면 생략 | 지휘자 판단 — 워크트리엔 `.env.local`이 없어 촬영 서버가 안 뜬다 · ego-spaces-share-session |
| D5 | 스키마·환경변수·사전 키 추가 없음 | spec 비목표 |

## 배치

| 배치 | 항목 | 소유 파일 | 건드리지 말 것 | 모델·effort | 선행 | 상태 |
|---|---|---|---|---|---|---|
| **B** 사유 줄 되돌림 | tasks T1~T5 (design §2·§2.5·§3·§5) | design §2 표의 파일들(`publish-button.tsx` · `home/sync-button.tsx` · `translations/workspace/workspace.tsx` · `home/actions.tsx` · `translations/edit-loss-banner.tsx` · `ui/disabled-reasons.tsx`(삭제) · `shell/content-panel.tsx`(주석)) · `landing/mockup/translations.tsx` · 관련 테스트(`a11y-reasons` · `home-actions` · `translation-workspace-*` · `disabled-reasons`(삭제) · `landing-mockup`) · 정본 문서(D1) | spec 비목표의 responsive 이전 사유 전부(OAuth 동의 · Add sources 행 · Revert 푸터 · CI 카드 · 멤버 · 계정 · 소스 · 환경설정 · MCP 토큰 폼 · Logs 필터 · 마법사 바닥) · `components/account/*`·`members/*`·`settings/*` · `lib/landing/*`·`components/landing/stage.tsx` · `messages/*` | Opus 5.5 medium — 표가 정한 되돌림이지만 a11y(`aria-describedby`·sr-only)와 malmoi#160 함정이 있다 | 목업 orch dev 통합 ✅ | 착수 전 |
| **R** 리뷰 | B diff 독립 리뷰(리포트 전용) | — | 코드 수정 금지 | Opus 5.5 medium | B worker_done | — |
| **Q** QA | `/runtime-test` — tasks T6 + 인계 런타임 목록 | main 체크아웃(읽기) | 코드 수정 금지 | Opus 5.5 medium | B dev 통합 | — |
| **G** 가이드 컷 | tasks T7 `/guide-shots`(stale 결과대로) | `public/guide/*` · `guide/SHOOTING.md` | 코드 | Opus 5.5 medium | Q 끝 | — |

겹침: 배치 하나 — 없음.

## 검증 게이트

- 워커: TDD(T1 red → T2 green) · `pnpm gate --base dev`(파이프 금지) · `/ship bypass` 11단계 전 정지.
- 리뷰: 🔴 0까지 수정 라운드.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `&&` push → dev CI 결론.
- 런타임: Q `/runtime-test`(T6 — 미전달 0·EDITOR·끊김·보관·진행 중·잠금에서 머리 사유 줄 0 · 꺼진 버튼 hover `title` · 375/768/1280) → G `/guide-shots`.

## 진행 기록

- 2026-10-11 orch 작성(목업 orch 진행 중 — #240 재실측 대기).
- 2026-10-11 앞 orch(mockup-viewport-container) 완료 — dev `22d9e427..aaf2faa0` · CI success · #240 닫힘 · 기능 디렉터리 삭제(결론은 DESIGN §6.615·§5 · PRODUCT §4.1 · ARCHITECTURE §6.358). B `ctx_2116379d152a`(worktree drr-b, Opus 5.5 medium) 착수.
- B `worker_done` — 커밋 7(4393f242 test · db22532d refactor · 91eeb037 목업 · b9d3918c DESIGN · 360b2cde DIRECTORY · 2846fa98 ARCHITECTURE · 8786d4af CLAUDE 52), gate ok. 미완: 가이드 원고 세 언어 stale(publish.md · revert.md — '사유 줄' 문장) → 수정 라운드에 `/guide`. guide:check stale 6컷. B retain · 독립 리뷰 R2 착수.
- R2 리뷰: 🔴0 · 🟡4(page.tsx F7 주석 · panel-header 테스트 주석 · R-01 Publish 진행 중 jsdom 누락 · describedby 한 번 toBe). 가이드 stale 확정 = publish.md:22 · sync/revert.md:26 × en/ko/es(edit.md 아님). R2 해제. B fix1 `ctx_0c945b3487af`(🟡4 + `/guide` 6줄) 착수.
- B fix1 `2e1a9c46`(주석 Y1·Y2) · `4fc15a07`(Y3 Publish 진행 중 — 처음부터 green, mutation으로 검증 · Y4 describedby 한 개) · `6461e848`(가이드 6줄 en/ko/es), gate ok. dev 통합.
